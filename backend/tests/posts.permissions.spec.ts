import { describe, expect, it } from 'vitest';
import { agent, loginAs } from './helpers/agent';
import {
  makeAdmin,
  makeCategory,
  makeColumn,
  makeColumnist,
  makeNews,
  makeUser,
  makeWriter,
} from './factories';

// The three tests that matter.
//
// All three assert a refusal, not a success. A permission test that only walks
// the happy path proves nothing: what needs proving is that the door is shut.
//
// They run against a real Postgres on purpose. With a mocked repository the
// assertion would pass even with a broken WHERE clause, because the mock
// returns whatever it was told to.
describe('column permissions', () => {
  it('refuses to let a columnist publish their own column', async () => {
    const { user, author } = await makeColumnist();
    const column = await makeColumn({ authorId: author.id, createdById: user.id });

    const { client } = await loginAs(user.email);

    // There is no publish route under /columnist at all, which is the design:
    // a columnist has no endpoint capable of writing status = 'published'.
    await client.post(`/api/columnist/posts/${column.id}/publish`).expect(404);

    // And the admin route rejects them by role.
    await client.post(`/api/admin/posts/${column.id}/publish`).expect(403);

    // Submitting for review is what they are allowed to do.
    const submitted = await client
      .post(`/api/columnist/posts/${column.id}/submit`)
      .expect(200);

    expect(submitted.body.data.post.status).toBe('pending');
  });

  it('refuses to let a columnist edit a published column', async () => {
    const admin = await makeAdmin();
    const { user, author } = await makeColumnist();

    const column = await makeColumn(
      { authorId: author.id, createdById: user.id },
      { status: 'published', publishedAt: new Date(), publishedById: admin.id },
    );

    const { client } = await loginAs(user.email);

    const response = await client
      .patch(`/api/columnist/posts/${column.id}`)
      .send({ title: 'Trying to fix a typo' })
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');

    // The admin still can — that is the trade-off we accepted, and what the
    // client has to be told during training.
    const { client: adminClient } = await loginAs(admin.email);

    await adminClient
      .patch(`/api/admin/posts/${column.id}`)
      .send({ title: 'Typo fixed by the admin' })
      .expect(200);
  });

  it('refuses to let a columnist touch another columnist column', async () => {
    const first = await makeColumnist();
    const second = await makeColumnist();

    const foreignColumn = await makeColumn({
      authorId: second.author.id,
      createdById: second.user.id,
    });

    const { client } = await loginAs(first.user.email);

    await client
      .patch(`/api/columnist/posts/${foreignColumn.id}`)
      .send({ title: 'Not mine' })
      .expect(403);

    await client.delete(`/api/columnist/posts/${foreignColumn.id}`).expect(403);

    // Not even readable: canViewInPanel is ownership-based too.
    await client.get(`/api/columnist/posts/${foreignColumn.id}`).expect(403);
  });
});

describe('columnist scoping', () => {
  it('never lists posts that belong to someone else', async () => {
    const first = await makeColumnist();
    const second = await makeColumnist();

    await makeColumn({ authorId: first.author.id, createdById: first.user.id });
    await makeColumn({ authorId: second.author.id, createdById: second.user.id });

    const { client } = await loginAs(first.user.email);

    const response = await client.get('/api/columnist/posts').expect(200);
    const items = response.body.data.items as { id: string }[];

    expect(items).toHaveLength(1);
  });

  it('ignores an authorId passed in the query string', async () => {
    const first = await makeColumnist();
    const second = await makeColumnist();

    await makeColumn({ authorId: second.author.id, createdById: second.user.id });

    const { client } = await loginAs(first.user.email);

    // Filtering happens in the WHERE clause from the session, so this
    // parameter cannot widen the result set.
    const response = await client
      .get(`/api/columnist/posts?authorId=${second.author.id}`)
      .expect(200);

    expect(response.body.data.items).toHaveLength(0);
  });

  it('forces type=column and its own byline on creation', async () => {
    const { user, author } = await makeColumnist();
    const other = await makeWriter();
    const category = await makeCategory();

    const { client } = await loginAs(user.email);

    const response = await client
      .post('/api/columnist/posts')
      .send({
        title: 'My opinion piece',
        content: '<p>Text.</p>',
        // All three are ignored: the server decides them.
        type: 'news',
        authorId: other.id,
        categoryId: category.id,
      })
      .expect(201);

    const post = response.body.data.post;

    expect(post.type).toBe('column');
    expect(post.authorId).toBe(author.id);
    expect(post.categoryId).toBeNull();
    expect(post.status).toBe('draft');
  });
});

describe('panel access', () => {
  it('keeps readers out of both panels', async () => {
    const admin = await makeAdmin();
    const writer = await makeWriter();
    const category = await makeCategory();
    const news = await makeNews({
      authorId: writer.id,
      createdById: admin.id,
      categoryId: category.id,
    });

    const reader = await makeUser();

    const { client } = await loginAs(reader.email);

    await client.get('/api/admin/posts').expect(403);
    await client.get('/api/columnist/posts').expect(403);
    await client.post(`/api/admin/posts/${news.id}/publish`).expect(403);
  });

  it('rejects anonymous access to the panel', async () => {
    const client = agent();

    const response = await client.get('/api/admin/posts').expect(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});
