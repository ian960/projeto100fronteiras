export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(message: string, fields?: Record<string, string>) {
    super(message);
    this.name = this.constructor.name;
    this.fields = fields;
  }
}

export class ValidationError extends AppError {
  readonly statusCode = 422;
  readonly code = 'VALIDATION_ERROR';
}

export class Unauthenticated extends AppError {
  readonly statusCode = 401;
  readonly code = 'UNAUTHENTICATED';
  constructor(message = 'Authentication required.') { super(message); }
}

export class Forbidden extends AppError {
  readonly statusCode = 403;
  readonly code = 'FORBIDDEN';
  constructor(message = 'You do not have permission to do that.') { super(message); }
}

// Logged in with Google and never created a password: the account is usable
// only after "Criar senha" (the site sends the reader there on this code).
export class PasswordRequired extends AppError {
  readonly statusCode = 403;
  readonly code = 'PASSWORD_REQUIRED';
  constructor(message = 'Create a password to use your account.') { super(message); }
}

export class NotFound extends AppError {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';
  constructor(message = 'Resource not found.') { super(message); }
}

export class Conflict extends AppError {
  readonly statusCode = 409;
  readonly code = 'CONFLICT';
}
// A feature that exists in the code but is switched off on this server, such
// as uploads without Cloudinary credentials. 503 tells the panel "not now, not you".
export class ServiceUnavailable extends AppError {
  readonly statusCode = 503;
  readonly code = 'SERVICE_UNAVAILABLE';
}
