import type { Prisma, PrismaClient } from '@mzn/db';
import type { Logger } from 'pino';

export interface Job {
  name: string;
  intervalMs: number;
  /** Stable 32-bit key for the Postgres advisory lock (single runner across replicas). */
  lockKey: number;
  /** Runs inside the lock-holding transaction; keep jobs short (batch large work). */
  run(tx: Prisma.TransactionClient): Promise<Record<string, unknown>>;
}

/**
 * Minimal interval scheduler. Each run takes a transaction-scoped advisory lock
 * (released automatically on commit/rollback, safe with connection pooling) so only
 * one worker replica executes a job at a time; jobs must be idempotent.
 */
export class Scheduler {
  private timers: NodeJS.Timeout[] = [];
  private running = new Set<Promise<unknown>>();
  private stopped = false;
  readonly lastRun = new Map<string, { at: Date; ok: boolean }>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly log: Logger,
  ) {}

  start(jobs: Job[]): void {
    for (const job of jobs) {
      const tick = () => {
        if (this.stopped) return;
        const p = this.runOnce(job).finally(() => this.running.delete(p));
        this.running.add(p);
      };
      tick();
      this.timers.push(setInterval(tick, job.intervalMs));
    }
  }

  async runOnce(job: Job): Promise<void> {
    const started = Date.now();
    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<
            { locked: boolean }[]
          >`SELECT pg_try_advisory_xact_lock(${job.lockKey}) AS locked`;
          if (!rows[0]?.locked) return null;
          return job.run(tx);
        },
        { timeout: 60_000, maxWait: 10_000 },
      );
      if (result === null) return;
      this.lastRun.set(job.name, { at: new Date(), ok: true });
      this.log.info({ job: job.name, ms: Date.now() - started, ...result }, 'job completed');
    } catch (err) {
      this.lastRun.set(job.name, { at: new Date(), ok: false });
      this.log.error(
        { job: job.name, err: err instanceof Error ? err.message : 'unknown' },
        'job failed',
      );
    }
  }

  /** Stops scheduling and waits for in-flight runs (graceful shutdown). */
  async stop(): Promise<void> {
    this.stopped = true;
    this.timers.forEach(clearInterval);
    await Promise.allSettled([...this.running]);
  }
}
