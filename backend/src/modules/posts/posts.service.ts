import { Conflict, Forbidden, NotFound, ValidationError } from '../../shared/errors/AppError';
import { MediaKind, PostStatus, PostType } from '../../shared/types/enums';
import { isSlugOf, slugify } from '../../shared/utils/slugify';
import { isHtmlEmpty, sanitizePostContent } from '../../shared/utils/sanitizeHtml';
import { extractYoutubeId } from '../../shared/utils/youtube';
import type { Paginated } from '../../shared/types/pagination';
import type { SessionUser } from '../auth/auth.types';
import { authorsRepository } from '../authors/authors.repository';
import { categoriesRepository } from '../categories/categories.repository';
import { mediaService } from '../media/media.service';
import * as policy from './posts.policy';
import { postsRepository } from './posts.repository';
import type { UpdatePostData } from './posts.repository.types';
import type {
  IHomePayload,
  IPost,
  IPostDetail,
  IPostListItem,
  IPostWithAudit,
} from './posts.types';
import type {
  CreateMyColumnInput,
  CreatePostInput,
  ListPanelInput,
  ListPublishedInput,
  PostMediaInput,
  UpdatePostInput,
} from './posts.service.types';

// The top of the home: lead + three beside it + the latest list.
const HOME_NEWS_LIMIT = 10;
const HOME_COLUMNS_LIMIT = 4;
// The carousel always has at least this many slides when there is enough news.
export const HOME_MIN_HIGHLIGHTS = 4;
// Per category block further down the home.
const HOME_SECTION_LIMIT = 4;

export class PostsService {
  // ── helpers ───────────────────────────────────────────────────────────────

  private async loadPost(id: string): Promise<IPost> {
    const post = await postsRepository.findById(id);
    if (!post) throw new NotFound('Post not found.');
    return post;
  }

  private async buildUniqueSlug(source: string, exceptId?: string): Promise<string> {
    const base = slugify(source);

    if (!base) {
      throw new ValidationError('Could not build a slug from this title.', {
        title: 'Use at least one letter or number.',
      });
    }

    const existing = await postsRepository.findBySlug(base);

    if (!existing || existing.id === exceptId) return base;

    // Two posts can legitimately share a headline ("Chuva forte atinge a
    // cidade" happens every summer), so a numeric suffix beats a 409 the
    // writer cannot resolve.
    for (let suffix = 2; suffix <= 50; suffix += 1) {
      const candidate = `${base}-${suffix}`;
      const taken = await postsRepository.findBySlug(candidate);
      if (!taken || taken.id === exceptId) return candidate;
    }

    throw new Conflict('Could not generate a unique slug for this title.');
  }

  // Turns the media part of a request into columns, checking every file that
  // changes: it must exist, be the right kind (an image as cover, a PDF as
  // attachment…) and be usable by this person.
  //
  // `current` is the post being edited, null when creating. A file the post
  // already has is accepted as is, so a columnist can save a column whose
  // cover the admin picked.
  private async resolveMedia(
    actor: SessionUser,
    input: PostMediaInput,
    current: { post: IPost; attachmentIds: string[] } | null,
  ): Promise<
    Pick<UpdatePostData, 'coverId' | 'coverAlt' | 'videoYoutubeId' | 'videoId' | 'attachments'>
  > {
    const data: Pick<
      UpdatePostData,
      'coverId' | 'coverAlt' | 'videoYoutubeId' | 'videoId' | 'attachments'
    > = {};

    if (input.coverId !== undefined) {
      if (input.coverId && input.coverId !== current?.post.coverId) {
        await mediaService.requireUsable(actor, input.coverId, MediaKind.IMAGE, 'coverId');
      }
      data.coverId = input.coverId;
    }

    if (input.coverAlt !== undefined) data.coverAlt = input.coverAlt;

    // The two video columns are always written together, so switching from
    // YouTube to an uploaded file (or back) clears the other one.
    if (input.video !== undefined) {
      if (input.video === null) {
        data.videoYoutubeId = null;
        data.videoId = null;
      } else if (input.video.provider === 'youtube') {
        // The bare 11-char id is stored; the template builds the player, so
        // the editor never supplies an <iframe>.
        const youtubeId = extractYoutubeId(input.video.url);

        if (!youtubeId) {
          throw new ValidationError('Not a valid YouTube link or id.', {
            video: 'Paste the video link or its 11-character id.',
          });
        }

        data.videoYoutubeId = youtubeId;
        data.videoId = null;
      } else {
        if (input.video.mediaId !== current?.post.videoId) {
          await mediaService.requireUsable(actor, input.video.mediaId, MediaKind.VIDEO, 'video');
        }
        data.videoId = input.video.mediaId;
        data.videoYoutubeId = null;
      }
    }

    if (input.attachments !== undefined) {
      const added = input.attachments
        .map((item) => item.mediaId)
        .filter((id) => !current?.attachmentIds.includes(id));

      await mediaService.requireAllUsable(actor, added, MediaKind.DOCUMENT, 'attachments');

      data.attachments = input.attachments.map((item) => ({
        mediaId: item.mediaId,
        title: item.title,
      }));
    }

    return data;
  }

