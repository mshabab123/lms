import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

export interface IntegrationCall {
  provider: string;
  operation: string;
  mode: string;
  success: boolean;
  durationMs: number;
  statusCode?: number;
  errorCode?: string;
  /** Non-personal external reference (e.g. gateway payment id). */
  reference?: string;
}

/** Records every adapter call without secrets or personal payloads. */
@Injectable()
export class IntegrationLogService {
  private readonly logger = new Logger(IntegrationLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(call: IntegrationCall): Promise<void> {
    try {
      await this.prisma.integrationLog.create({ data: call });
    } catch (err) {
      // Logging must never break the business flow.
      this.logger.error(
        `failed to write integration log: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
  }
}
