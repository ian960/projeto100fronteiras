import type { Request, Response } from 'express';
import { noContent, ok, paginated } from '../../shared/http/response';
import { Unauthenticated } from '../../shared/errors/AppError';
import { usersService } from './users.service';
import {
  listUsersSchema,
  promoteUserSchema,
  resetPasswordSchema,
  updateUserSchema,
  userIdParamSchema,
} from './users.schemas';

function requireUser(req: Request) {
  if (!req.user) throw new Unauthenticated();
  return req.user;
}

export class UsersController {
  list = async (req: Request, res: Response) => {
    const parsed = listUsersSchema.parse({ query: req.query });
    const result = await usersService.list(parsed.query);
    return paginated(res, result);
  };

  getById = async (req: Request, res: Response) => {
    const parsed = userIdParamSchema.parse({ params: req.params });
    const user = await usersService.getById(parsed.params.id);
    return ok(res, { user });
  };

  promote = async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const parsed = promoteUserSchema.parse({ params: req.params, body: req.body });
    const user = await usersService.promoteToColumnist(actor, parsed.params.id, parsed.body);
    return ok(res, { user });
  };

  update = async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const parsed = updateUserSchema.parse({ params: req.params, body: req.body });
    const user = await usersService.update(actor.id, parsed.params.id, parsed.body);
    return ok(res, { user });
  };

  resetPassword = async (req: Request, res: Response) => {
    const parsed = resetPasswordSchema.parse({ params: req.params, body: req.body });
    await usersService.resetPassword(parsed.params.id, parsed.body.newPassword);
    return noContent(res);
  };
}

export const usersController = new UsersController();
