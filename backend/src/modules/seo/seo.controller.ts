import type { Request, Response } from 'express';
import { ok } from '../../shared/http/response';
import { seoRepository } from './seo.repository';

export class SeoController {
  // GET /api/sitemap: every public address, for the Worker's sitemap.xml.
  sitemap = async (_req: Request, res: Response) => {
    const sitemap = await seoRepository.findSitemap();
    // The Worker keeps it for a few minutes too; this covers anything else
    // in between.
    res.set('cache-control', 'public, max-age=300');
    return ok(res, sitemap);
  };
}

export const seoController = new SeoController();
