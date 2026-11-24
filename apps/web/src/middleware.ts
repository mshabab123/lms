import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Skip API proxy, Next internals, health and static files (paths containing a dot).
  matcher: ['/((?!api|_next|_vercel|healthz|.*\\..*).*)'],
};
