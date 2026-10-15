import { useState } from 'react';
import { Link } from 'react-router';
import { Avatar, cx } from '../components/ui';
import { useBookmarks } from '../lib/bookmarks';
import { formatDate, formatRelative, postPath } from '../lib/format';
import type { AuthorSummary, PostDetail, PostListItem } from '../lib/types';

// ── The border line ──────────────────────────────────────────────────────────
// A map's dash-dot border, drawn once across the masthead and interrupted by
// the portal's name. It is the one decorative gesture on the site.

export function FronteiraLine({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={cx('h-[3px] w-full', className)} preserveAspectRatio="none">
      <line
        x1="0"
        y1="1.5"
        x2="100%"
        y2="1.5"
        stroke="var(--color-sol)"
        strokeWidth="3"
        strokeDasharray="16 7 3 7"
        strokeLinecap="round"
      />
    </svg>
  );
}

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

export function Byline({ author, date, compact }: { author?: AuthorSummary; date: string | null; compact?: boolean }) {
  if (!author) return <p className="text-sm text-tinta-suave">{formatDate(date)}</p>;

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
        <p className="text-tinta-suave">{formatDate(date)}</p>
      </div>
    </div>
  );
}

export function Cover({ post, sizes, eager, className }: {
  post: Pick<PostListItem, 'coverUrl' | 'coverAlt'>;
  sizes?: string;
  eager?: boolean;
  className?: string;
}) {
  if (!post.coverUrl) return null;
  return (
    <img
      src={post.coverUrl}
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

export function VideoEmbed({ post }: { post: Pick<PostDetail, 'videoUrl' | 'videoProvider' | 'title'> }) {
  if (!post.videoUrl || !post.videoProvider) return null;

  if (post.videoProvider === 'youtube') {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-tinta">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(post.videoUrl)}`}
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

  return (
    <video controls preload="metadata" playsInline className="aspect-video w-full rounded-lg bg-tinta">
      <source src={post.videoUrl} type="video/mp4" />
      Seu navegador não reproduz este vídeo. <a href={post.videoUrl}>Baixar o vídeo</a>.
    </video>
  );
}

// ── Reader actions ───────────────────────────────────────────────────────────

export function BookmarkButton({ id, withLabel = true }: { id: string; withLabel?: boolean }) {
  const { isSaved, toggle } = useBookmarks();
  const saved = isSaved(id);

  return (
    <button
      type="button"
      onClick={() => toggle(id)}
      aria-pressed={saved}
      className={cx(
        'inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors',
        saved ? 'border-anil bg-anil text-white' : 'border-linha text-tinta hover:border-tinta-suave',
      )}
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
        <path d="M4 2.5h8v11l-4-2.8-4 2.8z" strokeLinejoin="round" />
      </svg>
      {withLabel && (saved ? 'Salva' : 'Salvar para ler depois')}
    </button>
  );
}

export function ShareActions({ title, url }: { title: string; url: string }) {
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
        className="inline-flex h-9 items-center gap-2 rounded-full border border-linha px-3.5 text-sm font-medium hover:border-tinta-suave"
      >
        Enviar no WhatsApp
      </a>
      <button
        type="button"
        onClick={copy}
        className="inline-flex h-9 items-center rounded-full border border-linha px-3.5 text-sm font-medium hover:border-tinta-suave"
      >
        <span aria-live="polite">{copied ? 'Link copiado' : 'Copiar link'}</span>
      </button>
    </>
  );
}

// ── Story layouts ────────────────────────────────────────────────────────────

// The lead story: image and headline side by side on wide screens, stacked on
// a phone, where the headline comes first so it is readable without scrolling.
export function LeadStory({ post }: { post: PostListItem }) {
  return (
    <article className="grid gap-5 md:grid-cols-12 md:items-center md:gap-8">
      <Link to={postPath(post)} className="block overflow-hidden rounded-lg md:order-2 md:col-span-7" tabIndex={-1} aria-hidden="true">
        <Cover post={post} eager sizes="(min-width: 768px) 58vw, 100vw" />
      </Link>
      <div className="md:order-1 md:col-span-5">
        <Kicker post={post} />
        <h2 className="titulo mt-2 text-[2rem] sm:text-[2.6rem] lg:text-[3rem]">
          <Link to={postPath(post)} className="hover:text-anil">
            {post.title}
          </Link>
        </h2>
        {post.excerpt && <p className="mt-3 font-serif text-lg leading-relaxed text-tinta-suave">{post.excerpt}</p>}
        <div className="mt-5">
          <Byline author={post.author} date={post.publishedAt} />
        </div>
      </div>
    </article>
  );
}

// A row in a list: headline first, small image on the right. Reads well at
// 360px wide, where most of this portal's traffic comes from.
export function StoryRow({ post, showImage = true }: { post: PostListItem; showImage?: boolean }) {
  return (
    <article className="flex gap-4 py-5">
      <div className="min-w-0 flex-1">
        <Kicker post={post} />
        <h3 className="titulo mt-1 text-xl sm:text-[1.375rem]">
          <Link to={postPath(post)} className="hover:text-anil">
            {post.title}
          </Link>
        </h3>
        {post.excerpt && <p className="mt-1.5 line-clamp-2 text-[0.9375rem] text-tinta-suave">{post.excerpt}</p>}
        <p className="mt-2 text-sm text-tinta-suave">{formatRelative(post.publishedAt)}</p>
      </div>
      {showImage && post.coverUrl && (
        <Link to={postPath(post)} tabIndex={-1} aria-hidden="true" className="w-24 shrink-0 sm:w-36">
          <Cover post={post} className="aspect-square rounded-md sm:aspect-[4/3]" sizes="144px" />
        </Link>
      )}
    </article>
  );
}

export function StoryList({ posts, showImages = true }: { posts: PostListItem[]; showImages?: boolean }) {
  return (
    <div className="divide-y divide-linha">
      {posts.map((post) => (
        <StoryRow key={post.id} post={post} showImage={showImages} />
      ))}
    </div>
  );
}

// Opinion is introduced by its author, not by an image.
export function OpinionItem({ post }: { post: PostListItem }) {
  const author = post.author;
  return (
    <article className="flex gap-3.5 py-5">
      {author && <Avatar src={author.photoUrl} name={author.name} size={52} />}
      <div className="min-w-0">
        {author && (
          <p className="text-sm">
            <Link to={`/autor/${author.slug}`} className="font-semibold text-mata hover:underline underline-offset-4">
              {author.name}
            </Link>
            {author.columnTitle && <span className="text-tinta-suave">, {author.columnTitle}</span>}
          </p>
        )}
        <h3 className="titulo mt-1 text-[1.3rem]">
          <Link to={postPath(post)} className="hover:text-mata">
            {post.title}
          </Link>
        </h3>
      </div>
    </article>
  );
}

export function SectionHeading({ children, tone = 'anil', action }: {
  children: string;
  tone?: 'anil' | 'mata';
  action?: { to: string; label: string };
}) {
  return (
    <div className={cx('flex items-baseline justify-between gap-4 border-b-2 pb-2', tone === 'mata' ? 'border-mata' : 'border-anil')}>
      <h2 className={cx('titulo text-2xl', tone === 'mata' ? 'text-mata' : 'text-anil')}>{children}</h2>
      {action && (
        <Link to={action.to} className="text-sm font-medium text-tinta-suave hover:text-tinta hover:underline underline-offset-4">
          {action.label}
        </Link>
      )}
    </div>
  );
}
