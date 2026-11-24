import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Local convenience: load the monorepo .env when present and not in production.
 * Staging/production receive variables from the container environment only.
 */
if (process.env.APP_ENV !== 'production' && process.env.NODE_ENV !== 'production') {
  const file = resolve(__dirname, '../../../../.env');
  if (existsSync(file)) process.loadEnvFile(file);
}
