const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

// Accepts a bare id, youtu.be/<id>, /watch?v=<id>, /embed/<id> and /shorts/<id>.
// Returns the 11-char id, or null when nothing usable is found.
export function extractYoutubeId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  if (ID_PATTERN.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0] ?? '';
    return ID_PATTERN.test(id) ? id : null;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    const fromQuery = url.searchParams.get('v');
    if (fromQuery && ID_PATTERN.test(fromQuery)) return fromQuery;

    const segments = url.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1] ?? '';
    if ((segments[0] === 'embed' || segments[0] === 'shorts' || segments[0] === 'live') && ID_PATTERN.test(last)) {
      return last;
    }
  }

  return null;
}
