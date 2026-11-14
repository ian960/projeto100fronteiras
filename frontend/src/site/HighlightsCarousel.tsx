import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { cx } from '../components/ui';
import { formatRelative, postPath } from '../lib/format';
import type { PostListItem } from '../lib/types';
import { Cover } from './parts';

// The home page carousel: the stories the admin featured, topped up by the API
// with the latest news. Slides move with the arrows, the dots, a swipe on a
// phone (native scrolling with snap points) or on their own every few seconds.
// Nothing changes under the mouse. It stops moving by itself only while the
// reader focuses inside it (keyboard), touches it, or asks the system for
// reduced motion.

const AUTOPLAY_MS = 7000;

function Arrow({ direction }: { direction: 'prev' | 'next' }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {direction === 'prev' ? <path d="M12.5 4.5 7 10l5.5 5.5" /> : <path d="M7.5 4.5 13 10l-5.5 5.5" />}
    </svg>
  );
}

function Slide({ post, index, total, eager }: { post: PostListItem; index: number; total: number; eager: boolean }) {
  const label = post.type === 'column' ? 'Opinião' : post.category?.name;

  return (
    <article
      role="group"
      aria-roledescription="slide"
      aria-label={`${index + 1} de ${total}`}
      className="relative w-full shrink-0 snap-start overflow-hidden sm:rounded-xl"
    >
      <Link to={postPath(post)} className="block">
        {post.cover ? (
          <Cover
            post={post}
            eager={eager}
            sizes="(min-width: 1152px) 1120px, 100vw"
            className="aspect-[4/5] sm:aspect-[16/9] lg:aspect-[21/9]"
          />
        ) : (
          <div className={cx('aspect-[4/5] w-full sm:aspect-[16/9] lg:aspect-[21/9]', post.type === 'column' ? 'bg-mata' : 'bg-anil')} />
        )}

        {/* Dark at the bottom so white text reads on any photo. */}
        <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/35 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 p-5 pb-12 text-white sm:p-8 sm:pb-14 lg:p-10 lg:pb-16">
          {label && (
            <span className={cx('inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide', post.type === 'column' ? 'bg-mata' : 'bg-anil')}>
              {label}
            </span>
          )}
          <h2 className="titulo mt-3 max-w-4xl text-[1.75rem] leading-tight sm:text-[2.5rem] lg:text-[3rem]">
            {post.title}
          </h2>
          {post.excerpt && (
            <p className="mt-3 hidden max-w-3xl font-serif text-lg leading-relaxed text-white/85 sm:block">
              <span className="line-clamp-2">{post.excerpt}</span>
            </p>
          )}
          <p className="mt-3 text-sm text-white/75">
            {post.author?.name ? `${post.author.name} · ` : ''}
            {formatRelative(post.publishedAt)}
          </p>
        </div>
      </Link>
    </article>
  );
}

export function HighlightsCarousel({ posts }: { posts: PostListItem[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const total = posts.length;

  const goTo = useCallback(
    (index: number) => {
      const element = track.current;
      if (!element || total === 0) return;
      const target = (index + total) % total; // past the last one wraps around
      element.scrollTo({ left: target * element.clientWidth, behavior: 'smooth' });
    },
    [total],
  );

  // Which slide is showing follows the scroll position, so a swipe updates the
  // dots just like the arrows do.
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setCurrent(Math.round(element.scrollLeft / Math.max(1, element.clientWidth))));
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('scroll', onScroll);
    };
  }, []);

  useEffect(() => {
    if (paused || total < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setTimeout(() => goTo(current + 1), AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [current, paused, total, goTo]);

  if (total === 0) return null;

  return (
    <section
      aria-roledescription="carrossel"
      aria-label="Destaques"
      className="relative -mx-4 sm:mx-0"
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') goTo(current - 1);
        if (event.key === 'ArrowRight') goTo(current + 1);
      }}
    >
      <div
        ref={track}
        aria-live={paused ? 'polite' : 'off'}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] sm:rounded-xl [&::-webkit-scrollbar]:hidden"
      >
        {posts.map((post, index) => (
          <Slide key={post.id} post={post} index={index} total={total} eager={index === 0} />
        ))}
      </div>

      {total > 1 && (
        <>
          <button
            type="button"
            onClick={() => goTo(current - 1)}
            aria-label="Destaque anterior"
            className="absolute left-3 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm sm:inline-flex"
          >
            <Arrow direction="prev" />
          </button>
          <button
            type="button"
            onClick={() => goTo(current + 1)}
            aria-label="Próximo destaque"
            className="absolute right-3 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm sm:inline-flex"
          >
            <Arrow direction="next" />
          </button>

          <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2 sm:bottom-5">
            {posts.map((post, index) => (
              <button
                key={post.id}
                type="button"
                onClick={() => goTo(index)}
                aria-label={`Ir para o destaque ${index + 1}`}
                aria-current={index === current ? 'true' : undefined}
                className="flex h-6 items-center"
              >
                <span className={cx('block h-1.5 rounded-full transition-all', index === current ? 'w-7 bg-white' : 'w-1.5 bg-white/55')} />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
