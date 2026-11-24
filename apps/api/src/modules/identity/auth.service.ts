import { Inject, Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { randomToken, sha256Hex, type TokenPurpose, type User } from '@mzn/db';
import {
  TRAINEE_ROLE_KEY,
  type LoginResult,
  type MeResponse,
  type RegisterInput,
} from '@mzn/shared';
import { env } from '../../config/env';
import { Errors } from '../../common/errors';
import { PrismaService, type Tx } from '../../common/prisma.service';
import { RATE_RULES, RateLimiterService } from '../../common/rate-limiter.service';
import type { Actor } from '../../common/request-context';
import { AuditService } from '../audit/audit.service';
import { EMAIL_PROVIDER, type EmailProvider } from '../../integrations/email.provider';
import { renderEmail } from '../../integrations/email-templates';
import { MfaService } from './mfa.service';
import { PasswordService } from './password.service';
import { SessionService, type CreatedSession } from './session.service';

const LOCK_THRESHOLD = 5;
const BASE_LOCK_MINUTES = 15;
const MAX_LOCK_MINUTES = 24 * 60;

const TOKEN_TTL_MINUTES: Record<TokenPurpose, number> = {
  email_verification: 24 * 60,
  password_reset: 30,
  email_otp: 10,
};

export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}

export interface AuthOutcome {
  result: LoginResult;
  session?: CreatedSession;
}

