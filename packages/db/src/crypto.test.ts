import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  decryptField,
  encryptField,
  loadKeyRing,
  maskIdentifier,
  resetKeyRingCache,
} from './crypto';

describe('field encryption', () => {
  beforeEach(() => {
    process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    process.env.APP_ENCRYPTION_KEY_ID = 'k1';
    delete process.env.APP_ENCRYPTION_KEYS_OLD;
    resetKeyRingCache();
  });

  it('round-trips and produces distinct ciphertexts', () => {
    const a = encryptField('1234567890', 'nid:u1');
    const b = encryptField('1234567890', 'nid:u1');
    expect(a).not.toBe(b);
    expect(decryptField(a, 'nid:u1')).toBe('1234567890');
  });

  it('rejects tampering and wrong associated data', () => {
    const c = encryptField('secret', 'mfa:u1');
    expect(() => decryptField(c, 'mfa:u2')).toThrow();
    const parts = c.split(':');
    parts[4] = Buffer.from('evil').toString('base64');
    expect(() => decryptField(parts.join(':'), 'mfa:u1')).toThrow();
  });

  it('decrypts with rotated old keys', () => {
    const oldKey = process.env.APP_ENCRYPTION_KEY!;
    const c = encryptField('rotate-me');
    process.env.APP_ENCRYPTION_KEYS_OLD = `k1:${oldKey}`;
    process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    process.env.APP_ENCRYPTION_KEY_ID = 'k2';
    resetKeyRingCache();
    expect(decryptField(c)).toBe('rotate-me');
    expect(encryptField('x').split(':')[1]).toBe('k2');
  });

  it('validates key length', () => {
    expect(() => loadKeyRing({ APP_ENCRYPTION_KEY: 'c2hvcnQ=' } as NodeJS.ProcessEnv)).toThrow();
  });

  it('masks identifiers', () => {
    expect(maskIdentifier('1234')).toBe('••••••1234');
    expect(maskIdentifier(null)).toBeNull();
  });
});
