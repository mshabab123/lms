'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import {
  emailSchema,
  loginSchema,
  otpCodeSchema,
  recoveryCodeSchema,
  type LoginResult,
} from '@mzn/shared';
import { Alert, Button, Card } from '@mzn/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api-client';
import { ErrorAlert, useFieldError } from '@/components/error-message';
import { FormField } from '@/components/form-field';

type Step = 'password' | 'email-code' | 'mfa';

export function LoginForm({ initialStep }: { initialStep: Step }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialStep);

  function onResult(result: LoginResult) {
    if (result.status === 'mfa_required') setStep('mfa');
    else if (result.status === 'mfa_enrolment_required') router.replace('/mfa-setup');
    else {
      router.replace('/dashboard');
      router.refresh();
    }
  }

  return (
    <Card>
      <h1 className="mb-6">{step === 'mfa' ? t('mfaTitle') : t('loginTitle')}</h1>
      {step === 'password' ? (
        <PasswordStep onResult={onResult} onEmailCode={() => setStep('email-code')} />
      ) : null}
      {step === 'email-code' ? (
        <EmailCodeStep onResult={onResult} onPassword={() => setStep('password')} />
      ) : null}
      {step === 'mfa' ? <MfaStep onResult={onResult} /> : null}
      {step !== 'mfa' ? (
        <p className="mt-6 text-sm">
          {t('noAccount')} <Link href="/register">{t('submitRegister')}</Link>
        </p>
      ) : null}
    </Card>
  );
}

function PasswordStep({
  onResult,
  onEmailCode,
}: {
  onResult: (r: LoginResult) => void;
  onEmailCode: () => void;
}) {
  const t = useTranslations('auth');
  const fe = useFieldError();
  const [error, setError] = useState<unknown>(null);
  const form = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        setError(null);
        try {
          onResult(await api<LoginResult>('/auth/login', { body: values }));
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
          autoComplete="username"
          dir="ltr"
          error={form.formState.errors.email ? fe('invalidEmail') : undefined}
          {...form.register('email')}
        />
        <FormField
          label={t('password')}
          type="password"
          autoComplete="current-password"
          error={fe(form.formState.errors.password ? 'required' : undefined)}
          {...form.register('password')}
        />
      </div>
      <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
        {t('submitLogin')}
      </Button>
      <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
        <Link href="/forgot-password">{t('forgotPassword')}</Link>
        <button
          type="button"
          className="text-primary underline-offset-2 hover:underline"
          onClick={onEmailCode}
        >
          {t('useEmailCode')}
        </button>
      </div>
    </form>
  );
}

function EmailCodeStep({
  onResult,
  onPassword,
}: {
  onResult: (r: LoginResult) => void;
  onPassword: () => void;
}) {
  const t = useTranslations('auth');
  const fe = useFieldError();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const emailForm = useForm<{ email: string }>({
    resolver: zodResolver(z.object({ email: emailSchema })),
  });
  const codeForm = useForm<{ code: string }>({
    resolver: zodResolver(z.object({ code: otpCodeSchema })),
  });

  return (
    <div>
      <ErrorAlert error={error} />
      {!sentTo ? (
        <form
          noValidate
          className="mt-4"
          onSubmit={emailForm.handleSubmit(async ({ email }) => {
            setError(null);
            try {
              await api('/auth/email-otp/request', { body: { email } });
              setSentTo(email);
            } catch (err) {
              setError(err);
            }
          })}
        >
          <FormField
            label={t('email')}
            type="email"
            dir="ltr"
            autoComplete="username"
            error={emailForm.formState.errors.email ? fe('invalidEmail') : undefined}
            {...emailForm.register('email')}
          />
          <Button type="submit" className="w-full" disabled={emailForm.formState.isSubmitting}>
            {t('sendCode')}
          </Button>
        </form>
      ) : (
        <form
          noValidate
          className="mt-4"
          onSubmit={codeForm.handleSubmit(async ({ code }) => {
            setError(null);
            try {
              onResult(
                await api<LoginResult>('/auth/email-otp/verify', { body: { email: sentTo, code } }),
              );
            } catch (err) {
              setError(err);
            }
          })}
        >
          <Alert tone="info" className="mb-4">
            {t('codeSent')}
          </Alert>
          <FormField
            label={t('code')}
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            maxLength={6}
            error={fe(codeForm.formState.errors.code?.message)}
            {...codeForm.register('code')}
          />
          <Button type="submit" className="w-full" disabled={codeForm.formState.isSubmitting}>
            {t('verify')}
          </Button>
        </form>
      )}
      <button
        type="button"
        className="mt-4 text-sm text-primary underline-offset-2 hover:underline"
        onClick={onPassword}
      >
        {t('usePassword')}
      </button>
    </div>
  );
}

function MfaStep({ onResult }: { onResult: (r: LoginResult) => void }) {
  const t = useTranslations('auth');
  const fe = useFieldError();
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const schema = useRecovery
    ? z.object({ value: recoveryCodeSchema })
    : z.object({ value: otpCodeSchema });
  const form = useForm<{ value: string }>({ resolver: zodResolver(schema) });

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async ({ value }) => {
        setError(null);
        try {
          const body = useRecovery ? { recoveryCode: value } : { code: value };
          onResult(await api<LoginResult>('/auth/mfa/verify', { body }));
        } catch (err) {
          setError(err);
        }
      })}
    >
      <p className="mb-4 text-muted">{t('mfaPrompt')}</p>
      <ErrorAlert error={error} />
      <div className="mt-4">
        <FormField
          key={useRecovery ? 'recovery' : 'totp'}
          label={useRecovery ? t('recoveryCode') : t('code')}
          inputMode={useRecovery ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          dir="ltr"
          autoFocus
          error={fe(form.formState.errors.value?.message)}
          {...form.register('value')}
        />
      </div>
      <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
        {t('verify')}
      </Button>
      <button
        type="button"
        className="mt-4 text-sm text-primary underline-offset-2 hover:underline"
        onClick={() => {
          form.reset();
          setUseRecovery((v) => !v);
        }}
      >
        {useRecovery ? t('useTotp') : t('useRecoveryCode')}
      </button>
    </form>
  );
}
