import { z } from 'zod';

// `role` is absent on purpose and must stay absent.
//
// Accepting it here would let anyone sign up with {"role":"admin"} and take
// over the portal. The database default (reader) is the second layer; this
// schema is the first.
export const registerSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.email().trim().toLowerCase(),
    password: z.string().min(8).max(200),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.email().trim().toLowerCase(),
    password: z.string().min(1).max(200),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(8).max(200),
  }),
});
