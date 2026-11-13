import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { buildPaginated, toSkipTake } from '../../shared/utils/pagination';
import type { Paginated, PaginationParams } from '../../shared/types/pagination';
import { authorSummarySelect, photoUrlOf, toAuthorSummary } from '../authors/authors.select';
import { mediaSelect } from '../media/media.select';
import type { IMedia } from '../media/media.types';
import type { IUsersRepository, PromoteToColumnistData } from './users.repository.interfaces';
import type {
  CreateUserData,
  FindUsersFilters,
  UpdateProfileData,
  UpdateUserData,
} from './users.repository.types';
import type { IUserCredentials, IUserMe, IUserPublic, IUserWithAuthor } from './users.types';

export class UsersRepository implements IUsersRepository {
  // Note what is missing: passwordHash. Only the two credential methods below
  // select it, and they are the only callers allowed to see it.
  private readonly publicSelect = {
    id: true,
    name: true,
    email: true,
    role: true,
    active: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  private readonly withAuthor = { ...this.publicSelect, author: { select: authorSummarySelect } };

  // The account's own profile, for its owner only.
  private readonly meSelect = {
    ...this.withAuthor,
    bio: true,
    avatarId: true,
    avatar: { select: mediaSelect },
  } as const;

  private toMe<T extends { author: Parameters<typeof toAuthorSummary>[0] | null; avatar: IMedia | null }>(
    row: T,
  ) {
    const { avatar, ...rest } = row;
    return { ...this.toWithAuthor(rest), avatarUrl: photoUrlOf(avatar) };
  }

  // The byline comes with its photo as a media row and leaves with photoUrl.
  private toWithAuthor<T extends { author: Parameters<typeof toAuthorSummary>[0] | null }>(
    row: T,
  ): Omit<T, 'author'> & Pick<IUserWithAuthor, 'author'> {
    return { ...row, author: row.author ? toAuthorSummary(row.author) : null };
  }

  async findMany(
    filters: FindUsersFilters,
    pagination: PaginationParams,
  ): Promise<Paginated<IUserWithAuthor>> {
    try {
      // Filtering happens in the WHERE clause, never in memory after the fact.
      const where: Prisma.UserWhereInput = {
        ...(filters.role ? { role: filters.role } : {}),
        ...(filters.search
          ? {
              OR: [
                { name: { contains: filters.search, mode: 'insensitive' } },
                { email: { contains: filters.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };

      const [rows, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: this.withAuthor,
          orderBy: { createdAt: 'desc' },
          ...toSkipTake(pagination),
        }),
        prisma.user.count({ where }),
      ]);

      return buildPaginated(rows.map((row) => this.toWithAuthor(row)), total, pagination);
    } catch (err) {
      logger.error('Failed to list users', err);
      throw err;
    }
  }

  async findById(id: string): Promise<IUserPublic | null> {
    try {
      return await prisma.user.findUnique({ where: { id }, select: this.publicSelect });
    } catch (err) {
      logger.error('Failed to find user by id', err);
      throw err;
    }
  }

  async findByIdWithAuthor(id: string): Promise<IUserWithAuthor | null> {
    try {
      const row = await prisma.user.findUnique({ where: { id }, select: this.withAuthor });
      return row ? this.toWithAuthor(row) : null;
    } catch (err) {
      logger.error('Failed to find user with author', err);
      throw err;
    }
  }

  async findMe(id: string): Promise<IUserMe | null> {
    try {
      const row = await prisma.user.findUnique({ where: { id }, select: this.meSelect });
      return row ? this.toMe(row) : null;
    } catch (err) {
      logger.error('Failed to load own account', err);
      throw err;
    }
  }

  async updateProfile(id: string, data: UpdateProfileData): Promise<IUserMe> {
    try {
      const row = await prisma.user.update({ where: { id }, data, select: this.meSelect });
      return this.toMe(row);
    } catch (err) {
      logger.error('Failed to update own account', err);
      throw err;
    }
  }

  async findByEmail(email: string): Promise<IUserPublic | null> {
    try {
      return await prisma.user.findUnique({ where: { email }, select: this.publicSelect });
    } catch (err) {
      logger.error('Failed to find user by email', err);
      throw err;
    }
  }

  async findByIdWithCredentials(id: string): Promise<IUserCredentials | null> {
    try {
      return await prisma.user.findUnique({
        where: { id },
        select: { id: true, email: true, passwordHash: true, role: true, active: true },
      });
    } catch (err) {
      logger.error('Failed to find user credentials', err);
      throw err;
    }
  }

  async create(data: CreateUserData): Promise<IUserPublic> {
    try {
      return await prisma.user.create({ data, select: this.publicSelect });
    } catch (err) {
      logger.error('Failed to create user', err);
      throw err;
    }
  }

  async update(id: string, data: UpdateUserData): Promise<IUserPublic> {
    try {
      return await prisma.user.update({ where: { id }, data, select: this.publicSelect });
    } catch (err) {
      logger.error('Failed to update user', err);
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

  async countActiveAdmins(): Promise<number> {
    try {
      return await prisma.user.count({ where: { role: 'admin', active: true } });
    } catch (err) {
      logger.error('Failed to count admins', err);
      throw err;
    }
  }

  // Posts this account wrote or published. They point at the account, so while
  // any exists the row cannot be deleted, only anonymized.
  async countPostsOf(id: string): Promise<number> {
    try {
      return await prisma.post.count({ where: { OR: [{ createdById: id }, { publishedById: id }] } });
    } catch (err) {
      logger.error('Failed to count posts of user', err);
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      // The byline, if any, stays online without a login (onDelete: SetNull).
      await prisma.user.delete({ where: { id } });
    } catch (err) {
      logger.error('Failed to delete user', err);
      throw err;
    }
  }

  // Everything that identifies the person goes; the row stays only because
  // published posts and their files still point at it. The byline is let go,
  // like on a real delete: the columns stay online under the author's name.
  async anonymize(id: string, passwordHash: string): Promise<void> {
    try {
      await prisma.$transaction([
        prisma.author.updateMany({ where: { userId: id }, data: { userId: null } }),
        prisma.user.update({
          where: { id },
          data: {
            name: 'Conta excluída',
            // Unique and never deliverable (.invalid is reserved, RFC 2606).
            email: `excluida-${id}@contas.invalid`,
            passwordHash,
            bio: null,
            avatarId: null,
            role: 'reader',
            active: false,
          },
        }),
      ]);
    } catch (err) {
      logger.error('Failed to anonymize user', err);
      throw err;
    }
  }

  // One transaction, two writes.
  //
  // Split into two steps, a failure on the second would leave a user whose
  // role says "columnist" but who has no author row — they would log into the
  // panel and be unable to write anything, with no byline to sign.
  async promoteToColumnist(data: PromoteToColumnistData): Promise<IUserWithAuthor> {
    try {
      return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.user.update({
          where: { id: data.userId },
          data: { role: 'columnist' },
        });

        await tx.author.create({
          data: {
            userId: data.userId,
            name: data.name,
            slug: data.slug,
            bio: data.bio ?? null,
            photoId: data.photoId ?? null,
            columnTitle: data.columnTitle ?? null,
            type: data.type,
          },
        });

        const row = await tx.user.findUniqueOrThrow({
          where: { id: data.userId },
          select: this.withAuthor,
        });

        return this.toWithAuthor(row);
      });
    } catch (err) {
      logger.error('Failed to promote user to columnist', err);
      throw err;
    }
  }
}

export const usersRepository = new UsersRepository();
