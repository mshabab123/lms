import { Injectable } from '@nestjs/common';
import { randomToken, sha256Hex } from '@mzn/db';
import { env } from '../../config/env';
import { PrismaService } from '../../common/prisma.service';
import type { Actor } from '../../common/request-context';

export const SESSION_COOKIE_SECURE = '__Host-mzn_sid';
export const SESSION_COOKIE_DEV = 'mzn_sid';

export function sessionCookieName(): string {
  return env().COOKIE_SECURE ? SESSION_COOKIE_SECURE : SESSION_COOKIE_DEV;
}

const TOUCH_INTERVAL_MS = 60_000;

export interface CreatedSession {
  token: string;
  sessionId: string;
  expiresAt: Date;
}

/**
 * Server-side sessions. The browser holds an opaque random token in an httpOnly
 * cookie; only its SHA-256 hash is stored. Sessions are listed and revocable.
 */
@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    opts: { mfaSatisfied: boolean; ip: string | null; userAgent: string | null },
  ): Promise<CreatedSession> {
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + env().SESSION_TTL_MINUTES * 60_000);
    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: sha256Hex(token),
        mfaSatisfied: opts.mfaSatisfied,
        ipAddress: opts.ip,
        userAgent: opts.userAgent?.slice(0, 300) ?? null,
        expiresAt,
      },
    });
    return { token, sessionId: session.id, expiresAt };
  }

  /** Rotates the token (prevents fixation) and marks the second factor satisfied. */
  async elevate(sessionId: string): Promise<CreatedSession> {
    const token = randomToken(32);
    const session = await this.prisma.session.update({
      where: { id: sessionId },
      data: { tokenHash: sha256Hex(token), mfaSatisfied: true, lastSeenAt: new Date() },
    });
    return { token, sessionId: session.id, expiresAt: session.expiresAt };
  }

  /** Resolves a cookie token to an Actor, or null if invalid/expired/idle/revoked. */
  async resolve(token: string): Promise<Actor | null> {
    if (!token || token.length > 128) return null;
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: {
        user: {
          include: {
            mfaSecret: { select: { confirmedAt: true } },
            roles: {
              include: { role: { include: { permissions: { select: { permissionKey: true } } } } },
            },
          },
        },
      },
    });
    if (!session || session.revokedAt) return null;
    const now = Date.now();
    const idleLimit = env().SESSION_IDLE_MINUTES * 60_000;
    if (session.expiresAt.getTime() <= now || now - session.lastSeenAt.getTime() > idleLimit)
      return null;
    if (session.user.status !== 'active') return null;

    if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now) },
      });
    }

    const roles = session.user.roles.map((ur) => ur.role);
    return {
      userId: session.userId,
      sessionId: session.id,
      roles: roles.map((r) => r.key),
      permissions: new Set(roles.flatMap((r) => r.permissions.map((p) => p.permissionKey))),
      isStaff: roles.some((r) => r.isStaff),
      organizationId: session.user.organizationId,
      mfaSatisfied: session.mfaSatisfied,
      mfaEnabled: Boolean(session.user.mfaSecret?.confirmedAt),
    };
  }

  async list(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
      },
      orderBy: { lastSeenAt: 'desc' },
      take: 50,
    });
  }

  async revoke(userId: string, sessionId: string): Promise<boolean> {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count > 0;
  }

  async revokeAll(userId: string, exceptSessionId?: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }
}
