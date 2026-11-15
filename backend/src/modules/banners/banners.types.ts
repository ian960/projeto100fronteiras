import type { BannerSlot } from '../../shared/types/enums';
import type { IMedia, IMediaView } from '../media/media.types';

// One row of the banners table, with its pictures loaded.
export interface IBanner {
  id: string;
  advertiser: string;
  linkUrl: string;
  slot: BannerSlot;
  imageId: string;
  mobileImageId: string | null;
  startsAt: Date;
  endsAt: Date;
  active: boolean;
  impressions: number;
  clicks: number;
  createdAt: Date;
  updatedAt: Date;
  image: IMedia;
  mobileImage: IMedia | null;
}

// The picture as the site draws it. width and height let the browser keep the
// banner's space before the file arrives, so nothing jumps.
export type IBannerPicture = Pick<IMediaView, 'url' | 'srcset' | 'width' | 'height'>;

// What the public site gets: only what it needs to draw and link the banner.
// No counts, no dates.
export type IBannerPublic = {
  id: string;
  slot: BannerSlot;
  advertiser: string;
  linkUrl: string;
  image: IBannerPicture;
  mobileImage: IBannerPicture | null;
};

// What the panel gets: everything, plus the files for the edit form.
export type IBannerAdmin = Omit<IBanner, 'image' | 'mobileImage'> & {
  image: IMediaView;
  mobileImage: IMediaView | null;
};
