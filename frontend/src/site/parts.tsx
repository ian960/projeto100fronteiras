import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Link } from 'react-router';
import { Avatar, cx } from '../components/ui';
import { useBookmarks } from '../lib/bookmarks';
import { formatBytes, formatDate, formatRelative, postPath } from '../lib/format';
import type { AuthorSummary, PostDetail, PostListItem } from '../lib/types';

// ── What kind of text is this ────────────────────────────────────────────────
// News carries its category in blue; a column is opinion, in green. Readers
// should never mistake one for the other.

export function Kicker({ post, linked = true }: { post: Pick<PostListItem, 'type' | 'category' | 'author'>; linked?: boolean }) {
  if (post.type === 'column') {
    const title = post.author?.columnTitle;
    return (
      <span className="text-sm font-semibold text-mata">
        Opinião{title ? <span className="font-normal">, {title}</span> : null}
      </span>
    );
  }

  if (!post.category) return null;

  return linked ? (
    <Link to={`/categoria/${post.category.slug}`} className="text-sm font-semibold text-anil hover:underline underline-offset-4">
      {post.category.name}
    </Link>
  ) : (
    <span className="text-sm font-semibold text-anil">{post.category.name}</span>
  );
}

// "11 de novembro de 2026" and, on articles, ", 4 min de leitura".
function DateLine({ date, readingMinutes }: { date: string | null; readingMinutes?: number }) {
  return (
    <p className="text-tinta-suave">
      {formatDate(date)}
      {readingMinutes ? <span className="whitespace-nowrap">, {readingMinutes} min de leitura</span> : null}
    </p>
  );
}

export function Byline({ author, date, compact, readingMinutes }: {
  author?: AuthorSummary;
  date: string | null;
  compact?: boolean;
  readingMinutes?: number;
}) {
  if (!author) return <div className="text-sm"><DateLine date={date} readingMinutes={readingMinutes} /></div>;

  if (compact) {
    return (
      <p className="text-sm text-tinta-suave">
        {author.name}
        <span className="block">{formatRelative(date)}</span>
      </p>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Avatar src={author.photoUrl} name={author.name} size={44} />
      <div className="text-[0.9375rem] leading-snug">
        <p>
          Por{' '}
          <Link to={`/autor/${author.slug}`} className="font-semibold text-tinta hover:text-anil hover:underline underline-offset-4">
            {author.name}
          </Link>
        </p>
        <DateLine date={date} readingMinutes={readingMinutes} />
      </div>
    </div>
  );
}

// srcset + sizes: the browser downloads the smallest version that fills the
// slot (480px on a phone card, 1600px for the desktop lead). The URLs come
// ready from the API.
export function Cover({ post, sizes, eager, className }: {
  post: Pick<PostListItem, 'cover' | 'coverAlt'>;
  sizes?: string;
  eager?: boolean;
  className?: string;
}) {
  if (!post.cover) return null;
  return (
    <img
      src={post.cover.url}
      srcSet={post.cover.srcset ?? undefined}
      // Reserves the space before the image arrives: no jump while reading.
      width={post.cover.width ?? undefined}
      height={post.cover.height ?? undefined}
      alt={post.coverAlt ?? ''}
      sizes={sizes}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      // The lead image is the largest thing on the first screen: fetch it first.
      fetchPriority={eager ? 'high' : 'auto'}
      className={cx('aspect-[16/9] w-full bg-superficie object-cover', className)}
    />
  );
}

// ── Video ────────────────────────────────────────────────────────────────────
// YouTube posts store only the 11-character id; the player is built here,
// from a fixed origin. An <iframe> is never accepted from the editor.

export function VideoEmbed({ post }: { post: Pick<PostDetail, 'videoYoutubeId' | 'video' | 'title'> }) {
  if (post.videoYoutubeId) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-tinta">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(post.videoYoutubeId)}`}
          title={`Vídeo: ${post.title}`}
          loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="size-full"
        />
      </div>
    );
  }

  if (!post.video) return null;

  // An uploaded file, delivered by Cloudinary as mp4 whatever the phone
  // recorded. preload="none" + poster: nothing is downloaded until play.
  return (
    <video
      controls
      preload="none"
      playsInline
      poster={post.video.posterUrl ?? undefined}
      aria-label={`Vídeo: ${post.title}`}
      className="aspect-video w-full rounded-lg bg-tinta"
    >
      <source src={post.video.url} type="video/mp4" />
      Seu navegador não reproduz este vídeo. <a href={post.video.url}>Baixar o vídeo</a>.
    </video>
  );
}

