import { describe, expect, it } from 'vitest';
import { categoriesService } from '../src/modules/categories/categories.service';
import { categoriesRepository } from '../src/modules/categories/categories.repository';
import { Conflict, NotFound, ValidationError } from '../src/shared/errors/AppError';
import { makeAdmin, makeCategory, makeNews, makeWriter } from './factories';

// Service-level tests: no HTTP, no login. They exercise the business rules of
// the categories module on their own, which is why they are the fastest place
// to look when something in that module breaks.

describe('serviço de editorias: criar', () => {
  it('monta o endereço sem acentos', async () => {
    const category = await categoriesService.create({ name: 'Política' });
    expect(category.slug).toBe('politica');
  });

  it('aceita um endereço digitado', async () => {
    const category = await categoriesService.create({
      name: 'Política e Poder',
      slug: 'politica-poder',
    });
    expect(category.slug).toBe('politica-poder');
  });

  it('recusa endereço repetido', async () => {
    await categoriesService.create({ name: 'Esportes' });

    await expect(categoriesService.create({ name: 'esportes' })).rejects.toBeInstanceOf(Conflict);
  });

  it('recusa um nome que não gera endereço', async () => {
    await expect(categoriesService.create({ name: '!!!' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('usa a ordem zero por padrão', async () => {
    const category = await categoriesService.create({ name: 'Cultura' });
    expect(category.sortOrder).toBe(0);
  });
});

describe('serviço de editorias: editar', () => {
  it('muda o endereço gerado pelo nome junto com o nome', async () => {
    const created = await categoriesService.create({ name: 'Politica' });
    const updated = await categoriesService.update(created.id, { name: 'Política e Poder' });

    expect(updated.slug).toBe('politica-e-poder');
    expect(updated.name).toBe('Política e Poder');
  });

  it('mantém o endereço digitado à mão quando só o nome muda', async () => {
    const created = await categoriesService.create({ name: 'Politica', slug: 'poder' });
    const updated = await categoriesService.update(created.id, { name: 'Política e Poder' });

    expect(updated.slug).toBe('poder');
  });

  it('muda o endereço quando isso é pedido', async () => {
    const created = await categoriesService.create({ name: 'Politica' });
    const updated = await categoriesService.update(created.id, { slug: 'poder' });

    expect(updated.slug).toBe('poder');
  });

  it('recusa um endereço que é de outra editoria', async () => {
    await categoriesService.create({ name: 'Esportes' });
    const other = await categoriesService.create({ name: 'Cultura' });

    await expect(categoriesService.update(other.id, { slug: 'esportes' })).rejects.toBeInstanceOf(
      Conflict,
    );
  });

  it('deixa a editoria manter o próprio endereço', async () => {
    const created = await categoriesService.create({ name: 'Esportes' });

    // Same slug, same row: this must not be read as a collision.
    const updated = await categoriesService.update(created.id, { slug: 'esportes' });
    expect(updated.slug).toBe('esportes');
  });

  it('falha com um id que não existe', async () => {
    await expect(
      categoriesService.update('00000000-0000-7000-8000-000000000000', { name: 'Ghost' }),
    ).rejects.toBeInstanceOf(NotFound);
  });
});

describe('serviço de editorias: listagem', () => {
  it('esconde editorias inativas da lista pública', async () => {
    await makeCategory({ name: 'Visible', slug: 'visible' });
    await makeCategory({ name: 'Hidden', slug: 'hidden', active: false });

    const slugs = (await categoriesService.listActive()).map((c) => c.slug);

    expect(slugs).toContain('visible');
    expect(slugs).not.toContain('hidden');
  });

  it('mostra tudo no painel, com as contagens', async () => {
    await makeCategory({ name: 'Hidden', slug: 'hidden', active: false });

    const all = await categoriesService.listAll();

    expect(all).toHaveLength(1);
    expect(all[0]?._count?.posts).toBe(0);
  });

  it('ordena pela ordem e depois pelo nome', async () => {
    await makeCategory({ name: 'Zebra', slug: 'zebra', sortOrder: 0 });
    await makeCategory({ name: 'Alfa', slug: 'alfa', sortOrder: 5 });
    await makeCategory({ name: 'Beta', slug: 'beta', sortOrder: 0 });

    const names = (await categoriesService.listActive()).map((c) => c.name);

    // sortOrder is what the admin controls; name only breaks ties.
    expect(names).toEqual(['Beta', 'Zebra', 'Alfa']);
  });

  it('não devolve editoria inativa pelo endereço', async () => {
    await makeCategory({ name: 'Hidden', slug: 'hidden', active: false });

    await expect(categoriesService.getBySlug('hidden')).rejects.toBeInstanceOf(NotFound);
  });
});

describe('serviço de editorias: excluir', () => {
  it('exclui uma editoria sem matérias', async () => {
    const created = await categoriesService.create({ name: 'Temporary' });

    await categoriesService.remove(created.id);

    expect(await categoriesRepository.findById(created.id)).toBeNull();
  });

  it('recusa excluir editoria em uso e diz quantas matérias ela tem', async () => {
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
