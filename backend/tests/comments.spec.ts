import { describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { agent, loginAs } from './helpers/agent';
import { makeAdmin, makeColumn, makeColumnist, makeUser, TEST_PASSWORD } from './factories';

// Comments under a published column: anyone reads, any account writes, the
// writer edits and deletes, the column's author and the admin delete too.

async function publishedColumn() {
  const columnist = await makeColumnist();
  const post = await makeColumn(
    { authorId: columnist.author.id, createdById: columnist.user.id },
    { status: 'published', publishedAt: new Date() },
  );
  return { columnist, post };
}

async function asReader(name = 'Leitora') {
  const reader = await makeUser({ name });
  const { client } = await loginAs(reader.email);
  return { reader, client };
}

const list = async (postId: string) =>
  (await agent().get('/api/comments').query({ postId }).expect(200)).body.data;

describe('writing comments', () => {
  it('lets a reader comment and anyone read it', async () => {
    const { post } = await publishedColumn();
    const { reader, client } = await asReader();

    const response = await client
      .post('/api/comments')
      .send({ postId: post.id, content: '  Ótimo texto!  ' })
      .expect(201);

    expect(response.body.data.comment).toMatchObject({
      content: 'Ótimo texto!',
      editedAt: null,
      author: { id: reader.id, name: 'Leitora', badge: null },
    });

    const data = await list(post.id);
    expect(data.total).toBe(1);
    expect(data.comments[0].content).toBe('Ótimo texto!');
  });

  it('keeps the text as typed: no HTML is interpreted', async () => {
    const { post } = await publishedColumn();
    const { client } = await asReader();

    const response = await client
      .post('/api/comments')
      .send({ postId: post.id, content: '<b>oi</b><script>x()</script>' })
      .expect(201);

    // Stored and returned as plain text. The site renders it as text.
    expect(response.body.data.comment.content).toBe('<b>oi</b><script>x()</script>');
  });

  it('refuses a visitor, an empty comment and a draft post', async () => {
    const { post, columnist } = await publishedColumn();
    const draft = await makeColumn({ authorId: columnist.author.id, createdById: columnist.user.id });
    const { client } = await asReader();

    await agent().post('/api/comments').send({ postId: post.id, content: 'oi' }).expect(401);
    await client.post('/api/comments').send({ postId: post.id, content: '   ' }).expect(422);
    await client.post('/api/comments').send({ postId: post.id, content: 'x'.repeat(2001) }).expect(422);
    await client.post('/api/comments').send({ postId: draft.id, content: 'oi' }).expect(404);
    await agent().get('/api/comments').query({ postId: draft.id }).expect(404);
  });

  it('labels the post author and the admin, nobody else', async () => {
    const { post, columnist } = await publishedColumn();
    const admin = await makeAdmin();
    const other = await makeColumnist();

    for (const email of [columnist.user.email, admin.email, other.user.email]) {
      const { client } = await loginAs(email);
      await client.post('/api/comments').send({ postId: post.id, content: 'oi' }).expect(201);
    }

    const badges = (await list(post.id)).comments.map((comment: any) => comment.author.badge);
    expect(badges).toEqual(['author', 'admin', 'columnist']);
  });
});

describe('replies', () => {
  it('nests a reply under its comment, and a reply to a reply under the same one', async () => {
    const { post } = await publishedColumn();
    const { client } = await asReader();

    const top = (await client.post('/api/comments').send({ postId: post.id, content: 'Primeiro' }).expect(201))
      .body.data.comment;
    const reply = (
      await client.post('/api/comments').send({ postId: post.id, parentId: top.id, content: 'Resposta' }).expect(201)
    ).body.data.comment;
    const deeper = (
      await client.post('/api/comments').send({ postId: post.id, parentId: reply.id, content: 'Tréplica' }).expect(201)
    ).body.data.comment;

    expect(reply.parentId).toBe(top.id);
    expect(deeper.parentId).toBe(top.id);

    const data = await list(post.id);
    expect(data.comments).toHaveLength(1);
    expect(data.comments[0].replies.map((r: any) => r.content)).toEqual(['Resposta', 'Tréplica']);
  });

  it('refuses a reply to a comment of another post', async () => {
    const first = await publishedColumn();
    const second = await publishedColumn();
    const { client } = await asReader();

    const top = (await client.post('/api/comments').send({ postId: first.post.id, content: 'oi' }).expect(201)).body
      .data.comment;

    await client
      .post('/api/comments')
      .send({ postId: second.post.id, parentId: top.id, content: 'oi' })
      .expect(422);
  });
});

describe('editing and deleting', () => {
  it('lets the writer edit, and marks when', async () => {
    const { post } = await publishedColumn();
    const { client } = await asReader();
    const comment = (await client.post('/api/comments').send({ postId: post.id, content: 'Erro' }).expect(201)).body
      .data.comment;

    const edited = (await client.patch(`/api/comments/${comment.id}`).send({ content: 'Corrigido' }).expect(200)).body
      .data.comment;

    expect(edited.content).toBe('Corrigido');
    expect(edited.editedAt).not.toBeNull();
  });

  it('never lets someone else edit, not even the admin', async () => {
    const { post } = await publishedColumn();
    const { client } = await asReader();
    const comment = (await client.post('/api/comments').send({ postId: post.id, content: 'Meu' }).expect(201)).body
      .data.comment;

    const admin = await makeAdmin();
    const { client: adminClient } = await loginAs(admin.email);

    await adminClient.patch(`/api/comments/${comment.id}`).send({ content: 'Outro' }).expect(403);
  });

  it('lets the writer, the post author and the admin delete; nobody else', async () => {
    const { post, columnist } = await publishedColumn();
    const admin = await makeAdmin();
    const { client } = await asReader();
    const { client: stranger } = await asReader('Outra');
    const { client: author } = await loginAs(columnist.user.email);
    const { client: adminClient } = await loginAs(admin.email);

    const write = async () =>
      (await client.post('/api/comments').send({ postId: post.id, content: 'oi' }).expect(201)).body.data.comment.id;

    const a = await write();
    await stranger.delete(`/api/comments/${a}`).expect(403);
    await client.delete(`/api/comments/${a}`).expect(204);

    const b = await write();
    await author.delete(`/api/comments/${b}`).expect(204);

    const c = await write();
    await adminClient.delete(`/api/comments/${c}`).expect(204);

    expect(await prisma.comment.count({ where: { postId: post.id } })).toBe(0);
  });

  it('keeps the replies of a deleted comment, then tidies up', async () => {
    const { post } = await publishedColumn();
    const { client } = await asReader();
    const { client: other } = await asReader('Outra');

    const top = (await client.post('/api/comments').send({ postId: post.id, content: 'Pergunta' }).expect(201)).body
      .data.comment;
    const reply = (
      await other.post('/api/comments').send({ postId: post.id, parentId: top.id, content: 'Resposta' }).expect(201)
    ).body.data.comment;

    await client.delete(`/api/comments/${top.id}`).expect(204);

    let data = await list(post.id);
    expect(data.comments[0]).toMatchObject({ deleted: true, content: '', author: null });
    expect(data.comments[0].replies[0].content).toBe('Resposta');
    expect(data.total).toBe(1);

    // The last reply goes, and the emptied comment with it.
    await other.delete(`/api/comments/${reply.id}`).expect(204);
    data = await list(post.id);
    expect(data.comments).toHaveLength(0);
  });

  it('keeps the comments of a deleted account, unsigned', async () => {
    const { post } = await publishedColumn();
    const { client } = await asReader();
    await client.post('/api/comments').send({ postId: post.id, content: 'Fica' }).expect(201);

    await client.delete('/api/auth/me').send({ password: TEST_PASSWORD }).expect(204);

    const data = await list(post.id);
    expect(data.comments[0]).toMatchObject({ content: 'Fica', author: null });
  });
});
