import type { IAuthCredentialsRow, IAuthSessionRow } from './auth.types';

export interface IAuthRepository {
  findSessionUser(id: string): Promise<IAuthSessionRow | null>;
  findByEmailWithCredentials(email: string): Promise<IAuthCredentialsRow | null>;
  updatePasswordHash(id: string, passwordHash: string): Promise<void>;
  deleteSessionsOfUser(userId: string): Promise<void>;
}
