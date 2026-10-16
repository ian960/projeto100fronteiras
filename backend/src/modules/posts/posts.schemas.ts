import { z } from 'zod';
import { PostStatus, PostType } from '../../shared/types/enums';

// One video per post: a YouTube link, a file uploaded through /api/media, or
// none (null). The shape itself makes "both at once" impossible to send.
const videoSchema = z
  .discriminatedUnion('provider', [
    // A full YouTube URL or the bare id; normalized to the id in the service.
    z.object({ provider: z.literal('youtube'), url: z.string().trim().min(1).max(500) }),
    z.object({ provider: z.literal('cloudinary'), mediaId: z.uuid() }),
  ])
  .nullable();

// PDFs under the text, in display order. The whole list is sent every time.
const attachmentsSchema = z
  .array(
    z.object({
      mediaId: z.uuid(),
      title: z.string().trim().min(1).max(200),
    }),
  )
  .max(20)
  .refine((list) => new Set(list.map((item) => item.mediaId)).size === list.length, {
    message: 'The same file is attached twice.',
  });

const baseBody = {
  title: z.string().trim().min(3).max(200),
  subtitle: z.string().trim().max(300).nullish(),
  slug: z.string().trim().max(220).optional(),
  excerpt: z.string().trim().max(400).optional(),
  content: z.string().max(200_000).optional(),
  coverId: z.uuid().nullish(), // an image uploaded through /api/media
  coverAlt: z.string().trim().max(200).nullish(),
  video: videoSchema.optional(),
  attachments: attachmentsSchema.optional(),
};

// Admin creating news or a column. `status` is absent: everything is born a
// draft and goes live only through POST /:id/publish, so there is one door.
export const createPostSchema = z.object({
  body: z
    .object({
      ...baseBody,
      type: z.enum([PostType.NEWS, PostType.COLUMN]),
      categoryId: z.uuid().nullish(),
      authorId: z.uuid(),
    }),
});

// A columnist creating their own column. No type, no authorId, no categoryId:
// all three are decided by the server.
export const createMyColumnSchema = z.object({
  body: z.object(baseBody),
});

export const updatePostSchema = z.object({
  params: z.object({ id: z.uuid() }),
  body: z
    .object({
      ...baseBody,
      title: baseBody.title.optional(),
      categoryId: z.uuid().nullish(),
      authorId: z.uuid().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'Provide at least one field to update.',
    }),
});

export const postIdParamSchema = z.object({
  params: z.object({ id: z.uuid() }),
});

export const postSlugParamSchema = z.object({
  params: z.object({ slug: z.string().trim().min(1).max(220) }),
});

export const listPublishedSchema = z.object({
  query: z.object({
    type: z.enum([PostType.NEWS, PostType.COLUMN]).optional(),
    category: z.string().trim().max(80).optional(),
    author: z.string().trim().max(140).optional(),
    q: z.string().trim().min(2).max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
  }),
});

export const listPanelSchema = z.object({
  query: z.object({
    type: z.enum([PostType.NEWS, PostType.COLUMN]).optional(),
    status: z.enum([PostStatus.DRAFT, PostStatus.PENDING, PostStatus.PUBLISHED]).optional(),
    categoryId: z.uuid().optional(),
    authorId: z.uuid().optional(),
    q: z.string().trim().min(2).max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

// Reader bookmarks live in the browser's localStorage, so the front end holds
// a list of ids and asks for them in one go. Capped so the endpoint cannot be
// turned into a bulk dump.
export const findByIdsSchema = z.object({
  query: z.object({
    ids: z
      .string()
      .trim()
      .min(1)
      .transform((value) => value.split(',').map((id) => id.trim()).filter(Boolean))
      .pipe(z.array(z.uuid()).min(1).max(50)),
  }),
});
