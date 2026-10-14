import multer from 'multer';
import { ValidationError } from '../errors/AppError';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB straight off a phone

const ACCEPTED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

// Memory storage: the buffer goes to sharp and then to R2. Nothing ever
// touches the VPS disk, so there is no upload folder to back up or clean.
export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ACCEPTED_IMAGE_MIME.includes(file.mimetype)) {
      // mimetype comes from the client and can lie. This filter stops the
      // honest mistake; sharp is what actually rejects a non-image payload.
      cb(new ValidationError(`Unsupported image type: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
}).single('file');
