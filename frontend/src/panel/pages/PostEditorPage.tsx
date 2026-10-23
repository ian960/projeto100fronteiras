import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useBlocker, useLocation, useNavigate, useParams } from 'react-router';
import { Alert, Button, Loading, SelectField, TextArea, TextField, cx } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { formatDateTime, isSlugOf, postPath, slugify } from '../../lib/format';
import { useDocumentTitle } from '../../lib/hooks';
import type { PostDetail, PostType, PostWithAudit } from '../../lib/types';
import { RichTextEditor } from '../RichTextEditor';
import type { InsertImage } from '../RichTextEditor';
import { AttachmentsField, BodyImageDialog, ImageField, VideoField, imageValue } from '../mediaFields';
import type { AttachmentValue, ImageValue, VideoValue } from '../mediaFields';
import type { PostInput, Scope } from '../queries';
import { useAdminAuthors, useAdminCategories, usePanelPost, usePostActions } from '../queries';
import { ConfirmButton, StatusPill, TypePill, useToast } from '../widgets';

type Failure = { message: string; fields: Record<string, string> };

type Form = {
  type: PostType;
  title: string;
  subtitle: string;
  slug: string;
  // True once the writer types in the address field. Until then the address
  // is the server's to decide (it follows the headline before publication).
  slugTouched: boolean;
  excerpt: string;
  content: string;
  cover: ImageValue;
  coverAlt: string;
  categoryId: string;
  authorId: string;
  video: VideoValue;
  attachments: AttachmentValue[];
};

const EXCERPT_MAX = 400;

function toVideo(post: PostWithAudit | null): VideoValue {
  // YouTube posts store only the video id; show a link the editor recognises.
  if (post?.videoYoutubeId) return { provider: 'youtube', url: `https://www.youtube.com/watch?v=${post.videoYoutubeId}` };
  if (post?.video) return { provider: 'cloudinary', media: post.video };
  return { provider: 'none' };
}

function toForm(post: PostWithAudit | null, type: PostType): Form {
  return {
    type: post?.type ?? type,
    title: post?.title ?? '',
    subtitle: post?.subtitle ?? '',
    slug: post?.slug ?? '',
    slugTouched: false,
    excerpt: post?.excerpt ?? '',
    content: post?.content ?? '',
    cover: post?.cover ? imageValue(post.cover) : null,
    coverAlt: post?.coverAlt ?? '',
    categoryId: post?.categoryId ?? '',
    authorId: post?.authorId ?? '',
    video: toVideo(post),
    attachments: post?.attachments.map((item) => ({ media: item.media, title: item.title })) ?? [],
  };
}

function toVideoInput(video: VideoValue): PostInput['video'] {
  if (video.provider === 'youtube') return video.url.trim() ? { provider: 'youtube', url: video.url.trim() } : null;
  if (video.provider === 'cloudinary') return video.media ? { provider: 'cloudinary', mediaId: video.media.id } : null;
  return null;
}

// What goes over the wire. Empty optional text becomes null. Files travel as
// ids: the API already has them (see panel/media.ts).
function toInput(form: Form, scope: Scope, isNew: boolean): PostInput {
  const blank = (value: string) => (value.trim() === '' ? null : value.trim());

  const input: PostInput = {
    title: form.title.trim(),
    subtitle: blank(form.subtitle),
    excerpt: form.excerpt.trim(),
    content: form.content,
    coverId: form.cover?.id ?? null,
    coverAlt: blank(form.coverAlt),
    video: toVideoInput(form.video),
    attachments: form.attachments.map((item) => ({ mediaId: item.media.id, title: item.title.trim() || 'Documento' })),
  };

  // Sent only when typed. Emptying the field goes back to an address made
  // from the headline.
  if (form.slugTouched) input.slug = form.slug.trim() || form.title.trim();

  // The columnist's endpoint decides type, byline and category on the server;
  // sending them would be refused.
  if (scope === 'admin') {
    if (isNew) input.type = form.type;
    input.authorId = form.authorId;
    input.categoryId = form.type === 'news' ? blank(form.categoryId) : null;
  }

  return input;
}

