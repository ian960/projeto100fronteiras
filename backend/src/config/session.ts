import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { pool } from './prisma';
import { env, isProduction } from './env';

const PgStore = connectPgSimple(session);

export function sessionMiddleware() {
  return session({
    name: 'portal.sid',
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: new PgStore({
      pool,
      tableName: 'session',
      // Prisma owns this table (see the Session model in schema.prisma).
      createTableIfMissing: false,
      pruneSessionInterval: 60 * 15,
    }),
    cookie: {
      httpOnly: true,
      // Never readable by JavaScript, so an XSS in the editor cannot steal it.
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  });
}
