import { z } from 'zod';
import { Role } from '../../shared/types/enums';

const roleEnum = z.enum([Role.ADMIN, Role.COLUMNIST, Role.READER]);

export const listUsersSchema = z.object({
  query: z.object({
    role: roleEnum.optional(),
    search: z.string().trim().min(1).max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export const userIdParamSchema = z.object({
  params: z.object({ id: z.uuid() }),
});

export const promoteUserSchema = z.object({
  params: z.object({ id: z.uuid() }),
  body: z.object({
    // Byline, which may differ from the account name.
    name: z.string().trim().min(2).max(120),
    slug: z.string().trim().max(140).optional(),
    bio: z.string().trim().max(600).nullish(),
    photoId: z.uuid().nullish(), // an image uploaded through /api/media
    columnTitle: z.string().trim().max(120).nullish(),
  }),
});

export const updateUserSchema = z.object({
  params: z.object({ id: z.uuid() }),
  body: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      role: roleEnum.optional(),
      active: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'Provide at least one field to update.',
    }),
});

export const resetPasswordSchema = z.object({
  params: z.object({ id: z.uuid() }),
  body: z.object({
    newPassword: z.string().min(8).max(200),
  }),
});