export default function PostEditorPage({ scope }: { scope: Scope }) {
  const { id } = useParams();
  const { data: post, isPending, error } = usePanelPost(scope, id);

  if (id && isPending) return <Loading />;
  if (id && error) {
    return (
      <Alert>
        {error instanceof ApiError && error.status === 404 ? 'Esta matéria não existe mais.' : errorMessage(error)}{' '}
        <Link to={scope === 'admin' ? '/painel/materias' : '/painel/colunas'} className="font-medium underline">
          Voltar para a lista
        </Link>
      </Alert>
    );
  }

  // `key` remounts the editor (and Quill) when moving between posts.
  return <Editor key={id ?? 'nova'} scope={scope} post={post ?? null} />;
}

function Editor({ scope, post }: { scope: Scope; post: PostWithAudit | null }) {
  const isNew = post === null;
  const isAdmin = scope === 'admin';
  const navigate = useNavigate();
  const toast = useToast();
  const actions = usePostActions(scope);
  const categories = useAdminCategories(isAdmin);
  const authors = useAdminAuthors(isAdmin);

  const defaultType: PostType = isAdmin ? 'news' : 'column';
  const [form, setForm] = useState<Form>(() => toForm(post, defaultType));
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(toInput(toForm(post, defaultType), scope, isNew)));
  // A new piece is saved first and then published. If publishing fails, the
  // editor moves to the saved piece's URL and remounts; the reason travels in
  // the navigation state so it is still on screen after the move.
  const location = useLocation();
  const carried = (location.state as { failure?: Failure } | null)?.failure;
  const [errors, setErrors] = useState<Record<string, string>>(() => carried?.fields ?? {});
  const [banner, setBanner] = useState<string | null>(() => carried?.message ?? null);
  // Read once, then dropped from history so a reload does not show it again.
  useEffect(() => {
    if (carried) navigate(location.pathname, { replace: true, state: null });
  }, [carried, location.pathname, navigate]);
  const [busy, setBusy] = useState<string | null>(null);

  const listPath = isAdmin ? '/painel/materias' : '/painel/colunas';
  const status = post?.status ?? 'draft';
  // Published means out of the columnist's hands; the server enforces it too.
  const locked = !isAdmin && status === 'published';

  const noun = form.type === 'column' ? 'coluna' : 'notícia';
  useDocumentTitle(isNew ? `Nova ${noun}` : form.title || `Editar ${noun}`);

  const input = useMemo(() => toInput(form, scope, isNew), [form, scope, isNew]);

  // The address follows the headline until the first publication (the server
  // does the same; this shows it before saving). After that it is frozen:
  // the link is already in WhatsApp groups.
  const wasPublished = Boolean(post?.publishedAt);
  const followsTitle = !form.slugTouched && (isNew || (!wasPublished && isSlugOf(post.slug, post.title)));
  // Not typed: whatever the server has now (it may have moved it on save).
  const shownSlug = followsTitle ? slugify(form.title) : form.slugTouched ? form.slug : (post?.slug ?? form.slug);
  const slugPath = `/${form.type === 'column' ? 'coluna' : 'noticia'}/${shownSlug}`;
  const slugHint = !shownSlug
    ? 'Deixe em branco para gerar do título.'
    : followsTitle
      ? `${slugPath}. Acompanha o título até a primeira publicação.`
      : wasPublished
        ? `${slugPath}. Já foi publicada: mudar o endereço quebra os links já compartilhados.`
        : slugPath;
  const dirty = JSON.stringify(input) !== savedSnapshot;

  // Pick a byline for a new piece so the admin is not forced to: the
  // "Redação" byline created by the seed, or the first active writer.
  useEffect(() => {
    if (!isAdmin || form.authorId || !authors.data) return;
    const eligible = authors.data.filter((a) => a.active && (form.type === 'column' ? a.type === 'columnist' : true));
    const preferred = eligible.find((a) => a.slug === 'redacao') ?? eligible[0];
    if (preferred) setForm((current) => ({ ...current, authorId: preferred.id }));
  }, [isAdmin, authors.data, form.authorId, form.type]);

  // ── Leaving with unsaved changes ──────────────────────────────────────────
  const allowLeave = useRef(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (allowLeave.current) return false;
    return dirty && currentLocation.pathname !== nextLocation.pathname;
  });

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    // The API names the cover field coverId; the form keeps the whole image.
    const errorKey = key === 'cover' ? 'coverId' : (key as string);
    if (errors[errorKey]) setErrors(({ [errorKey]: _drop, ...rest }) => rest);
  }

  // The editor's photo button opens BodyImageDialog and waits for its answer.
  const [pendingImage, setPendingImage] = useState<((result: { url: string; alt: string } | null) => void) | null>(null);
  const insertImage: InsertImage = () => new Promise((resolve) => setPendingImage(() => resolve));

  function fail(error: unknown): Failure {
    const failure: Failure =
      error instanceof ApiError ? { message: error.message, fields: error.fields } : { message: errorMessage(error), fields: {} };
    setErrors(failure.fields);
    setBanner(failure.message);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return failure;
  }

  // Saves and returns the stored post. Does not navigate: callers chain
  // publish/submit first, then move to the post's own URL if it was new.
  async function persist(): Promise<PostDetail | null> {
    setErrors({});
    setBanner(null);
    try {
      const saved = isNew
        ? await actions.create.mutateAsync(input)
        : await actions.update.mutateAsync({ id: post.id, input });
      setSavedSnapshot(JSON.stringify(input));
      return saved;
    } catch (error) {
      fail(error);
      return null;
    }
  }

  function goTo(saved: PostDetail, failure?: Failure) {
    if (!isNew) return;
    allowLeave.current = true;
    navigate(`${listPath}/${saved.id}`, { replace: true, state: failure ? { failure } : null });
  }

  async function run(label: string, task: () => Promise<void>) {
    setBusy(label);
    try {
      await task();
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    run('save', async () => {
      const saved = await persist();
      if (!saved) return;
      toast(isNew ? 'Rascunho criado' : 'Alterações salvas');
      goTo(saved);
    });

  const publish = () =>
    run('publish', async () => {
      const saved = isNew || dirty ? await persist() : post;
      if (!saved) return;
      try {
        await actions.publish.mutateAsync(saved.id);
        toast(`${form.type === 'column' ? 'Coluna publicada' : 'Notícia publicada'}`);
        goTo(saved);
      } catch (error) {
        // The piece itself was saved; only the next step failed.
        if (isNew) toast('Rascunho criado');
        goTo(saved, fail(error));
      }
    });

  const submitForReview = () =>
    run('submit', async () => {
      const saved = isNew || dirty ? await persist() : post;
      if (!saved) return;
      try {
        await actions.submit.mutateAsync(saved.id);
        toast('Enviada para revisão');
        goTo(saved);
      } catch (error) {
        // The piece itself was saved; only the next step failed.
        if (isNew) toast('Rascunho criado');
        goTo(saved, fail(error));
      }
    });

  const simple = (label: string, task: () => Promise<unknown>, done: string) =>
    run(label, async () => {
      setBanner(null);
      try {
        await task();
        toast(done);
      } catch (error) {
        fail(error);
      }
    });

  const remove = () =>
    run('remove', async () => {
      if (!post) return;
      try {
        await actions.remove.mutateAsync(post.id);
        allowLeave.current = true;
        toast('Excluída');
        navigate(listPath, { replace: true });
      } catch (error) {
        fail(error);
      }
    });

  // ── Action buttons, shown in the sidebar and in a bar on small screens ────
  // A plain function, not a component: declared inside Editor, a component
  // would be a new type on every render and the buttons would lose focus.
  function actionButtons(compact = false) {
    if (locked) return null;
    const small = compact;
    return (
      <div className={cx('flex flex-wrap gap-2', !compact && 'flex-col')}>
        {isAdmin ? (
          status === 'published' ? (
            <Button small={small} busy={busy === 'save'} disabled={!dirty || Boolean(busy)} onClick={save}>
              Salvar alterações
            </Button>
          ) : (
            <>
              <Button small={small} busy={busy === 'publish'} disabled={Boolean(busy)} onClick={publish}>
                Publicar
              </Button>
              <Button small={small} variant="secundario" busy={busy === 'save'} disabled={(!dirty && !isNew) || Boolean(busy)} onClick={save}>
                Salvar rascunho
              </Button>
            </>
          )
        ) : status === 'draft' ? (
          <>
            <Button small={small} busy={busy === 'submit'} disabled={Boolean(busy)} onClick={submitForReview}>
              Enviar para revisão
            </Button>
            <Button small={small} variant="secundario" busy={busy === 'save'} disabled={(!dirty && !isNew) || Boolean(busy)} onClick={save}>
              Salvar rascunho
            </Button>
          </>
        ) : (
          <Button small={small} busy={busy === 'save'} disabled={!dirty || Boolean(busy)} onClick={save}>
            Salvar alterações
          </Button>
        )}
      </div>
    );
  }

  const activeCategories = categories.data?.filter((c) => c.active || c.id === form.categoryId) ?? [];
  const eligibleAuthors =
    authors.data?.filter((a) => (a.active || a.id === form.authorId) && (form.type === 'column' ? a.type === 'columnist' : true)) ?? [];

  return (
    <div className="pb-24 lg:pb-0">
      {blocker.state === 'blocked' && (
        <div className="mb-5">
          <Alert
            tone="aviso"
            action={
              <span className="flex gap-2">
                <Button small variant="secundario" onClick={() => blocker.reset()}>
                  Continuar editando
                </Button>
                <Button small variant="perigo" onClick={() => blocker.proceed()}>
                  Sair sem salvar
                </Button>
              </span>
            }
          >
            Há alterações que ainda não foram salvas.
          </Alert>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link to={listPath} className="text-sm font-medium text-tinta-suave hover:text-tinta hover:underline underline-offset-4">
          {isAdmin ? 'Matérias' : 'Minhas colunas'}
        </Link>
        <span className="text-tinta-suave" aria-hidden="true">/</span>
        <h1 className="text-xl font-semibold">{isNew ? `Nova ${noun}` : `Editar ${noun}`}</h1>
        {!isNew && <StatusPill status={status} />}
        {post?.featured && <span className="rounded-full bg-sol/20 px-2.5 text-xs font-semibold leading-6 text-aviso">Destaque da home</span>}
        {dirty && !locked && <span className="text-sm text-tinta-suave">Alterações não salvas</span>}
      </div>

      {banner && (
        <div className="mb-5">
          <Alert>
            {banner}
            {Object.keys(errors).length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {Object.entries(errors).map(([field, message]) => (
                  <li key={field}>{message}</li>
                ))}
              </ul>
            )}
          </Alert>
        </div>
      )}

      {locked && (
        <div className="mb-5">
          <Alert tone="info">Esta coluna já foi publicada. A partir de agora, só o administrador pode alterá-la. Se encontrou um erro, avise a redação.</Alert>
        </div>
      )}

      {!isAdmin && status === 'pending' && (
        <div className="mb-5">
          <Alert tone="aviso">Enviada para revisão. Você ainda pode ajustar o texto até o administrador publicar.</Alert>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
        {/* ── The text itself ── */}
        <div className="flex min-w-0 flex-col gap-6">
          <div className="rounded-lg border border-linha bg-papel p-5 sm:p-6">
            <label htmlFor="titulo" className="text-sm font-medium">
              Título
            </label>
            <textarea
              id="titulo"
              rows={2}
              value={form.title}
              disabled={locked}
              onChange={(event) => update('title', event.target.value.replace(/\n/g, ' '))}
              placeholder={form.type === 'column' ? 'Título da coluna' : 'Título da notícia'}
              aria-invalid={errors.title ? true : undefined}
              className={cx(
                'titulo mt-1 w-full resize-none border-0 bg-transparent p-0 text-[1.75rem] text-tinta placeholder:text-tinta-suave/50 focus:ring-0 focus:outline-none sm:text-[2.1rem]',
              )}
            />
            {errors.title && <p className="text-sm text-alerta">{errors.title}</p>}

            <label htmlFor="subtitulo" className="mt-4 block text-sm font-medium">
              Linha fina <span className="font-normal text-tinta-suave">(opcional)</span>
            </label>
            <textarea
              id="subtitulo"
              rows={2}
              value={form.subtitle}
              disabled={locked}
              onChange={(event) => update('subtitle', event.target.value.replace(/\n/g, ' '))}
              placeholder="Uma frase que complementa o título"
              className="mt-1 w-full resize-none border-0 bg-transparent p-0 font-serif text-lg text-tinta-suave placeholder:text-tinta-suave/50 focus:outline-none"
            />
            {errors.subtitle && <p className="text-sm text-alerta">{errors.subtitle}</p>}
          </div>

          <TextArea
            label="Resumo"
            rows={3}
            maxLength={EXCERPT_MAX}
            value={form.excerpt}
            disabled={locked}
            onChange={(event) => update('excerpt', event.target.value)}
            error={errors.excerpt}
            hint={`Aparece nas listas e quando o link é compartilhado. ${form.excerpt.length}/${EXCERPT_MAX}`}
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium" id="texto-label">
              Texto
            </span>
            <RichTextEditor
              label="Texto da matéria"
              initialHtml={form.content}
              onChange={(html) => update('content', html)}
              onInsertImage={insertImage}
              readOnly={locked}
              invalid={Boolean(errors.content)}
            />
            {errors.content && <p className="text-sm text-alerta">{errors.content}</p>}
            <BodyImageDialog
              open={pendingImage !== null}
              onDone={(result) => {
                pendingImage?.(result);
                setPendingImage(null);
              }}
            />
          </div>

          <AttachmentsField
            value={form.attachments}
            onChange={(attachments) => update('attachments', attachments)}
            error={errors.attachments}
            disabled={locked}
          />
        </div>

        {/* ── Settings ── */}
        <aside className="flex flex-col gap-6">
          {/* The strip of page colour above the box hides the boxes that
              scroll underneath it. */}
          <div className="hidden bg-superficie lg:sticky lg:top-0 lg:z-10 lg:-mt-4 lg:block lg:pt-4">
            <Box>
              {actionButtons()}
              {!isNew && post && (
                <dl className="mt-4 space-y-1 border-t border-linha pt-3 text-sm text-tinta-suave">
                  <div>
                    <dt className="inline">Criada por </dt>
                    <dd className="inline">{post.createdBy?.name ?? '—'}</dd>
                  </div>
                  {post.publishedAt && (
                    <div>
                      <dt className="inline">Publicada em </dt>
                      <dd className="inline">{formatDateTime(post.publishedAt)}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="inline">Última alteração </dt>
                    <dd className="inline">{formatDateTime(post.updatedAt)}</dd>
                  </div>
                </dl>
              )}
            </Box>
          </div>

          {isAdmin && (
            <Box title="Publicação">
              <div className="flex flex-col gap-4">
                {isNew ? (
                  <SelectField label="Tipo" value={form.type} onChange={(event) => update('type', event.target.value as PostType)}>
                    <option value="news">Notícia</option>
                    <option value="column">Coluna de opinião</option>
                  </SelectField>
                ) : (
                  <div className="text-sm">
                    Tipo: <TypePill type={form.type} />
                  </div>
                )}

                {form.type === 'news' && (
                  <SelectField
                    label="Categoria"
                    value={form.categoryId}
                    onChange={(event) => update('categoryId', event.target.value)}
                    error={errors.categoryId}
                    hint={activeCategories.length === 0 ? <Link to="/painel/categorias" className="text-anil underline">Crie uma categoria primeiro</Link> : undefined}
                  >
                    <option value="">Escolha…</option>
                    {activeCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                        {!category.active ? ' (inativa)' : ''}
                      </option>
                    ))}
                  </SelectField>
                )}

                <SelectField
                  label="Quem assina"
                  value={form.authorId}
                  onChange={(event) => update('authorId', event.target.value)}
                  error={errors.authorId}
                  hint={form.type === 'column' && eligibleAuthors.length === 0 ? 'Nenhum colunista cadastrado ainda.' : undefined}
                >
                  <option value="">Escolha…</option>
                  {eligibleAuthors.map((author) => (
                    <option key={author.id} value={author.id}>
                      {author.name}
                      {author.type === 'columnist' ? ' (colunista)' : ''}
                    </option>
                  ))}
                </SelectField>

                {!isNew && post?.status === 'published' && (
                  <div className="flex flex-col gap-2 border-t border-linha pt-4">
                    {!post.featured && (
                      <Button variant="secundario" small busy={busy === 'feature'} disabled={Boolean(busy)} onClick={() => simple('feature', () => actions.feature.mutateAsync(post.id), 'Agora é o destaque da home')}>
                        Destacar na home
                      </Button>
                    )}
                    <Button variant="secundario" small busy={busy === 'unpublish'} disabled={Boolean(busy)} onClick={() => simple('unpublish', () => actions.unpublish.mutateAsync(post.id), 'Tirada do ar. Voltou para rascunho.')}>
                      Tirar do ar
                    </Button>
                    <a href={postPath(post)} target="_blank" rel="noreferrer" className="text-center text-sm font-medium text-anil hover:underline underline-offset-4">
                      Ver no site
                    </a>
                  </div>
                )}
              </div>
            </Box>
          )}

          <Box title="Capa">
            <div className="flex flex-col gap-4">
              <ImageField
                label="Imagem de capa"
                purpose="cover"
                value={form.cover}
                onChange={(cover) => update('cover', cover)}
                error={errors.coverId}
                optional={form.type !== 'news'}
                disabled={locked}
                hint={`${form.type === 'news' ? 'Obrigatória para publicar uma notícia. ' : ''}JPEG, PNG, WebP ou HEIC, até 10 MB, com pelo menos 800 px de largura.`}
              />
              <TextField
                label="Descrição da imagem"
                optional
                value={form.coverAlt}
                disabled={locked}
                onChange={(event) => update('coverAlt', event.target.value)}
                hint="Para quem usa leitor de tela. Ex.: “Ciclistas na avenida principal”."
                error={errors.coverAlt}
              />
            </div>
          </Box>

          <Box>
            <VideoField value={form.video} onChange={(video) => update('video', video)} error={errors.video} disabled={locked} />
          </Box>

          <Box title="Endereço">
            <TextField
              label="Endereço da página"
              optional
              value={shownSlug}
              disabled={locked}
              onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value, slugTouched: true }))}
              placeholder="gerado a partir do título"
              hint={slugHint}
              error={errors.slug}
            />
          </Box>

          {!isNew && post && (isAdmin || status === 'draft') && (
            <Box title="Excluir">
              <p className="mb-3 text-sm text-tinta-suave">Some do site e do painel. Não tem como desfazer.</p>
              <ConfirmButton label={`Excluir ${noun}`} confirmLabel="Confirmar exclusão" busy={busy === 'remove'} onConfirm={remove} />
            </Box>
          )}
        </aside>
      </div>

      {/* Small screens: the actions stay within reach while scrolling the text. */}
      {!locked && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-linha bg-papel px-4 py-3 lg:hidden">
          {actionButtons(true)}
        </div>
      )}
    </div>
  );
}

function Box({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-lg border border-linha bg-papel p-4', className)}>
      {title && <h2 className="mb-3 text-sm font-semibold">{title}</h2>}
      {children}
    </section>
  );
}
