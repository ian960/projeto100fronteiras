import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import type { IAuthRepository } from './auth.repository.interfaces';
import type { IAuthCredentialsRow, IAuthSessionRow } from './auth.types';

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
}

export const authRepository = new AuthRepository();
