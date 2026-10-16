import type { PostStatus, PostType } from '../../shared/types/enums';
import type { ICategorySummary } from '../categories/categories.types';
import type { IAuthorSummary } from '../authors/authors.types';
import type { IUserPublic } from '../users/users.types';
import type { IMediaView } from '../media/media.types';

// One row of the posts table. The four *Id fields are the real columns; the
// relations are not here on purpose — see the note at the bottom of this file.
export interface IPost {
  id: string;
  type: PostType;
  status: PostStatus;

  title: string;
  subtitle: string | null;
  slug: string;
  excerpt: string;
  content: string; // sanitized HTML
  coverId: string | null;
  coverAlt: string | null;

  featured: boolean;

  // At most one of the two (CHECK posts_single_video).
  videoYoutubeId: string | null;
  videoId: string | null;

  categoryId: string | null; // always null when type === 'column'
  authorId: string;
  createdById: string;
  publishedById: string | null;

  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Listings never ship `content`: twelve cards would mean twelve full HTML
// bodies over the wire for text nobody reads on that screen.
// The cover comes as a media view (URLs ready for <img srcset>).
export type IPostSummary = Pick<
  IPost,
  | 'id' | 'type' | 'status' | 'title' | 'subtitle' | 'slug' | 'excerpt'
  | 'coverId' | 'coverAlt' | 'featured' | 'videoYoutubeId' | 'videoId'
  | 'publishedAt' | 'createdAt' | 'updatedAt'
> & {
  cover: IMediaView | null;
};

// Home feed, category page, author page, columnists tab.
export type IPostListItem = IPostSummary & {
  category?: ICategorySummary | null;
  author?: IAuthorSummary;
};

// A PDF under the text, in the order the writer chose.
export type IPostAttachment = {
  title: string;
  media: IMediaView;
};

// Article page: full body plus byline, category and every file. Every detail
// query loads cover, video and attachments, so here they are not optional.
export type IPostDetail = IPost & {
  category?: ICategorySummary | null;
  author?: IAuthorSummary;
  cover: IMediaView | null;
  video: IMediaView | null;
  attachments: IPostAttachment[];
};

// Admin panel only: who typed it and who approved it.
export type IPostWithAudit = IPostDetail & {
  createdBy?: IUserPublic;
  publishedBy?: IUserPublic | null;
};

// The home page in a single request. Three queries server-side beats three
// round trips from a phone on mobile data.
export type IHomePayload = {
  featured: IPostListItem | null;
  latestNews: IPostListItem[];
  latestColumns: IPostListItem[];
};

// Why the relations are optional in every composed type above:
//
// A relation exists in the database, but only appears in a result when the
// query asked for it. `SELECT * FROM posts` returns no author and no category.
// Declaring `author: IAuthorSummary` as required would make the base type lie
// on every query without an include.
//
// The rule: one composed type per query shape that a repository method
// actually returns. If no method returns it, it should not exist.
