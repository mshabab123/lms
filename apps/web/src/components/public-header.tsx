import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from './locale-switcher';

export function PublicHeader() {
  const t = useTranslations('app');
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold text-primary no-underline">
          {t('name')}
        </Link>
        <LocaleSwitcher />
      </div>
    </header>
  );
}
