'use client';

/** Error thrown for non-2xx API responses; `code` maps to an i18n key under `errors`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

/** Browser-side fetch to the same-origin API proxy, with the CSRF header on writes. */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const method = init.method ?? (init.body === undefined ? 'GET' : 'POST');
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(method !== 'GET' ? { 'x-mzn-csrf': '1' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      typeof data.code === 'string' ? data.code : 'generic',
      data.details as Record<string, unknown>,
    );
  }
  return data as T;
}
