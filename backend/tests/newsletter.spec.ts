import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/config/prisma';
import { outbox } from '../src/shared/mail/mailer';
import * as mailer from '../src/shared/mail/mailer';
import { newsletterService } from '../src/modules/newsletter/newsletter.service';
import { agent, loginAs } from './helpers/agent';
import { makeAdmin, makeCategory, makeNews, makeUser, makeWriter } from './factories';

// The newsletter: opt-in only, confirmed by e-mail, a one-click way out in
// every message, and a queue that respects the daily limit of the mail service.

const linkToken = (text: string, path: string) => {
  const match = text.match(new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`));
  if (!match) throw new Error(`No ${path} link in: ${text}`);
  return match[1]!;
};

async function subscribeAndConfirm(email: string) {
  outbox.length = 0;
  await agent().post('/api/newsletter/subscribe').send({ email }).expect(204);
  const token = linkToken(outbox.at(-1)!.text, '/newsletter/confirmar');
  await agent().post('/api/newsletter/confirm').send({ token }).expect(200);
}

async function publishedNews(adminId: string, overrides: Record<string, unknown> = {}) {
  const writer = await makeWriter();
  const category = await makeCategory();
  return makeNews(
    { authorId: writer.id, createdById: adminId, categoryId: category.id },
    { status: 'published', publishedAt: new Date(), ...overrides },
  );
}

beforeEach(() => {
  outbox.length = 0;
  newsletterService.dailyLimit = 250;
});

afterEach(async () => {
  await newsletterService.whenIdle();
  vi.restoreAllMocks();
});

describe('inscrição pelo site (double opt-in)', () => {
  it('manda o link de confirmação e só vale depois do clique', async () => {
    await agent().post('/api/newsletter/subscribe').send({ email: 'Leitora@Email.com' }).expect(204);

    const row = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email: 'leitora@email.com' } });
    expect(row.status).toBe('pending');
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.to.email).toBe('leitora@email.com');

    const token = linkToken(outbox[0]!.text, '/newsletter/confirmar');
    const response = await agent().post('/api/newsletter/confirm').send({ token }).expect(200);
    expect(response.body.data.email).toBe('leitora@email.com');

    const after = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email: 'leitora@email.com' } });
    expect(after.status).toBe('active');
    expect(after.confirmedAt).not.toBeNull();
  });

  it('abrir o link de confirmação duas vezes não dá erro', async () => {
    await agent().post('/api/newsletter/subscribe').send({ email: 'a@b.com' }).expect(204);
    const token = linkToken(outbox[0]!.text, '/newsletter/confirmar');
    await agent().post('/api/newsletter/confirm').send({ token }).expect(200);
    await agent().post('/api/newsletter/confirm').send({ token }).expect(200);
  });

  it('recusa um link de confirmação inventado ou vencido', async () => {
    await agent().post('/api/newsletter/confirm').send({ token: 'x'.repeat(43) }).expect(422);

    await agent().post('/api/newsletter/subscribe').send({ email: 'velho@b.com' }).expect(204);
    const token = linkToken(outbox[0]!.text, '/newsletter/confirmar');
    await prisma.newsletterSubscriber.update({
      where: { email: 'velho@b.com' },
      data: { confirmSentAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
    });
    await agent().post('/api/newsletter/confirm').send({ token }).expect(422);
  });

  it('pedir de novo em seguida não manda outro e-mail (ninguém enche a caixa de alguém)', async () => {
    await agent().post('/api/newsletter/subscribe').send({ email: 'a@b.com' }).expect(204);
    await agent().post('/api/newsletter/subscribe').send({ email: 'a@b.com' }).expect(204);
    expect(outbox).toHaveLength(1);
  });

  it('quem já está inscrito recebe a mesma resposta e nenhum e-mail', async () => {
    await subscribeAndConfirm('a@b.com');
    outbox.length = 0;
    await agent().post('/api/newsletter/subscribe').send({ email: 'a@b.com' }).expect(204);
    expect(outbox).toHaveLength(0);
  });

  it('o campo escondido preenchido (robô) responde igual e não grava nada', async () => {
    await agent().post('/api/newsletter/subscribe').send({ email: 'a@b.com', website: 'x' }).expect(204);
    expect(outbox).toHaveLength(0);
    expect(await prisma.newsletterSubscriber.count()).toBe(0);
  });

  it('recusa um e-mail inválido', async () => {
    await agent().post('/api/newsletter/subscribe').send({ email: 'não é e-mail' }).expect(422);
  });
});

describe('descadastro', () => {
  it('o link do e-mail descadastra sem login, e pode ser aberto de novo', async () => {
    await subscribeAndConfirm('a@b.com');
    const { unsubscribeToken } = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email: 'a@b.com' } });

    await agent().post('/api/newsletter/unsubscribe').send({ token: unsubscribeToken }).expect(200);
    await agent().post('/api/newsletter/unsubscribe').send({ token: unsubscribeToken }).expect(200);

    const row = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email: 'a@b.com' } });
    expect(row.status).toBe('unsubscribed');
  });

  it('o botão "Cancelar inscrição" do Gmail (one-click) também descadastra', async () => {
    await subscribeAndConfirm('a@b.com');
    const { unsubscribeToken } = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email: 'a@b.com' } });

    await agent()
      .post(`/api/newsletter/unsubscribe/one-click?token=${unsubscribeToken}`)
      .type('form')
      .send('List-Unsubscribe=One-Click')
      .expect(204);

    expect((await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email: 'a@b.com' } })).status).toBe('unsubscribed');
  });

  it('um link de descadastro inventado dá 404', async () => {
    await agent().post('/api/newsletter/unsubscribe').send({ token: 'y'.repeat(43) }).expect(404);
  });

  it('quem saiu e se inscreve de novo precisa confirmar de novo', async () => {
    await subscribeAndConfirm('a@b.com');
    const { unsubscribeToken } = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email: 'a@b.com' } });
    await agent().post('/api/newsletter/unsubscribe').send({ token: unsubscribeToken }).expect(200);

    outbox.length = 0;
    await agent().post('/api/newsletter/subscribe').send({ email: 'a@b.com' }).expect(204);
    expect((await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email: 'a@b.com' } })).status).toBe('pending');
    expect(outbox).toHaveLength(1);
  });
});

describe('Minha conta', () => {
  it('começa desligada: ninguém é inscrito sem pedir', async () => {
    const user = await makeUser();
    const { client } = await loginAs(user.email);
    const response = await client.get('/api/newsletter/me').expect(200);
    expect(response.body.data.status).toBe('none');
  });

  it('conta com senha: ligar manda o e-mail de confirmação; desligar sai na hora', async () => {
    const user = await makeUser();
    const { client } = await loginAs(user.email);

    const on = await client.put('/api/newsletter/me').send({ subscribed: true }).expect(200);
    expect(on.body.data.status).toBe('pending');
    expect(outbox.at(-1)!.to.email).toBe(user.email);

    const token = linkToken(outbox.at(-1)!.text, '/newsletter/confirmar');
    await agent().post('/api/newsletter/confirm').send({ token }).expect(200);
    expect((await client.get('/api/newsletter/me').expect(200)).body.data.status).toBe('active');

    const off = await client.put('/api/newsletter/me').send({ subscribed: false }).expect(200);
    expect(off.body.data.status).toBe('unsubscribed');
  });

  it('conta do Google (e-mail já verificado): liga direto, sem e-mail de confirmação', async () => {
    const user = await makeUser({ googleId: 'google-sub-9' });
    const { client } = await loginAs(user.email);

    const on = await client.put('/api/newsletter/me').send({ subscribed: true }).expect(200);
    expect(on.body.data.status).toBe('active');
    expect(outbox).toHaveLength(0);
  });

  it('precisa estar logado', async () => {
    await agent().get('/api/newsletter/me').expect(401);
    await agent().put('/api/newsletter/me').send({ subscribed: true }).expect(401);
  });

  it('a caixa do cadastro, marcada, manda a confirmação; desmarcada, nada', async () => {
    await agent().post('/api/auth/register').send({ name: 'Sem News', email: 'sem@b.com', password: 'senha12345' }).expect(201);
    expect(outbox).toHaveLength(0);

    await agent()
      .post('/api/auth/register')
      .send({ name: 'Com News', email: 'com@b.com', password: 'senha12345', newsletter: true })
      .expect(201);
    expect(outbox).toHaveLength(1);
    expect((await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email: 'com@b.com' } })).status).toBe('pending');
  });

  it('excluir a conta apaga a inscrição', async () => {
    const user = await makeUser({ googleId: 'google-sub-10' });
    const { client } = await loginAs(user.email);
    await client.put('/api/newsletter/me').send({ subscribed: true }).expect(200);

    await client.delete('/api/auth/me').send({ password: 'senha12345' }).expect(204);
    expect(await prisma.newsletterSubscriber.count({ where: { email: user.email } })).toBe(0);
  });
});

describe('envio pelo painel', () => {
  it('só o admin', async () => {
    const reader = await makeUser();
    const { client } = await loginAs(reader.email);
    await client.get('/api/admin/newsletter').expect(403);
    await agent().get('/api/admin/newsletter').expect(401);
  });

  it('manda a matéria escolhida para cada inscrito ativo, com o link de descadastro de cada um', async () => {
    const admin = await makeAdmin();
    const post = await publishedNews(admin.id, { title: 'Ponte <reaberta>' });
    await subscribeAndConfirm('um@b.com');
    await subscribeAndConfirm('dois@b.com');
    await agent().post('/api/newsletter/subscribe').send({ email: 'pendente@b.com' }).expect(204);

    const { client } = await loginAs(admin.email);
    outbox.length = 0;
    const created = await client
      .post('/api/admin/newsletter/issues')
      .send({ subject: 'Resumo da semana', intro: 'Olá!', postIds: [post.id] })
      .expect(201);
    expect(created.body.data.recipients).toBe(2);

    await newsletterService.whenIdle();

    expect(outbox.map((mail) => mail.to.email).sort()).toEqual(['dois@b.com', 'um@b.com']);
    for (const mail of outbox) {
      const row = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email: mail.to.email } });
      expect(mail.subject).toBe('Resumo da semana');
      expect(mail.html).toContain(`/newsletter/sair?token=${row.unsubscribeToken}`);
      expect(mail.text).toContain(`/newsletter/sair?token=${row.unsubscribeToken}`);
      expect(mail.headers?.['List-Unsubscribe']).toContain(`/api/newsletter/unsubscribe/one-click?token=${row.unsubscribeToken}`);
      expect(mail.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
      expect(mail.html).toContain(`/noticia/${post.slug}?utm_source=newsletter`);
      expect(mail.html).toContain('Ponte &#60;reaberta&#62;');
      expect(mail.html).not.toContain('%%DESCADASTRAR%%');
    }

    const overview = await client.get('/api/admin/newsletter').expect(200);
    expect(overview.body.data.subscribers).toEqual({ active: 2, pending: 1, unsubscribed: 0 });
    expect(overview.body.data.issues[0]).toMatchObject({ subject: 'Resumo da semana', total: 2, sent: 2, pending: 0 });
  });

  it('respeita o limite diário: o resto espera na fila e sai depois', async () => {
    const admin = await makeAdmin();
    const post = await publishedNews(admin.id);
    for (const name of ['a', 'b', 'c']) await subscribeAndConfirm(`${name}@b.com`);

    newsletterService.dailyLimit = 2;
    const { client } = await loginAs(admin.email);
    outbox.length = 0;
    await client.post('/api/admin/newsletter/issues').send({ subject: 'Hoje', postIds: [post.id] }).expect(201);
    await newsletterService.whenIdle();

    expect(outbox).toHaveLength(2);
    const overview = await client.get('/api/admin/newsletter').expect(200);
    expect(overview.body.data).toMatchObject({ sentLast24h: 2, queued: 1, dailyLimit: 2 });

    // A day later the window frees up and the next round sends the rest.
    await prisma.newsletterDelivery.updateMany({
      where: { status: 'sent' },
      data: { sentAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });
    newsletterService.kick();
    await newsletterService.whenIdle();
    expect(outbox).toHaveLength(3);
  });

  it('quem sai antes da sua vez não recebe', async () => {
    const admin = await makeAdmin();
    const post = await publishedNews(admin.id);
    await subscribeAndConfirm('a@b.com');
    await subscribeAndConfirm('b@b.com');

    newsletterService.dailyLimit = 1;
    const { client } = await loginAs(admin.email);
    outbox.length = 0;
    await client.post('/api/admin/newsletter/issues').send({ subject: 'Hoje', postIds: [post.id] }).expect(201);
    await newsletterService.whenIdle();
    expect(outbox).toHaveLength(1);

    const waiting = outbox[0]!.to.email === 'a@b.com' ? 'b@b.com' : 'a@b.com';
    const { unsubscribeToken } = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email: waiting } });
    await agent().post('/api/newsletter/unsubscribe').send({ token: unsubscribeToken }).expect(200);

    newsletterService.dailyLimit = 250;
    newsletterService.kick();
    await newsletterService.whenIdle();
    expect(outbox).toHaveLength(1);
  });

  it('cancelar para o que ainda não saiu', async () => {
    const admin = await makeAdmin();
    const post = await publishedNews(admin.id);
    await subscribeAndConfirm('a@b.com');
    await subscribeAndConfirm('b@b.com');

    newsletterService.dailyLimit = 1;
    const { client } = await loginAs(admin.email);
    const created = await client.post('/api/admin/newsletter/issues').send({ subject: 'Hoje', postIds: [post.id] }).expect(201);
    await newsletterService.whenIdle();

    const cancelled = await client.post(`/api/admin/newsletter/issues/${created.body.data.id}/cancel`).expect(200);
    expect(cancelled.body.data.cancelled).toBe(1);
    expect(await prisma.newsletterDelivery.count({ where: { status: 'pending' } })).toBe(0);
  });

  it('o serviço de e-mail fora do ar: para depois de três recusas, e o que não saiu continua na fila', async () => {
    const admin = await makeAdmin();
    const post = await publishedNews(admin.id);
    for (const name of ['a', 'b', 'c', 'd']) await subscribeAndConfirm(`${name}@b.com`);

    const { client } = await loginAs(admin.email);
    const spy = vi.spyOn(mailer, 'sendMail').mockResolvedValue(false);
    await client.post('/api/admin/newsletter/issues').send({ subject: 'Hoje', postIds: [post.id] }).expect(201);
    await newsletterService.whenIdle();

    expect(spy).toHaveBeenCalledTimes(3);
    expect(await prisma.newsletterDelivery.count({ where: { status: 'pending' } })).toBe(4);
    expect(await prisma.newsletterDelivery.count({ where: { status: 'sent' } })).toBe(0);
  });

  it('sem inscritos, não cria o envio', async () => {
    const admin = await makeAdmin();
    const post = await publishedNews(admin.id);
    const { client } = await loginAs(admin.email);
    await client.post('/api/admin/newsletter/issues').send({ subject: 'Hoje', postIds: [post.id] }).expect(422);
  });

  it('recusa matérias que não estão publicadas', async () => {
    const admin = await makeAdmin();
    const draft = await publishedNews(admin.id, { status: 'draft', publishedAt: null });
    await subscribeAndConfirm('a@b.com');
    const { client } = await loginAs(admin.email);
    await client.post('/api/admin/newsletter/issues').send({ subject: 'Hoje', postIds: [draft.id] }).expect(422);
  });

  it('teste vai só para o e-mail do admin; a prévia devolve o HTML', async () => {
    const admin = await makeAdmin();
    const post = await publishedNews(admin.id, { title: 'Feira no domingo' });
    await subscribeAndConfirm('a@b.com');
    const { client } = await loginAs(admin.email);
    outbox.length = 0;

    const preview = await client.post('/api/admin/newsletter/preview').send({ subject: 'Hoje', postIds: [post.id] }).expect(200);
    expect(preview.body.data.html).toContain('Feira no domingo');

    const test = await client.post('/api/admin/newsletter/test').send({ subject: 'Hoje', postIds: [post.id] }).expect(200);
    expect(test.body.data.email).toBe(admin.email);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.to.email).toBe(admin.email);
    expect(outbox[0]!.subject).toBe('[Teste] Hoje');
    expect(await prisma.newsletterIssue.count()).toBe(0);
  });

  it('lista as matérias publicadas para escolher', async () => {
    const admin = await makeAdmin();
    const post = await publishedNews(admin.id);
    await publishedNews(admin.id, { status: 'draft', publishedAt: null });
    const { client } = await loginAs(admin.email);
    const response = await client.get('/api/admin/newsletter/posts').expect(200);
    expect(response.body.data.map((item: { id: string }) => item.id)).toEqual([post.id]);
    expect(response.body.data[0].category).toMatch(/^Category /);
  });
});
