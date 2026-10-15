import type { Request, Response } from 'express';
import { created, ok } from '../../shared/http/response';
import { ValidationError } from '../../shared/errors/AppError';
import { uploadService } from './upload.service';
import { imageUploadQuerySchema, videoTicketSchema } from './upload.schemas';

export class UploadController {
  image = async (req: Request, res: Response) => {
    const parsed = imageUploadQuerySchema.parse({ query: req.query });

    if (!req.file) {
      throw new ValidationError('No file received.', { file: 'Send a file in the "file" field.' });
    }

    const image = await uploadService.uploadImage(
      { buffer: req.file.buffer, originalname: req.file.originalname },
      parsed.query.folder,
    );

    return created(res, { image });
  };

  videoTicket = async (req: Request, res: Response) => {
    const parsed = videoTicketSchema.parse({ body: req.body });
    const ticket = await uploadService.createVideoTicket(parsed.body);
    return ok(res, { ticket });
  };
}

export const uploadController = new UploadController();
