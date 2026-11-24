import type { INestApplication } from '@nestjs/common';
import { authenticator } from 'otplib';
import request from 'supertest';
import { hash } from 'argon2';
import { randomUUID } from 'node:crypto';
import { encryptField, type PrismaClient } from '@mzn/db';
import { createApp } from '../src/bootstrap';
import { PrismaService } from '../src/common/prisma.service';
import { RateLimiterService } from '../src/common/rate-limiter.service';
import { EMAIL_PROVIDER, type MockEmailProvider } from '../src/integrations/email.provider';

export const PASSWORD = 'Test-Password-2026!';
let passwordHash: Promise<string> | undefined;

export interface TestContext {
  app: INestApplication;
  prisma: PrismaClient;
  mail: MockEmailProvider;
}

export async function bootTestApp(): Promise<TestContext> {
  const app = await createApp({ logger: false });
  return {
    app,
    prisma: app.get(PrismaService),
    mail: app.get<MockEmailProvider>(EMAIL_PROVIDER),
  };
}

export function resetRateLimits(ctx: TestContext): void {
  ctx.app.get(RateLimiterService).clearMemory();
}

/** Agent that keeps cookies and sends the CSRF header on every request. */
export class Client {
  readonly agent: ReturnType<typeof request.agent>;
  constructor(app: INestApplication) {
    this.agent = request.agent(app.getHttpServer());
  }
  get(path: string) {
    return this.agent.get(path);
  }
  post(path: string, body?: object) {
    return this.agent
      .post(path)
      .set('x-mzn-csrf', '1')
      .send(body ?? {});
  }
  put(path: string, body?: object) {
    return this.agent
      .put(path)
      .set('x-mzn-csrf', '1')
      .send(body ?? {});
  }
  patch(path: string, body?: object) {
    return this.agent
      .patch(path)
      .set('x-mzn-csrf', '1')
      .send(body ?? {});
  }
  delete(path: string) {
    return this.agent.delete(path).set('x-mzn-csrf', '1');
  }
}

export interface TestUser {
  id: string;
  email: string;
  totpSecret: string | null;
}

/** Creates an active user with the given roles; staff users get a confirmed TOTP secret. */
export async function createUser(
  ctx: TestContext,
  roleKeys: string[],
  opts: {
    mfa?: boolean;
    organizationId?: string;
    status?: 'active' | 'pending_verification' | 'disabled';
  } = {},
): Promise<TestUser> {
  passwordHash ??= hash(PASSWORD, { type: 2 });
  const roles = await ctx.prisma.role.findMany({ where: { key: { in: roleKeys } } });
  const needsMfa = opts.mfa ?? roles.some((r) => r.isStaff);
  const email = `u-${randomUUID().slice(0, 8)}@test.mzn`;
  const user = await ctx.prisma.user.create({
    data: {
      email,
      passwordHash: await passwordHash,
      status: opts.status ?? 'active',
      emailVerifiedAt: new Date(),
      organizationId: opts.organizationId ?? null,
      profile: { create: { fullNameAr: 'مستخدم اختبار', fullNameEn: 'Test User' } },
      roles: { create: roles.map((r) => ({ roleId: r.id })) },
    },
  });
  let totpSecret: string | null = null;
  if (needsMfa) {
    totpSecret = authenticator.generateSecret(20);
    await ctx.prisma.mfaSecret.create({
      data: {
        userId: user.id,
        secretEnc: encryptField(totpSecret, `mfa:${user.id}`),
        confirmedAt: new Date(),
      },
    });
  }
  return { id: user.id, email, totpSecret };
}

/** Logs in (completing TOTP when configured) and returns an authenticated client. */
export async function login(ctx: TestContext, user: TestUser): Promise<Client> {
  const client = new Client(ctx.app);
  const res = await client.post('/api/v1/auth/login', { email: user.email, password: PASSWORD });
  if (res.status !== 200)
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  if (res.body.status === 'mfa_required') {
    const mfa = await client.post('/api/v1/auth/mfa/verify', {
      code: authenticator.generate(user.totpSecret!),
    });
    if (mfa.status !== 200)
      throw new Error(`mfa failed: ${mfa.status} ${JSON.stringify(mfa.body)}`);
  }
  return client;
}

export async function loginAs(
  ctx: TestContext,
  roleKeys: string[],
): Promise<{ user: TestUser; client: Client }> {
  const user = await createUser(ctx, roleKeys);
  return { user, client: await login(ctx, user) };
}
