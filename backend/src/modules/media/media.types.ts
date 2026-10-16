import type { MediaKind } from '../../shared/types/enums';

// One row of the media table.
export interface IMedia {
  id: string;
  kind: MediaKind;
  publicId: string; // "portal/covers/<uuid>"
  version: string;
  format: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  pages: number | null;
  originalName: string;
  uploadedById: string;
  createdAt: Date;
}

// What the API returns for a file: the facts a page needs plus ready-made
// URLs. Nothing outside media.urls.ts knows how a Cloudinary URL is built.
export type IMediaView = {
  id: string;
  kind: MediaKind;
  originalName: string;
  format: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  pages: number | null;
  // image: the largest web size · video: an mp4 · document: the PDF itself
  url: string;
  // A small preview: 480px image, a frame of the video, page 1 of the PDF.
  thumbnailUrl: string;
  // Images: the same picture at several widths, for <img srcset>.
  srcset: string | null;
  // Videos: a full-size frame for <video poster>.
  posterUrl: string | null;
};

// What the panel needs to send a file straight to Cloudinary. Every field in
// `fields` is part of the signature: changing one makes Cloudinary refuse it.
export type ISignedUpload = {
  uploadUrl: string;
  fields: Record<string, string>;
  maxBytes: number;
  accept: string;
};
