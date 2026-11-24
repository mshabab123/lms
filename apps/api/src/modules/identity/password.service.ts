import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';

/** OWASP-recommended Argon2id parameters (19 MiB, t=2, p=1). */
const OPTIONS = { type: argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class PasswordService {
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return hash(password, OPTIONS);
  }

  /**
   * Verifies a password. When `stored` is null a dummy hash is verified so the
   * response time does not reveal whether the account exists.
   */
  async verify(stored: string | null | undefined, password: string): Promise<boolean> {
    if (!stored) {
      this.dummyHash ??= hash('dummy-password-for-timing', OPTIONS);
      await verify(await this.dummyHash, password).catch(() => false);
      return false;
    }
    try {
      return await verify(stored, password);
    } catch {
      return false;
    }
  }
}
