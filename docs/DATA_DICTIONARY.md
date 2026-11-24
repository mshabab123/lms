# Data dictionary

Shared terminology (spec §16): **Program**, **Section**, **Session** (a scheduled class meeting, `ClassSession`),
**Enrollment**, **Grade**, **Certificate**. "Session" in identity contexts is always written **auth session**.

Conventions: UUID primary keys; timestamps stored in UTC (`timestamptz` semantics via Prisma `DateTime`), displayed
in `Asia/Riyadh`; money is integer **halalas** (1 SAR = 100); status columns are enums with explicit transition matrices.

## Identity (implemented)

| Entity | Key fields | Personal data class | Notes |
|---|---|---|---|
| User | email (unique, lowercased), mobile, passwordHash (Argon2id), status, locale, failedLoginCount, lockedUntil, organizationId | contact data | Disabled, never deleted, on offboarding |
| Profile | fullNameAr, fullNameEn, nationalIdEnc, nationalIdLast4, dateOfBirthEnc, identityPurposeRef | identity; **sensitive identifiers encrypted (AES-256-GCM)** | Sensitive fields are not collected by any flow until a lawful purpose is documented (TODO(HUMAN) #16); masked by default |
| Session (auth session) | tokenHash (SHA-256), mfaSatisfied, ip, userAgent, lastSeenAt, expiresAt, revokedAt | device/usage data | Deleted 30 days after expiry/revocation by the worker |
| MfaSecret | secretEnc (encrypted, AAD = user id), confirmedAt, lastUsedStep | security secret | |
| RecoveryCode | codeHash, usedAt | security secret | 10 per user, single use |
| VerificationToken | purpose (email_verification, password_reset, email_otp), tokenHash, attempts, expiresAt, consumedAt | — | TTLs: 24 h, 30 min, 10 min |
| Role / Permission / RolePermission / UserRole | role key, isStaff, isSystem | — | Permission rows mirror code constants |
| Organization | nameAr, nameEn, crNumber | business data | Corporate sponsor scope |
| PolicyAcceptance | policy, version, acceptedAt, ip | consent evidence | |
| ConsentRecord | channel, purpose, granted, source | consent evidence | Latest row per subject/channel/purpose is effective |

## Platform (implemented)

| Entity | Notes |
|---|---|
| AuditLog | seq, actorId, actorRoles, action, entityType, entityId, correlationId (request id), ip, changes (minimized), prevHash, hash. Append-only. |
| OutboxMessage | topic, eventType, eventVersion, aggregate, payload, status, attempts, nextAttemptAt — used from Phase 3/7 |
| Setting | typed key/value |
| IdempotencyKey | key, scope, requestHash, stored response, expiresAt — used from Phase 3 |
| IntegrationLog | provider, operation, mode, success, durationMs, statusCode, errorCode, reference |
| IntegrationEndpoint | connector key and state |

## KPI definitions (to be implemented with reports, Phase 9)

These are **not interchangeable**: *registrations* (accounts created), *paid enrollments* (enrollments activated by a
verified payment or authorized exception), *active learners* (enrollments in `active`), *unique attendees* (distinct
trainees with ≥1 attendance interval in the period), *concurrent active sessions* (ClassSessions in `live` at an
instant), *completion* (enrollments in `completed` ÷ enrollments that reached a terminal academic state).
Attendance rate is always shown with its denominator.
