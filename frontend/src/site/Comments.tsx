import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Avatar, Button, Loading, cx } from '../components/ui';
import { ApiError, del, errorMessage, get, patch, post } from '../lib/api';
import { formatDateTime, formatRelative } from '../lib/format';
import { useMe } from '../lib/hooks';
import type { CommentBadge, CommentList, CommentThread, CommentView, User } from '../lib/types';
import { SectionHeading } from './parts';

// Comments under a news story or a column (backend: modules/comments).
// Plain text only: React prints what people wrote as text, never as HTML.

const MAX = 2000;

function useComments(postId: string) {
  return useQuery({
    queryKey: ['site', 'comments', postId],
    queryFn: () => get<CommentList>('/comments', { postId }),
  });
}

function useCommentActions(postId: string) {
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: ['site', 'comments', postId] });
  return {
    create: useMutation({
      mutationFn: (input: { content: string; parentId?: string }) => post('/comments', { postId, ...input }),
      onSuccess,
    }),
    update: useMutation({
      mutationFn: ({ id, content }: { id: string; content: string }) => patch(`/comments/${id}`, { content }),
      onSuccess,
    }),
    remove: useMutation({
      mutationFn: (id: string) => del(`/comments/${id}`),
      onSuccess,
    }),
  };
}

type Context = {
  me: User | null | undefined;
  postAuthorUserId: string | null;
  opinion: boolean;
  actions: ReturnType<typeof useCommentActions>;
};

