import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Alert, Avatar, Button, EmptyState, Loading, Pagination } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { useBookmarks } from '../../lib/bookmarks';
import { useDocumentTitle } from '../../lib/hooks';
import { formatRelative, postPath } from '../../lib/format';
import { Kicker, ListLead, SectionHeading, StoryList } from '../parts';
import type { PostFilters } from '../queries';
import { useAuthor, useCategory, useColumnists, usePostsByIds, usePublishedPosts } from '../queries';
import type { ColumnistCard } from '../../lib/types';
import NotFoundPage from './NotFoundPage';

// The page number lives in the URL (?pagina=2), so a page can be shared and
// the back button returns to it.
function usePageParam(): [number, (page: number) => void] {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('pagina')) || 1);

  const setPage = (next: number) => {
    const copy = new URLSearchParams(params);
    if (next <= 1) copy.delete('pagina');
    else copy.set('pagina', String(next));
    setParams(copy);
    window.scrollTo({ top: 0 });
  };

  return [page, setPage];
}

// leadFirst: on the first page, the newest story gets a photo beside its
// headline. showKicker: off where every story has the same category.
function PagedPosts({ filters, empty, leadFirst = false, showKicker = true }: {
  filters: PostFilters;
  empty: ReactNode;
  leadFirst?: boolean;
  showKicker?: boolean;
}) {
  const [page, setPage] = usePageParam();
  const { data, isPending, error, isPlaceholderData } = usePublishedPosts({ ...filters, page });

  if (isPending) return <Loading />;
  if (error) return <Alert>Não foi possível carregar a lista. {errorMessage(error)}</Alert>;
  if (data.items.length === 0) return <>{empty}</>;

  const [first, ...rest] = data.items;
  const withLead = leadFirst && data.page === 1 && first;

  return (
    <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
      {withLead && <ListLead post={first} showKicker={showKicker} />}
      <StoryList posts={withLead ? rest : data.items} showKicker={showKicker} />
      <div className="mt-4">
        <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
      </div>
    </div>
  );
}

function PageHeader({ title, children, tone = 'anil' }: { title: string; children?: ReactNode; tone?: 'anil' | 'mata' }) {
  return (
    <header className="mb-8">
      <h1 className={`titulo text-[2.4rem] sm:text-[3.4rem] ${tone === 'mata' ? 'text-mata' : 'text-anil'}`}>{title}</h1>
      {children && <div className="mt-3 max-w-2xl text-lg text-tinta-suave">{children}</div>}
    </header>
  );
}

// ── /noticias ────────────────────────────────────────────────────────────────

export function NewsPage() {
  useDocumentTitle('Últimas notícias');
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Últimas notícias" />
      <PagedPosts filters={{ type: 'news' }} leadFirst empty={<EmptyState title="Nenhuma notícia publicada ainda" />} />
    </div>
  );
}

// ── /categoria/:slug ─────────────────────────────────────────────────────────

export function CategoryPage() {
  const { slug = '' } = useParams();
  const { data: category, isPending, error } = useCategory(slug);
  useDocumentTitle(category?.name);

  if (isPending) return <Loading />;
  if (error) {
    if (error instanceof ApiError && error.status === 404) return <NotFoundPage what="editoria" />;
    return <Alert>{errorMessage(error)}</Alert>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={category.name} />
      <PagedPosts
        filters={{ type: 'news', category: slug }}
        leadFirst
        showKicker={false}
        empty={<EmptyState title={`Nada publicado em ${category.name} ainda`}>Volte mais tarde ou veja as últimas notícias.</EmptyState>}
      />
    </div>
  );
}

