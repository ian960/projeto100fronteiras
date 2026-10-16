import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, TextField, cx } from '../components/ui';
import { useHealth } from '../lib/hooks';
import type { Media, MediaPurpose } from '../lib/types';
import { formatBytes, importMedia, uploadErrorMessage, uploadMedia } from './media';
import { Modal } from './widgets';

// Every field that takes a file: cover, author photo, video, PDF attachments
// and photos inside the text. They all go through panel/media.ts.

// undefined while /api/health loads, then true or false.
export function useMediaEnabled(): boolean | undefined {
  const { data } = useHealth();
  return data ? data.uploads === 'cloudinary' : undefined;
}

function MediaOff() {
  return (
    <p className="rounded-md border border-dashed border-linha bg-superficie px-3 py-2.5 text-sm text-tinta-suave">
      O envio de arquivos ainda não está ligado neste servidor. Falta configurar o Cloudinary
      (variável <code className="text-[0.8125rem]">CLOUDINARY_URL</code> no backend).
    </p>
  );
}

// A button that opens the file picker. A real <button>, so it is reachable
// with the keyboard; the <input type="file"> stays hidden.
function FileButton({ accept, multiple, disabled, onFiles, children, variant = 'secundario' }: {
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  children: ReactNode;
  variant?: 'primario' | 'secundario';
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button type="button" variant={variant} small disabled={disabled} onClick={() => input.current?.click()}>
        {children}
      </Button>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        tabIndex={-1}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = ''; // picking the same file again still fires
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}

function Progress({ fraction, label, onCancel }: { fraction: number; label: string; onCancel?: () => void }) {
  const percent = Math.round(fraction * 100);
  return (
    <div className="flex items-center gap-3" role="status">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-superficie" aria-hidden="true">
        <div className="h-full bg-anil transition-[width] duration-200" style={{ width: `${percent}%` }} />
      </div>
      <span className="min-w-28 text-sm tabular-nums text-tinta-suave">
        {label} {percent}%
      </span>
      {onCancel && (
        <Button type="button" variant="texto" small onClick={onCancel}>
          Cancelar
        </Button>
      )}
    </div>
  );
}

// Upload state shared by every field: progress, cancel, error.
function useUpload() {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  // Leaving the page mid-upload stops the transfer.
  useEffect(() => () => controller.current?.abort(), []);

  async function run<T>(task: (onProgress: (f: number) => void, signal: AbortSignal) => Promise<T>): Promise<T | null> {
    controller.current = new AbortController();
    setError(null);
    setProgress(0);
    try {
      return await task(setProgress, controller.current.signal);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) setError(uploadErrorMessage(err));
      return null;
    } finally {
      setProgress(null);
      controller.current = null;
    }
  }

  return { progress, error, setError, run, cancel: () => controller.current?.abort() };
}

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif';

// "Paste a link" + Import, side by side. The input and the button share one
// row and one height; the hint goes underneath both.
function LinkImport({ label = 'Endereço da imagem', value, onChange, onImport, busy, disabled, hint }: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onImport: () => void;
  busy: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex max-w-md flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type="url"
          inputMode="url"
          placeholder="https://"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && value.trim()) {
              event.preventDefault(); // not the post form's submit
              onImport();
            }
          }}
          className="h-10 min-w-0 flex-1 rounded-md border border-linha bg-papel px-3 text-[0.9375rem] focus:border-anil"
        />
        <Button type="button" variant="secundario" busy={busy} disabled={!value.trim() || disabled} onClick={onImport}>
          Importar
        </Button>
      </div>
      {hint && <p className="text-sm text-tinta-suave">{hint}</p>}
    </div>
  );
}

// ── Image: cover, author photo ───────────────────────────────────────────────

export type ImageValue = { id: string; previewUrl: string } | null;

export const imageValue = (media: Media): ImageValue => ({ id: media.id, previewUrl: media.thumbnailUrl });

