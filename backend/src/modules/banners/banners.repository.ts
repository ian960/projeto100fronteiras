import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import type { BannerSlot } from '../../shared/types/enums';
import { mediaSelect } from '../media/media.select';
import type { IBanner } from './banners.types';

export type BannerData = {
  advertiser: string;
  linkUrl: string;
  slot: BannerSlot;
  imageId: string;
  mobileImageId: string | null;
  startsAt: Date;
  endsAt: Date;
  active: boolean;
};

const bannerSelect = {
  id: true,
  advertiser: true,
  linkUrl: true,
  slot: true,
  imageId: true,
  mobileImageId: true,
  startsAt: true,
  endsAt: true,
  active: true,
  impressions: true,
  clicks: true,
  createdAt: true,
  updatedAt: true,
  image: { select: mediaSelect },
  mobileImage: { select: mediaSelect },
} as const;

// Switched on and inside its period at this moment.
const running = (now: Date) => ({ active: true, startsAt: { lte: now }, endsAt: { gt: now } });

export class BannersRepository {
  async findRunning(now: Date): Promise<IBanner[]> {
    try {
      return (await prisma.banner.findMany({
        where: running(now),
        select: bannerSelect,
        orderBy: { createdAt: 'asc' },
      })) as IBanner[];
    } catch (err) {
      logger.error('Failed to list running banners', err);
      throw err;
    }
  }

  // Panel: newest first.
  async findAll(): Promise<IBanner[]> {
    try {
      return (await prisma.banner.findMany({
        select: bannerSelect,
        orderBy: { createdAt: 'desc' },
      })) as IBanner[];
    } catch (err) {
      logger.error('Failed to list banners', err);
      throw err;
    }
  }

  async findById(id: string): Promise<IBanner | null> {
    try {
      return (await prisma.banner.findUnique({ where: { id }, select: bannerSelect })) as IBanner | null;
    } catch (err) {
      logger.error('Failed to find banner', err);
      throw err;
    }
  }

  async create(data: BannerData): Promise<IBanner> {
    try {
      return (await prisma.banner.create({ data, select: bannerSelect })) as IBanner;
    } catch (err) {
      logger.error('Failed to create banner', err);
      throw err;
    }
  }

  async update(id: string, data: Partial<BannerData>): Promise<IBanner> {
    try {
      return (await prisma.banner.update({ where: { id }, data, select: bannerSelect })) as IBanner;
    } catch (err) {
      logger.error('Failed to update banner', err);
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await prisma.banner.delete({ where: { id } });
    } catch (err) {
      logger.error('Failed to delete banner', err);
      throw err;
    }
  }

  // One UPDATE for the whole page view. Banners no longer running are not
  // counted, so an old tab left open does not inflate the report.
  async addImpressions(ids: string[], now: Date): Promise<void> {
    try {
      await prisma.banner.updateMany({
        where: { id: { in: ids }, ...running(now) },
        data: { impressions: { increment: 1 } },
      });
    } catch (err) {
      logger.error('Failed to count banner impressions', err);
      throw err;
    }
  }

  async addClick(id: string, now: Date): Promise<void> {
    try {
      await prisma.banner.updateMany({
        where: { id, ...running(now) },
        data: { clicks: { increment: 1 } },
      });
    } catch (err) {
      logger.error('Failed to count a banner click', err);
      throw err;
    }
  }
}

export const bannersRepository = new BannersRepository();
