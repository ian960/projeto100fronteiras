import type { AuthorType } from '../../shared/types/enums';

export type CreateAuthorInput = {
  name: string;
  slug?: string;
  bio?: string | null;
  photoId?: string | null;
  columnTitle?: string | null;
  type: AuthorType;
};

export type UpdateAuthorInput = {
  name?: string;
  slug?: string;
  bio?: string | null;
  photoId?: string | null;
  columnTitle?: string | null;
  active?: boolean;
};

export type UpdateMyProfileInput = {
  name?: string;
  bio?: string | null;
  photoId?: string | null;
  columnTitle?: string | null;
};
