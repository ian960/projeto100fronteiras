import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Alert, Button, EmptyState, Loading, TextArea, TextField, cx } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { formatDate, formatDateTime } from '../../lib/format';
import { useDocumentTitle } from '../../lib/hooks';
import type { NewsletterIssueSummary, NewsletterOverview } from '../../lib/types';
import { useNewsletterActions, useNewsletterOverview, useNewsletterPosts } from '../queries';
import type { NewsletterIssueInput } from '../queries';
import { ConfirmButton, Modal, PanelHeader, TypePill, useToast } from '../widgets';

// The admin sends the newsletter by hand, from here: pick the stories, check
// the preview (or a test in your own inbox), press send. The API queues one
// e-mail per subscriber and sends them in the background, never more than the
// daily limit (Brevo's free plan: 300 a day in all). What does not fit goes
// out on its own over the next days.

const n = new Intl.NumberFormat('pt-BR');
const MAX_POSTS = 10;

function defaultSubject(): string {
  return `Resumo da semana: ${new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(new Date())}`;
}

export default function NewsletterPage() {
  useDocumentTitle('Newsletter');
  const overview = useNewsletterOverview();

  return (
    <>
      <PanelHeader
        title="Newsletter"
        description="Só recebe quem pediu e confirmou pelo e-mail. Cada e-mail leva um link para sair com um clique, e o leitor também desliga em Minha conta."
      />
      {overview.isPending ? (
        <Loading />
      ) : overview.error ? (
        <Alert>{errorMessage(overview.error)}</Alert>
      ) : (
        <div className="flex flex-col gap-8">
          <Numbers data={overview.data} />
          <Compose data={overview.data} />
          <History issues={overview.data.issues} />
        </div>
      )}
    </>
  );
}

