import { describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { agent, loginAs } from './helpers/agent';
import { gifFile, pngFile, signUpload, uploadMedia } from './helpers/upload';
import { makeAdmin, makeColumnist, makeMedia, makeUser } from './factories';

const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();

async function asAdmin() {
  const admin = await makeAdmin();
  const { client } = await loginAs(admin.email);
  const image = await makeMedia(admin.id);
  return { admin, client, image };
}

function bannerInput(imageId: string, overrides: Record<string, unknown> = {}) {
  return {
    advertiser: 'Padaria Central',
    linkUrl: 'https://padariacentral.com.br/promo',
    slot: 'home_top',
    imageId,
    startsAt: at(-1),
    endsAt: at(30),
    ...overrides,
  };
}

describe('banners: o que o site recebe', () => {
  it('sem nenhum banner, a lista vem vazia', async () => {
    const response = await agent().get('/api/banners').expect(200);
    expect(response.body.data.banners).toEqual([]);
  });

  it('mostra só os ligados e dentro do período', async () => {
    const { client, image } = await asAdmin();

    await client.post('/api/admin/banners').send(bannerInput(image.id, { advertiser: 'No ar' })).expect(201);
    await client
      .post('/api/admin/banners')
      .send(bannerInput(image.id, { advertiser: 'Ainda não começou', startsAt: at(2), endsAt: at(10) }))
      .expect(201);
    await client
      .post('/api/admin/banners')
      .send(bannerInput(image.id, { advertiser: 'Já acabou', startsAt: at(-10), endsAt: at(-1) }))
      .expect(201);
    await client
      .post('/api/admin/banners')
      .send(bannerInput(image.id, { advertiser: 'Desligado', active: false }))
      .expect(201);

    const response = await agent().get('/api/banners').expect(200);
    const banners = response.body.data.banners;

    expect(banners.map((b: { advertiser: string }) => b.advertiser)).toEqual(['No ar']);
    // Only what the page needs: no counts, no dates.
    expect(banners[0]).not.toHaveProperty('clicks');
    expect(banners[0]).not.toHaveProperty('endsAt');
    expect(banners[0].linkUrl).toBe('https://padariacentral.com.br/promo');
    expect(banners[0].image.width).toBe(1600);
    expect(banners[0].image.height).toBe(900);
    expect(banners[0].mobileImage).toBeNull();
  });

  it('para de mostrar quando o admin desliga', async () => {
    const { client, image } = await asAdmin();
    const created = await client.post('/api/admin/banners').send(bannerInput(image.id)).expect(201);
    const id = created.body.data.banner.id;

    await client.patch(`/api/admin/banners/${id}`).send({ active: false }).expect(200);

    const response = await agent().get('/api/banners').expect(200);
    expect(response.body.data.banners).toEqual([]);
  });
});

describe('banners: quem pode mexer', () => {
  it('leitor, colunista e visitante não criam nem listam banners', async () => {
    const admin = await makeAdmin();
    const image = await makeMedia(admin.id);
    const reader = await makeUser();
    const { user: columnistUser } = await makeColumnist();

    await agent().post('/api/admin/banners').send(bannerInput(image.id)).expect(401);

    for (const email of [reader.email, columnistUser.email]) {
      const { client } = await loginAs(email);
      await client.post('/api/admin/banners').send(bannerInput(image.id)).expect(403);
      await client.get('/api/admin/banners').expect(403);
    }

    expect(await prisma.banner.count()).toBe(0);
  });

  it('só o admin envia imagem de banner', async () => {
    const { user: columnistUser } = await makeColumnist();
    const columnist = await loginAs(columnistUser.email);
    await columnist.client.post('/api/media/signature').send({ purpose: 'banner' }).expect(403);

    const { client } = await asAdmin();
    const upload = await signUpload(client, 'banner');
    expect(upload.fields.public_id).toMatch(/\/banners\//);
  });

  it('aceita GIF animado como banner', async () => {
    const { client } = await asAdmin();
    const media = await uploadMedia(client, 'banner', gifFile(728, 90, 'promo.gif'));
    const mobile = await uploadMedia(client, 'banner', pngFile(320, 100, 'celular.png'));

    const created = await client
      .post('/api/admin/banners')
      .send(bannerInput(media.id, { mobileImageId: mobile.id }))
      .expect(201);

    expect(created.body.data.banner.image.format).toBe('gif');
    expect(created.body.data.banner.mobileImage.id).toBe(mobile.id);
  });
});

describe('banners: só a imagem', () => {
  it('aceita banner sem nome e sem link', async () => {
    const { client, image } = await asAdmin();
    const created = await client
      .post('/api/admin/banners')
      .send(bannerInput(image.id, { advertiser: '', linkUrl: '' }))
      .expect(201);
    expect(created.body.data.banner).toMatchObject({ advertiser: null, linkUrl: null });

    const site = (await agent().get('/api/banners').expect(200)).body.data.banners;
    expect(site[0]).toMatchObject({ advertiser: null, linkUrl: null });
  });

  it('tira o link de um banner que já tinha', async () => {
    const { client, image } = await asAdmin();
    const created = await client.post('/api/admin/banners').send(bannerInput(image.id)).expect(201);
    const updated = await client
      .patch(`/api/admin/banners/${created.body.data.banner.id}`)
      .send({ linkUrl: null, advertiser: null })
      .expect(200);
    expect(updated.body.data.banner).toMatchObject({ advertiser: null, linkUrl: null });
  });
});

describe('banners: validação', () => {
  it('recusa link que não seja http ou https', async () => {
    const { client, image } = await asAdmin();
    const response = await client
      .post('/api/admin/banners')
      .send(bannerInput(image.id, { linkUrl: 'javascript:alert(1)' }))
      .expect(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('recusa fim antes do início, também quando só uma data muda', async () => {
    const { client, image } = await asAdmin();
    await client
      .post('/api/admin/banners')
      .send(bannerInput(image.id, { startsAt: at(5), endsAt: at(1) }))
      .expect(422);

    const created = await client.post('/api/admin/banners').send(bannerInput(image.id)).expect(201);
    await client
      .patch(`/api/admin/banners/${created.body.data.banner.id}`)
      .send({ endsAt: at(-5) })
      .expect(422);
  });

  it('recusa um PDF no lugar da imagem', async () => {
    const { admin, client } = await asAdmin();
    const pdf = await makeMedia(admin.id, 'document');
    await client.post('/api/admin/banners').send(bannerInput(pdf.id)).expect(422);
  });

  it('não deixa apagar a imagem de um banner', async () => {
    const { client, image } = await asAdmin();
    await client.post('/api/admin/banners').send(bannerInput(image.id)).expect(201);
    await client.delete(`/api/media/${image.id}`).expect(409);
  });
});

describe('banners: contagem', () => {
  it('conta visualizações e cliques só de banner no ar', async () => {
    const { client, image } = await asAdmin();
    const live = (await client.post('/api/admin/banners').send(bannerInput(image.id)).expect(201)).body.data.banner;
    const off = (
      await client.post('/api/admin/banners').send(bannerInput(image.id, { active: false })).expect(201)
    ).body.data.banner;

    await agent().post('/api/banners/impressions').send({ ids: [live.id, off.id] }).expect(204);
    await agent().post('/api/banners/impressions').send({ ids: [live.id] }).expect(204);
    await agent().post(`/api/banners/${live.id}/click`).expect(204);
    await agent().post(`/api/banners/${off.id}/click`).expect(204);

    const list = (await client.get('/api/admin/banners').expect(200)).body.data.banners;
    const byId = Object.fromEntries(list.map((b: { id: string }) => [b.id, b]));

    expect(byId[live.id]).toMatchObject({ impressions: 2, clicks: 1 });
    expect(byId[off.id]).toMatchObject({ impressions: 0, clicks: 0 });
  });

  it('o admin exclui um banner', async () => {
    const { client, image } = await asAdmin();
    const created = await client.post('/api/admin/banners').send(bannerInput(image.id)).expect(201);
    await client.delete(`/api/admin/banners/${created.body.data.banner.id}`).expect(204);
    await client.delete(`/api/admin/banners/${created.body.data.banner.id}`).expect(404);
    expect(await prisma.banner.count()).toBe(0);
  });
});
