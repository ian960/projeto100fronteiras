import type { Request, Response } from 'express';
import { created, noContent, ok } from '../../shared/http/response';
import { Unauthenticated } from '../../shared/errors/AppError';
import { commentsService } from './comments.service';
import {
  commentIdParamSchema,
  createCommentSchema,
  listCommentsSchema,
  updateCommentSchema,
} from './comments.schemas';

function requireUser(req: Request) {
  if (!req.user) throw new Unauthenticated();
  return req.user;
}

export class CommentsController {
  list = async (req: Request, res: Response) => {
    const parsed = listCommentsSchema.parse({ query: req.query });
    return ok(res, await commentsService.list(parsed.query.postId));
  };

  create = async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const parsed = createCommentSchema.parse({ body: req.body });
    const comment = await commentsService.create(actor, parsed.body);
    return created(res, { comment });
  };

  update = async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const parsed = updateCommentSchema.parse({ params: req.params, body: req.body });
    const comment = await commentsService.update(actor, parsed.params.id, parsed.body.content);
    return ok(res, { comment });
  };

  remove = async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const parsed = commentIdParamSchema.parse({ params: req.params });
    await commentsService.remove(actor, parsed.params.id);
    return noContent(res);
  };
}

export const commentsController = new CommentsController();
