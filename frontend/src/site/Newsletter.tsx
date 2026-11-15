import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Alert, Button, ButtonLink, Loading, cx } from '../components/ui';
import { errorMessage, post } from '../lib/api';
import { useDocumentTitle, useMe, useNewsletterMine, useSetNewsletterMine } from '../lib/hooks';

// The newsletter on the site. Always the reader's own choice:
//   - a visitor types the e-mail and confirms it through the link that arrives
//     (nothing is sent before that click);
//   - a logged-in reader presses one button, and turns it off on Minha conta;
//   - every e-mail has a link to /newsletter/sair, which works without login.
// Backend: modules/newsletter.

const link = 'font-medium underline underline-offset-4';

type Tone = 'claro' | 'escuro';

// The box at the end of an article (light) and in the footer (dark).
export function NewsletterBox({ tone = 'claro', className }: { tone?: Tone; className?: string }) {
  const { data: me, isPending } = useMe();
  // Made with Google and no password yet: the site sends them to create one
  // first, and the API answers nothing else until then.
  if (isPending || me?.hasPassword === false) return null;

  return (
    <section
      aria-label="Newsletter"
      className={cx(tone === 'claro' ? 'rounded-2xl bg-superficie p-5 sm:p-6' : '', className)}
    >
      <p className={cx('font-serif text-xl', tone === 'claro' ? 'text-tinta' : 'text-white')}>Receba as principais notícias por e-mail</p>
      <p className={cx('mt-1 text-[0.9375rem]', tone === 'claro' ? 'text-tinta-suave' : 'text-white/75')}>
        Um resumo de vez em quando, sem propaganda. Para sair, é um clique.
      </p>
      <div className="mt-4">{me ? <AccountButton tone={tone} /> : <EmailForm tone={tone} />}</div>
    </section>
  );
}

function EmailForm({ tone }: { tone: Tone }) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [error, setError] = useState<unknown>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState('busy');
    setError(null);
    try {
      await post('/newsletter/subscribe', { email: email.trim(), website });
      setState('sent');
    } catch (err) {
      setError(err);
      setState('idle');
    }
  }

  const muted = tone === 'claro' ? 'text-tinta-suave' : 'text-white/75';

  if (state === 'sent') {
    return (
      <p role="status" className={cx('text-[0.9375rem]', tone === 'claro' ? 'text-tinta' : 'text-white')}>
        <strong>Quase lá!</strong> Enviamos um link para <strong>{email.trim()}</strong>. Abra o e-mail e confirme: só depois disso a
        newsletter começa a chegar. Não chegou? Olhe a caixa de spam.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={id} className="sr-only">
          Seu e-mail
        </label>
        <input
          id={id}
          type="email"
          required
          autoComplete="email"
          placeholder="seu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={cx(
            'h-10 w-full min-w-0 rounded-md border px-3 text-[0.9375rem] focus:outline-none focus:ring-2 sm:max-w-xs',
            tone === 'claro'
              ? 'border-linha bg-papel text-tinta placeholder:text-tinta-suave/70 focus:border-anil focus:ring-anil/15'
              : 'border-white/30 bg-white/10 text-white placeholder:text-white/60 focus:border-white focus:ring-white/20',
          )}
        />
        <Button type="submit" busy={state === 'busy'} disabled={!email.includes('@')} variant={tone === 'escuro' ? 'secundario' : 'primario'} className="shrink-0 whitespace-nowrap">
          Quero receber
        </Button>
      </div>
      {/* The trap for robots, like the contact form. */}
      <div aria-hidden="true" className="absolute left-[-10000px] h-px w-px overflow-hidden">
        <label>
          Site
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>
      {error != null && (
        <p role="alert" className={cx('text-sm', tone === 'claro' ? 'text-alerta' : 'text-white')}>
          {errorMessage(error)}
        </p>
      )}
      <p className={cx('text-sm', muted)}>
        Enviamos um e-mail para confirmar. Veja a{' '}
        <Link to="/privacidade" className={link}>
          Política de Privacidade
        </Link>
        .
      </p>
    </form>
  );
}

