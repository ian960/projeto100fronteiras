import sanitize from 'sanitize-html';
import { getCloudinarySettings } from '../../config/cloudinary';
import {
  BODY_IMAGE_SIZES,
  imageSrcset,
  imageUrl,
  parseOwnImageUrl,
} from '../../modules/media/media.urls';

// This list and the Quill `formats` option in the admin panel must stay in
// sync. If they diverge, the writer either loses formatting without knowing
// why, or something the editor allows slips through unsanitized.
export const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
  'ul', 'ol', 'li', 'a', 'blockquote', 'h2', 'h3',
  'img',
];

// Width used for the src of a photo inside the text. Browsers that read
// srcset (all current ones) pick a better size from the list instead.
const BODY_IMAGE_WIDTH = 1200;

// A photo inside the text is kept only if it is one of ours: uploaded to our
// Cloudinary, in our folder. Its URL is rebuilt from scratch, so whatever
// transformation was in the pasted URL is replaced by ours, and it gains a
// srcset and lazy loading. Any other <img> loses its src and is dropped.
function transformImage(_tagName: string, attribs: sanitize.Attributes): sanitize.Tag {
  const config = getCloudinarySettings();
  const ref = config && attribs.src ? parseOwnImageUrl(config, attribs.src) : null;

  if (!config || !ref) {
    return { tagName: 'img', attribs: {} };
  }

  return {
    tagName: 'img',
    attribs: {
      src: imageUrl(config, ref, BODY_IMAGE_WIDTH),
      srcset: imageSrcset(config, ref, null),
      sizes: BODY_IMAGE_SIZES,
      alt: (attribs.alt ?? '').slice(0, 300),
      loading: 'lazy',
      decoding: 'async',
    },
  };
}

export function sanitizePostContent(html: string): string {
  return sanitize(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'srcset', 'sizes', 'alt', 'loading', 'decoding'],
    },
    // Anything else (javascript:, data:) is dropped.
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    transformTags: {
      // External links opened in a new tab must not be able to reach
      // window.opener — that is a real tab-nabbing vector.
      a: sanitize.simpleTransform('a', { rel: 'noopener noreferrer' }),
      img: transformImage,
    },
    // An <img> left without src by transformImage is removed entirely.
    exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
    // No <iframe> on purpose. Video is a field of the post (YouTube id or an
    // uploaded file) and the player is built by the template.
  }).trim();
}

// "Is there anything left once the tags are gone?" A body of "<p><br></p>"
// is what Quill produces for an empty editor, and it must not count as filled.
export function isHtmlEmpty(html: string): boolean {
  return sanitize(html, { allowedTags: [], allowedAttributes: {} }).trim().length === 0;
}
