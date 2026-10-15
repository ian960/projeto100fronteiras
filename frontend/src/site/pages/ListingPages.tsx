import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Alert, Avatar, Button, EmptyState, Loading, Pagination } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { useBookmarks } from '../../lib/bookmarks';
import { useDocumentTitle } from '../../lib/hooks';
import { formatRelative, postPath } from '../../lib/format';
import { Kicker, SectionHeading, StoryList } from '../parts';
import type { PostFilters } from '../queries';
import { useAuthor, useCategory, useColumnists, usePostsByIds, usePublishedPosts } from '../queries';
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

function PagedPosts({ filters, empty }: { filters: PostFilters; empty: ReactNode }) {
  const [page, setPage] = usePageParam();
  const { data, isPending, error, isPlaceholderData } = usePublishedPosts({ ...filters, page });

  if (isPending) return <Loading />;
  if (error) return <Alert>Não foi possível carregar a lista. {errorMessage(error)}</Alert>;
  if (data.items.length === 0) return <>{empty}</>;

  return (
    <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
      <StoryList posts={data.items} />
      <div className="mt-4">
        <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
      </div>
    </div>
  );
}

function PageHeader({ title, children, tone = 'anil' }: { title: string; children?: ReactNode; tone?: 'anil' | 'mata' }) {
  return (
    <header className="mb-6">
      <h1 className={`titulo text-[2.2rem] sm:text-5xl ${tone === 'mata' ? 'text-mata' : 'text-anil'}`}>{title}</h1>
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
      <PagedPosts filters={{ type: 'news' }} empty={<EmptyState title="Nenhuma notícia publicada ainda" />} />
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
  useDocumentTitle('Opinião');
  const { data: columnists, isPending, error } = useColumnists();
  const latest = usePublishedPosts({ type: 'column', limit: 6 });

  return (
    <div>
      <PageHeader title="Opinião" tone="mata">
        Textos assinados por quem escreve para o portal. As colunas expressam a opinião de seus autores.
      </PageHeader>

      {isPending && <Loading />}
      {error && <Alert>{errorMessage(error)}</Alert>}

      {columnists && columnists.length === 0 && <EmptyState title="Nenhum colunista ainda" />}

      {columnists && columnists.length > 0 && (
        <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {columnists.map((author) => (
            <li key={author.id}>
              <Link to={`/autor/${author.slug}`} className="group flex gap-4 border-b border-linha py-5">
                <Avatar src={author.photoUrl} name={author.name} size={64} />
                <div className="min-w-0">
                  <p className="titulo text-xl group-hover:text-mata">{author.name}</p>
                  {author.columnTitle && <p className="text-sm font-medium text-mata">{author.columnTitle}</p>}
                  {author.bio && <p className="mt-1 line-clamp-2 text-sm text-tinta-suave">{author.bio}</p>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {latest.data && latest.data.items.length > 0 && (
        <section className="mt-14 max-w-3xl" aria-label="Colunas mais recentes">
          <SectionHeading tone="mata">Colunas mais recentes</SectionHeading>
          <StoryList posts={latest.data.items} showImages={false} />
        </section>
      )}
    </div>
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

      <SectionHeading tone={isColumnist ? 'mata' : 'anil'}>{isColumnist ? 'Colunas' : 'Matérias'}</SectionHeading>
      <PagedPosts filters={{ author: slug }} empty={<EmptyState title="Nada publicado ainda" />} />
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
