import { NotFound, ValidationError } from '../../shared/errors/AppError';
import { MediaKind } from '../../shared/types/enums';
import type { SessionUser } from '../auth/auth.types';
import { mediaService } from '../media/media.service';
import { presentMedia } from '../media/media.urls';
import type { IMedia } from '../media/media.types';
import { bannersRepository, type BannerData } from './banners.repository';
import type { IBanner, IBannerAdmin, IBannerPicture, IBannerPublic } from './banners.types';

export type CreateBannerInput = Omit<BannerData, 'mobileImageId' | 'active'> & {
  mobileImageId?: string | null;
  active?: boolean;
};
export type UpdateBannerInput = Partial<CreateBannerInput>;

function picture(media: IMedia): IBannerPicture {
  const { url, srcset, width, height } = presentMedia(media);
  return { url, srcset, width, height };
}

function toPublic(banner: IBanner): IBannerPublic {
  return {
    id: banner.id,
    slot: banner.slot,
    advertiser: banner.advertiser,
    linkUrl: banner.linkUrl,
    image: picture(banner.image),
    mobileImage: banner.mobileImage ? picture(banner.mobileImage) : null,
  };
}

function toAdmin(banner: IBanner): IBannerAdmin {
  return {
    ...banner,
    image: presentMedia(banner.image),
    mobileImage: banner.mobileImage ? presentMedia(banner.mobileImage) : null,
  };
}

export class BannersService {
  // Everything running right now, every slot. The site picks one per slot
  // (at random when there are several), so one request serves the whole page.
  async listRunning(now = new Date()): Promise<IBannerPublic[]> {
    return (await bannersRepository.findRunning(now)).map(toPublic);
  }

  async listAll(): Promise<IBannerAdmin[]> {
    return (await bannersRepository.findAll()).map(toAdmin);
  }

  async create(actor: SessionUser, input: CreateBannerInput): Promise<IBannerAdmin> {
    await this.checkImages(actor, input);

    const banner = await bannersRepository.create({
      advertiser: input.advertiser,
      linkUrl: input.linkUrl,
      slot: input.slot,
      imageId: input.imageId,
      mobileImageId: input.mobileImageId ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      active: input.active ?? true,
    });

    return toAdmin(banner);
  }

  async update(actor: SessionUser, id: string, input: UpdateBannerInput): Promise<IBannerAdmin> {
    const current = await bannersRepository.findById(id);
    if (!current) throw new NotFound('Banner not found.');

    // Only one of the two dates may come in the request: check the pair as it
    // will be saved.
    const startsAt = input.startsAt ?? current.startsAt;
    const endsAt = input.endsAt ?? current.endsAt;
    if (endsAt <= startsAt) {
      throw new ValidationError('The end must come after the start.', { endsAt: 'The end must come after the start.' });
    }

    await this.checkImages(actor, input);

    const banner = await bannersRepository.update(id, {
      ...(input.advertiser !== undefined ? { advertiser: input.advertiser } : {}),
      ...(input.linkUrl !== undefined ? { linkUrl: input.linkUrl } : {}),
      ...(input.slot !== undefined ? { slot: input.slot } : {}),
      ...(input.imageId !== undefined ? { imageId: input.imageId } : {}),
      ...(input.mobileImageId !== undefined ? { mobileImageId: input.mobileImageId } : {}),
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
      ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    });

    return toAdmin(banner);
  }

  // The files stay in the media library; they can be deleted there once
  // nothing uses them.
  async remove(id: string): Promise<void> {
    const banner = await bannersRepository.findById(id);
    if (!banner) throw new NotFound('Banner not found.');
    await bannersRepository.delete(id);
  }

  async countImpressions(ids: string[]): Promise<void> {
    await bannersRepository.addImpressions([...new Set(ids)], new Date());
  }

  async countClick(id: string): Promise<void> {
    await bannersRepository.addClick(id, new Date());
  }

  private async checkImages(actor: SessionUser, input: UpdateBannerInput): Promise<void> {
    if (input.imageId) {
      await mediaService.requireUsable(actor, input.imageId, MediaKind.IMAGE, 'imageId');
    }
    if (input.mobileImageId) {
      await mediaService.requireUsable(actor, input.mobileImageId, MediaKind.IMAGE, 'mobileImageId');
    }
  }
}

export const bannersService = new BannersService();
