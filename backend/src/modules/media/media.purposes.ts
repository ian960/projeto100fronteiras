import { MediaKind } from '../../shared/types/enums';

// What a file is for decides everything about it: which folder it goes to,
// which formats are accepted and how big it may be. The panel asks for an
// upload *for a purpose*; it never chooses folder, formats or limits itself.
export const MediaPurpose = {
  COVER: 'cover',
  BODY: 'body', // photo inside the text of a post
  AUTHOR: 'author',
  VIDEO: 'video',
  DOCUMENT: 'document',
} as const;
export type MediaPurpose = (typeof MediaPurpose)[keyof typeof MediaPurpose];

export type PurposeRule = {
  kind: MediaKind;
  // Cloudinary's endpoint: PDFs go through "image" too, which is what gives
  // them a page count and a thumbnail of the first page.
  resourceType: 'image' | 'video';
  folder: string;
  formats: readonly string[];
  // For the <input accept="…"> in the panel.
  accept: string;
  maxBytes: number;
  minWidth?: number;
};

const MB = 1024 * 1024;

// jpg covers .jpeg as well: Cloudinary reports both as "jpg".
// HEIC is what an iPhone sends; Cloudinary converts it on delivery.
const IMAGE_FORMATS = ['jpg', 'png', 'webp', 'avif', 'heic'] as const;
const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif';

// Limits match Cloudinary's free plan (10 MB images and PDFs, 100 MB videos).
// Raising them only makes sense on a paid plan.
export const PURPOSE_RULES: Record<MediaPurpose, PurposeRule> = {
  cover: {
    kind: MediaKind.IMAGE,
    resourceType: 'image',
    folder: 'covers',
    formats: IMAGE_FORMATS,
    accept: IMAGE_ACCEPT,
    maxBytes: 10 * MB,
    // The lead story is shown up to ~1200px wide on desktop.
    minWidth: 800,
  },
  body: {
    kind: MediaKind.IMAGE,
    resourceType: 'image',
    folder: 'body',
    formats: IMAGE_FORMATS,
    accept: IMAGE_ACCEPT,
    maxBytes: 10 * MB,
    minWidth: 400,
  },
  author: {
    kind: MediaKind.IMAGE,
    resourceType: 'image',
    folder: 'authors',
    formats: IMAGE_FORMATS,
    accept: IMAGE_ACCEPT,
    maxBytes: 10 * MB,
    minWidth: 200,
  },
  video: {
    kind: MediaKind.VIDEO,
    resourceType: 'video',
    folder: 'videos',
    // .mov is what a phone records. Cloudinary converts it to mp4 on delivery.
    formats: ['mp4', 'mov', 'webm', 'm4v'],
    accept: 'video/mp4,video/quicktime,video/webm,video/x-m4v',
    maxBytes: 100 * MB,
  },
  document: {
    kind: MediaKind.DOCUMENT,
    resourceType: 'image',
    folder: 'documents',
    formats: ['pdf'],
    accept: 'application/pdf',
    maxBytes: 10 * MB,
  },
};

// Purposes that accept an image link to import (covers, photos in the text,
// author photos). Videos and PDFs are always sent as files.
export const IMPORTABLE_PURPOSES = [MediaPurpose.COVER, MediaPurpose.BODY, MediaPurpose.AUTHOR] as const;
