/**
 * Generated permission-guard tests (spec §11): one test per route, derived from
 * route metadata, so every guard is exercised and new routes are covered
 * automatically.
 *  - every route declares an access policy;
 *  - non-public routes reject anonymous callers with 401;
 *  - permission routes reject a signed-in user lacking the permission with 403;
 *  - permission routes admit a user holding exactly those permissions (not 401/403).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { listRoutes, type RouteInfo } from '../src/common/route-registry';
import { GLOBAL_PREFIX } from '../src/bootstrap';
import {
  Client,
  bootTestApp,
  createUser,
  login,
  resetRateLimits,
  type TestContext,
} from './helpers';

let ctx: TestContext;
let routes: RouteInfo[];

beforeAll(async () => {
  ctx = await bootTestApp();
  routes = listRoutes(ctx.app).map((r) => ({
    ...r,
    path: ['/health', '/ready', '/metrics'].includes(r.path)
      ? r.path
      : `/${GLOBAL_PREFIX}${r.path}`,
  }));
});
afterAll(async () => ctx.app.close());
beforeEach(() => resetRateLimits(ctx));

function concrete(path: string): string {
  return path.replace(/:id\b/g, randomUUID()).replace(/:(\w+)/g, 'nonexistent');
}

function call(client: Client, route: RouteInfo) {
  const path = concrete(route.path);
  switch (route.method) {
    case 'GET':
      return client.get(path);
    case 'POST':
      return client.post(path, {});
    case 'PUT':
      return client.put(path, {});
    case 'PATCH':
      return client.patch(path, {});
    case 'DELETE':
      return client.delete(path);
    default:
      throw new Error(`unsupported method ${route.method}`);
  }
}

describe('route access matrix', () => {
  it('discovers routes and every one declares a policy', () => {
    expect(routes.length).toBeGreaterThan(20);
    expect(routes.filter((r) => !r.policy)).toEqual([]);
  });

  it('rejects anonymous callers on every non-public route', async () => {
    const anon = new Client(ctx.app);
    for (const route of routes.filter((r) => r.policy?.kind !== 'public')) {
      const res = await call(anon, route);
      expect({ route: `${route.method} ${route.path}`, status: res.status }).toEqual({
        route: `${route.method} ${route.path}`,
        status: 401,
      });
    }
  });

  it('enforces declared permissions on every permission-guarded route', async () => {
    const guarded = routes.filter((r) => r.policy?.kind === 'permissions');
    expect(guarded.length).toBeGreaterThan(0);

    // A staff user with an empty custom role holds no permissions at all.
    await ctx.prisma.role.upsert({
      where: { key: 'test_no_perms' },
      create: { key: 'test_no_perms', nameAr: 'بلا صلاحيات', nameEn: 'No perms', isStaff: true },
      update: {},
    });
    const nobody = await login(ctx, await createUser(ctx, ['test_no_perms']));

    for (const route of guarded) {
      const perms = route.policy?.kind === 'permissions' ? route.policy.permissions : [];
      const label = `${route.method} ${route.path}`;

      const denied = await call(nobody, route);
      expect({ label, status: denied.status }).toEqual({ label, status: 403 });

      // Role holding exactly the required permissions.
      const key = `test_${perms.join('_').replace(/\W/g, '_')}`.slice(0, 59);
      const role = await ctx.prisma.role.upsert({
        where: { key },
        create: {
          key,
          nameAr: key,
          nameEn: key,
          isStaff: true,
          permissions: { create: perms.map((p) => ({ permissionKey: p })) },
        },
        update: {},
      });
      const holder = await login(ctx, await createUser(ctx, [role.key]));
      const allowed = await call(holder, route);
      expect({
        label,
        forbidden: [401, 403].includes(allowed.status) && allowed.body.code !== 'SELF_ROLE_EDIT',
      }).toEqual({
        label,
        forbidden: false,
      });
      resetRateLimits(ctx);
    }
  });
});
