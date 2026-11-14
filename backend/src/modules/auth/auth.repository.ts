import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import type { IAuthRepository } from './auth.repository.interfaces';
import type { IAuthCredentialsRow, IAuthSessionRow, IResetTokenRow } from './auth.types';

export class AuthRepository implements IAuthRepository {
  private readonly sessionSelect = {
    id: true,
    name: true,
    role: true,
    active: true,
    author: { select: { id: true } },
  } as const;

  async findSessionUser(id: string): Promise<IAuthSessionRow | null> {
    try {
      return await prisma.user.findUnique({ where: { id }, select: this.sessionSelect });
    } catch (err) {
      logger.error('Failed to load session user', err);
      throw err;
    }
  }

  async findByEmailWithCredentials(email: string): Promise<IAuthCredentialsRow | null> {
    try {
      return await prisma.user.findUnique({
        where: { email },
        select: { ...this.sessionSelect, email: true, passwordHash: true },
      });
    } catch (err) {
      logger.error('Failed to load user by email', err);
      throw err;
    }
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    try {
      await prisma.user.update({ where: { id }, data: { passwordHash } });
    } catch (err) {
      logger.error('Failed to update password hash', err);
      throw err;
    }
  }

  // Changing a password logs the account out everywhere. Raw SQL because the
  // session table belongs to express-session — Prisma only declares it so that
  // `migrate dev` does not report drift.
  async deleteSessionsOfUser(userId: string): Promise<void> {
    try {
      await prisma.$executeRaw`DELETE FROM "session" WHERE sess->>'userId' = ${userId}`;
    } catch (err) {
      logger.error('Failed to delete sessions of user', err);
      throw err;
    }
  }

  // ── password recovery ───────────────────────────────────────────────────

  async countResetTokensSince(userId: string, since: Date): Promise<number> {
    try {
      return await prisma.passwordResetToken.count({ where: { userId, createdAt: { gte: since } } });
    } catch (err) {
      logger.error('Failed to count reset tokens', err);
      throw err;
    }
  }

  async createResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    try {
      await prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } });
    } catch (err) {
      logger.error('Failed to create reset token', err);
      throw err;
    }
  }

  async findResetToken(tokenHash: string): Promise<IResetTokenRow | null> {
    try {
      return await prisma.passwordResetToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          expiresAt: true,
          usedAt: true,
          user: { select: { id: true, name: true, email: true, active: true } },
        },
      });
    } catch (err) {
      logger.error('Failed to find reset token', err);
      throw err;
    }
  }

  // One transaction: the new password, this link spent, every other link of
  // the account thrown away. A half-done reset would leave a usable link.
  async resetPassword(tokenId: string, userId: string, passwordHash: string): Promise<void> {
    try {
      await prisma.$transaction([
        prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
        prisma.passwordResetToken.update({ where: { id: tokenId }, data: { usedAt: new Date() } }),
        prisma.passwordResetToken.deleteMany({ where: { userId, id: { not: tokenId } } }),
      ]);
    } catch (err) {
      logger.error('Failed to reset password', err);
      throw err;
    }
  }
}

export const authRepository = new AuthRepository();

