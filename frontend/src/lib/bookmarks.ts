import { useCallback, useSyncExternalStore } from 'react';

// "Salvar para ler depois" lives in the reader's own browser: no account, no
// email, no personal data on the server. The backend only resolves the ids
// (GET /api/posts/by-ids).

const KEY = 'sem-fronteiras:salvos';
const MAX = 50; // the API resolves at most 50 ids per request

const listeners = new Set<() => void>();

function read(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    // Private mode or blocked storage: behave as an empty list instead of crashing.
    return [];
  }
}

let snapshot = read();

function write(ids: string[]) {
  snapshot = ids;
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Storage unavailable: keep the in-memory list for this visit.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  // Saving in one tab updates the others.
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

export function useBookmarks() {
  const ids = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);

  const toggle = useCallback((id: string) => {
    const current = read();
    write(current.includes(id) ? current.filter((item) => item !== id) : [id, ...current].slice(0, MAX));
  }, []);

  const remove = useCallback((id: string) => {
    write(read().filter((item) => item !== id));
  }, []);

  return { ids, isSaved: (id: string) => ids.includes(id), toggle, remove };
}
