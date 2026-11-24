import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ROLES, visibleNav } from '@mzn/shared';
import {
  Client,
  bootTestApp,
  createUser,
  login,
  loginAs,
  resetRateLimits,
  type TestContext,
} from './helpers';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await bootTestApp();
});
afterAll(async () => ctx.app.close());
beforeEach(() => resetRateLimits(ctx));

describe('every seeded role can sign in and receives only its permissions', () => {
  for (const role of DEFAULT_ROLES) {
    it(`${role.key}`, async () => {
      const { client } = await loginAs(ctx, [role.key]);
      const me = await client.get('/api/v1/auth/me');
      expect(me.status).toBe(200);
      expect(me.body.roles).toEqual([role.key]);
      expect([...me.body.permissions].sort()).toEqual([...role.permissions].sort());
      expect(me.body.mfaRequired).toBe(role.isStaff);
      // Menu derived from server permissions never includes admin items for non-admins.
      const nav = visibleNav(me.body.permissions).map((n) => n.key);
      if (role.key !== 'system_admin') expect(nav).not.toContain('roles');
    });
  }
});

describe('user administration', () => {
  it('creates a staff user, sends an invitation, and audits it', async () => {
    const { client } = await loginAs(ctx, ['system_admin']);
    const email = `staff-${Date.now()}@test.mzn`;
    const res = await client.post('/api/v1/admin/users', {
      fullNameAr: 'موظف جديد',
      email,
      roleKeys: ['instructor'],
    });
    expect(res.status).toBe(201);
    expect(res.body.roles).toEqual(['instructor']);
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(ctx.mail.latestFor(email)?.template).toBe('staff_invite');
    const audit = await ctx.prisma.auditLog.findFirst({
      where: { action: 'user.created', entityId: res.body.id },
    });
    expect(audit?.actorId).toBeTruthy();
  });

  it('rejects unknown roles and duplicate emails', async () => {
    const { client } = await loginAs(ctx, ['system_admin']);
    const bad = await client.post('/api/v1/admin/users', {
      fullNameAr: 'س',
      email: 'x@test.mzn',
      roleKeys: ['ghost'],
    });
    expect(bad.status).toBe(400);
    const existing = await createUser(ctx, ['trainee']);
    const dup = await client.post('/api/v1/admin/users', {
      fullNameAr: 'موظف',
      email: existing.email,
      roleKeys: ['instructor'],
    });
    expect(dup.body.code).toBe('EMAIL_IN_USE');
  });

  it('changes roles, revokes the target sessions, and forbids self-escalation', async () => {
    const { user: admin, client } = await loginAs(ctx, ['system_admin']);
    const target = await createUser(ctx, ['trainee']);
    const targetClient = await login(ctx, target);
    const res = await client.put(`/api/v1/admin/users/${target.id}/roles`, {
      roleKeys: ['trainee', 'corporate_sponsor'],
    });
    expect(res.status).toBe(200);
    expect(res.body.roles.sort()).toEqual(['corporate_sponsor', 'trainee']);
    expect((await targetClient.get('/api/v1/auth/me')).status).toBe(401);

    const self = await client.put(`/api/v1/admin/users/${admin.id}/roles`, {
      roleKeys: ['system_admin', 'finance_manager'],
    });
    expect(self.body.code).toBe('SELF_ROLE_CHANGE');
  });

  it('disables (never deletes) users and ends their sessions', async () => {
    const { client } = await loginAs(ctx, ['system_admin']);
    const target = await createUser(ctx, ['instructor']);
    const tc = await login(ctx, target);
    const res = await client.patch(`/api/v1/admin/users/${target.id}/status`, {
      disabled: true,
      reason: 'offboarding',
    });
    expect(res.body.status).toBe('disabled');
    expect((await tc.get('/api/v1/auth/me')).status).toBe(401);
    expect(await ctx.prisma.user.count({ where: { id: target.id } })).toBe(1);
    const relog = await new Client(ctx.app).post('/api/v1/auth/login', {
      email: target.email,
      password: 'Test-Password-2026!',
    });
    expect(relog.body.code).toBe('ACCOUNT_DISABLED');
  });

  it('lets support reset MFA with an identity-check reference, but not their own', async () => {
    const { user: agent, client } = await loginAs(ctx, ['support_agent']);
    const target = await createUser(ctx, ['instructor']);
    const res = await client.post(`/api/v1/admin/users/${target.id}/mfa-reset`, {
      identityCheckReference: 'TCK-1042 video call',
    });
    expect(res.status).toBe(204);
    expect(await ctx.prisma.mfaSecret.count({ where: { userId: target.id } })).toBe(0);
    const audit = await ctx.prisma.auditLog.findFirst({
      where: { action: 'user.mfa_reset', entityId: target.id },
    });
    expect(audit?.changes).toMatchObject({ identityCheckReference: 'TCK-1042 video call' });
    expect(
      (
        await client.post(`/api/v1/admin/users/${agent.id}/mfa-reset`, {
          identityCheckReference: 'self',
        })
      ).body.code,
    ).toBe('SELF_MFA_RESET');
  });

  it('lists users with filters and data minimization', async () => {
    const { client } = await loginAs(ctx, ['system_admin']);
    const res = await client.get('/api/v1/admin/users?role=system_admin&pageSize=5');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const u of res.body.items) {
      expect(u).not.toHaveProperty('passwordHash');
      expect(u).not.toHaveProperty('mobile');
      expect(u.roles).toContain('system_admin');
    }
    expect((await client.get('/api/v1/admin/users?pageSize=1000')).status).toBe(400);
  });
});

