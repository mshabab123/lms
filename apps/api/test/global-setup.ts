import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Brings the test database up to the committed migrations and seeds roles. */
export default function setup(): void {
  const envFile = resolve(__dirname, '../../../.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST must be set');
  if (url === process.env.DATABASE_URL && !url.includes('test')) {
    throw new Error('Refusing to reset: DATABASE_URL_TEST equals DATABASE_URL');
  }
  const dbDir = resolve(__dirname, '../../../packages/db');
  const env = { ...process.env, DATABASE_URL: url, SEED_DEV_USERS: 'false', NODE_ENV: 'test' };
  // Non-destructive: apply committed migrations; tests create unique data and never rely on an empty DB.
  execSync('npx prisma migrate deploy', { cwd: dbDir, env, stdio: 'pipe' });
  execSync('npx tsx src/seed.ts', { cwd: dbDir, env, stdio: 'pipe' });
}