export function ImageField({ label, purpose, value, onChange, error, hint, optional, round, disabled }: {
  label: string;
  purpose: Extract<MediaPurpose, 'cover' | 'author'>;
  value: ImageValue;
  onChange: (value: ImageValue) => void;
  error?: string;
  hint?: string;
  optional?: boolean;
  round?: boolean; // author photo
  disabled?: boolean;
}) {
  const enabled = useMediaEnabled();
  const upload = useUpload();
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState('');
  const [importing, setImporting] = useState(false);
  const labelId = useId();

  async function onFile(file: File) {
    const media = await upload.run((onProgress, signal) => uploadMedia(purpose, file, onProgress, signal));
    if (media) onChange(imageValue(media));
  }

  async function onImport() {
    setImporting(true);
    upload.setError(null);
    try {
      const media = await importMedia(purpose, link.trim());
      onChange(imageValue(media));
      setLink('');
      setLinkOpen(false);
    } catch (err) {
      upload.setError(uploadErrorMessage(err));
    } finally {
      setImporting(false);
    }
  }

  const busy = upload.progress !== null || importing;
  const shownError = upload.error ?? error;

  return (
    <div className="flex flex-col gap-3" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="text-sm font-medium">
        {label} {optional && <span className="font-normal text-tinta-suave">(opcional)</span>}
      </span>

      {value ? (
        <img
          src={value.previewUrl}
          alt=""
          className={cx(
            'border border-linha bg-superficie object-cover',
            round ? 'size-24 rounded-full' : 'aspect-video w-full max-w-md rounded-md',
          )}
        />
      ) : (
        <div
          className={cx(
            'grid place-items-center border border-dashed bg-superficie text-sm text-tinta-suave',
            round ? 'size-24 rounded-full' : 'aspect-video w-full max-w-md rounded-md',
            shownError ? 'border-alerta' : 'border-linha',
          )}
        >
          {round ? 'Sem foto' : 'Sem imagem'}
        </div>
      )}

      {disabled ? null : enabled === false ? (
        <MediaOff />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <FileButton accept={IMAGE_ACCEPT} disabled={busy || !enabled} onFiles={([file]) => onFile(file!)}>
              {value ? 'Trocar imagem' : 'Enviar imagem'}
            </FileButton>
            <Button type="button" variant="texto" small disabled={busy || !enabled} onClick={() => setLinkOpen(!linkOpen)} aria-expanded={linkOpen}>
              Usar um link
            </Button>
            {value && (
              <Button type="button" variant="texto" small disabled={busy} onClick={() => onChange(null)}>
                Remover
              </Button>
            )}
          </div>

          {linkOpen && (
            <LinkImport
              value={link}
              onChange={setLink}
              onImport={onImport}
              busy={importing}
              hint="A imagem é copiada para o Cloudinary. Se o site de origem apagar, a sua continua."
            />
          )}

          {upload.progress !== null && <Progress fraction={upload.progress} label="Enviando" onCancel={upload.cancel} />}
        </>
      )}

      {shownError ? (
        <p className="text-sm text-alerta" role="alert">
          {shownError}
        </p>
      ) : (
        hint && !disabled && <p className="text-sm text-tinta-suave">{hint}</p>
      )}
    </div>
  );
}

// ── Video: none, YouTube, or an uploaded file ────────────────────────────────

export type VideoValue =
  | { provider: 'none' }
  | { provider: 'youtube'; url: string }
  | { provider: 'cloudinary'; media: Media | null };

const VIDEO_OPTIONS = [
  { provider: 'none', label: 'Sem vídeo' },
  { provider: 'youtube', label: 'Link do YouTube' },
  { provider: 'cloudinary', label: 'Enviar arquivo' },
] as const;

