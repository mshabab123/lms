'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { passwordSchema } from '@mzn/shared';
import { Alert, Button, Card, buttonVariants } from '@mzn/ui';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api-client';
import { ErrorAlert, useFieldError } from '@/components/error-message';
import { FormField } from '@/components/form-field';

export function ResetPasswordClient({ token }: { token: string }) {
  const t = useTranslations('auth');
  const tApp = useTranslations('app');
  const fe = useFieldError();

  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const form = useForm<{ password: string }>({
    resolver: zodResolver(z.object({ password: passwordSchema })),
  });

  return (
    <Card>
      <h1 className="mb-6">{t('resetTitle')}</h1>
      {done ? (
        <>
          <Alert tone="success">{t('resetDone')}</Alert>
          <Link href="/login" className={`${buttonVariants()} mt-4 w-full`}>
            {t('submitLogin')}
          </Link>
        </>
      ) : (
        <form
          noValidate
          onSubmit={form.handleSubmit(async ({ password }) => {
            setError(null);
            try {
              await api('/auth/password/reset', { body: { token, password } });
              setDone(true);
            } catch (err) {
              setError(err);
            }
          })}
        >
          <ErrorAlert error={error} />
          <div className="mt-4">
            <FormField
              label={t('newPassword')}
              type="password"
              autoComplete="new-password"
              hint={t('passwordHint')}
              error={fe(form.formState.errors.password?.message)}
              {...form.register('password')}
            />
          </div>
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {tApp('save')}
          </Button>
        </form>
      )}
    </Card>
  );
}
