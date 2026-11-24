'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert, Card, buttonVariants } from '@mzn/ui';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api-client';
import { ErrorAlert } from '@/components/error-message';

export function VerifyEmailClient({ token }: { token: string }) {
  const t = useTranslations('auth');

  const [state, setState] = useState<'pending' | 'done' | 'error'>('pending');
  const [error, setError] = useState<unknown>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setState('error');
      return;
    }
    api('/auth/verify-email', { body: { token } })
      .then(() => setState('done'))
      .catch((err: unknown) => {
        setError(err);
        setState('error');
      });
  }, [token]);

  return (
    <Card>
      <h1 className="mb-4">{t('verifyTitle')}</h1>
      <div aria-live="polite">
        {state === 'pending' ? <p>{t('verifying')}</p> : null}
        {state === 'done' ? (
          <>
            <Alert tone="success">{t('verified')}</Alert>
            <Link href="/login" className={`${buttonVariants()} mt-4 w-full`}>
              {t('submitLogin')}
            </Link>
          </>
        ) : null}
        {state === 'error' ? <ErrorAlert error={error ?? new Error('invalid')} /> : null}
      </div>
    </Card>
  );
}
