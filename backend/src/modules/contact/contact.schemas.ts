import { z } from 'zod';

// What the reader is writing about. Shown in the e-mail's subject, so the
// newsroom can sort the inbox at a glance.
export const CONTACT_SUBJECTS = {
  pauta: 'Sugestão de pauta',
  correcao: 'Correção ou direito de resposta',
  anuncio: 'Anunciar no portal',
  privacidade: 'Privacidade e dados pessoais',
  outro: 'Outro assunto',
} as const;

export type ContactSubject = keyof typeof CONTACT_SUBJECTS;

// Plain text only. Control characters other than line breaks and tabs go.
const clean = (text: string) => text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();

export const contactSchema = z.object({
  body: z.object({
    // One line: a line break in a name would end up in the e-mail's headers.
    name: z
      .string()
      .transform((text) => clean(text).replace(/\s+/g, ' '))
      .pipe(z.string().min(2, 'Write your name.').max(100)),
    email: z.string().trim().toLowerCase().pipe(z.email().max(200)),
    subject: z.enum(Object.keys(CONTACT_SUBJECTS) as [ContactSubject, ...ContactSubject[]]).default('outro'),
    message: z.string().transform(clean).pipe(z.string().min(10, 'Write at least a few words.').max(5000)),
    // The trap for robots: a field people never see (it is hidden on the
    // page), which form-filling scripts fill anyway.
    website: z.string().max(500).optional(),
  }),
});

export type ContactInput = z.infer<typeof contactSchema>['body'];
