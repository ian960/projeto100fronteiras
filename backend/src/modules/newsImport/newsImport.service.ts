import { Conflict, NotFound, ValidationError } from '../../shared/errors/AppError';
import { logger } from '../../shared/utils/logger';
import { PostType, type Role } from '../../shared/types/enums';
import { isMediaConfigured } from '../../config/cloudinary';
import { categoriesRepository } from '../categories/categories.repository';
import { mediaService } from '../media/media.service';
import { postsService } from '../posts/posts.service';
import type { SessionUser } from '../auth/auth.types';
import { parseFeed, shorten, stripTags, type FeedItem } from './newsImport.feed';
import { newsImportRepository, type NewsSourceData } from './newsImport.repository';
import type { IImportOrigin, IImportedItem, INewsSource, ImportRunResult } from './newsImport.types';

// How the news import works, in one place:
//
// 1. The admin registers sources in the panel (Importar notícias): a name,
//    the address of its RSS feed, a category and whether the whole text may
//    be copied. Only sources whose license allows republishing (Agência
//    Brasil, Agência Senado, gov.br…) get the whole text. Any other gets a
//    summary and a link to the original, which is all a headline aggregator
//    may take.
// 2. Every NEWS_IMPORT_INTERVAL_MINUTES the server reads every active feed
//    (server.ts; the Worker keeps this server awake, like the newsletter
//    queue). The admin can also press "Buscar agora".
// 3. Each new item becomes a DRAFT news post: "Fonte: <name>" with the link,
//    signed by the reporter the feed names (full text only). The source's
//    photo, when the feed has one, is copied to Cloudinary and becomes the
//    cover. Nothing is published by the robot: the admin reviews and
//    publishes. If the photo could not be copied, the editor offers it again.
// 4. Every item seen is remembered, so nothing comes in twice, not even after
//    the admin deletes the draft.

// Older items are ignored: the import is for what is news today.
const MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;
// At most this many drafts per source in one run, so a feed that suddenly
// lists 100 items does not bury the panel.
const MAX_PER_RUN = 10;
// The first run of a new source brings only its latest few; the rest are
// marked as seen.
const MAX_FIRST_RUN = 3;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_FEED_BYTES = 3 * 1024 * 1024;
const EXCERPT_MAX = 300;

export type FeedFetcher = (url: string) => Promise<string>;

// Reads a feed over HTTP. Swapped in the tests (setFetcher).
export const fetchFeedOverHttp: FeedFetcher = async (url) => {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Portal100FronteirasBot/1.0; leitor de RSS)',
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5',
    },
  });
  if (!response.ok) throw new Error(`The feed answered HTTP ${response.status}.`);
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_FEED_BYTES) throw new Error('The feed is too large.');
  const body = await response.text();
  if (body.length > MAX_FEED_BYTES) throw new Error('The feed is too large.');
  return body;
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// The draft's text: the whole story when the source allows it, otherwise the
// summary and a link to read it at the source.
export function draftContent(item: FeedItem, source: Pick<INewsSource, 'name' | 'fullText'>, excerpt: string): string {
  if (source.fullText) {
    const full = item.contentHtml || item.summaryHtml;
    if (stripTags(full)) return full;
  }
  const parts = excerpt ? [`<p>${escapeHtml(excerpt)}</p>`] : [];
  if (item.link) {
    parts.push(
      `<p>Leia a matéria completa em <a href="${escapeHtml(item.link)}" target="_blank">${escapeHtml(source.name)}</a>.</p>`,
    );
  }
  return parts.join('');
}

export class NewsImportService {
  private fetcher: FeedFetcher = fetchFeedOverHttp;
  private running: Promise<ImportRunResult[]> | null = null;

  setFetcher(fetcher: FeedFetcher): void {
    this.fetcher = fetcher;
  }

  // ── sources (panel) ───────────────────────────────────────────────────────

  listSources(): Promise<INewsSource[]> {
    return newsImportRepository.listSources();
  }

  async createSource(input: NewsSourceData): Promise<INewsSource> {
    await this.assertCategory(input.categoryId);
    if (await newsImportRepository.findSourceByFeedUrl(input.feedUrl)) {
      throw new Conflict('This feed is already registered.');
    }
    return newsImportRepository.createSource(input);
  }

  async updateSource(id: string, input: Partial<NewsSourceData>): Promise<INewsSource> {
    await this.loadSource(id);
    if (input.categoryId !== undefined) await this.assertCategory(input.categoryId);
    if (input.feedUrl !== undefined) {
      const other = await newsImportRepository.findSourceByFeedUrl(input.feedUrl);
      if (other && other.id !== id) throw new Conflict('This feed is already registered.');
    }
    return newsImportRepository.updateSource(id, input);
  }

  // The drafts already imported stay; only the source and its memory go.
  async removeSource(id: string): Promise<void> {
    await this.loadSource(id);
    await newsImportRepository.deleteSource(id);
  }

  listRecentItems(limit: number): Promise<IImportedItem[]> {
    return newsImportRepository.listRecentItems(limit);
  }

