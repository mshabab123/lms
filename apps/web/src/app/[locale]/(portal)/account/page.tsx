'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { changePasswordSchema, type MeResponse } from '@mzn/shared';
import { Alert, Badge, Button, Card, CardTitle, buttonVariants } from '@mzn/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api-client';
import { formatDateTime } from '@/lib/dates';
import { ErrorAlert, useFieldError } from '@/components/error-message';
import { FormField } from '@/components/form-field';

interface SessionRow {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  lastSeenAt: string;
  current: boolean;
}

export default function AccountPage() {
  const t = useTranslations('account');
  const tAuth = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<MeResponse>('/auth/me') });
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api<{ items: SessionRow[] }>('/auth/sessions'),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/auth/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });
  const logoutAll = useMutation({
    mutationFn: () => api('/auth/logout-all', { method: 'POST' }),
    onSuccess: () => router.replace('/login'),
  });

  return (
    <div className="mx-auto grid max-w-4xl gap-4">
      <h1>{t('title')}</h1>

      <Card>
        <CardTitle>{t('profile')}</CardTitle>
        {me.data ? (
          <dl className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted">{tAuth('fullNameAr')}</dt>
            <dd>{me.data.fullNameAr}</dd>
            <dt className="text-muted">{tAuth('email')}</dt>
            <dd dir="ltr" className="text-start">
              {me.data.email}
            </dd>
          </dl>
        ) : null}
      </Card>

      <Card>
        <CardTitle>{t('security')}</CardTitle>
        {me.data?.mfaEnabled ? (
          <Badge tone="success" label={tAuth('mfaTitle')} />
        ) : (
          <Link href="/mfa-setup" className={buttonVariants({ variant: 'outline' })}>
            {t('setupMfa')}
          </Link>
        )}
      </Card>

      <Card>
        <CardTitle>{t('sessions')}</CardTitle>
        <p className="mb-3 text-sm text-muted">{t('sessionsIntro')}</p>
        <ErrorAlert error={revoke.error ?? logoutAll.error} />
        <ul className="divide-y divide-border" data-testid="sessions">
          {sessions.data?.items.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm" dir="ltr">
                  {s.userAgent ?? t('unknownDevice')}
                </p>
                <p className="text-sm text-muted">
                  {t('lastSeen')}: {formatDateTime(s.lastSeenAt, locale)}
                </p>
              </div>
              {s.current ? (
                <Badge tone="info" label={t('current')} />
              ) : (
                <Button variant="outline" size="sm" onClick={() => revoke.mutate(s.id)}>
                  {t('revoke')}
                </Button>
              )}
            </li>
          ))}
        </ul>
        <Button variant="danger" className="mt-4" onClick={() => logoutAll.mutate()}>
          {t('logoutAll')}
        </Button>
      </Card>

      <ChangePasswordCard />
    </div>
  );
}

function ChangePasswordCard() {
  const t = useTranslations('account');
  const tAuth = useTranslations('auth');
  const fe = useFieldError();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const form = useForm<{ currentPassword: string; newPassword: string }>({
    resolver: zodResolver(changePasswordSchema),
  });
  return (
    <Card>
      <CardTitle>{t('changePassword')}</CardTitle>
      {done ? <Alert tone="success">{t('passwordChanged')}</Alert> : null}
      <ErrorAlert error={error} />
      <form
        noValidate
        className="mt-3 max-w-md"
        onSubmit={form.handleSubmit(async (values) => {
          setError(null);
          setDone(false);
          try {
            await api('/auth/password/change', { body: values });
            setDone(true);
            form.reset();
          } catch (err) {
            setError(err);
          }
        })}
      >
        <FormField
          label={tAuth('currentPassword')}
          type="password"
          autoComplete="current-password"
          {...form.register('currentPassword')}
        />
        <FormField
          label={tAuth('newPassword')}
          type="password"
          autoComplete="new-password"
          hint={tAuth('passwordHint')}
          error={fe(form.formState.errors.newPassword?.message)}
          {...form.register('newPassword')}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {t('changePassword')}
        </Button>
      </form>
    </Card>
  );
}
