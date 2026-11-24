import { getLocale, getTranslations } from 'next-intl/server';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { visibleNav } from '@mzn/shared';
import { Badge, Card, CardTitle } from '@mzn/ui';
import { Link } from '@/i18n/navigation';
import { IMPLEMENTED_NAV } from '@/lib/implemented';
import { getMe } from '@/lib/server-api';

export default async function DashboardPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const { me } = await getMe();
  if (!me) return null; // layout already redirected
  const name = locale === 'en' && me.fullNameEn ? me.fullNameEn : me.fullNameAr;
  const modules = visibleNav(me.permissions).filter(
    (n) => IMPLEMENTED_NAV.has(n.key) && n.key !== 'dashboard',
  );

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-2">{t('dashboard.welcome', { name })}</h1>
      <p className="mb-6 text-muted">{t('dashboard.intro')}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>{t('dashboard.rolesLabel')}</CardTitle>
          <ul className="flex flex-wrap gap-2" data-testid="roles">
            {me.roles.map((r) => (
              <li key={r}>
                <Badge tone="info" label={r} />
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle>{t('dashboard.securityCard')}</CardTitle>
          {me.mfaEnabled ? (
            <Badge tone="success" icon={<ShieldCheck size={16} />} label={t('dashboard.mfaOn')} />
          ) : (
            <Badge tone="warning" icon={<ShieldAlert size={16} />} label={t('dashboard.mfaOff')} />
          )}
          <p className="mt-3">
            <Link href="/account">{t('dashboard.manageAccount')}</Link>
          </p>
        </Card>
        <Card className="md:col-span-2">
          <CardTitle>{t('dashboard.availableModules')}</CardTitle>
          <ul className="grid gap-2 sm:grid-cols-2">
            {modules.map((m) => (
              <li key={m.key}>
                <Link href={m.href}>{t(`nav.${m.key}`)}</Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
