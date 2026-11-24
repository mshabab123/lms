import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Field-level encryption (AES-256-GCM) for national ID, date of birth and MFA secrets.
 * Key: APP_ENCRYPTION_KEY = base64 of 32 random bytes. Ciphertext format:
 *   v1:<keyId>:<iv b64>:<tag b64>:<ciphertext b64>
 * The keyId allows rotation (see docs/security/key-rotation.md): APP_ENCRYPTION_KEYS_OLD
 * may hold "id:base64,id:base64" entries that remain decrypt-only.
 */
const VERSION = 'v1';

interface KeyRing {
  currentId: string;
  keys: Map<string, Buffer>;
}

function parseKey(b64: string, name: string): Buffer {
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) throw new Error(`${name} must be base64 of exactly 32 bytes`);
  return key;
}

let cachedRing: KeyRing | undefined;

export function loadKeyRing(env: NodeJS.ProcessEnv = process.env): KeyRing {
  const current = env.APP_ENCRYPTION_KEY;
  if (!current) throw new Error('APP_ENCRYPTION_KEY is not set');
  const currentId = env.APP_ENCRYPTION_KEY_ID ?? 'k1';
  const keys = new Map<string, Buffer>([[currentId, parseKey(current, 'APP_ENCRYPTION_KEY')]]);
  for (const entry of (env.APP_ENCRYPTION_KEYS_OLD ?? '').split(',').filter(Boolean)) {
    const [id, b64] = entry.split(':');
    if (!id || !b64) throw new Error('APP_ENCRYPTION_KEYS_OLD entries must be id:base64');
    keys.set(id, parseKey(b64, `APP_ENCRYPTION_KEYS_OLD[${id}]`));
  }
  return { currentId, keys };
}

function ring(): KeyRing {
  cachedRing ??= loadKeyRing();
  return cachedRing;
}

/** For tests only. */
export function resetKeyRingCache(): void {
  cachedRing = undefined;
}

export function encryptField(plaintext: string, aad = ''): string {
  const { currentId, keys } = ring();
  const key = keys.get(currentId)!;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    currentId,
    iv.toString('base64'),
    tag.toString('base64'),
    ct.toString('base64'),
  ].join(':');
}

export function decryptField(payload: string, aad = ''): string {
  const [version, keyId, ivB64, tagB64, ctB64] = payload.split(':');
  if (version !== VERSION || !keyId || !ivB64 || !tagB64 || ctB64 === undefined) {
    throw new Error('Unsupported ciphertext format');
  }
  const key = ring().keys.get(keyId);
  if (!key) throw new Error(`Unknown encryption key id: ${keyId}`);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString(
    'utf8',
  );
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmacSha256Hex(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function maskIdentifier(last4: string | null | undefined): string | null {
  return last4 ? `••••••${last4}` : null;
}
