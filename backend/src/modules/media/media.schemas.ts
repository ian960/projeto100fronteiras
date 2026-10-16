import { z } from 'zod';
import { IMPORTABLE_PURPOSES, MediaPurpose } from './media.purposes';

const purpose = z.enum([
  MediaPurpose.COVER,
  MediaPurpose.BODY,
  MediaPurpose.AUTHOR,
  MediaPurpose.VIDEO,
  MediaPurpose.DOCUMENT,
]);

export const signUploadSchema = z.object({
  body: z.object({ purpose }),
});

// Cloudinary's answer to the upload, forwarded by the panel. Only publicId +
// version + signature are trusted as such (the signature proves them); the
// other fields describe the file and are checked against the purpose's rules.
export const registerMediaSchema = z.object({
  body: z.object({
    purpose,
    publicId: z.string().trim().min(1).max(255),
    version: z
      .union([z.string(), z.number()])
      .transform(String)
      .pipe(z.string().regex(/^\d{1,20}$/, 'Invalid version.')),
    signature: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i, 'Invalid signature.'),
    resourceType: z.enum(['image', 'video']),
    format: z.string().trim().toLowerCase().min(2).max(10),
    bytes: z.number().int().positive(),
    width: z.number().int().positive().nullish(),
    height: z.number().int().positive().nullish(),
    duration: z.number().nonnegative().nullish(),
    pages: z.number().int().positive().nullish(),
    // The name of the file on the writer's computer. Display only.
    originalName: z.string().trim().min(1).max(200),
  }),
});

export const importMediaSchema = z.object({
  body: z.object({
    purpose: z.enum(IMPORTABLE_PURPOSES),
    url: z.url({ protocol: /^https?$/ }).max(2000),
  }),
});

export const mediaIdParamSchema = z.object({
  params: z.object({ id: z.uuid() }),
});
