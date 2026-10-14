import type { Request, Response } from 'express';
import { created, noContent, ok, paginated } from '../../shared/http/response';
import { Unauthenticated } from '../../shared/errors/AppError';
import { postsService } from './posts.service';
import {
  createMyColumnSchema,
  createPostSchema,
  findByIdsSchema,
  listPanelSchema,
  listPublishedSchema,
  postIdParamSchema,
  postSlugParamSchema,
  updatePostSchema,
} from './posts.schemas';

function requireUser(req: Request) {
  if (!req.user) throw new Unauthenticated();
  return req.user;
}

export class PostsController {
  // ── public ────────────────────────────────────────────────────────────────

  home = async (_req: Request, res: Response) => {
    const home = await postsService.getHome();
    return ok(res, home);
  };

  listPublished = async (req: Request, res: Response) => {
    const parsed = listPublishedSchema.parse({ query: req.query });
    const result = await postsService.listPublished(parsed.query);
    return paginated(res, result);
  };

  // Resolves the ids the browser kept in localStorage.
  findByIds = async (req: Request, res: Response) => {
    const parsed = findByIdsSchema.parse({ query: req.query });
    const posts = await postsService.findPublishedByIds(parsed.query.ids);
    return ok(res, { posts });
  };

  getBySlug = async (req: Request, res: Response) => {
    const parsed = postSlugParamSchema.parse({ params: req.params });
    const post = await postsService.getPublishedBySlug(parsed.params.slug);
    return ok(res, { post });
  };

  // ── panel (shared by admin and columnist) ─────────────────────────────────

  listForPanel = async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const parsed = listPanelSchema.parse({ query: req.query });
    const result = await postsService.listForPanel(actor, parsed.query);
    return paginated(res, result);
  };

  getForPanel = async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const parsed = postIdParamSchema.parse({ params: req.params });
    const post = await postsService.getForPanel(actor, parsed.params.id);
    return ok(res, { post });
  };

  update = async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const parsed = updatePostSchema.parse({ params: req.params, body: req.body });
    const post = await postsService.update(actor, parsed.params.id, parsed.body);
    return ok(res, { post });
  };

  remove = async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const parsed = postIdParamSchema.parse({ params: req.params });
    await postsService.remove(actor, parsed.params.id);
    return noContent(res);
  };

  // ── admin only ────────────────────────────────────────────────────────────

  create = async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const parsed = createPostSchema.parse({ body: req.body });
    const post = await postsService.create(actor, parsed.body);
    return created(res, { post });
  };

  publish = async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const parsed = postIdParamSchema.parse({ params: req.params });
    const post = await postsService.publish(actor, parsed.params.id);
    return ok(res, { post });
  };

  unpublish = async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const parsed = postIdParamSchema.parse({ params: req.params });
    const post = await postsService.unpublish(actor, parsed.params.id);
    return ok(res, { post });
  };

  setFeatured = async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const parsed = postIdParamSchema.parse({ params: req.params });
    const post = await postsService.setFeatured(actor, parsed.params.id);
    return ok(res, { post });
  };

  // ── columnist only ────────────────────────────────────────────────────────

  createMyColumn = async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const parsed = createMyColumnSchema.parse({ body: req.body });
    const post = await postsService.createMyColumn(actor, parsed.body);
    return created(res, { post });
  };

  submitForReview = async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const parsed = postIdParamSchema.parse({ params: req.params });
    const post = await postsService.submitForReview(actor, parsed.params.id);
    return ok(res, { post });
  };
}

export const postsController = new PostsController();
