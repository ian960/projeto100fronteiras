import type { Request, Response } from 'express';
import { created, noContent, ok } from '../../shared/http/response';
import { Unauthenticated } from '../../shared/errors/AppError';
import { authorsService } from './authors.service';
import {
  authorIdParamSchema,
  authorSlugParamSchema,
  createAuthorSchema,
  updateAuthorSchema,
  updateMyProfileSchema,
} from './authors.schemas';

function requireUser(req: Request) {
  if (!req.user) throw new Unauthenticated();
  return req.user;
}

export class AuthorsController {
  listColumnists = async (_req: Request, res: Response) => {
    const authors = await authorsService.listColumnists();
    return ok(res, { authors });
  };

  getBySlug = async (req: Request, res: Response) => {
    const parsed = authorSlugParamSchema.parse({ params: req.params });
    const author = await authorsService.getBySlug(parsed.params.slug);
    return ok(res, { author });
  };

  list = async (_req: Request, res: Response) => {
    const authors = await authorsService.listAll();
    return ok(res, { authors });
  };

  getById = async (req: Request, res: Response) => {
    const parsed = authorIdParamSchema.parse({ params: req.params });
    const author = await authorsService.getById(parsed.params.id);
    return ok(res, { author });
  };

  create = async (req: Request, res: Response) => {
    const parsed = createAuthorSchema.parse({ body: req.body });
    const author = await authorsService.create(parsed.body);
    return created(res, { author });
  };

  update = async (req: Request, res: Response) => {
    const parsed = updateAuthorSchema.parse({ params: req.params, body: req.body });
    const author = await authorsService.update(parsed.params.id, parsed.body);
    return ok(res, { author });
  };

  remove = async (req: Request, res: Response) => {
    const parsed = authorIdParamSchema.parse({ params: req.params });
    await authorsService.remove(parsed.params.id);
    return noContent(res);
  };

  updateMyProfile = async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const parsed = updateMyProfileSchema.parse({ body: req.body });
    const author = await authorsService.updateMyProfile(actor.authorId, parsed.body);
    return ok(res, { author });
  };
}

export const authorsController = new AuthorsController();
