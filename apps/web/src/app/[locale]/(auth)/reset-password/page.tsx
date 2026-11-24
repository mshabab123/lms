import { ResetPasswordClient } from './client';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <ResetPasswordClient token={token ?? ''} />;
}

// Reads per-request data (cookies, query or live policy versions): never prerender.
export const dynamic = 'force-dynamic';
