'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Award,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  GraduationCap,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Library,
  LifeBuoy,
  Megaphone,
  Menu,
  Plug,
  Presentation,
  ScrollText,
  Settings,
  Shield,
  User,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { NavItem } from '@mzn/shared';
import { cn } from '@mzn/ui';
import { Link, usePathname } from '@/i18n/navigation';
import { LocaleSwitcher } from './locale-switcher';
import { LogoutButton } from './logout-button';

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  learning: GraduationCap,
  calendar: CalendarDays,
  teaching: Presentation,
  programs: Library,
  sections: Users,
  enrollments: ClipboardList,
  approvals: CheckCircle2,
  payments: CreditCard,
  finance: Landmark,
  marketing: Megaphone,
  certificates: Award,
  support: LifeBuoy,
  sponsor: Building2,
  reports: BarChart3,
  privacy: Shield,
  users: UserCog,
  roles: KeyRound,
  audit: ScrollText,
  integrations: Plug,
  settings: Settings,
  account: User,
};

export function AppShell({
  nav,
  userName,
  children,
}: {
  nav: NavItem[];
  userName: string;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const navList = (
    <ul className="flex flex-col gap-1 p-3">
      {nav.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-touch items-center gap-3 rounded-control px-3 text-base text-white/90 no-underline hover:bg-white/10 hover:no-underline focus-visible:outline-accent',
                active && 'bg-white/15 font-semibold text-white',
              )}
            >
              <Icon aria-hidden="true" size={20} />
              <span>{t(`nav.${item.key}`)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar: at the start edge (right in RTL, left in LTR). */}
      <nav aria-label={t('app.mainNav')} className="hidden w-64 shrink-0 bg-primary lg:block">
        <div className="flex h-16 items-center px-5 text-lg font-bold text-white">
          {t('app.name')}
        </div>
        {navList}
      </nav>

      {/* Mobile drawer */}
      {open ? (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={t('app.mainNav')}
        >
          <button
            type="button"
            className="absolute inset-0 bg-ink/40"
            aria-label={t('app.closeMenu')}
            onClick={() => setOpen(false)}
          />
          <nav className="absolute inset-y-0 start-0 w-72 overflow-y-auto bg-primary">
            <div className="flex h-16 items-center justify-between px-4 text-white">
              <span className="text-lg font-bold">{t('app.name')}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex size-11 items-center justify-center rounded-control hover:bg-white/10"
                aria-label={t('app.closeMenu')}
              >
                <X aria-hidden="true" />
              </button>
            </div>
            {navList}
          </nav>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-2 border-b border-border bg-surface px-4">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex size-11 items-center justify-center rounded-control hover:bg-primary-soft lg:hidden"
            aria-label={t('app.openMenu')}
            aria-expanded={open}
          >
            <Menu aria-hidden="true" />
          </button>
          <span className="truncate font-semibold lg:hidden">{t('app.name')}</span>
          <div className="ms-auto flex items-center gap-1">
            <span className="hidden text-sm text-muted sm:inline" data-testid="user-name">
              {userName}
            </span>
            <LocaleSwitcher persist />
            <LogoutButton />
          </div>
        </header>
        <main id="main" className="flex-1 p-4 md:p-6" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
