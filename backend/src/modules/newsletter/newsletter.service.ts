import { createHash } from 'node:crypto';
import { env } from '../../config/env';
import { NotFound, ValidationError } from '../../shared/errors/AppError';
import { sendMail } from '../../shared/mail/mailer';
import { logger } from '../../shared/utils/logger';
import { postsRepository } from '../posts/posts.repository';
import { confirmationMail, personalize, renderIssue } from './newsletter.email';
import { newToken, newsletterRepository } from './newsletter.repository';
import type { IssueInput } from './newsletter.schemas';
import type { NewsletterMineStatus, NewsletterOverview, NewsletterPostOption } from './newsletter.types';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

// A confirmation link is good for a week.
const CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// At most one confirmation e-mail per address in this window, however many
// times the form is sent: nobody can use the portal to flood an inbox.
const CONFIRM_RESEND_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// How often the server looks at the queue on its own (see server.ts).
export const QUEUE_INTERVAL_MS = 10 * 60 * 1000;
// Three refusals in a row: the mail service is down or its daily limit is
// used up. Stop, and try again on the next round.
const MAX_FAILURES_IN_A_ROW = 3;

// How the newsletter works, in one place:
//
// 1. Subscribing is always the reader's own act. The box on the site sends a
//    confirmation link (double opt-in); "Minha conta" too, unless Google has
//    already verified the account's e-mail.
// 2. The admin picks stories in the panel and presses "Enviar". The e-mail is
//    built once, and one delivery per active subscriber goes into a queue in
//    the database.
// 3. The queue goes out in the background, never more than
//    NEWSLETTER_DAILY_LIMIT e-mails in any 24 hours (Brevo's free plan sends
//    300 a day in all). Whatever does not fit waits, and the server picks it
//    up again every 10 minutes (server.ts), so a list larger than the limit
//    finishes over the following days with nobody pressing anything.
//    Render's free plan has no reliable scheduler, but the site's Worker
//    keeps this server awake (wrangler.jsonc), so a timer here is enough.
// 4. Every e-mail carries the reader's own unsubscribe link, which works
//    without logging in, plus the List-Unsubscribe headers mail apps use.
export class NewsletterService {
  dailyLimit = env.NEWSLETTER_DAILY_LIMIT;
  private running: Promise<void> | null = null;

  // ── readers ─────────────────────────────────────────────────────────────

  // The box on the site. Always the same answer, subscribed or not, so it
  // cannot be used to find out who reads the portal.
  async subscribe(email: string, source: string, now = new Date()): Promise<void> {
    const current = await newsletterRepository.findByEmail(email);
    if (current?.status === 'active') return;
    if (current?.status === 'pending' && current.confirmSentAt && now.getTime() - current.confirmSentAt.getTime() < CONFIRM_RESEND_MS) {
      return;
    }

    const token = newToken();
    await newsletterRepository.savePending(email, source, sha256(token), now);
    await sendMail(confirmationMail(email, token));
  }

  // The link in the confirmation e-mail (through /newsletter/confirmar).
  // Opening it twice is fine; an old or unknown link is not.
  async confirm(token: string, now = new Date()): Promise<{ email: string }> {
    const subscriber = await newsletterRepository.findByConfirmHash(sha256(token));
    const invalid = new ValidationError('This link is invalid or has expired. Subscribe again.');
    if (!subscriber || subscriber.status === 'unsubscribed') throw invalid;
    if (subscriber.status === 'active') return { email: subscriber.email };
    if (!subscriber.confirmSentAt || now.getTime() - subscriber.confirmSentAt.getTime() > CONFIRM_TTL_MS) throw invalid;

    await newsletterRepository.activate(subscriber.id, now);
    return { email: subscriber.email };
  }

  // The link at the bottom of every newsletter, and the mail app's button.
  async unsubscribe(token: string, now = new Date()): Promise<{ email: string }> {
    const subscriber = await newsletterRepository.findByUnsubscribeToken(token);
    if (!subscriber) throw new NotFound('This link is invalid.');
    if (subscriber.status !== 'unsubscribed') await newsletterRepository.unsubscribe(subscriber.id, now);
    return { email: subscriber.email };
  }

  // "Minha conta".
  async getMine(userId: string): Promise<NewsletterMineStatus> {
    const user = await this.account(userId);
    const subscriber = await newsletterRepository.findByEmail(user.email);
    return subscriber?.status ?? 'none';
  }

  async setMine(userId: string, subscribed: boolean, now = new Date()): Promise<NewsletterMineStatus> {
    const user = await this.account(userId);
    const current = await newsletterRepository.findByEmail(user.email);

    if (!subscribed) {
      if (current && current.status !== 'unsubscribed') await newsletterRepository.unsubscribe(current.id, now);
      return current ? 'unsubscribed' : 'none';
    }

    if (current?.status === 'active') return 'active';

    // Google checked that this person owns the address: no need to ask again.
    if (user.googleId) {
      await newsletterRepository.saveActive(user.email, 'conta', now);
      return 'active';
    }

    // Anyone can type any address when signing up with a password, so the
    // account's e-mail is confirmed like the site's box.
    await this.subscribe(user.email, 'conta', now);
    return 'pending';
  }

