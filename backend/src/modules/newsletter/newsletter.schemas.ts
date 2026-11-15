import { z } from 'zod';

const email = z.string().trim().toLowerCase().pipe(z.email().max(200));
const token = z.string().trim().min(20).max(200);

// The box on the site: only the e-mail. Anyone can ask; nobody receives a
// newsletter before clicking the confirmation link (double opt-in).
export const subscribeSchema = z.object({
  body: z.object({
    email,
    // The trap for robots, like the contact form: hidden on the page.
    website: z.string().max(500).optional(),
  }),
});

export const tokenBodySchema = z.object({
  body: z.object({ token }),
});

// One-click unsubscribe from the mail app (RFC 8058): the token comes in the
// address, the body is "List-Unsubscribe=One-Click".
export const tokenQuerySchema = z.object({
  query: z.object({ token }),
});

// "Minha conta": the reader's switch.
export const setMineSchema = z.object({
  body: z.object({ subscribed: z.boolean() }),
});

// The admin's newsletter: a subject, an optional note at the top, and the
// stories, in the order they were picked.
export const issueSchema = z.object({
  body: z.object({
    subject: z.string().trim().min(3, 'Write a subject.').max(150),
    intro: z
      .string()
      .trim()
      .max(2000)
      .nullish()
      .transform((text) => text || null),
    postIds: z.array(z.uuid()).min(1, 'Pick at least one story.').max(10, 'At most 10 stories.'),
  }),
});

export const issueIdSchema = z.object({
  params: z.object({ id: z.uuid() }),
});

export type IssueInput = z.infer<typeof issueSchema>['body'];
