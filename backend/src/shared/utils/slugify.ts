export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// True when `slug` was made from `source` by this code (with or without the
// "-2" added to avoid a clash), and false when someone typed it by hand. An
// address made from a name follows that name; a typed one is left alone.
export function isSlugOf(slug: string, source: string): boolean {
  const base = slugify(source);
  if (!base) return false;
  // `base` holds only a-z, 0-9 and "-", so it is safe inside a RegExp.
  return slug === base || new RegExp(`^${base}-\\d+$`).test(slug);
}
