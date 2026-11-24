import type { PrismaClient } from '@prisma/client';
import { ALL_PERMISSIONS, DEFAULT_ROLES } from '@mzn/shared';

/**
 * Idempotently mirrors the code permission catalogue into the DB and creates the
 * default roles if missing. Existing role permission edits made through the admin
 * UI are preserved unless `resetDefaults` is true.
 */
export async function syncRolesAndPermissions(
  prisma: PrismaClient,
  opts: { resetDefaults?: boolean } = {},
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const key of ALL_PERMISSIONS) {
      await tx.permission.upsert({ where: { key }, create: { key }, update: {} });
    }
    // Remove permissions that no longer exist in code (cascades role grants).
    await tx.permission.deleteMany({ where: { key: { notIn: [...ALL_PERMISSIONS] } } });

    for (const role of DEFAULT_ROLES) {
      const existing = await tx.role.findUnique({ where: { key: role.key } });
      if (existing && !opts.resetDefaults) continue;
      const saved = await tx.role.upsert({
        where: { key: role.key },
        create: {
          key: role.key,
          nameAr: role.nameAr,
          nameEn: role.nameEn,
          isStaff: role.isStaff,
          isSystem: true,
        },
        update: { nameAr: role.nameAr, nameEn: role.nameEn, isStaff: role.isStaff, isSystem: true },
      });
      await tx.rolePermission.deleteMany({ where: { roleId: saved.id } });
      await tx.rolePermission.createMany({
        data: role.permissions.map((permissionKey) => ({ roleId: saved.id, permissionKey })),
      });
    }
  });
}
