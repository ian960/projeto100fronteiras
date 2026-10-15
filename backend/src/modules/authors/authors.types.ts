import type { AuthorType } from '../../shared/types/enums';

export interface IAuthor {
  id: string;
  name: string;
  slug: string;
  photoUrl: string | null;
  bio: string | null;
  columnTitle: string | null;

  type: AuthorType;

  // The foreign key column. Null for writers (byline only, no login).
  userId: string | null;

  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type IAuthorPublic = IAuthor;

// Embedded in a post response: just the byline.
export type IAuthorSummary = Pick<
  IAuthor,
  'id' | 'name' | 'slug' | 'photoUrl' | 'columnTitle'
>;

// Admin list: "Fulano — 12 posts".
export type IAuthorWithPostCount = IAuthor & {
  _count?: { posts: number };
};