function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function VideoField({ value, onChange, error, disabled }: {
  value: VideoValue;
  onChange: (value: VideoValue) => void;
  error?: string;
  disabled?: boolean;
}) {
  const enabled = useMediaEnabled();
  const upload = useUpload();

  async function onFile(file: File) {
    const media = await upload.run((onProgress, signal) => uploadMedia('video', file, onProgress, signal));
    if (media) onChange({ provider: 'cloudinary', media });
  }

  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="mb-1.5 text-sm font-medium">
        Vídeo <span className="font-normal text-tinta-suave">(opcional)</span>
      </legend>

      {disabled && value.provider === 'none' && <p className="text-sm text-tinta-suave">Sem vídeo.</p>}

      <div className={cx('flex flex-wrap gap-2', disabled && 'hidden')} role="radiogroup" aria-label="Origem do vídeo">
        {VIDEO_OPTIONS.map((option) => {
          const off = option.provider === 'cloudinary' && enabled === false;
          return (
            <button
              key={option.provider}
              type="button"
              role="radio"
              aria-checked={value.provider === option.provider}
              disabled={off || upload.progress !== null}
              title={off ? 'O envio de arquivos ainda não está configurado neste servidor.' : undefined}
              onClick={() => {
                if (option.provider === value.provider) return;
                onChange(
                  option.provider === 'youtube'
                    ? { provider: 'youtube', url: '' }
                    : option.provider === 'cloudinary'
                      ? { provider: 'cloudinary', media: null }
                      : { provider: 'none' },
                );
              }}
              className={cx(
                'h-9 rounded-full border px-3.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40',
                value.provider === option.provider ? 'border-anil bg-anil text-white' : 'border-linha hover:border-tinta-suave',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {value.provider === 'youtube' && (
        <TextField
          label="Link do vídeo no YouTube"
          type="url"
          placeholder="https://www.youtube.com/watch?v=…"
          value={value.url}
          onChange={(event) => onChange({ provider: 'youtube', url: event.target.value })}
          error={error}
          hint="Pode colar o link de compartilhar, do navegador ou de um Short."
        />
      )}

      {value.provider === 'cloudinary' && (
        <div className="flex flex-col gap-3">
          {value.media && (
            <figure className="max-w-md">
              <video
                src={value.media.url}
                poster={value.media.posterUrl ?? undefined}
                controls
                preload="none"
                playsInline
                className="aspect-video w-full rounded-md bg-tinta"
              />
              <figcaption className="mt-1.5 text-sm text-tinta-suave">
                {value.media.originalName}
                {value.media.durationSec ? `, ${formatDuration(value.media.durationSec)}` : ''}, {formatBytes(value.media.bytes)}
              </figcaption>
            </figure>
          )}

          {disabled ? null : enabled === false ? (
            <MediaOff />
          ) : (
            <div className="flex flex-wrap gap-2">
              <FileButton accept="video/mp4,video/quicktime,video/webm,video/x-m4v" disabled={upload.progress !== null || !enabled} onFiles={([file]) => onFile(file!)}>
                {value.media ? 'Trocar vídeo' : 'Escolher vídeo'}
              </FileButton>
            </div>
          )}

          {upload.progress !== null && <Progress fraction={upload.progress} label="Enviando" onCancel={upload.cancel} />}
          {(upload.error || error) && (
            <p className="text-sm text-alerta" role="alert">
              {upload.error ?? error}
            </p>
          )}
          {!disabled && (
            <p className="text-sm text-tinta-suave">
              MP4 ou MOV (gravado no celular), até 100 MB. O Cloudinary converte para um formato que todo navegador toca.
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}

// ── PDF attachments ──────────────────────────────────────────────────────────

export type AttachmentValue = { media: Media; title: string };

// "Edital_n12_2026.pdf" -> "Edital n12 2026"
const titleFromName = (name: string) => name.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim() || 'Documento';

export function AttachmentsField({ value, onChange, error, disabled }: {
  value: AttachmentValue[];
  onChange: (value: AttachmentValue[]) => void;
  error?: string;
  disabled?: boolean;
}) {
  const enabled = useMediaEnabled();
  const upload = useUpload();
  const [queue, setQueue] = useState<{ index: number; total: number } | null>(null);

  async function onFiles(files: File[]) {
    let list = value;
    for (const [index, file] of files.entries()) {
      setQueue({ index: index + 1, total: files.length });
      const media = await upload.run((onProgress, signal) => uploadMedia('document', file, onProgress, signal));
      if (!media) break; // an error or a cancel stops the rest
      list = [...list, { media, title: titleFromName(file.name) }];
      onChange(list);
    }
    setQueue(null);
  }

  function move(index: number, by: -1 | 1) {
    const next = [...value];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item!);
    onChange(next);
  }

  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="mb-1.5 text-sm font-medium">
        Documentos em PDF <span className="font-normal text-tinta-suave">(opcional)</span>
      </legend>

      {value.length > 0 && (
        <ol className="flex flex-col divide-y divide-linha rounded-md border border-linha">
          {value.map((item, index) => (
            <li key={item.media.id} className="flex gap-3 p-3">
              <img src={item.media.thumbnailUrl} alt="" className="h-16 w-12 shrink-0 rounded-sm border border-linha bg-superficie object-cover object-top" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <input
                  aria-label={`Título do documento ${index + 1}`}
                  value={item.title}
                  maxLength={200}
                  onChange={(event) => onChange(value.map((other, i) => (i === index ? { ...other, title: event.target.value } : other)))}
                  className="h-9 w-full rounded-md border border-linha bg-papel px-2.5 text-[0.9375rem] focus:border-anil"
                />
                <span className="truncate text-sm text-tinta-suave">
                  PDF{item.media.pages ? `, ${item.media.pages} ${item.media.pages === 1 ? 'página' : 'páginas'}` : ''}, {formatBytes(item.media.bytes)}
                </span>
              </div>
              <div className={cx('flex shrink-0 items-start gap-1', disabled && 'hidden')}>
                <IconButton label="Subir" disabled={index === 0} onClick={() => move(index, -1)} path="M10 15V5m0 0-4 4m4-4 4 4" />
                <IconButton label="Descer" disabled={index === value.length - 1} onClick={() => move(index, 1)} path="M10 5v10m0 0-4-4m4 4 4-4" />
                <IconButton label="Remover" onClick={() => onChange(value.filter((_, i) => i !== index))} path="m6 6 8 8m0-8-8 8" />
              </div>
            </li>
          ))}
        </ol>
      )}

      {disabled && value.length === 0 && <p className="text-sm text-tinta-suave">Nenhum documento.</p>}

      {disabled ? null : enabled === false ? (
        <MediaOff />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <FileButton accept="application/pdf" multiple disabled={upload.progress !== null || !enabled || value.length >= 20} onFiles={onFiles}>
            Anexar PDF
          </FileButton>
          <span className="text-sm text-tinta-suave">Até 10 MB cada. Aparecem no fim da matéria, nesta ordem.</span>
        </div>
      )}

      {upload.progress !== null && (
        <Progress
          fraction={upload.progress}
          label={queue && queue.total > 1 ? `${queue.index} de ${queue.total}` : 'Enviando'}
          onCancel={upload.cancel}
        />
      )}
      {(upload.error || error) && (
        <p className="text-sm text-alerta" role="alert">
          {upload.error ?? error}
        </p>
      )}
    </fieldset>
  );
}

function IconButton({ label, path, onClick, disabled }: { label: string; path: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-md text-tinta-suave hover:bg-superficie hover:text-tinta disabled:opacity-30"
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </button>
  );
}

// ── Photo inside the text ────────────────────────────────────────────────────

// Opened by the editor's image button. Resolves with what to insert, or null.
export function BodyImageDialog({ open, onDone }: { open: boolean; onDone: (result: { url: string; alt: string } | null) => void }) {
  const upload = useUpload();
  const [media, setMedia] = useState<Media | null>(null);
  const [alt, setAlt] = useState('');
  const [link, setLink] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (open) {
      setMedia(null);
      setAlt('');
      setLink('');
      upload.setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onFile(file: File) {
    const uploaded = await upload.run((onProgress, signal) => uploadMedia('body', file, onProgress, signal));
    if (uploaded) setMedia(uploaded);
  }

  async function onImport() {
    setImporting(true);
    upload.setError(null);
    try {
      setMedia(await importMedia('body', link.trim()));
    } catch (err) {
      upload.setError(uploadErrorMessage(err));
    } finally {
      setImporting(false);
    }
  }

  const busy = upload.progress !== null || importing;
  const enabled = useMediaEnabled();

  return (
    <Modal open={open} onClose={() => onDone(null)} title="Foto no texto">
      <div className="flex flex-col gap-4">
        {enabled === false ? (
          <MediaOff />
        ) : media ? (
          <img src={media.thumbnailUrl} alt="" className="aspect-video w-full rounded-md border border-linha bg-superficie object-contain" />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <FileButton accept={IMAGE_ACCEPT} variant="primario" disabled={busy} onFiles={([file]) => onFile(file!)}>
                Escolher imagem
              </FileButton>
            </div>
            <LinkImport label="ou cole o endereço de uma imagem" value={link} onChange={setLink} onImport={onImport} busy={importing} disabled={busy} />
          </div>
        )}

        {upload.progress !== null && <Progress fraction={upload.progress} label="Enviando" onCancel={upload.cancel} />}
        {upload.error && (
          <p className="text-sm text-alerta" role="alert">
            {upload.error}
          </p>
        )}

        <TextField
          label="Descrição da imagem"
          value={alt}
          onChange={(event) => setAlt(event.target.value)}
          maxLength={300}
          hint="O que a foto mostra, para quem usa leitor de tela. Ex.: “Feirantes montando as barracas na praça”."
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secundario" onClick={() => onDone(null)}>
            Cancelar
          </Button>
          <Button type="button" disabled={!media || !alt.trim()} onClick={() => media && onDone({ url: media.url, alt: alt.trim() })}>
            Inserir no texto
          </Button>
        </div>
      </div>
    </Modal>
  );
}
