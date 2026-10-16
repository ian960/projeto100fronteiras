import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { mediaSelect } from '../media/media.select';
import type { IMedia } from '../media/media.types';
import type { IAuthorsRepository } from './authors.repository.interfaces';
import type { CreateAuthorData, FindAuthorsFilters, UpdateAuthorData } from './authors.repository.types';
import { photoUrlOf } from './authors.select';
import type { IAuthor, IAuthorPublic, IAuthorWithPostCount } from './authors.types';

// The photo is loaded as a media row and leaves as photoUrl.
function toPublic<T extends IAuthor & { photo: IMedia | null }>(row: T): Omit<T, 'photo'> & IAuthorPublic {
  const { photo, ...author } = row;
  return { ...author, photoUrl: photoUrlOf(photo) };
}

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
