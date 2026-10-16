import { z } from 'zod';
import { AuthorType } from '../../shared/types/enums';

export const createAuthorSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120),
    slug: z.string().trim().max(140).optional(),
    bio: z.string().trim().max(600).nullish(),
    photoId: z.uuid().nullish(), // an image uploaded through /api/media
    // A writer cannot own a column, so columnTitle is rejected for them in the
    // service. Kept optional here so the same schema serves both cases.
    columnTitle: z.string().trim().max(120).nullish(),
    type: z.enum([AuthorType.WRITER, AuthorType.COLUMNIST]).default(AuthorType.WRITER),
  }),
});

export const updateAuthorSchema = z.object({
  params: z.object({ id: z.uuid() }),
  body: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      slug: z.string().trim().max(140).optional(),
      bio: z.string().trim().max(600).nullish(),
      photoId: z.uuid().nullish(), // an image uploaded through /api/media
      columnTitle: z.string().trim().max(120).nullish(),
      active: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'Provide at least one field to update.',
    }),
});

export const authorIdParamSchema = z.object({
  params: z.object({ id: z.uuid() }),
});

export const authorSlugParamSchema = z.object({
  params: z.object({ slug: z.string().trim().min(1).max(140) }),
});

export const updateMyProfileSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      bio: z.string().trim().max(600).nullish(),
      photoId: z.uuid().nullish(), // an image uploaded through /api/media
      columnTitle: z.string().trim().max(120).nullish(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'Provide at least one field to update.',
    }),
});
