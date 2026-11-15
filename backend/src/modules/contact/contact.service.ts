import { env } from '../../config/env';
import { ServiceUnavailable } from '../../shared/errors/AppError';
import { escapeHtml, layout, sendMail } from '../../shared/mail/mailer';
import { logger } from '../../shared/utils/logger';
import { CONTACT_SUBJECTS, type ContactInput } from './contact.schemas';

// The contact form. Nothing is stored: the message goes by e-mail to the
// newsroom (CONTACT_EMAIL, or MAIL_FROM), with "Responder" pointing at the
// reader. The privacy policy (/privacidade) says exactly this.
export class ContactService {
  recipient(): string {
    return env.CONTACT_EMAIL ?? env.MAIL_FROM ?? 'redacao@portal.local';
  }

  async send(input: ContactInput): Promise<void> {
    // A robot filled the hidden field. It gets the same "sent" as a person,
    // so it has no reason to try again differently.
    if (input.website?.trim()) {
      logger.info('Contact form: message dropped by the robot trap.');
      return;
    }

    const subject = CONTACT_SUBJECTS[input.subject];
    const lines = input.message.split('\n').map(escapeHtml).join('<br>');

    const sent = await sendMail({
      to: { email: this.recipient(), name: 'Redação' },
      replyTo: { email: input.email, name: input.name },
      subject: `[Contato] ${subject}: ${input.name}`,
      text: `Mensagem enviada pelo formulário de contato do site.\n\nNome: ${input.name}\nE-mail: ${input.email}\nAssunto: ${subject}\n\n${input.message}\n\nPara responder, use "Responder": a resposta vai direto para ${input.email}.`,
      html: layout(
        `Contato: ${escapeHtml(subject)}`,
        `<p style="margin:0 0 4px"><strong>Nome:</strong> ${escapeHtml(input.name)}</p>
<p style="margin:0 0 16px"><strong>E-mail:</strong> ${escapeHtml(input.email)}</p>
<div style="border-left:3px solid #1e3270;padding:4px 0 4px 12px;line-height:1.5">${lines}</div>
<p style="font-size:14px;color:#586377;margin-top:20px">Enviada pelo formulário de contato do site. Use "Responder": a resposta vai direto para quem escreveu.</p>`,
      ),
    });

    if (!sent) {
      throw new ServiceUnavailable('The message could not be sent. Try again later or write to the e-mail on the page.');
    }
  }
}

export const contactService = new ContactService();
