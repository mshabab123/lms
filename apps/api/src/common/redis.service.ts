import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from '../config/env';

/**
 * Redis connection, or `null` in local development when REDIS_URL is empty.
 * Env validation guarantees Redis exists in staging/production.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis | null;

  constructor() {
    const url = env().REDIS_URL;
    this.client = url
      ? new Redis(url, { maxRetriesPerRequest: 2, enableOfflineQueue: false, lazyConnect: false })
      : null;
    if (!this.client)
      this.logger.warn('REDIS_URL not set: using in-process fallbacks (single-instance dev only)');
  }

  async ping(): Promise<boolean> {
    if (!this.client) return true;
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit().catch(() => undefined);
  }
}
