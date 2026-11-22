import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { mediaSelect } from '../media/media.select';
import type { IMedia } from '../media/media.types';
import type { IAuthorsRepository } from './authors.repository.interfaces';
import type {
  CreateAuthorData,
  DeleteAuthorOptions,
  FindAuthorsFilters,
  UpdateAuthorData,
} from './authors.repository.types';
import { photoUrlOf } from './authors.select';
import { PostStatus, PostType } from '../../shared/types/enums';
import type { IAuthor, IAuthorPublic, IAuthorWithPostCount, IColumnistCard } from './authors.types';

// The photo is loaded as a media row and leaves as photoUrl.
function toPublic<T extends IAuthor & { photo: IMedia | null }>(row: T): Omit<T, 'photo'> & IAuthorPublic {
  const { photo, ...author } = row;
  return { ...author, photoUrl: photoUrlOf(photo) };
}

// The seed's byline for unsigned newsroom pieces (prisma/seed.ts).
const NEWSROOM_SLUG = 'redacao';

export class AuthorsRepository implements IAuthorsRepository {
  private readonly publicSelect = {
    id: true,
    name: true,
    slug: true,
    photoId: true,
    photo: { select: mediaSelect },
    bio: true,
    columnTitle: true,
    type: true,
    userId: true,
    active: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  private buildWhere(filters: FindAuthorsFilters) {
    return {
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.active !== undefined ? { active: filters.active } : {}),
    };
  }

  async findMany(filters: FindAuthorsFilters): Promise<IAuthorPublic[]> {
    try {
      const rows = await prisma.author.findMany({
        where: this.buildWhere(filters),
        select: this.publicSelect,
        orderBy: { name: 'asc' },
      });
      return rows.map(toPublic);
    } catch (err) {
      logger.error('Failed to list authors', err);
      throw err;
    }
  }

  async findManyWithPostCount(filters: FindAuthorsFilters): Promise<IAuthorWithPostCount[]> {
    try {
      const rows = await prisma.author.findMany({
        where: this.buildWhere(filters),
        select: { ...this.publicSelect, _count: { select: { posts: true } } },
        orderBy: { name: 'asc' },
      });
      return rows.map(toPublic);
    } catch (err) {
      logger.error('Failed to list authors with post count', err);
      throw err;
    }
  }

  // The columnists tab: every author, with the count of published columns
  // and the newest one.
  async findColumnistCards(): Promise<IColumnistCard[]> {
    const published = { type: PostType.COLUMN, status: PostStatus.PUBLISHED } as const;
    try {
      const rows = await prisma.author.findMany({
        // Every active byline: writer and columnist are the same person for
        // the reader (the type only says whether there is a login). Except the
        // newsroom's own "Redação" byline from the seed, which is not a person.
        where: { active: true, slug: { not: NEWSROOM_SLUG } },
        select: {
          ...this.publicSelect,
          _count: { select: { posts: { where: published } } },
          posts: {
            where: published,
            select: { title: true, slug: true, publishedAt: true },
            orderBy: { publishedAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { name: 'asc' },
      });
      return rows.map(({ _count, posts, ...row }) => ({
        ...toPublic(row),
        columnCount: _count.posts,
        latestColumn: posts[0] ?? null,
      }));
    } catch (err) {
      logger.error('Failed to list columnist cards', err);
      throw err;
    }
  }

  async findById(id: string): Promise<IAuthorPublic | null> {
    try {
      const row = await prisma.author.findUnique({ where: { id }, select: this.publicSelect });
      return row ? toPublic(row) : null;
    } catch (err) {
      logger.error('Failed to find author by id', err);
      throw err;
    }
  }

  async findBySlug(slug: string): Promise<IAuthorPublic | null> {
    try {
      const row = await prisma.author.findUnique({ where: { slug }, select: this.publicSelect });
      return row ? toPublic(row) : null;
    } catch (err) {
      logger.error('Failed to find author by slug', err);
      throw err;
    }
  }

  async findByUserId(userId: string): Promise<IAuthorPublic | null> {
    try {
      const row = await prisma.author.findUnique({ where: { userId }, select: this.publicSelect });
      return row ? toPublic(row) : null;
    } catch (err) {
      logger.error('Failed to find author by user id', err);
      throw err;
    }
  }

  async create(data: CreateAuthorData): Promise<IAuthorPublic> {
    try {
      const row = await prisma.author.create({
        data: {
          name: data.name,
          slug: data.slug,
          type: data.type,
          bio: data.bio ?? null,
          photoId: data.photoId ?? null,
          columnTitle: data.columnTitle ?? null,
        },
        select: this.publicSelect,
      });
      return toPublic(row);
    } catch (err) {
      logger.error('Failed to create author', err);
      throw err;
    }
  }

  async update(id: string, data: UpdateAuthorData): Promise<IAuthorPublic> {
    try {
      const row = await prisma.author.update({ where: { id }, data, select: this.publicSelect });
      return toPublic(row);
    } catch (err) {
      logger.error('Failed to update author', err);
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await prisma.author.delete({ where: { id } });
    } catch (err) {
      logger.error('Failed to delete author', err);
      throw err;
    }
  }

  // One transaction: the posts are moved or deleted, the columnist login is
  // demoted and the byline goes, or nothing changes at all.
  async deleteWithPosts(id: string, options: DeleteAuthorOptions): Promise<void> {
    try {
      await prisma.$transaction(async (tx) => {
        if (options.transferTo) {
          await tx.post.updateMany({ where: { authorId: id }, data: { authorId: options.transferTo } });
        } else if (options.deletePosts) {
          // Comments and the post's file links go with it (onDelete: Cascade).
          await tx.post.deleteMany({ where: { authorId: id } });
        }
        if (options.demoteUserId) {
          await tx.user.update({ where: { id: options.demoteUserId }, data: { role: 'reader' } });
        }
        await tx.author.delete({ where: { id } });
      });
    } catch (err) {
      logger.error('Failed to delete author with posts', err);
      throw err;
    }
  }

  async countPosts(authorId: string): Promise<number> {
    try {
      return await prisma.post.count({ where: { authorId } });
    } catch (err) {
      logger.error('Failed to count author posts', err);
      throw err;
    }
  }
}

export const authorsRepository = new AuthorsRepository();
