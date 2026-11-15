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
    // The unticked box "Quero receber a newsletter". Ticked, a confirmation
    // link goes to the address; nothing is sent before it is clicked.
    newsletter: z.boolean().optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.email().trim().toLowerCase(),
    password: z.string().min(1).max(200),
  }),
});

// "Minha conta". Like register, `role` is absent on purpose: a reader must not
// be able to promote themselves by editing their own account. An empty bio
// clears it; null removes the photo.
export const updateMeSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      bio: z
        .string()
        .trim()
        .max(600)
        .nullish()
        .transform((bio) => (bio === undefined ? undefined : bio || null)),
      avatarId: z.uuid().nullish(),
    })
    .refine((data) => Object.values(data).some((value) => value !== undefined), {
      message: 'Provide at least one field to update.',
    }),
});

// Deleting your own account asks for the password again: a session left open
// on a shared computer must not be enough to erase someone. Optional only
// because an account made with Google has none (AuthService.confirmDeletion).
export const deleteMeSchema = z.object({
  body: z
    .object({
      password: z.string().min(1).max(200).optional(),
    })
    .default({}),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.email().trim().toLowerCase(),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().trim().min(20).max(200),
    newPassword: z.string().min(8).max(200),
  }),
});

// "Entrar com Google": where to go after logging in. Only paths on this site,
// so the button cannot be used to bounce someone to another website.
export const googleStartSchema = z.object({
  query: z.object({
    proxima: z
      .string()
      .max(500)
      .regex(/^\/(?![/\\])/)
      .optional()
      .catch(undefined),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    // Optional only for an account with no password yet (made with Google).
    currentPassword: z.string().min(1).max(200).optional(),
    newPassword: z.string().min(8).max(200),
  }),
});