  originOfPost(postId: string): Promise<IImportOrigin | null> {
    return newsImportRepository.findOriginOfPost(postId);
  }

  // ── running ───────────────────────────────────────────────────────────────

  // "Buscar agora" on one source, active or not.
  async runSource(id: string, now = new Date()): Promise<ImportRunResult> {
    const source = await this.loadSource(id);
    return this.importSource(source, now);
  }

  // Every active source, one after the other. Called by the timer and by
  // "Buscar todas agora". Two calls at once share the same run.
  runAll(now = new Date()): Promise<ImportRunResult[]> {
    if (!this.running) {
      this.running = this.doRunAll(now).finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  // For the timer: never throws.
  kick(): void {
    this.runAll().catch((err) => logger.error('News import failed', { err }));
  }

  private async doRunAll(now: Date): Promise<ImportRunResult[]> {
    const sources = await newsImportRepository.listActiveSources();
    const results: ImportRunResult[] = [];
    for (const source of sources) {
      results.push(await this.importSource(source, now));
    }
    const imported = results.reduce((sum, r) => sum + r.imported, 0);
    if (sources.length > 0) logger.info('News import finished', { sources: sources.length, imported });
    return results;
  }

  private async importSource(source: INewsSource, now: Date): Promise<ImportRunResult> {
    let imported = 0;
    let error: string | null = null;

    try {
      if (!source.categoryId) throw new Error('Choose a category for this source.');
      const actor = await this.importingActor();
      const xml = await this.fetcher(source.feedUrl);
      const items = parseFeed(xml)
        .filter((item) => !item.publishedAt || now.getTime() - item.publishedAt.getTime() <= MAX_AGE_MS)
        .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));

      const seen = await newsImportRepository.seenGuids(source.id, items.map((item) => item.guid));
      const fresh = items.filter((item) => !seen.has(item.guid));
      const limit = source.lastRunAt ? MAX_PER_RUN : MAX_FIRST_RUN;

      for (const [index, item] of fresh.entries()) {
        const itemId = await newsImportRepository.markSeen(source.id, item.guid, item.imageUrl);
        if (!itemId || index >= limit) continue;

        try {
          const postId = await this.createDraft(actor, source, item);
          await newsImportRepository.linkPost(itemId, postId);
          imported += 1;
        } catch (err) {
          // Forget it, so the next run tries again.
          await newsImportRepository.forget(itemId);
          throw err;
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      logger.warn('News import: a source failed', { source: source.name, error });
    }

    await newsImportRepository.recordRun(source.id, now, imported, error ? error.slice(0, 500) : null);
    return { sourceId: source.id, name: source.name, imported, error };
  }

  private async createDraft(actor: SessionUser, source: INewsSource, item: FeedItem): Promise<string> {
    const excerpt = shorten(stripTags(item.summaryHtml || item.contentHtml), EXCERPT_MAX);
    const title = shorten(item.title, 200);
    const coverId = await this.importCover(actor, item.imageUrl);
    const post = await postsService.create(actor, {
      type: PostType.NEWS,
      title: title.length >= 3 ? title : `${title} — ${source.name}`,
      excerpt,
      content: draftContent(item, source, excerpt),
      categoryId: source.categoryId,
      // The reporter's name only with the whole text: it is their text.
      authorId: null,
      bylineName: source.fullText && item.author ? item.author : null,
      sourceName: source.name.slice(0, 120),
      sourceUrl: item.link && item.link.length <= 500 ? item.link : null,
      coverId,
      coverAlt: coverId ? title : null,
    });
    return post.id;
  }

  // The source's photo, copied to Cloudinary so the story does not depend on
  // the other site keeping it online. A photo that cannot be copied (gone,
  // not an image, too small, Cloudinary off) leaves the draft without a
  // cover: the import goes on, and the editor offers the photo again.
  private async importCover(actor: SessionUser, imageUrl: string | null): Promise<string | null> {
    if (!imageUrl || !isMediaConfigured()) return null;
    try {
      const media = await mediaService.importFromUrl(actor, { purpose: 'cover', url: imageUrl });
      return media.id;
    } catch (err) {
      logger.warn('News import: could not copy the photo', { imageUrl, err });
      return null;
    }
  }

  private async importingActor(): Promise<SessionUser> {
    const admin = await newsImportRepository.findImportingAdmin();
    if (!admin) throw new Error('There is no active admin to sign the drafts.');
    return { id: admin.id, name: admin.name, role: admin.role as Role, authorId: admin.author?.id ?? null };
  }

  private async loadSource(id: string): Promise<INewsSource> {
    const source = await newsImportRepository.findSource(id);
    if (!source) throw new NotFound('Source not found.');
    return source;
  }

  private async assertCategory(categoryId: string | null | undefined): Promise<void> {
    if (!categoryId) {
      throw new ValidationError('Choose a category.', { categoryId: 'Choose a category.' });
    }
    if (!(await categoriesRepository.findById(categoryId))) throw new NotFound('Category not found.');
  }
}

export const newsImportService = new NewsImportService();
