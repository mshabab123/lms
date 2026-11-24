'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { z } from 'zod';
import { registerSchema } from '@mzn/shared';
import { Alert, Button, Card, FieldError } from '@mzn/ui';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api-client';
import { ErrorAlert, useFieldError } from '@/components/error-message';
import { FormField } from '@/components/form-field';

const formSchema = registerSchema
  .omit({ privacyNoticeVersion: true, termsVersion: true, locale: true })
  .extend({ acceptPolicies: z.literal(true, { errorMap: () => ({ message: 'mustAccept' }) }) });
type FormValues = z.input<typeof formSchema>;

export function RegisterForm({
  policies,
}: {
  policies: { privacyNoticeVersion: string; termsVersion: string };
}) {
  const t = useTranslations('auth');
  const fe = useFieldError();
  const locale = useLocale() as 'ar' | 'en';
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { marketingConsent: false },
  });
  const errors = form.formState.errors;

  if (done) {
    return (
      <Card>
        <h1 className="mb-4">{t('registerTitle')}</h1>
        <Alert tone="success">{t('registered')}</Alert>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="mb-6">{t('registerTitle')}</h1>
      <form
        noValidate
        onSubmit={form.handleSubmit(async ({ acceptPolicies: _accepted, ...values }) => {
          setError(null);
          try {
            await api('/auth/register', { body: { ...values, locale, ...policies } });
            setDone(true);
          } catch (err) {
            setError(err);
          }
        })}
      >
        <ErrorAlert error={error} />
        <div className="mt-4">
          <FormField
            label={t('fullNameAr')}
            autoComplete="name"
            error={errors.fullNameAr ? fe('required') : undefined}
            {...form.register('fullNameAr')}
          />
          <FormField
            label={t('fullNameEn')}
            dir="ltr"
            lang="en"
            {...form.register('fullNameEn', { setValueAs: (v: string) => v || undefined })}
          />
          <FormField
            label={t('email')}
            type="email"
            dir="ltr"
            autoComplete="email"
            error={errors.email ? fe('invalidEmail') : undefined}
            {...form.register('email')}
          />
          <FormField
            label={t('mobile')}
            type="tel"
            dir="ltr"
            autoComplete="tel"
            hint={t('mobileHint')}
            error={fe(errors.mobile?.message)}
            {...form.register('mobile')}
          />
          <FormField
            label={t('password')}
            type="password"
            autoComplete="new-password"
            hint={t('passwordHint')}
            error={fe(errors.password?.message)}
            {...form.register('password')}
          />
        </div>

        <div className="mb-3 flex items-start gap-3">
          <input
            id="acceptPolicies"
            type="checkbox"
            className="mt-1 size-5 accent-primary"
            aria-invalid={errors.acceptPolicies ? true : undefined}
            aria-describedby={errors.acceptPolicies ? 'acceptPolicies-error' : undefined}
            {...form.register('acceptPolicies')}
          />
          <label htmlFor="acceptPolicies" className="text-sm">
            {t('acceptPrivacy', { version: policies.privacyNoticeVersion })}
          </label>
        </div>
        <FieldError id="acceptPolicies-error">
          {errors.acceptPolicies ? fe('mustAccept') : undefined}
        </FieldError>

        <div className="mb-6 mt-3 flex items-start gap-3">
          <input
            id="marketingConsent"
            type="checkbox"
            className="mt-1 size-5 accent-primary"
            {...form.register('marketingConsent')}
          />
          <label htmlFor="marketingConsent" className="text-sm">
            {t('marketingConsent')}
          </label>
        </div>

        <Button
          type="submit"
          variant="accent"
          className="w-full"
          disabled={form.formState.isSubmitting}
        >
          {t('submitRegister')}
        </Button>
        <p className="mt-6 text-sm">
          {t('haveAccount')} <Link href="/login">{t('submitLogin')}</Link>
        </p>
      </form>
    </Card>
  );
}
