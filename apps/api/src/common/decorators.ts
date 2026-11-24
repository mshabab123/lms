import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Permission } from '@mzn/shared';
import type { Actor } from './request-context';
import { Errors } from './errors';

export const ACCESS_KEY = 'mzn:access';

/**
 * Every route must declare exactly one access policy. A startup check
 * (RouteRegistry) refuses to boot if any route has none.
 */
export type AccessPolicy =
  | { kind: 'public' }
  | { kind: 'authenticated'; allowPendingMfa?: boolean }
  | { kind: 'permissions'; permissions: Permission[] };

/** Anonymous access (catalog, verification, auth entry points, health). */
export const Public = () => SetMetadata(ACCESS_KEY, { kind: 'public' } satisfies AccessPolicy);

/** Any signed-in user; scope checks happen in the service. */
export const Authenticated = (opts: { allowPendingMfa?: boolean } = {}) =>
  SetMetadata(ACCESS_KEY, { kind: 'authenticated', ...opts } satisfies AccessPolicy);

/** Requires ALL listed permissions. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(ACCESS_KEY, { kind: 'permissions', permissions } satisfies AccessPolicy);

export const CurrentActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest<{ actor?: Actor }>();
  if (!req.actor) throw Errors.unauthenticated();
  return req.actor;
});
