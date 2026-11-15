import { z } from 'zod';
import { BannerSlot } from '../../shared/types/enums';

const slot = z.enum([
  BannerSlot.HOME_TOP,
  BannerSlot.HOME_MIDDLE,
  BannerSlot.ARTICLE_MIDDLE,
  BannerSlot.ARTICLE_END,
  BannerSlot.SITE_FOOTER,
]);

// Only http(s): a "javascript:" link on a banner would run on the site.
const linkUrl = z.url({ protocol: /^https?$/, error: 'Use a link starting with http:// or https://.' }).max(2000);

// Both optional: a banner can be just a picture. An empty field means "none".
const emptyToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value);

const fields = {
  advertiser: z.preprocess(emptyToNull, z.string().trim().min(2).max(120).nullish()),
  linkUrl: z.preprocess(emptyToNull, linkUrl.nullish()),
  slot,
  imageId: z.uuid(),
  mobileImageId: z.uuid().nullish(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  active: z.boolean(),
};

const endsAfterStart = (data: { startsAt?: Date; endsAt?: Date }) =>
  !data.startsAt || !data.endsAt || data.endsAt > data.startsAt;

const periodError = { message: 'The end must come after the start.', path: ['endsAt'] };

export const createBannerSchema = z.object({
  body: z
    .object({ ...fields, active: fields.active.optional() })
    .refine(endsAfterStart, periodError),
});

export const updateBannerSchema = z.object({
  params: z.object({ id: z.uuid() }),
  body: z
    .object({
      advertiser: fields.advertiser,
      linkUrl: fields.linkUrl,
      slot: fields.slot.optional(),
      imageId: fields.imageId.optional(),
      mobileImageId: fields.mobileImageId,
      startsAt: fields.startsAt.optional(),
      endsAt: fields.endsAt.optional(),
      active: fields.active.optional(),
    })
    .refine(endsAfterStart, periodError)
    .refine((data) => Object.keys(data).length > 0, {
      message: 'Provide at least one field to update.',
    }),
});

export const bannerIdParamSchema = z.object({
  params: z.object({ id: z.uuid() }),
});

// The site sends the banners a page showed, at most one per slot.
export const impressionsSchema = z.object({
  body: z.object({ ids: z.array(z.uuid()).min(1).max(10) }),
});
