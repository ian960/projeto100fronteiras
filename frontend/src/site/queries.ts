import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { get, getPage } from '../lib/api';
import type { Author, Category, HomePayload, PostDetail, PostListItem, PostType } from '../lib/types';

// Public data. Nothing here needs a login.

export function useCategories() {
  return useQuery({
    queryKey: ['site', 'categories'],
    queryFn: async () => (await get<{ categories: Category[] }>('/categories')).categories,
    staleTime: 5 * 60_000,
  });
}

export function useCategory(slug: string) {
  return useQuery({
    queryKey: ['site', 'category', slug],
    queryFn: async () => (await get<{ category: Category }>(`/categories/${slug}`)).category,
  });
}

export function useHome() {
  return useQuery({
    queryKey: ['site', 'home'],
    queryFn: () => get<HomePayload>('/home'),
  });
}

export type PostFilters = {
  type?: PostType;
  category?: string;
  author?: string;
  q?: string;
  page?: number;
  limit?: number;
};

export function usePublishedPosts(filters: PostFilters, enabled = true) {
  return useQuery({
    queryKey: ['site', 'posts', filters],
    queryFn: () => getPage<PostListItem>('/posts', { limit: 12, ...filters }),
    placeholderData: keepPreviousData, // keep the old page on screen while the next loads
    enabled,
  });
}

export function usePost(slug: string) {
  return useQuery({
    queryKey: ['site', 'post', slug],
    queryFn: async () => (await get<{ post: PostDetail }>(`/posts/${slug}`)).post,
  });
}

// Works for writers and columnists alike; the route name is historical.
export function useAuthor(slug: string | undefined) {
  return useQuery({
    queryKey: ['site', 'author', slug],
    queryFn: async () => (await get<{ author: Author }>(`/columnists/${slug}`)).author,
    enabled: Boolean(slug),
  });
}

export function useColumnists() {
  return useQuery({
    queryKey: ['site', 'columnists'],
    queryFn: async () => (await get<{ authors: Author[] }>('/columnists')).authors,
    staleTime: 5 * 60_000,
  });
}

export function usePostsByIds(ids: string[]) {
  return useQuery({
    queryKey: ['site', 'by-ids', ids],
    queryFn: async () => (await get<{ posts: PostListItem[] }>('/posts/by-ids', { ids: ids.join(',') })).posts,
    enabled: ids.length > 0,
    // Removing one item changes the key; keep showing the list meanwhile.
    placeholderData: keepPreviousData,
  });
}