// ── PDF attachments ──────────────────────────────────────────────────────────
// Under the text, in the order the newsroom chose. Opens in a new tab: a
// reader on a phone gets the system's PDF viewer instead of losing the page.

export function Attachments({ items }: { items: PostDetail['attachments'] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="documentos" className="mt-10 border-t border-linha pt-6">
      <h2 id="documentos" className="titulo text-xl text-tinta">
        Documentos desta matéria
      </h2>
      <ul className="mt-4 flex flex-col divide-y divide-linha">
        {items.map((item) => (
          <li key={item.media.id}>
            <a
              href={item.media.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-4 py-3"
            >
              <img
                src={item.media.thumbnailUrl}
                alt=""
                loading="lazy"
                className="h-16 w-12 shrink-0 rounded-sm border border-linha bg-superficie object-cover object-top"
              />
              <span className="min-w-0">
                <span className="block font-serif text-lg leading-snug text-tinta group-hover:text-anil group-hover:underline underline-offset-4">
                  {item.title}
                </span>
                <span className="block text-sm text-tinta-suave">
                  PDF
                  {item.media.pages ? `, ${item.media.pages} ${item.media.pages === 1 ? 'página' : 'páginas'}` : ''}, {formatBytes(item.media.bytes)}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Reader actions ───────────────────────────────────────────────────────────
// 44px tall on a phone (a thumb), 36px with a mouse.

const pill =
  'inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors sm:h-9 sm:px-3.5';

export function BookmarkButton({ id, withLabel = true }: { id: string; withLabel?: boolean }) {
  const { isSaved, toggle } = useBookmarks();
  const saved = isSaved(id);

  return (
    <button
      type="button"
      onClick={() => toggle(id)}
      aria-pressed={saved}
      className={cx(pill, saved ? 'border-anil bg-anil text-sobre-anil' : 'border-linha text-tinta hover:border-tinta-suave')}
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
        <path d="M4 2.5h8v11l-4-2.8-4 2.8z" strokeLinejoin="round" />
      </svg>
      {withLabel && (saved ? 'Salva' : 'Salvar para ler depois')}
    </button>
  );
}

function WhatsAppIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.4-.3Z" />
    </svg>
  );
}

export function ShareActions({ title, url, whatsAppLabel = 'Enviar no WhatsApp' }: { title: string; url: string; whatsAppLabel?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copie o link:', url);
    }
  }

  return (
    <>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={cx(pill, 'border-linha text-tinta hover:border-tinta-suave')}
      >
        <WhatsAppIcon />
        {whatsAppLabel}
      </a>
      <button type="button" onClick={copy} className={cx(pill, 'border-linha text-tinta hover:border-tinta-suave')}>
        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M6.5 9.5a3 3 0 0 0 4.2 0l2.3-2.3a3 3 0 0 0-4.2-4.2l-.9.9M9.5 6.5a3 3 0 0 0-4.2 0L3 8.8A3 3 0 0 0 7.2 13l.9-.9" strokeLinecap="round" />
        </svg>
        <span aria-live="polite">{copied ? 'Link copiado' : 'Copiar link'}</span>
      </button>
    </>
  );
}

// A thin bar in the border-line yellow along the top edge, filling as the
// reader goes down the article. It moves only when they scroll.
export function ReadingProgress({ target }: { target: RefObject<HTMLElement | null> }) {
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const element = target.current;
      if (!element || !bar.current) return;
      const box = element.getBoundingClientRect();
      const total = box.height - window.innerHeight;
      // A text that fits on one screen has no progress to show.
      const done = total <= 0 ? 0 : Math.min(1, Math.max(0, -box.top / total));
      bar.current.style.transform = `scaleX(${done})`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [target]);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px]">
      <div ref={bar} className="h-full origin-left bg-sol" style={{ transform: 'scaleX(0)' }} />
    </div>
  );
}

// ── Story layouts ────────────────────────────────────────────────────────────
// Importance is shown by size: the lead gets the big photo, the next three a
// medium one, the rest a thumbnail or no image at all. No boxes or shadows.

