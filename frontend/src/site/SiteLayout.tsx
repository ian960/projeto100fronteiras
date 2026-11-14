import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router';
import { Avatar, cx } from '../components/ui';
import { useBookmarks } from '../lib/bookmarks';
import { useMe } from '../lib/hooks';
import { useTheme } from '../lib/theme';
import { useCategories } from './queries';

// "quarta-feira, 11 de novembro": a news site says what day it is.
const today = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="m13 13 4.5 4.5" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M16.5 12.2A7 7 0 0 1 7.8 3.5a7 7 0 1 0 8.7 8.7Z" strokeLinejoin="round" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6 16 16M4 16l1.4-1.4M14.6 5.4 16 4" />
    </svg>
  );
}

// One switch, two places: beside the search on a wide screen, and in the
// footer, where it fits on a phone (the masthead has no room for a third icon).
function ThemeButton({ className, withLabel = false }: { className: string; withLabel?: boolean }) {
  const { theme, toggle } = useTheme();
  const night = theme === 'noite';

  return (
    // The icon is a toggle (pressed = night on); the footer's words already
    // say what a press does.
    <button
      type="button"
      onClick={toggle}
      aria-pressed={withLabel ? undefined : night}
      title={withLabel ? undefined : 'Modo noturno'}
      className={className}
    >
      {night ? <SunIcon /> : <MoonIcon />}
      {withLabel ? <span>{night ? 'Voltar ao modo claro' : 'Modo noturno'}</span> : <span className="sr-only">Modo noturno</span>}
    </button>
  );
}

// A calligraphic underline under the portal's name: one smooth, asymmetric
// wave that starts high on the left, dips a little and rises gently to the
// right. Drawn as a filled shape, thicker in the middle and tapering at both
// ends like a pen stroke. It is exactly as wide as the name, and its height
// is set in em, so the stroke grows and shrinks with the letters.
function TitleWave() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 300 24"
      preserveAspectRatio="none"
      className="pointer-events-none absolute bottom-0 left-0 h-[0.3em] w-full overflow-visible"
    >
      <path
        d="M2 4 C 50 14, 104 19.5, 160 16.5 S 258 7, 298 2.5 C 299.5 2.6, 299.2 3.6, 297.6 4.2 C 256 10, 212 19.6, 160 20 C 102 21.5, 46 16.5, 1.4 5.2 C 0.6 4.6, 1 3.8, 2 4 Z"
        fill="currentColor"
      />
    </svg>
  );
}

