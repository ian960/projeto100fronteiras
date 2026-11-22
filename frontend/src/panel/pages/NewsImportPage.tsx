import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { Alert, Button, Checkbox, EmptyState, Loading, SelectField, TextField, cx } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useDocumentTitle } from '../../lib/hooks';
import { pt } from '../../lib/pt';
import type { ImportRunResult, NewsSource } from '../../lib/types';
import { useAdminCategories, useImportedItems, useNewsImportActions, useNewsSources } from '../queries';
import { ConfirmButton, Modal, PanelHeader, StatusPill, useToast } from '../widgets';

// The robots that bring news from other outlets (backend: modules/newsImport).
// Every 30 minutes the server reads each active source's RSS feed and turns
// each new story into a DRAFT, with "Fonte: <name>" and the link. Nothing is
// published on its own: the admin opens the draft, picks a cover and
// publishes.

// Sources whose license allows republishing the whole text, citing them.
// The admin can add any other feed, but then only the summary and the link.
const PRESETS: { name: string; feedUrl: string; fullText: boolean; terms: string }[] = [
  {
    name: 'Agência Brasil',
    feedUrl: 'https://agenciabrasil.ebc.com.br/feed/ultimasnoticias/feed.xml',
    fullText: true,
    terms: 'Reprodução autorizada para fins jornalísticos, citando a fonte (e o repórter).',
  },
  {
    name: 'Agência Senado',
    feedUrl: 'https://www12.senado.leg.br/noticias/feed/todasnoticias/RSS',
    fullText: true,
    terms: 'Reprodução livre, sem alterar o sentido, citando a Agência Senado e o autor.',
  },
  {
    name: 'gov.br',
    feedUrl: 'https://www.gov.br/pt-br/noticias/ultimas-noticias/ultimas-noticias/RSS',
    fullText: true,
    terms: 'Licença Creative Commons BY-ND: pode copiar citando a fonte, mas sem modificar o texto.',
  },
];

function fieldErrors(error: unknown): Record<string, string> {
  return error instanceof ApiError ? error.fields : {};
}

function runSummary(results: ImportRunResult[]): string {
  const imported = results.reduce((sum, r) => sum + r.imported, 0);
  const failed = results.filter((r) => r.error).length;
  const news = imported === 0 ? 'Nenhuma notícia nova' : imported === 1 ? '1 notícia nova' : `${imported} notícias novas`;
  return failed > 0 ? `${news}. ${failed === 1 ? '1 fonte deu erro' : `${failed} fontes deram erro`}.` : `${news}.`;
}

