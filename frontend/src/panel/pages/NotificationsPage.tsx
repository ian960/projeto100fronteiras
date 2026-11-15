import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Alert, Button, EmptyState, Loading, TextArea, TextField, cx } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { formatDate, formatDateTime } from '../../lib/format';
import { useDocumentTitle } from '../../lib/hooks';
import { thisBrowserEndpoint } from '../../lib/push';
import type { PushNotificationSummary, PushOverview } from '../../lib/types';
import { useNewsletterPosts, usePushActions, usePushOverview } from '../queries';
import type { PushNotificationInput } from '../queries';
import { PanelHeader, TypePill, useToast } from '../widgets';

// The admin sends a push notification about one story: pick it, adjust the
// title and the text, test in this browser if you like, send. It goes to
// every browser that turned notifications on (backend: modules/push), in the
// background, and the history below shows how many it reached.

const n = new Intl.NumberFormat('pt-BR');

export default function NotificationsPage() {
  useDocumentTitle('Notificações');
  const overview = usePushOverview();

  return (
    <>
      <PanelHeader
        title="Notificações"
        description="O aviso no celular ou no computador de quem clicou em “Ativar notificações” no site. Use para notícias importantes: quem recebe demais desliga."
      />
      {overview.isPending ? (
        <Loading />
      ) : overview.error ? (
        <Alert>{errorMessage(overview.error)}</Alert>
      ) : !overview.data.configured ? (
        <Alert tone="aviso">
          As notificações ainda não estão ligadas no servidor. Gere as chaves com <code>npx web-push generate-vapid-keys</code> e coloque
          VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY nas variáveis da API no Render. Depois do deploy, o botão aparece no rodapé do site.
        </Alert>
      ) : (
        <div className="flex flex-col gap-8">
          <Numbers data={overview.data} />
          <Compose data={overview.data} />
          <History items={overview.data.notifications} />
        </div>
      )}
    </>
  );
}

function Numbers({ data }: { data: PushOverview }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border border-linha bg-papel px-4 py-3">
        <p className="text-sm text-tinta-suave">Aparelhos inscritos</p>
        <p className="text-2xl font-semibold tabular-nums">{n.format(data.subscriptions)}</p>
        <p className="text-xs text-tinta-suave">Navegadores com as notificações ligadas</p>
      </div>
      <div className="rounded-lg border border-linha bg-papel px-4 py-3">
        <p className="text-sm text-tinta-suave">Enviadas nas últimas 24 horas</p>
        <p className="text-2xl font-semibold tabular-nums">
          {n.format(data.sentLast24h)} <span className="text-base font-normal text-tinta-suave">de {n.format(data.dailyLimit)}</span>
        </p>
        <p className="text-xs text-tinta-suave">Limite para não cansar o leitor (PUSH_DAILY_LIMIT)</p>
      </div>
    </section>
  );
}

