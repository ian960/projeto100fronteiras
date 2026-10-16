import type { AuthorType } from '../../shared/types/enums';

export interface IAuthor {
  id: string;
  name: string;
  slug: string;
  photoId: string | null;
  bio: string | null;
  columnTitle: string | null;

  type: AuthorType;

  // The foreign key column. Null for writers (byline only, no login).
  userId: string | null;

  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// What leaves the API: the row plus the photo as a ready-made avatar URL
// (cropped square around the face, see media.urls.ts). photoId stays, so the
// panel knows which file is currently set.
export type IAuthorPublic = IAuthor & { photoUrl: string | null };

// Embedded in a post response: just the byline.
export type IAuthorSummary = Pick<
  IAuthorPublic,
  'id' | 'name' | 'slug' | 'photoId' | 'photoUrl' | 'columnTitle'
>;

// Admin list: "Fulano — 12 posts".
export type IAuthorWithPostCount = IAuthorPublic & {
  _count?: { posts: number };
};
