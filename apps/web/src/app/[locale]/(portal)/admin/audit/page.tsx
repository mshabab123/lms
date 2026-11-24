'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import type { MeResponse, Paginated } from '@mzn/shared';
import { Badge, Button, Card, Input, Label } from '@mzn/ui';
import { api } from '@/lib/api-client';
import { formatDateTime } from '@/lib/dates';
import { ErrorAlert } from '@/components/error-message';

interface AuditRow {
  id: string;
  seq: string;
  actorId: string | null;
  actorRoles: string[];
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
}

export default function AuditPage() {
  const t = useTranslations('admin');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [applied, setApplied] = useState({ action: '', entityType: '' });

  const me = useQuery({ queryKey: ['me'], queryFn: () => api<MeResponse>('/auth/me') });
  const params = new URLSearchParams({
    page: String(page),
    pageSize: '25',
    ...(applied.action ? { action: applied.action } : {}),
    ...(applied.entityType ? { entityType: applied.entityType } : {}),
  });
  const rows = useQuery({
    queryKey: ['audit', params.toString()],
    queryFn: () => api<Paginated<AuditRow>>(`/audit?${params}`),
    placeholderData: keepPreviousData,
  });
  const chain = useQuery({
    queryKey: ['audit-chain'],
    queryFn: () =>
      api<{ ok: boolean; checked: number; brokenAtSeq?: string }>('/audit/verify-chain'),
  });
  const pages = rows.data ? Math.max(1, Math.ceil(rows.data.total / rows.data.pageSize)) : 1;
  const canExport = me.data?.permissions.includes('audit.export');

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1>{t('auditTitle')}</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">{t('auditChain')}:</span>
          {chain.data ? (
            chain.data.ok ? (
              <Badge tone="success" icon="✓" label={t('chainOk', { count: chain.data.checked })} />
            ) : (
              <Badge
                tone="danger"
                icon="✕"
                label={t('chainBroken', { seq: chain.data.brokenAtSeq ?? '?' })}
              />
            )
          ) : null}
        </div>
      </div>
      <Card className="mb-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setApplied({ action, entityType });
          }}
        >
          <div className="min-w-48 flex-1">
            <Label htmlFor="action">{t('auditAction')}</Label>
            <Input
              id="action"
              dir="ltr"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="auth."
            />
          </div>
          <div className="min-w-48 flex-1">
            <Label htmlFor="entityType">{t('auditEntity')}</Label>
            <Input
              id="entityType"
              dir="ltr"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              placeholder="User"
            />
          </div>
          <Button type="submit">{t('filter')}</Button>
          {canExport ? (
            <a
              className="inline-flex min-h-touch items-center rounded-control border border-border px-4"
              href={`/api/v1/audit/export?${params}`}
            >
              {t('export')}
            </a>
          ) : null}
        </form>
      </Card>
      <ErrorAlert error={rows.error} />
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px]">
          <thead className="bg-bg text-sm text-muted">
            <tr>
              <th scope="col" className="p-3 text-start">
                #
              </th>
              <th scope="col" className="p-3 text-start">
                {t('auditTime')}
              </th>
              <th scope="col" className="p-3 text-start">
                {t('auditAction')}
              </th>
              <th scope="col" className="p-3 text-start">
                {t('auditEntity')}
              </th>
              <th scope="col" className="p-3 text-start">
                {t('auditActor')}
              </th>
            </tr>
          </thead>
          <tbody dir="ltr">
            {rows.data?.items.map((r) => (
              <tr key={r.id} className="border-t border-border text-sm">
                <td className="p-3 text-start">{r.seq}</td>
                <td className="p-3 text-start">{formatDateTime(r.createdAt, locale)}</td>
                <td className="p-3 text-start font-mono">{r.action}</td>
                <td className="p-3 text-start">
                  {r.entityType}
                  {r.entityId ? (
                    <span className="text-muted"> · {r.entityId.slice(0, 8)}</span>
                  ) : null}
                </td>
                <td className="p-3 text-start">
                  {r.actorId ? r.actorId.slice(0, 8) : '—'}{' '}
                  {r.actorRoles.length ? (
                    <span className="text-muted">({r.actorRoles.join(', ')})</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <nav className="mt-4 flex items-center justify-center gap-3" aria-label="pagination">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          {tApp('previous')}
        </Button>
        <span className="text-sm">{tApp('pageOf', { page, pages })}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={() => setPage((p) => p + 1)}
        >
          {tApp('next')}
        </Button>
      </nav>
    </div>
  );
}
