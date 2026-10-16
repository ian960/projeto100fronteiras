import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, cx } from '../components/ui';
import { statusLabel } from '../lib/format';
import type { PostStatus } from '../lib/types';

// ── Page header ──────────────────────────────────────────────────────────────

export function PanelHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[0.9375rem] text-tinta-suave">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

// ── Status ───────────────────────────────────────────────────────────────────

const statusTone: Record<PostStatus, string> = {
  draft: 'bg-superficie text-tinta-suave',
  pending: 'bg-aviso-claro text-aviso',
  published: 'bg-ok-claro text-ok',
};

export function StatusPill({ status }: { status: PostStatus }) {
  return (
    <span className={cx('inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold', statusTone[status])}>
      {statusLabel[status]}
    </span>
  );
}

export function TypePill({ type }: { type: 'news' | 'column' }) {
  return type === 'column' ? (
    <span className="inline-flex h-6 items-center rounded-full bg-mata-claro px-2.5 text-xs font-semibold text-mata">Opinião</span>
  ) : (
    <span className="inline-flex h-6 items-center rounded-full bg-anil/10 px-2.5 text-xs font-semibold text-anil">Notícia</span>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────
// The native <dialog> gives focus trapping, Esc to close and an inert page
// behind it for free.

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={titleId}
      className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-xl border border-linha bg-papel p-0 text-tinta shadow-2xl backdrop:bg-tinta/40"
    >
      {open && (
        <div className="p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-xl font-semibold">
              {title}
            </h2>
            <button type="button" onClick={onClose} className="-m-1 rounded p-1 text-tinta-suave hover:text-tinta" aria-label="Fechar">
              <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

// ── Two-step destructive action ──────────────────────────────────────────────
// No browser confirm(): the second click is the confirmation, in place.

export function ConfirmButton({ label, confirmLabel, onConfirm, busy, small = true, disabled }: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  busy?: boolean;
  small?: boolean;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(timer);
  }, [armed]);

  if (!armed) {
    return (
      <Button variant="perigo" small={small} disabled={disabled} onClick={() => setArmed(true)}>
        {label}
      </Button>
    );
  }

  return (
    <span className="inline-flex gap-2">
      <Button
        variant="perigo"
        small={small}
        busy={busy}
        className="bg-alerta text-white hover:bg-alerta/90"
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="secundario" small={small} onClick={() => setArmed(false)}>
        Cancelar
      </Button>
    </span>
  );
}

// ── Toasts ───────────────────────────────────────────────────────────────────

type Toast = { id: number; message: string; tone: 'ok' | 'erro' };
const ToastContext = createContext<(message: string, tone?: Toast['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cx(
              'pointer-events-auto rounded-md px-4 py-2.5 text-[0.9375rem] font-medium shadow-lg',
              toast.tone === 'ok' ? 'bg-tinta text-white' : 'bg-alerta text-white',
            )}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
