import type { Request, Response } from 'express';
import { Unauthenticated } from '../../shared/errors/AppError';
import { created, noContent, ok } from '../../shared/http/response';
import { bannersService } from './banners.service';
import { bannerIdParamSchema, createBannerSchema, impressionsSchema, updateBannerSchema } from './banners.schemas';

function requireUser(req: Request) {
  if (!req.user) throw new Unauthenticated();
  return req.user;
}

export class BannersController {
  // ── public ──────────────────────────────────────────────────────────────
  listRunning = async (_req: Request, res: Response) => {
    const banners = await bannersService.listRunning();
    return ok(res, { banners });
  };

  impressions = async (req: Request, res: Response) => {
    const parsed = impressionsSchema.parse({ body: req.body });
    await bannersService.countImpressions(parsed.body.ids);
    return noContent(res);
  };

  click = async (req: Request, res: Response) => {
    const parsed = bannerIdParamSchema.parse({ params: req.params });
    await bannersService.countClick(parsed.params.id);
    return noContent(res);
  };

  // ── admin ───────────────────────────────────────────────────────────────
  list = async (_req: Request, res: Response) => {
    const banners = await bannersService.listAll();
    return ok(res, { banners });
  };

  create = async (req: Request, res: Response) => {
    const parsed = createBannerSchema.parse({ body: req.body });
    const banner = await bannersService.create(requireUser(req), parsed.body);
    return created(res, { banner });
  };

  update = async (req: Request, res: Response) => {
    const parsed = updateBannerSchema.parse({ params: req.params, body: req.body });
    const banner = await bannersService.update(requireUser(req), parsed.params.id, parsed.body);
    return ok(res, { banner });
  };

  remove = async (req: Request, res: Response) => {
    const parsed = bannerIdParamSchema.parse({ params: req.params });
    await bannersService.remove(parsed.params.id);
    return noContent(res);
  };
}

export const bannersController = new BannersController();
