/**
 * Seed: permission catalogue + default roles (all environments), and — only when
 * NODE_ENV !== 'production' and SEED_DEV_USERS=true — one dev account per role.
 * Dev staff accounts get a TOTP secret from SEED_DEV_TOTP_SECRET so automated
 * tests can complete MFA. Never enable dev users in production.
 */
import { hash } from 'argon2';
import { DEFAULT_ROLES } from '@mzn/shared';
import { createPrismaClient } from './index';
import { encryptField } from './crypto';
import { syncRolesAndPermissions } from './rbac-sync';

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    await syncRolesAndPermissions(prisma, {
      resetDefaults: process.env.SEED_RESET_ROLES === 'true',
    });
    console.log('Seeded permissions and default roles');

    if (process.env.NODE_ENV === 'production' || process.env.SEED_DEV_USERS !== 'true') return;

    const password = process.env.SEED_DEV_PASSWORD;
    const totpSecret = process.env.SEED_DEV_TOTP_SECRET;
    if (!password || !totpSecret)
      throw new Error('SEED_DEV_PASSWORD and SEED_DEV_TOTP_SECRET are required');
    const passwordHash = await hash(password, { type: 2 /* argon2id */ });

    const org = await prisma.organization.upsert({
      where: { id: '00000000-0000-4000-8000-000000000001' },
      create: {
        id: '00000000-0000-4000-8000-000000000001',
        nameAr: 'شركة تجريبية',
        nameEn: 'Demo Sponsor Co.',
      },
      update: {},
    });

    for (const role of DEFAULT_ROLES) {
      const email = `${role.key.replace(/_/g, '.')}@mzn.test`;
      const dbRole = await prisma.role.findUniqueOrThrow({ where: { key: role.key } });
      const user = await prisma.user.upsert({
        where: { email },
        create: {
          email,
          passwordHash,
          status: 'active',
          emailVerifiedAt: new Date(),
          mobile: '+966500000000',
          organizationId: role.key === 'corporate_sponsor' ? org.id : null,
          profile: {
            create: { fullNameAr: `${role.nameAr} تجريبي`, fullNameEn: `Demo ${role.nameEn}` },
          },
          roles: { create: { roleId: dbRole.id } },
        },
        update: { passwordHash, status: 'active', failedLoginCount: 0, lockedUntil: null },
      });
      if (role.isStaff) {
        await prisma.mfaSecret.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            secretEnc: encryptField(totpSecret, `mfa:${user.id}`),
            confirmedAt: new Date(),
          },
          update: {
            secretEnc: encryptField(totpSecret, `mfa:${user.id}`),
            confirmedAt: new Date(),
            lastUsedStep: null,
          },
        });
      }
      console.log(`Dev user: ${email} (${role.key})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