// Logged in: no e-mail to type. One button, and the state of the switch.
function AccountButton({ tone }: { tone: Tone }) {
  const mine = useNewsletterMine(true);
  const set = useSetNewsletterMine();
  const text = tone === 'claro' ? 'text-tinta' : 'text-white';

  if (mine.isPending) return null;

  if (mine.data === 'active') {
    return (
      <p className={cx('text-[0.9375rem]', text)}>
        Você já recebe a newsletter.{' '}
        <Link to="/minha-conta#newsletter" className={link}>
          Gerenciar em Minha conta
        </Link>
      </p>
    );
  }

  if (mine.data === 'pending') {
    return (
      <p className={cx('text-[0.9375rem]', text)}>
        Falta confirmar: enviamos um link para o e-mail da sua conta. Não chegou? Olhe o spam ou peça de novo em{' '}
        <Link to="/minha-conta#newsletter" className={link}>
          Minha conta
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          type="button"
          busy={set.isPending}
          onClick={() => set.mutate(true)}
          variant={tone === 'escuro' ? 'secundario' : 'primario'}
        >
          Quero receber no e-mail da minha conta
        </Button>
      </div>
      {set.error && <p className={cx('text-sm', tone === 'claro' ? 'text-alerta' : 'text-white')}>{errorMessage(set.error)}</p>}
    </div>
  );
}

// ── "Minha conta" ───────────────────────────────────────────────────────────

export function NewsletterAccountSection({ email }: { email: string }) {
  const mine = useNewsletterMine(true);
  const set = useSetNewsletterMine();
  const [message, setMessage] = useState<string | null>(null);
  const status = mine.data;
  const on = status === 'active' || status === 'pending';

  function toggle(subscribed: boolean) {
    setMessage(null);
    set.mutate(subscribed, {
      onSuccess: (next) =>
        setMessage(
          next === 'active'
            ? 'Pronto: você vai receber a newsletter.'
            : next === 'pending'
              ? `Enviamos um link para ${email}. Confirme por lá para começar a receber.`
              : 'Pronto: você não vai mais receber a newsletter.',
        ),
    });
  }

  return (
    <section id="newsletter" className="scroll-mt-24 rounded-lg border border-linha bg-papel p-5">
      <h2 className="font-semibold">Newsletter</h2>
      <p className="mb-4 mt-1 text-sm text-tinta-suave">
        Um resumo das principais notícias no seu e-mail ({email}). É opcional e você desliga quando quiser.
      </p>
      {mine.isPending ? (
        <Loading />
      ) : mine.error ? (
        <Alert>{errorMessage(mine.error)}</Alert>
      ) : (
        <div className="flex flex-col gap-4">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              role="switch"
              className="size-5 accent-anil"
              checked={on}
              disabled={set.isPending}
              onChange={(e) => toggle(e.target.checked)}
            />
            <span className="text-[0.9375rem]">
              {status === 'active' ? 'Ligada: você recebe a newsletter' : status === 'pending' ? 'Aguardando a sua confirmação por e-mail' : 'Desligada'}
            </span>
          </label>
          {status === 'pending' && !message && (
            <p className="text-sm text-tinta-suave">
              Não chegou o e-mail?{' '}
              <button type="button" className="font-medium text-anil hover:underline underline-offset-4" onClick={() => toggle(true)}>
                Enviar o link de novo
              </button>{' '}
              (um por vez a cada 10 minutos).
            </p>
          )}
          {message && <Alert tone="ok">{message}</Alert>}
          {set.error && <Alert>{errorMessage(set.error)}</Alert>}
        </div>
      )}
    </section>
  );
}

// ── The pages the e-mail links open ─────────────────────────────────────────

// Runs the request once when the page opens. A plain GET of the link (a
// mail scanner checking it) changes nothing: only the page's own POST does.
function useOnce(action: () => Promise<unknown>) {
  const [state, setState] = useState<{ status: 'busy' | 'ok' | 'error'; error?: unknown }>({ status: 'busy' });
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    action().then(
      () => setState({ status: 'ok' }),
      (error) => setState({ status: 'error', error }),
    );
  }, [action]);
  return state;
}

function ResultPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl py-8 sm:py-14">
      <h1 className="titulo text-4xl text-anil">{title}</h1>
      <div className="mt-4 text-lg leading-relaxed">{children}</div>
    </div>
  );
}

// /newsletter/confirmar?token=…
export function NewsletterConfirmPage() {
  useDocumentTitle('Confirmar newsletter');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [action] = useState(() => () => post('/newsletter/confirm', { token }));
  const state = useOnce(action);

  if (state.status === 'busy') return <Loading label="Confirmando…" />;
  if (state.status === 'error') {
    return (
      <ResultPage title="Não deu para confirmar">
        <Alert>{errorMessage(state.error)}</Alert>
        <NewsletterBox className="mt-8" />
      </ResultPage>
    );
  }
  return (
    <ResultPage title="Inscrição confirmada">
      <p>Obrigado! A partir de agora você recebe a newsletter do Portal100Fronteiras.</p>
      <p className="mt-3 text-base text-tinta-suave">
        Para sair, use o link no fim de qualquer e-mail da newsletter, ou desligue em Minha conta.
      </p>
      <div className="mt-6">
        <ButtonLink to="/">Ir para a página inicial</ButtonLink>
      </div>
    </ResultPage>
  );
}

// /newsletter/sair?token=… (the link at the end of every newsletter)
export function NewsletterLeavePage() {
  useDocumentTitle('Sair da newsletter');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [action] = useState(() => () => post('/newsletter/unsubscribe', { token }));
  const state = useOnce(action);

  if (state.status === 'busy') return <Loading label="Descadastrando…" />;
  if (state.status === 'error') {
    return (
      <ResultPage title="Não deu para descadastrar">
        <Alert>{errorMessage(state.error)}</Alert>
        <p className="mt-4 text-base">
          Se você tem conta, desligue a newsletter em{' '}
          <Link to="/minha-conta#newsletter" className="font-medium text-anil hover:underline underline-offset-4">
            Minha conta
          </Link>
          , ou escreva para nós pela página de{' '}
          <Link to="/contato" className="font-medium text-anil hover:underline underline-offset-4">
            contato
          </Link>
          .
        </p>
      </ResultPage>
    );
  }
  return (
    <ResultPage title="Pronto, você saiu da newsletter">
      <p>Você não vai mais receber os nossos e-mails. Mudou de ideia? É só se inscrever de novo pelo site.</p>
      <div className="mt-6">
        <ButtonLink to="/">Ir para a página inicial</ButtonLink>
      </div>
    </ResultPage>
  );
}
