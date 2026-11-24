import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buttonVariants } from '@mzn/ui';
import { Link } from '@/i18n/navigation';
import { PublicHeader } from '@/components/public-header';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');
  return (
    <>
      <PublicHeader />
      <main id="main" className="mx-auto max-w-5xl px-4 py-12 md:py-20">
        <h1 className="mb-4 text-3xl font-bold md:text-4xl">{t('title')}</h1>
        <p className="mb-8 max-w-2xl text-lg text-muted">{t('subtitle')}</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/register" className={buttonVariants({ variant: 'accent' })}>
            {t('register')}
          </Link>
          <Link href="/login" className={buttonVariants({ variant: 'outline' })}>
            {t('login')}
          </Link>
        </div>
        <p className="mt-12 text-sm text-muted">{t('catalogSoon')}</p>
      </main>
    </>
  );
}