  private async assertCategoryForType(
    type: PostType,
    categoryId: string | null | undefined,
  ): Promise<string | null> {
    if (type === PostType.COLUMN) {
      if (categoryId) {
        throw new ValidationError('A column does not belong to a category.', {
          categoryId: 'Leave this empty for columns.',
        });
      }
      return null;
    }

    if (!categoryId) {
      throw new ValidationError('News must belong to a category.', {
        categoryId: 'Choose a category.',
      });
    }

    const category = await categoriesRepository.findById(categoryId);

    if (!category) throw new NotFound('Category not found.');

    return categoryId;
  }

  // Which of the login's own authors signs a columnist's text. Left out: the
  // first one (the admin's order). Anything else: refused.
  private ownAuthorOf(actor: SessionUser, authorId: string | null | undefined, message?: string): string {
    const first = actor.authorIds[0];
    if (!first) throw new Forbidden('Your account has no author profile.');
    if (!authorId) return first;
    if (!policy.hasAuthor(actor, authorId)) {
      throw new Forbidden(message ?? 'You can only sign with the authors linked to your account.');
    }
    return authorId;
  }

  private async assertAuthorExists(authorId: string): Promise<void> {
    const author = await authorsRepository.findById(authorId);
    if (!author) throw new NotFound('Author not found.');
  }

  // Who signs the piece. News: a registered author, a name the admin types
  // (not tied to anyone's profile, so it has no author page), or nobody.
  // A column always belongs to a registered columnist.
  private async resolveByline(
    type: PostType,
    authorId: string | null | undefined,
    bylineName: string | null | undefined,
  ): Promise<{ authorId: string | null; bylineName: string | null }> {
    if (authorId && bylineName) {
      throw new ValidationError('Choose an author or type a name, not both.', {
        bylineName: 'Choose an author or type a name, not both.',
      });
    }

    if (type === PostType.COLUMN) {
      if (!authorId) {
        throw new ValidationError('A column must be signed by its columnist.', {
          authorId: 'Choose the columnist.',
        });
      }
      if (bylineName) {
        throw new ValidationError('A column must be signed by its columnist.', {
          bylineName: 'Columns are signed by a registered columnist.',
        });
      }
    }

    if (authorId) await this.assertAuthorExists(authorId);

    return { authorId: authorId ?? null, bylineName: bylineName ?? null };
  }

  // ── public reads ──────────────────────────────────────────────────────────

  listPublished(input: ListPublishedInput): Promise<Paginated<IPostListItem>> {
    return postsRepository.findPublished(
      {
        ...(input.type ? { type: input.type } : {}),
        ...(input.category ? { categorySlug: input.category } : {}),
        ...(input.author ? { authorSlug: input.author } : {}),
        ...(input.q ? { search: input.q } : {}),
      },
      { page: input.page, limit: input.limit },
    );
  }

  async getPublishedBySlug(slug: string): Promise<IPostDetail> {
    const post = await postsRepository.findPublishedBySlug(slug);
    if (!post) throw new NotFound('Post not found.');
    return post;
  }

