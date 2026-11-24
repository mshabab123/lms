import { describe, expect, it } from 'vitest';
import { lockoutMinutes } from './auth.service';
import { sanitizeChanges } from '../audit/audit.service';
import { resolveRequestId } from '../../common/middleware';
import { loadEnv } from '../../config/env';

describe('progressive lockout', () => {
  it('locks at every 5th failure with doubling duration capped at 24h', () => {
    expect(lockoutMinutes(4)).toBeNull();
    expect(lockoutMinutes(5)).toBe(15);
    expect(lockoutMinutes(6)).toBeNull();
    expect(lockoutMinutes(10)).toBe(30);
    expect(lockoutMinutes(15)).toBe(60);
    expect(lockoutMinutes(100)).toBe(1440);
  });
});

describe('audit sanitization', () => {
  it('redacts sensitive keys recursively and truncates long text', () => {
    const out = sanitizeChanges({
      password: 'x',
      nested: { nationalId: '1', ok: 'y' },
      note: 'a'.repeat(300),
    }) as Record<string, unknown>;
    expect(out.password).toBe('[redacted]');
    expect((out.nested as Record<string, unknown>).nationalId).toBe('[redacted]');
    expect((out.nested as Record<string, unknown>).ok).toBe('y');
    expect((out.note as string).length).toBeLessThan(210);
  });
});

describe('request ids', () => {
  it('accepts safe inbound ids and replaces unsafe ones', () => {
    expect(resolveRequestId('abc12345-req')).toBe('abc12345-req');
    expect(resolveRequestId('<script>')).not.toBe('<script>');
    expect(resolveRequestId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('environment validation', () => {
  const base = {
    DATABASE_URL: 'postgresql://x',
    APP_ENCRYPTION_KEY: 'A'.repeat(44),
    SESSION_SECRET: 'B'.repeat(44),
  };
  it('accepts a minimal development config', () => {
    expect(loadEnv({ ...base } as NodeJS.ProcessEnv).APP_ENV).toBe('development');
  });
  it('refuses insecure production config', () => {
    expect(() =>
      loadEnv({
        ...base,
        APP_ENV: 'production',
        APP_PUBLIC_URL: 'http://x.example',
        EMAIL_PROVIDER: 'mock',
      } as NodeJS.ProcessEnv),
    ).toThrow(/REDIS_URL.*COOKIE_SECURE.*APP_PUBLIC_URL.*EMAIL_PROVIDER/);
  });
});
