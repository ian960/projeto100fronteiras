import type { PostType } from '../../shared/types/enums';

// What the site's Worker needs to build sitemap.xml and sitemap-news.xml.
// Just addresses and dates: no text, no images, so the list stays light even
// with thousands of articles.
export type ISitemapPost = {
  slug: string;
  type: PostType;
  // Only sitemap-news.xml uses it, and only for the last 48 hours.
  title: string;
  publishedAt: Date | null;
  updatedAt: Date;
};

export type ISitemapEntry = {
  slug: string;
  updatedAt: Date;
};

export type ISitemap = {
  posts: ISitemapPost[];
  categories: ISitemapEntry[];
  authors: ISitemapEntry[];
};
