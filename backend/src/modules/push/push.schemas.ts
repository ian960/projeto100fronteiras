import { z } from 'zod';

// The push services the browsers use. The API sends a request to whatever
// address a subscription carries, so only these are accepted: anything else
// (an address inside Render's network, someone's own server) would turn the
// API into a messenger for whoever subscribed it.
//   Chrome, Android, Opera, Samsung   fcm.googleapis.com
//   Firefox                           updates.push.services.mozilla.com
//   Safari (Mac, iPhone, iPad)        web.push.apple.com
//   Edge                              *.notify.windows.com
const PUSH_SERVICES = ['googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];

export function isPushServiceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.port !== '') return false;
    const host = url.hostname.toLowerCase();
    return PUSH_SERVICES.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

const endpoint = z
  .string()
  .trim()
  .max(1000)
  .refine(isPushServiceUrl, 'This is not the address of a browser push service.');

const base64url = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+=*$/, 'Invalid key.');

// What PushSubscription.toJSON() gives in the browser.
export const subscribeSchema = z.object({
  body: z.object({
    endpoint,
    keys: z.object({
      // A P-256 public key: 65 bytes, 87 characters.
      p256dh: base64url(80, 100),
      // 16 random bytes, 22 characters.
      auth: base64url(16, 30),
    }),
  }),
});

export const unsubscribeSchema = z.object({
  body: z.object({ endpoint }),
});

// The admin's notification: one story, with the words shown on the phone.
// Short on purpose: Android cuts the title at about 50 characters and the
// text at two lines.
export const notificationSchema = z.object({
  body: z.object({
    postId: z.uuid(),
    title: z.string().trim().min(3, 'Write a title.').max(80),
    body: z.string().trim().max(180).default(''),
  }),
});

// "Testar neste navegador": the same, to the admin's own browser only.
export const testSchema = z.object({
  body: notificationSchema.shape.body.extend({ endpoint }),
});

export type NotificationInput = z.infer<typeof notificationSchema>['body'];
