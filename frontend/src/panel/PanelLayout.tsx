import type { ReactNode } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { ButtonLink, Loading, cx } from '../components/ui';
import { useLogout, useMe } from '../lib/hooks';
import type { Role, User } from '../lib/types';
import { usePostCount } from './queries';
import { ToastProvider } from './widgets';

type NavItem = { to: string; label: string; end?: boolean; badge?: number };

function Sidebar({ me }: { me: User }) {
  const isAdmin = me.role === 'admin';
  // Only the admin has a review queue; a columnist calling this would get 403.
  const pending = usePostCount('admin', { status: 'pending' }, isAdmin);

  const items: NavItem[] = isAdmin
    ? [
        { to: '/painel', label: 'Início', end: true },
        { to: '/painel/materias', label: 'Matérias' },
        { to: '/painel/revisao', label: 'Revisão', badge: pending.data },
        { to: '/painel/categorias', label: 'Categorias' },
        { to: '/painel/autores', label: 'Autores' },
        { to: '/painel/usuarios', label: 'Usuários' },
        { to: '/painel/perfil', label: 'Minha conta' },
      ]
    : [
        { to: '/painel', label: 'Início', end: true },
        { to: '/painel/colunas', label: 'Minhas colunas' },
        { to: '/painel/perfil', label: 'Meu perfil' },
      ];

  return (
    <nav aria-label="Painel" className="flex gap-1 overflow-x-auto px-4 pb-3 [scrollbar-width:none] lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cx(
              'flex shrink-0 items-center justify-between gap-3 rounded-md px-3 py-2 text-[0.9375rem] font-medium transition-colors',
              isActive ? 'bg-anil text-white' : 'text-tinta hover:bg-papel',
            )
          }
        >
          {item.label}
          {item.badge ? (
            <span className="rounded-full bg-sol px-2 text-xs font-semibold leading-5 text-tinta">{item.badge}</span>
          ) : null}
        </NavLink>
      ))}
    </nav>
  );
}

function Shell({ me, children }: { me: User; children: ReactNode }) {
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh bg-superficie">
      <header className="border-b border-linha bg-papel">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-baseline gap-3">
            <Link to="/painel" className="titulo text-xl text-anil" style={{ fontWeight: 720 }}>
              Sem Fronteiras
            </Link>
            <span className="hidden text-sm text-tinta-suave sm:inline">Área da redação</span>
          </div>
          <div className="flex items-center gap-1 text-sm">
            <span className="hidden px-2 text-tinta-suave md:inline">{me.name}</span>
            <Link to="/" className="rounded-md px-3 py-2 font-medium hover:bg-superficie">
              Ver o site
            </Link>
            <button
              type="button"
              className="rounded-md px-3 py-2 font-medium hover:bg-superficie"
              onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/entrar') })}
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl lg:grid lg:grid-cols-[13rem_1fr] lg:gap-8 lg:px-4 lg:py-8">
        <aside className="pt-3 lg:pt-0">
          <Sidebar me={me} />
        </aside>
        <main id="conteudo" className="min-w-0 px-4 pb-16 pt-4 lg:px-0 lg:pt-0">
          {children}
        </main>
      </div>
    </div>
  );
}

function ReaderNotice({ me }: { me: User }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-20">
      <h1 className="titulo text-3xl text-anil">Sua conta é de leitor</h1>
      <p className="mt-4 text-lg leading-relaxed text-tinta-suave">
        Olá, {me.name}. A área da redação é para quem publica no portal. Se você vai escrever colunas, peça ao administrador para liberar o seu acesso.
      </p>
      <div className="mt-8">
        <ButtonLink to="/">Voltar para o site</ButtonLink>
      </div>
    </div>
  );
}

export default function PanelLayout() {
  const { data: me, isPending } = useMe();
  const location = useLocation();

  if (isPending) return <Loading />;

  if (!me) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/entrar?proxima=${next}`} replace />;
  }

  if (me.role === 'reader') return <ReaderNotice me={me} />;

  return (
    <ToastProvider>
      <Shell me={me}>
        <Outlet />
      </Shell>
    </ToastProvider>
  );
}

// Wraps admin-only pages. The API refuses anyway; this just explains why
// instead of showing a broken screen.
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { data: me } = useMe();
  if (me?.role !== role) {
    const forAdmin = role === 'admin';
    return (
      <div className="rounded-lg border border-linha bg-papel p-8">
        <h1 className="text-xl font-semibold">{forAdmin ? 'Esta área é do administrador' : 'Esta área é dos colunistas'}</h1>
        <p className="mt-2 text-tinta-suave">
          {forAdmin ? 'Sua conta escreve colunas. Elas ficam em Minhas colunas.' : 'As colunas de todos os autores ficam em Matérias.'}
        </p>
        <div className="mt-5">
          <ButtonLink to={forAdmin ? '/painel/colunas' : '/painel/materias'} variant="secundario">
            {forAdmin ? 'Ir para Minhas colunas' : 'Ir para Matérias'}
          </ButtonLink>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
