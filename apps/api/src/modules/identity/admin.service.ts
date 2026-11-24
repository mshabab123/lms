import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@mzn/db';
import {
  isPermission,
  type CreateStaffUserInput,
  type Paginated,
  type RoleUpsertInput,
} from '@mzn/shared';
import { z } from 'zod';
import { env } from '../../config/env';
import { Errors } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import type { Actor } from '../../common/request-context';
import { EMAIL_PROVIDER, type EmailProvider } from '../../integrations/email.provider';
import { renderEmail } from '../../integrations/email-templates';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
import { userListQuerySchema } from '@mzn/shared';

type UserListQuery = z.infer<typeof userListQuerySchema>;

export interface UserSummary {
  id: string;
  email: string;
  fullNameAr: string;
  fullNameEn: string | null;
  status: string;
  roles: string[];
  mfaEnabled: boolean;
  lastLoginAt: Date | null;
  lockedUntil: Date | null;
  organizationId: string | null;
  createdAt: Date;
}

const userInclude = {
  profile: { select: { fullNameAr: true, fullNameEn: true } },
  roles: { include: { role: { select: { key: true } } } },
  mfaSecret: { select: { confirmedAt: true } },
} satisfies Prisma.UserInclude;

type UserWithRelations = Prisma.UserGetPayload<{ include: typeof userInclude }>;

