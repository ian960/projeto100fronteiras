import { prisma } from '../../config/prisma';
import type { PushNotificationSummary } from './push.types';

// After this many refusals in a row that were not a clear "gone", the
// subscription is dropped too: a browser that has not taken a message in
// weeks is not coming back.
export const MAX_FAILURES = 5;

const targetSelect = { id: true, endpoint: true, p256dh: true, auth: true, failures: true } as const;

export class PushRepository {
  // ── subscriptions ───────────────────────────────────────────────────────

  // The same browser subscribing again (new keys after the browser renewed
  // them) updates its row.
  async save(input: { endpoint: string; p256dh: string; auth: string }): Promise<void> {
    await prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: input,
      update: { p256dh: input.p256dh, auth: input.auth, failures: 0 },
    });
  }

  findByEndpoint(endpoint: string) {
    return prisma.pushSubscription.findUnique({ where: { endpoint }, select: targetSelect });
  }

  async deleteByEndpoint(endpoint: string): Promise<void> {
    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  }

  async deleteById(id: string): Promise<void> {
    await prisma.pushSubscription.deleteMany({ where: { id } });
  }

  count(): Promise<number> {
    return prisma.pushSubscription.count();
  }

  countUntil(until: Date): Promise<number> {
    return prisma.pushSubscription.count({ where: { createdAt: { lte: until } } });
  }

  // The next ones for a notification: in id order after the cursor, and only
  // browsers that had subscribed when it was created.
  nextBatch(after: string | null, until: Date, limit: number) {
    return prisma.pushSubscription.findMany({
      where: { createdAt: { lte: until }, ...(after ? { id: { gt: after } } : {}) },
      orderBy: { id: 'asc' },
      take: limit,
      select: targetSelect,
    });
  }

  async markSent(ids: string[], now: Date): Promise<void> {
    if (ids.length === 0) return;
    await prisma.pushSubscription.updateMany({ where: { id: { in: ids } }, data: { failures: 0, lastSentAt: now } });
  }

  // One more refusal; at MAX_FAILURES the row goes. Returns how many went.
  async markFailed(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    await prisma.pushSubscription.updateMany({ where: { id: { in: ids } }, data: { failures: { increment: 1 } } });
    const dropped = await prisma.pushSubscription.deleteMany({ where: { id: { in: ids }, failures: { gte: MAX_FAILURES } } });
    return dropped.count;
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await prisma.pushSubscription.deleteMany({ where: { id: { in: ids } } });
  }

  // ── notifications ───────────────────────────────────────────────────────

  async createNotification(data: {
    title: string;
    body: string;
    url: string;
    image: string | null;
    postId: string;
    createdById: string;
    now: Date;
  }): Promise<{ id: string; total: number }> {
    const total = await this.countUntil(data.now);
    const { now, ...rest } = data;
    const row = await prisma.pushNotification.create({
      data: { ...rest, total, createdAt: now },
      select: { id: true, total: true },
    });
    return row;
  }

  countCreatedSince(since: Date): Promise<number> {
    return prisma.pushNotification.count({ where: { createdAt: { gte: since } } });
  }

  findRecentForPost(postId: string, since: Date) {
    return prisma.pushNotification.findFirst({ where: { postId, createdAt: { gte: since } }, select: { id: true } });
  }

  // The oldest one still going out.
  nextSending() {
    return prisma.pushNotification.findFirst({
      where: { status: 'sending' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, title: true, body: true, url: true, image: true, postId: true, cursor: true, createdAt: true },
    });
  }

  async advance(id: string, data: { cursor: string; sent: number; failed: number; removed: number }): Promise<void> {
    await prisma.pushNotification.update({
      where: { id },
      data: {
        cursor: data.cursor,
        sent: { increment: data.sent },
        failed: { increment: data.failed },
        removed: { increment: data.removed },
      },
    });
  }

  async finish(id: string, now: Date): Promise<void> {
    await prisma.pushNotification.update({ where: { id }, data: { status: 'done', finishedAt: now } });
  }

  async list(limit: number): Promise<PushNotificationSummary[]> {
    const rows = await prisma.pushNotification.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        body: true,
        url: true,
        status: true,
        total: true,
        sent: true,
        failed: true,
        removed: true,
        createdAt: true,
        finishedAt: true,
        post: { select: { title: true } },
        createdBy: { select: { name: true } },
      },
    });
    return rows.map(({ post, createdBy, ...row }) => ({
      ...row,
      postTitle: post?.title ?? null,
      createdBy: createdBy?.name ?? null,
    }));
  }
}

export const pushRepository = new PushRepository();
