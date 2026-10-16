import { Link, useParams } from 'react-router';
import { Alert, Avatar, Loading, cx } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { Attachments, BookmarkButton, Byline, Cover, Kicker, SectionHeading, ShareActions, StoryList, VideoEmbed } from '../parts';
import { useAuthor, usePost, usePublishedPosts } from '../queries';
import NotFoundPage from './NotFoundPage';

export default function PostPage() {
  const { slug = '' } = useParams();
  const { data: post, isPending, error } = usePost(slug);
  useDocumentTitle(post?.title);

  if (isPending) return <Loading />;

  if (error) {
    // A draft or a deleted post answers 404, same as a mistyped link.
    if (error instanceof ApiError && error.status === 404) return <NotFoundPage what="matéria" />;
    return <Alert>Não foi possível abrir a matéria. {errorMessage(error)}</Alert>;
  }

  const isOpinion = post.type === 'column';
  const url = window.location.href;

  return (
    <article className="mx-auto max-w-3xl">
      <header>
        <Kicker post={post} />
        <h1 className="titulo mt-3 text-[2.1rem] sm:text-[3rem]">{post.title}</h1>
        {post.subtitle && <p className="mt-4 font-serif text-xl leading-relaxed text-tinta-suave sm:text-[1.375rem]">{post.subtitle}</p>}

        <div className="mt-6 flex flex-col gap-4 border-y border-linha py-4 sm:flex-row sm:items-center sm:justify-between">
          <Byline author={post.author} date={post.publishedAt} />
          <div className="flex flex-wrap gap-2">
            <BookmarkButton id={post.id} />
            <ShareActions title={post.title} url={url} />
          </div>
        </div>
      </header>

      {post.cover && (
        // Full-bleed on a phone: the photo is the second thing a reader sees.
        <div className="-mx-4 mt-8 sm:mx-0">
          <Cover post={post} eager className="sm:rounded-lg" sizes="(min-width: 768px) 768px, 100vw" />
        </div>
      )}

      {(post.videoYoutubeId || post.video) && (
        <div className="mt-8">
          <VideoEmbed post={post} />
        </div>
      )}

      {/* Sanitized by the API before it was stored: only p, h2, h3, strong,
          em, u, s, a, lists, blockquote and our own Cloudinary photos (with
          srcset and lazy loading) can reach this point. */}
      <div
        className={cx('corpo-materia mx-auto mt-10', isOpinion && 'corpo-materia--opiniao')}
        dangerouslySetInnerHTML={{ __html: post.content }}
      />

      <div className="corpo-largura mx-auto">
        <Attachments items={post.attachments} />
      </div>

      {post.author && <AuthorBox slug={post.author.slug} opinion={isOpinion} />}

      <Related post={post} />
    </article>
  );
}

function AuthorBox({ slug, opinion }: { slug: string; opinion: boolean }) {
  const { data: author } = useAuthor(slug);
  if (!author) return null;

  return (
    <aside className={cx('mx-auto mt-12 flex max-w-[38rem] gap-4 rounded-lg p-5', opinion ? 'bg-mata-claro' : 'bg-superficie')}>
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
