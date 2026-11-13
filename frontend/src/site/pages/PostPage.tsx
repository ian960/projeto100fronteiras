import { useRef } from 'react';
import { Link, useParams } from 'react-router';
import { Alert, Avatar, Loading, cx } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { readingMinutes } from '../../lib/format';
import { Attachments, BookmarkButton, Byline, Cover, Kicker, ReadingProgress, SectionHeading, ShareActions, StoryList, VideoEmbed } from '../parts';
import { useAuthor, usePost, usePublishedPosts } from '../queries';
import NotFoundPage from './NotFoundPage';
import { Comments } from '../Comments';

export default function PostPage() {
  const { slug = '' } = useParams();
  const { data: post, isPending, error } = usePost(slug);
  useDocumentTitle(post?.title);
  const body = useRef<HTMLDivElement>(null);

  if (isPending) return <Loading />;

  if (error) {
    // A draft or a deleted post answers 404, same as a mistyped link.
    if (error instanceof ApiError && error.status === 404) return <NotFoundPage what="matéria" />;
    return <Alert>Não foi possível abrir a matéria. {errorMessage(error)}</Alert>;
  }

  const isOpinion = post.type === 'column';
  const url = window.location.href;

  return (
    <article className="mx-auto max-w-4xl">
      <ReadingProgress target={body} />

      <header className="mx-auto max-w-3xl">
        <Kicker post={post} />
        <h1 className="titulo mt-3 text-[2.1rem] sm:text-[3.1rem]">{post.title}</h1>
        {post.subtitle && <p className="mt-4 font-serif text-xl leading-relaxed text-tinta-suave sm:text-[1.375rem]">{post.subtitle}</p>}
        {!post.subtitle && post.excerpt && (
          <p className="mt-4 font-serif text-xl leading-relaxed text-tinta-suave sm:text-[1.375rem]">{post.excerpt}</p>
        )}

        {/* The buttons go under the byline when both do not fit on one line,
            instead of squeezing the date into three short lines. */}
        <div className="mt-7 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-y border-linha py-4">
          <Byline author={post.author} date={post.publishedAt} readingMinutes={readingMinutes(post.content)} />
          <div className="flex flex-wrap gap-2">
            <BookmarkButton id={post.id} />
            <ShareActions title={post.title} url={url} />
          </div>
        </div>
      </header>

      {post.cover && (
        // Full-bleed on a phone; on a wide screen a little wider than the
        // text, so the photo leads the eye into the article.
        <figure className="-mx-4 mt-8 sm:mx-0">
          <Cover post={post} eager className="sm:rounded-xl" sizes="(min-width: 896px) 896px, 100vw" />
          {post.coverAlt && post.coverAlt !== post.title && (
            <figcaption className="mt-2 px-4 text-sm text-tinta-suave sm:px-0">{post.coverAlt}</figcaption>
          )}
        </figure>
      )}

      {(post.videoYoutubeId || post.video) && (
        <div className="mx-auto mt-8 max-w-3xl">
          <VideoEmbed post={post} />
        </div>
      )}

      {/* Sanitized by the API before it was stored: only p, h2, h3, strong,
          em, u, s, a, lists, blockquote and our own Cloudinary photos (with
          srcset and lazy loading) can reach this point. */}
      <div
        ref={body}
        className={cx('corpo-materia mx-auto mt-10', isOpinion && 'corpo-materia--opiniao')}
        dangerouslySetInnerHTML={{ __html: post.content }}
      />

      {/* Most readers arrive from a WhatsApp link: the end of the text is
          where they decide to pass it on. */}
      <div className="corpo-largura mx-auto mt-10 flex flex-col gap-3 border-t border-linha pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-serif text-lg text-tinta">Conhece alguém que precisa ler isto?</p>
        <div className="flex flex-wrap gap-2">
          <ShareActions title={post.title} url={url} whatsAppLabel="Enviar" />
        </div>
      </div>

      <div className="corpo-largura mx-auto">
        <Attachments items={post.attachments} />
      </div>

      {post.author && <AuthorBox slug={post.author.slug} opinion={isOpinion} />}

      <Comments postId={post.id} opinion={isOpinion} />

      <Related post={post} />
    </article>
  );
}

function AuthorBox({ slug, opinion }: { slug: string; opinion: boolean }) {
  const { data: author } = useAuthor(slug);
  if (!author) return null;

  return (
    <aside className={cx('mx-auto mt-10 flex max-w-[38rem] gap-4 rounded-2xl p-5 sm:p-6', opinion ? 'bg-mata-claro' : 'bg-superficie')}>
      <Avatar src={author.photoUrl} name={author.name} size={64} />
      <div>
        <p className="font-semibold">
          <Link to={`/autor/${author.slug}`} className="hover:underline underline-offset-4">
            {author.name}
          </Link>
        </p>
        {author.columnTitle && <p className="text-sm text-mata">{author.columnTitle}</p>}
        {author.bio && <p className="mt-2 text-[0.9375rem] leading-relaxed text-tinta-suave">{author.bio}</p>}
        <Link to={`/autor/${author.slug}`} className="mt-3 inline-block text-sm font-medium text-anil hover:underline underline-offset-4">
          {opinion ? 'Todas as colunas' : 'Todas as matérias'}
        </Link>
      </div>
    </aside>
  );
}

function Related({ post }: { post: { id: string; type: string; category?: { slug: string; name: string } | null; author?: { slug: string; name: string } } }) {
  const filters =
    post.type === 'column'
      ? { type: 'column' as const, author: post.author?.slug, limit: 4 }
      : { type: 'news' as const, category: post.category?.slug, limit: 4 };

  const { data } = usePublishedPosts(filters);
  const others = data?.items.filter((item) => item.id !== post.id).slice(0, 3) ?? [];
  if (others.length === 0) return null;

  const heading = post.type === 'column' ? `Mais de ${post.author?.name ?? 'quem assina'}` : `Mais em ${post.category?.name ?? 'notícias'}`;

  return (
    <section className="mx-auto mt-16 max-w-[38rem]" aria-label={heading}>
      <SectionHeading tone={post.type === 'column' ? 'mata' : 'anil'}>{heading}</SectionHeading>
      <StoryList posts={others} />
    </section>
  );
}
