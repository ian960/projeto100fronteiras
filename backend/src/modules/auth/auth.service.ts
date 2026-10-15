import argon2 from 'argon2';
import { Conflict, Unauthenticated, ValidationError } from '../../shared/errors/AppError';
import { Role } from '../../shared/types/enums';
import { usersRepository } from '../users/users.repository';
import { authRepository } from './auth.repository';
import type { SessionUser } from './auth.types';
import type { ChangePasswordInput, LoginInput, RegisterInput } from './auth.service.types';

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
