import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { buildPaginated, toSkipTake } from '../../shared/utils/pagination';
import type { Paginated, PaginationParams } from '../../shared/types/pagination';
import { authorSummarySelect, toAuthorSummary } from '../authors/authors.select';
import { mediaSelect } from '../media/media.select';
import type { IMedia, IMediaView } from '../media/media.types';
import { presentMedia } from '../media/media.urls';
import type { IPostsRepository } from './posts.repository.interfaces';
import type {
  AttachmentData,
  CreatePostData,
  FindForPanelFilters,
  FindPublishedFilters,
  UpdatePostData,
} from './posts.repository.types';
import type { IPost, IPostDetail, IPostListItem, IPostWithAudit } from './posts.types';

// ── from database rows to what the API returns ──────────────────────────────
// Files arrive as media rows and leave as views with ready-made URLs; the
// byline's photo becomes photoUrl. Pure functions: no queries in here.

type AuthorRow = Parameters<typeof toAuthorSummary>[0];

function view(media: IMedia | null): IMediaView | null {
  return media ? presentMedia(media) : null;
}

function toListItem<T extends { cover: IMedia | null; author: AuthorRow }>(row: T) {
  return { ...row, cover: view(row.cover), author: toAuthorSummary(row.author) };
}

function toDetail<
  T extends {
    cover: IMedia | null;
    video: IMedia | null;
    author: AuthorRow;
    attachments: { title: string; media: IMedia }[];
  },
>(row: T) {
  return {
    ...row,
    cover: view(row.cover),
    video: view(row.video),
    author: toAuthorSummary(row.author),
    attachments: row.attachments.map((item) => ({
      title: item.title,
      media: presentMedia(item.media),
    })),
  };
}

// The nested write that replaces a post's attachment list, in order.
function attachmentRows(list: AttachmentData[]) {
  return list.map((item, position) => ({ mediaId: item.mediaId, title: item.title, position }));
}

export class PostsRepository implements IPostsRepository {
  private readonly categorySummary = { id: true, name: true, slug: true } as const;

  // No `content` here: this is what listings return.
  private readonly listSelect = {
    id: true,
    type: true,
    status: true,
    title: true,
    subtitle: true,
    slug: true,
    excerpt: true,
    coverId: true,
    coverAlt: true,
    featured: true,
    videoYoutubeId: true,
    videoId: true,
    publishedAt: true,
    createdAt: true,
    updatedAt: true,
    cover: { select: mediaSelect },
    category: { select: this.categorySummary },
    author: { select: authorSummarySelect },
  } as const;

  private readonly detailInclude = {
    category: { select: this.categorySummary },
    author: { select: authorSummarySelect },
    cover: { select: mediaSelect },
    video: { select: mediaSelect },
    attachments: {
      select: { title: true, media: { select: mediaSelect } },
      orderBy: { position: 'asc' },
    },
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
      const [rows, total] = await Promise.all([
        prisma.post.findMany({
          where,
          select: this.listSelect,
          orderBy: { publishedAt: 'desc' },
          ...toSkipTake(pagination),
        }),
        prisma.post.count({ where }),
      ]);

      return buildPaginated(rows.map(toListItem), total, pagination);
    } catch (err) {
      logger.error('Failed to list published posts', err);
      throw err;
    }
  }

  async findPublishedBySlug(slug: string): Promise<IPostDetail | null> {
    try {
      const row = await prisma.post.findFirst({
        where: { slug, status: 'published' },
        include: this.detailInclude,
      });
      return row ? toDetail(row) : null;
    } catch (err) {
      logger.error('Failed to find published post by slug', err);
      throw err;
    }
  }

  async findFeatured(): Promise<IPostListItem | null> {
    try {
      const row = await prisma.post.findFirst({
        where: { featured: true, status: 'published' },
        select: this.listSelect,
      });
      return row ? toListItem(row) : null;
    } catch (err) {
      logger.error('Failed to find featured post', err);
      throw err;
    }
  }

  async findLatest(type: FindPublishedFilters['type'], limit: number): Promise<IPostListItem[]> {
    try {
      const rows = await prisma.post.findMany({
        where: { status: 'published', ...(type ? { type } : {}) },
        select: this.listSelect,
        orderBy: { publishedAt: 'desc' },
        take: limit,
      });
      return rows.map(toListItem);
    } catch (err) {
      logger.error('Failed to find latest posts', err);
      throw err;
    }
  }

  async findPublishedByIds(ids: string[]): Promise<IPostListItem[]> {
    try {
      const rows = await prisma.post.findMany({
        where: { id: { in: ids }, status: 'published' },
        select: this.listSelect,
        orderBy: { publishedAt: 'desc' },
      });
      return rows.map(toListItem);
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

      const [rows, total] = await Promise.all([
        prisma.post.findMany({
          where,
          select: this.listSelect,
          orderBy: { updatedAt: 'desc' },
          ...toSkipTake(pagination),
        }),
        prisma.post.count({ where }),
      ]);

      return buildPaginated(rows.map(toListItem), total, pagination);
    } catch (err) {
      logger.error('Failed to list posts for panel', err);
      throw err;
    }
  }

  async findByIdWithAudit(id: string): Promise<IPostWithAudit | null> {
    try {
      const row = await prisma.post.findUnique({
        where: { id },
        include: {
          ...this.detailInclude,
          createdBy: { select: this.userSummary },
          publishedBy: { select: this.userSummary },
        },
      });
      return row ? toDetail(row) : null;
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

  async findAttachmentMediaIds(postId: string): Promise<string[]> {
    try {
      const rows = await prisma.postAttachment.findMany({
        where: { postId },
        select: { mediaId: true },
      });
      return rows.map((row) => row.mediaId);
    } catch (err) {
      logger.error('Failed to list post attachments', err);
      throw err;
    }
  }

  async create(data: CreatePostData): Promise<IPostDetail> {
    try {
      const row = await prisma.post.create({
        data: {
          type: data.type,
          status: data.status,
          title: data.title,
          slug: data.slug,
          subtitle: data.subtitle ?? null,
          excerpt: data.excerpt ?? '',
          content: data.content ?? '',
          coverId: data.coverId ?? null,
          coverAlt: data.coverAlt ?? null,
          videoYoutubeId: data.videoYoutubeId ?? null,
          videoId: data.videoId ?? null,
          categoryId: data.categoryId ?? null,
          authorId: data.authorId,
          createdById: data.createdById,
          ...(data.attachments?.length
            ? { attachments: { create: attachmentRows(data.attachments) } }
            : {}),
        },
        include: this.detailInclude,
      });
      return toDetail(row);
    } catch (err) {
      logger.error('Failed to create post', err);
      throw err;
    }
  }

  async update(id: string, data: UpdatePostData): Promise<IPostDetail> {
    try {
      const { attachments, ...fields } = data;

      // Prisma runs the nested deleteMany + create in the same transaction as
      // the update: the list is never seen half-replaced.
      const row = await prisma.post.update({
        where: { id },
        data: {
          ...fields,
          ...(attachments !== undefined
            ? { attachments: { deleteMany: {}, create: attachmentRows(attachments) } }
            : {}),
        },
        include: this.detailInclude,
      });
      return toDetail(row);
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

        const row = await tx.post.update({
          where: { id },
          data: { featured: true },
          include: this.detailInclude,
        });

        return toDetail(row);
      });
    } catch (err) {
      logger.error('Failed to set featured post', err);
      throw err;
    }
  }
}

export const postsRepository = new PostsRepository();
