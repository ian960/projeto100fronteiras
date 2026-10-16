import type { MediaKind } from '../../shared/types/enums';

export type CreateMediaData = {
  kind: MediaKind;
  publicId: string;
  version: string;
  format: string;
  bytes: number;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
  pages?: number | null;
  originalName: string;
  uploadedById: string;
};

// Where a file is used. Deleting it is only allowed when every count is 0.
export type MediaUsage = {
  covers: number;
  videos: number;
  attachments: number;
  authorPhotos: number;
  inText: number; // photos inside the text of a post
};
