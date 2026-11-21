import type { AuthorType } from '../../shared/types/enums';

export type CreateAuthorData = {
  name: string;
  slug: string;
  type: AuthorType;
  bio?: string | null;
  photoId?: string | null;
  columnTitle?: string | null;
};

export type UpdateAuthorData = {
  name?: string;
  slug?: string;
  bio?: string | null;
  photoId?: string | null;
  columnTitle?: string | null;
  active?: boolean;
};

export type FindAuthorsFilters = {
  type?: AuthorType;
  active?: boolean;
};

// What happens to the posts of an author being deleted: they move to another
// byline (transferTo) or go with the author (deletePosts). If the byline
// belonged to a columnist login, that login goes back to reader, because a
// columnist without a byline cannot write anything.
export type DeleteAuthorOptions = {
  transferTo?: string;
  deletePosts?: boolean;
  demoteUserId?: string;
};
