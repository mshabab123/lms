/**
 * Explicit transition matrices for critical state machines. Every domain service
 * must call assertTransition before persisting a status change.
 */
export type TransitionMatrix<S extends string> = Readonly<Record<S, readonly S[]>>;

export class InvalidTransitionError extends Error {
  constructor(
    readonly machine: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`Invalid ${machine} transition: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function canTransition<S extends string>(
  matrix: TransitionMatrix<S>,
  from: S,
  to: S,
): boolean {
  return matrix[from].includes(to);
}

export function assertTransition<S extends string>(
  machine: string,
  matrix: TransitionMatrix<S>,
  from: S,
  to: S,
): void {
  if (!canTransition(matrix, from, to)) throw new InvalidTransitionError(machine, from, to);
}

export const ENROLLMENT_STATUSES = [
  'pending_payment',
  'active',
  'withdrawn',
  'completed',
  'failed',
  'cancelled',
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const ENROLLMENT_TRANSITIONS: TransitionMatrix<EnrollmentStatus> = {
  pending_payment: ['active', 'cancelled'],
  active: ['withdrawn', 'completed', 'failed'],
  withdrawn: [],
  completed: [],
  failed: [],
  cancelled: [],
};

export const CLASS_SESSION_STATUSES = ['scheduled', 'live', 'ended', 'cancelled'] as const;
export type ClassSessionStatus = (typeof CLASS_SESSION_STATUSES)[number];
export const CLASS_SESSION_TRANSITIONS: TransitionMatrix<ClassSessionStatus> = {
  scheduled: ['live', 'cancelled'],
  live: ['ended'],
  ended: [],
  cancelled: [],
};

export const REFUND_STATUSES = [
  'requested',
  'approved',
  'rejected',
  'processed',
  'failed',
] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];
export const REFUND_TRANSITIONS: TransitionMatrix<RefundStatus> = {
  requested: ['approved', 'rejected'],
  approved: ['processed', 'failed'],
  rejected: [],
  processed: [],
  failed: ['approved'],
};

export const CERTIFICATE_STATUSES = ['issued', 'revoked'] as const;
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number];
export const CERTIFICATE_TRANSITIONS: TransitionMatrix<CertificateStatus> = {
  issued: ['revoked'],
  revoked: [],
};

/** Connector states from spec section 17. `mock`/`configured` are never production-ready. */
export const CONNECTOR_STATES = [
  'disabled',
  'mock',
  'configured',
  'validated',
  'active',
  'degraded',
  'failed',
] as const;
export type ConnectorState = (typeof CONNECTOR_STATES)[number];
