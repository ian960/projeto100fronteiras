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

// The whole list in the new order, first to last.
export const reorderAuthorsSchema = z.object({
  body: z.object({
    ids: z
      .array(z.uuid())
      .min(1)
      .max(1000)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'Repeated author in the list.' }),
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

// DELETE /admin/authors/:id?transferTo=<authorId> or ?deletePosts=true
export const removeAuthorSchema = z.object({
  params: z.object({ id: z.uuid() }),
  query: z.object({
    transferTo: z.uuid().optional(),
    deletePosts: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
  }),
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
      // Which of the login's authors, when the admin tied several to it.
      // Left out: the first one.
      authorId: z.uuid().optional(),
    })
    .refine((data) => Object.keys(data).some((key) => key !== 'authorId'), {
      message: 'Provide at least one field to update.',
    }),
});
