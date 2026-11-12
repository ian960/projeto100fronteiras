import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useNavigate } from 'react-router';
import { cx } from '../components/ui';
import { useBookmarks } from '../lib/bookmarks';
import { useLogout, useMe } from '../lib/hooks';
import { FronteiraLine } from './parts';
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

function Masthead() {
  const { ids } = useBookmarks();
  const { data: me } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const canUsePanel = me && (me.role === 'admin' || me.role === 'columnist');

  return (
    <header className="bg-papel">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded focus:bg-anil focus:px-3 focus:py-2 focus:text-sobre-anil">
        Ir para o conteúdo
      </a>

      {/* The border line runs the full width at mid-height; the name and the
          controls sit on top of it with the page's background, so the line is
          visibly interrupted by "Sem Fronteiras". */}
      <div className="relative">
        <FronteiraLine className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2" />
        <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:py-6">
          <Link to="/" className="bg-papel pr-3 sm:pr-5" aria-label="Sem Fronteiras, página inicial">
            <span className="titulo block text-[1.85rem] leading-none text-anil sm:text-[2.75rem]" style={{ fontWeight: 720 }}>
              Sem Fronteiras
            </span>
          </Link>

          <nav aria-label="Atalhos" className="flex items-center gap-1 bg-papel pl-2 text-sm font-medium sm:gap-2 sm:pl-4">
            <Link to="/busca" className="inline-flex size-11 items-center justify-center rounded-full hover:bg-superficie sm:size-10" aria-label="Buscar">
              <SearchIcon />
            </Link>
            <Link to="/salvos" className="hidden h-10 items-center rounded-full px-3 hover:bg-superficie sm:inline-flex">
              Salvos{ids.length > 0 && <span className="ml-1.5 text-tinta-suave">{ids.length}</span>}
            </Link>
            {canUsePanel ? (
              <Link to="/painel" className="inline-flex h-10 items-center rounded-full bg-anil px-4 text-sobre-anil hover:bg-anil-escuro">
                Painel
              </Link>
            ) : me ? (
              <button
                type="button"
                className="h-10 rounded-full px-3 hover:bg-superficie"
                onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/') })}
              >
                Sair
              </button>
            ) : (
              <Link to="/entrar" className="inline-flex h-10 items-center rounded-full px-3 hover:bg-superficie">
                Entrar
              </Link>
            )}
          </nav>
        </div>
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
          <span className="text-[1.15rem]">Sem Fronteiras</span>
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
      <FronteiraLine />
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2">
        <div>
          <p className="titulo text-[1.75rem]" style={{ fontWeight: 720 }}>
            Sem Fronteiras
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
          <Link to="/painel" className="hover:underline underline-offset-4">
            Área da redação
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export default function SiteLayout() {
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
    <div className="tema-site flex min-h-dvh flex-col bg-papel text-tinta">
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
