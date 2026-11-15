import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, post } from './api';

// Push notifications on the reader's side. Always the reader's own choice:
//   - nothing happens when a page opens: no permission prompt, not even the
//     service worker. Only a click on "Ativar notificações" registers
//     /sw.js, asks the browser for permission and sends the subscription to
//     the API (backend/src/modules/push);
//   - "Desativar notificações" cancels it in the browser and deletes it from
//     the API.
// Notifications belong to the browser, not to the account: someone without
// an account can turn them on, and each phone or computer has its own switch.

export type PushState =
  // Checking the browser.
  | 'loading'
  // The server has no VAPID keys yet, or this browser cannot do push at all.
  | 'unsupported'
  // An iPhone/iPad in Safari: works only from the Home Screen icon.
  | 'ios-needs-home-screen'
  // The reader (or the browser) blocked notifications for this site.
  | 'blocked'
  | 'off'
  | 'on';

type PushConfig = { enabled: boolean; publicKey: string | null };

const SW_URL = '/sw.js';
// The last time this browser reminded the API of its subscription. Once a day
// at most: if the API ever dropped it (after failures), it comes back.
const RESYNC_KEY = 'sem-fronteiras:push-sync';
const DAY_MS = 24 * 60 * 60 * 1000;

// The browser talks to its push service (Google, Apple...) to subscribe. If
// that never answers (no internet, a blocked network), give up instead of
// leaving the button spinning.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('O navegador não conseguiu falar com o serviço de notificações. Tente de novo mais tarde.')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function browserSupportsPush(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS says it is a Mac; a Mac has no touch screen.
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// The key comes as base64url; the browser wants the bytes.
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  // getRegistration only looks: it never installs the service worker.
  const registration = await navigator.serviceWorker.getRegistration('/');
  return (await registration?.pushManager.getSubscription()) ?? null;
}

function remember(): void {
  try {
    localStorage.setItem(RESYNC_KEY, String(Date.now()));
  } catch {
    // Private mode: it just syncs again next time.
  }
}

function syncedRecently(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(RESYNC_KEY) ?? 0) < DAY_MS;
  } catch {
    return false;
  }
}

// What the browser says when subscribing fails, in Portuguese.
function enableError(err: unknown): string {
  const message = err instanceof Error ? err.message : '';
  if (/incognito|private/i.test(message)) return 'O navegador não permite notificações em janela anônima.';
  if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'NotAllowedError')) {
    return 'O navegador não conseguiu ativar as notificações. Confira se ele permite notificações deste site e tente de novo.';
  }
  // Already in Portuguese: ours (withTimeout) or the API's (ApiError).
  if (message && /[ãçéêóõá]|não/i.test(message)) return message;
  return 'Não foi possível ativar as notificações. Tente de novo mais tarde.';
}

export function usePushConfig() {
  return useQuery({
    queryKey: ['push', 'config'],
    queryFn: () => get<PushConfig>('/push/config'),
    staleTime: 60 * 60_000,
    // Without it the button simply stays hidden.
    retry: false,
  });
}

// The switch. Several buttons on one page (footer, Minha conta) share the
// state through a window event.
const CHANGED = 'sem-fronteiras:push-changed';

export function usePush() {
  const config = usePushConfig();
  const [state, setState] = useState<PushState>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    if (config.isPending) return;
    if (!config.data?.enabled) return setState('unsupported');
    if (!browserSupportsPush()) return setState(isIos() && !isStandalone() ? 'ios-needs-home-screen' : 'unsupported');
    if (Notification.permission === 'denied') return setState('blocked');

    try {
      const subscription = await currentSubscription();
      if (subscription && Notification.permission === 'granted') {
        setState('on');
        if (!syncedRecently()) {
          post('/push/subscribe', subscription.toJSON()).then(remember, () => undefined);
        }
      } else {
        setState('off');
      }
    } catch {
      setState('off');
    }
  }, [config.isPending, config.data?.enabled]);

  useEffect(() => {
    void check();
    const listener = () => void check();
    window.addEventListener(CHANGED, listener);
    return () => window.removeEventListener(CHANGED, listener);
  }, [check]);

  const enable = useCallback(async () => {
    const key = config.data?.publicKey;
    if (!key) return;
    setBusy(true);
    setError(null);
    try {
      // Only here, after the click, does the browser ask.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off');
        return;
      }
      await navigator.serviceWorker.register(SW_URL, { scope: '/' });
      const registration = await withTimeout(navigator.serviceWorker.ready, 15_000);
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await withTimeout(registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }), 20_000));
      await post('/push/subscribe', subscription.toJSON());
      remember();
      setState('on');
      window.dispatchEvent(new Event(CHANGED));
    } catch (err) {
      setError(enableError(err));
    } finally {
      setBusy(false);
    }
  }, [config.data?.publicKey]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        const { endpoint } = subscription;
        await subscription.unsubscribe();
        // Off in the browser already; the API copy goes even if this fails
        // (the next send gets "gone" from the push service and deletes it).
        await post('/push/unsubscribe', { endpoint }).catch(() => undefined);
      }
      setState('off');
      window.dispatchEvent(new Event(CHANGED));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Não foi possível desativar as notificações.');
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, error, enable, disable };
}

// The admin's "Testar neste navegador": the address of this browser's
// subscription, if it has one.
export async function thisBrowserEndpoint(): Promise<string | null> {
  if (!browserSupportsPush()) return null;
  return (await currentSubscription())?.endpoint ?? null;
}
