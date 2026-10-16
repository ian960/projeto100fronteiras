import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { authenticate } from '../../shared/middlewares/authenticate';
import { authorize } from '../../shared/middlewares/authorize';
import { Role } from '../../shared/types/enums';
import { isMediaConfigured, mediaUnavailable } from '../../config/cloudinary';
import { mediaController } from './media.controller';

// 503 before any work when Cloudinary is off. Runs after authenticate, so an
// anonymous visitor gets a 401 and learns nothing about the configuration.
function requireMedia(_req: Request, _res: Response, next: NextFunction) {
  if (!isMediaConfigured()) return next(mediaUnavailable());
  return next();
}

// Columnists upload their own covers, photos, videos and PDFs, so both roles
// are allowed here. Deleting a file is admin-only (checked in the service).
export function mediaRouter(): Router {
  const router = Router();

  router.use(authenticate, authorize(Role.ADMIN, Role.COLUMNIST), requireMedia);

  router.post('/signature', mediaController.sign);
  router.post('/import', mediaController.importFromUrl);
  router.post('/', mediaController.register);
  router.delete('/:id', mediaController.remove);

  return router;
}
