import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/config/prisma';
import { isPushServiceUrl } from '../src/modules/push/push.schemas';
import { pushSender, type SendResult, type Target } from '../src/modules/push/push.sender';
import { pushService } from '../src/modules/push/push.service';
import type { PushPayload } from '../src/modules/push/push.types';
import { agent, loginAs } from './helpers/agent';
import { makeAdmin, makeCategory, makeNews, makeUser, makeWriter } from './factories';

// Push notifications: only browsers that asked, a way out that works without
// an account, a daily limit, and dead subscriptions cleaned up on their own.
// The sender is replaced here: nothing reaches Google or Apple.

const P256DH = 'B' + 'A'.repeat(86);
const AUTH = 'a'.repeat(22);
let counter = 0;
const endpoint = () => `https://fcm.googleapis.com/fcm/send/teste-${++counter}`;

function subscription(url = endpoint()) {
  return { endpoint: url, keys: { p256dh: P256DH, auth: AUTH } };
}

let sent: { target: Target; payload: PushPayload }[] = [];
let answer: (target: Target) => SendResult = () => 'sent';

async function publishedNews(adminId: string, overrides: Record<string, unknown> = {}) {
  const writer = await makeWriter();
  const category = await makeCategory();
  return makeNews(
    { authorId: writer.id, createdById: adminId, categoryId: category.id },
    { status: 'published', publishedAt: new Date(), ...overrides },
  );
}

async function adminWithStory() {
  const admin = await makeAdmin();
  const { client } = await loginAs(admin.email);
  const post = await publishedNews(admin.id, { title: 'Ponte interditada na BR' });
  return { admin, client, post };
}

beforeEach(() => {
  sent = [];
  answer = () => 'sent';
  pushService.dailyLimit = 5;
  vi.spyOn(pushSender, 'send').mockImplementation(async (target, payload) => {
    sent.push({ target, payload });
    return answer(target);
  });
});

afterEach(async () => {
  await pushService.whenIdle();
  vi.restoreAllMocks();
});

describe('configuração', () => {
  it('entrega a chave pública para o site', async () => {
    const response = await agent().get('/api/push/config').expect(200);
    expect(response.body.data.enabled).toBe(true);
    expect(response.body.data.publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/);
  });
});

