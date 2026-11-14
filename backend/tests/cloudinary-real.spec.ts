import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { getCloudinarySettings } from '../src/config/cloudinary';
import { destroy } from '../src/modules/media/cloudinary.client';
import { loginAs } from './helpers/agent';
import { registration, sendToCloudinary, signUpload, type TestFile } from './helpers/upload';
import { makeAdmin } from './factories';

// The same path a file takes from the panel, against the real Cloudinary:
// the account in backend/.env, the folder "portal-testes". Run on purpose
// with `npm run test:cloudinary` (never part of `npm test`): it needs the
// internet, takes about a minute and spends a few transformations.
//
// The fake Cloudinary of the other tests behaves the way we *think* Cloudinary
// does. This file checks that it really does: the "pages": 0 a real video
// upload answers broke every video in production while the fake never sent it.
//
// Everything sent is deleted at the end of each test, passed or failed.

const FIXTURES = path.join(__dirname, 'fixtures');
const file = (name: string, from = FIXTURES): TestFile => ({ name, bytes: fs.readFileSync(path.join(from, name)) });

const photo = () => file('orla.jpg', path.join(__dirname, '..', 'scripts', 'demo-images'));
const video = () => file('video-2s.mp4');
const pdf = () => file('documento.pdf');

type Purpose = Parameters<typeof signUpload>[1];
type Sent = { resourceType: 'image' | 'video'; publicId: string };

// Files that reached Cloudinary in this test, registered or not.
const sent: Sent[] = [];

async function asAdmin() {
  const admin = await makeAdmin();
  return (await loginAs(admin.email)).client;
}

// The panel's three steps: signature, file straight to Cloudinary, register.
async function upload(client: Awaited<ReturnType<typeof asAdmin>>, purpose: Purpose, testFile: TestFile) {
  const signed = await signUpload(client, purpose);
  const cloud = await sendToCloudinary(signed, testFile);
  expect(cloud.status, `Cloudinary recusou ${testFile.name}: ${JSON.stringify(cloud.body.error ?? cloud.body)}`).toBe(200);
  sent.push({ resourceType: cloud.body.resource_type === 'video' ? 'video' : 'image', publicId: cloud.body.public_id });

  const response = await client.post('/api/media').send(registration(purpose, cloud.body, testFile.name));
  expect(response.status, `A API não registrou a resposta do Cloudinary: ${JSON.stringify(response.body)}`).toBe(201);
  return { media: response.body.data.media as Record<string, any>, cloud: cloud.body };
}

// A video's versions are made in the background (eager_async): they can take
// a while after the upload. Anything else should answer at once.
async function opens(url: string, seconds = 5): Promise<Response> {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const response = await fetch(url);
    if (response.ok || Date.now() > until) {
      const why = response.headers.get('x-cld-error');
      expect(response.status, `${url} respondeu ${response.status}${why ? ` (${why})` : ''}`).toBe(200);
      return response;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

// "url 480w, url 960w": the URLs have commas of their own (f_auto,q_auto),
// so the entries are split on a comma followed by a space.
const srcsetUrls = (srcset: string) => srcset.split(/,\s+/).map((entry) => entry.trim().split(/\s+/)[0]!);

beforeAll(() => {
  const cloud = getCloudinarySettings();
  if (!cloud || /127\.0\.0\.1|localhost/.test(cloud.apiBase)) {
    throw new Error('Sem Cloudinary de verdade: preencha CLOUDINARY_URL em backend/.env (ou passe REAL_CLOUDINARY_URL).');
  }
});

afterEach(async () => {
  // Registered files are in the table; files Cloudinary took but the API
  // refused are only in `sent`. Both go, before setup.ts empties the table.
  for (const media of await prisma.media.findMany({ select: { kind: true, publicId: true } })) {
    sent.push({ resourceType: media.kind === 'video' ? 'video' : 'image', publicId: media.publicId });
  }
  for (const { resourceType, publicId } of sent.splice(0)) {
    await destroy(resourceType, publicId).catch(() => undefined);
  }
});

describe('Cloudinary de verdade (conta do backend/.env, pasta portal-testes)', () => {
  it('envia uma capa, registra e entrega a foto em todos os tamanhos', async () => {
    const client = await asAdmin();
    const { media } = await upload(client, 'cover', photo());

    expect(media.kind).toBe('image');
    expect(media.width).toBe(1600);

    const response = await opens(media.url);
    expect(response.headers.get('content-type')).toMatch(/^image\//);
    await opens(media.thumbnailUrl);
    await opens(media.shareUrl);
    for (const url of srcsetUrls(media.srcset)) await opens(url);
  });

  it('envia um vídeo, registra e prepara o MP4 e as capas em segundo plano', async () => {
    const client = await asAdmin();
    const { media, cloud } = await upload(client, 'video', video());

    // What broke production once: the API must accept Cloudinary's answer
    // for a video as it really is.
    expect(cloud.pages ?? 0).toBe(0);
    expect(media.kind).toBe('video');
    expect(media.pages).toBeNull();
    expect(media.durationSec).toBeCloseTo(2, 0);

    const mp4 = await opens(media.url, 120);
    // Cloudinary may add the codec: "video/mp4;codecs=avc1".
    expect(mp4.headers.get('content-type')).toMatch(/^video\/mp4(;|$)/);
    await opens(media.posterUrl, 120);
    await opens(media.thumbnailUrl, 120);
  });

  it('envia um PDF e deixa baixar', async () => {
    const client = await asAdmin();
    const { media } = await upload(client, 'document', pdf());

    expect(media.kind).toBe('document');
    expect(media.pages).toBe(1);

    const response = await fetch(media.url);
    expect(
      response.status,
      response.status === 401
        ? 'O Cloudinary bloqueia PDFs: ligue "Allow delivery of PDF and ZIP files" em Settings → Security'
        : `${media.url} respondeu ${response.status}`,
    ).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    await opens(media.thumbnailUrl);
  });

  it('recusa um envio com um campo assinado adulterado', async () => {
    const client = await asAdmin();
    const signed = await signUpload(client, 'cover');

    const cloud = await sendToCloudinary(signed, photo(), { public_id: 'portal-testes/outro-nome' });
    if (cloud.status === 200) sent.push({ resourceType: 'image', publicId: cloud.body.public_id });

    expect(cloud.status).toBe(401);
    expect(cloud.body.error?.message).toMatch(/signature/i);
  });

  it('importa uma imagem por link', async () => {
    const client = await asAdmin();
    const { media: original } = await upload(client, 'cover', photo());

    // Any public picture works; this one is already online, in our account.
    const response = await client.post('/api/media/import').send({ purpose: 'body', url: original.url });
    expect(response.status, JSON.stringify(response.body)).toBe(201);

    await opens(response.body.data.media.url);
  });

  it('apaga do Cloudinary quando o admin exclui o arquivo', async () => {
    const client = await asAdmin();
    const { media, cloud } = await upload(client, 'cover', photo());

    await client.delete(`/api/media/${media.id}`).expect(204);

    // Gone from the account: deleting it again finds nothing.
    expect(await destroy('image', cloud.public_id)).toBe('not found');
  });
});
