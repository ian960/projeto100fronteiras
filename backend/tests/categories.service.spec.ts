import { describe, expect, it } from 'vitest';
import { categoriesService } from '../src/modules/categories/categories.service';
import { categoriesRepository } from '../src/modules/categories/categories.repository';
import { Conflict, NotFound, ValidationError } from '../src/shared/errors/AppError';
import { makeAdmin, makeCategory, makeNews, makeWriter } from './factories';

// Service-level tests: no HTTP, no login. They exercise the business rules of
// the categories module on their own, which is why they are the fastest place
// to look when something in that module breaks.

describe('categories service: create', () => {
  it('builds a slug without accents', async () => {
    const category = await categoriesService.create({ name: 'Política' });
    expect(category.slug).toBe('politica');
  });

  it('accepts an explicit slug', async () => {
    const category = await categoriesService.create({
      name: 'Política e Poder',
      slug: 'politica-poder',
    });
    expect(category.slug).toBe('politica-poder');
  });

  it('refuses a duplicate slug', async () => {
    await categoriesService.create({ name: 'Esportes' });

    await expect(categoriesService.create({ name: 'esportes' })).rejects.toBeInstanceOf(Conflict);
  });

  it('refuses a name that produces no slug', async () => {
    await expect(categoriesService.create({ name: '!!!' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('defaults sortOrder to zero', async () => {
    const category = await categoriesService.create({ name: 'Cultura' });
    expect(category.sortOrder).toBe(0);
  });
});

describe('categories service: update', () => {
  it('moves a slug made from the name along with the name', async () => {
    const created = await categoriesService.create({ name: 'Politica' });
    const updated = await categoriesService.update(created.id, { name: 'Política e Poder' });

    expect(updated.slug).toBe('politica-e-poder');
    expect(updated.name).toBe('Política e Poder');
  });

  it('keeps a slug typed by hand when only the name changes', async () => {
    const created = await categoriesService.create({ name: 'Politica', slug: 'poder' });
    const updated = await categoriesService.update(created.id, { name: 'Política e Poder' });

    expect(updated.slug).toBe('poder');
  });

  it('moves the slug when asked explicitly', async () => {
    const created = await categoriesService.create({ name: 'Politica' });
    const updated = await categoriesService.update(created.id, { slug: 'poder' });

    expect(updated.slug).toBe('poder');
  });

  it('refuses a slug that belongs to another category', async () => {
    await categoriesService.create({ name: 'Esportes' });
    const other = await categoriesService.create({ name: 'Cultura' });

    await expect(categoriesService.update(other.id, { slug: 'esportes' })).rejects.toBeInstanceOf(
      Conflict,
    );
  });

  it('lets a category keep its own slug', async () => {
    const created = await categoriesService.create({ name: 'Esportes' });

    // Same slug, same row: this must not be read as a collision.
    const updated = await categoriesService.update(created.id, { slug: 'esportes' });
    expect(updated.slug).toBe('esportes');
  });

  it('fails on an unknown id', async () => {
    await expect(
      categoriesService.update('00000000-0000-7000-8000-000000000000', { name: 'Ghost' }),
    ).rejects.toBeInstanceOf(NotFound);
  });
});

describe('categories service: listing', () => {
  it('hides inactive categories from the public list', async () => {
    await makeCategory({ name: 'Visible', slug: 'visible' });
    await makeCategory({ name: 'Hidden', slug: 'hidden', active: false });

    const slugs = (await categoriesService.listActive()).map((c) => c.slug);

    expect(slugs).toContain('visible');
    expect(slugs).not.toContain('hidden');
  });

  it('shows everything in the panel, with counts', async () => {
    await makeCategory({ name: 'Hidden', slug: 'hidden', active: false });

    const all = await categoriesService.listAll();

    expect(all).toHaveLength(1);
    expect(all[0]?._count?.posts).toBe(0);
  });

  it('orders by sortOrder, then by name', async () => {
    await makeCategory({ name: 'Zebra', slug: 'zebra', sortOrder: 0 });
    await makeCategory({ name: 'Alfa', slug: 'alfa', sortOrder: 5 });
    await makeCategory({ name: 'Beta', slug: 'beta', sortOrder: 0 });

    const names = (await categoriesService.listActive()).map((c) => c.name);

    // sortOrder is what the admin controls; name only breaks ties.
    expect(names).toEqual(['Beta', 'Zebra', 'Alfa']);
  });

  it('refuses to return an inactive category by slug', async () => {
    await makeCategory({ name: 'Hidden', slug: 'hidden', active: false });

    await expect(categoriesService.getBySlug('hidden')).rejects.toBeInstanceOf(NotFound);
  });
});

describe('categories service: delete', () => {
  it('deletes a category with no posts', async () => {
    const created = await categoriesService.create({ name: 'Temporary' });

    await categoriesService.remove(created.id);

    expect(await categoriesRepository.findById(created.id)).toBeNull();
  });

  it('refuses to delete a category in use, and says how many', async () => {
    const admin = await makeAdmin();
    const writer = await makeWriter();
    const category = await makeCategory();

    await makeNews({ authorId: writer.id, createdById: admin.id, categoryId: category.id });

    // The foreign key is Restrict, so the database would refuse anyway — but
    // its raw message is useless to the admin. Counting first is what makes
    // the error actionable.
    await expect(categoriesService.remove(category.id)).rejects.toThrow(/1 post/);
  });
});
