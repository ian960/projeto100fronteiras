import { useCallback, useSyncExternalStore } from 'react';

// Night mode for the public site. Light is the default for everyone; a reader
// who turns night mode on keeps it in this browser (no account needed). The
// panel is never affected: only pages inside .tema-site change (index.css).

export type Theme = 'claro' | 'noite';

const KEY = 'sem-fronteiras:tema';

const listeners = new Set<() => void>();

function read(): Theme {
  try {
    return localStorage.getItem(KEY) === 'noite' ? 'noite' : 'claro';
  } catch {
    // Private mode or blocked storage: light, as for a first visit.
    return 'claro';
  }
}

let snapshot = read();

function write(theme: Theme) {
  snapshot = theme;
  try {
    if (theme === 'noite') localStorage.setItem(KEY, theme);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: the choice lasts for this visit only.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  // Switching in one tab switches the others.
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) {
      snapshot = read();
      listener();
    }
  };
  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  const toggle = useCallback(() => write(snapshot === 'noite' ? 'claro' : 'noite'), []);
  return { theme, toggle };
}
