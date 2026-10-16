import type { MediaPurpose } from './media.purposes';

export type RegisterMediaInput = {
  purpose: MediaPurpose;
  publicId: string;
  version: string;
  signature: string;
  resourceType: 'image' | 'video';
  format: string;
  bytes: number;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  pages?: number | null;
  originalName: string;
};

export type ImportMediaInput = {
  purpose: Extract<MediaPurpose, 'cover' | 'body' | 'author'>;
  url: string;
};

// What Cloudinary says about a stored file, whichever way it got there.
export type UploadedFacts = {
  publicId: string;
  version: string;
  resourceType: string;
  format: string;
  bytes: number;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  pages?: number | null;
};
