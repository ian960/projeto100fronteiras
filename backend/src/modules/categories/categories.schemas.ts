import { z } from 'zod';

export const createCategorySchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(60),
    slug: z.string().trim().max(80).optional(),
    sortOrder: z.coerce.number().int().min(0).optional(),
  }),
});

export const updateCategorySchema = z.object({
  params: z.object({ id: z.uuid() }),
  body: z
    .object({
      name: z.string().trim().min(2).max(60).optional(),
      slug: z.string().trim().max(80).optional(),
      sortOrder: z.coerce.number().int().min(0).optional(),
      active: z.boolean().optional(),
    })
    // Without this, PATCH with an empty body would run an UPDATE that changes
    // nothing and return 200 as if it had worked.
    .refine((data) => Object.keys(data).length > 0, {
      message: 'Provide at least one field to update.',
    }),
});

export const categoryIdParamSchema = z.object({
  params: z.object({ id: z.uuid() }),
});

export const categorySlugParamSchema = z.object({
  params: z.object({ slug: z.string().trim().min(1).max(80) }),
});
