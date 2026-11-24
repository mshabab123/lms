import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import type { Response } from 'express';
import { InvalidTransitionError } from '@mzn/shared';
import { requestContext } from './request-context';

/** Uniform error envelope: { code, details?, requestId }. Never leaks stack traces. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const requestId = requestContext.get()?.requestId;

    if (exception instanceof InvalidTransitionError) {
      res.status(HttpStatus.CONFLICT).json({
        code: 'INVALID_TRANSITION',
        details: { machine: exception.machine, from: exception.from, to: exception.to },
        requestId,
      });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const payload =
        typeof body === 'object' && body !== null && 'code' in body
          ? body
          : { code: status === 404 ? 'NOT_FOUND' : `HTTP_${status}` };
      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        const retry = (payload as { details?: { retryAfterSeconds?: number } }).details
          ?.retryAfterSeconds;
        if (retry) res.setHeader('Retry-After', String(retry));
      }
      res.status(status).json({ ...payload, requestId });
      return;
    }
    this.logger.error({ err: exception, requestId }, 'Unhandled exception');
    Sentry.captureException(exception);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ code: 'INTERNAL_ERROR', requestId });
  }
}
