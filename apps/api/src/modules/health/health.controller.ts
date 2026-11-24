import { Controller, Get, Headers, HttpCode, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { collectDefaultMetrics, register } from 'prom-client';
import { env } from '../../config/env';
import { Public } from '../../common/decorators';
import { Errors } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';
import { safeEqual } from '@mzn/db';

let metricsInitialized = false;

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    if (!metricsInitialized) {
      collectDefaultMetrics({ prefix: 'mzn_api_' });
      metricsInitialized = true;
    }
  }

  /** Liveness: the process is up. No dependencies checked. */
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'api' };
  }

  /** Readiness: dependencies reachable. Returns 503 when not ready. */
  @Public()
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const checks: Record<string, boolean> = {};
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch {
      checks.database = false;
    }
    checks.redis = await this.redis.ping();
    const ok = Object.values(checks).every(Boolean);
    res.status(ok ? 200 : 503);
    return { status: ok ? 'ready' : 'not_ready', checks };
  }

  /** Prometheus metrics, protected by a bearer token (disabled if no token configured). */
  @Public()
  @Get('metrics')
  @HttpCode(200)
  async metrics(@Headers('authorization') auth: string | undefined, @Res() res: Response) {
    const token = env().METRICS_TOKEN;
    if (!token || !auth || !safeEqual(auth, `Bearer ${token}`)) throw Errors.notFound();
    res.setHeader('Content-Type', register.contentType);
    res.send(await register.metrics());
  }
}
