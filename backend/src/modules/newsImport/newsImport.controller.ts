import type { Request, Response } from 'express';
import { NotFound } from '../../shared/errors/AppError';
import { created, noContent, ok } from '../../shared/http/response';
import { newsImportService } from './newsImport.service';
import { createSourceSchema, postIdSchema, recentItemsSchema, sourceIdSchema, updateSourceSchema } from './newsImport.schemas';

export class NewsImportController {
  listSources = async (_req: Request, res: Response) => {
    const sources = await newsImportService.listSources();
    return ok(res, { sources });
  };

  createSource = async (req: Request, res: Response) => {
    const parsed = createSourceSchema.parse({ body: req.body });
    const source = await newsImportService.createSource(parsed.body);
    return created(res, { source });
  };

  updateSource = async (req: Request, res: Response) => {
    const parsed = updateSourceSchema.parse({ params: req.params, body: req.body });
    const source = await newsImportService.updateSource(parsed.params.id, parsed.body);
    return ok(res, { source });
  };

  removeSource = async (req: Request, res: Response) => {
    const parsed = sourceIdSchema.parse({ params: req.params });
    await newsImportService.removeSource(parsed.params.id);
    return noContent(res);
  };

  runSource = async (req: Request, res: Response) => {
    const parsed = sourceIdSchema.parse({ params: req.params });
    const result = await newsImportService.runSource(parsed.params.id);
    return ok(res, { results: [result] });
  };

  runAll = async (_req: Request, res: Response) => {
    const results = await newsImportService.runAll();
    return ok(res, { results });
  };

  recentItems = async (req: Request, res: Response) => {
    const parsed = recentItemsSchema.parse({ query: req.query });
    const items = await newsImportService.listRecentItems(parsed.query.limit);
    return ok(res, { items });
  };

  originOfPost = async (req: Request, res: Response) => {
    const parsed = postIdSchema.parse({ params: req.params });
    const origin = await newsImportService.originOfPost(parsed.params.postId);
    if (!origin) throw new NotFound('This post was not imported.');
    return ok(res, { origin });
  };
}

export const newsImportController = new NewsImportController();
