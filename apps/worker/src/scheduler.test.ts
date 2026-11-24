import { describe, expect, it, vi } from 'vitest';
import pino from 'pino';
import type { PrismaClient } from '@mzn/db';
import { Scheduler, type Job } from './scheduler';

/** Fake client whose $transaction passes a tx that answers the advisory-lock query. */
function fakePrisma(locked: boolean) {
  const tx = {
    $queryRaw: vi.fn(async () => [{ locked }]),
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaClient;
  return { prisma, tx };
}

const log = pino({ level: 'silent' });

describe('Scheduler', () => {
  it('runs a job inside the lock-holding transaction', async () => {
    const { prisma, tx } = fakePrisma(true);
    const job: Job = {
      name: 'j',
      intervalMs: 1000,
      lockKey: 1,
      run: vi.fn(async () => ({ n: 1 })),
    };
    const s = new Scheduler(prisma, log);
    await s.runOnce(job);
    expect(job.run).toHaveBeenCalledWith(tx);
    expect(s.lastRun.get('j')?.ok).toBe(true);
  });

  it('skips when another replica holds the lock', async () => {
    const { prisma } = fakePrisma(false);
    const job: Job = { name: 'j', intervalMs: 1000, lockKey: 1, run: vi.fn(async () => ({})) };
    const s = new Scheduler(prisma, log);
    await s.runOnce(job);
    expect(job.run).not.toHaveBeenCalled();
    expect(s.lastRun.has('j')).toBe(false);
  });

  it('records failures without throwing', async () => {
    const { prisma } = fakePrisma(true);
    const job: Job = {
      name: 'bad',
      intervalMs: 1000,
      lockKey: 2,
      run: async () => {
        throw new Error('boom');
      },
    };
    const s = new Scheduler(prisma, log);
    await expect(s.runOnce(job)).resolves.toBeUndefined();
    expect(s.lastRun.get('bad')?.ok).toBe(false);
  });
});
