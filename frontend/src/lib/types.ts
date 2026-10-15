// Shapes returned by the API. They mirror backend/src/modules/*/*.types.ts;
// when a backend type changes, this file is where the front end follows.

export type Role = 'admin' | 'columnist' | 'reader';
export type AuthorType = 'writer' | 'columnist';
export type PostType = 'news' | 'column';
export type PostStatus = 'draft' | 'pending' | 'published';
export type VideoProvider = 'youtube' | 'r2';

export type Paginated<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type CategorySummary = { id: string; name: string; slug: string };

export type Category = CategorySummary & {
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CategoryWithCount = Category & { _count?: { posts: number } };

export type AuthorSummary = {
  id: string;
  name: string;
  slug: string;
  photoUrl: string | null;
  columnTitle: string | null;
};

export type Author = AuthorSummary & {
  bio: string | null;
  type: AuthorType;
  userId: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AuthorWithCount = Author & { _count?: { posts: number } };

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  author?: AuthorSummary | null;
};

export type PostListItem = {
  id: string;
  type: PostType;
  status: PostStatus;
  title: string;
  subtitle: string | null;
  slug: string;
  excerpt: string;
  coverUrl: string | null;
  coverAlt: string | null;
  featured: boolean;
  videoUrl: string | null;
  videoProvider: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  category?: CategorySummary | null;
  author?: AuthorSummary;
};

export type PostDetail = PostListItem & {
  content: string;
  categoryId: string | null;
  authorId: string;
  createdById: string;
  publishedById: string | null;
};

export type PostWithAudit = PostDetail & {
  createdBy?: Pick<User, 'id' | 'name' | 'email'>;
  publishedBy?: Pick<User, 'id' | 'name' | 'email'> | null;
};

export type HomePayload = {
  featured: PostListItem | null;
  latestNews: PostListItem[];
  latestColumns: PostListItem[];
};

export type Health = {
  ok: boolean;
  environment: string;
  uploads: 'r2' | 'disabled';
};

export type UploadedImage = {
  url: string;
  width: number;
  height: number;
  bytes: number;
  variants: { width: number; url: string }[];
};

export type VideoTicket = {
  uploadUrl: string;
  publicUrl: string;
  expiresInSeconds: number;
  maxBytes: number;
};
