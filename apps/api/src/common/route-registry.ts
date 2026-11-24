import { RequestMethod, type INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { ACCESS_KEY, type AccessPolicy } from './decorators';

export interface RouteInfo {
  controller: string;
  handler: string;
  method: string;
  path: string;
  policy: AccessPolicy | undefined;
}

function joinPath(...parts: (string | string[] | undefined)[]): string {
  const segs = parts
    .map((p) => (Array.isArray(p) ? p[0] : p))
    .filter((p): p is string => Boolean(p))
    .flatMap((p) => p.split('/'))
    .filter(Boolean);
  return `/${segs.join('/')}`;
}

/**
 * Enumerates every HTTP route with its access policy. Used at startup to refuse
 * booting with an undeclared route, and by the generated permission-guard tests.
 */
export function listRoutes(app: INestApplication, globalPrefix = ''): RouteInfo[] {
  const discovery = app.get(DiscoveryService);
  const scanner = app.get(MetadataScanner);
  const reflector = app.get(Reflector);
  const routes: RouteInfo[] = [];
  for (const wrapper of discovery.getControllers()) {
    const instance = wrapper.instance as Record<string, unknown> | undefined;
    if (!instance || !wrapper.metatype) continue;
    const proto = Object.getPrototypeOf(instance) as object;
    const controllerPath = reflector.get<string | string[] | undefined>(
      PATH_METADATA,
      wrapper.metatype,
    );
    for (const name of scanner.getAllMethodNames(proto)) {
      const handler = (proto as Record<string, unknown>)[name] as (...args: unknown[]) => unknown;
      const methodPath = Reflect.getMetadata(PATH_METADATA, handler) as
        string | string[] | undefined;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (methodPath === undefined || method === undefined) continue;
      const policy =
        (Reflect.getMetadata(ACCESS_KEY, handler) as AccessPolicy | undefined) ??
        (Reflect.getMetadata(ACCESS_KEY, wrapper.metatype) as AccessPolicy | undefined);
      routes.push({
        controller: wrapper.metatype.name,
        handler: name,
        method: RequestMethod[method],
        path: joinPath(globalPrefix, controllerPath, methodPath),
        policy,
      });
    }
  }
  return routes;
}

export function assertAllRoutesDeclareAccess(routes: RouteInfo[]): void {
  const missing = routes.filter((r) => !r.policy);
  if (missing.length > 0) {
    throw new Error(
      `Routes without an access policy: ${missing.map((r) => `${r.method} ${r.path}`).join(', ')}`,
    );
  }
}
