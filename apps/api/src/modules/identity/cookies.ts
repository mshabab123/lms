import type { Response } from 'express';
import { env } from '../../config/env';
import type { CreatedSession } from './session.service';
import { sessionCookieName } from './session.service';

export function setSessionCookie(res: Response, session: CreatedSession): void {
  res.cookie(sessionCookieName(), session.token, {
    httpOnly: true,
    secure: env().COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    expires: session.expiresAt,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(sessionCookieName(), {
    httpOnly: true,
    secure: env().COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
  });
}