describe('inscrição do navegador', () => {
  it('salva a inscrição sem precisar de conta, e uma segunda vez só atualiza', async () => {
    const sub = subscription();
    await agent().post('/api/push/subscribe').send(sub).expect(204);
    await agent()
      .post('/api/push/subscribe')
      .send({ ...sub, keys: { p256dh: 'B' + 'C'.repeat(86), auth: AUTH } })
      .expect(204);

    const rows = await prisma.pushSubscription.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.p256dh).toBe('B' + 'C'.repeat(86));
  });

  it('"Desativar" apaga a inscrição, e repetir não dá erro', async () => {
    const sub = subscription();
    await agent().post('/api/push/subscribe').send(sub).expect(204);
    await agent().post('/api/push/unsubscribe').send({ endpoint: sub.endpoint }).expect(204);
    await agent().post('/api/push/unsubscribe').send({ endpoint: sub.endpoint }).expect(204);
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it('recusa endereços que não são de um serviço de push', async () => {
    for (const url of [
      'http://fcm.googleapis.com/fcm/send/x',
      'https://localhost/x',
      'https://169.254.169.254/latest',
      'https://evil.com/fcm.googleapis.com',
      'https://googleapis.com.evil.com/x',
      'https://fcm.googleapis.com:8443/x',
    ]) {
      await agent().post('/api/push/subscribe').send(subscription(url)).expect(422);
    }
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it('aceita os serviços dos navegadores conhecidos', () => {
    expect(isPushServiceUrl('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isPushServiceUrl('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
    expect(isPushServiceUrl('https://web.push.apple.com/abc')).toBe(true);
    expect(isPushServiceUrl('https://wns2-bl2p.notify.windows.com/w/?token=abc')).toBe(true);
  });

  it('recusa chaves malformadas', async () => {
    await agent()
      .post('/api/push/subscribe')
      .send({ endpoint: endpoint(), keys: { p256dh: 'curta', auth: AUTH } })
      .expect(422);
  });
});

describe('envio pelo painel', () => {
  it('só o admin envia', async () => {
    const user = await makeUser();
    const { client } = await loginAs(user.email);
    await client.get('/api/admin/push').expect(403);
    await agent().get('/api/admin/push').expect(401);
  });

  it('envia a todos os inscritos, com o link da matéria', async () => {
    const { client, post } = await adminWithStory();
    for (let i = 0; i < 3; i++) await agent().post('/api/push/subscribe').send(subscription()).expect(204);

    const response = await client
      .post('/api/admin/push/notifications')
      .send({ postId: post.id, title: 'Urgente: ponte interditada', body: 'Trânsito desviado.' })
      .expect(201);
    expect(response.body.data.total).toBe(3);
    await pushService.whenIdle();

    expect(sent).toHaveLength(3);
    expect(sent[0]!.payload).toMatchObject({
      title: 'Urgente: ponte interditada',
      body: 'Trânsito desviado.',
      url: `/noticia/${post.slug}?utm_source=push&utm_medium=notificacao`,
      tag: `post-${post.id}`,
    });

    const row = await prisma.pushNotification.findUniqueOrThrow({ where: { id: response.body.data.id } });
    expect(row).toMatchObject({ status: 'done', total: 3, sent: 3, failed: 0, removed: 0 });

    const overview = await client.get('/api/admin/push').expect(200);
    expect(overview.body.data.subscriptions).toBe(3);
    expect(overview.body.data.sentLast24h).toBe(1);
    expect(overview.body.data.notifications[0].postTitle).toBe('Ponte interditada na BR');
  });

  it('apaga na hora as inscrições que o serviço diz que não existem mais (404/410)', async () => {
    const { client, post } = await adminWithStory();
    const dead = subscription();
    await agent().post('/api/push/subscribe').send(dead).expect(204);
    await agent().post('/api/push/subscribe').send(subscription()).expect(204);
    answer = (target) => (target.endpoint === dead.endpoint ? 'gone' : 'sent');

    const response = await client.post('/api/admin/push/notifications').send({ postId: post.id, title: 'Notícia' }).expect(201);
    await pushService.whenIdle();

    expect(await prisma.pushSubscription.findUnique({ where: { endpoint: dead.endpoint } })).toBeNull();
    expect(await prisma.pushSubscription.count()).toBe(1);
    const row = await prisma.pushNotification.findUniqueOrThrow({ where: { id: response.body.data.id } });
    expect(row).toMatchObject({ sent: 1, removed: 1 });
  });

  it('outros erros contam; depois de 5 seguidos a inscrição sai', async () => {
    const { client, admin } = await adminWithStory();
    const sub = subscription();
    await agent().post('/api/push/subscribe').send(sub).expect(204);
    await prisma.pushSubscription.update({ where: { endpoint: sub.endpoint }, data: { failures: 3 } });
    answer = () => 'error';

    const first = await publishedNews(admin.id);
    await client.post('/api/admin/push/notifications').send({ postId: first.id, title: 'Uma' }).expect(201);
    await pushService.whenIdle();
    expect((await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint: sub.endpoint } })).failures).toBe(4);

    const second = await publishedNews(admin.id);
    await client.post('/api/admin/push/notifications').send({ postId: second.id, title: 'Duas' }).expect(201);
    await pushService.whenIdle();
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it('um envio que deu certo zera a contagem de erros', async () => {
    const { client, post } = await adminWithStory();
    const sub = subscription();
    await agent().post('/api/push/subscribe').send(sub).expect(204);
    await prisma.pushSubscription.update({ where: { endpoint: sub.endpoint }, data: { failures: 4 } });

    await client.post('/api/admin/push/notifications').send({ postId: post.id, title: 'Notícia' }).expect(201);
    await pushService.whenIdle();
    const row = await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint: sub.endpoint } });
    expect(row.failures).toBe(0);
    expect(row.lastSentAt).not.toBeNull();
  });

  it('respeita o limite diário e não repete a mesma matéria em 24 horas', async () => {
    const { client, admin, post } = await adminWithStory();
    await agent().post('/api/push/subscribe').send(subscription()).expect(204);
    pushService.dailyLimit = 2;

    await client.post('/api/admin/push/notifications').send({ postId: post.id, title: 'Primeira' }).expect(201);
    await pushService.whenIdle();
    await client.post('/api/admin/push/notifications').send({ postId: post.id, title: 'De novo' }).expect(422);

    const other = await publishedNews(admin.id);
    await client.post('/api/admin/push/notifications').send({ postId: other.id, title: 'Segunda' }).expect(201);
    await pushService.whenIdle();

    const third = await publishedNews(admin.id);
    const response = await client.post('/api/admin/push/notifications').send({ postId: third.id, title: 'Terceira' }).expect(422);
    expect(response.body.error.message).toMatch(/limit of 2/);
  });

  it('não envia matéria em rascunho nem quando ninguém se inscreveu', async () => {
    const { client, admin, post } = await adminWithStory();
    await client.post('/api/admin/push/notifications').send({ postId: post.id, title: 'Notícia' }).expect(422);

    await agent().post('/api/push/subscribe').send(subscription()).expect(204);
    const draft = await publishedNews(admin.id, { status: 'draft', publishedAt: null });
    await client.post('/api/admin/push/notifications').send({ postId: draft.id, title: 'Rascunho' }).expect(404);
    expect(await prisma.pushNotification.count()).toBe(0);
  });

  it('quem se inscreve depois do envio não recebe aquela notificação', async () => {
    const { client, post } = await adminWithStory();
    await agent().post('/api/push/subscribe').send(subscription()).expect(204);
    const notification = await client.post('/api/admin/push/notifications').send({ postId: post.id, title: 'Notícia' }).expect(201);
    await pushService.whenIdle();

    // Rewound to "still sending", as if the server had restarted halfway.
    await prisma.pushNotification.update({ where: { id: notification.body.data.id }, data: { status: 'sending' } });
    await prisma.pushSubscription.create({
      data: { endpoint: endpoint(), p256dh: P256DH, auth: AUTH, createdAt: new Date(Date.now() + 60_000) },
    });
    sent = [];
    pushService.kick();
    await pushService.whenIdle();
    expect(sent).toHaveLength(0);
  });

  it('continua de onde parou depois de um reinício', async () => {
    const { client, post } = await adminWithStory();
    for (let i = 0; i < 4; i++) await agent().post('/api/push/subscribe').send(subscription()).expect(204);
    const ids = (await prisma.pushSubscription.findMany({ orderBy: { id: 'asc' } })).map((row) => row.id);

    const response = await client.post('/api/admin/push/notifications').send({ postId: post.id, title: 'Notícia' }).expect(201);
    await pushService.whenIdle();
    await prisma.pushNotification.update({
      where: { id: response.body.data.id },
      data: { status: 'sending', cursor: ids[1] },
    });
    sent = [];
    pushService.kick();
    await pushService.whenIdle();
    expect(sent.map((item) => item.target.endpoint).sort()).toEqual(
      (await prisma.pushSubscription.findMany({ where: { id: { in: ids.slice(2) } } })).map((row) => row.endpoint).sort(),
    );
  });

  it('o teste vai só para o navegador do admin e não conta no limite', async () => {
    const { client, post } = await adminWithStory();
    const mine = subscription();
    await agent().post('/api/push/subscribe').send(mine).expect(204);
    await agent().post('/api/push/subscribe').send(subscription()).expect(204);

    await client.post('/api/admin/push/test').send({ postId: post.id, title: 'Teste', endpoint: mine.endpoint }).expect(204);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.target.endpoint).toBe(mine.endpoint);
    expect(await prisma.pushNotification.count()).toBe(0);

    await client.post('/api/admin/push/test').send({ postId: post.id, title: 'Teste', endpoint: endpoint() }).expect(422);
  });
});
