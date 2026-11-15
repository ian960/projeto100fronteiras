import type { Request, Response } from 'express';
import { Unauthenticated } from '../../shared/errors/AppError';
import { created, noContent, ok } from '../../shared/http/response';
import { notificationSchema, subscribeSchema, testSchema, unsubscribeSchema } from './push.schemas';
import { pushService } from './push.service';

function requireUser(req: Request) {
  if (!req.user) throw new Unauthenticated();
  return req.user;
}

export class PushController {
  // GET /api/push/config: whether the button shows, and the public key.
  config = async (_req: Request, res: Response) => ok(res, pushService.config());

  // POST /api/push/subscribe (after the reader clicked and allowed)
  subscribe = async (req: Request, res: Response) => {
    const { body } = subscribeSchema.parse({ body: req.body });
    await pushService.subscribe(body);
    return noContent(res);
  };

  // POST /api/push/unsubscribe ("Desativar notificações")
  unsubscribe = async (req: Request, res: Response) => {
    const { body } = unsubscribeSchema.parse({ body: req.body });
    await pushService.unsubscribe(body.endpoint);
    return noContent(res);
  };

  // ── admin ───────────────────────────────────────────────────────────────

  overview = async (_req: Request, res: Response) => ok(res, await pushService.overview());

  send = async (req: Request, res: Response) => {
    const { body } = notificationSchema.parse({ body: req.body });
    return created(res, await pushService.send(requireUser(req).id, body));
  };

  test = async (req: Request, res: Response) => {
    const { body } = testSchema.parse({ body: req.body });
    await pushService.test(body);
    return noContent(res);
  };
}

export const pushController = new PushController();
