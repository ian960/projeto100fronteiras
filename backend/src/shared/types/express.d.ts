import type { SessionUser } from '../../modules/auth/auth.types';

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

export {};