  // Account deleted: the address goes too (privacy policy).
  async forget(email: string): Promise<void> {
    await newsletterRepository.deleteByEmail(email);
  }

  private async account(userId: string) {
    const user = await newsletterRepository.findAccount(userId);
    if (!user) throw new NotFound('User not found.');
    return user;
  }

  // ── admin ───────────────────────────────────────────────────────────────

  async overview(now = new Date()): Promise<NewsletterOverview> {
    const [subscribers, sentLast24h, queued, issues] = await Promise.all([
      newsletterRepository.countByStatus(),
      newsletterRepository.countSentSince(new Date(now.getTime() - DAY_MS)),
      newsletterRepository.countQueued(),
      newsletterRepository.listIssues(20),
    ]);
    return { subscribers, dailyLimit: this.dailyLimit, sentLast24h, queued, sending: this.running !== null, issues };
  }

  recentPosts(): Promise<NewsletterPostOption[]> {
    return newsletterRepository.recentPosts(40);
  }

  // The e-mail as it will look. The panel shows it before sending.
  async preview(input: IssueInput): Promise<{ subject: string; html: string }> {
    const { html } = await this.build(input);
    return { subject: input.subject, html };
  }

  // A copy to the admin's own inbox, to check it in a real e-mail app.
  async sendTest(adminId: string, input: IssueInput): Promise<{ email: string }> {
    const admin = await this.account(adminId);
    const built = await this.build(input);
    const sent = await sendMail(personalize({ subject: `[Teste] ${input.subject}`, ...built }, admin.email, 'teste'));
    if (!sent) throw new ValidationError('The mail service refused the test. Check MAIL_PROVIDER and the logs.');
    return { email: admin.email };
  }

  async createIssue(adminId: string, input: IssueInput): Promise<{ id: string; recipients: number }> {
    const { active } = await newsletterRepository.countByStatus();
    if (active === 0) throw new ValidationError('Nobody has subscribed yet.');

    const built = await this.build(input);
    const issue = await newsletterRepository.createIssue({
      subject: input.subject,
      intro: input.intro,
      html: built.html,
      text: built.text,
      createdById: adminId,
    });

    this.kick();
    return issue;
  }

  async cancelIssue(id: string): Promise<{ cancelled: number }> {
    if (!(await newsletterRepository.issueExists(id))) throw new NotFound('Newsletter not found.');
    return { cancelled: await newsletterRepository.cancelIssue(id) };
  }

  private async build(input: IssueInput) {
    const found = await postsRepository.findPublishedByIds(input.postIds);
    // In the order the admin picked them. Unpublished meanwhile: left out.
    const posts = input.postIds.flatMap((id) => found.filter((post) => post.id === id));
    if (posts.length === 0) {
      throw new ValidationError('None of these stories is published.', { postIds: 'Pick published stories.' });
    }
    return renderIssue({ subject: input.subject, intro: input.intro, posts });
  }

  // ── the queue ───────────────────────────────────────────────────────────

  // Starts a round in the background, unless one is already going.
  kick(): void {
    if (this.running) return;
    this.running = this.runQueue()
      .catch((err) => logger.error('Newsletter queue failed', { err }))
      .finally(() => {
        this.running = null;
      });
  }

  // For the tests, and for a clean shutdown.
  async whenIdle(): Promise<void> {
    await this.running;
  }

  private async runQueue(): Promise<void> {
    let failuresInARow = 0;

    for (;;) {
      const now = new Date();
      const budget = this.dailyLimit - (await newsletterRepository.countSentSince(new Date(now.getTime() - DAY_MS)));
      if (budget <= 0) return;

      const batch = await newsletterRepository.nextPending(Math.min(budget, 25));
      if (batch.length === 0) return;

      for (const delivery of batch) {
        // Left after the issue was created.
        if (delivery.subscriber.status !== 'active') {
          await newsletterRepository.markCancelled(delivery.id);
          continue;
        }

        const ok = await sendMail(personalize(delivery.issue, delivery.subscriber.email, delivery.subscriber.unsubscribeToken));
        if (ok) {
          failuresInARow = 0;
          await newsletterRepository.markSent(delivery.id, new Date());
          continue;
        }

        await newsletterRepository.markFailedAttempt(delivery.id, delivery.attempts + 1);
        failuresInARow += 1;
        if (failuresInARow >= MAX_FAILURES_IN_A_ROW) {
          logger.warn('Newsletter: the mail service refused three in a row. Trying again on the next round.');
          return;
        }
      }
    }
  }
}

export const newsletterService = new NewsletterService();
