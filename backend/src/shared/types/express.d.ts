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
    // Between "Entrar com Google" and Google sending the reader back: what the
    // callback checks the answer against (modules/auth/auth.google.ts).
    googleLogin?: {
      state: string;
      nonce: string;
      verifier: string;
      next: string | null;
      startedAt: number;
    };
  }
}

export {};
