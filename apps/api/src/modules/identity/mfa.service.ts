import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';
import { toDataURL } from 'qrcode';
import { decryptField, encryptField, randomToken, sha256Hex } from '@mzn/db';
import { PrismaService, type Tx } from '../../common/prisma.service';

const STEP_SECONDS = 30;
authenticator.options = { step: STEP_SECONDS, window: 1, digits: 6 };

const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function recoveryCode(): string {
  const raw = randomToken(16);
  let out = '';
  for (let i = 0; out.length < 10 && i < raw.length; i++) {
    out += RECOVERY_ALPHABET[raw.charCodeAt(i) % RECOVERY_ALPHABET.length];
  }
  return `${out.slice(0, 5)}-${out.slice(5, 10)}`;
}

/** TOTP (RFC 6238) MFA with replay protection and single-use recovery codes. */
@Injectable()
export class MfaService {
  constructor(private readonly prisma: PrismaService) {}

  private aad(userId: string): string {
    return `mfa:${userId}`;
  }

  async beginSetup(
    userId: string,
    accountLabel: string,
  ): Promise<{ otpauthUrl: string; qrDataUrl: string; secret: string }> {
    const secret = authenticator.generateSecret(20);
    await this.prisma.mfaSecret.upsert({
      where: { userId },
      create: { userId, secretEnc: encryptField(secret, this.aad(userId)) },
      update: {
        secretEnc: encryptField(secret, this.aad(userId)),
        confirmedAt: null,
        lastUsedStep: null,
      },
    });
    const otpauthUrl = authenticator.keyuri(accountLabel, 'MZN', secret);
    return { otpauthUrl, qrDataUrl: await toDataURL(otpauthUrl), secret };
  }

  /**
   * Verifies a TOTP code and records the used time step so the same code cannot
   * be replayed. Works for confirmed secrets, or the pending one when `pending`.
   */
  async verifyTotp(
    userId: string,
    code: string,
    opts: { pending?: boolean } = {},
  ): Promise<boolean> {
    const record = await this.prisma.mfaSecret.findUnique({ where: { userId } });
    if (!record) return false;
    if (!opts.pending && !record.confirmedAt) return false;
    const secret = decryptField(record.secretEnc, this.aad(userId));
    const delta = authenticator.checkDelta(code, secret);
    if (delta === null) return false;
    const step = Math.floor(Date.now() / 1000 / STEP_SECONDS) + delta;
    if (record.lastUsedStep !== null && step <= record.lastUsedStep) return false;
    // Conditional update guards against concurrent replay of the same code.
    const updated = await this.prisma.mfaSecret.updateMany({
      where: { userId, OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }] },
      data: { lastUsedStep: step },
    });
    return updated.count === 1;
  }

  async confirm(userId: string, tx: Tx): Promise<string[]> {
    await tx.mfaSecret.update({ where: { userId }, data: { confirmedAt: new Date() } });
    return this.regenerateRecoveryCodes(userId, tx);
  }

  async regenerateRecoveryCodes(userId: string, tx: Tx): Promise<string[]> {
    const codes = Array.from({ length: 10 }, recoveryCode);
    await tx.recoveryCode.deleteMany({ where: { userId } });
    await tx.recoveryCode.createMany({
      data: codes.map((c) => ({ userId, codeHash: sha256Hex(c) })),
    });
    return codes;
  }

  async consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
    const result = await this.prisma.recoveryCode.updateMany({
      where: { userId, codeHash: sha256Hex(code.trim().toLowerCase()), usedAt: null },
      data: { usedAt: new Date() },
    });
    return result.count === 1;
  }

  async remove(userId: string, tx: Tx): Promise<void> {
    await tx.recoveryCode.deleteMany({ where: { userId } });
    await tx.mfaSecret.deleteMany({ where: { userId } });
  }
}
