import { Injectable } from '@nestjs/common';
import type { Prisma } from '@mzn/db';
import type { AuditQuery, Paginated } from '@mzn/shared';
import { PrismaService, type Tx } from '../../common/prisma.service';
import { requestContext } from '../../common/request-context';

/** Keys that must never appear in audit change metadata. */
const FORBIDDEN_KEYS = /password|secret|token|national|iqama|dob|dateofbirth|otp|recovery|card/i;

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Minimized field-level metadata: field names and non-sensitive old/new values only. */
  changes?: Record<string, unknown>;
  /** Override actor (e.g. system jobs or pre-session events like failed login). */
  actorId?: string | null;
}

export function sanitizeChanges(
  changes: Record<string, unknown> | undefined,
): Prisma.InputJsonValue | undefined {
  if (!changes) return undefined;
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [
          k,
          FORBIDDEN_KEYS.test(k) ? '[redacted]' : walk(v),
        ]),
      );
    }
    if (typeof value === 'string' && value.length > 200) return `${value.slice(0, 200)}…`;
    return value;
  };
  return walk(changes) as Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Writes an audit row; pass `tx` so the audit commits atomically with the change. */
  async record(entry: AuditEntry, tx?: Tx): Promise<void> {
    const ctx = requestContext.get();
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        actorId: entry.actorId !== undefined ? entry.actorId : (ctx?.actor?.userId ?? null),
        actorRoles: ctx?.actor?.roles ?? [],
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        correlationId: ctx?.requestId ?? null,
        ipAddress: ctx?.ip ?? null,
        changes: sanitizeChanges(entry.changes),
      },
    });
  }

  async query(q: AuditQuery): Promise<Paginated<Record<string, unknown>>> {
    const where: Prisma.AuditLogWhereInput = {
      actorId: q.actorId,
      action: q.action ? { startsWith: q.action } : undefined,
      entityType: q.entityType,
      entityId: q.entityId,
      createdAt: q.from || q.to ? { gte: q.from, lte: q.to } : undefined,
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { seq: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return {
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: rows.map((r) => ({ ...r, seq: r.seq.toString() })),
    };
  }

  /** Recomputes nothing in JS; checks the stored chain links are consistent. */
  async verifyChain(
    limit = 10_000,
  ): Promise<{ ok: boolean; checked: number; brokenAtSeq?: string }> {
    const rows = await this.prisma.auditLog.findMany({
      orderBy: { seq: 'asc' },
      take: limit,
      select: { seq: true, hash: true, prevHash: true },
    });
    for (let i = 1; i < rows.length; i++) {
      if (rows[i]!.prevHash !== rows[i - 1]!.hash)
        return { ok: false, checked: i, brokenAtSeq: rows[i]!.seq.toString() };
    }
    return { ok: true, checked: rows.length };
  }
}
