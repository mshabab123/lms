'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { mfaEnableSchema } from '@mzn/shared';
import { Button, Card } from '@mzn/ui';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api-client';
import { ErrorAlert, useFieldError } from '@/components/error-message';
import { FormField } from '@/components/form-field';

interface Setup {
  otpauthUrl: string;
  qrDataUrl: string;
  secret: string;
}

export default function MfaSetupPage() {
  const t = useTranslations('auth');
  const fe = useFieldError();
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const started = useRef(false);
  const form = useForm<{ code: string }>({ resolver: zodResolver(mfaEnableSchema) });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api<Setup>('/auth/mfa/setup', { method: 'POST' })
      .then(setSetup)
      .catch((err: unknown) => {
        if (err && typeof err === 'object' && 'status' in err && err.status === 401)
          router.replace('/login');
        else setError(err);
      });
  }, [router]);

  if (codes) {
    return (
      <Card>
        <h1 className="mb-4">{t('recoveryCodesTitle')}</h1>
        <p className="mb-4 text-muted">{t('recoveryCodesIntro')}</p>
        <ul
          className="mb-6 grid grid-cols-2 gap-2 font-mono"
          dir="ltr"
          data-testid="recovery-codes"
        >
          {codes.map((c) => (
            <li key={c} className="rounded-control bg-bg p-2 text-center">
              {c}
            </li>
          ))}
        </ul>
        <Button
          className="w-full"
          onClick={() => {
            router.replace('/dashboard');
            router.refresh();
          }}
        >
          {t('continue')}
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="mb-4">{t('mfaSetupTitle')}</h1>
      <p className="mb-4 text-muted">{t('mfaSetupIntro')}</p>
      <ErrorAlert error={error} />
      {setup ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL QR code */}
          <img src={setup.qrDataUrl} alt="" width={200} height={200} className="mx-auto my-4" />
          <p className="text-sm">{t('mfaSecretManual')}</p>
          <p
            className="mb-4 break-all rounded-control bg-bg p-2 font-mono text-sm"
            dir="ltr"
            data-testid="mfa-secret"
          >
            {setup.secret}
          </p>
          <form
            noValidate
            onSubmit={form.handleSubmit(async ({ code }) => {
              setError(null);
              try {
                const res = await api<{ recoveryCodes: string[] }>('/auth/mfa/enable', {
                  body: { code },
                });
                setCodes(res.recoveryCodes);
              } catch (err) {
                setError(err);
              }
            })}
          >
            <FormField
              label={t('code')}
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              maxLength={6}
              error={fe(form.formState.errors.code?.message)}
              {...form.register('code')}
            />
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {t('enable')}
            </Button>
          </form>
        </>
      ) : null}
    </Card>
  );
}
