import 'server-only';
import { cookies } from 'next/headers';
import type { MeResponse } from '@mzn/shared';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

/** Server-side GET to the API forwarding the visitor's session cookie. */
export async function serverGet<T>(path: string): Promise<{ status: number; data: T | null }> {
  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .filter((c) => c.name === 'mzn_sid' || c.name === '__Host-mzn_sid')
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  try {
    const res = await fetch(`${API}/api/v1${path}`, {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
      cache: 'no-store',
    });
    if (!res.ok) return { status: res.status, data: null };
    return { status: res.status, data: (await res.json()) as T };
  } catch {
    return { status: 503, data: null };
  }
}

export async function getMe(): Promise<{ me: MeResponse | null; status: number }> {
  const { status, data } = await serverGet<MeResponse>('/auth/me');
  return { me: data, status };
}
