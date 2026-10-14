import { Conflict, Forbidden, NotFound, ValidationError } from '../../shared/errors/AppError';
import { PostStatus, PostType } from '../../shared/types/enums';
import { slugify } from '../../shared/utils/slugify';
import { isHtmlEmpty, sanitizePostContent } from '../../shared/utils/sanitizeHtml';
import { extractYoutubeId } from '../../shared/utils/youtube';
import type { Paginated } from '../../shared/types/pagination';
import type { SessionUser } from '../auth/auth.types';
import { authorsRepository } from '../authors/authors.repository';
import { categoriesRepository } from '../categories/categories.repository';
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
  UpdatePostInput,
  VideoInput,
} from './posts.service.types';

const HOME_NEWS_LIMIT = 8;
const HOME_COLUMNS_LIMIT = 4;

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

  // Normalizes the video pair. A YouTube URL becomes the bare 11-char id, so
  // the template controls the iframe and the editor never supplies one.
  private normalizeVideo(input: VideoInput): { videoUrl: string | null; videoProvider: string | null } {
    const hasUrl = input.videoUrl !== undefined && input.videoUrl !== null && input.videoUrl !== '';
    const hasProvider = input.videoProvider !== undefined && input.videoProvider !== null;

    if (!hasUrl && !hasProvider) {
      return { videoUrl: null, videoProvider: null };
    }

    if (hasUrl !== hasProvider) {
      throw new ValidationError('Video URL and provider must be sent together.', {
        videoProvider: 'Required when a video URL is present.',
      });
    }

    if (input.videoProvider === 'youtube') {
      const id = extractYoutubeId(String(input.videoUrl));

      if (!id) {
        throw new ValidationError('Not a valid YouTube link or id.', {
          videoUrl: 'Paste the video link or its 11-character id.',
        });
      }

      return { videoUrl: id, videoProvider: 'youtube' };
    }

    // provider === 'r2': the URL must be one we produced, which means the
    // file went through the upload endpoint and its type and size were checked
    // there. Accepting any URL would let a 2 GB .mov be attached by hand.
    const url = String(input.videoUrl);

    if (!/^https?:\/\//i.test(url) || !url.toLowerCase().endsWith('.mp4')) {
      throw new ValidationError('An uploaded video must be an mp4 URL from the upload endpoint.', {
        videoUrl: 'Upload the file first and send the URL it returns.',
      });
    }

    return { videoUrl: url, videoProvider: 'r2' };
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

  private async assertAuthorExists(authorId: string): Promise<void> {
    const author = await authorsRepository.findById(authorId);
    if (!author) throw new NotFound('Author not found.');
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
    const [featured, latestNews, latestColumns] = await Promise.all([
      postsRepository.findFeatured(),
      postsRepository.findLatest(PostType.NEWS, HOME_NEWS_LIMIT),
      postsRepository.findLatest(PostType.COLUMN, HOME_COLUMNS_LIMIT),
    ]);

    return { featured, latestNews, latestColumns };
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
      if (!actor.authorId) {
        throw new Forbidden('Your account has no author profile.');
      }

      return postsRepository.findForPanel(
        {
          type: PostType.COLUMN,
          authorId: actor.authorId,
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

    await this.assertAuthorExists(input.authorId);

    const categoryId = await this.assertCategoryForType(input.type, input.categoryId);
    const video = this.normalizeVideo(input);
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
      coverUrl: input.coverUrl ?? null,
      coverAlt: input.coverAlt ?? null,
      videoUrl: video.videoUrl,
      videoProvider: video.videoProvider,
      categoryId,
      authorId: input.authorId,
      createdById: actor.id,
    });
  }

  // Columnist path: type, byline and category are decided by the server, not
  // read from the request. That is what makes it impossible to smuggle in
  // `type: news` or someone else's authorId.
  async createMyColumn(actor: SessionUser, input: CreateMyColumnInput): Promise<IPostDetail> {
    if (!actor.authorId) {
      throw new Forbidden('Your account has no author profile.');
    }

    const video = this.normalizeVideo(input);
    const slug = await this.buildUniqueSlug(input.slug ?? input.title);

    return postsRepository.create({
      type: PostType.COLUMN,
      status: PostStatus.DRAFT,
      title: input.title,
      slug,
      subtitle: input.subtitle ?? null,
      excerpt: input.excerpt ?? '',
      content: input.content ? sanitizePostContent(input.content) : '',
      coverUrl: input.coverUrl ?? null,
      coverAlt: input.coverAlt ?? null,
      videoUrl: video.videoUrl,
      videoProvider: video.videoProvider,
      categoryId: null,
      authorId: actor.authorId,
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

    const data: UpdatePostData = {};

    if (input.title !== undefined) data.title = input.title;
    if (input.subtitle !== undefined) data.subtitle = input.subtitle;
    if (input.excerpt !== undefined) data.excerpt = input.excerpt;
    if (input.coverUrl !== undefined) data.coverUrl = input.coverUrl;
    if (input.coverAlt !== undefined) data.coverAlt = input.coverAlt;

    if (input.content !== undefined) {
      // Sanitized on the way in, every time. The editor's whitelist is a
      // convenience; this is the boundary that actually holds.
      data.content = sanitizePostContent(input.content);
    }

    if (input.videoUrl !== undefined || input.videoProvider !== undefined) {
      const video = this.normalizeVideo(input);
      data.videoUrl = video.videoUrl;
      data.videoProvider = video.videoProvider;
    }

    if (input.slug !== undefined) {
      data.slug = await this.buildUniqueSlug(input.slug, id);
    }

    // Only an admin may move a post between categories or change the byline.
    if (policy.isAdmin(actor)) {
      if (input.categoryId !== undefined) {
        data.categoryId = await this.assertCategoryForType(post.type, input.categoryId);
      }

      if (input.authorId !== undefined) {
        await this.assertAuthorExists(input.authorId);
        data.authorId = input.authorId;
      }
    } else if (input.categoryId !== undefined || input.authorId !== undefined) {
      throw new Forbidden('You cannot change the category or the byline.');
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

    if (!post.excerpt.trim()) fields.excerpt = 'Write a short summary.';
    if (isHtmlEmpty(post.content)) fields.content = 'The body is empty.';

    // News is what shows up as a card on the home page and as a preview in a
    // WhatsApp group, so it needs an image. A column is carried by its byline.
    if (post.type === PostType.NEWS && !post.coverUrl) {
      fields.coverUrl = 'News needs a cover image.';
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

    return postsRepository.update(id, {
      status: PostStatus.DRAFT,
      // A post taken offline cannot stay the home page lead.
      publishedById: null,
    });
  }

  async setFeatured(actor: SessionUser, id: string): Promise<IPostDetail> {
    if (!policy.canFeature(actor)) {
      throw new Forbidden('Only an admin can set the featured post.');
    }

    const post = await this.loadPost(id);

    if (post.status !== PostStatus.PUBLISHED) {
      throw new Conflict('Only a published post can be featured.');
    }

    // The repository does this in a transaction: a partial unique index in the
    // database allows exactly one featured row.
    return postsRepository.setFeatured(id);
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
