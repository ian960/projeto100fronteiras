import { beforeEach, describe, expect, it } from 'vitest';
import { outbox } from '../src/shared/mail/mailer';
import { contactService } from '../src/modules/contact/contact.service';
import { agent } from './helpers/agent';

// The form on /contato: an e-mail to the newsroom (the "log" provider keeps
// it in memory here), nothing stored in the database.

const valid = {
  name: 'Maria Souza',
  email: 'Maria@Email.com',
  subject: 'pauta',
  message: 'A ponte da avenida está sem iluminação há uma semana.',
};

beforeEach(() => {
  outbox.length = 0;
});

describe('formulário de contato', () => {
  it('manda a mensagem para a redação, com "Responder" para o leitor', async () => {
    await agent().post('/api/contact').send(valid).expect(204);

    expect(outbox).toHaveLength(1);
    const mail = outbox[0]!;
    expect(mail.to.email).toBe(contactService.recipient());
    expect(mail.replyTo).toEqual({ email: 'maria@email.com', name: 'Maria Souza' });
    expect(mail.subject).toBe('[Contato] Sugestão de pauta: Maria Souza');
    expect(mail.text).toContain('A ponte da avenida está sem iluminação há uma semana.');
  });

  it('não deixa HTML do leitor entrar no e-mail', async () => {
    await agent()
      .post('/api/contact')
      .send({ ...valid, name: '<b>Maria</b>', message: '<script>alert(1)</script> texto comprido' })
      .expect(204);

    expect(outbox[0]!.html).not.toContain('<script>');
    expect(outbox[0]!.html).toContain('&#60;script&#62;');
  });

  it('um nome com quebra de linha vira uma linha só', async () => {
    await agent().post('/api/contact').send({ ...valid, name: 'Maria\nBcc: x@y.z' }).expect(204);
    expect(outbox[0]!.subject).toBe('[Contato] Sugestão de pauta: Maria Bcc: x@y.z');
  });

  it('sem assunto, vai como "Outro assunto"', async () => {
    const { subject: _, ...withoutSubject } = valid;
    await agent().post('/api/contact').send(withoutSubject).expect(204);
    expect(outbox[0]!.subject).toContain('Outro assunto');
  });

  it('recusa campos faltando ou inválidos, sem mandar nada', async () => {
    const response = await agent()
      .post('/api/contact')
      .send({ name: 'M', email: 'não é e-mail', subject: 'qualquer', message: 'oi' })
      .expect(422);

    expect(Object.keys(response.body.error.fields).sort()).toEqual(['body.email', 'body.message', 'body.name', 'body.subject']);
    expect(outbox).toHaveLength(0);
  });

  it('o campo escondido preenchido (robô) responde igual, mas não manda nada', async () => {
    await agent().post('/api/contact').send({ ...valid, website: 'https://spam.example' }).expect(204);
    expect(outbox).toHaveLength(0);
  });
});
