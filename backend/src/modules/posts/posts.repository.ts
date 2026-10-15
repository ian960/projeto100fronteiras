import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { buildPaginated, toSkipTake } from '../../shared/utils/pagination';
import type { Paginated, PaginationParams } from '../../shared/types/pagination';
import type { IPostsRepository } from './posts.repository.interfaces';
import type {
  CreatePostData,
  FindForPanelFilters,
  FindPublishedFilters,
  UpdatePostData,
} from './posts.repository.types';
import type { IPost, IPostDetail, IPostListItem, IPostWithAudit } from './posts.types';

export class PostsRepository implements IPostsRepository {
  private readonly categorySummary = { id: true, name: true, slug: true } as const;

  private readonly authorSummary = {
    id: true,
    name: true,
    slug: true,
    photoUrl: true,
    columnTitle: true,
  } as const;

  // No `content` here: this is what listings return.
  private readonly listSelect = {
    id: true,
    type: true,
    status: true,
    title: true,
    subtitle: true,
    slug: true,
    excerpt: true,
    coverUrl: true,
    coverAlt: true,
    featured: true,
    videoUrl: true,
    videoProvider: true,
    publishedAt: true,
    createdAt: true,
    updatedAt: true,
    category: { select: this.categorySummary },
    author: { select: this.authorSummary },
  } as const;

  private readonly detailInclude = {
    category: { select: this.categorySummary },
    author: { select: this.authorSummary },
  } as const;

  private readonly userSummary = {
    id: true,
    name: true,
    email: true,
    role: true,
    active: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  private publishedWhere(filters: FindPublishedFilters): Prisma.PostWhereInput {
    // `status: published` is hard-coded, not a parameter. A public endpoint
    // cannot be talked into returning drafts.
    return {
      status: 'published',
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.categorySlug ? { category: { slug: filters.categorySlug } } : {}),
      ...(filters.authorSlug ? { author: { slug: filters.authorSlug } } : {}),
      ...(filters.search
        ? { title: { contains: filters.search, mode: 'insensitive' } }
        : {}),
    };
  }

  async findPublished(
    filters: FindPublishedFilters,
    pagination: PaginationParams,
  ): Promise<Paginated<IPostListItem>> {
    try {
      const where = this.publishedWhere(filters);

      // Filtering and paging happen in SQL. Loading everything and slicing in
      // JavaScript would put the whole archive in memory to render 12 cards.
      const [items, total] = await Promise.all([
        prisma.post.findMany({
          where,
          select: this.listSelect,
          orderBy: { publishedAt: 'desc' },
          ...toSkipTake(pagination),
        }),
        prisma.post.count({ where }),
      ]);

      return buildPaginated(items, total, pagination);
    } catch (err) {
      logger.error('Failed to list published posts', err);
      throw err;
    }
  }

  async findPublishedBySlug(slug: string): Promise<IPostDetail | null> {
    try {
      return await prisma.post.findFirst({
        where: { slug, status: 'published' },
        include: this.detailInclude,
      });
    } catch (err) {
      logger.error('Failed to find published post by slug', err);
      throw err;
    }
  }

  async findFeatured(): Promise<IPostListItem | null> {
    try {
      return await prisma.post.findFirst({
        where: { featured: true, status: 'published' },
        select: this.listSelect,
      });
    } catch (err) {
      logger.error('Failed to find featured post', err);
      throw err;
    }
  }

  async findLatest(type: FindPublishedFilters['type'], limit: number): Promise<IPostListItem[]> {
    try {
      return await prisma.post.findMany({
        where: { status: 'published', ...(type ? { type } : {}) },
        select: this.listSelect,
        orderBy: { publishedAt: 'desc' },
        take: limit,
      });
    } catch (err) {
      logger.error('Failed to find latest posts', err);
      throw err;
    }
  }

  async findPublishedByIds(ids: string[]): Promise<IPostListItem[]> {
    try {
      return await prisma.post.findMany({
        where: { id: { in: ids }, status: 'published' },
        select: this.listSelect,
        orderBy: { publishedAt: 'desc' },
      });
    } catch (err) {
      logger.error('Failed to find posts by ids', err);
      throw err;
    }
  }

  async findForPanel(
    filters: FindForPanelFilters,
    pagination: PaginationParams,
  ): Promise<Paginated<IPostListItem>> {
    try {
      // authorId comes from the session for a columnist, never from the query
      // string. See postsService.listForPanel.
      const where: Prisma.PostWhereInput = {
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
        ...(filters.authorId ? { authorId: filters.authorId } : {}),
        ...(filters.search
          ? { title: { contains: filters.search, mode: 'insensitive' } }
          : {}),
      };

      const [items, total] = await Promise.all([
        prisma.post.findMany({
          where,
          select: this.listSelect,
          orderBy: { updatedAt: 'desc' },
          ...toSkipTake(pagination),
        }),
        prisma.post.count({ where }),
      ]);

      return buildPaginated(items, total, pagination);
    } catch (err) {
      logger.error('Failed to list posts for panel', err);
      throw err;
    }
  }

  async findByIdWithAudit(id: string): Promise<IPostWithAudit | null> {
    try {
      return await prisma.post.findUnique({
        where: { id },
        include: {
          ...this.detailInclude,
          createdBy: { select: this.userSummary },
          publishedBy: { select: this.userSummary },
        },
      });
    } catch (err) {
      logger.error('Failed to find post with audit', err);
      throw err;
    }
  }

  async findById(id: string): Promise<IPost | null> {
    try {
      return await prisma.post.findUnique({ where: { id } });
    } catch (err) {
      logger.error('Failed to find post by id', err);
      throw err;
    }
  }

  async findBySlug(slug: string): Promise<IPost | null> {
    try {
      return await prisma.post.findUnique({ where: { slug } });
    } catch (err) {
      logger.error('Failed to find post by slug', err);
      throw err;
    }
  }

  async create(data: CreatePostData): Promise<IPostDetail> {
    try {
      return await prisma.post.create({
        data: {
          type: data.type,
          status: data.status,
          title: data.title,
          slug: data.slug,
          subtitle: data.subtitle ?? null,
          excerpt: data.excerpt ?? '',
          content: data.content ?? '',
          coverUrl: data.coverUrl ?? null,
          coverAlt: data.coverAlt ?? null,
          videoUrl: data.videoUrl ?? null,
          videoProvider: data.videoProvider ?? null,
          categoryId: data.categoryId ?? null,
          authorId: data.authorId,
          createdById: data.createdById,
        },
        include: this.detailInclude,
      });
    } catch (err) {
      logger.error('Failed to create post', err);
      throw err;
    }
  }

  async update(id: string, data: UpdatePostData): Promise<IPostDetail> {
    try {
      return await prisma.post.update({
        where: { id },
        data,
        include: this.detailInclude,
      });
    } catch (err) {
      logger.error('Failed to update post', err);
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await prisma.post.delete({ where: { id } });
    } catch (err) {
      logger.error('Failed to delete post', err);
      throw err;
    }
  }

  // A partial unique index in the database guarantees at most one featured
  // row, which means this cannot be a single UPDATE: the old flag has to be
  // cleared and the new one set inside one transaction, in that order. Do it
  // the other way round and Postgres rejects the write.
  async setFeatured(id: string): Promise<IPostDetail> {
    try {
      return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.post.updateMany({
          where: { featured: true },
          data: { featured: false },
        });

        return tx.post.update({
          where: { id },
          data: { featured: true },
          include: this.detailInclude,
        });
      });
    } catch (err) {
      logger.error('Failed to set featured post', err);
      throw err;
    }
  }
}

export const postsRepository = new PostsRepository();