function Compose({ data }: { data: PushOverview }) {
  const posts = useNewsletterPosts();
  const actions = usePushActions();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [postId, setPostId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  function pick(id: string) {
    const story = posts.data?.find((item) => item.id === id);
    if (!story) return;
    setPostId(id);
    setTitle(story.title.slice(0, 80));
    setBody(story.excerpt.slice(0, 180));
  }

  // "Enviar notificação" from the story editor: /painel/notificacoes?materia=<id>
  const fromStory = params.get('materia');
  useEffect(() => {
    if (!fromStory || !posts.data) return;
    pick(fromStory);
    setParams({}, { replace: true });
  }, [fromStory, posts.data]);

  const input: PushNotificationInput | null = postId ? { postId, title: title.trim(), body: body.trim() } : null;
  const lastError = actions.send.error;
  const errors = lastError instanceof ApiError ? lastError.fields : {};
  const ready = input !== null && input.title.length >= 3;
  const limitReached = data.sentLast24h >= data.dailyLimit;

  async function test() {
    if (!input) return;
    setTestError(null);
    const endpoint = await thisBrowserEndpoint().catch(() => null);
    if (!endpoint) {
      setTestError('Ative as notificações neste navegador primeiro: no rodapé do site, “Ativar notificações”.');
      return;
    }
    actions.test.mutate(
      { ...input, endpoint },
      {
        onSuccess: () => toast('Teste enviado para este navegador'),
        onError: (err) => setTestError(errorMessage(err)),
      },
    );
  }

  return (
    <section className="rounded-lg border border-linha bg-papel p-5">
      <h2 className="text-lg font-semibold">Nova notificação</h2>
      <p className="mb-5 mt-1 text-sm text-tinta-suave">Escolha uma matéria publicada. Tocando na notificação, o leitor abre a matéria.</p>

      <div className="flex flex-col gap-4">
        {lastError && Object.keys(errors).length === 0 && <Alert>{errorMessage(lastError)}</Alert>}

        {posts.isPending ? (
          <Loading />
        ) : posts.error ? (
          <Alert>{errorMessage(posts.error)}</Alert>
        ) : posts.data.length === 0 ? (
          <p className="text-sm text-tinta-suave">Nenhuma matéria publicada ainda.</p>
        ) : (
          <ul className="max-h-72 divide-y divide-linha overflow-y-auto rounded-md border border-linha">
            {posts.data.map((item) => (
              <li key={item.id}>
                <label className={cx('flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-superficie', item.id === postId && 'bg-superficie')}>
                  <input type="radio" name="materia" className="mt-1 size-4 accent-anil" checked={item.id === postId} onChange={() => pick(item.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-snug">{item.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-tinta-suave">
                      <TypePill type={item.type} />
                      {item.category && <span>{item.category}</span>}
                      <span>{formatDate(item.publishedAt)}</span>
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {errors.postId && <p className="text-sm text-alerta">{errors.postId}</p>}

        {postId && (
          <>
            <TextField
              label="Título"
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              error={errors.title}
              hint={`${title.length}/80. Curto e direto, por exemplo “Urgente: ponte interditada na BR-277”.`}
            />
            <TextArea
              label="Texto"
              optional
              rows={2}
              maxLength={180}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              error={errors.body}
              hint={`${body.length}/180. O celular mostra umas duas linhas.`}
            />
            <NotificationPreview title={title} body={body} />
          </>
        )}

        {testError && <Alert>{testError}</Alert>}
        {limitReached && (
          <Alert tone="aviso">
            O limite de {n.format(data.dailyLimit)} notificações em 24 horas já foi usado. Dá para enviar de novo quando a mais antiga passar
            de 24 horas.
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-linha pt-4">
          <Button variant="secundario" disabled={!ready} busy={actions.test.isPending} onClick={() => void test()}>
            Testar neste navegador
          </Button>
          {!confirming ? (
            <Button disabled={!ready || limitReached || data.subscriptions === 0} busy={actions.send.isPending} onClick={() => setConfirming(true)}>
              Enviar para {n.format(data.subscriptions)} {data.subscriptions === 1 ? 'aparelho' : 'aparelhos'}
            </Button>
          ) : (
            <span className="inline-flex flex-wrap gap-2">
              <Button
                busy={actions.send.isPending}
                onClick={() => {
                  setConfirming(false);
                  if (!input) return;
                  actions.send.mutate(input, {
                    onSuccess: (result) => {
                      toast(`Notificação saindo para ${n.format(result.total)} aparelhos`);
                      setPostId(null);
                      setTitle('');
                      setBody('');
                    },
                  });
                }}
              >
                Confirmar envio
              </Button>
              <Button variant="secundario" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
            </span>
          )}
          {data.subscriptions === 0 && <span className="text-sm text-tinta-suave">Ninguém ativou as notificações ainda.</span>}
        </div>
      </div>
    </section>
  );
}

// Roughly how it looks on a phone.
function NotificationPreview({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium">Como aparece</p>
      <div className="flex max-w-sm items-start gap-3 rounded-2xl bg-superficie p-3 shadow-sm">
        <img src="/icon-192.png" alt="" className="size-9 shrink-0 rounded-lg" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title || 'Título'}</p>
          <p className="line-clamp-2 text-sm text-tinta-suave">{body || '…'}</p>
        </div>
      </div>
    </div>
  );
}

function History({ items }: { items: PushNotificationSummary[] }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Enviadas</h2>
      {items.length === 0 ? (
        <EmptyState title="Nenhuma notificação enviada ainda">As notificações enviadas aparecem aqui, com quantos aparelhos receberam.</EmptyState>
      ) : (
        <ul className="divide-y divide-linha rounded-lg border border-linha bg-papel">
          {items.map((item) => (
            <li key={item.id} className="px-4 py-3">
              <p className="font-semibold">{item.title}</p>
              {item.postTitle && item.postTitle !== item.title && <p className="text-sm">{item.postTitle}</p>}
              <p className="text-sm text-tinta-suave">
                {formatDateTime(item.createdAt)}
                {item.createdBy && `, por ${item.createdBy}`}
              </p>
              <p className="text-sm">
                {item.status === 'sending' ? (
                  <span className="font-semibold text-anil">
                    Enviando… {n.format(item.sent)} de {n.format(item.total)}
                  </span>
                ) : (
                  <>
                    Entregue a {n.format(item.sent)} de {n.format(item.total)}
                  </>
                )}
                {item.removed > 0 && <span className="text-tinta-suave"> · {n.format(item.removed)} aparelhos que desativaram foram removidos</span>}
                {item.failed > 0 && <span className="text-alerta"> · {n.format(item.failed)} com erro</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
