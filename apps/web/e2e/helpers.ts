import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { authenticator } from 'otplib';

const envFile = resolve(__dirname, '../../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

export const DEV_PASSWORD = process.env.SEED_DEV_PASSWORD ?? '';
export const DEV_TOTP = process.env.SEED_DEV_TOTP_SECRET ?? '';
const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

authenticator.options = { step: 30, window: 1 };

/** Reads the latest mock email for an address from the dev-only mailbox. */
export async function latestEmail(
  request: APIRequestContext,
  to: string,
): Promise<{ text: string; template: string }> {
  const res = await request.get(`${API}/api/v1/dev/mailbox/latest?to=${encodeURIComponent(to)}`);
  expect(res.ok()).toBeTruthy();
  return res.json();
}

export function linkFrom(text: string): string {
  const m = /(https?:\/\/\S+)/.exec(text);
  if (!m) throw new Error('no link in email');
  const url = new URL(m[1]!);
  return url.pathname + url.search;
}

/**
 * Submits a TOTP code. Codes are single-use per 30 s step (replay protection), so if
 * the current step was already consumed by an earlier test, wait for the next one.
 */
export async function submitTotp(page: Page, secret: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByLabel(/رمز التحقق|Verification code/).fill(authenticator.generate(secret));
    await page.getByRole('button', { name: /^(تحقق|Verify|تفعيل|Enable)$/ }).click();
    const outcome = await Promise.race([
      page.waitForURL(/\/dashboard$/, { timeout: 8_000 }).then(() => 'ok' as const),
      page
        .getByTestId('recovery-codes')
        .waitFor({ timeout: 8_000 })
        .then(() => 'ok' as const),
      // Match our error text, not Next.js's route announcer (which also has role=alert).
      page
        .getByText(/الرمز غير صحيح|code is incorrect/)
        .waitFor({ timeout: 8_000 })
        .then(() => 'error' as const),
    ]).catch(() => 'error' as const);
    if (outcome === 'ok') return;
    await page.waitForTimeout(31_000 - (Date.now() % 30_000));
  }
  throw new Error('TOTP verification failed twice');
}

export async function loginWithPassword(
  page: Page,
  locale: 'ar' | 'en',
  email: string,
  password: string,
): Promise<void> {
  await page.goto(`/${locale}/login`);
  await page
    .getByLabel(locale === 'ar' ? 'البريد الإلكتروني' : 'Email', { exact: true })
    .fill(email);
  await page
    .getByLabel(locale === 'ar' ? 'كلمة المرور' : 'Password', { exact: true })
    .fill(password);
  await page
    .getByRole('button', { name: locale === 'ar' ? 'دخول' : 'Sign in', exact: true })
    .click();
}

export async function openMenuIfMobile(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: /فتح القائمة|Open menu/ });
  if (await button.isVisible()) await button.click();
}
