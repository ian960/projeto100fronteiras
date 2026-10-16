import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import type { IMediaRepository } from './media.repository.interfaces';
import type { CreateMediaData, MediaUsage } from './media.repository.types';
import type { IMedia } from './media.types';

export class MediaRepository implements IMediaRepository {
  async findById(id: string): Promise<IMedia | null> {
    try {
      return await prisma.media.findUnique({ where: { id } });
    } catch (err) {
      logger.error('Failed to find media by id', err);
      throw err;
    }
  }

  async findByIds(ids: string[]): Promise<IMedia[]> {
    try {
      return await prisma.media.findMany({ where: { id: { in: ids } } });
    } catch (err) {
      logger.error('Failed to find media by ids', err);
      throw err;
    }
  }

  async findByPublicId(publicId: string): Promise<IMedia | null> {
    try {
      return await prisma.media.findUnique({ where: { publicId } });
    } catch (err) {
      logger.error('Failed to find media by public id', err);
      throw err;
    }
  }

  async create(data: CreateMediaData): Promise<IMedia> {
    try {
      return await prisma.media.create({
        data: {
          kind: data.kind,
          publicId: data.publicId,
          version: data.version,
          format: data.format,
          bytes: data.bytes,
          width: data.width ?? null,
          height: data.height ?? null,
          durationSec: data.durationSec ?? null,
          pages: data.pages ?? null,
          originalName: data.originalName,
          uploadedById: data.uploadedById,
        },
      });
    } catch (err) {
      logger.error('Failed to create media', err);
      throw err;
    }
  }

  // Five COUNTs in parallel, all answered by indexes or primary keys except
  // the text search, which only runs when someone tries to delete a file.
  async countUsage(media: Pick<IMedia, 'id' | 'publicId'>): Promise<MediaUsage> {
    try {
      const [covers, videos, attachments, authorPhotos, inText] = await Promise.all([
        prisma.post.count({ where: { coverId: media.id } }),
        prisma.post.count({ where: { videoId: media.id } }),
        prisma.postAttachment.count({ where: { mediaId: media.id } }),
        prisma.author.count({ where: { photoId: media.id } }),
        // A photo inside the text is referenced by its URL, which contains
        // the public id.
        prisma.post.count({ where: { content: { contains: media.publicId } } }),
      ]);

      return { covers, videos, attachments, authorPhotos, inText };
    } catch (err) {
      logger.error('Failed to count media usage', err);
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await prisma.media.delete({ where: { id } });
    } catch (err) {
      logger.error('Failed to delete media', err);
      throw err;
    }
  }
}

export const mediaRepository = new MediaRepository();
