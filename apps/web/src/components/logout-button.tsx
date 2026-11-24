'use client';

import { useTranslations } from 'next-intl';
import { LogOut } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api-client';

export function LogoutButton() {
  const t = useTranslations('auth');
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
        router.replace('/login');
        router.refresh();
      }}
      className="inline-flex min-h-touch items-center gap-2 rounded-control px-3 text-sm font-medium text-ink hover:bg-primary-soft"
    >
      <LogOut aria-hidden="true" size={18} className="rtl:rotate-180" />
      {t('logout')}
    </button>
  );
}