/** Data-minimized projection: no password hash, no identifiers, no mobile. */
function toSummary(u: UserWithRelations): UserSummary {
  return {
    id: u.id,
    email: u.email,
    fullNameAr: u.profile?.fullNameAr ?? '',
    fullNameEn: u.profile?.fullNameEn ?? null,
    status: u.status,
    roles: u.roles.map((r) => r.role.key),
    mfaEnabled: Boolean(u.mfaSecret?.confirmedAt),
    lastLoginAt: u.lastLoginAt,
    lockedUntil: u.lockedUntil,
    organizationId: u.organizationId,
    createdAt: u.createdAt,
  };
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly mfa: MfaService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
  ) {}

  // ─────────────── Users ───────────────

  async listUsers(q: UserListQuery): Promise<Paginated<UserSummary>> {
    const where: Prisma.UserWhereInput = {
      status: q.status,
      ...(q.role ? { roles: { some: { role: { key: q.role } } } } : {}),
      ...(q.q
        ? {
            OR: [
              { email: { contains: q.q, mode: 'insensitive' } },
              { profile: { fullNameAr: { contains: q.q, mode: 'insensitive' } } },
              { profile: { fullNameEn: { contains: q.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: userInclude,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { total, page: q.page, pageSize: q.pageSize, items: users.map(toSummary) };
  }

  async getUser(id: string): Promise<UserSummary> {
    const user = await this.prisma.user.findUnique({ where: { id }, include: userInclude });
    if (!user) throw Errors.notFound('User');
    return toSummary(user);
  }

  async createStaffUser(actor: Actor, input: CreateStaffUserInput): Promise<UserSummary> {
    const roles = await this.resolveRoles(input.roleKeys);
    if (await this.prisma.user.findUnique({ where: { email: input.email } }))
      throw Errors.conflict('EMAIL_IN_USE');
    const { user, token } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          mobile: input.mobile ?? null,
          locale: input.locale,
          status: 'active',
          organizationId: input.organizationId ?? null,
          profile: {
            create: { fullNameAr: input.fullNameAr, fullNameEn: input.fullNameEn ?? null },
          },
          roles: { create: roles.map((r) => ({ roleId: r.id, grantedBy: actor.userId })) },
        },
        include: userInclude,
      });
      // Invitation uses a password-reset token; no password is ever set by staff.
      const token = await this.auth.issueToken(tx, user.id, 'password_reset');
      await this.audit.record(
        {
          action: 'user.created',
          entityType: 'User',
          entityId: user.id,
          changes: { roles: input.roleKeys },
        },
        tx,
      );
      return { user, token };
    });
    const link = `${env().APP_PUBLIC_URL}/${user.locale}/reset-password?token=${encodeURIComponent(token)}`;
    await this.email.send({
      to: user.email,
      ...renderEmail('staff_invite', user.locale, { name: input.fullNameAr, link }),
    });
    return toSummary(user);
  }

  async setUserRoles(actor: Actor, userId: string, roleKeys: string[]): Promise<UserSummary> {
    if (userId === actor.userId) throw Errors.forbidden('SELF_ROLE_CHANGE');
    const roles = await this.resolveRoles(roleKeys);
    const before = await this.getUser(userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      if (roles.length) {
        await tx.userRole.createMany({
          data: roles.map((r) => ({ userId, roleId: r.id, grantedBy: actor.userId })),
        });
      }
      // Privilege changes take effect immediately: drop existing sessions.
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(
        {
          action: 'user.roles_changed',
          entityType: 'User',
          entityId: userId,
          changes: { from: before.roles, to: roleKeys },
        },
        tx,
      );
    });
    return this.getUser(userId);
  }

  async setUserStatus(
    actor: Actor,
    userId: string,
    disabled: boolean,
    reason?: string,
  ): Promise<UserSummary> {
    if (userId === actor.userId) throw Errors.forbidden('SELF_STATUS_CHANGE');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Errors.notFound('User');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: disabled
          ? {
              status: 'disabled',
              disabledAt: new Date(),
              disabledReason: reason?.slice(0, 200) ?? null,
            }
          : {
              status: user.emailVerifiedAt ? 'active' : 'pending_verification',
              disabledAt: null,
              disabledReason: null,
            },
      });
      if (disabled)
        await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      await this.audit.record(
        {
          action: disabled ? 'user.disabled' : 'user.enabled',
          entityType: 'User',
          entityId: userId,
        },
        tx,
      );
    });
    return this.getUser(userId);
  }

  /** Support MFA reset after an out-of-band identity check (reference is recorded). */
  async resetMfa(actor: Actor, userId: string, identityCheckReference: string): Promise<void> {
    if (userId === actor.userId) throw Errors.forbidden('SELF_MFA_RESET');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Errors.notFound('User');
    await this.prisma.$transaction(async (tx) => {
      await this.mfa.remove(userId, tx);
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(
        {
          action: 'user.mfa_reset',
          entityType: 'User',
          entityId: userId,
          changes: { identityCheckReference },
        },
        tx,
      );
    });
    await this.email.send({ to: user.email, ...renderEmail('mfa_reset', user.locale) });
  }

  async unlock(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
    await this.audit.record({ action: 'user.unlocked', entityType: 'User', entityId: userId });
  }

  // ─────────────── Roles ───────────────

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      include: {
        permissions: { select: { permissionKey: true } },
        _count: { select: { users: true } },
      },
      orderBy: { key: 'asc' },
    });
    return roles.map((r) => ({
      id: r.id,
      key: r.key,
      nameAr: r.nameAr,
      nameEn: r.nameEn,
      isStaff: r.isStaff,
      isSystem: r.isSystem,
      userCount: r._count.users,
      permissions: r.permissions.map((p) => p.permissionKey).sort(),
    }));
  }

  async upsertRole(actor: Actor, input: RoleUpsertInput, existingKey?: string) {
    const invalid = input.permissions.filter((p) => !isPermission(p));
    if (invalid.length) throw Errors.badRequest('UNKNOWN_PERMISSION', { invalid });
    // Prevent indirect self-escalation through editing a role the actor holds.
    if (existingKey && actorHoldsRole(actor, existingKey)) throw Errors.forbidden('SELF_ROLE_EDIT');

    const result = await this.prisma.$transaction(async (tx) => {
      const current = existingKey
        ? await tx.role.findUnique({ where: { key: existingKey }, include: { permissions: true } })
        : null;
      if (existingKey && !current) throw Errors.notFound('Role');
      if (!existingKey && (await tx.role.findUnique({ where: { key: input.key } })))
        throw Errors.conflict('ROLE_KEY_IN_USE');
      if (current && current.key !== input.key && current.isSystem)
        throw Errors.badRequest('SYSTEM_ROLE_KEY_IMMUTABLE');

      const role = current
        ? await tx.role.update({
            where: { id: current.id },
            data: {
              key: input.key,
              nameAr: input.nameAr,
              nameEn: input.nameEn,
              isStaff: input.isStaff,
            },
          })
        : await tx.role.create({
            data: {
              key: input.key,
              nameAr: input.nameAr,
              nameEn: input.nameEn,
              isStaff: input.isStaff,
            },
          });
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.rolePermission.createMany({
        data: input.permissions.map((permissionKey) => ({ roleId: role.id, permissionKey })),
      });
      await this.audit.record(
        {
          action: current ? 'role.updated' : 'role.created',
          entityType: 'Role',
          entityId: role.id,
          changes: {
            key: input.key,
            added: input.permissions.filter(
              (p) => !current?.permissions.some((cp) => cp.permissionKey === p),
            ),
            removed:
              current?.permissions
                .map((p) => p.permissionKey)
                .filter((p) => !input.permissions.includes(p)) ?? [],
          },
        },
        tx,
      );
      return role;
    });
    return (await this.listRoles()).find((r) => r.id === result.id)!;
  }

  async deleteRole(actor: Actor, key: string): Promise<void> {
    const role = await this.prisma.role.findUnique({
      where: { key },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw Errors.notFound('Role');
    if (role.isSystem) throw Errors.badRequest('SYSTEM_ROLE_PROTECTED');
    if (role._count.users > 0) throw Errors.conflict('ROLE_IN_USE');
    if (actorHoldsRole(actor, key)) throw Errors.forbidden('SELF_ROLE_EDIT');
    await this.prisma.$transaction(async (tx) => {
      await tx.role.delete({ where: { id: role.id } });
      await this.audit.record(
        { action: 'role.deleted', entityType: 'Role', entityId: role.id, changes: { key } },
        tx,
      );
    });
  }

  private async resolveRoles(keys: string[]) {
    const unique = [...new Set(keys)];
    const roles = await this.prisma.role.findMany({ where: { key: { in: unique } } });
    if (roles.length !== unique.length) {
      throw Errors.badRequest('UNKNOWN_ROLE', {
        unknown: unique.filter((k) => !roles.some((r) => r.key === k)),
      });
    }
    return roles;
  }
}

function actorHoldsRole(actor: Actor, key: string): boolean {
  return actor.roles.includes(key);
}
