import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { agent, loginAs } from './helpers/agent';
import { FAKE_CLOUDINARY } from './helpers/cloudinaryTestEnv';
import {
  bmpFile,
  gifFile,
  mp4File,
  pdfFile,
  pngFile,
  registration,
  sendToCloudinary,
  signUpload,
  svgFile,
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

describe('assinar um envio', () => {
  it('trava pasta, id, formatos e sobrescrita na assinatura', async () => {
    const { client } = await asAdmin();

    const upload = await signUpload(client, 'cover');

    expect(upload.uploadUrl).toMatch(new RegExp(`/v1_1/${FAKE_CLOUDINARY.cloudName}/image/upload$`));
    expect(upload.fields.public_id).toMatch(
      new RegExp(`^${FAKE_CLOUDINARY.folder}/covers/[0-9a-f-]{36}$`),
    );
    expect(upload.fields.asset_folder).toBe(`${FAKE_CLOUDINARY.folder}/covers`);
    expect(upload.fields.allowed_formats).toBe('jpg,png,webp,avif,heic,heif,gif,bmp,tiff,tif');
    expect(upload.fields.overwrite).toBe('0');
    expect(upload.fields.signature).toMatch(/^[0-9a-f]{40}$/);
    // The secret never leaves the server.
    expect(JSON.stringify(upload)).not.toContain(FAKE_CLOUDINARY.apiSecret);
  });

  it('dá um id próprio a cada envio', async () => {
    const { client } = await asAdmin();

    const first = await signUpload(client, 'document');
    const second = await signUpload(client, 'document');

    expect(first.fields.public_id).not.toBe(second.fields.public_id);
    expect(first.uploadUrl).toMatch(/\/image\/upload$/); // PDFs go through "image"
    expect(first.fields.allowed_formats).toBe('pdf');
  });

  it('pede ao Cloudinary para preparar o vídeo logo depois do envio', async () => {
    const { client } = await asAdmin();

    const video = await signUpload(client, 'video');
    const cover = await signUpload(client, 'cover');

    // Over 40 MB, Cloudinary's free plan will not convert a video when someone
    // presses play. The mp4 and the two pictures are made in the background,
    // right after the upload, and the signature covers that request too.
    expect(video.fields.eager).toBe('q_auto/mp4|so_0,c_fill,w_480,h_270,q_auto/jpg|so_0,c_limit,w_1280,q_auto/jpg');
    expect(video.fields.eager_async).toBe('true');
    expect(cover.fields.eager).toBeUndefined();
  });

  it('só a redação assina capa: leitor e visitante são recusados', async () => {
    const reader = await makeUser();
    const { client } = await loginAs(reader.email);

    await client.post('/api/media/signature').send({ purpose: 'cover' }).expect(403);
    await agent().post('/api/media/signature').send({ purpose: 'cover' }).expect(401);
  });
});

describe('as regras que o painel lê', () => {
  it('entrega tipos aceitos, limites e larguras de cada finalidade', async () => {
    const { client } = await asAdmin();

    const response = await client.get('/api/media/rules').expect(200);
    const { cover, video } = response.body.data.rules;

    expect(cover.accept).toContain('image/gif');
    expect(cover.accept).not.toContain('svg');
    expect(cover.maxBytes).toBe(10 * 1024 * 1024);
    expect(cover.maxSourceBytes).toBeGreaterThan(cover.maxBytes);
    expect(cover.minWidth).toBe(100);
    expect(cover.recommendedWidth).toBe(800);
    expect(video.maxSourceBytes).toBeUndefined();
  });

  it('é só para quem está logado', async () => {
    await agent().get('/api/media/rules').expect(401);
  });
});

describe('enviar e registrar', () => {
  it('registra uma capa e entrega pelo endereço do Cloudinary', async () => {
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

  it('aceita GIF, BMP e uma capa pequena', async () => {
    const { client } = await asAdmin();

    const gif = await uploadMedia(client, 'cover', gifFile(1200, 800));
    const bmp = await uploadMedia(client, 'body', bmpFile(1024, 768));
    // Under the recommended 800px: accepted, the panel only warns.
    const small = await uploadMedia(client, 'cover', pngFile(700, 400));

    expect(gif.format).toBe('gif');
    expect(gif.width).toBe(1200);
    expect(bmp.format).toBe('bmp');
    expect(small.width).toBe(700);
    // Whatever was sent, the site asks Cloudinary for the best web format.
    expect(gif.url).toContain('f_auto,q_auto');
  });

  it('devolve o mesmo arquivo quando o painel tenta de novo', async () => {
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

  it('registra um vídeo e um PDF com os endereços certos', async () => {
    const { client } = await asAdmin();

    const video = await uploadMedia(client, 'video', mp4File());
    expect(video.kind).toBe('video');
    expect(video.durationSec).toBe(12.5);
    // Cloudinary answers "pages": 0 for a video; only a PDF has pages.
    expect(video.pages).toBeNull();
    expect(video.url).toMatch(/\/video\/upload\/q_auto\/v\d+\/.+\.mp4$/);
    expect(await fetchStatus(video.url)).toBe(200);
    expect(await fetchStatus(video.posterUrl)).toBe(200);

    // Each URL asks for exactly a version prepared at upload: in any other
    // order Cloudinary would see a new version and convert on the spot.
    const prepared = (await signUpload(client, 'video')).fields.eager!.split('|');
    for (const url of [video.url, video.thumbnailUrl, video.posterUrl]) {
      const [, transformation, extension] = url.match(/\/video\/upload\/(.+)\/v\d+\/.+\.(\w+)$/)!;
      expect(prepared).toContain(`${transformation}/${extension}`);
    }

    const pdf = await uploadMedia(client, 'document', pdfFile(3));
    expect(pdf.kind).toBe('document');
    expect(pdf.pages).toBe(3);
    expect(pdf.url).toMatch(/\.pdf$/);
    expect(await fetchStatus(pdf.url)).toBe(200);
  });
});

describe('o que acontece com um envio falsificado ou adulterado', () => {
  it('recusa uma resposta que não foi assinada pelo Cloudinary', async () => {
    const { client } = await asAdmin();
    const file = pngFile(1600, 900);

    const upload = await signUpload(client, 'cover');
    const cloud = await sendToCloudinary(upload, file);

    const forged = { ...registration('cover', cloud.body, file.name), signature: 'a'.repeat(40) };
    const response = await client.post('/api/media').send(forged).expect(422);

    expect(response.body.error.message).toBe('This upload could not be verified.');
  });

  it('recusa um envio verdadeiro registrado para outra finalidade', async () => {
    const { client } = await asAdmin();
    const file = pngFile(1600, 900);

    // Uploaded as a photo inside the text, presented as a cover.
    const upload = await signUpload(client, 'body');
    const cloud = await sendToCloudinary(upload, file);

    await client.post('/api/media').send(registration('cover', cloud.body, file.name)).expect(422);
  });

  it('não deixa mudar um campo assinado no caminho até o Cloudinary', async () => {
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

  it('não deixa mandar PDF onde se espera imagem', async () => {
    const { client } = await asAdmin();
    const upload = await signUpload(client, 'cover');

    const cloud = await sendToCloudinary(upload, pdfFile(1, 'not-a-photo.pdf'));

    expect(cloud.status).toBe(400);
    expect(cloud.body.error.message).toContain('not allowed');
  });

  it('recusa SVG, que pode carregar código', async () => {
    const { client } = await asAdmin();

    const upload = await signUpload(client, 'cover');
    const cloud = await sendToCloudinary(upload, svgFile());

    expect(cloud.status).toBe(400);
    expect(cloud.body.error.message).toContain('not allowed');
  });

  it('apaga do Cloudinary uma imagem pequena demais para capa', async () => {
    const { client } = await asAdmin();
    const file = pngFile(80, 60);

    const upload = await signUpload(client, 'cover');
    const cloud = await sendToCloudinary(upload, file);
    const response = await client
      .post('/api/media')
      .send(registration('cover', cloud.body, file.name))
      .expect(422);

    expect(response.body.error.fields.file).toBe('Use an image at least 100px wide.');
    expect(await fetchStatus(cloud.body.secure_url)).toBe(404);
    expect(await prisma.media.count()).toBe(0);
  });
});

describe('importar imagem por link', () => {
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

  it('copia a imagem para o Cloudinary', async () => {
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

  it('explica quando o link não leva a uma imagem', async () => {
    const { client } = await asAdmin();

    const response = await client
      .post('/api/media/import')
      .send({ purpose: 'cover', url: `${siteUrl}/nothing-here.jpg` })
      .expect(422);

    expect(response.body.error.fields).toHaveProperty('url');
  });
});

describe('apagar um arquivo', () => {
  it('apaga do Cloudinary também um arquivo sem uso', async () => {
    const { client } = await asAdmin();
    const media = await uploadMedia(client, 'cover', pngFile(1600, 900));

    await client.delete(`/api/media/${media.id}`).expect(204);

    expect(await prisma.media.findUnique({ where: { id: media.id } })).toBeNull();
    expect(await fetchStatus(media.url)).toBe(404);
  });

  it('recusa enquanto uma matéria usa o arquivo', async () => {
    const { admin, client } = await asAdmin();
    const writer = await makeWriter();
    const category = await makeCategory();
    const post = await makeNews({ authorId: writer.id, createdById: admin.id, categoryId: category.id });

    const response = await client.delete(`/api/media/${post.coverId}`).expect(409);

    expect(response.body.error.message).toContain('still in use');
  });

  it('é só para o admin', async () => {
    const { user } = await makeColumnist();
    const { client } = await loginAs(user.email);
    const media = await uploadMedia(client, 'cover', pngFile(1600, 900));

    await client.delete(`/api/media/${media.id}`).expect(403);
  });
});
