import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ACCESS_KEY, type AccessPolicy } from './decorators';
import { Errors } from './errors';
import { requestContext, type Actor } from './request-context';
import { SessionService, sessionCookieName } from '../modules/identity/session.service';

export type AuthedRequest = Request & { actor?: Actor };

/**
 * Global guard: resolves the session cookie and enforces the route's access policy.
 * Staff (and any MFA-enabled user) must complete the second factor before any
 * route except those marked allowPendingMfa.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<AccessPolicy | undefined>(ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Fail closed: a route without a declared policy is never reachable.
    if (!policy) throw Errors.forbidden('ACCESS_POLICY_MISSING');

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = (req.cookies as Record<string, string> | undefined)?.[sessionCookieName()];
    const actor = token ? await this.sessions.resolve(token) : null;
    if (actor) {
      req.actor = actor;
      const ctx = requestContext.get();
      if (ctx) ctx.actor = actor;
    }

    if (policy.kind === 'public') return true;
    if (!actor) throw Errors.unauthenticated();

    const secondFactorPending = (actor.isStaff || actor.mfaEnabled) && !actor.mfaSatisfied;
    const allowPending = policy.kind === 'authenticated' && policy.allowPendingMfa === true;
    if (secondFactorPending && !allowPending) throw Errors.mfaRequired();

    if (policy.kind === 'permissions') {
      const missing = policy.permissions.filter((p) => !actor.permissions.has(p));
      if (missing.length > 0) throw Errors.forbidden();
    }
    return true;
  }
}
