import type { Request, Response } from 'express';
import { created, noContent, ok } from '../../shared/http/response';
import { Unauthenticated } from '../../shared/errors/AppError';
import { mediaService } from './media.service';
import {
  importMediaSchema,
  mediaIdParamSchema,
  registerMediaSchema,
  signUploadSchema,
} from './media.schemas';

function requireUser(req: Request) {
  if (!req.user) throw new Unauthenticated();
  return req.user;
}

export class MediaController {
  sign = async (req: Request, res: Response) => {
    requireUser(req);
    const parsed = signUploadSchema.parse({ body: req.body });
    const upload = mediaService.sign(parsed.body.purpose);
    return ok(res, { upload });
  };

  register = async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const parsed = registerMediaSchema.parse({ body: req.body });
    const media = await mediaService.register(actor, parsed.body);
    return created(res, { media });
  };

  importFromUrl = async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const parsed = importMediaSchema.parse({ body: req.body });
    const media = await mediaService.importFromUrl(actor, parsed.body);
    return created(res, { media });
  };

  remove = async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const parsed = mediaIdParamSchema.parse({ params: req.params });
    await mediaService.remove(actor, parsed.params.id);
    return noContent(res);
  };
}

export const mediaController = new MediaController();
