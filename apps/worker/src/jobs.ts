import type { Job } from './scheduler';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Removes expired authentication artefacts. Sessions are kept 30 days after
 * expiry/revocation for security investigations, then deleted (they hold no
 * business record). Audit entries about them remain in the append-only log.
 */
export const cleanupExpiredAuth: Job = {
  name: 'cleanup-expired-auth',
  intervalMs: 60 * 60 * 1000,
  lockKey: 910_001,
  async run(prisma) {
    const cutoff = new Date(Date.now() - 30 * DAY);
    const sessions = await prisma.session.deleteMany({
      where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
    });
    const tokens = await prisma.verificationToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date(Date.now() - DAY) } },
          { consumedAt: { lt: new Date(Date.now() - DAY) } },
        ],
      },
    });
    const idempotency = await prisma.idempotencyKey.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return { sessions: sessions.count, tokens: tokens.count, idempotencyKeys: idempotency.count };
  },
};

export const ALL_JOBS: Job[] = [cleanupExpiredAuth];
