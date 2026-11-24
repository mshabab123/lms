'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import type { MeResponse } from '@mzn/shared';
import { Alert, Badge, Button, Card, Input, Label } from '@mzn/ui';
import { api } from '@/lib/api-client';
import { ErrorAlert } from '@/components/error-message';

interface RoleRow {
  id: string;
  key: string;
  nameAr: string;
  nameEn: string;
  isStaff: boolean;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
}

const EMPTY: RoleRow = {
  id: '',
  key: '',
  nameAr: '',
  nameEn: '',
  isStaff: true,
  isSystem: false,
  userCount: 0,
  permissions: [],
};

export default function RolesPage() {
  const t = useTranslations('admin');
  const locale = useLocale();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<MeResponse>('/auth/me') });
  const canWrite = me.data?.permissions.includes('role.write') ?? false;
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api<RoleRow[]>('/admin/roles') });
  const permissions = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api<{ items: string[] }>('/admin/permissions'),
  });
  const [editing, setEditing] = useState<{ role: RoleRow; isNew: boolean } | null>(null);
  const remove = useMutation({
    mutationFn: (key: string) => api(`/admin/roles/${key}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1>{t('rolesTitle')}</h1>
        {canWrite ? (
          <Button onClick={() => setEditing({ role: EMPTY, isNew: true })}>{t('newRole')}</Button>
        ) : null}
      </div>
      <ErrorAlert error={roles.error ?? remove.error} />
      {editing ? (
        <RoleEditor
          initial={editing.role}
          isNew={editing.isNew}
          allPermissions={permissions.data?.items ?? []}
          onDone={() => {
            setEditing(null);
            void qc.invalidateQueries({ queryKey: ['roles'] });
          }}
        />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {roles.data?.map((r) => (
          <Card key={r.id}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{locale === 'ar' ? r.nameAr : r.nameEn}</h2>
              <code className="text-sm text-muted">{r.key}</code>
              {r.isSystem ? <Badge tone="info" label={t('systemRole')} /> : null}
            </div>
            <p className="mb-3 text-sm text-muted">{t('usersCount', { count: r.userCount })}</p>
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                {t('permissions')} ({r.permissions.length})
              </summary>
              <ul className="mt-2 flex flex-wrap gap-1" dir="ltr">
                {r.permissions.map((p) => (
                  <li key={p}>
                    <code className="rounded bg-bg px-1.5 py-0.5 text-xs">{p}</code>
                  </li>
                ))}
              </ul>
            </details>
            {canWrite ? (
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing({ role: r, isNew: false })}
                >
                  {t('edit')}
                </Button>
                {!r.isSystem && r.userCount === 0 ? (
                  <Button size="sm" variant="danger" onClick={() => remove.mutate(r.key)}>
                    {t('delete')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}

function RoleEditor({
  initial,
  isNew,
  allPermissions,
  onDone,
}: {
  initial: RoleRow;
  isNew: boolean;
  allPermissions: string[];
  onDone: () => void;
}) {
  const t = useTranslations('admin');
  const tApp = useTranslations('app');
  const [role, setRole] = useState(initial);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const groups = allPermissions.reduce<Record<string, string[]>>((acc, p) => {
    const g = p.split('.')[0] ?? p;
    (acc[g] ??= []).push(p);
    return acc;
  }, {});

  return (
    <Card className="mb-4">
      {saved ? (
        <Alert tone="success" className="mb-3">
          {t('saved')}
        </Alert>
      ) : null}
      <ErrorAlert error={error} />
      <form
        className="mt-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            const body = {
              key: role.key,
              nameAr: role.nameAr,
              nameEn: role.nameEn,
              isStaff: role.isStaff,
              permissions: role.permissions,
            };
            await api(isNew ? '/admin/roles' : `/admin/roles/${initial.key}`, {
              method: isNew ? 'POST' : 'PUT',
              body,
            });
            setSaved(true);
            onDone();
          } catch (err) {
            setError(err);
          }
        }}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label htmlFor="role-key">{t('roleKey')}</Label>
            <Input
              id="role-key"
              dir="ltr"
              value={role.key}
              disabled={!isNew && initial.isSystem}
              onChange={(e) => setRole({ ...role, key: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="role-ar">{t('roleNameAr')}</Label>
            <Input
              id="role-ar"
              value={role.nameAr}
              onChange={(e) => setRole({ ...role, nameAr: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="role-en">{t('roleNameEn')}</Label>
            <Input
              id="role-en"
              dir="ltr"
              value={role.nameEn}
              onChange={(e) => setRole({ ...role, nameEn: e.target.value })}
            />
          </div>
        </div>
        <label className="my-4 flex min-h-touch items-center gap-2">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={role.isStaff}
            onChange={(e) => setRole({ ...role, isStaff: e.target.checked })}
          />
          {t('isStaff')}
        </label>
        <fieldset>
          <legend className="mb-2 font-medium">{t('permissions')}</legend>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" dir="ltr">
            {Object.entries(groups).map(([group, perms]) => (
              <div key={group}>
                <p className="mb-1 text-sm font-semibold">{group}</p>
                {perms.map((p) => (
                  <label key={p} className="flex min-h-9 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={role.permissions.includes(p)}
                      onChange={(e) =>
                        setRole({
                          ...role,
                          permissions: e.target.checked
                            ? [...role.permissions, p]
                            : role.permissions.filter((x) => x !== p),
                        })
                      }
                    />
                    {p}
                  </label>
                ))}
              </div>
            ))}
          </div>
        </fieldset>
        <div className="mt-4 flex gap-2">
          <Button type="submit">{tApp('save')}</Button>
          <Button variant="outline" onClick={onDone}>
            {tApp('cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
