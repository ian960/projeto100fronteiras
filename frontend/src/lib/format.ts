const longDate = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const shortDateTime = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

// "13 de outubro de 2026"
export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  return longDate.format(new Date(value));
}

// "13/10/2026 22:40" — for the panel, where precision beats prose.
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return shortDateTime.format(new Date(value));
}

// "Hoje, 14:32" / "Ontem, 09:10" / "13 de outubro de 2026"
export function formatRelative(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const day = 24 * 60 * 60 * 1000;

  if (date.getTime() >= startOfToday) return `Hoje, ${time.format(date)}`;
  if (date.getTime() >= startOfToday - day) return `Ontem, ${time.format(date)}`;
  return longDate.format(date);
}

export function postPath(post: { type: string; slug: string }): string {
  return post.type === 'column' ? `/coluna/${post.slug}` : `/noticia/${post.slug}`;
}

export const statusLabel: Record<string, string> = {
  draft: 'Rascunho',
  pending: 'Em revisão',
  published: 'Publicada',
};

export const roleLabel: Record<string, string> = {
  admin: 'Administrador',
  columnist: 'Colunista',
  reader: 'Leitor',
};

/** "nenhuma matéria", "1 matéria", "3 matérias". */
export function countPosts(n: number): string {
  if (n === 0) return 'nenhuma matéria';
  return n === 1 ? '1 matéria' : `${n} matérias`;
}
