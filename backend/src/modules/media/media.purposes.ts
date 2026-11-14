import { MediaKind } from '../../shared/types/enums';

// What a file is for decides everything about it: which folder it goes to,
// which formats are accepted and how big it may be. The panel asks for an
// upload *for a purpose*; it never chooses folder, formats or limits itself.
export const MediaPurpose = {
  COVER: 'cover',
  BODY: 'body', // photo inside the text of a post
  AUTHOR: 'author',
  AVATAR: 'avatar', // a user's own account photo; the only purpose a reader may upload for
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
  // The largest file Cloudinary may receive (its free plan: 10 MB images and
  // PDFs, 100 MB videos). Raising it only makes sense on a paid plan.
  maxBytes: number;
  // Images only: the largest photo someone may *pick*. Above maxBytes the
  // panel shrinks it in the browser before sending (panel/media.ts), so a
  // 15 MB camera photo still gets in. Above this, it is refused outright.
  maxSourceBytes?: number;
  // Below this the file is refused: it would look broken on the site.
  minWidth?: number;
  // Below this it is accepted, but the panel warns it may look blurry.
  recommendedWidth?: number;
};

const MB = 1024 * 1024;

// Every common picture format. Cloudinary converts all of them on delivery
// (f_auto in media.urls.ts), so the reader always gets a light WebP/AVIF.
// jpg covers .jpeg, .jpe and .jfif: Cloudinary reports them all as "jpg".
// HEIC/HEIF is what an iPhone sends. GIF stays animated.
// No SVG, on purpose: an SVG can carry a script.
const IMAGE_FORMATS = ['jpg', 'png', 'webp', 'avif', 'heic', 'heif', 'gif', 'bmp', 'tiff', 'tif'] as const;
// MIME types plus extensions: Windows often reports HEIC with an empty type,
// and the extensions keep those files visible in the file picker.
const IMAGE_ACCEPT = [
  'image/jpeg', 'image/pjpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif',
  'image/gif', 'image/bmp', 'image/x-ms-bmp', 'image/tiff',
  '.jpg', '.jpeg', '.jfif', '.png', '.webp', '.avif', '.heic', '.heif', '.gif', '.bmp', '.tif', '.tiff',
].join(',');

export const PURPOSE_RULES: Record<MediaPurpose, PurposeRule> = {
  cover: {
    kind: MediaKind.IMAGE,
    resourceType: 'image',
    folder: 'covers',
    formats: IMAGE_FORMATS,
    accept: IMAGE_ACCEPT,
    maxBytes: 10 * MB,
    maxSourceBytes: 40 * MB,
    // The lead story is shown up to ~1200px wide on desktop: under 800px it
    // gets blurry, so the panel warns. Only a tiny icon (under 100px) is refused.
    minWidth: 100,
    recommendedWidth: 800,
  },
  body: {
    kind: MediaKind.IMAGE,
    resourceType: 'image',
    folder: 'body',
    formats: IMAGE_FORMATS,
    accept: IMAGE_ACCEPT,
    maxBytes: 10 * MB,
    maxSourceBytes: 40 * MB,
    minWidth: 100,
    recommendedWidth: 400,
  },
  author: {
    kind: MediaKind.IMAGE,
    resourceType: 'image',
    folder: 'authors',
    formats: IMAGE_FORMATS,
    accept: IMAGE_ACCEPT,
    maxBytes: 10 * MB,
    maxSourceBytes: 40 * MB,
    minWidth: 100,
  },
  avatar: {
    kind: MediaKind.IMAGE,
    resourceType: 'image',
    folder: 'avatars',
    formats: IMAGE_FORMATS,
    accept: IMAGE_ACCEPT,
    // Readers upload these, so the limits are tighter than the newsroom's.
    maxBytes: 5 * MB,
    maxSourceBytes: 20 * MB,
    minWidth: 100,
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

// What the panel needs to know before a file is picked: the <input accept>,
// the limits and the width warnings. Served by GET /api/media/rules, so the
// panel never repeats them.
export type PurposeLimits = Pick<PurposeRule, 'kind' | 'accept' | 'maxBytes' | 'maxSourceBytes' | 'minWidth' | 'recommendedWidth'>;

export function purposeLimits(): Record<MediaPurpose, PurposeLimits> {
  return Object.fromEntries(
    Object.entries(PURPOSE_RULES).map(([purpose, rule]) => [
      purpose,
      {
        kind: rule.kind,
        accept: rule.accept,
        maxBytes: rule.maxBytes,
        maxSourceBytes: rule.maxSourceBytes,
        minWidth: rule.minWidth,
        recommendedWidth: rule.recommendedWidth,
      },
    ]),
  ) as Record<MediaPurpose, PurposeLimits>;
}

// Purposes that accept an image link to import (covers, photos in the text,
// author photos). Videos and PDFs are always sent as files.
export const IMPORTABLE_PURPOSES = [MediaPurpose.COVER, MediaPurpose.BODY, MediaPurpose.AUTHOR] as const;
