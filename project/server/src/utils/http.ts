import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodType } from 'zod';

/**
 * Basisklasse für erwartete (fachliche) Fehler. Alles, was hiervon erbt, wird von
 * `errorHandler` in eine saubere JSON-Antwort mit passendem Status übersetzt.
 * Unerwartete Fehler werden bewusst als generische 500 ausgeliefert, damit keine
 * internen Details (Stacktraces, SQL, Credentials) nach außen gelangen.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: unknown) {
    super(400, 'bad_request', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, 'unauthorized', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, 'forbidden', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(404, 'not_found', message);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service unavailable') {
    super(503, 'service_unavailable', message);
  }
}

/** Die Datenbank ist nicht erreichbar/initialisiert. */
export class DbUnavailableError extends AppError {
  constructor(message = 'Database not available') {
    super(503, 'db_unavailable', message);
  }
}

/**
 * Wrappt async Route-Handler, damit abgelehnte Promises nicht als unhandled
 * rejection verloren gehen, sondern in der zentralen Error-Middleware landen.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** Validiert einen Request-Body gegen ein zod-Schema und wirft sonst 400. */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    throw new BadRequestError('Invalid request body', formatZodIssues(result.error));
  }
  return result.data;
}

/** Validiert Query-/Pfad-Parameter gegen ein zod-Schema und wirft sonst 400. */
export function parseParams<T>(schema: ZodType<T>, params: unknown): T {
  const result = schema.safeParse(params ?? {});
  if (!result.success) {
    throw new BadRequestError('Invalid request parameters', formatZodIssues(result.error));
  }
  return result.data;
}

function formatZodIssues(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/** 404-Fallback für unbekannte /api-Routen. */
export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
  next(new NotFoundError('Endpoint not found'));
}

/**
 * Zentrale Express-Error-Middleware. Liefert für alle Routen dasselbe Format
 * `{ error, code, details? }`. Muss als letztes registriert werden.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) return;

  if (err instanceof AppError) {
    if (err.status >= 500) {
      console.error(`[${req.method} ${req.path}] ${err.name}: ${err.message}`);
    }
    res.status(err.status).json({
      error: err.message,
      code: err.code,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Invalid request',
      code: 'bad_request',
      details: formatZodIssues(err),
    });
    return;
  }

  // Unerwarteter Fehler: intern vollständig loggen, extern nur generisch melden.
  console.error(`[${req.method} ${req.path}] Unhandled error:`, err);
  res.status(500).json({ error: 'Internal server error', code: 'internal_error' });
}
