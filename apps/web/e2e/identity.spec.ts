import { expect, test } from '@playwright/test';
import {
  DEV_PASSWORD,
  DEV_TOTP,
  latestEmail,
  linkFrom,
  loginWithPassword,
  openMenuIfMobile,
  submitTotp,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test('trainee registers, verifies email, signs in and sees only trainee navigation', async ({
  page,
  request,
}) => {
  const email = `e2e-${Date.now()}@test.mzn`;
  await page.goto('/ar/register');
  await page.getByLabel('الاسم الكامل بالعربية').fill('متدرب تجريبي');
  await page.getByLabel('البريد الإلكتروني', { exact: true }).fill(email);
  await page.getByLabel('رقم الجوال').fill('+966512345678');
  await page.getByLabel('كلمة المرور', { exact: true }).fill('a-long-e2e-passphrase');
  // Marketing consent must be unchecked by default.
  await expect(page.getByLabel(/رسائل تسويقية/)).not.toBeChecked();
  // Policy acceptance is required.
  await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await expect(page.getByText('يجب الموافقة للمتابعة')).toBeVisible();
  await page.getByLabel(/إشعار الخصوصية/).check();
  await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await expect(page.getByText('تم استلام طلبك')).toBeVisible();

  const mail = await latestEmail(request, email);
  expect(mail.template).toBe('verify_email');
  await page.goto(linkFrom(mail.text));
  await expect(page.getByText('تم تأكيد بريدك الإلكتروني')).toBeVisible();

  await loginWithPassword(page, 'ar', email, 'a-long-e2e-passphrase');
  await expect(page).toHaveURL(/\/ar\/dashboard$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('مرحباً');
  await openMenuIfMobile(page);
  await expect(page.getByRole('link', { name: 'حسابي' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'المستخدمون' })).toHaveCount(0);
});

test('admin invites staff; staff sets password, enrols MFA, and gets role navigation', async ({
  page,
  request,
  browser,
}) => {
  test.skip(!DEV_TOTP || !DEV_PASSWORD, 'requires seeded dev users');
  // Admin signs in with MFA (seeded system admin).
  await loginWithPassword(page, 'en', 'system.admin@mzn.test', DEV_PASSWORD);
  await expect(page.getByRole('heading', { name: 'Two-step verification' })).toBeVisible();
  await submitTotp(page, DEV_TOTP);
  await expect(page).toHaveURL(/\/en\/dashboard$/);

  await page.goto('/en/admin/users');
  await page.getByRole('button', { name: 'Add staff member' }).click();
  const staffEmail = `staff-${Date.now()}@test.mzn`;
  await page.getByLabel('Full name in Arabic').fill('مدرب جديد');
  await page.getByLabel('Email', { exact: true }).fill(staffEmail);
  await page.getByLabel('Roles').selectOption('instructor');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Account created')).toBeVisible();

  // Staff member in a separate browser context.
  const ctx = await browser.newContext();
  const staff = await ctx.newPage();
  const invite = await latestEmail(request, staffEmail);
  expect(invite.template).toBe('staff_invite');
  await staff.goto(linkFrom(invite.text));
  // Invite links use the locale chosen at account creation (the admin's UI locale: English).
  await staff.getByLabel('New password').fill('staff-e2e-passphrase');
  await staff.getByRole('button', { name: 'Save' }).click();
  await expect(staff.getByText('Password updated')).toBeVisible();

  await loginWithPassword(staff, 'ar', staffEmail, 'staff-e2e-passphrase');
  await expect(staff).toHaveURL(/\/ar\/mfa-setup$/);
  const secret = (await staff.getByTestId('mfa-secret').textContent())!.trim();
  await submitTotp(staff, secret);
  await expect(staff.getByTestId('recovery-codes').locator('li')).toHaveCount(10);
  await staff.getByRole('button', { name: 'متابعة' }).click();
  await expect(staff).toHaveURL(/\/ar\/dashboard$/);
  await expect(staff.getByTestId('roles')).toContainText('instructor');
  await openMenuIfMobile(staff);
  await expect(staff.getByRole('link', { name: 'المستخدمون' })).toHaveCount(0);
  // Direct navigation to an admin page: the API denies the data.
  await staff.goto('/ar/admin/users');
  await expect(staff.getByText('ليست لديك صلاحية')).toBeVisible();
  await ctx.close();

  // The admin sees the audit trail of these actions.
  await page.goto('/en/admin/audit');
  await expect(page.getByRole('cell', { name: 'user.created' }).first()).toBeVisible();
});
