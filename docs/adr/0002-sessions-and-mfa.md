# ADR 0002 — Server-side sessions with staged MFA

- Status: accepted (2026-11-20)

## Context
Spec §2/§6.1: server-side sessions, httpOnly Secure SameSite cookies, Argon2id, TOTP MFA mandatory for staff, email OTP,
session list with revoke, logout everywhere, progressive lockout.

## Decision
- Opaque 256-bit random token in cookie `__Host-mzn_sid` (production) / `mzn_sid` (dev); DB stores SHA-256 only.
- Absolute TTL (`SESSION_TTL_MINUTES`) and idle timeout (`SESSION_IDLE_MINUTES`); `lastSeenAt` updated at most once/minute.
- Sessions live in PostgreSQL (see DECISIONS D2), revocable individually or all at once; privilege changes, password
  reset and MFA enablement revoke other sessions.
- Second factor is a session state (`mfaSatisfied`), not a separate token. A global guard blocks everything except
  routes marked `allowPendingMfa` until it is satisfied; the token rotates on elevation.
- TOTP (RFC 6238, 30 s, ±1 step) with stored last-used step to prevent replay; 10 single-use recovery codes (SHA-256 at rest).
- CSRF: custom header + Origin check (DECISIONS D3).

## Consequences
- One indexed DB lookup per authenticated request. Acceptable now; Redis cache can be added without API changes.
- Staff cannot use any staff capability before enrolling MFA, including through API calls.
