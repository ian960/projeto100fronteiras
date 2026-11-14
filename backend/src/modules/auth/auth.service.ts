import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { env } from '../../config/env';
import { escapeHtml, layout, sendMail } from '../../shared/mail/mailer';
import { Conflict, Unauthenticated, ValidationError } from '../../shared/errors/AppError';
import { Role } from '../../shared/types/enums';
import { usersRepository } from '../users/users.repository';
import { authRepository } from './auth.repository';
import type { SessionUser } from './auth.types';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from './auth.service.types';

// Password recovery: a link by e-mail, valid for one hour, used once.
const RESET_TTL_MS = 60 * 60 * 1000;
// Links per account per hour. Beyond that the request is quietly ignored, so
// nobody can use the portal to flood someone's inbox.
const RESETS_PER_HOUR = 3;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export class AuthService {
  // Every sign-up lands on `reader`. Only an admin promotes from there, which
  // is how a columnist joins: they register themselves and pick their own
  // password, so nobody ever sends a password over WhatsApp.
  async register(input: RegisterInput): Promise<SessionUser> {
    const existing = await usersRepository.findByEmail(input.email);

    if (existing) {
      throw new Conflict('This email is already registered.');
    }

    const user = await usersRepository.create({
      name: input.name,
      email: input.email,
      passwordHash: await argon2.hash(input.password),
      role: Role.READER,
    });

    return { id: user.id, name: user.name, role: user.role, authorId: null };
  }

  async login(input: LoginInput): Promise<SessionUser> {
    const user = await authRepository.findByEmailWithCredentials(input.email);

    // Same message whether the email does not exist or the password is wrong.
    // Distinguishing them turns the login form into an account enumerator.
    const invalid = new Unauthenticated('Invalid email or password.');

    if (!user) {
      // Hash a throwaway value so a missing account does not answer noticeably
      // faster than a wrong password.
      await argon2.hash(input.password);
      throw invalid;
    }

    const matches = await argon2.verify(user.passwordHash, input.password);

    if (!matches) throw invalid;
    if (!user.active) throw new Unauthenticated('This account is disabled.');

    return {
      id: user.id,
      name: user.name,
      role: user.role,
      authorId: user.author?.id ?? null,
    };
  }

  // For actions that must be confirmed with the password (deleting the account).
  async confirmPassword(userId: string, password: string): Promise<void> {
    const user = await usersRepository.findByIdWithCredentials(userId);
    if (!user) throw new Unauthenticated();

    if (!(await argon2.verify(user.passwordHash, password))) {
      throw new ValidationError('Current password is incorrect.', { password: 'Incorrect password.' });
    }
  }

  // "Esqueci minha senha". Answers the same way whether or not the address has
  // an account (the controller always says "if it exists, we sent a link"),
  // so the form cannot be used to find out who is registered.
  async forgotPassword(input: ForgotPasswordInput): Promise<void> {
    const user = await authRepository.findByEmailWithCredentials(input.email);
    if (!user || !user.active) return;

    const since = new Date(Date.now() - RESET_TTL_MS);
    if ((await authRepository.countResetTokensSince(user.id, since)) >= RESETS_PER_HOUR) return;

    // 32 random bytes: the link is the secret. Only its hash is stored.
    const token = randomBytes(32).toString('base64url');
    await authRepository.createResetToken(user.id, sha256(token), new Date(Date.now() + RESET_TTL_MS));

    const link = `${env.SITE_URL}/redefinir-senha?token=${token}`;
    const name = escapeHtml(user.name);

    // Not awaited: waiting for the mail service would make an existing address
    // answer noticeably slower than an unknown one.
    void sendMail({
      to: { email: user.email, name: user.name },
      subject: 'Redefina sua senha',
      text: `Olá, ${user.name}.\n\nRecebemos um pedido para redefinir a senha da sua conta no Portal100Fronteiras.\n\nPara escolher uma senha nova, abra este link (vale por 1 hora e só pode ser usado uma vez):\n${link}\n\nSe não foi você, ignore este e-mail: sua senha continua a mesma.`,
      html: layout(
        'Redefina sua senha',
        `<p>Olá, ${name}.</p>
<p>Recebemos um pedido para redefinir a senha da sua conta.</p>
<p style="margin:24px 0"><a href="${link}" style="background:#1e3270;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Escolher uma senha nova</a></p>
<p style="font-size:14px;color:#586377">O link vale por 1 hora e só pode ser usado uma vez. Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>`,
      ),
    });
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const row = await authRepository.findResetToken(sha256(input.token));

    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now() || !row.user.active) {
      throw new ValidationError('This link is invalid or has expired.', {
        token: 'Ask for a new link.',
      });
    }

    await authRepository.resetPassword(row.id, row.user.id, await argon2.hash(input.newPassword));

    // Whoever was logged in with the old password is out, everywhere.
    await authRepository.deleteSessionsOfUser(row.user.id);

    void sendMail({
      to: { email: row.user.email, name: row.user.name },
      subject: 'Sua senha foi alterada',
      text: `Olá, ${row.user.name}.\n\nA senha da sua conta no Portal100Fronteiras acabou de ser alterada.\n\nSe não foi você, peça um novo link em "Esqueci minha senha" e avise o administrador do portal.`,
      html: layout(
        'Sua senha foi alterada',
        `<p>Olá, ${escapeHtml(row.user.name)}.</p>
<p>A senha da sua conta acabou de ser alterada.</p>
<p style="font-size:14px;color:#586377">Se não foi você, peça um novo link em "Esqueci minha senha" e avise o administrador do portal.</p>`,
      ),
    });
  }

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await usersRepository.findByIdWithCredentials(userId);

    if (!user) {
      throw new Unauthenticated();
    }

    const matches = await argon2.verify(user.passwordHash, input.currentPassword);

    if (!matches) {
      throw new ValidationError('Current password is incorrect.', {
        currentPassword: 'Incorrect password.',
      });
    }

    if (input.currentPassword === input.newPassword) {
      throw new ValidationError('The new password must be different.', {
        newPassword: 'Choose a different password.',
      });
    }

    await authRepository.updatePasswordHash(userId, await argon2.hash(input.newPassword));

    // Log out every other device. The current session is refreshed by the
    // controller right after this call.
    await authRepository.deleteSessionsOfUser(userId);
  }
}

export const authService = new AuthService();
