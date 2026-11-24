import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
const isProd = process.env.NODE_ENV === 'production';

/**
 * Strict CSP. Next.js App Router needs inline scripts for hydration data; when a
 * nonce-based policy is adopted this can drop 'unsafe-inline' (tracked in DECISIONS.md).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const config: NextConfig = {
  // Standalone output is produced in the Linux Docker build (symlinks need privileges on Windows).
  output: process.env.NEXT_OUTPUT_STANDALONE === 'true' ? 'standalone' : undefined,
  poweredByHeader: false,
  reactStrictMode: true,
  // Lint runs as its own CI step with the monorepo config.
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ['@mzn/ui'],
  async rewrites() {
    // Same-origin API: the browser only ever talks to the portal origin.
    return [{ source: '/api/v1/:path*', destination: `${apiUrl}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default withNextIntl(config);
