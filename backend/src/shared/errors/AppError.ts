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

export class NotFound extends AppError {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';
  constructor(message = 'Resource not found.') { super(message); }
}

export class Conflict extends AppError {
  readonly statusCode = 409;
  readonly code = 'CONFLICT';
}