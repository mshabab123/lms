import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { Errors } from '../../common/errors';
import {
  EMAIL_PROVIDER,
  MockEmailProvider,
  type EmailProvider,
} from '../../integrations/email.provider';

/**
 * Development-only mailbox for the mock email adapter (used by e2e tests).
 * Only registered when APP_ENV is development or test (see app.module.ts).
 */
@ApiExcludeController()
@Controller('dev')
export class DevController {
  constructor(@Inject(EMAIL_PROVIDER) private readonly email: EmailProvider) {}

  @Public()
  @Get('mailbox/latest')
  latest(@Query('to') to: string) {
    if (!(this.email instanceof MockEmailProvider)) throw Errors.notFound();
    const message = this.email.latestFor(String(to ?? ''));
    if (!message) throw Errors.notFound('Email');
    return message;
  }
}
