import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { authenticator } from 'otplib';
import {
  Client,
  PASSWORD,
  bootTestApp,
  createUser,
  login,
  resetRateLimits,
  type TestContext,
} from './helpers';

let ctx: TestContext;
const policies = { privacyNoticeVersion: '', termsVersion: '' };

beforeAll(async () => {
  ctx = await bootTestApp();
  const res = await new Client(ctx.app).get('/api/v1/auth/policies');
  Object.assign(policies, res.body);
});
afterAll(async () => ctx.app.close());
beforeEach(() => resetRateLimits(ctx));

function tokenFrom(text: string): string {
  const m = /token=([^\s]+)/.exec(text);
  if (!m) throw new Error('no token in email');
  return decodeURIComponent(m[1]!);
}

describe('registration and email verification', () => {
  const email = `reg-${Date.now()}@test.mzn`;
  const base = {
    fullNameAr: 'سارة أحمد',
    email,
    mobile: '+966512345678',
    password: 'a-long-passphrase-2026',
    locale: 'ar',
  };

  it('rejects invalid input with VALIDATION_FAILED', async () => {
    const res = await new Client(ctx.app).post('/api/v1/auth/register', {
      ...base,
      ...policies,
      mobile: '0501',
      password: 'short',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('rejects an outdated privacy notice version', async () => {
    const res = await new Client(ctx.app).post('/api/v1/auth/register', {
      ...base,
      privacyNoticeVersion: 'old',
      termsVersion: policies.termsVersion,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('POLICY_VERSION_OUTDATED');
  });

  it('registers a trainee, stores policy acceptance and consent, and blocks login until verified', async () => {
    const client = new Client(ctx.app);
    const res = await client.post('/api/v1/auth/register', { ...base, ...policies });
    expect(res.status).toBe(202);

    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { email },
      include: { acceptances: true, consents: true, roles: { include: { role: true } } },
    });
    expect(user.status).toBe('pending_verification');
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.acceptances.map((a) => a.policy).sort()).toEqual(['privacy_notice', 'terms']);
    expect(user.consents[0]?.granted).toBe(false); // marketing consent unchecked by default
    expect(user.roles.map((r) => r.role.key)).toEqual(['trainee']);

    const blocked = await client.post('/api/v1/auth/login', { email, password: base.password });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('EMAIL_NOT_VERIFIED');

    const token = tokenFrom(ctx.mail.latestFor(email)!.text);
    expect((await client.post('/api/v1/auth/verify-email', { token })).status).toBe(200);
    // Single use.
    expect((await client.post('/api/v1/auth/verify-email', { token })).body.code).toBe(
      'INVALID_OR_EXPIRED_TOKEN',
    );

    const ok = await client.post('/api/v1/auth/login', { email, password: base.password });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('ok');
    expect(ok.body.me.roles).toEqual(['trainee']);
    expect(ok.headers['set-cookie']?.[0]).toMatch(/HttpOnly/i);
  });

  it('does not reveal existing accounts on duplicate registration', async () => {
    const res = await new Client(ctx.app).post('/api/v1/auth/register', { ...base, ...policies });
    expect(res.status).toBe(202);
    expect(ctx.mail.latestFor(email)!.template).toBe('account_exists');
  });
});

describe('login, lockout and sessions', () => {
  it('returns the same error for unknown users and wrong passwords', async () => {
    const user = await createUser(ctx, ['trainee']);
    const c = new Client(ctx.app);
    const a = await c.post('/api/v1/auth/login', {
      email: 'nobody@test.mzn',
      password: 'whatever-password',
    });
    const b = await c.post('/api/v1/auth/login', {
      email: user.email,
      password: 'wrong-password-123',
    });
    expect(a.status).toBe(400);
    expect(b.status).toBe(400);
    expect(a.body.code).toBe(b.body.code);
  });

  it('locks the account progressively after repeated failures', async () => {
    const user = await createUser(ctx, ['trainee']);
    const c = new Client(ctx.app);
    for (let i = 0; i < 5; i++)
      await c.post('/api/v1/auth/login', { email: user.email, password: 'wrong-password-123' });
    const locked = await c.post('/api/v1/auth/login', { email: user.email, password: PASSWORD });
    expect(locked.status).toBe(429);
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    const audit = await ctx.prisma.auditLog.count({
      where: { entityId: user.id, action: 'auth.login_failed' },
    });
    expect(audit).toBe(5);
  });

  it('rate-limits login attempts per account', async () => {
    const c = new Client(ctx.app);
    let last = 0;
    for (let i = 0; i < 12; i++) {
      last = (
        await c.post('/api/v1/auth/login', {
          email: 'ratelimit@test.mzn',
          password: 'wrong-password-123',
        })
      ).status;
    }
    expect(last).toBe(429);
  });

  it('lists and revokes sessions, and logs out everywhere', async () => {
    const user = await createUser(ctx, ['trainee']);
    const a = await login(ctx, user);
    const b = await login(ctx, user);
    const list = await a.get('/api/v1/auth/sessions');
    expect(list.body.items).toHaveLength(2);
    const other = list.body.items.find((s: { current: boolean }) => !s.current);
    expect((await a.delete(`/api/v1/auth/sessions/${other.id}`)).status).toBe(204);
    expect((await b.get('/api/v1/auth/me')).status).toBe(401);
    expect((await a.post('/api/v1/auth/logout-all')).status).toBe(200);
    expect((await a.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('cannot revoke another user session (IDOR)', async () => {
    const victim = await createUser(ctx, ['trainee']);
    const v = await login(ctx, victim);
    const victimSession = (await v.get('/api/v1/auth/sessions')).body.items[0].id;
    const attacker = await login(ctx, await createUser(ctx, ['trainee']));
    expect((await attacker.delete(`/api/v1/auth/sessions/${victimSession}`)).status).toBe(404);
    expect((await v.get('/api/v1/auth/me')).status).toBe(200);
  });

  it('rejects unsafe requests without the CSRF header or from another origin', async () => {
    const c = new Client(ctx.app);
    const noHeader = await c.agent
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.co', password: 'x' });
    expect(noHeader.body.code).toBe('CSRF_REJECTED');
    const evil = await c.agent
      .post('/api/v1/auth/login')
      .set('x-mzn-csrf', '1')
      .set('origin', 'https://evil.example')
      .send({ email: 'a@b.co', password: 'x' });
    expect(evil.body.code).toBe('CSRF_REJECTED');
  });
});

describe('MFA', () => {
  it('forces staff to enrol MFA before using staff features', async () => {
    const staff = await createUser(ctx, ['instructor'], { mfa: false });
    const c = new Client(ctx.app);
    const res = await c.post('/api/v1/auth/login', { email: staff.email, password: PASSWORD });
    expect(res.body.status).toBe('mfa_enrolment_required');
    expect((await c.get('/api/v1/auth/sessions')).body.code).toBe('MFA_REQUIRED');

    const setup = await c.post('/api/v1/auth/mfa/setup');
    expect(setup.status).toBe(200);
    expect(setup.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    const bad = await c.post('/api/v1/auth/mfa/enable', { code: '000000' });
    expect(bad.status).toBe(400);
    const enabled = await c.post('/api/v1/auth/mfa/enable', {
      code: authenticator.generate(setup.body.secret),
    });
    expect(enabled.status).toBe(200);
    expect(enabled.body.recoveryCodes).toHaveLength(10);
    expect((await c.get('/api/v1/auth/sessions')).status).toBe(200);

    const stored = await ctx.prisma.mfaSecret.findUniqueOrThrow({ where: { userId: staff.id } });
    expect(stored.secretEnc).not.toContain(setup.body.secret); // encrypted at rest

    // Recovery codes are single use.
    const recovery = enabled.body.recoveryCodes[0] as string;
    const r1 = new Client(ctx.app);
    await r1.post('/api/v1/auth/login', { email: staff.email, password: PASSWORD });
    expect((await r1.post('/api/v1/auth/mfa/verify', { recoveryCode: recovery })).status).toBe(200);
    const r2 = new Client(ctx.app);
    await r2.post('/api/v1/auth/login', { email: staff.email, password: PASSWORD });
    expect((await r2.post('/api/v1/auth/mfa/verify', { recoveryCode: recovery })).body.code).toBe(
      'INVALID_CODE',
    );
  });

  it('requires TOTP at login and rejects code replay', async () => {
    const staff = await createUser(ctx, ['finance_officer']);
    const c = new Client(ctx.app);
    expect(
      (await c.post('/api/v1/auth/login', { email: staff.email, password: PASSWORD })).body.status,
    ).toBe('mfa_required');
    expect((await c.get('/api/v1/auth/sessions')).body.code).toBe('MFA_REQUIRED');
    const code = authenticator.generate(staff.totpSecret!);
    expect((await c.post('/api/v1/auth/mfa/verify', { code })).status).toBe(200);
    expect((await c.get('/api/v1/auth/sessions')).status).toBe(200);

    // Replay of the same code on a new login is rejected.
    const c2 = new Client(ctx.app);
    await c2.post('/api/v1/auth/login', { email: staff.email, password: PASSWORD });
    expect((await c2.post('/api/v1/auth/mfa/verify', { code })).body.code).toBe('INVALID_CODE');
  });

  it('does not allow staff to disable MFA', async () => {
    const staff = await createUser(ctx, ['instructor']);
    const c = await login(ctx, staff);
    const res = await c.post('/api/v1/auth/mfa/disable', { password: PASSWORD, code: '123456' });
    expect(res.body.code).toBe('MFA_MANDATORY_FOR_STAFF');
  });
});

describe('password reset and email OTP', () => {
  it('resets password, revokes sessions, and does not reveal unknown emails', async () => {
    const user = await createUser(ctx, ['trainee']);
    const session = await login(ctx, user);
    const c = new Client(ctx.app);
    expect(
      (await c.post('/api/v1/auth/password/reset-request', { email: 'unknown@test.mzn' })).status,
    ).toBe(202);
    expect(
      (await c.post('/api/v1/auth/password/reset-request', { email: user.email })).status,
    ).toBe(202);
    const token = tokenFrom(ctx.mail.latestFor(user.email)!.text);
    const res = await c.post('/api/v1/auth/password/reset', {
      token,
      password: 'brand-new-password-1',
    });
    expect(res.status).toBe(200);
    expect((await session.get('/api/v1/auth/me')).status).toBe(401);
    const relog = await c.post('/api/v1/auth/login', {
      email: user.email,
      password: 'brand-new-password-1',
    });
    expect(relog.status).toBe(200);
  });

  it('signs in with a one-time email code', async () => {
    const user = await createUser(ctx, ['trainee']);
    const c = new Client(ctx.app);
    await c.post('/api/v1/auth/email-otp/request', { email: user.email });
    const code = /(\d{6})/.exec(ctx.mail.latestFor(user.email)!.text)![1]!;
    const wrong = code === '000000' ? '111111' : '000000';
    expect(
      (await c.post('/api/v1/auth/email-otp/verify', { email: user.email, code: wrong })).body.code,
    ).toBe('INVALID_CODE');
    const ok = await c.post('/api/v1/auth/email-otp/verify', { email: user.email, code });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('ok');
    expect(
      (await c.post('/api/v1/auth/email-otp/verify', { email: user.email, code })).body.code,
    ).toBe('INVALID_CODE');
  });

  it('changes password with the current password only', async () => {
    const user = await createUser(ctx, ['trainee']);
    const c = await login(ctx, user);
    expect(
      (
        await c.post('/api/v1/auth/password/change', {
          currentPassword: 'nope-nope-nope',
          newPassword: 'another-password-22',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await c.post('/api/v1/auth/password/change', {
          currentPassword: PASSWORD,
          newPassword: 'another-password-22',
        })
      ).status,
    ).toBe(204);
  });
});

describe('health', () => {
  it('exposes liveness, readiness and protected metrics', async () => {
    const c = new Client(ctx.app);
    expect((await c.get('/health')).body.status).toBe('ok');
    expect((await c.get('/ready')).body.checks.database).toBe(true);
    expect((await c.get('/metrics')).status).toBe(404);
    const m = await c.agent.get('/metrics').set('authorization', 'Bearer test-metrics-token');
    expect(m.status).toBe(200);
    expect(m.text).toContain('mzn_api_');
  });
});
