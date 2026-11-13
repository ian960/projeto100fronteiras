import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, del, get, patch, post } from './api';
import type { Health, User } from './types';

const SITE = 'Portal100Fronteiras';

export function useDocumentTitle(title?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} | ${SITE}` : SITE;
  }, [title]);
}

// The logged-in user, or null for a visitor. A 401 is an answer, not an error.
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await get<{ user: User }>('/auth/me')).user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) => post('/auth/login', input),
    onSuccess: () => client.invalidateQueries({ queryKey: ['me'] }),
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => post('/auth/logout'),
    onSuccess: () => {
      // Drop everything the previous user could see.
      client.removeQueries({ predicate: (query) => query.queryKey[0] === 'panel' });
      client.setQueryData(['me'], null);
    },
  });
}

// "Minha conta": the logged-in user edits their own name, bio and photo.
export function useUpdateMe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; bio?: string | null; avatarId?: string | null }) =>
      patch<{ user: User }>('/auth/me', input).then((data) => data.user),
    onSuccess: (user) => client.setQueryData(['me'], user),
  });
}

// Deleting your own account, confirmed with the password. Afterwards the
// browser holds nothing of that person.
export function useDeleteMe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => del('/auth/me', { password }),
    onSuccess: () => {
      client.removeQueries({ predicate: (query) => query.queryKey[0] === 'panel' });
      client.setQueryData(['me'], null);
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) => post('/auth/change-password', input),
  });
}

// Tells the panel whether uploads are switched on (Cloudinary configured).
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => get<Health>('/health'),
    staleTime: 5 * 60_000,
  });
}
