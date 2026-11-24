import {
  Global,
  Module,
  type DynamicModule,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, DiscoveryModule } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { env } from './config/env';
import { AccessGuard } from './common/access.guard';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { csrfMiddleware, requestContextMiddleware, resolveRequestId } from './common/middleware';
import { PrismaService } from './common/prisma.service';
import { RateLimiterService } from './common/rate-limiter.service';
import { RedisService } from './common/redis.service';
import {
  EMAIL_PROVIDER,
  MockEmailProvider,
  SmtpEmailProvider,
} from './integrations/email.provider';
import { IntegrationLogService } from './integrations/integration-log.service';
import { AuditController } from './modules/audit/audit.controller';
import { AuditService } from './modules/audit/audit.service';
import { DevController } from './modules/health/dev.controller';
import { HealthController } from './modules/health/health.controller';
import { AdminController } from './modules/identity/admin.controller';
import { AdminService } from './modules/identity/admin.service';
import { AuthController } from './modules/identity/auth.controller';
import { AuthService } from './modules/identity/auth.service';
import { MfaService } from './modules/identity/mfa.service';
import { PasswordService } from './modules/identity/password.service';
import { SessionService } from './modules/identity/session.service';

/** Cross-cutting infrastructure shared by every domain module. */
@Global()
@Module({
  providers: [
    PrismaService,
    RedisService,
    RateLimiterService,
    IntegrationLogService,
    AuditService,
    {
      provide: EMAIL_PROVIDER,
      inject: [IntegrationLogService],
      useFactory: (logs: IntegrationLogService) =>
        env().EMAIL_PROVIDER === 'smtp' ? new SmtpEmailProvider(logs) : new MockEmailProvider(logs),
    },
  ],
  exports: [
    PrismaService,
    RedisService,
    RateLimiterService,
    IntegrationLogService,
    AuditService,
    EMAIL_PROVIDER,
  ],
})
export class PlatformModule {}

/** Identity domain: accounts, sessions, MFA, RBAC administration. */
@Module({
  controllers: [AuthController, AdminController],
  providers: [AuthService, AdminService, SessionService, PasswordService, MfaService],
  exports: [SessionService, AuthService],
})
export class IdentityModule {}

@Module({ controllers: [AuditController] })
export class AuditModule {}

const REDACT = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  '*.password',
  '*.email',
  '*.token',
  '*.code',
];

@Module({})
export class AppModule implements NestModule {
  static register(): DynamicModule {
    const e = env();
    const devOnly = e.APP_ENV === 'development' || e.APP_ENV === 'test';
    return {
      module: AppModule,
      imports: [
        DiscoveryModule,
        LoggerModule.forRoot({
          pinoHttp: {
            level: e.LOG_LEVEL,
            genReqId: (req) => resolveRequestId(req.headers['x-request-id']),
            redact: { paths: REDACT, censor: '[redacted]' },
            // Log path only (no query strings, which may carry tokens) and no bodies.
            serializers: {
              req: (req: { id: string; method: string; url: string }) => ({
                id: req.id,
                method: req.method,
                path: req.url.split('?')[0],
              }),
              res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
            },
            autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/ready' },
          },
        }),
        PlatformModule,
        IdentityModule,
        AuditModule,
      ],
      controllers: [HealthController, ...(devOnly ? [DevController] : [])],
      providers: [
        { provide: APP_GUARD, useClass: AccessGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requestContextMiddleware, csrfMiddleware).forRoutes('*path');
  }
}
