import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { agent, loginAs } from './helpers/agent';
import { FAKE_CLOUDINARY } from './helpers/cloudinaryTestEnv';
import {
  mp4File,
  pdfFile,
  pngFile,
  registration,
  sendToCloudinary,
  signUpload,
  uploadMedia,
} from './helpers/upload';
import { makeAdmin, makeCategory, makeColumnist, makeNews, makeUser, makeWriter } from './factories';

// The upload flow end to end, against the fake Cloudinary started by
// tests/helpers/fakeCloudinary.global.ts:
//   API signs  ->  "browser" sends the file to Cloudinary  ->  API registers it

async function asAdmin() {
  const admin = await makeAdmin();
  const { client } = await loginAs(admin.email);
  return { admin, client };
}

// What a reader's browser would get for a delivery URL.
const fetchStatus = async (url: string) => (await fetch(url)).status;

describe('signing an upload', () => {
  it('locks folder, id, formats and overwrite into the signature', async () => {
    const { client } = await asAdmin();

    const upload = await signUpload(client, 'cover');

    expect(upload.uploadUrl).toMatch(new RegExp(`/v1_1/${FAKE_CLOUDINARY.cloudName}/image/upload$`));
    expect(upload.fields.public_id).toMatch(
      new RegExp(`^${FAKE_CLOUDINARY.folder}/covers/[0-9a-f-]{36}$`),
    );
    expect(upload.fields.asset_folder).toBe(`${FAKE_CLOUDINARY.folder}/covers`);
    expect(upload.fields.allowed_formats).toBe('jpg,png,webp,avif,heic');
    expect(upload.fields.overwrite).toBe('0');
    expect(upload.fields.signature).toMatch(/^[0-9a-f]{40}$/);
    // The secret never leaves the server.
    expect(JSON.stringify(upload)).not.toContain(FAKE_CLOUDINARY.apiSecret);
  });

  it('gives every upload its own id', async () => {
    const { client } = await asAdmin();

    const first = await signUpload(client, 'document');
    const second = await signUpload(client, 'document');

    expect(first.fields.public_id).not.toBe(second.fields.public_id);
    expect(first.uploadUrl).toMatch(/\/image\/upload$/); // PDFs go through "image"
    expect(first.fields.allowed_formats).toBe('pdf');
  });

  it('is for the panel only', async () => {
    const reader = await makeUser();
    const { client } = await loginAs(reader.email);

    await client.post('/api/media/signature').send({ purpose: 'cover' }).expect(403);
    await agent().post('/api/media/signature').send({ purpose: 'cover' }).expect(401);
  });
});

describe('uploading and registering', () => {
  it('registers a cover and serves it from the delivery URL', async () => {
    const { admin, client } = await asAdmin();

    const media = await uploadMedia(client, 'cover', pngFile(1600, 900, 'praça.png'));

    expect(media.kind).toBe('image');
    expect(media.width).toBe(1600);
    expect(media.originalName).toBe('praça.png');
    expect(await fetchStatus(media.url)).toBe(200);
    expect(await fetchStatus(media.thumbnailUrl)).toBe(200);
    expect(media.shareUrl).toMatch(/\/c_fill,w_1200,h_630,q_auto\/v\d+\/.+\.jpg$/);
    expect(await fetchStatus(media.shareUrl)).toBe(200);

    const row = await prisma.media.findUniqueOrThrow({ where: { id: media.id } });
    expect(row.uploadedById).toBe(admin.id);
  });

  it('answers the same file when the panel retries', async () => {
    const { client } = await asAdmin();
    const file = pngFile(1600, 900);

    const upload = await signUpload(client, 'cover');
    const cloud = await sendToCloudinary(upload, file);
    const body = registration('cover', cloud.body, file.name);

    const first = await client.post('/api/media').send(body).expect(201);
    const second = await client.post('/api/media').send(body).expect(201);

    expect(second.body.data.media.id).toBe(first.body.data.media.id);
    expect(await prisma.media.count()).toBe(1);
  });

  it('registers a video and a PDF with their own URLs', async () => {
    const { client } = await asAdmin();

    const video = await uploadMedia(client, 'video', mp4File());
    expect(video.kind).toBe('video');
    expect(video.durationSec).toBe(12.5);
    expect(video.url).toMatch(/\/video\/upload\/q_auto\/v\d+\/.+\.mp4$/);
    expect(await fetchStatus(video.url)).toBe(200);
    expect(await fetchStatus(video.posterUrl)).toBe(200);

    const pdf = await uploadMedia(client, 'document', pdfFile(3));
    expect(pdf.kind).toBe('document');
    expect(pdf.pages).toBe(3);
    expect(pdf.url).toMatch(/\.pdf$/);
    expect(await fetchStatus(pdf.url)).toBe(200);
  });
});

