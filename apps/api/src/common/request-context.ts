import { AsyncLocalStorage } from 'node:async_hooks';

export interface Actor {
  userId: string;
  sessionId: string;
  roles: string[];
  permissions: Set<string>;
  isStaff: boolean;
  organizationId: string | null;
  mfaSatisfied: boolean;
  mfaEnabled: boolean;
}

export interface RequestContext {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
  actor?: Actor;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const requestContext = {
  run<T>(ctx: RequestContext, fn: () => T): T {
    return storage.run(ctx, fn);
  },
  get(): RequestContext | undefined {
    return storage.getStore();
  },
};
