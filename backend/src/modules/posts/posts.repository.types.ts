import type { PostStatus, PostType } from '../../shared/types/enums';

export type AttachmentData = { mediaId: string; title: string };

export type CreatePostData = {
  type: PostType;
  status: PostStatus;
  title: string;
  slug: string;
  subtitle?: string | null;
  excerpt?: string;
  content?: string;
  sourceName?: string | null;
  sourceUrl?: string | null;
  coverId?: string | null;
  coverAlt?: string | null;
  videoYoutubeId?: string | null;
  videoId?: string | null;
  // Replaces the whole list, in this order.
  attachments?: AttachmentData[];
  categoryId?: string | null;
  authorId: string | null;
  bylineName?: string | null;
  createdById: string;
};

export type UpdatePostData = {
  title?: string;
  slug?: string;
  subtitle?: string | null;
  excerpt?: string;
  content?: string;
  sourceName?: string | null;
  sourceUrl?: string | null;
  coverId?: string | null;
  coverAlt?: string | null;
  videoYoutubeId?: string | null;
  videoId?: string | null;
  // Replaces the whole list, in this order.
  attachments?: AttachmentData[];
  categoryId?: string | null;
  authorId?: string | null;
  bylineName?: string | null;
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
  origin?: 'manual' | 'imported';
  // A columnist's own texts: columns signed by them, and news signed by them
  // that they wrote themselves (see posts.policy ownsPost).
  ownedBy?: { authorIds: string[]; userId: string };
  categoryId?: string;
  authorId?: string;
  search?: string;
};
