import { createBrowserRouter, isRouteErrorResponse, useRouteError } from 'react-router';
import { ButtonLink } from './components/ui';
import SiteLayout from './site/SiteLayout';
import HomePage from './site/pages/HomePage';
import PostPage from './site/pages/PostPage';
import NotFoundPage from './site/pages/NotFoundPage';
import { AuthorPage, CategoryPage, ColumnistsPage, NewsPage, SavedPage, SearchPage } from './site/pages/ListingPages';
import { LoginPage, RegisterPage } from './site/pages/AuthPages';

function CrashPage() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : '';
  return (
    <div className="mx-auto max-w-xl px-4 py-20">
      <h1 className="titulo text-3xl text-anil">Algo quebrou nesta página</h1>
      <p className="mt-3 text-tinta-suave">Recarregue a página. Se continuar, avise a equipe técnica com a mensagem abaixo.</p>
      {message && <pre className="mt-4 overflow-x-auto rounded bg-superficie p-3 text-sm">{message}</pre>}
      <div className="mt-6">
        <ButtonLink to="/">Ir para a página inicial</ButtonLink>
      </div>
    </div>
  );
}

// The panel, Quill included, is a separate download. A reader on a phone
// opening a news link never pays for the editor.
const panel = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await load()).default });

export const router = createBrowserRouter([
  {
    path: '/',
    element: <SiteLayout />,
    errorElement: <CrashPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'noticia/:slug', element: <PostPage /> },
      { path: 'coluna/:slug', element: <PostPage /> },
      { path: 'noticias', element: <NewsPage /> },
      { path: 'categoria/:slug', element: <CategoryPage /> },
      { path: 'busca', element: <SearchPage /> },
      { path: 'colunistas', element: <ColumnistsPage /> },
      { path: 'autor/:slug', element: <AuthorPage /> },
      { path: 'salvos', element: <SavedPage /> },
      { path: 'entrar', element: <LoginPage /> },
      { path: 'cadastro', element: <RegisterPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: '/painel',
    errorElement: <CrashPage />,
    lazy: panel(() => import('./panel/PanelLayout')),
    children: [
      { index: true, lazy: panel(() => import('./panel/routes').then((m) => ({ default: m.Dashboard }))) },
      { path: 'materias', lazy: panel(() => import('./panel/routes').then((m) => ({ default: m.AdminPosts }))) },
      { path: 'materias/nova', lazy: panel(() => import('./panel/routes').then((m) => ({ default: m.AdminNewPost }))) },
      { path: 'materias/:id', lazy: panel(() => import('./panel/routes').then((m) => ({ default: m.AdminEditPost }))) },
      { path: 'revisao', lazy: panel(() => import('./panel/routes').then((m) => ({ default: m.Review }))) },
      { path: 'categorias', lazy: panel(() => import('./panel/routes').then((m) => ({ default: m.Categories }))) },
      { path: 'autores', lazy: panel(() => import('./panel/routes').then((m) => ({ default: m.Authors }))) },
      { path: 'usuarios', lazy: panel(() => import('./panel/routes').then((m) => ({ default: m.Users }))) },
      { path: 'colunas', lazy: panel(() => import('./panel/routes').then((m) => ({ default: m.MyColumns }))) },
      { path: 'colunas/nova', lazy: panel(() => import('./panel/routes').then((m) => ({ default: m.ColumnistNewPost }))) },
      { path: 'colunas/:id', lazy: panel(() => import('./panel/routes').then((m) => ({ default: m.ColumnistEditPost }))) },
      { path: 'perfil', lazy: panel(() => import('./panel/routes').then((m) => ({ default: m.Profile }))) },
    ],
  },
]);
