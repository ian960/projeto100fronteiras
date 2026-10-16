import type { PostStatus, PostType } from '../../shared/types/enums';

// null removes the video.
export type VideoInput =
  | { provider: 'youtube'; url: string }
  | { provider: 'cloudinary'; mediaId: string }
  | null;

export type AttachmentInput = { mediaId: string; title: string };

// Media fields shared by every write.
export type PostMediaInput = {
  coverId?: string | null;
  coverAlt?: string | null;
  video?: VideoInput;
  attachments?: AttachmentInput[];
};

export type CreatePostInput = PostMediaInput & {
  type: PostType;
  title: string;
  subtitle?: string | null;
  slug?: string;
  excerpt?: string;
  content?: string;
  categoryId?: string | null;
  authorId: string;
};

export type CreateMyColumnInput = PostMediaInput & {
  title: string;
  subtitle?: string | null;
  slug?: string;
  excerpt?: string;
  content?: string;
};

export type UpdatePostInput = PostMediaInput & {
  title?: string;
  subtitle?: string | null;
  slug?: string;
  excerpt?: string;
  content?: string;
  categoryId?: string | null;
  authorId?: string;
};

export type ListPublishedInput = {
  type?: PostType;
  category?: string;
  author?: string;
  q?: string;
  page: number;
  limit: number;
};

export type ListPanelInput = {
  type?: PostType;
  status?: PostStatus;
  categoryId?: string;
  authorId?: string;
  q?: string;
  page: number;
  limit: number;
};
