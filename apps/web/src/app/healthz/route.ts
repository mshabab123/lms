/** Liveness endpoint for the web container (no dependencies). */
export function GET(): Response {
  return Response.json({ status: 'ok', service: 'web' });
}
export const dynamic = 'force-dynamic';
