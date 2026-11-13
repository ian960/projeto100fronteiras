import { z } from 'zod';

// Plain text: what the person typed, trimmed. Control characters other than
// line breaks and tabs are dropped. It is never rendered as HTML (the site
// shows it as text), so no tag can do anything.
const content = z
  .string()
  .transform((text) => text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim())
  .pipe(z.string().min(1, 'Write something before sending.').max(2000));

export const listCommentsSchema = z.object({
  query: z.object({ postId: z.uuid() }),
});

export const createCommentSchema = z.object({
  body: z.object({
    postId: z.uuid(),
    parentId: z.uuid().nullish(),
    content,
  }),
});

export const updateCommentSchema = z.object({
  params: z.object({ id: z.uuid() }),
  body: z.object({ content }),
});

export const commentIdParamSchema = z.object({
  params: z.object({ id: z.uuid() }),
});
