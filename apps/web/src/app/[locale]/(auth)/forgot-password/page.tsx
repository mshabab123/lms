'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { passwordResetRequestSchema } from '@mzn/shared';
import { Alert, Button, Card } from '@mzn/ui';
import { api } from '@/lib/api-client';
import { ErrorAlert, useFieldError } from '@/components/error-message';
import { FormField } from '@/components/form-field';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth');
  const fe = useFieldError();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const form = useForm<{ email: string }>({ resolver: zodResolver(passwordResetRequestSchema) });

  return (
    <Card>
      <h1 className="mb-6">{t('forgotTitle')}</h1>
      {sent ? (
        <Alert tone="success">{t('forgotSent')}</Alert>
      ) : (
        <form
          noValidate
          onSubmit={form.handleSubmit(async (values) => {
            setError(null);
            try {
              await api('/auth/password/reset-request', { body: values });
              setSent(true);
            } catch (err) {
              setError(err);
            }
          })}
        >
          <ErrorAlert error={error} />
          <div className="mt-4">
            <FormField
              label={t('email')}
              type="email"
              dir="ltr"
              autoComplete="email"
              error={form.formState.errors.email ? fe('invalidEmail') : undefined}
              {...form.register('email')}
            />
          </div>
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {t('sendResetLink')}
          </Button>
        </form>
      )}
    </Card>
  );
}
