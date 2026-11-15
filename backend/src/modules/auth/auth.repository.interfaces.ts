import type { IAuthCredentialsRow, IAuthSessionRow, IResetTokenRow } from './auth.types';

export interface IAuthRepository {
  findSessionUser(id: string): Promise<IAuthSessionRow | null>;
  findByEmailWithCredentials(email: string): Promise<IAuthCredentialsRow | null>;
  findByGoogleId(googleId: string): Promise<IAuthCredentialsRow | null>;
  linkGoogle(userId: string, googleId: string): Promise<void>;
  updatePasswordHash(id: string, passwordHash: string): Promise<void>;
  deleteSessionsOfUser(userId: string): Promise<void>;
  countResetTokensSince(userId: string, since: Date): Promise<number>;
  createResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  findResetToken(tokenHash: string): Promise<IResetTokenRow | null>;
  resetPassword(tokenId: string, userId: string, passwordHash: string): Promise<void>;
}