  // Whole home page in one request.
  async getHome(): Promise<IHomePayload> {
    const [featured, latestNews, latestColumns, categories] = await Promise.all([
      postsRepository.findFeatured(),
      postsRepository.findLatest(PostType.NEWS, HOME_NEWS_LIMIT),
      postsRepository.findLatest(PostType.COLUMN, HOME_COLUMNS_LIMIT),
      categoriesRepository.findAllActive(),
    ]);

    // One small query per category: a portal has a handful of them, and the
    // home is one request for the reader instead of one per block.
    const sections = (
      await Promise.all(
        categories.map(async (category) => ({
          category: { id: category.id, name: category.name, slug: category.slug },
          posts: await postsRepository.findLatest(PostType.NEWS, HOME_SECTION_LIMIT, category.id),
        })),
      )
    ).filter((section) => section.posts.length > 0);

    // The admin's choices first; with fewer than four, the latest news fills in.
    const chosen = new Set(featured.map((post) => post.id));
    const fill = latestNews
      .filter((post) => !chosen.has(post.id))
      .slice(0, Math.max(0, HOME_MIN_HIGHLIGHTS - featured.length));
    const highlights = [...featured, ...fill];

    return { highlights, featured: highlights[0] ?? null, latestNews, latestColumns, sections };
  }

  // "Leia também" under an article. A draft's slug answers 404, like the
  // article itself, so this cannot be used to discover unpublished titles.
  async getRelated(slug: string, limit: number): Promise<IPostListItem[]> {
    const post = await postsRepository.findBySlug(slug);
    if (!post || post.status !== PostStatus.PUBLISHED) throw new NotFound('Post not found.');
    return postsRepository.findRelated(post, limit);
  }

  // Reader bookmarks: the browser keeps the ids, this resolves them in one go.
  findPublishedByIds(ids: string[]): Promise<IPostListItem[]> {
    return postsRepository.findPublishedByIds(ids);
  }

  // ── panel reads ───────────────────────────────────────────────────────────

  listForPanel(actor: SessionUser, input: ListPanelInput): Promise<Paginated<IPostListItem>> {
    // A columnist is pinned to their own byline in the WHERE clause. The
    // authorId from the query string is ignored for them, so there is no way
    // to page through someone else's drafts.
    if (!policy.isAdmin(actor)) {
      if (actor.authorIds.length === 0) {
        throw new Forbidden('Your account has no author profile.');
      }

      return postsRepository.findForPanel(
        {
          ownedBy: { authorIds: actor.authorIds, userId: actor.id },
          ...(input.type ? { type: input.type } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.q ? { search: input.q } : {}),
        },
        { page: input.page, limit: input.limit },
      );
    }

    return postsRepository.findForPanel(
      {
        ...(input.type ? { type: input.type } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.origin ? { origin: input.origin } : {}),
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
        ...(input.authorId ? { authorId: input.authorId } : {}),
        ...(input.q ? { search: input.q } : {}),
      },
      { page: input.page, limit: input.limit },
    );
  }

  async getForPanel(actor: SessionUser, id: string): Promise<IPostWithAudit> {
    const post = await this.loadPost(id);

    if (!policy.canViewInPanel(actor, post)) {
      throw new Forbidden();
    }

    const detailed = await postsRepository.findByIdWithAudit(id);
    if (!detailed) throw new NotFound('Post not found.');

    return detailed;
  }

  // ── writes ────────────────────────────────────────────────────────────────

  // Admin path: news or column, any byline.
  async create(actor: SessionUser, input: CreatePostInput): Promise<IPostDetail> {
    if (!policy.canCreateType(actor, input.type)) {
      throw new Forbidden('You cannot create this type of post.');
    }

    const byline = await this.resolveByline(input.type, input.authorId, input.bylineName);
    const categoryId = await this.assertCategoryForType(input.type, input.categoryId);
    const media = await this.resolveMedia(actor, input, null);
    const slug = await this.buildUniqueSlug(input.slug ?? input.title);

    return postsRepository.create({
      type: input.type,
      // Everything starts as a draft. Going live is a separate, explicit call.
      status: PostStatus.DRAFT,
      title: input.title,
      slug,
      subtitle: input.subtitle ?? null,
      excerpt: input.excerpt ?? '',
      content: input.content ? sanitizePostContent(input.content) : '',
      sourceName: input.sourceName ?? null,
      sourceUrl: input.sourceUrl ?? null,
      ...media,
      categoryId,
      ...byline,
      createdById: actor.id,
    });
  }