describe('role administration', () => {
  it('creates, edits and deletes custom roles with audited permission diffs', async () => {
    const { client } = await loginAs(ctx, ['system_admin']);
    const key = `custom_${Date.now()}`;
    const created = await client.post('/api/v1/admin/roles', {
      key,
      nameAr: 'دور مخصص',
      nameEn: 'Custom',
      isStaff: true,
      permissions: ['report.read'],
    });
    expect(created.status).toBe(201);
    const updated = await client.put(`/api/v1/admin/roles/${key}`, {
      key,
      nameAr: 'دور مخصص',
      nameEn: 'Custom',
      isStaff: true,
      permissions: ['report.read', 'program.read'],
    });
    expect(updated.body.permissions).toEqual(['program.read', 'report.read']);
    const audit = await ctx.prisma.auditLog.findFirst({
      where: { action: 'role.updated', entityId: updated.body.id },
    });
    expect(audit?.changes).toMatchObject({ added: ['program.read'], removed: [] });
    expect((await client.delete(`/api/v1/admin/roles/${key}`)).status).toBe(204);
  });

  it('rejects unknown permissions, protects system roles, and blocks editing a held role', async () => {
    const { client } = await loginAs(ctx, ['system_admin']);
    const bad = await client.post('/api/v1/admin/roles', {
      key: 'bad_role',
      nameAr: 'سيء',
      nameEn: 'Bad',
      isStaff: true,
      permissions: ['god.mode'],
    });
    expect(bad.body.code).toBe('UNKNOWN_PERMISSION');
    expect((await client.delete('/api/v1/admin/roles/trainee')).body.code).toBe(
      'SYSTEM_ROLE_PROTECTED',
    );
    const self = await client.put('/api/v1/admin/roles/system_admin', {
      key: 'system_admin',
      nameAr: 'مدير',
      nameEn: 'Admin',
      isStaff: true,
      permissions: ['user.read', 'refund.approve'],
    });
    expect(self.body.code).toBe('SELF_ROLE_EDIT');
  });
});

describe('audit log', () => {
  it('is queryable by compliance, exportable with an audit trail, and chain-verified', async () => {
    const { client } = await loginAs(ctx, ['compliance_officer']);
    const list = await client.get('/api/v1/audit?action=auth.&pageSize=10');
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBeGreaterThan(0);
    const exp = await client.get('/api/v1/audit/export?action=auth.login');
    expect(exp.status).toBe(200);
    expect(exp.headers['content-type']).toContain('text/csv');
    expect(
      await ctx.prisma.auditLog.count({ where: { action: 'audit.exported' } }),
    ).toBeGreaterThan(0);
    const chain = await client.get('/api/v1/audit/verify-chain');
    expect(chain.body.ok).toBe(true);
  });

  it('cannot be updated or deleted, even through the application connection', async () => {
    await expect(ctx.prisma.auditLog.deleteMany({})).rejects.toThrow(/append-only/);
    await expect(ctx.prisma.auditLog.updateMany({ data: { action: 'tampered' } })).rejects.toThrow(
      /append-only/,
    );
  });

  it('never stores secrets in change metadata', async () => {
    const rows = await ctx.prisma.auditLog.findMany({ select: { changes: true } });
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toMatch(/Test-Password|argon2|secretEnc/);
  });

  it('is not readable by executives', async () => {
    const { client } = await loginAs(ctx, ['executive']);
    expect((await client.get('/api/v1/audit')).status).toBe(403);
  });
});
