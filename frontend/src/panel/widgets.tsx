import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, TextField, cx } from '../components/ui';
import { errorMessage } from '../lib/api';
import { statusLabel } from '../lib/format';
import { useHealth } from '../lib/hooks';
import type { PostStatus } from '../lib/types';
import { putFileWithProgress, requestVideoTicket, uploadImage } from './queries';

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

// ── Image: upload when R2 is on, a URL either way ────────────────────────────

export function ImageField({ label, value, onChange, folder, error, hint, alt, optional = true }: {
  label: string;
  optional?: boolean;
  value: string;
  onChange: (url: string) => void;
  folder: 'covers' | 'authors';
  error?: string;
  hint?: string;
  alt?: string;
}) {
  const { data: health } = useHealth();
  const uploadsOn = health?.uploads === 'r2';
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputId = useId();

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setUploadError(null);
    try {
      const image = await uploadImage(file, folder);
      onChange(image.url);
    } catch (err) {
      setUploadError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {value && (
        <img
          src={value}
          alt={alt ?? ''}
          className={cx('rounded-md border border-linha bg-superficie object-cover', folder === 'authors' ? 'size-24 rounded-full' : 'aspect-video w-full max-w-md')}
        />
      )}

      {uploadsOn && (
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor={inputId}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-linha bg-papel px-4 text-[0.9375rem] font-medium hover:border-tinta-suave"
          >
            {busy ? 'Enviando…' : value ? 'Trocar imagem' : 'Enviar imagem'}
          </label>
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="sr-only"
            disabled={busy}
            onChange={(event) => onFile(event.target.files?.[0])}
          />
          <span className="text-sm text-tinta-suave">JPEG, PNG ou WebP, até 8 MB. É redimensionada automaticamente.</span>
        </div>
      )}

      <TextField
        label={uploadsOn ? `${label} (ou cole o endereço)` : label}
        type="url"
        inputMode="url"
        placeholder="https://"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        error={uploadError ?? error}
        hint={[hint, uploadsOn ? null : 'O envio de arquivos ainda não está configurado neste servidor. Cole o endereço de uma imagem publicada na internet.'].filter(Boolean).join(' ') || undefined}
        optional={optional}
      />
    </div>
  );
}

// ── Video: YouTube link, or an mp4 sent straight to R2 ───────────────────────

export type VideoValue = { provider: '' | 'youtube' | 'r2'; url: string };

export function VideoField({ value, onChange, errors, disabled }: {
  value: VideoValue;
  onChange: (value: VideoValue) => void;
  errors?: { videoUrl?: string; videoProvider?: string };
  disabled?: boolean;
}) {
  const { data: health } = useHealth();
  const uploadsOn = health?.uploads === 'r2';
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileId = useId();

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploadError(null);

    // Checked here too, so a 300 MB phone recording fails in a second instead
    // of after the upload. The server enforces the same rules.
    if (file.type !== 'video/mp4') {
      setUploadError('Envie um arquivo .mp4. Vídeos .mov de iPhone não tocam em muitos navegadores: converta antes ou publique no YouTube.');
      return;
    }

    try {
      const ticket = await requestVideoTicket(file);
      if (file.size > ticket.maxBytes) {
        setUploadError(`O vídeo precisa ter menos de ${Math.round(ticket.maxBytes / 1024 / 1024)} MB.`);
        return;
      }
      setProgress(0);
      await putFileWithProgress(ticket.uploadUrl, file, setProgress);
      onChange({ provider: 'r2', url: ticket.publicUrl });
    } catch (err) {
      setUploadError(errorMessage(err));
    } finally {
      setProgress(null);
    }
  }

  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="mb-1.5 text-sm font-medium">
        Vídeo <span className="font-normal text-tinta-suave">(opcional)</span>
      </legend>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Origem do vídeo">
        {[
          { key: '', label: 'Sem vídeo' },
          { key: 'youtube', label: 'Link do YouTube' },
          { key: 'r2', label: 'Arquivo .mp4', off: !uploadsOn },
        ].map((option) => (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={value.provider === option.key}
            disabled={option.off}
            title={option.off ? 'O envio de arquivos ainda não está configurado neste servidor.' : undefined}
            onClick={() => onChange({ provider: option.key as VideoValue['provider'], url: option.key === value.provider ? value.url : '' })}
            className={cx(
              'h-9 rounded-full border px-3.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40',
              value.provider === option.key ? 'border-anil bg-anil text-white' : 'border-linha hover:border-tinta-suave',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {value.provider === 'youtube' && (
        <TextField
          label="Link do vídeo no YouTube"
          type="url"
          placeholder="https://www.youtube.com/watch?v=…"
          value={value.url}
          onChange={(event) => onChange({ provider: 'youtube', url: event.target.value })}
          error={errors?.videoUrl}
          hint="Pode colar o link de compartilhar, do navegador ou de um Short."
        />
      )}

      {value.provider === 'r2' && (
        <div className="flex flex-col gap-2">
          {value.url && <video src={value.url} controls preload="metadata" className="aspect-video w-full max-w-md rounded-md bg-tinta" />}
          <label
            htmlFor={fileId}
            className="inline-flex h-10 w-fit cursor-pointer items-center rounded-md border border-linha px-4 text-[0.9375rem] font-medium hover:border-tinta-suave"
          >
            {value.url ? 'Trocar arquivo' : 'Escolher arquivo .mp4'}
          </label>
          <input id={fileId} type="file" accept="video/mp4" className="sr-only" onChange={(event) => onFile(event.target.files?.[0])} />
          {progress !== null && (
            <div className="max-w-md">
              <div className="h-2 overflow-hidden rounded-full bg-superficie">
                <div className="h-full bg-anil transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className="mt-1 text-sm text-tinta-suave">Enviando: {Math.round(progress * 100)}%</p>
            </div>
          )}
          {(uploadError || errors?.videoUrl) && <p className="text-sm text-alerta">{uploadError ?? errors?.videoUrl}</p>}
          <p className="text-sm text-tinta-suave">Somente .mp4, até 100 MB.</p>
        </div>
      )}
    </fieldset>
  );
}
