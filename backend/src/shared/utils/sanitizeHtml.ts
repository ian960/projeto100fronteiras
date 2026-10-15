import sanitize from 'sanitize-html';

// This list and the Quill `formats` option in the admin panel must stay in
// sync. If they diverge, the writer either loses formatting without knowing
// why, or something the editor allows slips through unsanitized.
export const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
  'ul', 'ol', 'li', 'a', 'blockquote', 'h2', 'h3',
];

export function sanitizePostContent(html: string): string {
  return sanitize(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
    },
    // Anything else (javascript:, data:) is dropped.
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      // External links opened in a new tab must not be able to reach
      // window.opener — that is a real tab-nabbing vector.
      a: sanitize.simpleTransform('a', { rel: 'noopener noreferrer' }),
    },
    // No <iframe> on purpose. Video lives in videoUrl/videoProvider and the
    // embed is built by the template, never pasted into the body.
  }).trim();
}

// "Is there anything left once the tags are gone?" A body of "<p><br></p>"
// is what Quill produces for an empty editor, and it must not count as filled.
export function isHtmlEmpty(html: string): boolean {
  return sanitize(html, { allowedTags: [], allowedAttributes: {} }).trim().length === 0;
}
