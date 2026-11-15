import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cx } from '../components/ui';
import type { Banner, BannerSlot as Slot } from '../lib/types';

// Advertisers' banners, managed by the admin in the panel (Anunciantes).
//
// The one rule that matters: a place with no banner running draws NOTHING.
// No box, no "Publicidade" label, no reserved height, so the site looks
// exactly as it did before banners existed. <BannerSlot> returns null in
// that case, and every page puts it where a null leaves no trace.
//
// One request brings every banner running now, for every place. Pages that
// show banners near the top wait for it together with their own content
// (useBannersReady), so a banner never pushes the text down after it loads.

// If the API is slow or old (no /api/banners yet), the site goes on without
// banners instead of waiting.
const TIMEOUT_MS = 4000;

async function fetchBanners(): Promise<Banner[]> {
  try {
    const response = await fetch('/api/banners', {
      credentials: 'same-origin',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { data?: { banners?: Banner[] } };
    return body.data?.banners ?? [];
  } catch {
    return [];
  }
}

export function useBanners() {
  return useQuery({
    queryKey: ['site', 'banners'],
    queryFn: fetchBanners,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

// True once the banners are known (or given up on). Never stays false longer
// than TIMEOUT_MS.
export function useBannersReady(): boolean {
  return !useBanners().isPending;
}

// The banner for one place on this page view. Several banners in the same
// place take turns: each page view draws one at random.
export function useSlotBanner(slot: Slot): Banner | null {
  const { data } = useBanners();
  return useMemo(() => {
    const candidates = (data ?? []).filter((banner) => banner.slot === slot);
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)]!;
  }, [data, slot]);
}

// ── counting ─────────────────────────────────────────────────────────────────

// Views are sent together, a moment after the page settles: one request per
// page, not one per banner.
let queue: string[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

function send(path: string, body?: unknown) {
  // keepalive: the count still arrives when the click opens another tab or
  // the reader leaves the page.
  fetch(`/api${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => undefined);
}

function flush() {
  clearTimeout(timer);
  timer = undefined;
  const ids = [...new Set(queue)].slice(0, 10);
  queue = [];
  if (ids.length > 0) send('/banners/impressions', { ids });
}

function countView(id: string) {
  queue.push(id);
  clearTimeout(timer);
  timer = setTimeout(flush, 1500);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush);
}

// ── drawing ──────────────────────────────────────────────────────────────────

// Counted as seen once half of it was on screen, once per page view.
function useViewCount(id: string) {
  const ref = useRef<HTMLElement>(null);
  const counted = useRef<string | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || counted.current === id) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || counted.current === id) return;
        counted.current = id;
        countView(id);
        observer.disconnect();
      },
      { threshold: 0.5 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [id]);

  return ref;
}

export function BannerAd({ banner, className }: { banner: Banner; className?: string }) {
  const ref = useViewCount(banner.id);
  const { image, mobileImage } = banner;
  const picture = (
    <picture>
      {mobileImage && (
        <source
          media="(max-width: 639px)"
          srcSet={mobileImage.srcset ?? mobileImage.url}
          sizes="100vw"
          width={mobileImage.width ?? undefined}
          height={mobileImage.height ?? undefined}
        />
      )}
      {/* width and height let the browser hold the banner's shape before
          the file arrives. It is never stretched past its own size. */}
      <img
        src={image.url}
        srcSet={image.srcset ?? undefined}
        sizes="(min-width: 1152px) 1152px, 100vw"
        width={image.width ?? undefined}
        height={image.height ?? undefined}
        alt={banner.advertiser ?? 'Anúncio'}
        loading="lazy"
        decoding="async"
        className="mx-auto block h-auto max-w-full rounded-md"
      />
    </picture>
  );

  return (
    <aside ref={ref} aria-label="Publicidade" className={cx('text-center', className)}>
      <p className="mb-1.5 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-tinta-suave">Publicidade</p>
      {banner.linkUrl ? <BannerLink banner={banner}>{picture}</BannerLink> : picture}
    </aside>
  );
}

// The clickable version, for a banner with a link. Without one the picture
// is shown on its own: no hand cursor, nothing to click.
function BannerLink({ banner, children }: { banner: Banner; children: ReactNode }) {
  const onClick = () => send(`/banners/${banner.id}/click`);
  return (
    <a
      href={banner.linkUrl!}
      target="_blank"
      // sponsored: tells Google this is a paid link (no ranking passed).
      rel="sponsored noopener noreferrer"
      onClick={onClick}
      onAuxClick={(event) => event.button === 1 && onClick()}
      className="inline-block max-w-full align-top"
    >
      {children}
    </a>
  );
}

// A place for a banner. Nothing at all when no banner is running there.
export function BannerSlot({ slot, className }: { slot: Slot; className?: string }) {
  const banner = useSlotBanner(slot);
  if (!banner) return null;
  return <BannerAd key={banner.id} banner={banner} className={className} />;
}

// ── inside the text ──────────────────────────────────────────────────────────

// Splits a story's HTML in two after its middle paragraph, so a banner can go
// between the halves. Short texts (fewer than 4 paragraphs) are not split:
// a banner there would interrupt more than it earns.
export function splitInHalf(html: string): [string, string] | null {
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html');
  const nodes = Array.from(doc.body.childNodes);
  const paragraphs = nodes.filter((node) => node.nodeName === 'P');
  if (paragraphs.length < 4) return null;

  const cut = nodes.indexOf(paragraphs[Math.floor(paragraphs.length / 2) - 1]!) + 1;
  const first = doc.createElement('div');
  const second = doc.createElement('div');
  nodes.forEach((node, index) => (index < cut ? first : second).appendChild(node));
  return [first.innerHTML, second.innerHTML];
}
