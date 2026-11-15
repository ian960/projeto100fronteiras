import { env, pushConfig } from '../../config/env';
import { NotFound, ServiceUnavailable, ValidationError } from '../../shared/errors/AppError';
import { logger } from '../../shared/utils/logger';
import { postsRepository } from '../posts/posts.repository';
import { pushRepository } from './push.repository';
import type { NotificationInput } from './push.schemas';
import { pushSender, type SendResult, type Target } from './push.sender';
import type { PushConfig, PushOverview, PushPayload } from './push.types';

const DAY_MS = 24 * 60 * 60 * 1000;
// Render's free plan has a tenth of a CPU: a few dozen at a time, ten in
// flight, is what it handles without slowing the site down.
const BATCH_SIZE = 50;
const CONCURRENCY = 10;

// How push notifications work, in one place:
//
// 1. Always the reader's own act. The site never asks for permission on its
//    own: only after a click on "Ativar notificações" (footer, end of the
//    article, Minha conta). The browser then gives an address at its push
//    service, saved here (POST /api/push/subscribe). "Desativar" deletes it.
// 2. The admin picks a story in the panel (Notificações) and sends. A
//    notification row is created and goes out in the background, in batches,
//    with a cursor saved after each one: a restart of the server continues
//    where it stopped (server.ts looks every 10 minutes).
// 3. The push service answers 404/410 for a browser that unsubscribed,
//    uninstalled or blocked the site: that row is deleted on the spot. Other
//    refusals are counted, and after MAX_FAILURES in a row it goes too.
// 4. At most PUSH_DAILY_LIMIT notifications in any 24 hours, and one per
//    story a day, so readers are not worn out (and do not block the site).
export class PushService {
  dailyLimit: number;
  private running: Promise<void> | null = null;

  constructor(dailyLimit: number) {
    this.dailyLimit = dailyLimit;
  }

  config(): PushConfig {
    return { enabled: pushConfig !== null, publicKey: pushConfig?.publicKey ?? null };
  }

  // ── readers ─────────────────────────────────────────────────────────────

  async subscribe(input: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void> {
    if (!pushConfig) throw new ServiceUnavailable('Push notifications are not configured on this server.');
    await pushRepository.save({ endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth });
  }

  // "Desativar". Unknown address: nothing to do, same answer.
  async unsubscribe(endpoint: string): Promise<void> {
    await pushRepository.deleteByEndpoint(endpoint);
  }

  // ── admin ───────────────────────────────────────────────────────────────

  async overview(now = new Date()): Promise<PushOverview> {
    const [subscriptions, sentLast24h, notifications] = await Promise.all([
      pushRepository.count(),
      pushRepository.countCreatedSince(new Date(now.getTime() - DAY_MS)),
      pushRepository.list(20),
    ]);
    return {
      configured: pushConfig !== null,
      subscriptions,
      dailyLimit: this.dailyLimit,
      sentLast24h,
      sending: this.running !== null,
      notifications,
    };
  }

  async send(adminId: string, input: NotificationInput, now = new Date()): Promise<{ id: string; total: number }> {
    if (!pushConfig) throw new ServiceUnavailable('Push notifications are not configured on this server.');

    const since = new Date(now.getTime() - DAY_MS);
    if ((await pushRepository.countCreatedSince(since)) >= this.dailyLimit) {
      throw new ValidationError(`The limit of ${this.dailyLimit} notifications in 24 hours has been reached.`);
    }
    if (await pushRepository.findRecentForPost(input.postId, since)) {
      throw new ValidationError('This story already had a notification in the last 24 hours.');
    }
    if ((await pushRepository.count()) === 0) throw new ValidationError('Nobody has turned on notifications yet.');

    const payload = await this.build(input);
    const notification = await pushRepository.createNotification({
      title: payload.title,
      body: payload.body,
      url: payload.url,
      image: payload.image,
      postId: input.postId,
      createdById: adminId,
      now,
    });

    this.kick();
    return notification;
  }

  // "Testar neste navegador": only to the admin's own browser, which must
  // have turned notifications on. Does not count toward the daily limit.
  async test(input: NotificationInput & { endpoint: string }): Promise<void> {
    if (!pushConfig) throw new ServiceUnavailable('Push notifications are not configured on this server.');
    const target = await pushRepository.findByEndpoint(input.endpoint);
    if (!target) throw new ValidationError('Turn on notifications in this browser first.');

    const payload = await this.build(input);
    const result = await pushSender.send(target, { ...payload, tag: `teste-${payload.tag}` });
    if (result === 'gone') {
      await pushRepository.deleteById(target.id);
      throw new ValidationError('This browser is no longer subscribed. Turn notifications on again.');
    }
    if (result === 'error') throw new ServiceUnavailable('The push service did not accept the test. Try again in a minute.');
  }

  private async build(input: NotificationInput): Promise<PushPayload> {
    const [post] = await postsRepository.findPublishedByIds([input.postId]);
    if (!post) throw new NotFound('Story not found or not published.');

    const path = `/${post.type === 'column' ? 'coluna' : 'noticia'}/${post.slug}`;
    return {
      title: input.title,
      body: input.body,
      // A path, not a full address: the service worker opens it on the site
      // the reader subscribed on.
      url: `${path}?utm_source=push&utm_medium=notificacao`,
      image: post.cover?.shareUrl ?? null,
      tag: `post-${post.id}`,
    };
  }

  // ── the queue ───────────────────────────────────────────────────────────

  // Starts a round in the background, unless one is already going.
  kick(): void {
    if (this.running || !pushConfig) return;
    this.running = this.run()
      .catch((err) => logger.error('Push queue failed', { err }))
      .finally(() => {
        this.running = null;
      });
  }

  // For the tests, and for a clean shutdown.
  async whenIdle(): Promise<void> {
    await this.running;
  }

  private async run(): Promise<void> {
    for (;;) {
      const notification = await pushRepository.nextSending();
      if (!notification) return;

      const payload: PushPayload = {
        title: notification.title,
        body: notification.body,
        url: notification.url,
        image: notification.image,
        tag: `post-${notification.postId ?? notification.id}`,
      };

      let cursor = notification.cursor;
      for (;;) {
        const batch = await pushRepository.nextBatch(cursor, notification.createdAt, BATCH_SIZE);
        if (batch.length === 0) {
          await pushRepository.finish(notification.id, new Date());
          break;
        }

        const results = await sendAll(batch, payload);
        const ids = (kind: SendResult) => batch.filter((_, i) => results[i] === kind).map((target) => target.id);
        const sent = ids('sent');
        const gone = ids('gone');
        const failed = ids('error');

        await pushRepository.markSent(sent, new Date());
        await pushRepository.deleteMany(gone);
        const dropped = await pushRepository.markFailed(failed);

        cursor = batch.at(-1)!.id;
        await pushRepository.advance(notification.id, {
          cursor,
          sent: sent.length,
          failed: failed.length,
          removed: gone.length + dropped,
        });
      }
    }
  }
}

// CONCURRENCY at a time, results in the same order as the targets.
async function sendAll(targets: Target[], payload: PushPayload): Promise<SendResult[]> {
  const results: SendResult[] = [];
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const chunk = targets.slice(i, i + CONCURRENCY);
    results.push(...(await Promise.all(chunk.map((target) => pushSender.send(target, payload)))));
  }
  return results;
}

export const pushService = new PushService(env.PUSH_DAILY_LIMIT);
