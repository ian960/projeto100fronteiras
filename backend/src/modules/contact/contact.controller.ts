import type { Request, Response } from 'express';
import { noContent } from '../../shared/http/response';
import { contactSchema } from './contact.schemas';
import { contactService } from './contact.service';

export class ContactController {
  // POST /api/contact
  send = async (req: Request, res: Response) => {
    const parsed = contactSchema.parse({ body: req.body });
    await contactService.send(parsed.body);
    return noContent(res);
  };
}

export const contactController = new ContactController();
