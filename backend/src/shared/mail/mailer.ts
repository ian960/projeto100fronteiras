import { env, isProduction, isTest } from '../../config/env';
import { logger } from '../utils/logger';

// Every e-mail the API sends goes through sendMail(). Which service delivers
// it is configuration only (MAIL_PROVIDER), so moving from Brevo to Resend
// when the portal gets its own domain changes no code.

export type Mail = {
  to: { email: string; name?: string };
  subject: string;
  text: string;
  html: string;
};

// What the "log" provider "sent". The tests read the links from here.
export const outbox: Mail[] = [];

export function isMailConfigured(): boolean {
  return env.MAIL_PROVIDER !== 'log';
}

async function brevo(mail: Mail): Promise<void> {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.MAIL_API_KEY!, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: env.MAIL_FROM_NAME, email: env.MAIL_FROM },
      to: [{ email: mail.to.email, ...(mail.to.name ? { name: mail.to.name } : {}) }],
      subject: mail.subject,
      textContent: mail.text,
      htmlContent: mail.html,
    }),
  });
  if (!response.ok) throw new Error(`Brevo answered ${response.status}: ${await response.text()}`);
}

// Development inbox (docker compose): http://localhost:8025 shows the message.
async function mailpit(mail: Mail): Promise<void> {
  const response = await fetch(`${env.MAILPIT_URL}/api/v1/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      From: { Email: env.MAIL_FROM ?? 'nao-responda@portal.local', Name: env.MAIL_FROM_NAME },
      To: [{ Email: mail.to.email, Name: mail.to.name ?? '' }],
      Subject: mail.subject,
      Text: mail.text,
      HTML: mail.html,
    }),
  });
  if (!response.ok) throw new Error(`Mailpit answered ${response.status}: ${await response.text()}`);
}

async function resend(mail: Mail): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.MAIL_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: `${env.MAIL_FROM_NAME} <${env.MAIL_FROM}>`,
      to: [mail.to.email],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    }),
  });
  if (!response.ok) throw new Error(`Resend answered ${response.status}: ${await response.text()}`);
}

// Never throws: a mail service hiccup must not turn "esqueci minha senha"
// into an error page that also tells a stranger the address has an account.
export async function sendMail(mail: Mail): Promise<void> {
  try {
    if (env.MAIL_PROVIDER === 'brevo') return await brevo(mail);
    if (env.MAIL_PROVIDER === 'resend') return await resend(mail);
    if (env.MAIL_PROVIDER === 'mailpit') return await mailpit(mail);

    outbox.push(mail);
    if (outbox.length > 50) outbox.shift();
    // Development: the link is right here, in `docker compose logs api`.
    if (!isTest) {
      logger.info(`E-mail not sent (MAIL_PROVIDER=log) to ${mail.to.email}: ${mail.subject}`, { text: mail.text });
    }
    if (isProduction) logger.warn('MAIL_PROVIDER is not set in production: this e-mail never left the server.');
  } catch (err) {
    logger.error('Could not send an e-mail', { err, to: mail.to.email, subject: mail.subject });
  }
}

// The little HTML every message shares. Plain and readable in any client.
export function layout(title: string, body: string): string {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f2f4f8;font-family:Arial,sans-serif;color:#141b2c">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<p style="font-size:20px;font-weight:bold;color:#1e3270;margin:0 0 24px">Portal100Fronteiras</p>
<div style="background:#fff;border-radius:8px;padding:24px">
<h1 style="font-size:18px;margin:0 0 16px">${title}</h1>
${body}
</div>
<p style="font-size:12px;color:#586377;margin-top:16px">Você recebeu este e-mail porque alguém usou este endereço no Portal100Fronteiras.</p>
</div></body></html>`;
}

// Names come from users: never put them into HTML unescaped.
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
