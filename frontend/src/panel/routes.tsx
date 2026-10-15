import { RequireRole } from './PanelLayout';
import { AuthorsPage, CategoriesPage, UsersPage } from './pages/AdminPages';
import PostEditorPage from './pages/PostEditorPage';
import { AdminPostsPage, DashboardPage, MyColumnsPage, ReviewQueuePage } from './pages/PostListPages';
import ProfilePage from './pages/ProfilePage';

// One entry per panel route, with the role it needs. Kept in one module so
// the whole panel downloads as a single chunk the first time it is opened.

export const Dashboard = DashboardPage;
export const Profile = ProfilePage;

export const AdminPosts = () => (
  <RequireRole role="admin">
    <AdminPostsPage />
  </RequireRole>
);
export const AdminNewPost = () => (
  <RequireRole role="admin">
    <PostEditorPage scope="admin" />
  </RequireRole>
);
export const AdminEditPost = AdminNewPost;
export const Review = () => (
  <RequireRole role="admin">
    <ReviewQueuePage />
  </RequireRole>
);
export const Categories = () => (
  <RequireRole role="admin">
    <CategoriesPage />
  </RequireRole>
);
export const Authors = () => (
  <RequireRole role="admin">
    <AuthorsPage />
  </RequireRole>
);
export const Users = () => (
  <RequireRole role="admin">
    <UsersPage />
  </RequireRole>
);

export const MyColumns = () => (
  <RequireRole role="columnist">
    <MyColumnsPage />
  </RequireRole>
);
export const ColumnistNewPost = () => (
  <RequireRole role="columnist">
    <PostEditorPage scope="columnist" />
  </RequireRole>
);
export const ColumnistEditPost = ColumnistNewPost;
