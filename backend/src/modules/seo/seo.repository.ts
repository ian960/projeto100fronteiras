import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import type { ISitemap } from './seo.types';

// Google reads at most 50,000 addresses per sitemap file.
export const SITEMAP_MAX_POSTS = 45_000;

export class SeoRepository {
  async findSitemap(): Promise<ISitemap> {
    try {
      const [posts, categories, authors] = await Promise.all([
        // `status: published` is hard-coded: drafts never reach a sitemap.
        prisma.post.findMany({
          where: { status: 'published' },
          select: { slug: true, type: true, title: true, publishedAt: true, updatedAt: true },
          orderBy: { publishedAt: 'desc' },
          take: SITEMAP_MAX_POSTS,
        }),
        prisma.category.findMany({
          where: { active: true },
          select: { slug: true, updatedAt: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        }),
        // Only bylines with something published: an author page with no
        // article is an empty page, which Google treats as low quality.
        prisma.author.findMany({
          where: { active: true, posts: { some: { status: 'published' } } },
          select: { slug: true, updatedAt: true },
          orderBy: { name: 'asc' },
        }),
      ]);
      return { posts, categories, authors };
    } catch (err) {
      logger.error('Failed to build the sitemap', err);
      throw err;
    }
  }
}

export const seoRepository = new SeoRepository();
