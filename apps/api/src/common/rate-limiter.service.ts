import { Injectable } from '@nestjs/common';
import { Errors } from './errors';
import { RedisService } from './redis.service';

export interface RateRule {
  /** Logical bucket, e.g. "login:ip". */
  name: string;
  limit: number;
  windowSeconds: number;
}

/**
 * Fixed-window rate limiter. Redis-backed (shared across instances) when available,
 * otherwise an in-process map for local development and tests.
 */
@Injectable()
export class RateLimiterService {
  private readonly memory = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly redis: RedisService) {}

  /** Throws 429 when the limit is exceeded. */
  async consume(rule: RateRule, subject: string): Promise<void> {
    const key = `rl:${rule.name}:${subject}`;
    const { count, ttl } = await this.increment(key, rule.windowSeconds);
    if (count > rule.limit) throw Errors.tooMany(ttl);
  }

  async reset(rule: RateRule, subject: string): Promise<void> {
    const key = `rl:${rule.name}:${subject}`;
    if (this.redis.client) await this.redis.client.del(key);
    else this.memory.delete(key);
  }

  private async increment(
    key: string,
    windowSeconds: number,
  ): Promise<{ count: number; ttl: number }> {
    const client = this.redis.client;
    if (client) {
      const results = await client
        .multi()
        .incr(key)
        .expire(key, windowSeconds, 'NX')
        .ttl(key)
        .exec();
      const count = Number(results?.[0]?.[1] ?? 0);
      const ttl = Number(results?.[2]?.[1] ?? windowSeconds);
      return { count, ttl: ttl > 0 ? ttl : windowSeconds };
    }
    const now = Date.now();
    const entry = this.memory.get(key);
    if (!entry || entry.resetAt <= now) {
      this.memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return { count: 1, ttl: windowSeconds };
    }
    entry.count += 1;
    return { count: entry.count, ttl: Math.ceil((entry.resetAt - now) / 1000) };
  }

  /** Tests only: clears in-process buckets. */
  clearMemory(): void {
    this.memory.clear();
  }
}

export const RATE_RULES = {
  loginIp: { name: 'login:ip', limit: 30, windowSeconds: 900 },
  loginAccount: { name: 'login:acct', limit: 10, windowSeconds: 900 },
  otpAccount: { name: 'otp:acct', limit: 6, windowSeconds: 900 },
  resetIp: { name: 'reset:ip', limit: 10, windowSeconds: 3600 },
  resetAccount: { name: 'reset:acct', limit: 3, windowSeconds: 3600 },
  registerIp: { name: 'register:ip', limit: 10, windowSeconds: 3600 },
  emailOtpAccount: { name: 'emailotp:acct', limit: 5, windowSeconds: 900 },
} satisfies Record<string, RateRule>;
