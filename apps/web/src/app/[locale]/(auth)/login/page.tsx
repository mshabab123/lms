import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LoginForm } from './login-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('loginTitle'), robots: { index: false } };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const { step } = await searchParams;
  return <LoginForm initialStep={step === 'mfa' ? 'mfa' : 'password'} />;
}

// Reads per-request data (cookies, query or live policy versions): never prerender.
export const dynamic = 'force-dynamic';
