// Shapes returned by the API. They mirror backend/src/modules/*/*.types.ts;
// when a backend type changes, this file is where the front end follows.

export type Role = 'admin' | 'columnist' | 'reader';
export type AuthorType = 'writer' | 'columnist';
export type PostType = 'news' | 'column';
export type PostStatus = 'draft' | 'pending' | 'published';
export type MediaKind = 'image' | 'video' | 'document';
export type MediaPurpose = 'cover' | 'body' | 'author' | 'video' | 'document';

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

// A file in Cloudinary, with URLs built by the API (backend media.urls.ts).
export type Media = {
  id: string;
  kind: MediaKind;
  originalName: string;
  format: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  pages: number | null;
  url: string; // image: largest web size · video: mp4 · document: the PDF
  thumbnailUrl: string; // small image, video frame or PDF page 1
  srcset: string | null; // images
  posterUrl: string | null; // videos
  shareUrl: string | null; // images: 1200×630 for link previews
};

export type AuthorSummary = {
  id: string;
  name: string;
  slug: string;
  photoId: string | null;
  photoUrl: string | null; // square avatar, centred on the face
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
  coverId: string | null;
  coverAlt: string | null;
  cover: Media | null;
  featured: boolean;
  videoYoutubeId: string | null;
  videoId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  category?: CategorySummary | null;
  author?: AuthorSummary;
};

export type Attachment = { title: string; media: Media };

export type PostDetail = PostListItem & {
  content: string;
  video: Media | null;
  attachments: Attachment[];
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
  uploads: 'cloudinary' | 'disabled';
};

// What POST /api/media/signature returns: where to send the file and the
// signed fields to send with it, untouched.
export type SignedUpload = {
  uploadUrl: string;
  fields: Record<string, string>;
  maxBytes: number;
  accept: string;
};
