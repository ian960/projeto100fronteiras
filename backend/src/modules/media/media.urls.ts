import type { CloudinaryConfig } from '../../config/env';
import { getCloudinarySettings } from '../../config/cloudinary';
import { MediaKind } from '../../shared/types/enums';
import type { IMedia, IMediaView } from './media.types';

// Every Cloudinary URL in the project is built here.
//
// A delivery URL is   <base>/<cloud>/<image|video>/upload/<transformation>/v<version>/<publicId>.<ext>
// and the transformation is applied by Cloudinary on the first request, then
// cached. Changing a size below is a code change, never a data migration.

// Widths offered in srcset. The browser picks the smallest one that fills the
// slot, so a phone downloads 480px and a desktop 1200px of the same photo.
export const IMAGE_WIDTHS = [480, 800, 1200, 1600] as const;

// f_auto: AVIF/WebP/JPEG, whichever this browser handles best.
// q_auto: compression chosen per image. c_limit: never enlarge.
const WEB = 'f_auto,q_auto';

type Ref = Pick<IMedia, 'publicId' | 'version' | 'format'>;

function base(config: CloudinaryConfig, resourceType: 'image' | 'video'): string {
  return `${config.deliveryBase}/${config.cloudName}/${resourceType}/upload`;
}

function asset(ref: Ref, extension = ref.format): string {
  return `v${ref.version}/${ref.publicId}.${extension}`;
}

export function imageUrl(config: CloudinaryConfig, ref: Ref, width: number): string {
  return `${base(config, 'image')}/${WEB},c_limit,w_${width}/${asset(ref)}`;
}

// Only widths the original can fill. A 900px photo gets 480 and 800, plus
// its own width, instead of being blown up to 1600.
export function imageWidths(originalWidth: number | null): number[] {
  if (!originalWidth) return [...IMAGE_WIDTHS];
  const fitting: number[] = IMAGE_WIDTHS.filter((width) => width <= originalWidth);
  if (fitting.length === 0 || fitting[fitting.length - 1]! < originalWidth) {
    fitting.push(Math.min(originalWidth, IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1]!));
  }
  return [...new Set(fitting)];
}

export function imageSrcset(config: CloudinaryConfig, ref: Ref, originalWidth: number | null): string {
  return imageWidths(originalWidth)
    .map((width) => `${imageUrl(config, ref, width)} ${width}w`)
    .join(', ');
}

// Square, centred on the face Cloudinary detects. For bylines and author pages.
export function avatarUrl(config: CloudinaryConfig, ref: Ref): string {
  return `${base(config, 'image')}/c_thumb,g_face,w_256,h_256,${WEB}/${asset(ref)}`;
}

export function presentMedia(media: IMedia): IMediaView {
  const facts = {
    id: media.id,
    kind: media.kind,
    originalName: media.originalName,
    format: media.format,
    bytes: media.bytes,
    width: media.width,
    height: media.height,
    durationSec: media.durationSec,
    pages: media.pages,
  };

  const config = getCloudinarySettings();

  // Rows can only exist if Cloudinary was configured when they were created.
  // If it has since been switched off, say so with empty URLs instead of
  // crashing every page that shows a picture.
  if (!config) {
    return { ...facts, url: '', thumbnailUrl: '', srcset: null, posterUrl: null };
  }

  if (media.kind === MediaKind.VIDEO) {
    const video = base(config, 'video');
    return {
      ...facts,
      // q_auto + .mp4: Cloudinary converts .mov/.webm to H.264 mp4, which
      // every browser plays.
      url: `${video}/q_auto/${asset(media, 'mp4')}`,
      thumbnailUrl: `${video}/so_0,c_fill,w_480,h_270,q_auto/${asset(media, 'jpg')}`,
      posterUrl: `${video}/so_0,c_limit,w_1280,q_auto/${asset(media, 'jpg')}`,
      srcset: null,
    };
  }

  if (media.kind === MediaKind.DOCUMENT) {
    const image = base(config, 'image');
    return {
      ...facts,
      // The original PDF. Requires "Allow delivery of PDF and ZIP files" in
      // the Cloudinary console (Settings → Security), or it answers 401.
      url: `${image}/${asset(media, 'pdf')}`,
      thumbnailUrl: `${image}/pg_1,c_limit,w_480,${WEB}/${asset(media, 'jpg')}`,
      srcset: null,
      posterUrl: null,
    };
  }

  return {
    ...facts,
    url: imageUrl(config, media, imageWidths(media.width).at(-1)!),
    thumbnailUrl: imageUrl(config, media, 480),
    srcset: imageSrcset(config, media, media.width),
    posterUrl: null,
  };
}

// ── photos inside the text ────────────────────────────────────────────────

// The editor stores <img src="…"> pointing at a Cloudinary image. This reads
// such a URL back, and only accepts it when it is ours: our delivery host, our
// cloud, our folder. Anything else is an image from elsewhere and is dropped
// by the sanitizer.
const URL_PATTERN = /^\/image\/upload\/(?:[^/]+\/)?v(\d+)\/(.+)\.([a-z0-9]+)$/i;

export function parseOwnImageUrl(config: CloudinaryConfig, url: string): Ref | null {
  const prefix = `${config.deliveryBase}/${config.cloudName}`;
  if (!url.startsWith(`${prefix}/`)) return null;

  const match = url.slice(prefix.length).match(URL_PATTERN);
  if (!match) return null;

  const [, version, publicId, format] = match;
  if (!publicId!.startsWith(`${config.folder}/`) || publicId!.includes('..')) return null;

  return { version: version!, publicId: publicId!, format: format!.toLowerCase() };
}

// Article column: about 720px on desktop, full width on a phone.
export const BODY_IMAGE_SIZES = '(min-width: 768px) 720px, 100vw';
