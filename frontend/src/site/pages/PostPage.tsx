import { useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { Link, useParams } from 'react-router';
import { Alert, Avatar, Loading, cx } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { readingMinutes } from '../../lib/format';
import { Attachments, BookmarkButton, Byline, Cover, Kicker, ReadingProgress, RelatedCard, SectionHeading, ShareActions, VideoEmbed } from '../parts';
import { useAuthor, usePost, useRelatedPosts } from '../queries';
import NotFoundPage from './NotFoundPage';
import { Comments } from '../Comments';
import { BannerAd, BannerSlot, splitInHalf, useBannersReady, useSlotBanner } from '../banners';
import { NewsletterBox } from '../Newsletter';

export default function PostPage() {
  const { slug = '' } = useParams();
  const { data: post, isPending, error } = usePost(slug);
  useDocumentTitle(post?.title);
  const body = useRef<HTMLDivElement>(null);
  // The banner in the middle of the text must be known before the text is
  // drawn, or the second half would jump down when it arrives.
  const bannersReady = useBannersReady();

  if (isPending || !bannersReady) return <Loading />;

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
      <ArticleBody html={post.content} opinion={isOpinion} bodyRef={body} />

      <SourceCredit name={post.sourceName} url={post.sourceUrl} />

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

      {/* Nothing at all when no banner is running here. */}
      <BannerSlot slot="article_end" className="mx-auto mt-12 max-w-3xl" />

      {post.author && <AuthorBox slug={post.author.slug} opinion={isOpinion} />}

      {/* Before the comments: whoever finished the text gets somewhere to
          go next without scrolling past the whole discussion. */}
      <ReadAlso slug={post.slug} opinion={isOpinion} />

      {/* Whoever read to the end is the reader most likely to want more. */}
      <NewsletterBox className="mx-auto mt-14 max-w-[38rem]" />

      <Comments postId={post.id} opinion={isOpinion} />
    </article>
  );
}

// The text, with the "meio da matéria" banner halfway through when one is
// running. Without one, exactly the same single block as always.
function ArticleBody({ html, opinion, bodyRef }: { html: string; opinion: boolean; bodyRef: RefObject<HTMLDivElement | null> }) {
  const banner = useSlotBanner('article_middle');
  const halves = useMemo(() => (banner ? splitInHalf(html) : null), [banner, html]);
  const textClass = cx('corpo-materia mx-auto', opinion && 'corpo-materia--opiniao');

  if (!banner || !halves) {
    return <div ref={bodyRef} className={cx(textClass, 'mt-10')} dangerouslySetInnerHTML={{ __html: html }} />;
  }

  return (
    <div ref={bodyRef} className="mt-10">
      <div className={textClass} dangerouslySetInnerHTML={{ __html: halves[0] }} />
      <BannerAd banner={banner} className="mx-auto my-10 max-w-3xl" />
      <div className={textClass} dangerouslySetInnerHTML={{ __html: halves[1] }} />
    </div>
  );
}

// "Fonte: G1" under the text of a story taken from another site. With only a
// link, the site's address stands in for the name.
function SourceCredit({ name, url }: { name: string | null; url: string | null }) {
  if (!name && !url) return null;

  let label = name;
  if (!label && url) {
    try {
      label = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      label = url;
    }
  }

  return (
    <p className="corpo-largura mx-auto mt-8 text-[0.9375rem] text-tinta-suave">
      <span className="font-semibold text-tinta">Fonte:</span>{' '}
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-anil underline underline-offset-4 hover:no-underline">
          {label}
        </a>
      ) : (
        label
      )}
    </p>
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

// "Leia também": two columns on a phone, four on a wide screen. The API puts
// the same category (or the same columnist) first and fills with the latest.
function ReadAlso({ slug, opinion }: { slug: string; opinion: boolean }) {
  const { data: posts } = useRelatedPosts(slug);
  if (!posts || posts.length === 0) return null;

  return (
    <section className="mx-auto mt-14 max-w-4xl" aria-label="Leia também">
      <SectionHeading tone={opinion ? 'mata' : 'anil'}>Leia também</SectionHeading>
      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-7 md:grid-cols-4 md:gap-x-5">
        {posts.map((item) => (
          <RelatedCard key={item.id} post={item} />
        ))}
      </div>
    </section>
  );
}
