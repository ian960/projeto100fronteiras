import { Link, NavLink, Outlet, ScrollRestoration, useNavigate } from 'react-router';
import { cx } from '../components/ui';
import { useBookmarks } from '../lib/bookmarks';
import { useLogout, useMe } from '../lib/hooks';
import { FronteiraLine } from './parts';
import { useCategories } from './queries';

function Masthead() {
  const { ids } = useBookmarks();
  const { data: me } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const canUsePanel = me && (me.role === 'admin' || me.role === 'columnist');

  return (
    <header className="bg-papel">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-anil focus:px-3 focus:py-2 focus:text-white">
        Ir para o conteúdo
      </a>

      {/* The border line runs the full width at mid-height; the name and the
          controls sit on top of it with a white background, so the line is
          visibly interrupted by "Sem Fronteiras". */}
      <div className="relative">
        <FronteiraLine className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2" />
        <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:py-5">
          <Link to="/" className="bg-papel pr-3 sm:pr-5" aria-label="Sem Fronteiras, página inicial">
            <span className="titulo block text-[1.85rem] leading-none text-anil sm:text-[2.6rem]" style={{ fontWeight: 720 }}>
              Sem Fronteiras
            </span>
          </Link>

          <nav aria-label="Atalhos" className="flex items-center gap-1 bg-papel pl-2 text-sm font-medium sm:gap-2 sm:pl-4">
            <Link to="/busca" className="rounded-full p-2 hover:bg-superficie" aria-label="Buscar">
              <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="8.5" cy="8.5" r="5.5" />
                <path d="m13 13 4.5 4.5" strokeLinecap="round" />
              </svg>
            </Link>
            <Link to="/salvos" className="hidden rounded-full px-3 py-2 hover:bg-superficie sm:inline-flex">
              Salvos{ids.length > 0 && <span className="ml-1.5 text-tinta-suave">{ids.length}</span>}
            </Link>
            {canUsePanel ? (
              <Link to="/painel" className="rounded-full bg-anil px-3.5 py-2 text-white hover:bg-anil-escuro">
                Painel
              </Link>
            ) : me ? (
              <button
                type="button"
                className="rounded-full px-3 py-2 hover:bg-superficie"
                onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/') })}
              >
                Sair
              </button>
            ) : (
              <Link to="/entrar" className="rounded-full px-3 py-2 hover:bg-superficie">
                Entrar
              </Link>
            )}
          </nav>
        </div>
      </div>

      <CategoryNav />
    </header>
  );
}

function CategoryNav() {
  const { data: categories } = useCategories();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cx(
      'shrink-0 border-b-2 py-3 text-[0.9375rem] transition-colors',
      isActive ? 'border-anil font-semibold text-anil' : 'border-transparent text-tinta hover:text-anil',
    );

  return (
    <nav aria-label="Editorias" className="border-b border-linha">
      {/* Scrolls sideways on a phone instead of wrapping into a tall block. */}
      <div className="mx-auto flex max-w-6xl gap-6 overflow-x-auto px-4 [scrollbar-width:none]">
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
    </nav>
  );
}

function Footer() {
  return (
    <footer className="mt-20 bg-anil text-white">
      <FronteiraLine />
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2">
        <div>
          <p className="titulo text-2xl" style={{ fontWeight: 720 }}>
            Sem Fronteiras
          </p>
          <p className="mt-2 max-w-sm text-sm text-white/75">Notícias e opinião, publicadas pela nossa própria redação.</p>
        </div>
        <nav aria-label="Rodapé" className="flex flex-wrap gap-x-6 gap-y-2 text-sm sm:justify-end">
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
  return (
    <>
      <Masthead />
      <main id="conteudo" className="mx-auto max-w-6xl px-4 pt-6 sm:pt-10">
        <Outlet />
      </main>
      <Footer />
      <ScrollRestoration />
    </>
  );
}