function Numbers({ data }: { data: NewsletterOverview }) {
  const actions = useNewsletterActions();
  const left = Math.max(0, data.dailyLimit - data.sentLast24h);

  return (
    <section className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Inscritos" value={data.subscribers.active} hint="Confirmaram e recebem a newsletter" />
        <Stat label="Aguardando confirmação" value={data.subscribers.pending} hint="Pediram, mas ainda não clicaram no link" />
        <Stat label="Saíram" value={data.subscribers.unsubscribed} hint="Não recebem mais" />
      </div>
      <div className="rounded-lg border border-linha bg-papel px-4 py-3 text-[0.9375rem]">
        <p>
          Limite de envio: <strong>{n.format(data.dailyLimit)}</strong> e-mails a cada 24 horas. Enviados nas últimas 24 horas:{' '}
          <strong>{n.format(data.sentLast24h)}</strong>. Na fila: <strong>{n.format(data.queued)}</strong>.
          {data.sending && <span className="ml-2 font-semibold text-anil">Enviando agora…</span>}
        </p>
        {data.queued > 0 && !data.sending && (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-tinta-suave">
            <span>
              {left === 0
                ? 'O limite das últimas 24 horas já foi usado. O resto sai sozinho assim que o limite liberar (o servidor confere a cada 10 minutos).'
                : 'O servidor confere a fila a cada 10 minutos.'}
            </span>
            {left > 0 && (
              <Button small variant="secundario" busy={actions.runQueue.isPending} onClick={() => actions.runQueue.mutate()}>
                Enviar a fila agora
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-lg border border-linha bg-papel px-4 py-3">
      <p className="text-sm text-tinta-suave">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{n.format(value)}</p>
      <p className="text-xs text-tinta-suave">{hint}</p>
    </div>
  );
}

function Compose({ data }: { data: NewsletterOverview }) {
  const posts = useNewsletterPosts();
  const actions = useNewsletterActions();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [subject, setSubject] = useState(defaultSubject);
  const [intro, setIntro] = useState('');
  // In the order they were picked: that is the order in the e-mail.
  const [picked, setPicked] = useState<string[]>([]);
  const [preview, setPreview] = useState<string | null>(null);

  // "Enviar por newsletter" from a story in the panel: /painel/newsletter?materia=<id>
  const fromStory = params.get('materia');
  useEffect(() => {
    if (!fromStory || !posts.data) return;
    const story = posts.data.find((post) => post.id === fromStory);
    if (story) {
      setPicked([story.id]);
      setSubject(story.title.slice(0, 150));
    }
    setParams({}, { replace: true });
  }, [fromStory, posts.data, setParams]);

  const input: NewsletterIssueInput = { subject: subject.trim(), intro: intro.trim() || null, postIds: picked };
  const lastError = actions.send.error ?? actions.test.error ?? actions.preview.error;
  const errors = lastError instanceof ApiError ? lastError.fields : {};
  const ready = input.subject.length >= 3 && picked.length > 0;

  const lastWeek = useMemo(() => {
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return (posts.data ?? []).filter((post) => post.publishedAt && new Date(post.publishedAt).getTime() >= since).slice(0, MAX_POSTS);
  }, [posts.data]);

  function toggle(id: string) {
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : current.length >= MAX_POSTS ? current : [...current, id]));
  }

  const recipients = data.subscribers.active;
  const days = Math.ceil((recipients + data.queued) / data.dailyLimit);

  return (
    <section className="rounded-lg border border-linha bg-papel p-5">
      <h2 className="text-lg font-semibold">Nova newsletter</h2>
      <p className="mb-5 mt-1 text-sm text-tinta-suave">
        Escolha até {MAX_POSTS} matérias publicadas. O e-mail mostra a foto, o título e o resumo de cada uma, com o link para o site.
      </p>

      <div className="flex flex-col gap-4">
        {lastError && Object.keys(errors).length === 0 && <Alert>{errorMessage(lastError)}</Alert>}
        <TextField label="Assunto do e-mail" maxLength={150} value={subject} onChange={(e) => setSubject(e.target.value)} error={errors.subject} />
        <TextArea
          label="Recado no topo"
          optional
          rows={3}
          maxLength={2000}
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          error={errors.intro}
          hint="Uma ou duas frases de abertura. Pode deixar em branco."
        />

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">
              Matérias <span className="font-normal text-tinta-suave">({picked.length} de {MAX_POSTS})</span>
            </p>
            <div className="flex gap-2">
              {lastWeek.length > 0 && (
                <Button small variant="secundario" onClick={() => setPicked(lastWeek.map((post) => post.id))}>
                  Marcar as da última semana
                </Button>
              )}
              {picked.length > 0 && (
                <Button small variant="texto" onClick={() => setPicked([])}>
                  Limpar
                </Button>
              )}
            </div>
          </div>
          {errors.postIds && <p className="mb-2 text-sm text-alerta">{errors.postIds}</p>}
          {posts.isPending ? (
            <Loading />
          ) : posts.error ? (
            <Alert>{errorMessage(posts.error)}</Alert>
          ) : posts.data.length === 0 ? (
            <p className="text-sm text-tinta-suave">Nenhuma matéria publicada ainda.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-linha overflow-y-auto rounded-md border border-linha">
              {posts.data.map((post) => {
                const position = picked.indexOf(post.id);
                const full = position === -1 && picked.length >= MAX_POSTS;
                return (
                  <li key={post.id}>
                    <label className={cx('flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-superficie', full && 'cursor-not-allowed opacity-50')}>
                      <input type="checkbox" className="mt-1 size-4 accent-anil" checked={position !== -1} disabled={full} onChange={() => toggle(post.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium leading-snug">
                          {position !== -1 && <span className="mr-1.5 text-anil">{position + 1}.</span>}
                          {post.title}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-tinta-suave">
                          <TypePill type={post.type} />
                          {post.category && <span>{post.category}</span>}
                          <span>{formatDate(post.publishedAt)}</span>
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {recipients > 0 && days > 1 && (
          <Alert tone="aviso">
            Com {n.format(recipients)} inscritos e o limite de {n.format(data.dailyLimit)} por dia, este envio leva cerca de {days} dias
            para chegar a todos. Ele continua sozinho, sem precisar apertar nada.
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-linha pt-4">
          <Button
            variant="secundario"
            disabled={!ready}
            busy={actions.preview.isPending}
            onClick={() => actions.preview.mutate(input, { onSuccess: (result) => setPreview(result.html) })}
          >
            Ver prévia
          </Button>
          <Button
            variant="secundario"
            disabled={!ready}
            busy={actions.test.isPending}
            onClick={() => actions.test.mutate(input, { onSuccess: (result) => toast(`Teste enviado para ${result.email}`) })}
          >
            Enviar teste para mim
          </Button>
          <SendButton
            disabled={!ready || recipients === 0}
            busy={actions.send.isPending}
            recipients={recipients}
            onConfirm={() =>
              actions.send.mutate(input, {
                onSuccess: (result) => {
                  toast(`Newsletter na fila para ${n.format(result.recipients)} inscritos`);
                  setPicked([]);
                  setIntro('');
                  setSubject(defaultSubject());
                },
              })
            }
          />
          {recipients === 0 && <span className="text-sm text-tinta-suave">Ainda não há inscritos confirmados.</span>}
        </div>
      </div>

      <Modal open={preview !== null} onClose={() => setPreview(null)} title="Prévia do e-mail">
        {preview && (
          <iframe
            title="Prévia da newsletter"
            srcDoc={preview}
            sandbox=""
            className="h-[70vh] w-full rounded border border-linha bg-white"
          />
        )}
      </Modal>
    </section>
  );
}

// The real send asks twice: it cannot be taken back once it goes.
function SendButton({ disabled, busy, recipients, onConfirm }: { disabled: boolean; busy: boolean; recipients: number; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(timer);
  }, [armed]);

  if (!armed) {
    return (
      <Button disabled={disabled} busy={busy} onClick={() => setArmed(true)}>
        Enviar para {n.format(recipients)} {recipients === 1 ? 'inscrito' : 'inscritos'}
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-wrap gap-2">
      <Button
        busy={busy}
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
      >
        Confirmar envio
      </Button>
      <Button variant="secundario" onClick={() => setArmed(false)}>
        Cancelar
      </Button>
    </span>
  );
}

function History({ issues }: { issues: NewsletterIssueSummary[] }) {
  const actions = useNewsletterActions();
  const toast = useToast();

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Enviadas</h2>
      {actions.cancel.error && (
        <div className="mb-3">
          <Alert>{errorMessage(actions.cancel.error)}</Alert>
        </div>
      )}
      {issues.length === 0 ? (
        <EmptyState title="Nenhuma newsletter enviada ainda">As newsletters enviadas aparecem aqui, com quantos e-mails já saíram.</EmptyState>
      ) : (
        <ul className="divide-y divide-linha rounded-lg border border-linha bg-papel">
          {issues.map((issue) => (
            <li key={issue.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{issue.subject}</p>
                <p className="text-sm text-tinta-suave">
                  {formatDateTime(issue.createdAt)}
                  {issue.createdBy && `, por ${issue.createdBy}`}
                </p>
                <p className="text-sm">
                  Enviados {n.format(issue.sent)} de {n.format(issue.total)}
                  {issue.pending > 0 && <span className="text-anil"> · {n.format(issue.pending)} na fila</span>}
                  {issue.failed > 0 && <span className="text-alerta"> · {n.format(issue.failed)} com erro</span>}
                  {issue.cancelled > 0 && <span className="text-tinta-suave"> · {n.format(issue.cancelled)} não enviados (cancelados ou saíram antes)</span>}
                </p>
              </div>
              {issue.pending > 0 && (
                <ConfirmButton
                  label="Parar o envio"
                  confirmLabel="Sim, parar"
                  busy={actions.cancel.isPending}
                  onConfirm={() =>
                    actions.cancel.mutate(issue.id, {
                      onSuccess: (result) => toast(`${n.format(result.cancelled)} e-mails não serão enviados`),
                    })
                  }
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
