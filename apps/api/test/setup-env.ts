import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Integration tests run against DATABASE_URL_TEST only — never the dev database.
const file = resolve(__dirname, '../../../.env');
if (existsSync(file)) process.loadEnvFile(file);
if (!process.env.DATABASE_URL_TEST)
  throw new Error('DATABASE_URL_TEST must be set for integration tests');
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.APP_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.EMAIL_PROVIDER = 'mock';
process.env.REDIS_URL = '';
process.env.COOKIE_SECURE = 'false';
process.env.APP_PUBLIC_URL = 'http://localhost:3000';
process.env.METRICS_TOKEN = 'test-metrics-token';
