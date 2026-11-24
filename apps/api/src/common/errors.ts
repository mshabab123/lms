import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Domain error with a stable machine code. The web app maps `code` to an i18n
 * message, so codes are part of the API contract.
 */
export class AppError extends HttpException {
  constructor(
    readonly code: string,
    status: HttpStatus,
    readonly details?: Record<string, unknown>,
  ) {
    super({ code, ...(details ? { details } : {}) }, status);
  }
}

export const Errors = {
  unauthenticated: () => new AppError('AUTH_REQUIRED', HttpStatus.UNAUTHORIZED),
  forbidden: (code = 'FORBIDDEN') => new AppError(code, HttpStatus.FORBIDDEN),
  mfaRequired: () => new AppError('MFA_REQUIRED', HttpStatus.FORBIDDEN),
  notFound: (entity = 'resource') => new AppError('NOT_FOUND', HttpStatus.NOT_FOUND, { entity }),
  conflict: (code: string) => new AppError(code, HttpStatus.CONFLICT),
  badRequest: (code: string, details?: Record<string, unknown>) =>
    new AppError(code, HttpStatus.BAD_REQUEST, details),
  tooMany: (retryAfterSeconds: number) =>
    new AppError('RATE_LIMITED', HttpStatus.TOO_MANY_REQUESTS, { retryAfterSeconds }),
  separationOfDuties: () => new AppError('SEPARATION_OF_DUTIES', HttpStatus.FORBIDDEN),
};
