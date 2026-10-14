import crypto from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getStorage } from '../../config/storage';
import { ValidationError } from '../../shared/errors/AppError';
import { logger } from '../../shared/utils/logger';
import { slugify } from '../../shared/utils/slugify';
import type { UploadedImage, VideoUploadTicket } from './upload.types';

// Without transcoding, the file that goes up is the file the reader downloads.
// 100 MB is already more than anyone on mobile data will sit through.
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

const TICKET_TTL_SECONDS = 600;

// Widths the site actually uses: article cover, card, thumbnail.
const SMALLEST_WIDTH = 320;
const IMAGE_WIDTHS: number[] = [1280, 720, SMALLEST_WIDTH];

export class UploadService {
  private key(folder: string, originalName: string, suffix: string, ext: string): string {
    const base = slugify(path.basename(originalName, path.extname(originalName))) || 'file';
    const stamp = new Date().toISOString().slice(0, 10);
    const random = crypto.randomBytes(6).toString('hex');

    return `${folder}/${stamp}/${base}-${random}${suffix}.${ext}`;
  }

  // Resized and converted to WebP before it ever reaches the bucket.
  //
  // This is not an optimization, it is the feature: a reporter uploads a 6 MB
  // photo straight off their phone, and serving that as-is is what turns a
  // "fast on mobile" site into a 40 MB home page by week two.
  async uploadImage(
    file: { buffer: Buffer; originalname: string },
    folder: string,
  ): Promise<UploadedImage> {
    // Fails fast with 503 before spending CPU on sharp when R2 is off.
    const storage = getStorage();

    let pipeline: sharp.Sharp;
    let metadata: sharp.Metadata;

    try {
      pipeline = sharp(file.buffer, { failOn: 'error' }).rotate();
      metadata = await pipeline.metadata();
    } catch (err) {
      // The multer mimetype check catches the honest mistake; this catches the
      // payload that claims to be a JPEG and is not.
      logger.warn('Rejected file that is not a decodable image', err);
      throw new ValidationError('This file is not a valid image.', {
        file: 'Send a JPEG, PNG, WebP or AVIF image.',
      });
    }

    const sourceWidth = metadata.width ?? 0;

    if (sourceWidth < SMALLEST_WIDTH) {
      throw new ValidationError('This image is too small for a cover.', {
        file: `Use an image at least ${SMALLEST_WIDTH}px wide.`,
      });
    }

    // Guaranteed non-empty by the check above: SMALLEST_WIDTH always passes.
    const targets = IMAGE_WIDTHS.filter((width) => width <= sourceWidth);

    const rendered = await Promise.all(
      targets.map(async (width) => {
        const output = await sharp(file.buffer, { failOn: 'error' })
          .rotate()
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer({ resolveWithObject: true });

        return {
          width: output.info.width,
          height: output.info.height,
          bytes: output.data.length,
          key: this.key(folder, file.originalname, `-${width}`, 'webp'),
          body: output.data,
        };
      }),
    );

    await Promise.all(
      rendered.map((item) =>
        storage.s3.send(
          new PutObjectCommand({
            Bucket: storage.bucket,
            Key: item.key,
            Body: item.body,
            ContentType: 'image/webp',
            // Filenames carry a random suffix, so a URL never points at
            // different bytes later. Safe to cache for a year.
            CacheControl: 'public, max-age=31536000, immutable',
          }),
        ),
      ),
    );

    const largest = rendered.reduce((a, b) => (a.width >= b.width ? a : b));

    return {
      url: storage.publicUrl(largest.key),
      width: largest.width,
      height: largest.height,
      bytes: largest.bytes,
      variants: rendered
        .slice()
        .sort((a, b) => b.width - a.width)
        .map((item) => ({ width: item.width, url: storage.publicUrl(item.key) })),
    };
  }

  // The browser PUTs straight to R2 with this URL. A 300 MB video never passes
  // through Express, so there is no request timeout and no memory spike on a
  // small VPS.
  async createVideoTicket(input: {
    filename: string;
    contentType: string;
    sizeBytes: number;
  }): Promise<VideoUploadTicket> {
    const storage = getStorage();

    if (input.sizeBytes > MAX_VIDEO_BYTES) {
      const limitMb = Math.round(MAX_VIDEO_BYTES / (1024 * 1024));
      throw new ValidationError(`Videos must be smaller than ${limitMb} MB.`, {
        sizeBytes: `This file is too large. Limit is ${limitMb} MB.`,
      });
    }

    const key = this.key('videos', input.filename, '', 'mp4');

    const command = new PutObjectCommand({
      Bucket: storage.bucket,
      Key: key,
      ContentType: input.contentType,
      ContentLength: input.sizeBytes,
      CacheControl: 'public, max-age=31536000, immutable',
    });

    // ContentType and ContentLength are part of what is signed, so the browser
    // cannot swap in a different file type or a much larger one.
    const uploadUrl = await getSignedUrl(storage.s3, command, { expiresIn: TICKET_TTL_SECONDS });

    return {
      uploadUrl,
      publicUrl: storage.publicUrl(key),
      expiresInSeconds: TICKET_TTL_SECONDS,
      maxBytes: MAX_VIDEO_BYTES,
    };
  }
}

export const uploadService = new UploadService();
