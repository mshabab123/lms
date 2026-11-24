import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import pino from 'pino';
import { createPrismaClient } from '@mzn/db';
import { ALL_JOBS } from './jobs';
import { Scheduler } from './scheduler';

if (process.env.NODE_ENV !== 'production') {
  const file = resolve(__dirname, '../../../.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

const log = pino({ level: process.env.LOG_LEVEL ?? 'info', base: { service: 'worker' } });
const prisma = createPrismaClient();
const scheduler = new Scheduler(prisma, log);

/** Health (liveness) and readiness for the container orchestrator. */
const server = createServer(async (req, res) => {
  if (req.url === '/health') {
    res
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify({ status: 'ok', service: 'worker' }));
    return;
  }
  if (req.url === '/ready') {
    let db = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }
    const jobs = Object.fromEntries(
      [...scheduler.lastRun].map(([k, v]) => [k, { at: v.at.toISOString(), ok: v.ok }]),
    );
    res
      .writeHead(db ? 200 : 503, { 'content-type': 'application/json' })
      .end(JSON.stringify({ status: db ? 'ready' : 'not_ready', db, jobs }));
    return;
  }
  res.writeHead(404).end();
});

async function main(): Promise<void> {
  await prisma.$connect();
  scheduler.start(ALL_JOBS);
  const port = Number(process.env.WORKER_HEALTH_PORT ?? 4100);
  server.listen(port, '0.0.0.0', () => log.info({ port }, 'worker started'));
}

async function shutdown(signal: string): Promise<void> {
  log.info({ signal }, 'shutting down');
  server.close();
  await scheduler.stop();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

main().catch((err: unknown) => {
  log.fatal({ err: err instanceof Error ? err.message : 'unknown' }, 'worker failed to start');
  process.exit(1);
});
