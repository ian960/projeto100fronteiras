import { randomBytes } from 'node:crypto';
import { prisma } from '../../config/prisma';
import type { IssueSummary, NewsletterPostOption } from './newsletter.types';

export const newToken = () => randomBytes(32).toString('base64url');

const subscriberSelect = {
  id: true,
  email: true,
  status: true,
  source: true,
  unsubscribeToken: true,
  confirmSentAt: true,
  confirmedAt: true,
} as const;

export class NewsletterRepository {
  // ── subscribers ─────────────────────────────────────────────────────────

  // An account's address, and whether Google verified it.
  findAccount(userId: string) {
    return prisma.user.findUnique({ where: { id: userId }, select: { email: true, googleId: true } });
  }

  findByEmail(email: string) {
    return prisma.newsletterSubscriber.findUnique({ where: { email }, select: subscriberSelect });
  }

  findByUnsubscribeToken(token: string) {
    return prisma.newsletterSubscriber.findUnique({ where: { unsubscribeToken: token }, select: subscriberSelect });
  }

  findByConfirmHash(hash: string) {
    return prisma.newsletterSubscriber.findUnique({ where: { confirmTokenHash: hash }, select: subscriberSelect });
  }

  // Asked to subscribe, not confirmed yet. Someone who had left comes back
  // here too: a new opt-in, a new confirmation.
  async savePending(email: string, source: string, confirmTokenHash: string, now: Date) {
    return prisma.newsletterSubscriber.upsert({
      where: { email },
      create: { email, source, status: 'pending', unsubscribeToken: newToken(), confirmTokenHash, confirmSentAt: now },
      update: { source, status: 'pending', confirmTokenHash, confirmSentAt: now, unsubscribedAt: null },
      select: subscriberSelect,
    });
  }

  // Straight to active: an account whose e-mail Google already verified.
  async saveActive(email: string, source: string, now: Date) {
    return prisma.newsletterSubscriber.upsert({
      where: { email },
      create: { email, source, status: 'active', unsubscribeToken: newToken(), confirmedAt: now },
      update: { source, status: 'active', confirmedAt: now, unsubscribedAt: null },
      select: subscriberSelect,
    });
  }

  activate(id: string, now: Date) {
    return prisma.newsletterSubscriber.update({
      where: { id },
      data: { status: 'active', confirmedAt: now },
      select: subscriberSelect,
    });
  }

  // Leaving also takes the reader out of anything still waiting to be sent.
  async unsubscribe(id: string, now: Date): Promise<void> {
    await prisma.$transaction([
      prisma.newsletterSubscriber.update({
        where: { id },
        data: { status: 'unsubscribed', unsubscribedAt: now, confirmTokenHash: null },
      }),
      prisma.newsletterDelivery.updateMany({
        where: { subscriberId: id, status: 'pending' },
        data: { status: 'cancelled' },
      }),
    ]);
  }

  // Account deleted: nothing about the address stays.
  async deleteByEmail(email: string): Promise<void> {
    await prisma.newsletterSubscriber.deleteMany({ where: { email } });
  }

  async countByStatus(): Promise<{ active: number; pending: number; unsubscribed: number }> {
    const rows = await prisma.newsletterSubscriber.groupBy({ by: ['status'], _count: { _all: true } });
    const count = (status: string) => rows.find((row) => row.status === status)?._count._all ?? 0;
    return { active: count('active'), pending: count('pending'), unsubscribed: count('unsubscribed') };
  }

  // ── issues and the queue ────────────────────────────────────────────────

  // The issue and one delivery per active subscriber, together: a crash in
  // between cannot leave an issue that reaches nobody, or half the list.
  async createIssue(data: { subject: string; intro: string | null; html: string; text: string; createdById: string }) {
    return prisma.$transaction(async (tx) => {
      const issue = await tx.newsletterIssue.create({ data, select: { id: true } });
      const subscribers = await tx.newsletterSubscriber.findMany({ where: { status: 'active' }, select: { id: true } });
      await tx.newsletterDelivery.createMany({
        data: subscribers.map((subscriber) => ({ issueId: issue.id, subscriberId: subscriber.id })),
      });
      return { id: issue.id, recipients: subscribers.length };
    });
  }

  issueExists(id: string) {
    return prisma.newsletterIssue.findUnique({ where: { id }, select: { id: true } });
  }

  async cancelIssue(id: string): Promise<number> {
    const result = await prisma.newsletterDelivery.updateMany({
      where: { issueId: id, status: 'pending' },
      data: { status: 'cancelled' },
    });
    return result.count;
  }

  async listIssues(limit: number): Promise<IssueSummary[]> {
    const issues = await prisma.newsletterIssue.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, subject: true, createdAt: true, createdBy: { select: { name: true } } },
    });
    if (issues.length === 0) return [];

    const counts = await prisma.newsletterDelivery.groupBy({
      by: ['issueId', 'status'],
      where: { issueId: { in: issues.map((issue) => issue.id) } },
      _count: { _all: true },
    });

    return issues.map((issue) => {
      const of = (status: string) =>
        counts.find((row) => row.issueId === issue.id && row.status === status)?._count._all ?? 0;
      const summary = { sent: of('sent'), pending: of('pending'), failed: of('failed'), cancelled: of('cancelled') };
      return {
        id: issue.id,
        subject: issue.subject,
        createdAt: issue.createdAt,
        createdBy: issue.createdBy?.name ?? null,
        total: summary.sent + summary.pending + summary.failed + summary.cancelled,
        ...summary,
      };
    });
  }

  countSentSince(since: Date): Promise<number> {
    return prisma.newsletterDelivery.count({ where: { status: 'sent', sentAt: { gte: since } } });
  }

  countQueued(): Promise<number> {
    return prisma.newsletterDelivery.count({ where: { status: 'pending' } });
  }

  // The next ones to go, oldest issue first.
  nextPending(limit: number) {
    return prisma.newsletterDelivery.findMany({
      where: { status: 'pending' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: {
        id: true,
        attempts: true,
        subscriber: { select: { email: true, status: true, unsubscribeToken: true } },
        issue: { select: { subject: true, html: true, text: true } },
      },
    });
  }

  async markSent(id: string, now: Date): Promise<void> {
    await prisma.newsletterDelivery.update({
      where: { id },
      data: { status: 'sent', sentAt: now, attempts: { increment: 1 } },
    });
  }

  // Refused by the mail service: tried again on the next round, up to three
  // times in all.
  async markFailedAttempt(id: string, attempts: number): Promise<void> {
    await prisma.newsletterDelivery.update({
      where: { id },
      data: { attempts, ...(attempts >= 3 ? { status: 'failed' } : {}) },
    });
  }

  async markCancelled(id: string): Promise<void> {
    await prisma.newsletterDelivery.update({ where: { id }, data: { status: 'cancelled' } });
  }

  // ── stories ─────────────────────────────────────────────────────────────

  // The latest published, for the admin to pick from.
  async recentPosts(limit: number): Promise<NewsletterPostOption[]> {
    const rows = await prisma.post.findMany({
      where: { status: 'published' },
      orderBy: { publishedAt: 'desc' },
      take: limit,
      select: { id: true, type: true, title: true, slug: true, publishedAt: true, category: { select: { name: true } } },
    });
    return rows.map(({ category, ...row }) => ({ ...row, category: category?.name ?? null }));
  }
}

export const newsletterRepository = new NewsletterRepository();
