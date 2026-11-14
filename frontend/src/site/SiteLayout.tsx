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
// Generated: an asymmetric wave (high on the left, a valley at a third, a
// gentle crest, rising at the end) drawn with a pen-like thickness, thicker
// in the middle and thin at the tips.
const WAVE_PATH =
  'M1.0 6.3 L3.9 6.5 L6.8 6.6 L9.6 6.8 L12.4 7.1 L15.2 7.4 L17.9 7.8 L20.7 8.2 L23.4 8.6 L26.1 9.1 L28.8 9.7 L31.5 10.2 L34.1 10.8 L36.8 11.4 L39.4 12.0 L42.1 12.7 L44.8 13.3 L47.4 14.0 L50.1 14.7 L52.8 15.4 L55.5 16.1 L58.2 16.8 L60.9 17.4 L63.6 18.1 L66.4 18.8 L69.1 19.4 L71.9 20.0 L74.8 20.6 L77.6 21.2 L80.5 21.8 L83.4 22.3 L86.4 22.7 L89.4 23.2 L92.4 23.6 L95.5 23.9 L98.7 24.2 L101.8 24.4 L105.1 24.6 L108.3 24.7 L111.7 24.8 L115.0 24.7 L118.8 24.6 L122.4 24.5 L126.0 24.3 L129.6 24.0 L133.1 23.7 L136.5 23.4 L139.8 23.0 L143.1 22.6 L146.4 22.1 L149.6 21.6 L152.8 21.1 L155.9 20.5 L159.0 20.0 L162.0 19.4 L165.0 18.8 L168.0 18.1 L171.0 17.5 L173.9 16.9 L176.9 16.2 L179.8 15.6 L182.7 15.0 L185.6 14.3 L188.5 13.7 L191.3 13.1 L194.2 12.5 L197.1 12.0 L200.0 11.4 L202.9 10.9 L205.8 10.4 L208.8 9.9 L211.8 9.5 L214.7 9.1 L217.8 8.8 L220.8 8.5 L223.9 8.2 L227.0 8.0 L230.2 7.8 L233.4 7.7 L236.6 7.7 L240.0 7.7 L242.2 7.8 L244.3 7.9 L246.4 7.9 L248.5 8.0 L250.5 8.1 L252.4 8.2 L254.3 8.3 L256.2 8.4 L258.0 8.5 L259.8 8.6 L261.5 8.7 L263.2 8.8 L264.9 8.9 L266.5 9.0 L268.1 9.0 L269.6 9.1 L271.1 9.2 L272.6 9.2 L274.1 9.2 L275.5 9.2 L276.9 9.2 L278.2 9.2 L279.5 9.2 L280.9 9.1 L282.1 9.0 L283.4 8.9 L284.6 8.8 L285.9 8.7 L287.0 8.5 L288.2 8.3 L289.4 8.0 L290.5 7.8 L291.7 7.5 L292.8 7.1 L293.9 6.8 L295.0 6.4 L296.0 5.9 L297.1 5.4 L298.1 4.9 L299.2 4.3 L298.8 3.7 L297.8 4.1 L296.7 4.5 L295.6 4.9 L294.6 5.2 L293.5 5.5 L292.4 5.8 L291.3 6.0 L290.2 6.2 L289.1 6.4 L288.0 6.5 L286.8 6.7 L285.7 6.8 L284.5 6.8 L283.3 6.9 L282.0 6.9 L280.8 6.9 L279.5 6.9 L278.2 6.9 L276.9 6.8 L275.5 6.8 L274.1 6.7 L272.7 6.6 L271.3 6.5 L269.8 6.4 L268.2 6.3 L266.7 6.1 L265.1 6.0 L263.4 5.9 L261.7 5.7 L260.0 5.6 L258.2 5.4 L256.4 5.3 L254.5 5.1 L252.6 5.0 L250.7 4.9 L248.7 4.7 L246.6 4.6 L244.5 4.5 L242.3 4.4 L240.0 4.3 L236.7 4.2 L233.3 4.2 L230.1 4.3 L226.8 4.4 L223.6 4.6 L220.5 4.8 L217.4 5.1 L214.3 5.5 L211.3 5.8 L208.2 6.3 L205.3 6.7 L202.3 7.2 L199.3 7.7 L196.4 8.3 L193.5 8.8 L190.6 9.4 L187.7 10.0 L184.8 10.6 L181.9 11.3 L179.0 11.9 L176.1 12.5 L173.1 13.2 L170.2 13.8 L167.2 14.4 L164.3 15.1 L161.3 15.7 L158.3 16.3 L155.2 16.9 L152.1 17.4 L149.0 17.9 L145.8 18.5 L142.6 18.9 L139.4 19.4 L136.1 19.8 L132.7 20.1 L129.3 20.5 L125.8 20.7 L122.3 21.0 L118.6 21.1 L115.0 21.3 L111.6 21.3 L108.4 21.3 L105.2 21.2 L102.0 21.1 L98.9 20.9 L95.8 20.7 L92.8 20.4 L89.8 20.1 L86.8 19.7 L83.9 19.3 L81.0 18.8 L78.2 18.3 L75.3 17.8 L72.5 17.3 L69.7 16.7 L67.0 16.1 L64.2 15.5 L61.5 14.9 L58.8 14.3 L56.0 13.7 L53.3 13.0 L50.6 12.4 L48.0 11.8 L45.3 11.2 L42.6 10.6 L39.9 10.0 L37.2 9.5 L34.5 8.9 L31.8 8.4 L29.1 7.9 L26.4 7.5 L23.6 7.1 L20.9 6.7 L18.1 6.4 L15.3 6.1 L12.5 5.9 L9.7 5.7 L6.8 5.6 L3.9 5.6 L1.0 5.7 Z';

function TitleWave() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 300 30"
      preserveAspectRatio="none"
      className="pointer-events-none absolute bottom-0 left-0 h-[0.46em] w-full overflow-visible"
    >
      <path d={WAVE_PATH} fill="currentColor" />
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
            className="titulo relative block whitespace-nowrap pb-[0.68em] text-[clamp(1.1rem,5.6vw,2.75rem)] leading-none text-anil"
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
