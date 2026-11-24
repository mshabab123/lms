'use client';

import { useTranslations } from 'next-intl';
import { Alert } from '@mzn/ui';
import { ApiError } from '@/lib/api-client';

/** Translates an API error code into a localized, accessible alert. */
export function useErrorText(): (err: unknown) => string {
  const t = useTranslations('errors');
  return (err: unknown) => {
    if (err instanceof ApiError) {
      if (err.code === 'RATE_LIMITED') {
        return t('RATE_LIMITED', { seconds: Number(err.details?.retryAfterSeconds ?? 60) });
      }
      if (t.has(err.code)) return t(err.code);
    }
    return t('generic');
  };
}

export function ErrorAlert({ error }: { error: unknown }) {
  const text = useErrorText();
  if (!error) return null;
  return <Alert tone="danger">{text(error)}</Alert>;
}

/** Maps a Zod issue message (an i18n key or default) to text. */
export function useFieldError(): (message: string | undefined) => string | undefined {
  const t = useTranslations('errors');
  return (message) => {
    if (!message) return undefined;
    return t.has(message) ? t(message) : t('VALIDATION_FAILED');
  };
}