export default function NewsImportPage() {
  useDocumentTitle('Importar notícias');
  const { data, isPending, error } = useNewsSources();
  const actions = useNewsImportActions();
  const toast = useToast();
  const [editing, setEditing] = useState<NewsSource | 'new' | null>(null);
  const runningId = actions.run.isPending ? actions.run.variables : undefined;

  function run(id: string | null) {
    actions.run.mutate(id, {
      onSuccess: (results) => toast(runSummary(results), results.some((r) => r.error) ? 'erro' : 'ok'),
      onError: (err) => toast(errorMessage(err), 'erro'),
    });
  }

  return (
    <>
      <PanelHeader
        title="Importar notícias"
        description="Robôs que trazem notícias de outros sites a cada 30 minutos. Cada notícia nova chega como rascunho em Matérias, com “Fonte:” e o link da original. A foto da fonte já vem como capa. Nada é publicado sozinho: abra o rascunho, confira e publique."
        actions={
          <>
            {data && data.length > 0 && (
              <Button variant="secundario" busy={runningId === null} onClick={() => run(null)}>
                Buscar todas agora
              </Button>
            )}
            <Button onClick={() => setEditing('new')}>Nova fonte</Button>
          </>
        }
      />

      <div className="mb-6">
        <Alert tone="aviso">
          Só copie o texto inteiro de fontes que permitem a reprodução (Agência Brasil, Agência Senado, gov.br…). De outros
          sites, como G1, UOL ou jornais da região, o robô traz só o título, um resumo e o link: dar o crédito não autoriza
          copiar a matéria toda.
        </Alert>
      </div>

      {(actions.update.error || actions.remove.error) && (
        <div className="mb-4">
          <Alert>{errorMessage(actions.update.error ?? actions.remove.error)}</Alert>
        </div>
      )}

      {isPending ? (
        <Loading />
      ) : error ? (
        <Alert>{errorMessage(error)}</Alert>
      ) : data.length === 0 ? (
        <EmptyState title="Nenhuma fonte ainda" action={<Button onClick={() => setEditing('new')}>Cadastrar a primeira</Button>}>
          Comece pela Agência Brasil: em “Nova fonte”, escolha ela na lista de sugestões.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-linha rounded-lg border border-linha bg-papel">
          {data.map((source) => (
            <li key={source.id} className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {source.name}
                  <span
                    className={cx(
                      'rounded-full px-2 text-xs font-semibold leading-5',
                      source.fullText ? 'bg-mata text-white' : 'bg-superficie text-tinta-suave',
                    )}
                  >
                    {source.fullText ? 'Texto inteiro' : 'Só resumo e link'}
                  </span>
                  {!source.active && (
                    <span className="rounded-full bg-superficie px-2 text-xs font-semibold leading-5 text-tinta-suave">Desligada</span>
                  )}
                </p>
                <p className="text-sm text-tinta-suave">
                  Categoria: {source.category?.name ?? <span className="text-alerta">nenhuma, escolha uma</span>}
                </p>
                <p className="truncate text-sm text-tinta-suave">{source.feedUrl}</p>
                {source.lastRunAt ? (
                  source.lastError ? (
                    <p className="text-sm text-alerta">
                      {formatDateTime(source.lastRunAt)}: {pt(source.lastError)}
                    </p>
                  ) : (
                    <p className="text-sm text-tinta-suave">
                      Última busca {formatDateTime(source.lastRunAt)}:{' '}
                      {source.lastImportedCount === 0
                        ? 'nada novo'
                        : source.lastImportedCount === 1
                          ? '1 notícia nova'
                          : `${source.lastImportedCount} notícias novas`}
                    </p>
                  )
                ) : (
                  <p className="text-sm text-tinta-suave">Ainda não buscou. A primeira busca traz só as 3 mais recentes.</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Checkbox
                  label="Ligada"
                  checked={source.active}
                  onChange={(active) =>
                    actions.update.mutate(
                      { id: source.id, input: { active } },
                      { onSuccess: () => toast(active ? 'Fonte ligada' : 'Fonte desligada') },
                    )
                  }
                />
                <Button variant="secundario" small busy={runningId === source.id} onClick={() => run(source.id)}>
                  Buscar agora
                </Button>
                <Button variant="secundario" small onClick={() => setEditing(source)}>
                  Editar
                </Button>
                <ConfirmButton
                  label="Excluir"
                  confirmLabel="Confirmar"
                  busy={actions.remove.isPending && actions.remove.variables === source.id}
                  onConfirm={() => actions.remove.mutate(source.id, { onSuccess: () => toast('Fonte excluída. Os rascunhos já importados continuam em Matérias.') })}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <RecentItems />

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nova fonte' : 'Editar fonte'}>
        {editing && (
          <SourceForm key={editing === 'new' ? 'new' : editing.id} source={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
        )}
      </Modal>
    </>
  );
}

function RecentItems() {
  const { data } = useImportedItems();
  if (!data || data.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold">Últimas importadas</h2>
      <ul className="divide-y divide-linha rounded-lg border border-linha bg-papel">
        {data.map((item) =>
          item.post ? (
            <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
              <Link to={`/painel/materias/${item.post.id}`} className="min-w-0 flex-1 font-medium text-anil hover:underline underline-offset-4">
                {item.post.title}
              </Link>
              <StatusPill status={item.post.status} />
              <span className="text-sm text-tinta-suave">
                {item.source.name}, {formatDateTime(item.importedAt)}
              </span>
            </li>
          ) : null,
        )}
      </ul>
    </section>
  );
}

function SourceForm({ source, onDone }: { source: NewsSource | null; onDone: () => void }) {
  const { create, update } = useNewsImportActions();
  const categories = useAdminCategories();
  const toast = useToast();
  const mutation = source ? update : create;
  const errors = fieldErrors(mutation.error);
  const [form, setForm] = useState({
    name: source?.name ?? '',
    feedUrl: source?.feedUrl ?? '',
    fullText: source?.fullText ?? false,
    active: source?.active ?? true,
    categoryId: source?.categoryId ?? '',
  });
  const preset = PRESETS.find((p) => p.feedUrl === form.feedUrl.trim());

  function applyPreset(feedUrl: string) {
    const chosen = PRESETS.find((p) => p.feedUrl === feedUrl);
    if (chosen) setForm({ ...form, name: chosen.name, feedUrl: chosen.feedUrl, fullText: chosen.fullText });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const input = {
      name: form.name.trim(),
      feedUrl: form.feedUrl.trim(),
      fullText: form.fullText,
      active: form.active,
      categoryId: form.categoryId,
    };
    const done = { onSuccess: () => { toast(source ? 'Fonte atualizada' : 'Fonte cadastrada. Use “Buscar agora” para testar.'); onDone(); } };
    if (source) update.mutate({ id: source.id, input }, done);
    else create.mutate(input, done);
  }

  const shownError = mutation.error && Object.keys(errors).length === 0 ? errorMessage(mutation.error) : null;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {shownError && <Alert>{shownError}</Alert>}
      {!source && (
        <SelectField label="Sugestões" optional value={preset?.feedUrl ?? ''} onChange={(e) => applyPreset(e.target.value)} hint="Fontes que permitem copiar o texto citando a fonte.">
          <option value="">Escolha para preencher…</option>
          {PRESETS.map((p) => (
            <option key={p.feedUrl} value={p.feedUrl}>
              {p.name}
            </option>
          ))}
        </SelectField>
      )}
      <TextField
        label="Nome da fonte"
        placeholder="Ex.: Agência Brasil"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        error={errors.name}
        hint="Aparece embaixo da matéria como “Fonte: …”."
      />
      <TextField
        label="Endereço do feed RSS"
        type="url"
        inputMode="url"
        placeholder="https://"
        value={form.feedUrl}
        onChange={(e) => setForm({ ...form, feedUrl: e.target.value })}
        error={errors.feedUrl}
        hint="No site da fonte, procure o ícone ou o link “RSS”. Não é o endereço da página inicial."
      />
      <SelectField
        label="Categoria"
        value={form.categoryId}
        onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
        error={errors.categoryId}
        hint="Os rascunhos entram nesta categoria. Dá para trocar em cada matéria antes de publicar."
      >
        <option value="">Escolha…</option>
        {categories.data?.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </SelectField>
      <Checkbox
        label="Copiar o texto inteiro"
        hint={
          preset
            ? preset.terms
            : 'Só marque se o site da fonte diz que permite reproduzir as matérias. Desmarcado, o rascunho traz só o resumo e o link para a original.'
        }
        checked={form.fullText}
        onChange={(fullText) => setForm({ ...form, fullText })}
      />
      <Checkbox
        label="Ligada"
        hint="Desligada, o robô não busca esta fonte sozinho."
        checked={form.active}
        onChange={(active) => setForm({ ...form, active })}
      />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secundario" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" busy={mutation.isPending}>
          {source ? 'Salvar' : 'Cadastrar fonte'}
        </Button>
      </div>
    </form>
  );
}
