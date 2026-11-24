import { z } from 'zod';
import { emailSchema, localeSchema, mobileSchema } from './auth';

export const uuidSchema = z.string().uuid();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof paginationSchema>;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export const userListQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'disabled', 'pending_verification']).optional(),
  role: z.string().max(60).optional(),
});

export const createStaffUserSchema = z.object({
  fullNameAr: z.string().trim().min(2).max(120),
  fullNameEn: z.string().trim().min(2).max(120).optional(),
  email: emailSchema,
  mobile: mobileSchema.optional(),
  locale: localeSchema.default('ar'),
  roleKeys: z.array(z.string().min(1).max(60)).min(1).max(10),
  organizationId: uuidSchema.optional(),
});
export type CreateStaffUserInput = z.infer<typeof createStaffUserSchema>;

export const setUserRolesSchema = z.object({
  roleKeys: z.array(z.string().min(1).max(60)).max(10),
});

export const roleUpsertSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{2,59}$/),
  nameAr: z.string().trim().min(2).max(80),
  nameEn: z.string().trim().min(2).max(80),
  isStaff: z.boolean(),
  permissions: z.array(z.string().min(1).max(80)).max(200),
});
export type RoleUpsertInput = z.infer<typeof roleUpsertSchema>;

export const auditQuerySchema = paginationSchema.extend({
  actorId: uuidSchema.optional(),
  action: z.string().max(100).optional(),
  entityType: z.string().max(60).optional(),
  entityId: z.string().max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;
