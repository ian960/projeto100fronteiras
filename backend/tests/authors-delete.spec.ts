import { describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { loginAs } from './helpers/agent';
import { makeAdmin, makeColumn, makeColumnist, makeWriter } from './factories';

// DELETE /api/admin/authors/:id. Without posts the byline simply goes. With
// posts the admin chooses: move them to another author (?transferTo=<id>) or
// delete them too (?deletePosts=true).

async function asAdmin() {
  const admin = await makeAdmin();
  const { client } = await loginAs(admin.email);
  return { admin, client };
}

describe('excluir autor', () => {
  it('apaga direto o autor sem matérias', async () => {
    const { client } = await asAdmin();
    const writer = await makeWriter();

    await client.delete(`/api/admin/authors/${writer.id}`).expect(204);
    expect(await prisma.author.findUnique({ where: { id: writer.id } })).toBeNull();
  });

  it('com matérias, pede uma escolha antes', async () => {
    const { admin, client } = await asAdmin();
    const writer = await makeWriter();
    await makeColumn({ authorId: writer.id, createdById: admin.id });

    await client.delete(`/api/admin/authors/${writer.id}`).expect(409);
    expect(await prisma.author.findUnique({ where: { id: writer.id } })).not.toBeNull();
  });

  it('passa as matérias para outro autor', async () => {
    const { admin, client } = await asAdmin();
    const writer = await makeWriter();
    const heir = await makeWriter();
    const post = await makeColumn({ authorId: writer.id, createdById: admin.id });

    await client.delete(`/api/admin/authors/${writer.id}`).query({ transferTo: heir.id }).expect(204);

    expect(await prisma.author.findUnique({ where: { id: writer.id } })).toBeNull();
    expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).authorId).toBe(heir.id);
  });

  it('não transfere para o próprio autor', async () => {
    const { admin, client } = await asAdmin();
    const writer = await makeWriter();
    await makeColumn({ authorId: writer.id, createdById: admin.id });

    await client.delete(`/api/admin/authors/${writer.id}`).query({ transferTo: writer.id }).expect(422);
    expect(await prisma.author.findUnique({ where: { id: writer.id } })).not.toBeNull();
  });

  it('apaga as matérias junto e devolve o colunista a leitor', async () => {
    const { client } = await asAdmin();
    const columnist = await makeColumnist();
    const post = await makeColumn({ authorId: columnist.author.id, createdById: columnist.user.id });

    await client.delete(`/api/admin/authors/${columnist.author.id}`).query({ deletePosts: 'true' }).expect(204);

    expect(await prisma.author.findUnique({ where: { id: columnist.author.id } })).toBeNull();
    expect(await prisma.post.findUnique({ where: { id: post.id } })).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: columnist.user.id } })).role).toBe('reader');
  });
});
