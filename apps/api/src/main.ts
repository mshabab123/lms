import './config/load-dotenv';
import 'reflect-metadata';
import * as Sentry from '@sentry/node';
import { env } from './config/env';
import { createApp } from './bootstrap';

async function main(): Promise<void> {
  const e = env();
  if (e.SENTRY_DSN) {
    // No PII: Sentry receives errors with request IDs, never cookies or bodies.
    Sentry.init({
      dsn: e.SENTRY_DSN,
      environment: e.APP_ENV,
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });
  }
  const app = await createApp();
  await app.listen(e.API_PORT, '0.0.0.0');
}

main().catch((err: unknown) => {
  console.error('API failed to start', err instanceof Error ? err.message : err);
  process.exit(1);
});