  // Columnist path: the byline is checked against the session, not trusted
  // from the request. That is what makes it impossible to smuggle in someone
  // else's authorId: only the authors the admin tied to this login are
  // accepted.
  async createMyColumn(actor: SessionUser, input: CreateMyColumnInput): Promise<IPostDetail> {
    const authorId = this.ownAuthorOf(actor, input.authorId);

    const type = input.type ?? PostType.COLUMN;
    if (!policy.canCreateType(actor, type)) {
      throw new Forbidden('You cannot create this type of post.');
    }
    // News needs a category; a column never has one (anything sent is
    // ignored, as before news existed for columnists).
    const categoryId = type === PostType.NEWS ? await this.assertCategoryForType(type, input.categoryId) : null;
    const media = await this.resolveMedia(actor, input, null);
    const slug = await this.buildUniqueSlug(input.slug ?? input.title);

    return postsRepository.create({
      type,
      status: PostStatus.DRAFT,
      title: input.title,
      slug,
      subtitle: input.subtitle ?? null,
      excerpt: input.excerpt ?? '',
      content: input.content ? sanitizePostContent(input.content) : '',
      sourceName: input.sourceName ?? null,
      sourceUrl: input.sourceUrl ?? null,
      ...media,
      categoryId,
      authorId,
      createdById: actor.id,
    });
  }

  async update(actor: SessionUser, id: string, input: UpdatePostInput): Promise<IPostDetail> {
    const post = await this.loadPost(id);

    if (!policy.canEdit(actor, post)) {
      // Published is out of the columnist's hands; the admin edits from there.
      throw new Forbidden(
        post.status === PostStatus.PUBLISHED
          ? 'A published post can only be edited by an admin.'
          : 'You do not have permission to edit this post.',
      );
    }

    const attachmentIds =
      input.attachments !== undefined ? await postsRepository.findAttachmentMediaIds(id) : [];

    const data: UpdatePostData = {
      ...(await this.resolveMedia(actor, input, { post, attachmentIds })),
    };

    if (input.title !== undefined) data.title = input.title;
    if (input.subtitle !== undefined) data.subtitle = input.subtitle;
    if (input.excerpt !== undefined) data.excerpt = input.excerpt;
    if (input.sourceName !== undefined) data.sourceName = input.sourceName;
    if (input.sourceUrl !== undefined) data.sourceUrl = input.sourceUrl;

    if (input.content !== undefined) {
      // Sanitized on the way in, every time. The editor's whitelist is a
      // convenience; this is the boundary that actually holds.
      data.content = sanitizePostContent(input.content);
    }

    if (input.slug !== undefined) {
      data.slug = await this.buildUniqueSlug(input.slug, id);
    } else if (input.title !== undefined && post.publishedAt === null && isSlugOf(post.slug, post.title)) {
      // Until the first publication nobody has the link, so the address
      // follows the headline: a draft saved as "teste" does not go live as
      // /noticia/teste. From then on it stays put, because it is already in
      // WhatsApp groups. Taking a post offline keeps publishedAt, so it does
      // not start following again.
      data.slug = await this.buildUniqueSlug(input.title, id);
    }

    // Only an admin may move a post between categories or change the byline.
    if (policy.isAdmin(actor)) {
      if (input.categoryId !== undefined) {
        data.categoryId = await this.assertCategoryForType(post.type, input.categoryId);
      }

      // Sending either field sets the whole byline: picking an author clears
      // a typed name and vice versa. A field left out keeps its value only
      // when the other one does not conflict with it.
      if (input.authorId !== undefined || input.bylineName !== undefined) {
        const authorId =
          input.authorId !== undefined ? input.authorId : input.bylineName ? null : post.authorId;
        const bylineName =
          input.bylineName !== undefined ? input.bylineName : input.authorId ? null : post.bylineName;
        Object.assign(data, await this.resolveByline(post.type, authorId, bylineName));
      }
    } else if (input.bylineName !== undefined) {
      throw new Forbidden('You cannot change the category or the byline.');
    } else {
      // A columnist with several authors may move their own text from one of
      // them to another (published texts never reach here: canEdit).
      if (input.authorId === null) {
        throw new Forbidden('You cannot change the category or the byline.');
      }
      if (input.authorId !== undefined && input.authorId !== post.authorId) {
        data.authorId = this.ownAuthorOf(actor, input.authorId, 'You cannot change the category or the byline.');
      }
    }

    if (!policy.isAdmin(actor) && input.categoryId !== undefined) {
      // A columnist picks the category of their own news; a column has none.
      if (post.type !== PostType.NEWS) {
        throw new Forbidden('You cannot change the category or the byline.');
      }
      data.categoryId = await this.assertCategoryForType(post.type, input.categoryId);
    }

    return postsRepository.update(id, data);
  }

