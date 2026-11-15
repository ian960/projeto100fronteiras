import type { Request, Response } from 'express';
import { Unauthenticated } from '../../shared/errors/AppError';
import { created, noContent, ok } from '../../shared/http/response';
import { logger } from '../../shared/utils/logger';
import {
  issueIdSchema,
  issueSchema,
  setMineSchema,
  subscribeSchema,
  tokenBodySchema,
  tokenQuerySchema,
} from './newsletter.schemas';
import { newsletterService } from './newsletter.service';

function requireUser(req: Request) {
  if (!req.user) throw new Unauthenticated();
  return req.user;
}

export class NewsletterController {
  // POST /api/newsletter/subscribe. 204 whatever happened (see the service).
  subscribe = async (req: Request, res: Response) => {
    const { body } = subscribeSchema.parse({ body: req.body });
    if (body.website?.trim()) {
      logger.info('Newsletter: sign-up dropped by the robot trap.');
      return noContent(res);
    }
    await newsletterService.subscribe(body.email, 'site');
    return noContent(res);
  };

  // POST /api/newsletter/confirm
  confirm = async (req: Request, res: Response) => {
    const { body } = tokenBodySchema.parse({ body: req.body });
    return ok(res, await newsletterService.confirm(body.token));
  };

  // POST /api/newsletter/unsubscribe (the page /newsletter/sair)
  unsubscribe = async (req: Request, res: Response) => {
    const { body } = tokenBodySchema.parse({ body: req.body });
    return ok(res, await newsletterService.unsubscribe(body.token));
  };

  // POST /api/newsletter/unsubscribe/one-click?token=… (the mail app's button)
  oneClick = async (req: Request, res: Response) => {
    const { query } = tokenQuerySchema.parse({ query: req.query });
    await newsletterService.unsubscribe(query.token);
    return noContent(res);
  };

  // GET /api/newsletter/me
  getMine = async (req: Request, res: Response) => {
    return ok(res, { status: await newsletterService.getMine(requireUser(req).id) });
  };

  // PUT /api/newsletter/me
  setMine = async (req: Request, res: Response) => {
    const { body } = setMineSchema.parse({ body: req.body });
    return ok(res, { status: await newsletterService.setMine(requireUser(req).id, body.subscribed) });
  };

  // ── admin ───────────────────────────────────────────────────────────────

  overview = async (_req: Request, res: Response) => ok(res, await newsletterService.overview());

  posts = async (_req: Request, res: Response) => ok(res, await newsletterService.recentPosts());

  preview = async (req: Request, res: Response) => {
    const { body } = issueSchema.parse({ body: req.body });
    return ok(res, await newsletterService.preview(body));
  };

  test = async (req: Request, res: Response) => {
    const { body } = issueSchema.parse({ body: req.body });
    return ok(res, await newsletterService.sendTest(requireUser(req).id, body));
  };

  createIssue = async (req: Request, res: Response) => {
    const { body } = issueSchema.parse({ body: req.body });
    return created(res, await newsletterService.createIssue(requireUser(req).id, body));
  };

  cancelIssue = async (req: Request, res: Response) => {
    const { params } = issueIdSchema.parse({ params: req.params });
    return ok(res, await newsletterService.cancelIssue(params.id));
  };

  // "Continuar agora": a round right away instead of waiting for the timer.
  runQueue = async (_req: Request, res: Response) => {
    newsletterService.kick();
    return ok(res, await newsletterService.overview());
  };
}

export const newsletterController = new NewsletterController();
