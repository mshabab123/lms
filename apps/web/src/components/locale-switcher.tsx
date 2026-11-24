'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Languages } from 'lucide-react';
import { usePathname, useRouter } from '@/i18n/navigation';

export function LocaleSwitcher({ persist = false }: { persist?: boolean }) {
  const t = useTranslations('app');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const target = locale === 'ar' ? 'en' : 'ar';

  async function switchLocale() {
    if (persist) {
      await fetch('/api/v1/auth/locale', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-mzn-csrf': '1' },
        body: JSON.stringify({ locale: target }),
      }).catch(() => undefined);
    }
    router.replace(pathname, { locale: target });
  }

  return (
    <button
      type="button"
      onClick={switchLocale}
      lang={target}
      aria-label={t('switchLocaleLabel')}
      className="inline-flex min-h-touch items-center gap-2 rounded-control px-3 text-sm font-medium text-ink hover:bg-primary-soft"
    >
      <Languages aria-hidden="true" size={18} />
      {t('switchLocale')}
    </button>
  );
}
