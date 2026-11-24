import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLES,
  ENROLLMENT_STATUSES,
  ENROLLMENT_TRANSITIONS,
  InvalidTransitionError,
  NAV_ITEMS,
  PERMISSIONS,
  REFUND_TRANSITIONS,
  assertTransition,
  canTransition,
  registerSchema,
  vatOnNet,
  visibleNav,
} from './index';

const WRITE_SUFFIXES =
  /\.(write|approve|issue|request|record|send|draft|manage|disable|revoke|amend|enroll|publish|host|reconcile|correct_request|correct_approve|marketing_edit|reset|resolve)$/;

describe('permission catalogue', () => {
  it('has unique permission values', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });

  it('every role permission exists in the catalogue', () => {
    for (const role of DEFAULT_ROLES) {
      for (const p of role.permissions) expect(ALL_PERMISSIONS).toContain(p);
    }
  });

  it('executive and compliance officer hold no business write permissions', () => {
    for (const key of ['executive'] as const) {
      const role = DEFAULT_ROLES.find((r) => r.key === key)!;
      expect(role.permissions.filter((p) => WRITE_SUFFIXES.test(p))).toEqual([]);
    }
    const compliance = DEFAULT_ROLES.find((r) => r.key === 'compliance_officer')!;
    // Compliance manages privacy requests and breach registers only (compliance writes, not business writes).
    const businessWrites = compliance.permissions.filter(
      (p) =>
        WRITE_SUFFIXES.test(p) &&
        !['privacy_request.manage', 'breach.manage', 'processing_record.manage'].includes(p),
    );
    expect(businessWrites).toEqual([]);
  });

  it('enforces role boundaries from spec section 4', () => {
    const perms = (k: string) => new Set(DEFAULT_ROLES.find((r) => r.key === k)!.permissions);
    expect(perms('instructor').has(PERMISSIONS.CERTIFICATE_APPROVE)).toBe(false);
    expect(perms('instructor').has(PERMISSIONS.PAYMENT_READ)).toBe(false);
    expect(perms('finance_officer').has(PERMISSIONS.REFUND_APPROVE)).toBe(false);
    expect(perms('finance_manager').has(PERMISSIONS.REFUND_APPROVE)).toBe(true);
    expect(perms('marketing_officer').has(PERMISSIONS.COUPON_APPROVE)).toBe(false);
    expect(perms('marketing_officer').has(PERMISSIONS.ROSTER_EXPORT)).toBe(false);
    expect(perms('marketing_officer').has(PERMISSIONS.PRICE_WRITE)).toBe(false);
    expect(perms('support_agent').has(PERMISSIONS.GRADE_READ)).toBe(false);
    expect(perms('admissions_officer').has(PERMISSIONS.GRADE_APPROVE)).toBe(false);
  });

  it('builds role-specific navigation', () => {
    const trainee = DEFAULT_ROLES.find((r) => r.key === 'trainee')!;
    const keys = visibleNav(trainee.permissions).map((i) => i.key);
    expect(keys).toContain('myLearning');
    expect(keys).not.toContain('users');
    expect(keys).not.toContain('finance');
    expect(NAV_ITEMS.every((i) => i.href.startsWith('/'))).toBe(true);
  });
});

describe('state machines', () => {
  it('enrollment matrix covers every status and terminal states are final', () => {
    for (const s of ENROLLMENT_STATUSES) expect(ENROLLMENT_TRANSITIONS[s]).toBeDefined();
    expect(canTransition(ENROLLMENT_TRANSITIONS, 'pending_payment', 'active')).toBe(true);
    expect(canTransition(ENROLLMENT_TRANSITIONS, 'cancelled', 'active')).toBe(false);
    expect(() =>
      assertTransition('enrollment', ENROLLMENT_TRANSITIONS, 'completed', 'active'),
    ).toThrow(InvalidTransitionError);
  });

  it('refunds must be approved before processing', () => {
    expect(canTransition(REFUND_TRANSITIONS, 'requested', 'processed')).toBe(false);
  });
});

describe('money', () => {
  it('computes VAT in halalas with half-up rounding', () => {
    expect(vatOnNet(100_00, 1500)).toBe(15_00);
    expect(vatOnNet(333, 1500)).toBe(50); // 49.95 -> 50
    expect(() => vatOnNet(1.5, 1500)).toThrow(RangeError);
  });
});

describe('schemas', () => {
  it('defaults marketing consent to false and requires notice version', () => {
    const parsed = registerSchema.parse({
      fullNameAr: 'محمد',
      email: 'A@Example.com',
      mobile: '+966512345678',
      password: 'correct horse battery',
      privacyNoticeVersion: '2026-01',
      termsVersion: '2026-01',
    });
    expect(parsed.marketingConsent).toBe(false);
    expect(parsed.email).toBe('a@example.com');
    expect(registerSchema.safeParse({ ...parsed, password: 'short' }).success).toBe(false);
  });
});