// The lead story. On a phone the photo runs edge to edge.
export function LeadStory({ post }: { post: PostListItem }) {
  return (
    <article>
      {post.cover && (
        <Link to={postPath(post)} className="-mx-4 block overflow-hidden sm:mx-0 sm:rounded-xl" tabIndex={-1} aria-hidden="true">
          <Cover post={post} eager sizes="(min-width: 1024px) 760px, 100vw" />
        </Link>
      )}
      <div className={post.cover ? 'mt-5' : undefined}>
        <Kicker post={post} />
        <h2 className="titulo mt-2 text-[2rem] sm:text-[2.75rem] lg:text-[3.1rem]">
          <Link to={postPath(post)} className="hover:text-anil">
            {post.title}
          </Link>
        </h2>
        {post.excerpt && <p className="mt-3 max-w-2xl font-serif text-lg leading-relaxed text-tinta-suave sm:text-xl">{post.excerpt}</p>}
        <div className="mt-5">
          <Byline author={post.author} date={post.publishedAt} />
        </div>
      </div>
    </article>
  );
}

// Beside the lead on a wide screen: photo on top. On a phone it is a row with
// the photo on the right, like the rest of the list but with a bigger headline.
export function SecondaryStory({ post, photoOnWide = true }: { post: PostListItem; photoOnWide?: boolean }) {
  return (
    <article className="flex gap-4 lg:flex-col lg:gap-3">
      {post.cover && (
        <Link
          to={postPath(post)}
          tabIndex={-1}
          aria-hidden="true"
          className={cx('order-2 w-28 shrink-0 overflow-hidden rounded-lg lg:order-none lg:w-full', !photoOnWide && 'lg:hidden')}
        >
          <Cover post={post} className="aspect-square lg:aspect-video" sizes="(min-width: 1024px) 320px, 112px" />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <Kicker post={post} />
        <h3 className="titulo mt-1 text-[1.3rem] lg:text-[1.375rem]">
          <Link to={postPath(post)} className="hover:text-anil">
            {post.title}
          </Link>
        </h3>
        <p className="mt-1.5 text-sm text-tinta-suave">{formatRelative(post.publishedAt)}</p>
      </div>
    </article>
  );
}

// A row in a list: headline first, small image on the right. Reads well at
// 360px wide, where most of this portal's traffic comes from.
export function StoryRow({ post, showImage = true, showKicker = true }: { post: PostListItem; showImage?: boolean; showKicker?: boolean }) {
  return (
    <article className="flex gap-4 py-5">
      <div className="min-w-0 flex-1">
        {showKicker && <Kicker post={post} />}
        <h3 className={cx('titulo text-xl sm:text-[1.375rem]', showKicker && 'mt-1')}>
          <Link to={postPath(post)} className="hover:text-anil">
            {post.title}
          </Link>
        </h3>
        {post.excerpt && <p className="mt-1.5 line-clamp-2 text-[0.9375rem] leading-relaxed text-tinta-suave">{post.excerpt}</p>}
        <p className="mt-2 text-sm text-tinta-suave">{formatRelative(post.publishedAt)}</p>
      </div>
      {showImage && post.cover && (
        <Link to={postPath(post)} tabIndex={-1} aria-hidden="true" className="w-28 shrink-0 overflow-hidden rounded-lg sm:w-40">
          <Cover post={post} className="aspect-square sm:aspect-[4/3]" sizes="160px" />
        </Link>
      )}
    </article>
  );
}

export function StoryList({ posts, showImages = true, showKicker = true }: { posts: PostListItem[]; showImages?: boolean; showKicker?: boolean }) {
  return (
    <div className="divide-y divide-linha">
      {posts.map((post) => (
        <StoryRow key={post.id} post={post} showImage={showImages} showKicker={showKicker} />
      ))}
    </div>
  );
}

// The first story of a category page: a medium photo beside the headline.
export function ListLead({ post, showKicker = true }: { post: PostListItem; showKicker?: boolean }) {
  return (
    <article className="grid gap-4 border-b border-linha pb-6 sm:grid-cols-5 sm:gap-6">
      {post.cover && (
        <Link to={postPath(post)} tabIndex={-1} aria-hidden="true" className="-mx-4 block overflow-hidden sm:col-span-3 sm:mx-0 sm:rounded-xl">
          <Cover post={post} eager sizes="(min-width: 640px) 460px, 100vw" />
        </Link>
      )}
      <div className={post.cover ? 'sm:col-span-2' : 'sm:col-span-5'}>
        {showKicker && <Kicker post={post} />}
        <h2 className="titulo mt-1 text-[1.7rem] sm:text-[1.9rem]">
          <Link to={postPath(post)} className="hover:text-anil">
            {post.title}
          </Link>
        </h2>
        {post.excerpt && <p className="mt-2 font-serif text-lg leading-relaxed text-tinta-suave">{post.excerpt}</p>}
        <p className="mt-3 text-sm text-tinta-suave">{formatRelative(post.publishedAt)}</p>
      </div>
    </article>
  );
}

// A category's block on the home page: one story with its photo, the next
// ones as headlines.
export function SectionBlock({ name, slug, posts }: { name: string; slug: string; posts: PostListItem[] }) {
  const [first, ...rest] = posts;
  if (!first) return null;

  return (
    <section aria-label={name}>
      <SectionHeading action={{ to: `/categoria/${slug}`, label: `Mais em ${name}` }}>{name}</SectionHeading>
      <article className="mt-5">
        {first.cover && (
          <Link to={postPath(first)} tabIndex={-1} aria-hidden="true" className="block overflow-hidden rounded-lg">
            <Cover post={first} sizes="(min-width: 1024px) 360px, (min-width: 768px) 50vw, 100vw" />
          </Link>
        )}
        <h3 className={cx('titulo text-[1.3rem]', first.cover && 'mt-3')}>
          <Link to={postPath(first)} className="hover:text-anil">
            {first.title}
          </Link>
        </h3>
        <p className="mt-1.5 text-sm text-tinta-suave">{formatRelative(first.publishedAt)}</p>
      </article>
      {rest.length > 0 && (
        <ul className="mt-4 divide-y divide-linha border-t border-linha">
          {rest.map((post) => (
            <li key={post.id} className="py-3">
              <Link to={postPath(post)} className="titulo block text-[1.0625rem] hover:text-anil">
                {post.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Opinion is introduced by its author, not by an image.
export function OpinionItem({ post }: { post: PostListItem }) {
  const author = post.author;
  return (
    <article className="flex gap-3.5">
      {author && <Avatar src={author.photoUrl} name={author.name} size={56} />}
      <div className="min-w-0">
        {author && (
          <p className="text-sm">
            <Link to={`/autor/${author.slug}`} className="font-semibold text-mata hover:underline underline-offset-4">
              {author.name}
            </Link>
            {author.columnTitle && <span className="block text-tinta-suave">{author.columnTitle}</span>}
          </p>
        )}
        <h3 className="titulo mt-1.5 text-[1.25rem]">
          <Link to={postPath(post)} className="hover:text-mata">
            {post.title}
          </Link>
        </h3>
      </div>
    </article>
  );
}

// The opinion column of the home. On a phone the pieces sit side by side and
// slide with a finger; on a wide screen they stack beside the latest news.
export function OpinionPanel({ posts }: { posts: PostListItem[] }) {
  return (
    <section aria-label="Opinião" className="rounded-2xl bg-mata-claro px-4 py-5 sm:px-6 sm:py-6">
      <SectionHeading tone="mata" action={{ to: '/colunistas', label: 'Colunistas' }}>
        Opinião
      </SectionHeading>
      <div className="-mx-4 mt-5 flex snap-x snap-mandatory scroll-px-4 gap-5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:flex-col lg:gap-0 lg:divide-y lg:divide-mata/15 lg:overflow-visible lg:px-0">
        {posts.map((post) => (
          <div key={post.id} className="w-[82%] shrink-0 snap-start sm:w-[45%] lg:w-auto lg:py-5 lg:first:pt-0 lg:last:pb-0">
            <OpinionItem post={post} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function SectionHeading({ children, tone = 'anil', action, as: Heading = 'h2' }: {
  children: string;
  tone?: 'anil' | 'mata';
  action?: { to: string; label: string };
  as?: 'h2' | 'h3';
}) {
  return (
    <div className={cx('flex items-baseline justify-between gap-4 border-b-2 pb-2', tone === 'mata' ? 'border-mata' : 'border-anil')}>
      <Heading className={cx('titulo text-2xl', tone === 'mata' ? 'text-mata' : 'text-anil')}>{children}</Heading>
      {action && (
        <Link to={action.to} className="shrink-0 text-sm font-medium text-tinta-suave hover:text-tinta hover:underline underline-offset-4">
          {action.label}
        </Link>
      )}
    </div>
  );
}
