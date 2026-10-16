import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, getPage, patch, post } from '../lib/api';
import type {
  AuthorWithCount,
  CategoryWithCount,
  PostDetail,
  PostListItem,
  PostStatus,
  PostType,
  PostWithAudit,
  Role,
  User,
} from '../lib/types';

// Everything the panel reads lives under the ['panel'] key, so logging out
// drops all of it at once (see useLogout).

// The admin and the columnist edit posts through different endpoints. The
// columnist's endpoint pins them to their own byline on the server side; the
// front end only picks the base path.
export type Scope = 'admin' | 'columnist';

const postsBase = (scope: Scope) => (scope === 'admin' ? '/admin/posts' : '/columnist/posts');

export type PanelPostFilters = {
  type?: PostType;
  status?: PostStatus;
  q?: string;
  page?: number;
  limit?: number;
};

export function usePanelPosts(scope: Scope, filters: PanelPostFilters) {
  return useQuery({
    queryKey: ['panel', 'posts', scope, filters],
    queryFn: () => getPage<PostListItem>(postsBase(scope), { limit: 20, ...filters }),
    placeholderData: keepPreviousData,
  });
}

// Totals for the dashboard: a page of one item is enough to read meta.total.
export function usePostCount(scope: Scope, filters: PanelPostFilters, enabled = true) {
  return useQuery({
    queryKey: ['panel', 'count', scope, filters],
    queryFn: async () => (await getPage<PostListItem>(postsBase(scope), { ...filters, limit: 1 })).total,
    enabled,
  });
}

export function usePanelPost(scope: Scope, id: string | undefined) {
  return useQuery({
    queryKey: ['panel', 'post', scope, id],
    queryFn: async () => (await get<{ post: PostWithAudit }>(`${postsBase(scope)}/${id}`)).post,
    enabled: Boolean(id),
  });
}

export type PostInput = {
  type?: PostType;
  title: string;
  subtitle: string | null;
  slug?: string;
  excerpt: string;
  content: string;
  coverId: string | null;
  coverAlt: string | null;
  categoryId?: string | null;
  authorId?: string;
  // One video: a YouTube link or an uploaded file. null = no video.
  video: { provider: 'youtube'; url: string } | { provider: 'cloudinary'; mediaId: string } | null;
  // PDFs under the text, in this order. The whole list is sent every time.
  attachments: { mediaId: string; title: string }[];
};

function useInvalidateContent() {
  const client = useQueryClient();
  // The public pages read the same posts: refresh both sides.
  return () => Promise.all([
    client.invalidateQueries({ queryKey: ['panel'] }),
    client.invalidateQueries({ queryKey: ['site'] }),
  ]);
}

export function usePostActions(scope: Scope) {
  const invalidate = useInvalidateContent();
  const base = postsBase(scope);
  const onSuccess = () => invalidate();

  return {
    create: useMutation({
      mutationFn: async (input: PostInput) => (await post<{ post: PostDetail }>(base, input)).post,
      onSuccess,
    }),
    update: useMutation({
      mutationFn: async ({ id, input }: { id: string; input: Partial<PostInput> }) =>
        (await patch<{ post: PostDetail }>(`${base}/${id}`, input)).post,
      onSuccess,
    }),
    remove: useMutation({ mutationFn: (id: string) => del(`${base}/${id}`), onSuccess }),
    publish: useMutation({
      mutationFn: async (id: string) => (await post<{ post: PostDetail }>(`/admin/posts/${id}/publish`)).post,
      onSuccess,
    }),
    unpublish: useMutation({
      mutationFn: async (id: string) => (await post<{ post: PostDetail }>(`/admin/posts/${id}/unpublish`)).post,
      onSuccess,
    }),
    feature: useMutation({
      mutationFn: async (id: string) => (await post<{ post: PostDetail }>(`/admin/posts/${id}/feature`)).post,
      onSuccess,
    }),
    submit: useMutation({
      mutationFn: async (id: string) => (await post<{ post: PostDetail }>(`/columnist/posts/${id}/submit`)).post,
      onSuccess,
    }),
  };
}

// ── Categories ───────────────────────────────────────────────────────────────

// `enabled` lets the shared editor skip admin-only lists for a columnist.
export function useAdminCategories(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['panel', 'categories'],
    queryFn: async () => (await get<{ categories: CategoryWithCount[] }>('/admin/categories')).categories,
  });
}

export type CategoryInput = { name?: string; slug?: string; sortOrder?: number; active?: boolean };

export function useCategoryActions() {
  const invalidate = useInvalidateContent();
  const onSuccess = () => invalidate();
  return {
    create: useMutation({ mutationFn: (input: CategoryInput) => post('/admin/categories', input), onSuccess }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: CategoryInput }) => patch(`/admin/categories/${id}`, input),
      onSuccess,
    }),
    remove: useMutation({ mutationFn: (id: string) => del(`/admin/categories/${id}`), onSuccess }),
  };
}

// ── Authors ──────────────────────────────────────────────────────────────────

export function useAdminAuthors(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['panel', 'authors'],
    queryFn: async () => (await get<{ authors: AuthorWithCount[] }>('/admin/authors')).authors,
  });
}

export type AuthorInput = {
  name?: string;
  slug?: string;
  bio?: string | null;
  photoId?: string | null;
  columnTitle?: string | null;
  active?: boolean;
};

export function useAuthorActions() {
  const invalidate = useInvalidateContent();
  const onSuccess = () => invalidate();
  return {
    create: useMutation({ mutationFn: (input: AuthorInput) => post('/admin/authors', { ...input, type: 'writer' }), onSuccess }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: AuthorInput }) => patch(`/admin/authors/${id}`, input),
      onSuccess,
    }),
    remove: useMutation({ mutationFn: (id: string) => del(`/admin/authors/${id}`), onSuccess }),
  };
}

// ── Users ────────────────────────────────────────────────────────────────────

export type UserFilters = { role?: Role; search?: string; page?: number };

export function useUsers(filters: UserFilters) {
  return useQuery({
    queryKey: ['panel', 'users', filters],
    queryFn: () => getPage<User>('/admin/users', { limit: 20, ...filters }),
    placeholderData: keepPreviousData,
  });
}

export type PromoteInput = { name: string; columnTitle?: string | null; bio?: string | null; photoId?: string | null };

export function useUserActions() {
  // Promoting someone creates a public columnist; deactivating can hide one.
  const invalidate = useInvalidateContent();
  const onSuccess = () => invalidate();
  return {
    promote: useMutation({
      mutationFn: ({ id, input }: { id: string; input: PromoteInput }) => post(`/admin/users/${id}/promote`, input),
      onSuccess,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: { role?: Role; active?: boolean; name?: string } }) =>
        patch(`/admin/users/${id}`, input),
      onSuccess,
    }),
    resetPassword: useMutation({
      mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
        post(`/admin/users/${id}/reset-password`, { newPassword }),
    }),
  };
}

// ── Own account ──────────────────────────────────────────────────────────────

export function useAccountActions() {
  const client = useQueryClient();
  return {
    changePassword: useMutation({
      mutationFn: (input: { currentPassword: string; newPassword: string }) => post('/auth/change-password', input),
    }),
    updateProfile: useMutation({
      mutationFn: (input: AuthorInput) => patch('/columnist/profile', input),
      onSuccess: () => Promise.all([
        client.invalidateQueries({ queryKey: ['me'] }),
        client.invalidateQueries({ queryKey: ['site'] }),
      ]),
    }),
  };
}
