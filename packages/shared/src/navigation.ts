import { PERMISSIONS, type Permission } from './permissions';

/**
 * Unified portal navigation. A menu item is visible when the user holds ANY of
 * its permissions (empty list = every signed-in user). The API still enforces
 * every action independently; hiding a menu item is a UX concern only.
 */
export interface NavItem {
  key: string;
  href: string;
  icon: string;
  anyOf: readonly Permission[];
}

const P = PERMISSIONS;

export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'dashboard', href: '/dashboard', icon: 'dashboard', anyOf: [] },
  { key: 'myLearning', href: '/learning', icon: 'learning', anyOf: [P.ENROLLMENT_SELF] },
  {
    key: 'calendar',
    href: '/calendar',
    icon: 'calendar',
    anyOf: [P.SESSION_ATTEND, P.SESSION_HOST, P.SESSION_READ],
  },
  { key: 'teaching', href: '/teaching', icon: 'teaching', anyOf: [P.SESSION_HOST] },
  {
    key: 'programs',
    href: '/manage/programs',
    icon: 'programs',
    anyOf: [P.PROGRAM_WRITE, P.PROGRAM_MARKETING_EDIT],
  },
  { key: 'sections', href: '/manage/sections', icon: 'sections', anyOf: [P.SECTION_WRITE] },
  {
    key: 'enrollments',
    href: '/manage/enrollments',
    icon: 'enrollments',
    anyOf: [P.ENROLLMENT_MANAGE],
  },
  {
    key: 'approvals',
    href: '/approvals',
    icon: 'approvals',
    anyOf: [P.GRADE_APPROVE, P.CERTIFICATE_APPROVE, P.ATTENDANCE_CORRECT_APPROVE],
  },
  { key: 'myPayments', href: '/payments', icon: 'payments', anyOf: [P.ORDER_SELF] },
  {
    key: 'finance',
    href: '/finance',
    icon: 'finance',
    anyOf: [P.PAYMENT_READ, P.REFUND_APPROVE, P.FINANCE_REPORT],
  },
  {
    key: 'marketing',
    href: '/marketing',
    icon: 'marketing',
    anyOf: [P.LEAD_MANAGE, P.COUPON_DRAFT],
  },
  {
    key: 'certificates',
    href: '/certificates',
    icon: 'certificates',
    anyOf: [P.CERTIFICATE_READ_OWN, P.CERTIFICATE_READ],
  },
  { key: 'support', href: '/support', icon: 'support', anyOf: [P.TICKET_SELF, P.TICKET_MANAGE] },
  { key: 'sponsor', href: '/sponsor', icon: 'sponsor', anyOf: [P.SPONSOR_READ] },
  {
    key: 'reports',
    href: '/reports',
    icon: 'reports',
    anyOf: [P.REPORT_READ, P.DASHBOARD_EXECUTIVE],
  },
  {
    key: 'privacy',
    href: '/privacy',
    icon: 'privacy',
    anyOf: [P.PRIVACY_REQUEST_SELF, P.PRIVACY_REQUEST_MANAGE],
  },
  { key: 'users', href: '/admin/users', icon: 'users', anyOf: [P.USER_READ] },
  { key: 'roles', href: '/admin/roles', icon: 'roles', anyOf: [P.ROLE_READ] },
  { key: 'audit', href: '/admin/audit', icon: 'audit', anyOf: [P.AUDIT_READ] },
  {
    key: 'integrations',
    href: '/admin/integrations',
    icon: 'integrations',
    anyOf: [P.INTEGRATION_READ],
  },
  { key: 'settings', href: '/admin/settings', icon: 'settings', anyOf: [P.SETTING_READ] },
  { key: 'account', href: '/account', icon: 'account', anyOf: [] },
];

export function visibleNav(permissions: Iterable<string>): NavItem[] {
  const held = new Set(permissions);
  return NAV_ITEMS.filter((item) => item.anyOf.length === 0 || item.anyOf.some((p) => held.has(p)));
}
