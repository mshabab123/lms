import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { Errors } from './errors';
import { requestContext } from './request-context';

const REQUEST_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

export function resolveRequestId(header: unknown): string {
  return typeof header === 'string' && REQUEST_ID_RE.test(header) ? header : randomUUID();
}

/** Runs the rest of the request inside an AsyncLocalStorage context. */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId =
    (req as Request & { id?: string }).id ?? resolveRequestId(req.headers['x-request-id']);
  res.setHeader('x-request-id', requestId);
  requestContext.run(
    {
      requestId,
      ip: req.ip ?? null,
      userAgent: (req.headers['user-agent'] ?? '').slice(0, 300) || null,
    },
    () => next(),
  );
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Paths authenticated by signatures instead of cookies (payment/livekit webhooks). */
const CSRF_EXEMPT = /^\/api\/v1\/webhooks\//;

/**
 * CSRF defence for cookie sessions: unsafe requests must carry the custom header
 * `x-mzn-csrf: 1` (forces a CORS preflight, which strict CORS rejects cross-site)
 * and, when an Origin header is present, it must match the portal origin.
 */
export function csrfMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (!UNSAFE.has(req.method) || CSRF_EXEMPT.test(req.path)) return next();
  const origin = req.headers.origin;
  const allowedOrigin = new URL(env().APP_PUBLIC_URL).origin;
  if (req.headers['x-mzn-csrf'] !== '1' || (origin !== undefined && origin !== allowedOrigin)) {
    return next(Errors.forbidden('CSRF_REJECTED'));
  }
  next();
}
