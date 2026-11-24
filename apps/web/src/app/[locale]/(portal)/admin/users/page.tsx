'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { z } from 'zod';
import { createStaffUserSchema, type MeResponse, type Paginated } from '@mzn/shared';
import { Alert, Badge, Button, Card, Input, Label, Select } from '@mzn/ui';
import { api } from '@/lib/api-client';
import { formatDateTime } from '@/lib/dates';
import { ErrorAlert, useFieldError } from '@/components/error-message';
import { FormField } from '@/components/form-field';

interface UserRow {
  id: string;
  email: string;
  fullNameAr: string;
  fullNameEn: string | null;
  status: 'active' | 'disabled' | 'pending_verification';
  roles: string[];
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
}
interface RoleRow {
  key: string;
  nameAr: string;
  nameEn: string;
}

export default function UsersPage() {
  const t = useTranslations('admin');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [creating, setCreating] = useState(false);

  const me = useQuery({ queryKey: ['me'], queryFn: () => api<MeResponse>('/auth/me') });
  const perms = new Set(me.data?.permissions ?? []);
  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: () => api<RoleRow[]>('/admin/roles'),
    enabled: perms.has('role.read'),
  });
  const params = new URLSearchParams({
    page: String(page),
    pageSize: '20',
    ...(q ? { q } : {}),
    ...(role ? { role } : {}),
  });
  const users = useQuery({
    queryKey: ['users', params.toString()],
    queryFn: () => api<Paginated<UserRow>>(`/admin/users?${params}`),
    placeholderData: keepPreviousData,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] });
  const statusMutation = useMutation({
    mutationFn: (u: UserRow) =>
      api(`/admin/users/${u.id}/status`, {
        method: 'PATCH',
        body: { disabled: u.status !== 'disabled' },
      }),
    onSuccess: refresh,
  });

  const pages = users.data ? Math.max(1, Math.ceil(users.data.total / users.data.pageSize)) : 1;
  const roleName = (key: string) => {
    const r = roles.data?.find((x) => x.key === key);
    return r ? (locale === 'ar' ? r.nameAr : r.nameEn) : key;
  };
  const statusLabel = {
    active: t('statusActive'),
    disabled: t('statusDisabled'),
    pending_verification: t('statusPending'),
  };
  const statusTone = {
    active: 'success',
    disabled: 'danger',
    pending_verification: 'warning',
  } as const;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1>{t('usersTitle')}</h1>
        {perms.has('user.write') ? (
          <Button onClick={() => setCreating(true)}>{t('createStaff')}</Button>
        ) : null}
      </div>

      {creating ? (
        <CreateStaffForm
          roles={roles.data ?? []}
          onDone={() => {
            setCreating(false);
            refresh();
          }}
        />
      ) : null}
      {editing ? (
        <EditUserPanel
          user={editing}
          roles={roles.data ?? []}
          perms={perms}
          onDone={() => {
            setEditing(null);
            refresh();
          }}
        />
      ) : null}

      <Card className="mb-4">
        <form
          role="search"
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
          }}
        >
          <div className="min-w-48 flex-1">
            <Label htmlFor="q">{tApp('search')}</Label>
            <Input id="q" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="min-w-48">
            <Label htmlFor="role">{t('filterRole')}</Label>
            <Select
              id="role"
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('allRoles')}</option>
              {roles.data?.map((r) => (
                <option key={r.key} value={r.key}>
                  {roleName(r.key)}
                </option>
              ))}
            </Select>
          </div>
        </form>
      </Card>

      <ErrorAlert error={users.error ?? statusMutation.error} />
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-start">
          <thead className="bg-bg text-sm text-muted">
            <tr>
              <th scope="col" className="p-3 text-start">
                {t('name')}
              </th>
              <th scope="col" className="p-3 text-start">
                {t('email')}
              </th>
              <th scope="col" className="p-3 text-start">
                {t('roles')}
              </th>
              <th scope="col" className="p-3 text-start">
                {t('status')}
              </th>
              <th scope="col" className="p-3 text-start">
                {t('lastLogin')}
              </th>
              <th scope="col" className="p-3 text-start">
                {tApp('actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {users.data?.items.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="p-3">
                  {locale === 'en' && u.fullNameEn ? u.fullNameEn : u.fullNameAr}
                </td>
                <td className="p-3" dir="ltr">
                  {u.email}
                </td>
                <td className="p-3 text-sm">{u.roles.map(roleName).join('، ')}</td>
                <td className="p-3">
                  <Badge tone={statusTone[u.status]} label={statusLabel[u.status]} />
                </td>
                <td className="p-3 text-sm">
                  {u.lastLoginAt ? formatDateTime(u.lastLoginAt, locale) : t('never')}
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(u)}>
                      {t('edit')}
                    </Button>
                    {perms.has('user.disable') && u.id !== me.data?.id ? (
                      <Button
                        size="sm"
                        variant={u.status === 'disabled' ? 'outline' : 'danger'}
                        onClick={() => statusMutation.mutate(u)}
                      >
                        {u.status === 'disabled' ? t('enable') : t('disable')}
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {users.data?.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted">
                  {tApp('noResults')}
                </td>
              </tr>
            ) : null}
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

const createSchema = createStaffUserSchema
  .omit({ roleKeys: true, locale: true, organizationId: true })
  .extend({ roleKey: z.string().min(1) });

function CreateStaffForm({ roles, onDone }: { roles: RoleRow[]; onDone: () => void }) {
  const t = useTranslations('admin');
  const tAuth = useTranslations('auth');
  const tApp = useTranslations('app');
  const fe = useFieldError();
  const locale = useLocale();
  const [error, setError] = useState<unknown>(null);
  const [created, setCreated] = useState(false);
  const form = useForm<z.input<typeof createSchema>>({ resolver: zodResolver(createSchema) });

  return (
    <Card className="mb-4">
      <h2 className="mb-3 text-lg font-semibold">{t('createStaff')}</h2>
      {created ? (
        <Alert tone="success" className="mb-3">
          {t('userCreated')}
        </Alert>
      ) : null}
      <ErrorAlert error={error} />
      <form
        noValidate
        className="mt-3 grid gap-x-4 md:grid-cols-2"
        onSubmit={form.handleSubmit(async ({ roleKey, ...values }) => {
          setError(null);
          try {
            await api('/admin/users', { body: { ...values, locale, roleKeys: [roleKey] } });
            setCreated(true);
            form.reset();
          } catch (err) {
            setError(err);
          }
        })}
      >
        <FormField
          label={tAuth('fullNameAr')}
          error={form.formState.errors.fullNameAr ? fe('required') : undefined}
          {...form.register('fullNameAr')}
        />
        <FormField
          label={tAuth('fullNameEn')}
          dir="ltr"
          {...form.register('fullNameEn', { setValueAs: (v: string) => v || undefined })}
        />
        <FormField
          label={tAuth('email')}
          type="email"
          dir="ltr"
          error={form.formState.errors.email ? fe('invalidEmail') : undefined}
          {...form.register('email')}
        />
        <div className="mb-4">
          <Label htmlFor="roleKey">{t('roles')}</Label>
          <Select id="roleKey" {...form.register('roleKey')}>
            <option value="">—</option>
            {roles.map((r) => (
              <option key={r.key} value={r.key}>
                {locale === 'ar' ? r.nameAr : r.nameEn}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2 md:col-span-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {tApp('save')}
          </Button>
          <Button variant="outline" onClick={onDone}>
            {tApp('cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function EditUserPanel({
  user,
  roles,
  perms,
  onDone,
}: {
  user: UserRow;
  roles: RoleRow[];
  perms: Set<string>;
  onDone: () => void;
}) {
  const t = useTranslations('admin');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const [selected, setSelected] = useState<string[]>(user.roles);
  const [reference, setReference] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    setSaved(false);
    try {
      await fn();
      setSaved(true);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <Card className="mb-4">
      <h2 className="mb-3 text-lg font-semibold" dir="auto">
        {user.email}
      </h2>
      {saved ? (
        <Alert tone="success" className="mb-3">
          {t('saved')}
        </Alert>
      ) : null}
      <ErrorAlert error={error} />
      {perms.has('user.write') ? (
        <fieldset className="mt-3">
          <legend className="mb-2 font-medium">{t('editRoles')}</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {roles.map((r) => (
              <label key={r.key} className="flex min-h-touch items-center gap-2">
                <input
                  type="checkbox"
                  className="size-5 accent-primary"
                  checked={selected.includes(r.key)}
                  onChange={(e) =>
                    setSelected((s) =>
                      e.target.checked ? [...s, r.key] : s.filter((k) => k !== r.key),
                    )
                  }
                />
                {locale === 'ar' ? r.nameAr : r.nameEn}
              </label>
            ))}
          </div>
          <Button
            className="mt-3"
            onClick={() =>
              run(() =>
                api(`/admin/users/${user.id}/roles`, {
                  method: 'PUT',
                  body: { roleKeys: selected },
                }),
              )
            }
          >
            {tApp('save')}
          </Button>
        </fieldset>
      ) : null}
      {perms.has('mfa.reset') && user.mfaEnabled ? (
        <div className="mt-6 max-w-md">
          <Label htmlFor="identity-ref">{t('identityCheck')}</Label>
          <Input
            id="identity-ref"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <Button
            variant="danger"
            className="mt-2"
            disabled={reference.trim().length < 3}
            onClick={() =>
              run(() =>
                api(`/admin/users/${user.id}/mfa-reset`, {
                  body: { identityCheckReference: reference },
                }),
              )
            }
          >
            {t('resetMfa')}
          </Button>
        </div>
      ) : null}
      {perms.has('user.write') && user.lockedUntil ? (
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => run(() => api(`/admin/users/${user.id}/unlock`, { method: 'POST' }))}
        >
          {t('unlock')}
        </Button>
      ) : null}
      <div className="mt-6">
        <Button variant="outline" onClick={onDone}>
          {tApp('back')}
        </Button>
      </div>
    </Card>
  );
}
