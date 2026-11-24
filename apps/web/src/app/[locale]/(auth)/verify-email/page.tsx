import { VerifyEmailClient } from './client';

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <VerifyEmailClient token={token ?? ''} />;
}

// Reads per-request data (cookies, query or live policy versions): never prerender.
export const dynamic = 'force-dynamic';
