import type { PostStatus, PostType } from '../../shared/types/enums';

export type CreatePostData = {
  type: PostType;
  status: PostStatus;
  title: string;
  slug: string;
  subtitle?: string | null;
  excerpt?: string;
  content?: string;
  coverUrl?: string | null;
  coverAlt?: string | null;
  videoUrl?: string | null;
  videoProvider?: string | null;
  categoryId?: string | null;
  authorId: string;
  createdById: string;
};

export type UpdatePostData = {
  title?: string;
  slug?: string;
  subtitle?: string | null;
  excerpt?: string;
  content?: string;
  coverUrl?: string | null;
  coverAlt?: string | null;
  videoUrl?: string | null;
  videoProvider?: string | null;
  categoryId?: string | null;
  authorId?: string;
  status?: PostStatus;
  publishedAt?: Date | null;
  publishedById?: string | null;
};

// Public listings. Status is not a parameter: these endpoints only ever return
// published rows, so it cannot be widened by a caller passing the wrong value.
export type FindPublishedFilters = {
  type?: PostType;
  categorySlug?: string;
  authorSlug?: string;
  search?: string;
};

// Panel listings.
export type FindForPanelFilters = {
  type?: PostType;
  status?: PostStatus;
  categoryId?: string;
  authorId?: string;
  search?: string;
};
