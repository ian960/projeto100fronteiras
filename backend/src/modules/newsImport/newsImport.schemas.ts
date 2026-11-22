import { z } from 'zod';

const fields = {
  name: z.string().trim().min(2).max(120),
  feedUrl: z.url({ protocol: /^https?$/, error: 'Use the address of the RSS feed, starting with http:// or https://.' }).max(500),
  fullText: z.boolean(),
  active: z.boolean(),
  categoryId: z.uuid(),
};

export const createSourceSchema = z.object({
  body: z.object({ ...fields, fullText: fields.fullText.default(false), active: fields.active.default(true) }),
});

export const updateSourceSchema = z.object({
  params: z.object({ id: z.uuid() }),
  body: z.object(fields).partial(),
});

export const sourceIdSchema = z.object({ params: z.object({ id: z.uuid() }) });

export const postIdSchema = z.object({ params: z.object({ postId: z.uuid() }) });

export const recentItemsSchema = z.object({
  query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) }),
});
