import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, auditQuerySchema, type AuditQuery } from '@mzn/shared';
import { RequirePermissions } from '../../common/decorators';
import { ApiZodQuery, ZodQuery } from '../../common/zod';
import { AuditService } from './audit.service';

function csvCell(value: unknown): string {
  const s =
    value === null || value === undefined
      ? ''
      : typeof value === 'string'
        ? value
        : JSON.stringify(value);
  // Neutralize spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  @Get()
  @ApiZodQuery(auditQuerySchema)
  list(@ZodQuery(auditQuerySchema) q: AuditQuery) {
    return this.audit.query(q);
  }

  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  @Get('verify-chain')
  verify() {
    return this.audit.verifyChain();
  }

  /** CSV export; the export itself is audited. */
  @RequirePermissions(PERMISSIONS.AUDIT_EXPORT)
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="audit-log.csv"')
  @ApiZodQuery(auditQuerySchema)
  async export(@ZodQuery(auditQuerySchema) q: AuditQuery): Promise<string> {
    const rows: Record<string, unknown>[] = [];
    for (let page = 1; page <= 50; page++) {
      const batch = await this.audit.query({ ...q, page, pageSize: 100 });
      rows.push(...batch.items);
      if (batch.items.length < 100) break;
    }
    await this.audit.record({
      action: 'audit.exported',
      entityType: 'AuditLog',
      changes: { rows: rows.length, filter: { ...q, page: undefined } },
    });
    const cols = [
      'seq',
      'createdAt',
      'actorId',
      'actorRoles',
      'action',
      'entityType',
      'entityId',
      'correlationId',
      'changes',
      'hash',
    ];
    const lines = [
      cols.join(','),
      ...rows.map((r) =>
        cols
          .map((c) => csvCell(r[c] instanceof Date ? (r[c] as Date).toISOString() : r[c]))
          .join(','),
      ),
    ];
    const BOM = String.fromCharCode(0xfeff); // lets Excel detect UTF-8 (Arabic text)
    return BOM + lines.join('\n');
  }
}
