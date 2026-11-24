import { z } from 'zod';

const bool = z
  .enum(['true', 'false', ''])
  .optional()
  .transform((v) => v === 'true');

export const envSchema = z
  .object({
    APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    NODE_ENV: z.string().default('development'),
    APP_PUBLIC_URL: z.string().url().default('http://localhost:3000'),
    API_PORT: z.coerce.number().int().default(4000),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().optional().default(''),
    APP_ENCRYPTION_KEY: z.string().min(40),
    SESSION_SECRET: z.string().min(32),
    SESSION_TTL_MINUTES: z.coerce.number().int().min(5).default(720),
    SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).default(60),
    COOKIE_SECURE: bool,
    PRIVACY_NOTICE_VERSION: z.string().min(1).default('draft'),
    TERMS_VERSION: z.string().min(1).default('draft'),
    EMAIL_PROVIDER: z.enum(['mock', 'smtp']).default('mock'),
    SMTP_HOST: z.string().optional().default(''),
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_USER: z.string().optional().default(''),
    SMTP_PASSWORD: z.string().optional().default(''),
    SMTP_FROM: z.string().default('MZN <no-reply@example.invalid>'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    SENTRY_DSN: z.string().optional().default(''),
    METRICS_TOKEN: z.string().optional().default(''),
  })
  .superRefine((env, ctx) => {
    const strict = env.APP_ENV === 'staging' || env.APP_ENV === 'production';
    if (!strict) return;
    if (!env.REDIS_URL)
      ctx.addIssue({
        code: 'custom',
        path: ['REDIS_URL'],
        message: 'required in staging/production',
      });
    if (!env.COOKIE_SECURE)
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'must be true in staging/production',
      });
    if (!env.APP_PUBLIC_URL.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_PUBLIC_URL'],
        message: 'must be https in staging/production',
      });
    }
    if (env.APP_ENV === 'production' && env.EMAIL_PROVIDER === 'mock') {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_PROVIDER'],
        message: 'mock email is not allowed in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    // Print variable names only — never values.
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}

export function env(): Env {
  cached ??= loadEnv();
  return cached;
}

/** Tests only. */
export function resetEnvCache(): void {
  cached = undefined;
}

export const ENV = Symbol('ENV');
