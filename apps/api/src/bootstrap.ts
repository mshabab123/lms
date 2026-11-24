import { RequestMethod, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { env } from './config/env';
import { AppModule } from './app.module';
import { assertAllRoutesDeclareAccess, listRoutes } from './common/route-registry';

export const GLOBAL_PREFIX = 'api/v1';

/** Builds the configured application. Shared by main.ts and integration tests. */
export async function createApp(opts: { logger?: boolean } = {}): Promise<INestApplication> {
  const e = env();
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(), {
    bufferLogs: true,
    logger: opts.logger === false ? false : undefined,
  });
  if (opts.logger !== false) app.useLogger(app.get(Logger));

  // Only Caddy is exposed publicly; trust exactly one proxy hop for client IPs.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      hsts: e.COOKIE_SECURE
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
      crossOriginResourcePolicy: { policy: 'same-origin' },
    }),
  );
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '1mb' });
  app.enableCors({
    origin: [new URL(e.APP_PUBLIC_URL).origin],
    credentials: true,
    allowedHeaders: ['content-type', 'x-mzn-csrf', 'x-request-id', 'idempotency-key'],
  });
  app.setGlobalPrefix(GLOBAL_PREFIX, {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'ready', method: RequestMethod.GET },
      { path: 'metrics', method: RequestMethod.GET },
    ],
  });
  app.enableShutdownHooks();

  if (e.APP_ENV !== 'production') {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('MZN Unified Learning Platform API')
        .setVersion('1')
        .addCookieAuth('mzn_sid')
        .build(),
    );
    SwaggerModule.setup(`${GLOBAL_PREFIX}/docs`, app, doc);
  }

  await app.init();
  assertAllRoutesDeclareAccess(listRoutes(app));
  return app;
}