// ── /busca?q= ────────────────────────────────────────────────────────────────

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const [draft, setDraft] = useState(q);
  useDocumentTitle(q ? `Busca: ${q}` : 'Buscar');

  useEffect(() => setDraft(q), [q]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = draft.trim();
    setParams(value ? { q: value } : {});
  }

  // The API searches titles and needs at least two characters.
  const ready = q.length >= 2;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Buscar" />
      <form onSubmit={submit} role="search" className="flex gap-2">
        <label htmlFor="busca" className="sr-only">
          Buscar no título das matérias
        </label>
        <input
          id="busca"
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Buscar pelo título da matéria"
          autoFocus
          className="h-12 min-w-0 flex-1 rounded-md border border-linha px-4 text-base focus:border-anil focus:outline-none focus:ring-2 focus:ring-anil/15"
        />
        <Button type="submit" className="h-12">
          Buscar
        </Button>
      </form>

      <div className="mt-8">
        {q && !ready && <p className="text-tinta-suave">Digite pelo menos duas letras.</p>}
        {ready && (
          <>
            <p className="mb-2 text-sm text-tinta-suave">Resultados para “{q}”</p>
            <PagedPosts
              filters={{ q }}
              empty={<EmptyState title="Nenhuma matéria encontrada">Tente outra palavra do título, ou uma mais curta.</EmptyState>}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── /colunistas ──────────────────────────────────────────────────────────────

export function ColumnistsPage() {
  useDocumentTitle('Colunistas');
  const { data: columnists, isPending, error } = useColumnists();
  const latest = usePublishedPosts({ type: 'column', limit: 6 });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Colunistas" tone="mata">
        Quem escreve opinião no portal. Toque em um colunista para ler todas as colunas dele. As colunas expressam a
        opinião de seus autores.
      </PageHeader>

      {isPending && <Loading />}
      {error && <Alert>{errorMessage(error)}</Alert>}

      {columnists && columnists.length === 0 && <EmptyState title="Nenhum colunista ainda" />}

      {columnists && columnists.length > 0 && (
        <ul className="grid gap-6 sm:grid-cols-2">
          {columnists.map((author) => (
            <li key={author.id}>
              <ColumnistCardView author={author} />
            </li>
          ))}
        </ul>
      )}

      {latest.data && latest.data.items.length > 0 && (
        <section className="mt-14" aria-label="Colunas mais recentes">
          <SectionHeading tone="mata">Colunas mais recentes</SectionHeading>
          <StoryList posts={latest.data.items} showImages={false} />
        </section>
      )}
    </div>
  );
}

function columnCountLabel(count: number): string {
  if (count === 0) return 'Nenhuma coluna publicada ainda';
  return count === 1 ? '1 coluna publicada' : `${count} colunas publicadas`;
}

// One columnist: who they are, how much they wrote and the newest column.
// The photo and name lead to all their columns; the newest column has a link
// of its own.
function ColumnistCardView({ author }: { author: ColumnistCard }) {
  const page = `/autor/${author.slug}`;

  return (
    <article className="flex h-full flex-col rounded-lg border border-linha p-5">
      <Link to={page} className="group flex items-center gap-4">
        <Avatar src={author.photoUrl} name={author.name} size={80} />
        <div className="min-w-0">
          <h2 className="titulo text-2xl group-hover:text-mata">{author.name}</h2>
          {author.columnTitle && <p className="text-sm font-medium text-mata">{author.columnTitle}</p>}
        </div>
      </Link>

      {author.bio && <p className="mt-4 line-clamp-4 text-[0.9375rem] leading-relaxed text-tinta-suave">{author.bio}</p>}

      <div className="mt-4 border-t border-linha pt-3 text-sm">
        <p className="text-tinta-suave">{columnCountLabel(author.columnCount)}</p>
        {author.latestColumn && (
          <p className="mt-1">
            <span className="text-tinta-suave">Última: </span>
            <Link to={postPath({ type: 'column', slug: author.latestColumn.slug })} className="font-medium hover:text-mata hover:underline underline-offset-4">
              {author.latestColumn.title}
            </Link>
            {author.latestColumn.publishedAt && (
              <span className="text-tinta-suave"> · {formatRelative(author.latestColumn.publishedAt)}</span>
            )}
          </p>
        )}
      </div>

      <Link to={page} className="mt-auto pt-4 text-sm font-semibold text-mata hover:underline underline-offset-4">
        Ver todas as colunas →
      </Link>
    </article>
  );
}

// ── /autor/:slug ─────────────────────────────────────────────────────────────
// The writer page from the contract: photo, bio and what they signed.

export function AuthorPage() {
  const { slug = '' } = useParams();
  const { data: author, isPending, error } = useAuthor(slug);
  useDocumentTitle(author?.name);

  if (isPending) return <Loading />;
  if (error) {
    if (error instanceof ApiError && error.status === 404) return <NotFoundPage what="página de autor" />;
    return <Alert>{errorMessage(error)}</Alert>;
  }

  const isColumnist = author.type === 'columnist';

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-center">
        <Avatar src={author.photoUrl} name={author.name} size={112} />
        <div>
          <h1 className={`titulo text-[2.2rem] sm:text-5xl ${isColumnist ? 'text-mata' : 'text-anil'}`}>{author.name}</h1>
          {author.columnTitle && <p className="mt-1 font-medium text-mata">{author.columnTitle}</p>}
          {author.bio && <p className="mt-3 max-w-xl text-lg leading-relaxed text-tinta-suave">{author.bio}</p>}
        </div>
      </header>

      {isColumnist && (
        <p className="mb-6 text-sm">
          <Link to="/colunistas" className="text-mata hover:underline underline-offset-4">
            ← Todos os colunistas
          </Link>
        </p>
      )}

      <SectionHeading tone={isColumnist ? 'mata' : 'anil'}>{isColumnist ? 'Todas as colunas' : 'Matérias'}</SectionHeading>
      <PagedPosts
        filters={isColumnist ? { author: slug, type: 'column' } : { author: slug }}
        empty={<EmptyState title="Nada publicado ainda" />}
        showKicker={!isColumnist}
      />
    </div>
  );
}

// ── /salvos ──────────────────────────────────────────────────────────────────

export function SavedPage() {
  useDocumentTitle('Salvos');
  const { ids, remove } = useBookmarks();
  const { data, isPending, error, isPlaceholderData } = usePostsByIds(ids);

  // Saved posts that were unpublished since: keep the list honest.
  useEffect(() => {
    if (!data || isPlaceholderData) return;
    const found = new Set(data.map((post) => post.id));
    ids.filter((id) => !found.has(id)).forEach(remove);
  }, [data, ids, remove, isPlaceholderData]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Salvos para ler depois">
        Ficam guardados neste navegador. Não precisa de conta.
      </PageHeader>

      {ids.length === 0 ? (
        <EmptyState title="Nada salvo ainda">
          Na página de uma matéria, toque em “Salvar para ler depois” e ela aparece aqui.
        </EmptyState>
      ) : isPending ? (
        <Loading />
      ) : error ? (
        <Alert>{errorMessage(error)}</Alert>
      ) : (
        <ul className="divide-y divide-linha">
          {data.filter((post) => ids.includes(post.id)).map((post) => (
            <li key={post.id} className="flex items-start justify-between gap-4 py-5">
              <div className="min-w-0">
                <Kicker post={post} />
                <h2 className="titulo mt-1 text-xl">
                  <Link to={postPath(post)} className="hover:text-anil">
                    {post.title}
                  </Link>
                </h2>
                <p className="mt-1 text-sm text-tinta-suave">{formatRelative(post.publishedAt)}</p>
              </div>
              <Button variant="texto" onClick={() => remove(post.id)} className="shrink-0 text-sm">
                Remover
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
