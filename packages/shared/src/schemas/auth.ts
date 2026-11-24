import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

/** Saudi mobile in E.164 (+9665XXXXXXXX). Other countries can be added via config later. */
export const mobileSchema = z
  .string()
  .trim()
  .regex(/^\+9665\d{8}$/, 'mobile.invalid');

/** ASVS 2.1: min 12 chars, allow long passphrases, no composition rules. */
export const passwordSchema = z.string().min(12, 'password.tooShort').max(128, 'password.tooLong');

export const localeSchema = z.enum(['ar', 'en']);
export type Locale = z.infer<typeof localeSchema>;

export const registerSchema = z.object({
  fullNameAr: z.string().trim().min(2).max(120),
  fullNameEn: z.string().trim().min(2).max(120).optional(),
  email: emailSchema,
  mobile: mobileSchema,
  password: passwordSchema,
  locale: localeSchema.default('ar'),
  /** Version id of the privacy notice the user accepted. Required. */
  privacyNoticeVersion: z.string().min(1).max(40),
  termsVersion: z.string().min(1).max(40),
  /** Separate, optional, unchecked-by-default marketing consent. */
  marketingConsent: z.boolean().default(false),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'otp.invalid');
export const recoveryCodeSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9]{5}-[a-z0-9]{5}$/, 'recovery.invalid');

export const mfaVerifySchema = z
  .object({
    code: otpCodeSchema.optional(),
    recoveryCode: recoveryCodeSchema.optional(),
  })
  .refine((v) => Boolean(v.code) !== Boolean(v.recoveryCode), { message: 'mfa.oneOf' });
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;

export const mfaEnableSchema = z.object({ code: otpCodeSchema });

export const emailVerifySchema = z.object({ token: z.string().min(20).max(200) });

export const passwordResetRequestSchema = z.object({ email: emailSchema });
export const passwordResetConfirmSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

export const emailOtpRequestSchema = z.object({ email: emailSchema });
export const emailOtpLoginSchema = z.object({ email: emailSchema, code: otpCodeSchema });

/** Session payload returned by GET /auth/me. */
export interface MeResponse {
  id: string;
  email: string;
  fullNameAr: string;
  fullNameEn: string | null;
  locale: Locale;
  emailVerified: boolean;
  mfaEnabled: boolean;
  /** Staff accounts must complete MFA enrolment before using staff features. */
  mfaRequired: boolean;
  /** True while this session still has to complete (or enrol) the second factor. */
  mfaPending: boolean;
  roles: string[];
  permissions: string[];
  organizationId: string | null;
}

export type LoginResult =
  | { status: 'ok'; me: MeResponse }
  | { status: 'mfa_required' }
  | { status: 'mfa_enrolment_required'; me: MeResponse };
