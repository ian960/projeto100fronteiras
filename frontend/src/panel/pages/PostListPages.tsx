import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Alert, ButtonLink, EmptyState, Loading, Pagination, cx } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { formatDateTime, postPath } from '../../lib/format';
import { useDocumentTitle, useHealth, useMe } from '../../lib/hooks';
import type { PostListItem, PostStatus, PostType } from '../../lib/types';
import type { Scope } from '../queries';
import { usePanelPosts, usePostCount } from '../queries';
import { PanelHeader, StatusPill, TypePill } from '../widgets';

// ── Shared list ──────────────────────────────────────────────────────────────

function PostRows({ posts, scope }: { posts: PostListItem[]; scope: Scope }) {
  const base = scope === 'admin' ? '/painel/materias' : '/painel/colunas';
  return (
    <ul className="divide-y divide-linha rounded-lg border border-linha bg-papel">
      {posts.map((post) => (
        <li key={post.id} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0 flex-1">
            <Link to={`${base}/${post.id}`} className="font-semibold hover:text-anil hover:underline underline-offset-4">
              {post.title}
            </Link>
            <p className="mt-0.5 text-sm text-tinta-suave">
              {scope === 'admin' && post.author ? `${post.author.name}, ` : ''}
              {post.category ? `${post.category.name}, ` : ''}
              atualizada em {formatDateTime(post.updatedAt)}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {post.featured && <span className="rounded-full bg-sol/20 px-2.5 text-xs font-semibold leading-6 text-aviso">Destaque</span>}
            {scope === 'admin' && <TypePill type={post.type} />}
            <StatusPill status={post.status} />
            {post.status === 'published' && (
              <Link to={postPath(post)} className="text-sm font-medium text-anil hover:underline underline-offset-4" target="_blank">
                Ver no site
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function useListParams() {
  const [params, setParams] = useSearchParams();
  const get = (key: string) => params.get(key) ?? '';
  const set = (changes: Record<string, string | undefined>) => {
    const copy = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) copy.set(key, value);
      else copy.delete(key);
    }
    if (!('pagina' in changes)) copy.delete('pagina');
    setParams(copy, { replace: true });
  };
  return { get, set, page: Math.max(1, Number(params.get('pagina')) || 1) };
}

function SearchBox({ value, onSearch }: { value: string; onSearch: (q: string) => void }) {
  const [draft, setDraft] = useState(value);
  function submit(event: FormEvent) {
    event.preventDefault();
    onSearch(draft.trim());
  }
  return (
    <form onSubmit={submit} role="search" className="flex min-w-0 flex-1 gap-2 sm:max-w-xs">
      <label htmlFor="busca-painel" className="sr-only">
        Buscar pelo título
      </label>
      <input
        id="busca-painel"
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Buscar pelo título"
        className="h-9 min-w-0 flex-1 rounded-md border border-linha bg-papel px-3 text-sm focus:border-anil focus:outline-none focus:ring-2 focus:ring-anil/15"
      />
    </form>
  );
}

const statusTabs: { value: '' | PostStatus; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'draft', label: 'Rascunhos' },
  { value: 'pending', label: 'Em revisão' },
  { value: 'published', label: 'Publicadas' },
];

function Tabs({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div role="tablist" aria-label="Situação" className="flex gap-1 overflow-x-auto rounded-lg bg-papel p-1 [scrollbar-width:none]">
      {statusTabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={cx(
            'h-8 shrink-0 rounded-md px-3 text-sm font-medium',
            value === tab.value ? 'bg-anil text-white' : 'text-tinta-suave hover:text-tinta',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ── Admin: all posts ─────────────────────────────────────────────────────────

export function AdminPostsPage() {
  useDocumentTitle('Matérias');
  const { get, set, page } = useListParams();
  const status = get('situacao') as '' | PostStatus;
  const type = get('tipo') as '' | PostType;
  const q = get('q');

  const { data, isPending, error, isPlaceholderData } = usePanelPosts('admin', {
    status: status || undefined,
    type: type || undefined,
    q: q.length >= 2 ? q : undefined,
    page,
  });

  return (
    <>
      <PanelHeader
        title="Matérias"
        description="Notícias e colunas de todos os autores."
        actions={<ButtonLink to="/painel/materias/nova">Nova notícia</ButtonLink>}
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={status} onChange={(value) => set({ situacao: value })} />
        <div className="flex gap-2">
          <label htmlFor="tipo" className="sr-only">
            Tipo
          </label>
          <select
            id="tipo"
            value={type}
            onChange={(event) => set({ tipo: event.target.value })}
            className="h-9 rounded-md border border-linha bg-papel px-2 text-sm"
          >
            <option value="">Notícias e colunas</option>
            <option value="news">Só notícias</option>
            <option value="column">Só colunas</option>
          </select>
          <SearchBox value={q} onSearch={(value) => set({ q: value })} />
        </div>
      </div>

      {isPending ? (
        <Loading />
      ) : error ? (
        <Alert>{errorMessage(error)}</Alert>
      ) : data.items.length === 0 ? (
        <EmptyState title={q ? 'Nada encontrado com esse título' : 'Nenhuma matéria aqui'}>
          {status === 'pending' ? 'Nenhuma coluna esperando revisão.' : 'Comece escrevendo uma notícia.'}
        </EmptyState>
      ) : (
        <div className={cx('flex flex-col gap-4', isPlaceholderData && 'opacity-60')}>
          <PostRows posts={data.items} scope="admin" />
          <Pagination page={data.page} totalPages={data.totalPages} onChange={(next) => set({ pagina: String(next) })} />
        </div>
      )}
    </>
  );
}

// ── Admin: review queue ──────────────────────────────────────────────────────

export function ReviewQueuePage() {
  useDocumentTitle('Revisão');
  const { data, isPending, error } = usePanelPosts('admin', { status: 'pending', limit: 50 });

  return (
    <>
      <PanelHeader
        title="Revisão"
        description="Colunas que os colunistas enviaram. Abra, leia, ajuste se precisar e publique."
      />
      {isPending ? (
        <Loading />
      ) : error ? (
        <Alert>{errorMessage(error)}</Alert>
      ) : data.items.length === 0 ? (
        <EmptyState title="Nada esperando revisão">Quando um colunista enviar um texto, ele aparece aqui.</EmptyState>
      ) : (
        <PostRows posts={data.items} scope="admin" />
      )}
    </>
  );
}

// ── Columnist: own columns ───────────────────────────────────────────────────

export function MyColumnsPage() {
  useDocumentTitle('Minhas colunas');
  const { get, set, page } = useListParams();
  const status = get('situacao') as '' | PostStatus;
  const { data, isPending, error } = usePanelPosts('columnist', { status: status || undefined, page });

  return (
    <>
      <PanelHeader
        title="Minhas colunas"
        description="Escreva, salve quantas vezes quiser e envie para revisão quando estiver pronto. Depois de publicada, só o administrador altera."
        actions={<ButtonLink to="/painel/colunas/nova">Nova coluna</ButtonLink>}
      />
      <div className="mb-4">
        <Tabs value={status} onChange={(value) => set({ situacao: value })} />
      </div>
      {isPending ? (
        <Loading />
      ) : error ? (
        <Alert>{errorMessage(error)}</Alert>
      ) : data.items.length === 0 ? (
        <EmptyState title="Nenhuma coluna aqui" action={<ButtonLink to="/painel/colunas/nova">Escrever a primeira</ButtonLink>} />
      ) : (
        <div className="flex flex-col gap-4">
          <PostRows posts={data.items} scope="columnist" />
          <Pagination page={data.page} totalPages={data.totalPages} onChange={(next) => set({ pagina: String(next) })} />
        </div>
      )}
    </>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────

function Count({ value, label, to }: { value: number | undefined; label: string; to: string }) {
  return (
    <Link to={to} className="flex items-baseline gap-2 rounded-lg border border-linha bg-papel px-4 py-3 hover:border-anil">
      <span className="text-2xl font-semibold tabular-nums">{value ?? '–'}</span>
      <span className="text-[0.9375rem] text-tinta-suave">{label}</span>
    </Link>
  );
}

export function DashboardPage() {
  useDocumentTitle('Painel');
  const { data: me } = useMe();
  const { data: health } = useHealth();
  const isAdmin = me?.role === 'admin';
  const scope: Scope = isAdmin ? 'admin' : 'columnist';

  const pending = usePostCount(scope, { status: 'pending' });
  const drafts = usePostCount(scope, { status: 'draft' });
  const published = usePostCount(scope, { status: 'published' });
  const recent = usePanelPosts(scope, { limit: 6 });
  const listBase = isAdmin ? '/painel/materias' : '/painel/colunas';

  return (
    <>
      <PanelHeader
        title={`Olá, ${me?.name.split(' ')[0] ?? ''}`}
        description={isAdmin ? 'O que está acontecendo no portal.' : me?.author?.columnTitle ? `Sua coluna: ${me.author.columnTitle}` : undefined}
        actions={
          isAdmin ? (
            <>
              <ButtonLink to="/painel/materias/nova">Nova notícia</ButtonLink>
              <ButtonLink to="/painel/categorias" variant="secundario">
                Categorias
              </ButtonLink>
            </>
          ) : (
            <ButtonLink to="/painel/colunas/nova">Nova coluna</ButtonLink>
          )
        }
      />

      {health?.uploads === 'disabled' && (
        <div className="mb-6">
          <Alert tone="info">O envio de imagens, vídeos e PDFs ainda não está ligado neste servidor: falta configurar o Cloudinary no backend. Até lá, colunas e rascunhos funcionam, mas notícias não podem ser publicadas sem capa.</Alert>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Count value={pending.data} label={isAdmin ? 'esperando revisão' : 'em revisão'} to={isAdmin ? '/painel/revisao' : `${listBase}?situacao=pending`} />
        <Count value={drafts.data} label="rascunhos" to={`${listBase}?situacao=draft`} />
        <Count value={published.data} label="publicadas" to={`${listBase}?situacao=published`} />
      </div>

      <section className="mt-10" aria-label="Alterações recentes">
        <h2 className="mb-3 text-lg font-semibold">Alterações recentes</h2>
        {recent.isPending ? (
          <Loading />
        ) : recent.error ? (
          <Alert>{errorMessage(recent.error)}</Alert>
        ) : recent.data.items.length === 0 ? (
          <EmptyState title={isAdmin ? 'Nenhuma matéria ainda' : 'Nenhuma coluna ainda'} />
        ) : (
          <PostRows posts={recent.data.items} scope={scope} />
        )}
      </section>
    </>
  );
}