function Masthead() {
  const { ids } = useBookmarks();
  const { data: me } = useMe();
  const canUsePanel = me && (me.role === 'admin' || me.role === 'columnist');

  return (
    <header className="bg-papel">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded focus:bg-anil focus:px-3 focus:py-2 focus:text-sobre-anil">
        Ir para o conteúdo
      </a>

      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:py-6">
        <Link to="/" aria-label="Portal100Fronteiras, página inicial">
          {/* The name grows with the screen up to its full size, so it always
              fits beside the buttons, on a phone and at the width where the
              wide layout's extra buttons appear, without pushing the page
              sideways. */}
          <span
            className="titulo relative block whitespace-nowrap pb-[0.32em] text-[clamp(1.1rem,5.6vw,2.75rem)] leading-none text-anil"
            style={{ fontWeight: 720 }}
          >
            Portal100Fronteiras
            <TitleWave />
          </span>
        </Link>

        <nav aria-label="Atalhos" className="flex items-center gap-1 text-sm font-medium sm:gap-2">
          <Link to="/busca" className="inline-flex size-11 items-center justify-center rounded-full hover:bg-superficie sm:size-10" aria-label="Buscar">
            <SearchIcon />
          </Link>
          <ThemeButton className="hidden size-10 items-center justify-center rounded-full hover:bg-superficie sm:inline-flex" />
          <Link to="/salvos" className="hidden h-10 items-center rounded-full px-3 hover:bg-superficie sm:inline-flex">
            Salvos{ids.length > 0 && <span className="ml-1.5 text-tinta-suave">{ids.length}</span>}
          </Link>
          {canUsePanel ? (
            <Link to="/painel" className="inline-flex h-10 items-center rounded-full bg-anil px-4 text-sobre-anil hover:bg-anil-escuro">
              Painel
            </Link>
          ) : me ? (
            // A reader's own page: photo, name, bio, password, and "Sair".
            <Link to="/minha-conta" className="inline-flex h-10 items-center gap-2 rounded-full pl-1 pr-1 hover:bg-superficie sm:pr-3">
              <Avatar src={me.avatarUrl} name={me.name} size={32} />
              <span className="sr-only sm:not-sr-only">Minha conta</span>
            </Link>
          ) : (
            <Link to="/entrar" className="inline-flex h-10 items-center rounded-full px-3 hover:bg-superficie">
              Entrar
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

// The sections bar stays at the top while reading. Once the masthead has
// scrolled away, the portal's name slides in at its left so the reader always
// knows where they are and can get back home.
function CategoryNav({ compact }: { compact: boolean }) {
  const { data: categories } = useCategories();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cx(
      'flex shrink-0 items-center border-b-2 py-3.5 text-[0.9375rem] transition-colors',
      isActive ? 'border-anil font-semibold text-anil' : 'border-transparent text-tinta hover:text-anil',
    );

  return (
    <nav
      aria-label="Editorias"
      className={cx(
        'sticky top-0 z-40 border-b border-linha bg-papel/90 backdrop-blur-md transition-shadow supports-[not(backdrop-filter:blur(1px))]:bg-papel',
        compact && 'shadow-[0_1px_0_var(--color-linha)]',
      )}
    >
      <div className="mx-auto flex max-w-6xl items-stretch px-4">
        <Link
          to="/"
          aria-hidden={!compact}
          tabIndex={compact ? 0 : -1}
          className={cx(
            'titulo flex shrink-0 items-center overflow-hidden whitespace-nowrap text-anil transition-[max-width,opacity,margin] duration-300',
            compact ? 'mr-5 max-w-48 opacity-100' : 'mr-0 max-w-0 opacity-0',
          )}
          style={{ fontWeight: 720 }}
        >
          <span className="text-[1.15rem]">Portal100Fronteiras</span>
        </Link>

        {/* Scrolls sideways on a phone instead of wrapping into a tall block. */}
        <div className="flex min-w-0 flex-1 gap-6 overflow-x-auto [scrollbar-width:none]">
          <NavLink to="/" end className={linkClass}>
            Início
          </NavLink>
          <NavLink to="/noticias" className={linkClass}>
            Últimas
          </NavLink>
          {categories?.map((category) => (
            <NavLink key={category.id} to={`/categoria/${category.slug}`} className={linkClass}>
              {category.name}
            </NavLink>
          ))}
          <NavLink to="/colunistas" className={({ isActive }) => cx(linkClass({ isActive }), isActive ? 'border-mata text-mata' : 'hover:text-mata')}>
            Opinião
          </NavLink>
        </div>

        <p className="ml-6 hidden shrink-0 items-center text-sm text-tinta-suave first-letter:uppercase lg:flex">{today.format(new Date())}</p>
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="mt-24 bg-rodape text-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2">
        <div>
          <p className="titulo text-[1.75rem]" style={{ fontWeight: 720 }}>
            Portal100Fronteiras
          </p>
          <p className="mt-2 max-w-sm text-[0.9375rem] leading-relaxed text-white/75">Notícias e opinião, publicadas pela nossa própria redação.</p>
        </div>
        <nav aria-label="Rodapé" className="flex flex-wrap content-start gap-x-6 gap-y-3 text-[0.9375rem] sm:justify-end">
          <Link to="/noticias" className="hover:underline underline-offset-4">
            Últimas notícias
          </Link>
          <Link to="/colunistas" className="hover:underline underline-offset-4">
            Colunistas
          </Link>
          <Link to="/salvos" className="hover:underline underline-offset-4">
            Salvos
          </Link>
          <Link to="/minha-conta" className="hover:underline underline-offset-4">
            Minha conta
          </Link>
          <Link to="/ajuda" className="hover:underline underline-offset-4">
            Ajuda
          </Link>
          <Link to="/painel" className="hover:underline underline-offset-4">
            Área da redação
          </Link>
          <ThemeButton withLabel className="inline-flex items-center gap-2 hover:underline underline-offset-4" />
        </nav>
      </div>
    </footer>
  );
}

export default function SiteLayout() {
  const { theme } = useTheme();
  // The masthead going out of view is what turns on the compact name.
  const sentinel = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const element = sentinel.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setCompact(!entry!.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    // .tema-site: the night colors apply to everything inside (index.css).
    <div className="tema-site flex min-h-dvh flex-col bg-papel text-tinta" data-tema={theme}>
      <Masthead />
      <div ref={sentinel} aria-hidden="true" className="h-px" />
      <CategoryNav compact={compact} />
      <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 sm:pt-10">
        <Outlet />
      </main>
      <Footer />
      <ScrollRestoration />
    </div>
  );
}
