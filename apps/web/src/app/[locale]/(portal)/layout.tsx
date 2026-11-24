import { getLocale } from 'next-intl/server';
import { visibleNav } from '@mzn/shared';
import { redirect } from '@/i18n/navigation';
import { AppShell } from '@/components/app-shell';
import { IMPLEMENTED_NAV } from '@/lib/implemented';
import { getMe } from '@/lib/server-api';

/**
 * Authenticated portal shell. The menu is derived from the permissions the API
 * reports for this session; the API still enforces every request.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const { me, status } = await getMe();
  if (!me) {
    // 403 MFA_REQUIRED never reaches here (/auth/me allows pending MFA); 401 → sign in.
    return redirect({ href: status === 401 ? '/login' : '/login?error=unavailable', locale });
  }
  if (me.mfaPending)
    return redirect({ href: me.mfaEnabled ? '/login?step=mfa' : '/mfa-setup', locale });

  const nav = visibleNav(me.permissions).filter((item) => IMPLEMENTED_NAV.has(item.key));
  const userName = locale === 'en' && me.fullNameEn ? me.fullNameEn : me.fullNameAr;
  return (
    <AppShell nav={nav} userName={userName}>
      {children}
    </AppShell>
  );
}

// Reads per-request data (cookies, query or live policy versions): never prerender.
export const dynamic = 'force-dynamic';
