import { describe, expect, it } from 'vitest';
import { agent } from './helpers/agent';
import { makeAdmin, makeCategory, makeColumn, makeColumnist, makeNews, makeWriter } from './factories';

describe('mapa do site', () => {
  it('lista só o que está publicado, com os campos que o sitemap usa', async () => {
    const admin = await makeAdmin();
    const writer = await makeWriter();
    const idleWriter = await makeWriter();
    const category = await makeCategory();
    const hiddenCategory = await makeCategory({ active: false });
    const { author: columnist } = await makeColumnist();
    const ids = { authorId: writer.id, createdById: admin.id, categoryId: category.id };

    const published = await makeNews(ids, { status: 'published', publishedAt: new Date() });
    const draft = await makeNews(ids);
    const column = await makeColumn(
      { authorId: columnist.id, createdById: admin.id },
      { status: 'published', publishedAt: new Date() },
    );

    const response = await agent().get('/api/sitemap').expect(200);
    const { posts, categories, authors } = response.body.data;

    const slugs = posts.map((post: { slug: string }) => post.slug);
    expect(slugs).toEqual(expect.arrayContaining([published.slug, column.slug]));
    expect(slugs).not.toContain(draft.slug);
    expect(posts.find((post: { slug: string }) => post.slug === column.slug)).toEqual({
      slug: column.slug,
      type: 'column',
      title: column.title,
      publishedAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const categorySlugs = categories.map((item: { slug: string }) => item.slug);
    expect(categorySlugs).toContain(category.slug);
    expect(categorySlugs).not.toContain(hiddenCategory.slug);

    // An author with nothing published has an empty page: left out.
    const authorSlugs = authors.map((item: { slug: string }) => item.slug);
    expect(authorSlugs).toEqual(expect.arrayContaining([writer.slug, columnist.slug]));
    expect(authorSlugs).not.toContain(idleWriter.slug);
  });
});
