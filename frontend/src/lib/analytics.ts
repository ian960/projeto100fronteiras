import { useSyncExternalStore } from 'react';

// Google Analytics 4: how many people read the site, and what they read.
//
// Off unless VITE_GA_ID (G-XXXXXXX) was set when the site was built. On the
// computer the .env leaves it empty, so test visits are never counted.
//
// LGPD: GA uses cookies, so nothing from Google loads until the reader says
// yes on the cookie notice (CookieBanner.tsx). Saying no loads nothing.
//
// Only the public site is measured: SiteLayout sends the page views, and the
// panel (/painel) never does.

export const GA_ID = (import.meta.env.VITE_GA_ID as string | undefined)?.trim() || '';

export type Consent = 'aceito' | 'recusado' | null;

const KEY = 'sem-fronteiras:cookies';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    [disableFlag: `ga-disable-${string}`]: boolean | undefined;
  }
}

// ── The reader's choice ──────────────────────────────────────────────────────

const listeners = new Set<() => void>();

function read(): Consent {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'aceito' || value === 'recusado' ? value : null;
  } catch {
    // Storage blocked: ask again on each visit, and measure nothing meanwhile.
    return null;
  }
}

let snapshot = read();

export function setConsent(consent: Consent) {
  snapshot = consent;
  try {
    if (consent) localStorage.setItem(KEY, consent);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: the choice lasts for this visit only.
  }
  if (consent !== 'aceito') stopMeasuring();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useConsent() {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

// ── Google's script ──────────────────────────────────────────────────────────

let loaded = false;

// Loads gtag.js once. Its usual snippet is an inline <script>, which the
// Content-Security-Policy (script-src 'self') blocks, so the same lines run
// here instead.
function load() {
  if (loaded) return;
  loaded = true;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // gtag.js expects the arguments object itself, not an array.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  // Measuring visits only: nothing for ads until the site asks for that.
  window.gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  window.gtag('js', new Date());
  // The page views are sent by trackPage, one per screen. Without this GA
  // would count the first one twice.
  window.gtag('config', GA_ID, { send_page_view: false });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(script);
}

// Google's official switch: while it is true, gtag.js sends nothing at all
// (not even its own scroll or click events).
function setPaused(paused: boolean) {
  if (GA_ID) window[`ga-disable-${GA_ID}`] = paused;
}

// Called when the reader leaves the public site (into the panel).
export function pauseMeasuring() {
  setPaused(true);
}

// The reader said no after having said yes: stop, and remove GA's cookies.
function stopMeasuring() {
  setPaused(true);
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0]!.trim();
    if (name === '_ga' || name.startsWith('_ga_')) {
      const host = window.location.hostname;
      for (const domain of [host, `.${host}`, `.${host.split('.').slice(-2).join('.')}`]) {
        document.cookie = `${name}=; Max-Age=0; path=/; domain=${domain}`;
      }
      document.cookie = `${name}=; Max-Age=0; path=/`;
    }
  }
}

let lastPath = '';

// One page view. React Router changes the address without reloading the
// page, so GA would not notice on its own.
export function trackPage(path: string) {
  if (!GA_ID || snapshot !== 'aceito' || path.startsWith('/painel')) return;
  load();
  setPaused(false);
  // React's StrictMode runs effects twice in development.
  if (path === lastPath) return;
  lastPath = path;
  window.gtag!('event', 'page_view', {
    page_path: path,
    page_location: window.location.origin + path,
    page_title: document.title,
  });
}
