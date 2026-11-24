import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { RegisterForm } from './register-form';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('registerTitle') };
}

export default async function RegisterPage() {
  // Current legal text versions come from the API so acceptance is recorded precisely.
  const res = await fetch(`${API}/api/v1/auth/policies`, { cache: 'no-store' }).catch(() => null);
  const policies = res?.ok
    ? ((await res.json()) as { privacyNoticeVersion: string; termsVersion: string })
    : { privacyNoticeVersion: '', termsVersion: '' };
  return <RegisterForm policies={policies} />;
}

// Reads per-request data (cookies, query or live policy versions): never prerender.
export const dynamic = 'force-dynamic';
