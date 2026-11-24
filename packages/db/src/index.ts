import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';
export * from './crypto';
export { syncRolesAndPermissions } from './rbac-sync';

export function createPrismaClient(url?: string): PrismaClient {
  return new PrismaClient({
    datasources: url ? { db: { url } } : undefined,
    log: process.env.PRISMA_LOG_QUERIES === 'true' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
}
