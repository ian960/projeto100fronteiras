import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../shared/middlewares/authenticate';
import { authorize } from '../../shared/middlewares/authorize';
import { uploadImage } from '../../shared/middlewares/upload';
import { Role } from '../../shared/types/enums';
import { isStorageConfigured } from '../../config/storage';
import { ServiceUnavailable, ValidationError } from '../../shared/errors/AppError';
import { uploadController } from './upload.controller';
import type { NextFunction, Request, Response } from 'express';

// Multer signals "file too large" with its own error class. Translating it
// here turns a 500 into a 422 the panel can show next to the field.
function handleUpload(req: Request, res: Response, next: NextFunction) {
  uploadImage(req, res, (err: unknown) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new ValidationError('This image is too large.', { file: 'Maximum 8 MB.' }));
      }
      return next(new ValidationError(`Upload failed: ${err.code}`));
    }

    return next(err);
  });
}

// Answers 503 before multer reads a single byte of the body. Without R2 there
// is nowhere to put the file, so there is no point accepting an 8 MB upload.
function requireStorage(_req: Request, _res: Response, next: NextFunction) {
  if (!isStorageConfigured()) {
    return next(
      new ServiceUnavailable(
        'File uploads are not configured on this server. Set the R2_* variables to enable them.',
      ),
    );
  }
  return next();
}

// Columnists upload their own cover images, so both roles are allowed.
export function uploadRouter(): Router {
  const router = Router();

  router.use(authenticate, authorize(Role.ADMIN, Role.COLUMNIST), requireStorage);

  router.post('/image', handleUpload, uploadController.image);
  router.post('/video-ticket', uploadController.videoTicket);

  return router;
}
