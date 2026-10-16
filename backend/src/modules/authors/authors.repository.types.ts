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
