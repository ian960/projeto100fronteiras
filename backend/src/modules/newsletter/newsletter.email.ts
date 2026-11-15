import { env } from '../../config/env';
import { escapeHtml, layout, type Mail } from '../../shared/mail/mailer';
import type { IPostListItem } from '../posts/posts.types';

// Where each reader's own "Descadastrar" link goes in a stored issue.
export const UNSUBSCRIBE_PLACEHOLDER = '%%DESCADASTRAR%%';

export function unsubscribePageUrl(token: string): string {
  return `${env.SITE_URL}/newsletter/sair?token=${encodeURIComponent(token)}`;
}

// What Gmail and Outlook call when the reader presses their own "Cancelar
// inscrição" button (RFC 8058): a POST, no page, no login.
export function oneClickUrl(token: string): string {
  return `${env.SITE_URL}/api/newsletter/unsubscribe/one-click?token=${encodeURIComponent(token)}`;
}

export function confirmationMail(email: string, token: string): Mail {
  const link = `${env.SITE_URL}/newsletter/confirmar?token=${encodeURIComponent(token)}`;
  return {
    to: { email },
    subject: 'Confirme sua inscrição na newsletter',
    text: `Recebemos um pedido para enviar a newsletter do Portal100Fronteiras para este e-mail.\n\nPara confirmar, abra o link abaixo:\n${link}\n\nSe não foi você, ignore esta mensagem: sem a confirmação, nada será enviado.`,
    html: layout(
      'Confirme sua inscrição',
      `<p style="line-height:1.5;margin:0 0 20px">Recebemos um pedido para enviar a newsletter do Portal100Fronteiras para este e-mail. Para confirmar, clique no botão:</p>
<p style="margin:0 0 20px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#1e3270;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold">Confirmar inscrição</a></p>
<p style="font-size:14px;color:#586377;line-height:1.5;margin:0">Se não foi você, ignore esta mensagem: sem a confirmação, nada será enviado.</p>`,
    ),
  };
}

const postPath = (post: Pick<IPostListItem, 'type' | 'slug'>) =>
  `/${post.type === 'column' ? 'coluna' : 'noticia'}/${post.slug}`;

// Lets Google Analytics show how many readers came from the newsletter.
function postUrl(post: Pick<IPostListItem, 'type' | 'slug'>): string {
  return `${env.SITE_URL}${postPath(post)}?utm_source=newsletter&utm_medium=email`;
}

function label(post: IPostListItem): string {
  if (post.type === 'column') return post.author?.name ? `Coluna · ${post.author.name}` : 'Coluna';
  return post.category?.name ?? 'Notícia';
}

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => `<p style="line-height:1.55;margin:0 0 14px">${block.split('\n').map(escapeHtml).join('<br>')}</p>`)
    .join('\n');
}

// The newsletter itself, built once when the admin sends it. Plain tables and
// inline styles: e-mail apps ignore most of the CSS a web page can use.
export function renderIssue(input: { subject: string; intro: string | null; posts: IPostListItem[] }): {
  html: string;
  text: string;
} {
  const stories = input.posts
    .map((post) => {
      const url = escapeHtml(postUrl(post));
      // 1200×630 JPEG: every e-mail app shows it (WebP is not safe here).
      const image = post.cover?.shareUrl
        ? `<a href="${url}"><img src="${escapeHtml(post.cover.shareUrl)}" width="552" alt="${escapeHtml(post.coverAlt ?? '')}" style="display:block;width:100%;max-width:552px;height:auto;border:0;border-radius:6px;margin:0 0 12px"></a>`
        : '';
      return `<tr><td style="padding:0 0 28px">
${image}<p style="font-size:12px;font-weight:bold;letter-spacing:.04em;text-transform:uppercase;color:#a33a1f;margin:0 0 6px">${escapeHtml(label(post))}</p>
<a href="${url}" style="font-size:20px;line-height:1.3;font-weight:bold;color:#141b2c;text-decoration:none">${escapeHtml(post.title)}</a>
${post.excerpt ? `<p style="font-size:15px;line-height:1.5;color:#3a4458;margin:8px 0 0">${escapeHtml(post.excerpt)}</p>` : ''}
<p style="margin:10px 0 0"><a href="${url}" style="font-size:14px;font-weight:bold;color:#1e3270">Ler no portal →</a></p>
</td></tr>`;
    })
    .join('\n');

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.subject)}</title></head>
<body style="margin:0;background:#f2f4f8;font-family:Arial,Helvetica,sans-serif;color:#141b2c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f8"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
<tr><td style="padding:0 4px 18px"><a href="${escapeHtml(env.SITE_URL)}" style="font-size:22px;font-weight:bold;color:#1e3270;text-decoration:none">Portal100Fronteiras</a></td></tr>
<tr><td style="background:#ffffff;border-radius:8px;padding:24px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${input.intro ? `<tr><td style="padding:0 0 12px;font-size:16px">${paragraphs(input.intro)}</td></tr>` : ''}
${stories}
</table>
</td></tr>
<tr><td style="padding:18px 4px;font-size:12px;line-height:1.5;color:#586377">
Você recebe este e-mail porque se inscreveu na newsletter do Portal100Fronteiras.<br>
Não quer mais receber? <a href="${UNSUBSCRIBE_PLACEHOLDER}" style="color:#586377">Descadastre-se com um clique</a>. Também dá para desligar em Minha conta, no site.
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    'Portal100Fronteiras',
    '',
    ...(input.intro ? [input.intro, ''] : []),
    ...input.posts.flatMap((post) => [
      `${label(post).toUpperCase()}: ${post.title}`,
      ...(post.excerpt ? [post.excerpt] : []),
      postUrl(post),
      '',
    ]),
    '---',
    'Você recebe este e-mail porque se inscreveu na newsletter do Portal100Fronteiras.',
    `Para não receber mais: ${UNSUBSCRIBE_PLACEHOLDER}`,
  ].join('\n');

  return { html, text };
}

// One reader's copy: their own unsubscribe link, in the text and in the
// headers the mail apps read.
export function personalize(issue: { subject: string; html: string; text: string }, email: string, token: string): Mail {
  const page = unsubscribePageUrl(token);
  return {
    to: { email },
    subject: issue.subject,
    html: issue.html.split(UNSUBSCRIBE_PLACEHOLDER).join(escapeHtml(page)),
    text: issue.text.split(UNSUBSCRIBE_PLACEHOLDER).join(page),
    headers: {
      'List-Unsubscribe': `<${oneClickUrl(token)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}
