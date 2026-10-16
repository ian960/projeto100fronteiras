import { getCloudinarySettings } from '../../config/cloudinary';
import { mediaSelect } from '../media/media.select';
import type { IMedia } from '../media/media.types';
import { avatarUrl } from '../media/media.urls';
import type { IAuthorSummary } from './authors.types';

// The byline as other modules embed it (posts, users). The photo comes in as
// a media row and leaves as a ready-made avatar URL.
export const authorSummarySelect = {
  id: true,
  name: true,
  slug: true,
  columnTitle: true,
  photoId: true,
  photo: { select: mediaSelect },
} as const;

export function photoUrlOf(photo: IMedia | null | undefined): string | null {
  const config = getCloudinarySettings();
  return photo && config ? avatarUrl(config, photo) : null;
}

type SummaryRow = Omit<IAuthorSummary, 'photoUrl'> & { photo: IMedia | null };

export function toAuthorSummary(row: SummaryRow): IAuthorSummary {
  const { photo, ...author } = row;
  return { ...author, photoUrl: photoUrlOf(photo) };
}
