import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations('notFound');
  return (
    <main id="main" className="mx-auto max-w-lg p-8 text-center">
      <h1 className="mb-4">{t('title')}</h1>
      <Link href="/">{t('back')}</Link>
    </main>
  );
}