export function Comments({ postId, opinion }: { postId: string; opinion: boolean }) {
  const { data, isPending, error } = useComments(postId);
  const { data: me } = useMe();
  const actions = useCommentActions(postId);
  const location = useLocation();

  const heading = data && data.total > 0 ? `Comentários (${data.total})` : 'Comentários';

  return (
    <section id="comentarios" aria-labelledby="comentarios-titulo" className="corpo-largura mx-auto mt-12">
      <div id="comentarios-titulo">
        <SectionHeading tone={opinion ? 'mata' : 'anil'}>{heading}</SectionHeading>
      </div>

      <div className="mt-5">
        {me ? (
          <CommentForm
            label="Escreva um comentário"
            submitLabel="Comentar"
            onSubmit={(content, done) => actions.create.mutate({ content }, { onSuccess: done })}
            busy={actions.create.isPending}
            error={actions.create.error}
          />
        ) : (
          <p className="rounded-lg bg-superficie px-4 py-3 text-[0.9375rem]">
            <Link
              to={`/entrar?proxima=${encodeURIComponent(location.pathname + '#comentarios')}`}
              className="font-medium text-anil hover:underline underline-offset-4"
            >
              Entre na sua conta
            </Link>{' '}
            para comentar. Ainda não tem?{' '}
            <Link to="/cadastro" className="font-medium text-anil hover:underline underline-offset-4">
              Cadastre-se
            </Link>
            .
          </p>
        )}
      </div>

      {isPending ? (
        <Loading label="Carregando comentários…" />
      ) : error ? (
        <div className="mt-6">
          <Alert>Não foi possível carregar os comentários. {errorMessage(error)}</Alert>
        </div>
      ) : data.comments.length === 0 ? (
        <p className="mt-6 text-tinta-suave">Ninguém comentou ainda. Seja a primeira pessoa.</p>
      ) : (
        <ol className="mt-8 flex flex-col gap-7">
          {data.comments.map((thread) => (
            <Thread
              key={thread.id}
              thread={thread}
              ctx={{ me, postAuthorUserId: data.postAuthorUserId, opinion, actions }}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function Thread({ thread, ctx }: { thread: CommentThread; ctx: Context }) {
  const [replying, setReplying] = useState(false);

  return (
    <li>
      <Comment comment={thread} ctx={ctx} onReply={() => setReplying(true)} />
      {(thread.replies.length > 0 || replying) && (
        <ol className="ml-5 mt-4 flex flex-col gap-4 border-l-2 border-linha pl-4 sm:ml-12">
          {thread.replies.map((reply) => (
            <li key={reply.id}>
              <Comment comment={reply} ctx={ctx} onReply={() => setReplying(true)} />
            </li>
          ))}
          {replying && (
            <li>
              <CommentForm
                label={`Responder${thread.author ? ` a ${thread.author.name}` : ''}`}
                submitLabel="Responder"
                autoFocus
                onCancel={() => setReplying(false)}
                onSubmit={(content, done) =>
                  ctx.actions.create.mutate(
                    { content, parentId: thread.id },
                    {
                      onSuccess: () => {
                        done();
                        setReplying(false);
                      },
                    },
                  )
                }
                busy={ctx.actions.create.isPending}
                error={ctx.actions.create.error}
              />
            </li>
          )}
        </ol>
      )}
    </li>
  );
}

function badgeLabel(badge: CommentBadge, opinion: boolean): string {
  if (badge === 'admin') return 'Administrador';
  if (badge === 'author') return opinion ? 'Autor da coluna' : 'Autor da matéria';
  return 'Colunista';
}

function Comment({ comment, ctx, onReply }: { comment: CommentView; ctx: Context; onReply: () => void }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { me, postAuthorUserId, opinion, actions } = ctx;

  if (comment.deleted) {
    return <p className="text-[0.9375rem] italic text-tinta-suave">Comentário excluído.</p>;
  }

  const mine = !!me && comment.author?.id === me.id;
  const canDelete = !!me && (mine || me.role === 'admin' || me.id === postAuthorUserId);
  const name = comment.author?.name ?? 'Conta excluída';

  return (
    <article className="flex gap-3">
      <Avatar src={comment.author?.avatarUrl} name={name} size={40} />
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={cx('font-semibold', !comment.author && 'text-tinta-suave')}>{name}</span>
          {comment.author?.badge && (
            <span
              className={cx(
                'rounded-full px-2 py-0.5 text-xs font-medium',
                comment.author.badge === 'admin' ? 'bg-anil text-sobre-anil' : opinion ? 'bg-mata-claro text-mata' : 'bg-superficie text-anil',
              )}
            >
              {badgeLabel(comment.author.badge, opinion)}
            </span>
          )}
          <time dateTime={comment.createdAt} className="text-sm text-tinta-suave">
            {formatRelative(comment.createdAt)}
          </time>
          {comment.editedAt && (
            <span className="text-sm text-tinta-suave">· editado em {formatDateTime(comment.editedAt)}</span>
          )}
        </header>

        {editing ? (
          <div className="mt-2">
            <CommentForm
              label="Editar comentário"
              submitLabel="Salvar"
              initial={comment.content}
              autoFocus
              onCancel={() => setEditing(false)}
              onSubmit={(content) =>
                actions.update.mutate({ id: comment.id, content }, { onSuccess: () => setEditing(false) })
              }
              busy={actions.update.isPending}
              error={actions.update.error}
            />
          </div>
        ) : (
          <p className="mt-1 whitespace-pre-line break-words leading-relaxed">{comment.content}</p>
        )}

        {!editing && me && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <button type="button" className="font-medium text-tinta-suave hover:text-anil" onClick={onReply}>
              Responder
            </button>
            {mine && (
              <button type="button" className="font-medium text-tinta-suave hover:text-anil" onClick={() => setEditing(true)}>
                Editar
              </button>
            )}
            {canDelete &&
              (confirming ? (
                <span className="flex items-center gap-3">
                  <button
                    type="button"
                    className="font-semibold text-alerta hover:underline"
                    disabled={actions.remove.isPending}
                    onClick={() => actions.remove.mutate(comment.id, { onSettled: () => setConfirming(false) })}
                  >
                    Excluir de vez
                  </button>
                  <button type="button" className="text-tinta-suave hover:text-tinta" onClick={() => setConfirming(false)}>
                    Cancelar
                  </button>
                </span>
              ) : (
                <button type="button" className="font-medium text-tinta-suave hover:text-alerta" onClick={() => setConfirming(true)}>
                  Excluir
                </button>
              ))}
          </div>
        )}
      </div>
    </article>
  );
}

function CommentForm({ label, submitLabel, initial = '', autoFocus, onSubmit, onCancel, busy, error }: {
  label: string;
  submitLabel: string;
  initial?: string;
  autoFocus?: boolean;
  onSubmit: (content: string, done: () => void) => void;
  onCancel?: () => void;
  busy: boolean;
  error: Error | null;
}) {
  const [text, setText] = useState(initial);
  const id = useId();
  const fieldError = error instanceof ApiError ? error.fields.content : undefined;

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit(text.trim(), () => setText(''));
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={label}
        maxLength={MAX}
        rows={3}
        autoFocus={autoFocus}
        className={cx(
          'w-full resize-y rounded-md border bg-papel px-3 py-2 text-[0.9375rem] leading-relaxed outline-none focus:border-anil',
          fieldError ? 'border-alerta' : 'border-linha',
        )}
      />
      {error && <p className="text-sm text-alerta" role="alert">{fieldError ?? errorMessage(error)}</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" small busy={busy} disabled={!text.trim() || text.trim() === initial.trim()}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" small variant="texto" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        {text.length > MAX - 200 && <span className="ml-auto text-xs text-tinta-suave">{MAX - text.length} restantes</span>}
      </div>
    </form>
  );
}