/** Progressive lockout: 15 min after 5 failures, doubling per further 5, capped at 24 h. */
export function lockoutMinutes(failedCount: number): number | null {
  if (failedCount < LOCK_THRESHOLD || failedCount % LOCK_THRESHOLD !== 0) return null;
  const tier = failedCount / LOCK_THRESHOLD - 1;
  return Math.min(BASE_LOCK_MINUTES * 2 ** tier, MAX_LOCK_MINUTES);
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly mfa: MfaService,
    private readonly audit: AuditService,
    private readonly limiter: RateLimiterService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
  ) {}

  // ─────────────── Registration & verification ───────────────

  async register(input: RegisterInput, client: ClientInfo): Promise<void> {
    await this.limiter.consume(RATE_RULES.registerIp, client.ip ?? 'unknown');
    const e = env();
    if (
      input.privacyNoticeVersion !== e.PRIVACY_NOTICE_VERSION ||
      input.termsVersion !== e.TERMS_VERSION
    ) {
      throw Errors.badRequest('POLICY_VERSION_OUTDATED', {
        privacyNoticeVersion: e.PRIVACY_NOTICE_VERSION,
        termsVersion: e.TERMS_VERSION,
      });
    }

    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      // Do not reveal account existence: same response, notify the owner instead.
      const msg = renderEmail('account_exists', existing.locale);
      await this.email.send({ to: existing.email, ...msg });
      return;
    }

    const passwordHash = await this.passwords.hash(input.password);
    const traineeRole = await this.prisma.role.findUniqueOrThrow({
      where: { key: TRAINEE_ROLE_KEY },
    });
    const { user, token } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          mobile: input.mobile,
          passwordHash,
          locale: input.locale,
          profile: {
            create: { fullNameAr: input.fullNameAr, fullNameEn: input.fullNameEn ?? null },
          },
          roles: { create: { roleId: traineeRole.id } },
          acceptances: {
            create: [
              {
                policy: 'privacy_notice',
                version: input.privacyNoticeVersion,
                ipAddress: client.ip,
              },
              { policy: 'terms', version: input.termsVersion, ipAddress: client.ip },
            ],
          },
          consents: {
            create: {
              channel: 'email',
              purpose: 'marketing',
              granted: input.marketingConsent,
              source: 'registration',
              email: input.email,
            },
          },
        },
      });
      const token = await this.issueToken(tx, user.id, 'email_verification');
      await this.audit.record(
        {
          action: 'user.registered',
          entityType: 'User',
          entityId: user.id,
          actorId: user.id,
          changes: { marketingConsent: input.marketingConsent },
        },
        tx,
      );
      return { user, token };
    });
    await this.sendVerification(user, input.fullNameAr, token);
  }

  async resendVerification(email: string, client: ClientInfo): Promise<void> {
    await this.limiter.consume(RATE_RULES.resetIp, client.ip ?? 'unknown');
    await this.limiter.consume(RATE_RULES.resetAccount, `verify:${email}`);
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });
    if (!user || user.status !== 'pending_verification') return;
    const token = await this.issueToken(this.prisma, user.id, 'email_verification');
    await this.sendVerification(user, user.profile?.fullNameAr ?? '', token);
  }

  async verifyEmail(token: string): Promise<void> {
    const record = await this.consumeToken(token, 'email_verification');
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: record.userId } });
      if (user.status === 'pending_verification') {
        await tx.user.update({
          where: { id: user.id },
          data: { status: 'active', emailVerifiedAt: new Date() },
        });
      }
      await this.audit.record(
        { action: 'user.email_verified', entityType: 'User', entityId: user.id, actorId: user.id },
        tx,
      );
    });
  }

  // ─────────────── Login ───────────────

  async login(email: string, password: string, client: ClientInfo): Promise<AuthOutcome> {
    await this.limiter.consume(RATE_RULES.loginIp, client.ip ?? 'unknown');
    await this.limiter.consume(RATE_RULES.loginAccount, email);

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw Errors.tooMany(Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000));
    }
    const ok = await this.passwords.verify(user?.passwordHash, password);
    if (!user || !ok) {
      if (user) await this.recordFailedLogin(user);
      throw Errors.badRequest('INVALID_CREDENTIALS');
    }
    return this.completeFirstFactor(user, client, 'password');
  }

  async requestEmailOtp(email: string, client: ClientInfo): Promise<void> {
    await this.limiter.consume(RATE_RULES.loginIp, client.ip ?? 'unknown');
    await this.limiter.consume(RATE_RULES.emailOtpAccount, email);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== 'active') return; // no enumeration
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.verificationToken.updateMany({
      where: { userId: user.id, purpose: 'email_otp', consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await this.prisma.verificationToken.create({
      data: {
        userId: user.id,
        purpose: 'email_otp',
        // Bind the short code to the user to keep the hash space large.
        tokenHash: sha256Hex(`${user.id}:${code}`),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES.email_otp * 60_000),
      },
    });
    await this.email.send({ to: user.email, ...renderEmail('email_otp', user.locale, { code }) });
  }

  async loginWithEmailOtp(email: string, code: string, client: ClientInfo): Promise<AuthOutcome> {
    await this.limiter.consume(RATE_RULES.otpAccount, `email:${email}`);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw Errors.badRequest('INVALID_CODE');
    const token = await this.prisma.verificationToken.findFirst({
      where: {
        userId: user.id,
        purpose: 'email_otp',
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!token || token.attempts >= 5) throw Errors.badRequest('INVALID_CODE');
    if (token.tokenHash !== sha256Hex(`${user.id}:${code}`)) {
      await this.prisma.verificationToken.update({
        where: { id: token.id },
        data: { attempts: { increment: 1 } },
      });
      await this.recordFailedLogin(user);
      throw Errors.badRequest('INVALID_CODE');
    }
    const consumed = await this.prisma.verificationToken.updateMany({
      where: { id: token.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw Errors.badRequest('INVALID_CODE');
    return this.completeFirstFactor(user, client, 'email_otp');
  }

  private async recordFailedLogin(user: User): Promise<void> {
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: { increment: 1 } },
    });
    const minutes = lockoutMinutes(updated.failedLoginCount);
    if (minutes) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lockedUntil: new Date(Date.now() + minutes * 60_000) },
      });
    }
    await this.audit.record({
      action: 'auth.login_failed',
      entityType: 'User',
      entityId: user.id,
      actorId: null,
      changes: { failedCount: updated.failedLoginCount, lockedMinutes: minutes },
    });
  }

  private async completeFirstFactor(
    user: User,
    client: ClientInfo,
    method: string,
  ): Promise<AuthOutcome> {
    if (user.status === 'disabled') throw Errors.forbidden('ACCOUNT_DISABLED');
    if (user.status === 'pending_verification') throw Errors.forbidden('EMAIL_NOT_VERIFIED');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await this.limiter.reset(RATE_RULES.loginAccount, user.email);

    const mfa = await this.prisma.mfaSecret.findUnique({ where: { userId: user.id } });
    const mfaEnabled = Boolean(mfa?.confirmedAt);
    const isStaff = await this.isStaff(user.id);
    const session = await this.sessions.create(user.id, {
      mfaSatisfied: !mfaEnabled && !isStaff,
      ...this.client(client),
    });
    await this.audit.record({
      action: 'auth.login',
      entityType: 'Session',
      entityId: session.sessionId,
      actorId: user.id,
      changes: { method },
    });

    if (mfaEnabled) return { result: { status: 'mfa_required' }, session };
    const me = await this.me(user.id);
    if (isStaff)
      return {
        result: { status: 'mfa_enrolment_required', me: { ...me, mfaPending: true } },
        session,
      };
    return { result: { status: 'ok', me }, session };
  }

  // ─────────────── MFA ───────────────

  async verifyMfa(
    actor: Actor,
    input: { code?: string; recoveryCode?: string },
  ): Promise<{ me: MeResponse; session: CreatedSession }> {
    await this.limiter.consume(RATE_RULES.otpAccount, actor.userId);
    if (!actor.mfaEnabled) throw Errors.badRequest('MFA_NOT_ENABLED');
    const ok = input.code
      ? await this.mfa.verifyTotp(actor.userId, input.code)
      : await this.mfa.consumeRecoveryCode(actor.userId, input.recoveryCode ?? '');
    if (!ok) {
      await this.audit.record({
        action: 'auth.mfa_failed',
        entityType: 'User',
        entityId: actor.userId,
      });
      throw Errors.badRequest('INVALID_CODE');
    }
    await this.limiter.reset(RATE_RULES.otpAccount, actor.userId);
    const session = await this.sessions.elevate(actor.sessionId);
    await this.audit.record({
      action: 'auth.mfa_verified',
      entityType: 'Session',
      entityId: actor.sessionId,
      changes: { method: input.code ? 'totp' : 'recovery_code' },
    });
    return { me: await this.me(actor.userId), session };
  }

  async beginMfaSetup(actor: Actor) {
    if (actor.mfaEnabled) throw Errors.conflict('MFA_ALREADY_ENABLED');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
    const { otpauthUrl, qrDataUrl, secret } = await this.mfa.beginSetup(actor.userId, user.email);
    return { otpauthUrl, qrDataUrl, secret };
  }

  async enableMfa(
    actor: Actor,
    code: string,
  ): Promise<{ recoveryCodes: string[]; me: MeResponse; session: CreatedSession }> {
    await this.limiter.consume(RATE_RULES.otpAccount, actor.userId);
    if (actor.mfaEnabled) throw Errors.conflict('MFA_ALREADY_ENABLED');
    if (!(await this.mfa.verifyTotp(actor.userId, code, { pending: true })))
      throw Errors.badRequest('INVALID_CODE');
    const recoveryCodes = await this.prisma.$transaction(async (tx) => {
      const codes = await this.mfa.confirm(actor.userId, tx);
      await this.audit.record(
        { action: 'auth.mfa_enabled', entityType: 'User', entityId: actor.userId },
        tx,
      );
      return codes;
    });
    // Other sessions were established without this factor: revoke them.
    await this.sessions.revokeAll(actor.userId, actor.sessionId);
    const session = await this.sessions.elevate(actor.sessionId);
    return { recoveryCodes, me: await this.me(actor.userId), session };
  }

  async disableMfa(actor: Actor, password: string, code: string): Promise<void> {
    if (actor.isStaff) throw Errors.forbidden('MFA_MANDATORY_FOR_STAFF');
    await this.limiter.consume(RATE_RULES.otpAccount, actor.userId);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
    if (
      !(await this.passwords.verify(user.passwordHash, password)) ||
      !(await this.mfa.verifyTotp(actor.userId, code))
    ) {
      throw Errors.badRequest('INVALID_CREDENTIALS');
    }
    await this.prisma.$transaction(async (tx) => {
      await this.mfa.remove(actor.userId, tx);
      await this.audit.record(
        { action: 'auth.mfa_disabled', entityType: 'User', entityId: actor.userId },
        tx,
      );
    });
  }

  async regenerateRecoveryCodes(actor: Actor, code: string): Promise<string[]> {
    await this.limiter.consume(RATE_RULES.otpAccount, actor.userId);
    if (!(await this.mfa.verifyTotp(actor.userId, code))) throw Errors.badRequest('INVALID_CODE');
    return this.prisma.$transaction(async (tx) => {
      const codes = await this.mfa.regenerateRecoveryCodes(actor.userId, tx);
      await this.audit.record(
        { action: 'auth.recovery_codes_regenerated', entityType: 'User', entityId: actor.userId },
        tx,
      );
      return codes;
    });
  }

  // ─────────────── Passwords ───────────────

  async requestPasswordReset(email: string, client: ClientInfo): Promise<void> {
    await this.limiter.consume(RATE_RULES.resetIp, client.ip ?? 'unknown');
    await this.limiter.consume(RATE_RULES.resetAccount, email);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status === 'disabled') return; // no enumeration
    const token = await this.issueToken(this.prisma, user.id, 'password_reset');
    const link = `${env().APP_PUBLIC_URL}/${user.locale}/reset-password?token=${encodeURIComponent(token)}`;
    await this.email.send({
      to: user.email,
      ...renderEmail('password_reset', user.locale, { link }),
    });
    await this.audit.record({
      action: 'auth.password_reset_requested',
      entityType: 'User',
      entityId: user.id,
      actorId: null,
    });
  }

  async confirmPasswordReset(token: string, password: string): Promise<void> {
    const record = await this.consumeToken(token, 'password_reset');
    const passwordHash = await this.passwords.hash(password);
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: record.userId } });
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          failedLoginCount: 0,
          lockedUntil: null,
          // A reset link proves mailbox control, which also verifies the email.
          ...(user.status === 'pending_verification'
            ? { status: 'active', emailVerifiedAt: new Date() }
            : {}),
        },
      });
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(
        { action: 'auth.password_reset', entityType: 'User', entityId: user.id, actorId: user.id },
        tx,
      );
    });
  }

  async changePassword(actor: Actor, current: string, next: string): Promise<void> {
    await this.limiter.consume(RATE_RULES.loginAccount, `change:${actor.userId}`);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
    if (!(await this.passwords.verify(user.passwordHash, current)))
      throw Errors.badRequest('INVALID_CREDENTIALS');
    const passwordHash = await this.passwords.hash(next);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null, id: { not: actor.sessionId } },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(
        { action: 'auth.password_changed', entityType: 'User', entityId: user.id },
        tx,
      );
    });
  }

  // ─────────────── Sessions & profile ───────────────

  async logout(actor: Actor): Promise<void> {
    await this.sessions.revoke(actor.userId, actor.sessionId);
    await this.audit.record({
      action: 'auth.logout',
      entityType: 'Session',
      entityId: actor.sessionId,
    });
  }

  async logoutEverywhere(actor: Actor): Promise<number> {
    const count = await this.sessions.revokeAll(actor.userId);
    await this.audit.record({
      action: 'auth.logout_all',
      entityType: 'User',
      entityId: actor.userId,
      changes: { revoked: count },
    });
    return count;
  }

  async revokeSession(actor: Actor, sessionId: string): Promise<void> {
    if (!(await this.sessions.revoke(actor.userId, sessionId))) throw Errors.notFound('Session');
    await this.audit.record({
      action: 'auth.session_revoked',
      entityType: 'Session',
      entityId: sessionId,
    });
  }

  async me(userId: string, actor?: Actor): Promise<MeResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        profile: true,
        mfaSecret: { select: { confirmedAt: true } },
        roles: {
          include: { role: { include: { permissions: { select: { permissionKey: true } } } } },
        },
      },
    });
    const roles = user.roles.map((r) => r.role);
    return {
      id: user.id,
      email: user.email,
      fullNameAr: user.profile?.fullNameAr ?? '',
      fullNameEn: user.profile?.fullNameEn ?? null,
      locale: user.locale,
      emailVerified: Boolean(user.emailVerifiedAt),
      mfaEnabled: Boolean(user.mfaSecret?.confirmedAt),
      mfaRequired: roles.some((r) => r.isStaff),
      mfaPending: actor ? (actor.isStaff || actor.mfaEnabled) && !actor.mfaSatisfied : false,
      roles: roles.map((r) => r.key),
      permissions: [
        ...new Set(roles.flatMap((r) => r.permissions.map((p) => p.permissionKey))),
      ].sort(),
      organizationId: user.organizationId,
    };
  }

  async setLocale(actor: Actor, locale: 'ar' | 'en'): Promise<void> {
    await this.prisma.user.update({ where: { id: actor.userId }, data: { locale } });
  }

  // ─────────────── Helpers ───────────────

  async issueToken(tx: Tx, userId: string, purpose: TokenPurpose): Promise<string> {
    const token = randomToken(32);
    await tx.verificationToken.updateMany({
      where: { userId, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await tx.verificationToken.create({
      data: {
        userId,
        purpose,
        tokenHash: sha256Hex(token),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES[purpose] * 60_000),
      },
    });
    return token;
  }

  private async consumeToken(token: string, purpose: TokenPurpose) {
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: sha256Hex(token) },
    });
    if (
      !record ||
      record.purpose !== purpose ||
      record.consumedAt ||
      record.expiresAt <= new Date()
    ) {
      throw Errors.badRequest('INVALID_OR_EXPIRED_TOKEN');
    }
    const consumed = await this.prisma.verificationToken.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw Errors.badRequest('INVALID_OR_EXPIRED_TOKEN');
    return record;
  }

  private async sendVerification(user: User, name: string, token: string): Promise<void> {
    const link = `${env().APP_PUBLIC_URL}/${user.locale}/verify-email?token=${encodeURIComponent(token)}`;
    await this.email.send({
      to: user.email,
      ...renderEmail('verify_email', user.locale, { name, link }),
    });
  }

  private async isStaff(userId: string): Promise<boolean> {
    const count = await this.prisma.userRole.count({ where: { userId, role: { isStaff: true } } });
    return count > 0;
  }

  private client(c: ClientInfo) {
    return { ip: c.ip, userAgent: c.userAgent };
  }
}