  // Draft -> pending: the columnist hands the text over for review.
  async submitForReview(actor: SessionUser, id: string): Promise<IPostDetail> {
    const post = await this.loadPost(id);

    if (!policy.canSubmitForReview(actor, post)) {
      throw new Forbidden('Only a draft of your own column can be submitted.');
    }

    this.assertReadyToGoLive(post);

    return postsRepository.update(id, { status: PostStatus.PENDING });
  }

  // The completeness rules live here, not in the table. A draft is allowed to
  // be half-written — a columnist has to be able to save and go to lunch.
  private assertReadyToGoLive(post: IPost): void {
    const fields: Record<string, string> = {};

    // The excerpt is optional: without one, lists show only the headline and
    // link previews fall back to the subtitle or the headline.
    if (isHtmlEmpty(post.content)) fields.content = 'The body is empty.';

    // News is what shows up as a card on the home page and as a preview in a
    // WhatsApp group, so it needs an image. A column is carried by its byline.
    if (post.type === PostType.NEWS && !post.coverId) {
      fields.coverId = 'News needs a cover image.';
    }

    if (Object.keys(fields).length > 0) {
      throw new ValidationError('This post is not complete yet.', fields);
    }
  }

  async publish(actor: SessionUser, id: string): Promise<IPostDetail> {
    if (!policy.canPublish(actor)) {
      throw new Forbidden('Only an admin can publish.');
    }

    const post = await this.loadPost(id);

    if (post.status === PostStatus.PUBLISHED) {
      throw new Conflict('This post is already published.');
    }

    this.assertReadyToGoLive(post);

    return postsRepository.update(id, {
      status: PostStatus.PUBLISHED,
      // Keep the original date on a re-publish so the archive order is stable.
      publishedAt: post.publishedAt ?? new Date(),
      publishedById: actor.id,
    });
  }

  async unpublish(actor: SessionUser, id: string): Promise<IPostDetail> {
    if (!policy.canUnpublish(actor)) {
      throw new Forbidden('Only an admin can unpublish.');
    }

    const post = await this.loadPost(id);

    if (post.status !== PostStatus.PUBLISHED) {
      throw new Conflict('This post is not published.');
    }

    const updated = await postsRepository.update(id, {
      status: PostStatus.DRAFT,
      publishedById: null,
    });

    // A post taken offline leaves the home carousel too: published again
    // later, it should not jump back to the top on its own.
    return post.featured ? postsRepository.setFeatured(id, false) : updated;
  }

  async setFeatured(actor: SessionUser, id: string): Promise<IPostDetail> {
    if (!policy.canFeature(actor)) {
      throw new Forbidden('Only an admin can set the featured post.');
    }

    const post = await this.loadPost(id);

    if (post.status !== PostStatus.PUBLISHED) {
      throw new Conflict('Only a published post can be featured.');
    }

    return postsRepository.setFeatured(id, true);
  }

  async unsetFeatured(actor: SessionUser, id: string): Promise<IPostDetail> {
    if (!policy.canFeature(actor)) {
      throw new Forbidden('Only an admin can set the featured post.');
    }

    await this.loadPost(id);
    return postsRepository.setFeatured(id, false);
  }

  async remove(actor: SessionUser, id: string): Promise<void> {
    const post = await this.loadPost(id);

    if (!policy.canDelete(actor, post)) {
      throw new Forbidden('You do not have permission to delete this post.');
    }

    await postsRepository.delete(id);
  }
}

export const postsService = new PostsService();
