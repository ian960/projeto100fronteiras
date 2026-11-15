import webpush from 'web-push';
import { pushConfig } from '../../config/env';
import type { PushPayload } from './push.types';

export type Target = { endpoint: string; p256dh: string; auth: string };

// What happened to one message.
//   sent  the push service took it
//   gone  the browser unsubscribed, was uninstalled or blocked the site
//         (404/410): the subscription must be deleted
//   error anything else (the service is down, a timeout): try next time
export type SendResult = 'sent' | 'gone' | 'error';

// A news notification is worth little a day later: if the phone stays off
// longer than that, the push service drops it instead of delivering it late.
const TTL_SECONDS = 24 * 60 * 60;

// The real sender, with the web-push library. Kept apart (and replaceable)
// so the tests never reach Google or Apple.
export const pushSender = {
  async send(target: Target, payload: PushPayload): Promise<SendResult> {
    if (!pushConfig) return 'error';
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        {
          vapidDetails: pushConfig,
          TTL: TTL_SECONDS,
          urgency: 'high',
          // A newer message with the same topic replaces one still waiting
          // for the phone to come online.
          topic: payload.tag.replace(/[^A-Za-z0-9]/g, '').slice(-32),
          timeout: 10_000,
        },
      );
      return 'sent';
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      return status === 404 || status === 410 ? 'gone' : 'error';
    }
  },
};
