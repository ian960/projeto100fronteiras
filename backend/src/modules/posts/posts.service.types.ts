import type { PostStatus, PostType } from '../../shared/types/enums';

export type VideoInput = {
  videoUrl?: string | null;
  videoProvider?: 'youtube' | 'r2' | null;
};

export type CreatePostInput = VideoInput & {
  type: PostType;
  title: string;
  subtitle?: string | null;
  slug?: string;
  excerpt?: string;
  content?: string;
  coverUrl?: string | null;
  coverAlt?: string | null;
  categoryId?: string | null;
  authorId: string;
};

export type CreateMyColumnInput = VideoInput & {
  title: string;
  subtitle?: string | null;
  slug?: string;
  excerpt?: string;
  content?: string;
  coverUrl?: string | null;
  coverAlt?: string | null;
};

export type UpdatePostInput = VideoInput & {
  title?: string;
  subtitle?: string | null;
  slug?: string;
  excerpt?: string;
  content?: string;
  coverUrl?: string | null;
  coverAlt?: string | null;
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
