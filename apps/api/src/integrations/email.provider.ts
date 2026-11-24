import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { IntegrationLogService } from './integration-log.service';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Template key for logging (never the body). */
  template: string;
}

export interface EmailProvider {
  readonly mode: 'mock' | 'smtp';
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

/**
 * Deterministic mock: keeps messages in memory for development and tests
 * (exposed through the dev-only mailbox endpoint). Never enabled in production.
 */
@Injectable()
export class MockEmailProvider implements EmailProvider {
  readonly mode = 'mock' as const;
  private readonly logger = new Logger('MockEmail');
  readonly outbox: (EmailMessage & { sentAt: Date })[] = [];

  constructor(private readonly logs: IntegrationLogService) {}

  async send(message: EmailMessage): Promise<void> {
    this.outbox.push({ ...message, sentAt: new Date() });
    if (this.outbox.length > 500) this.outbox.shift();
    this.logger.debug(`mock email queued template=${message.template}`);
    await this.logs.record({
      provider: 'email',
      operation: message.template,
      mode: 'mock',
      success: true,
      durationMs: 0,
    });
  }

  latestFor(to: string): (EmailMessage & { sentAt: Date }) | undefined {
    return [...this.outbox].reverse().find((m) => m.to === to.toLowerCase());
  }
}

@Injectable()
export class SmtpEmailProvider implements EmailProvider {
  readonly mode = 'smtp' as const;
  private readonly transporter: Transporter;

  constructor(private readonly logs: IntegrationLogService) {
    const e = env();
    this.transporter = nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_PORT === 465,
      requireTLS: e.SMTP_PORT !== 465,
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    const started = Date.now();
    try {
      await this.transporter.sendMail({
        from: env().SMTP_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
      await this.logs.record({
        provider: 'email',
        operation: message.template,
        mode: 'smtp',
        success: true,
        durationMs: Date.now() - started,
      });
    } catch (err) {
      await this.logs.record({
        provider: 'email',
        operation: message.template,
        mode: 'smtp',
        success: false,
        durationMs: Date.now() - started,
        errorCode: err instanceof Error ? err.name : 'unknown',
      });
      throw err;
    }
  }
}