describe('what a forged or tampered upload gets', () => {
  it('refuses an answer whose signature was not made by Cloudinary', async () => {
    const { client } = await asAdmin();
    const file = pngFile(1600, 900);

    const upload = await signUpload(client, 'cover');
    const cloud = await sendToCloudinary(upload, file);

    const forged = { ...registration('cover', cloud.body, file.name), signature: 'a'.repeat(40) };
    const response = await client.post('/api/media').send(forged).expect(422);

    expect(response.body.error.message).toBe('This upload could not be verified.');
  });

  it('refuses a real upload registered for another purpose', async () => {
    const { client } = await asAdmin();
    const file = pngFile(1600, 900);

    // Uploaded as a photo inside the text, presented as a cover.
    const upload = await signUpload(client, 'body');
    const cloud = await sendToCloudinary(upload, file);

    await client.post('/api/media').send(registration('cover', cloud.body, file.name)).expect(422);
  });

  it('cannot change a signed field on the way to Cloudinary', async () => {
    const { client } = await asAdmin();
    const upload = await signUpload(client, 'cover');

    // A page trying to write somewhere else, or to overwrite an existing file.
    const moved = await sendToCloudinary(upload, pngFile(1600, 900), {
      public_id: `${FAKE_CLOUDINARY.folder}/covers/chosen-by-the-browser`,
    });
    const overwriting = await sendToCloudinary(upload, pngFile(1600, 900), { overwrite: '1' });

    expect(moved.status).toBe(401);
    expect(overwriting.status).toBe(401);
  });

  it('cannot send a PDF where an image is expected', async () => {
    const { client } = await asAdmin();
    const upload = await signUpload(client, 'cover');

    const cloud = await sendToCloudinary(upload, pdfFile(1, 'not-a-photo.pdf'));

    expect(cloud.status).toBe(400);
    expect(cloud.body.error.message).toContain('not allowed');
  });

  it('removes from Cloudinary an image too small for a cover', async () => {
    const { client } = await asAdmin();
    const file = pngFile(500, 300);

    const upload = await signUpload(client, 'cover');
    const cloud = await sendToCloudinary(upload, file);
    const response = await client
      .post('/api/media')
      .send(registration('cover', cloud.body, file.name))
      .expect(422);

    expect(response.body.error.fields.file).toBe('Use an image at least 800px wide.');
    expect(await fetchStatus(cloud.body.secure_url)).toBe(404);
    expect(await prisma.media.count()).toBe(0);
  });
});

describe('importing an image from a link', () => {
  // Stands in for "some other website" hosting a photo.
  let site: Server;
  let siteUrl: string;

  beforeAll(async () => {
    site = createServer((req, res) => {
      if (req.url === '/fotos/feira.png') {
        res.writeHead(200, { 'content-type': 'image/png' });
        return res.end(pngFile(1280, 720).bytes);
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
    const address = site.address() as { port: number };
    siteUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(() => new Promise<void>((resolve) => site.close(() => resolve())));

  it('copies the picture into Cloudinary', async () => {
    const { client } = await asAdmin();

    const response = await client
      .post('/api/media/import')
      .send({ purpose: 'cover', url: `${siteUrl}/fotos/feira.png` })
      .expect(201);

    const media = response.body.data.media;
    expect(media.originalName).toBe('feira.png');
    expect(media.width).toBe(1280);
    // Served by "Cloudinary" now, not by the original site.
    expect(media.url.startsWith(process.env.CLOUDINARY_DELIVERY_BASE!)).toBe(true);
    expect(await fetchStatus(media.url)).toBe(200);
  });

  it('explains a link that does not lead to an image', async () => {
    const { client } = await asAdmin();

    const response = await client
      .post('/api/media/import')
      .send({ purpose: 'cover', url: `${siteUrl}/nothing-here.jpg` })
      .expect(422);

    expect(response.body.error.fields).toHaveProperty('url');
  });
});

describe('deleting a file', () => {
  it('removes an unused file from Cloudinary too', async () => {
    const { client } = await asAdmin();
    const media = await uploadMedia(client, 'cover', pngFile(1600, 900));

    await client.delete(`/api/media/${media.id}`).expect(204);

    expect(await prisma.media.findUnique({ where: { id: media.id } })).toBeNull();
    expect(await fetchStatus(media.url)).toBe(404);
  });

  it('refuses while a post uses it', async () => {
    const { admin, client } = await asAdmin();
    const writer = await makeWriter();
    const category = await makeCategory();
    const post = await makeNews({ authorId: writer.id, createdById: admin.id, categoryId: category.id });

    const response = await client.delete(`/api/media/${post.coverId}`).expect(409);

    expect(response.body.error.message).toContain('still in use');
  });

  it('is for the admin only', async () => {
    const { user } = await makeColumnist();
    const { client } = await loginAs(user.email);
    const media = await uploadMedia(client, 'cover', pngFile(1600, 900));

    await client.delete(`/api/media/${media.id}`).expect(403);
  });
});
