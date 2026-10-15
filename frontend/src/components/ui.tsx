import { useId } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router';

// Small building blocks shared by the site and the panel. Kept in one file on
// purpose: each piece is short, and seeing them together shows the system.

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

// ── Buttons ──────────────────────────────────────────────────────────────────

type Variant = 'primario' | 'secundario' | 'perigo' | 'texto';

const variants: Record<Variant, string> = {
  primario: 'bg-anil text-white hover:bg-anil-escuro disabled:bg-anil/50',
  secundario: 'bg-papel text-tinta border border-linha hover:border-tinta-suave disabled:text-tinta-suave',
  perigo: 'bg-papel text-alerta border border-alerta/40 hover:bg-alerta-claro disabled:opacity-50',
  texto: 'text-anil hover:underline underline-offset-4 disabled:text-tinta-suave',
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  busy?: boolean;
  small?: boolean;
};

export function Button({ variant = 'primario', busy, small, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed',
        variant !== 'texto' && (small ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-[0.9375rem]'),
        variants[variant],
        className,
      )}
    >
      {busy && <Spinner small />}
      {children}
    </button>
  );
}

export function ButtonLink({ to, variant = 'primario', small, className, children }: {
  to: string;
  variant?: Variant;
  small?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors',
        variant !== 'texto' && (small ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-[0.9375rem]'),
        variants[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}

// ── Form fields ──────────────────────────────────────────────────────────────

const fieldBase =
  'w-full rounded-md border bg-papel px-3 text-[0.9375rem] text-tinta placeholder:text-tinta-suave/70 transition-colors focus:outline-none focus:border-anil focus:ring-2 focus:ring-anil/15';

type FieldShellProps = {
  label: string;
  hint?: ReactNode;
  error?: string;
  id: string;
  children: ReactNode;
  optional?: boolean;
};

function FieldShell({ label, hint, error, id, children, optional }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-tinta">
        {label}
        {optional && <span className="font-normal text-tinta-suave"> (opcional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-erro`} className="text-sm text-alerta">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-dica`} className="text-sm text-tinta-suave">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
};

export function TextField({ label, hint, error, optional, className, id, ...props }: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fieldId} optional={optional}>
      <input
        {...props}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-erro` : hint ? `${fieldId}-dica` : undefined}
        className={cx(fieldBase, 'h-10', error ? 'border-alerta' : 'border-linha', className)}
      />
    </FieldShell>
  );
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
};

export function TextArea({ label, hint, error, optional, className, id, ...props }: TextAreaProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fieldId} optional={optional}>
      <textarea
        {...props}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-erro` : hint ? `${fieldId}-dica` : undefined}
        className={cx(fieldBase, 'py-2 leading-relaxed', error ? 'border-alerta' : 'border-linha', className)}
      />
    </FieldShell>
  );
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
};

export function SelectField({ label, hint, error, optional, className, id, children, ...props }: SelectFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fieldId} optional={optional}>
      <select
        {...props}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        className={cx(fieldBase, 'h-10 pr-8', error ? 'border-alerta' : 'border-linha', className)}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export function Checkbox({ label, checked, onChange, hint }: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-anil"
      />
      <label htmlFor={id} className="text-[0.9375rem]">
        {label}
        {hint && <span className="block text-sm text-tinta-suave">{hint}</span>}
      </label>
    </div>
  );
}

// ── Feedback ─────────────────────────────────────────────────────────────────

export function Spinner({ small }: { small?: boolean }) {
  return (
    <span
      role="status"
      aria-label="Carregando"
      className={cx(
        'inline-block animate-spin rounded-full border-2 border-current border-r-transparent',
        small ? 'size-3.5' : 'size-5',
      )}
    />
  );
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-12 text-tinta-suave">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function Alert({ tone = 'erro', children, action }: {
  tone?: 'erro' | 'aviso' | 'ok' | 'info';
  children: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    erro: 'border-alerta/30 bg-alerta-claro text-alerta',
    aviso: 'border-aviso/30 bg-aviso-claro text-aviso',
    ok: 'border-ok/30 bg-ok-claro text-ok',
    info: 'border-linha bg-superficie text-tinta',
  };
  return (
    <div role={tone === 'erro' ? 'alert' : 'status'} className={cx('flex flex-wrap items-center gap-3 rounded-md border px-4 py-3 text-[0.9375rem]', tones[tone])}>
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-linha px-6 py-12 text-center">
      <p className="titulo text-xl">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-tinta-suave">{children}</div>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

// ── Pagination ───────────────────────────────────────────────────────────────

export function Pagination({ page, totalPages, onChange }: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-4 border-t border-linha pt-5">
      <Button variant="secundario" small disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Anterior
      </Button>
      <span className="text-sm text-tinta-suave">
        Página {page} de {totalPages}
      </span>
      <Button variant="secundario" small disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Próxima
      </Button>
    </nav>
  );
}

// ── Author photo ─────────────────────────────────────────────────────────────

export function Avatar({ src, name, size = 40 }: { src?: string | null; name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return src ? (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0 rounded-full bg-superficie object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-anil/10 font-medium text-anil"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  );
}
