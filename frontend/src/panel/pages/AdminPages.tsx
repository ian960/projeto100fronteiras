import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { Alert, Avatar, Button, Checkbox, EmptyState, Loading, Pagination, SelectField, TextArea, TextField, cx } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { countPosts, formatDateTime, isSlugOf, roleLabel, slugify } from '../../lib/format';
import { useDocumentTitle, useMe } from '../../lib/hooks';
import type { AuthorWithCount, CategoryWithCount, Role, User } from '../../lib/types';
import { useAdminAuthors, useAdminCategories, useAuthorActions, useCategoryActions, useUserActions, useUsers } from '../queries';
import { ImageField } from '../mediaFields';
import type { ImageValue } from '../mediaFields';
import { ConfirmButton, Modal, PanelHeader, useToast } from '../widgets';

function fieldErrors(error: unknown): Record<string, string> {
  return error instanceof ApiError ? error.fields : {};
}

function bannerFor(error: unknown): string | null {
  if (!error) return null;
  return errorMessage(error);
}

// ════════════════════════════════════════════════════════════════════════════
// Categories
// ════════════════════════════════════════════════════════════════════════════

export function CategoriesPage() {
  useDocumentTitle('Categorias');
  const { data, isPending, error } = useAdminCategories();
  const actions = useCategoryActions();
  const toast = useToast();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<CategoryWithCount | null>(null);

  function create(event: FormEvent) {
    event.preventDefault();
    actions.create.mutate(
      { name: name.trim() },
      {
        onSuccess: () => {
          setName('');
          toast('Categoria criada');
        },
      },
    );
  }

  return (
    <>
      <PanelHeader
        title="Categorias"
        description="As editorias do menu do site. Só notícias têm categoria; colunas ficam em Opinião."
      />

      <form onSubmit={create} className="mb-6 flex flex-col gap-3 rounded-lg border border-linha bg-papel p-4 sm:flex-row sm:items-start">
        <div className="flex-1">
          <TextField
            label="Nova categoria"
            placeholder="Ex.: Política"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={fieldErrors(actions.create.error).name}
          />
        </div>
        <Button type="submit" busy={actions.create.isPending} disabled={name.trim().length < 2} className="sm:mt-[1.625rem]">
          Criar categoria
        </Button>
      </form>
      {actions.create.error && !fieldErrors(actions.create.error).name && (
        <div className="mb-4">
          <Alert>{bannerFor(actions.create.error)}</Alert>
        </div>
      )}
      {actions.remove.error && (
        <div className="mb-4">
          <Alert>{bannerFor(actions.remove.error)}</Alert>
        </div>
      )}

      {isPending ? (
        <Loading />
      ) : error ? (
        <Alert>{errorMessage(error)}</Alert>
      ) : data.length === 0 ? (
        <EmptyState title="Nenhuma categoria ainda">Crie a primeira acima. Ela aparece no menu do site assim que tiver notícias.</EmptyState>
      ) : (
        <ul className="divide-y divide-linha rounded-lg border border-linha bg-papel">
          {data.map((category) => (
            <li key={category.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className={cx('font-semibold', !category.active && 'text-tinta-suave line-through')}>{category.name}</p>
                <p className="text-sm text-tinta-suave">
                  /categoria/{category.slug}, ordem no menu {category.sortOrder}, {countPosts(category._count?.posts ?? 0)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Checkbox
                  label="Visível no site"
                  checked={category.active}
                  onChange={(active) =>
                    actions.update.mutate(
                      { id: category.id, input: { active } },
                      { onSuccess: () => toast(active ? 'Categoria visível no site' : 'Categoria escondida do site') },
                    )
                  }
                />
                <Button variant="secundario" small onClick={() => setEditing(category)}>
                  Editar
                </Button>
                <ConfirmButton
                  label="Excluir"
                  confirmLabel="Confirmar"
                  busy={actions.remove.isPending && actions.remove.variables === category.id}
                  onConfirm={() => actions.remove.mutate(category.id, { onSuccess: () => toast('Categoria excluída') })}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <CategoryModal category={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function CategoryModal({ category, onClose }: { category: CategoryWithCount | null; onClose: () => void }) {
  return (
    <Modal open={category !== null} onClose={onClose} title="Editar categoria">
      {category && <CategoryForm key={category.id} category={category} onDone={onClose} />}
    </Modal>
  );
}

// "/categoria/politica", or a warning when saving will move the page.
function addressHint(prefix: string, current: string, next: string): string {
  if (!next || next === current) return `${prefix}${current}`;
  return `Vai mudar de ${prefix}${current} para ${prefix}${next}. Links antigos param de funcionar.`;
}

function CategoryForm({ category, onDone }: { category: CategoryWithCount; onDone: () => void }) {
  const { update } = useCategoryActions();
  const toast = useToast();
  const [form, setForm] = useState({ name: category.name, slug: category.slug, slugTouched: false, sortOrder: String(category.sortOrder) });
  const errors = fieldErrors(update.error);
  // An address made from the name follows the name (the server does the
  // same); one typed by hand stays.
  const shownSlug = !form.slugTouched && isSlugOf(category.slug, category.name) ? slugify(form.name) : form.slug;

  function submit(event: FormEvent) {
    event.preventDefault();
    const slug = form.slugTouched ? { slug: form.slug.trim() || form.name.trim() } : {};
    update.mutate(
      { id: category.id, input: { name: form.name.trim(), ...slug, sortOrder: Number(form.sortOrder) || 0 } },
      {
        onSuccess: () => {
          toast('Categoria atualizada');
          onDone();
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {update.error && Object.keys(errors).length === 0 && <Alert>{bannerFor(update.error)}</Alert>}
      <TextField label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} />
      <TextField
        label="Endereço"
        value={shownSlug}
        onChange={(e) => setForm({ ...form, slug: e.target.value, slugTouched: true })}
        error={errors.slug}
        hint={addressHint('/categoria/', category.slug, shownSlug)}
      />
      <TextField
        label="Posição no menu"
        type="number"
        min={0}
        value={form.sortOrder}
        onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
        error={errors.sortOrder}
        hint="Menor aparece primeiro. Empates ficam em ordem alfabética."
      />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secundario" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" busy={update.isPending}>
          Salvar
        </Button>
      </div>
    </form>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Authors
// ════════════════════════════════════════════════════════════════════════════

export function AuthorsPage() {
  useDocumentTitle('Autores');
  const { data, isPending, error } = useAdminAuthors();
  const actions = useAuthorActions();
  const toast = useToast();
  const [editing, setEditing] = useState<AuthorWithCount | 'new' | null>(null);
  const [removing, setRemoving] = useState<AuthorWithCount | null>(null);

  // Swaps an author with the one above (-1) or below (+1) and saves the whole
  // order. The list shows the new order right away.
  const [order, setOrder] = useState<string[] | null>(null);
  const list = order && data ? order.map((id) => data.find((a) => a.id === id)).filter((a): a is AuthorWithCount => !!a) : data;
  function move(index: number, step: -1 | 1) {
    if (!list) return;
    const ids = list.map((a) => a.id);
    const target = index + step;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    setOrder(ids);
    actions.reorder.mutate(ids, {
      onSuccess: () => setOrder(null),
      onError: (err) => {
        setOrder(null);
        toast(errorMessage(err), 'erro');
      },
    });
  }

  return (
    <>
      <PanelHeader
        title="Autores"
        description="Quem assina as matérias. Redatores são só assinatura, sem login. Colunistas entram pela tela de Usuários. Use as setas para escolher a ordem em que os autores aparecem na página Colunistas do site."
        actions={<Button onClick={() => setEditing('new')}>Novo redator</Button>}
      />
      {actions.remove.error && (
        <div className="mb-4">
          <Alert>{bannerFor(actions.remove.error)}</Alert>
        </div>
      )}

      {isPending ? (
        <Loading />
      ) : error ? (
        <Alert>{errorMessage(error)}</Alert>
      ) : (
        <ul className="divide-y divide-linha rounded-lg border border-linha bg-papel">
          {(list ?? data).map((author, index, all) => (
            <li key={author.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    aria-label={`Subir ${author.name}`}
                    title="Subir"
                    disabled={index === 0 || actions.reorder.isPending}
                    onClick={() => move(index, -1)}
                    className="flex h-6 w-7 items-center justify-center rounded text-tinta-suave hover:bg-superficie hover:text-tinta disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label={`Descer ${author.name}`}
                    title="Descer"
                    disabled={index === all.length - 1 || actions.reorder.isPending}
                    onClick={() => move(index, 1)}
                    className="flex h-6 w-7 items-center justify-center rounded text-tinta-suave hover:bg-superficie hover:text-tinta disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>
                <Avatar src={author.photoUrl} name={author.name} size={44} />
                <div className="min-w-0">
                  <p className={cx('font-semibold', !author.active && 'text-tinta-suave line-through')}>
                    {author.name}
                    <span className={cx('ml-2 text-xs font-semibold', author.type === 'columnist' ? 'text-mata' : 'text-anil')}>
                      {author.type === 'columnist' ? 'Colunista' : 'Redator'}
                    </span>
                  </p>
                  <p className="truncate text-sm text-tinta-suave">
                    {author.columnTitle ? `${author.columnTitle}, ` : ''}
                    {countPosts(author._count?.posts ?? 0)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link to={`/autor/${author.slug}`} target="_blank" className="px-2 text-sm font-medium text-anil hover:underline underline-offset-4">
                  Página
                </Link>
                <Button variant="secundario" small onClick={() => setEditing(author)}>
                  Editar
                </Button>
                {(author._count?.posts ?? 0) === 0 ? (
                  <ConfirmButton
                    label="Excluir"
                    confirmLabel="Confirmar"
                    onConfirm={() => actions.remove.mutate({ id: author.id }, { onSuccess: () => toast('Autor excluído') })}
                  />
                ) : (
                  <Button variant="perigo" small onClick={() => setRemoving(author)}>
                    Excluir
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Novo redator' : 'Editar autor'}>
        {editing && <AuthorForm key={editing === 'new' ? 'new' : editing.id} author={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={removing !== null} onClose={() => setRemoving(null)} title="Excluir autor">
        {removing && (
          <RemoveAuthorForm
            key={removing.id}
            author={removing}
            others={(data ?? []).filter((other) => other.id !== removing.id)}
            onDone={() => setRemoving(null)}
          />
        )}
      </Modal>
    </>
  );
}

// An author who signs posts: the admin decides whether the posts move to
// another byline or go with the author.
function RemoveAuthorForm({ author, others, onDone }: { author: AuthorWithCount; others: AuthorWithCount[]; onDone: () => void }) {
  const { remove } = useAuthorActions();
  const toast = useToast();
  const posts = author._count?.posts ?? 0;
  const [mode, setMode] = useState<'transfer' | 'delete'>(others.length > 0 ? 'transfer' : 'delete');
  const [transferTo, setTransferTo] = useState(others[0]?.id ?? '');
  const [understood, setUnderstood] = useState(false);
  const canSubmit = mode === 'transfer' ? transferTo !== '' : understood;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    remove.mutate(mode === 'transfer' ? { id: author.id, transferTo } : { id: author.id, deletePosts: true }, {
      onSuccess: () => {
        toast(mode === 'transfer' ? 'Autor excluído e matérias transferidas' : 'Autor e matérias excluídos');
        onDone();
      },
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {remove.error && <Alert>{bannerFor(remove.error)}</Alert>}
      <p className="text-sm">
        <strong>{author.name}</strong> assina {countPosts(posts)}. O que fazer com elas?
        {author.type === 'columnist' && ' A conta de login dessa pessoa volta a ser de leitor.'}
      </p>

      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">O que fazer com as matérias</legend>
        <label className={cx('flex items-start gap-2 text-sm', others.length === 0 && 'opacity-50')}>
          <input
            type="radio"
            name="modo"
            className="mt-1"
            checked={mode === 'transfer'}
            disabled={others.length === 0}
            onChange={() => setMode('transfer')}
          />
          <span className="flex flex-1 flex-col gap-2">
            Passar as matérias para outro autor (continuam no ar com a nova assinatura)
            {mode === 'transfer' && others.length > 0 && (
              <select
                aria-label="Autor que recebe as matérias"
                value={transferTo}
                onChange={(event) => setTransferTo(event.target.value)}
                className="h-9 rounded-md border border-linha bg-papel px-2 text-sm"
              >
                {others.map((other) => (
                  <option key={other.id} value={other.id}>
                    {other.name}
                  </option>
                ))}
              </select>
            )}
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="modo" className="mt-1" checked={mode === 'delete'} onChange={() => setMode('delete')} />
          <span>Apagar as matérias junto com o autor</span>
        </label>
      </fieldset>

      {mode === 'delete' && (
        <Checkbox
          label={`Entendo que ${countPosts(posts)} e os comentários delas somem do site para sempre`}
          checked={understood}
          onChange={setUnderstood}
        />
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secundario" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" variant="perigo" busy={remove.isPending} disabled={!canSubmit}>
          Excluir autor
        </Button>
      </div>
    </form>
  );
}

function AuthorForm({ author, onDone }: { author: AuthorWithCount | null; onDone: () => void }) {
  const { create, update } = useAuthorActions();
  const toast = useToast();
  const mutation = author ? update : create;
  const errors = fieldErrors(mutation.error);
  const [form, setForm] = useState({
    name: author?.name ?? '',
    slug: author?.slug ?? '',
    bio: author?.bio ?? '',
    photo: (author?.photoId && author.photoUrl ? { id: author.photoId, previewUrl: author.photoUrl } : null) as ImageValue,
    columnTitle: author?.columnTitle ?? '',
    active: author?.active ?? true,
    slugTouched: false,
  });
  const shownSlug = author && !form.slugTouched && isSlugOf(author.slug, author.name) ? slugify(form.name) : form.slug;

  function submit(event: FormEvent) {
    event.preventDefault();
    const input = {
      name: form.name.trim(),
      bio: form.bio.trim() || null,
      photoId: form.photo?.id ?? null,
      ...(author ? { active: form.active } : {}),
      ...(author && form.slugTouched ? { slug: form.slug.trim() || form.name.trim() } : {}),
      ...(author?.type === 'columnist' ? { columnTitle: form.columnTitle.trim() || null } : {}),
    };
    const done = { onSuccess: () => { toast(author ? 'Autor atualizado' : 'Redator criado'); onDone(); } };
    if (author) update.mutate({ id: author.id, input }, done);
    else create.mutate(input, done);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {mutation.error && Object.keys(errors).length === 0 && <Alert>{bannerFor(mutation.error)}</Alert>}
      <TextField label="Nome como aparece na assinatura" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} />
      {author?.type === 'columnist' && (
        <TextField label="Nome da coluna" optional value={form.columnTitle} onChange={(e) => setForm({ ...form, columnTitle: e.target.value })} error={errors.columnTitle} />
      )}
      <TextArea label="Mini-bio" optional rows={3} maxLength={600} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} error={errors.bio} />
      <ImageField label="Foto" purpose="author" round optional value={form.photo} onChange={(photo) => setForm({ ...form, photo })} error={errors.photoId} />
      {author && (
        <>
          <TextField
            label="Endereço da página"
            value={shownSlug}
            onChange={(e) => setForm({ ...form, slug: e.target.value, slugTouched: true })}
            error={errors.slug}
            hint={addressHint('/autor/', author.slug, shownSlug)}
          />
          <Checkbox
            label="Ativo"
            hint="Desativado, some da lista de colunistas e da página de autor. As matérias continuam no ar."
            checked={form.active}
            onChange={(active) => setForm({ ...form, active })}
          />
        </>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secundario" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" busy={mutation.isPending}>
          {author ? 'Salvar' : 'Criar redator'}
        </Button>
      </div>
    </form>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Users
// ════════════════════════════════════════════════════════════════════════════

// "Excluídas" lists the accounts deleted while posts or files still pointed at
// them. They are anonymized, not removed, and stay out of the other tabs.
type UserTab = '' | Role | 'deleted';

const roleTabs: { value: UserTab; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'reader', label: 'Leitores' },
  { value: 'columnist', label: 'Colunistas' },
  { value: 'admin', label: 'Administradores' },
  { value: 'deleted', label: 'Excluídas' },
];

export function UsersPage() {
  useDocumentTitle('Usuários');
  const { data: me } = useMe();
  const [role, setRole] = useState<UserTab>('');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [page, setPage] = useState(1);
  const showDeleted = role === 'deleted';
  const { data, isPending, error } = useUsers({
    role: role && !showDeleted ? role : undefined,
    deleted: showDeleted || undefined,
    search: search || undefined,
    page,
  });
  const actions = useUserActions();
  const toast = useToast();
  const [promoting, setPromoting] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);

  return (
    <>
      <PanelHeader
        title="Usuários"
        description="Todo mundo se cadastra como leitor. Para alguém escrever colunas, encontre a pessoa aqui e ligue a conta a um autor: um que já existe (um redator que assina notícias, por exemplo) ou um novo."
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="Papel" className="flex gap-1 overflow-x-auto rounded-lg bg-papel p-1">
          {roleTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={role === tab.value}
              onClick={() => {
                setRole(tab.value);
                setPage(1);
              }}
              className={cx('h-8 shrink-0 rounded-md px-3 text-sm font-medium', role === tab.value ? 'bg-anil text-white' : 'text-tinta-suave hover:text-tinta')}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(draft.trim());
            setPage(1);
          }}
        >
          <label htmlFor="busca-usuarios" className="sr-only">
            Buscar por nome ou e-mail
          </label>
          <input
            id="busca-usuarios"
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Buscar por nome ou e-mail"
            className="h-9 w-full rounded-md border border-linha bg-papel px-3 text-sm focus:border-anil focus:outline-none sm:w-72"
          />
        </form>
      </div>

      {actions.update.error && (
        <div className="mb-4">
          <Alert>{bannerFor(actions.update.error)}</Alert>
        </div>
      )}

      {isPending ? (
        <Loading />
      ) : error ? (
        <Alert>{errorMessage(error)}</Alert>
      ) : data.items.length === 0 ? (
        <EmptyState title={showDeleted ? 'Nenhuma conta excluída guardada' : 'Ninguém encontrado'} />
      ) : (
        <div className="flex flex-col gap-4">
          {showDeleted && (
            <p className="text-sm text-tinta-suave">
              Estas contas já foram excluídas: os dados pessoais foram apagados e ninguém consegue entrar com elas. Elas só
              ficam guardadas porque ainda têm matérias ou arquivos ligados a elas. Se esse conteúdo já foi removido, use
              Apagar de vez.
            </p>
          )}
          <ul className="divide-y divide-linha rounded-lg border border-linha bg-papel">
            {data.items.map((user) => {
              const isSelf = user.id === me?.id;
              if (showDeleted) {
                return (
                  <li key={user.id} className="flex flex-col gap-3 px-4 py-3.5 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-tinta-suave">{user.name}</p>
                      <p className="truncate text-sm text-tinta-suave">
                        Criada em {formatDateTime(user.createdAt).slice(0, 10)}, excluída em{' '}
                        {formatDateTime(user.updatedAt).slice(0, 10)}
                      </p>
                    </div>
                    <ConfirmButton
                      label="Apagar de vez"
                      confirmLabel="Confirmar"
                      busy={actions.remove.isPending && actions.remove.variables === user.id}
                      onConfirm={() =>
                        actions.remove.mutate(user.id, {
                          onSuccess: () => toast('Conta apagada de vez'),
                          onError: (err) => toast(errorMessage(err), 'erro'),
                        })
                      }
                    />
                  </li>
                );
              }
              return (
                <li key={user.id} className="flex flex-col gap-3 px-4 py-3.5 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <p className={cx('font-semibold', !user.active && 'text-tinta-suave line-through')}>
                      {user.name}
                      {isSelf && <span className="ml-2 text-xs font-normal text-tinta-suave">(você)</span>}
                    </p>
                    <p className="truncate text-sm text-tinta-suave">
                      {user.email}, {roleLabel[user.role]}
                      {user.author ? `, assina como ${user.author.name}` : ''}, desde {formatDateTime(user.createdAt).slice(0, 10)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {user.role !== 'admin' && (
                      <Button small variant={user.author ? 'secundario' : undefined} onClick={() => setPromoting(user)}>
                        {user.author ? 'Trocar autor' : 'Promover a colunista'}
                      </Button>
                    )}
                    {!isSelf && (
                      <>
                        <label htmlFor={`papel-${user.id}`} className="sr-only">
                          Papel de {user.name}
                        </label>
                        <select
                          id={`papel-${user.id}`}
                          value={user.role}
                          onChange={(event) =>
                            actions.update.mutate(
                              { id: user.id, input: { role: event.target.value as Role } },
                              { onSuccess: () => toast('Papel alterado. A pessoa precisa entrar de novo.') },
                            )
                          }
                          className="h-8 rounded-md border border-linha bg-papel px-2 text-sm"
                        >
                          <option value="reader">Leitor</option>
                          <option value="columnist" disabled={!user.author}>
                            Colunista
                          </option>
                          <option value="admin">Administrador</option>
                        </select>
                        <Button variant="secundario" small onClick={() => setResetting(user)}>
                          Redefinir senha
                        </Button>
                        <Button
                          variant={user.active ? 'perigo' : 'secundario'}
                          small
                          onClick={() =>
                            actions.update.mutate(
                              { id: user.id, input: { active: !user.active } },
                              { onSuccess: () => toast(user.active ? 'Conta desativada' : 'Conta reativada') },
                            )
                          }
                        >
                          {user.active ? 'Desativar' : 'Reativar'}
                        </Button>
                        <ConfirmButton
                          label="Excluir"
                          confirmLabel="Excluir de vez"
                          busy={actions.remove.isPending && actions.remove.variables === user.id}
                          onConfirm={() =>
                            actions.remove.mutate(user.id, {
                              onSuccess: () => toast('Conta excluída'),
                              onError: (err) => toast(errorMessage(err), 'erro'),
                            })
                          }
                        />
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </div>
      )}

      <Modal open={promoting !== null} onClose={() => setPromoting(null)} title={promoting?.author ? 'Autor da conta' : 'Promover a colunista'}>
        {promoting && <AuthorLinkDialog key={promoting.id} user={promoting} onDone={() => setPromoting(null)} />}
      </Modal>
      <Modal open={resetting !== null} onClose={() => setResetting(null)} title="Redefinir senha">
        {resetting && <ResetPasswordForm key={resetting.id} user={resetting} onDone={() => setResetting(null)} />}
      </Modal>
    </>
  );
}

// Which byline a login writes under. The admin picks an author that already
// exists (a writer who signs news included) or creates a new one; a login
// that already has one can switch to another or let go of it.
function AuthorLinkDialog({ user, onDone }: { user: User; onDone: () => void }) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing');

  return (
    <div className="flex flex-col gap-4">
      {!user.author && (
        <div role="tablist" aria-label="Como ligar" className="flex gap-1 rounded-lg bg-superficie p-1">
          {(
            [
              ['existing', 'Autor que já existe'],
              ['new', 'Criar autor novo'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={cx('h-8 flex-1 rounded-md px-3 text-sm font-medium', mode === value ? 'bg-anil text-white' : 'text-tinta-suave hover:text-tinta')}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {mode === 'existing' || user.author ? <LinkAuthorForm user={user} onDone={onDone} /> : <PromoteForm user={user} onDone={onDone} />}
    </div>
  );
}

function LinkAuthorForm({ user, onDone }: { user: User; onDone: () => void }) {
  const { linkAuthor } = useUserActions();
  const authors = useAdminAuthors();
  const toast = useToast();
  const [authorId, setAuthorId] = useState(user.author?.id ?? '');

  // Free: not tied to any login, or tied to this one.
  const options = authors.data?.filter((a) => a.active && (!a.userId || a.userId === user.id)) ?? [];

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!authorId) return;
    linkAuthor.mutate(
      { id: user.id, authorId },
      {
        onSuccess: () => {
          const name = options.find((a) => a.id === authorId)?.name ?? '';
          toast(`${user.name} agora escreve como ${name}`);
          onDone();
        },
      },
    );
  }

  function unlink() {
    linkAuthor.mutate(
      { id: user.id, authorId: null },
      {
        onSuccess: () => {
          toast(`${user.name} voltou a ser leitor`);
          onDone();
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-[0.9375rem] text-tinta-suave">
        {user.name} vai entrar na área da redação e escrever colunas com a assinatura escolhida. Se for um redator, ele passa
        a contar como colunista. Cada texto passa pela sua revisão antes de ir ao ar.
      </p>
      {linkAuthor.error && <Alert>{bannerFor(linkAuthor.error)}</Alert>}
      {authors.isPending ? (
        <Loading />
      ) : (
        <SelectField
          label="Assina como"
          value={authorId}
          onChange={(event) => setAuthorId(event.target.value)}
          hint={options.length === 0 ? 'Nenhum autor livre. Crie um autor novo.' : 'Só aparecem autores ativos que não estão ligados a outra conta.'}
        >
          <option value="">Escolha…</option>
          {options.map((author) => (
            <option key={author.id} value={author.id}>
              {author.name}
              {author.type === 'columnist' ? ' (colunista)' : ' (redator)'}
            </option>
          ))}
        </SelectField>
      )}
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {user.author && (
          <Button type="button" variant="perigo" busy={linkAuthor.isPending && linkAuthor.variables?.authorId === null} onClick={unlink}>
            Desligar do autor
          </Button>
        )}
        <Button type="button" variant="secundario" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" busy={linkAuthor.isPending && linkAuthor.variables?.authorId !== null} disabled={!authorId || authorId === user.author?.id}>
          Salvar
        </Button>
      </div>
      {user.author && (
        <p className="text-sm text-tinta-suave">
          Desligar não apaga o autor nem as colunas: a conta só volta a ser de leitor.
        </p>
      )}
    </form>
  );
}

function PromoteForm({ user, onDone }: { user: User; onDone: () => void }) {
  const { promote } = useUserActions();
  const toast = useToast();
  const errors = fieldErrors(promote.error);
  const [form, setForm] = useState({ name: user.name, columnTitle: '', bio: '', photo: null as ImageValue });

  function submit(event: FormEvent) {
    event.preventDefault();
    promote.mutate(
      {
        id: user.id,
        input: {
          name: form.name.trim(),
          columnTitle: form.columnTitle.trim() || null,
          bio: form.bio.trim() || null,
          photoId: form.photo?.id ?? null,
        },
      },
      {
        onSuccess: () => {
          toast(`${user.name} agora é colunista`);
          onDone();
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-[0.9375rem] text-tinta-suave">
        {user.name} vai poder entrar na área da redação e escrever colunas. Cada texto passa pela sua revisão antes de ir ao ar.
      </p>
      {promote.error && Object.keys(errors).length === 0 && <Alert>{bannerFor(promote.error)}</Alert>}
      <TextField label="Nome na assinatura" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} />
      <TextField label="Nome da coluna" optional placeholder="Ex.: Olhar de Fronteira" value={form.columnTitle} onChange={(e) => setForm({ ...form, columnTitle: e.target.value })} error={errors.columnTitle} />
      <TextArea label="Mini-bio" optional rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} error={errors.bio} />
      <ImageField label="Foto" purpose="author" round optional value={form.photo} onChange={(photo) => setForm({ ...form, photo })} error={errors.photoId} />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secundario" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" busy={promote.isPending}>
          Promover
        </Button>
      </div>
    </form>
  );
}

function ResetPasswordForm({ user, onDone }: { user: User; onDone: () => void }) {
  const { resetPassword } = useUserActions();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const errors = fieldErrors(resetPassword.error);

  function submit(event: FormEvent) {
    event.preventDefault();
    resetPassword.mutate(
      { id: user.id, newPassword: password },
      {
        onSuccess: () => {
          toast('Senha redefinida');
          onDone();
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-[0.9375rem] text-tinta-suave">
        {user.name} sai de todos os aparelhos e passa a entrar com a nova senha. Combine com a pessoa como entregar a senha.
      </p>
      {resetPassword.error && Object.keys(errors).length === 0 && <Alert>{bannerFor(resetPassword.error)}</Alert>}
      <TextField
        label="Nova senha"
        type="text"
        autoComplete="off"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.newPassword}
        hint="Pelo menos 8 caracteres."
      />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secundario" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" busy={resetPassword.isPending} disabled={password.length < 8}>
          Redefinir senha
        </Button>
      </div>
    </form>
  );
}
