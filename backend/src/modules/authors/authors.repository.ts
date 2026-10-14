import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import type { IAuthorsRepository } from './authors.repository.interfaces';
import type { CreateAuthorData, FindAuthorsFilters, UpdateAuthorData } from './authors.repository.types';
import type { IAuthor, IAuthorPublic, IAuthorWithPostCount } from './authors.types';

export class AuthorsRepository implements IAuthorsRepository {
  private readonly publicSelect = {
    id: true,
    name: true,
    slug: true,
    photoUrl: true,
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
      return await prisma.author.findMany({
        where: this.buildWhere(filters),
        select: this.publicSelect,
        orderBy: { name: 'asc' },
      });
    } catch (err) {
      logger.error('Failed to list authors', err);
      throw err;
    }
  }

  async findManyWithPostCount(filters: FindAuthorsFilters): Promise<IAuthorWithPostCount[]> {
    try {
      return await prisma.author.findMany({
        where: this.buildWhere(filters),
        select: { ...this.publicSelect, _count: { select: { posts: true } } },
        orderBy: { name: 'asc' },
      });
    } catch (err) {
      logger.error('Failed to list authors with post count', err);
      throw err;
    }
  }

  async findById(id: string): Promise<IAuthorPublic | null> {
    try {
      return await prisma.author.findUnique({ where: { id }, select: this.publicSelect });
    } catch (err) {
      logger.error('Failed to find author by id', err);
      throw err;
    }
  }

  async findBySlug(slug: string): Promise<IAuthor | null> {
    try {
      return await prisma.author.findUnique({ where: { slug }, select: this.publicSelect });
    } catch (err) {
      logger.error('Failed to find author by slug', err);
      throw err;
    }
  }

  async findByUserId(userId: string): Promise<IAuthorPublic | null> {
    try {
      return await prisma.author.findUnique({ where: { userId }, select: this.publicSelect });
    } catch (err) {
      logger.error('Failed to find author by user id', err);
      throw err;
    }
  }

  async create(data: CreateAuthorData): Promise<IAuthorPublic> {
    try {
      return await prisma.author.create({
        data: {
          name: data.name,
          slug: data.slug,
          type: data.type,
          bio: data.bio ?? null,
          photoUrl: data.photoUrl ?? null,
          columnTitle: data.columnTitle ?? null,
        },
        select: this.publicSelect,
      });
    } catch (err) {
      logger.error('Failed to create author', err);
      throw err;
    }
  }

  async update(id: string, data: UpdateAuthorData): Promise<IAuthorPublic> {
    try {
      return await prisma.author.update({ where: { id }, data, select: this.publicSelect });
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
