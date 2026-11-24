# Threat model & data-flow review — Identity (Phase 1)

Scope: registration, sign-in, MFA, sessions, password reset, staff administration, audit. Required by spec §0.10 because
identity handles personal data and (in future) national ID / date of birth.

## Data flows

```text
Browser ──HTTPS──► Caddy ──► Next.js (SSR, same-origin proxy) ──► API ──► PostgreSQL
                                         │                          ├──► SMTP (email adapter)
                                         └── cookie forwarded only  └──► Redis (rate limits; staging/prod)
```
Personal data at rest: name, email, mobile (User/Profile); IP + user agent (Session, PolicyAcceptance, AuditLog).
Secrets at rest: Argon2id password hashes; AES-256-GCM encrypted TOTP secrets; SHA-256 hashes of session tokens,
reset/verification tokens and recovery codes. National ID / DOB columns exist (encrypted) but **no flow collects them**.

## Threats (STRIDE) and controls

| Threat | Control | Test |
|---|---|---|
| Credential stuffing / brute force | per-IP and per-account rate limits; progressive lockout; Argon2id | `auth.int.test.ts` lockout + rate-limit tests |
| Account enumeration | uniform errors and timing (dummy hash); register/reset/OTP requests always 202 | "same error for unknown users" test |
| Session theft / fixation | httpOnly + SameSite + Secure + `__Host-` cookie; token rotation on MFA elevation; idle + absolute expiry; revoke | session revoke tests |
| CSRF | custom header + Origin check + strict CORS | CSRF tests |
| MFA bypass | global guard blocks all non-MFA routes while pending; staff cannot disable MFA | MFA tests |
| TOTP replay | last-used step with conditional update | replay test |
| IDOR on sessions | revoke scoped by `userId` | IDOR test |
| Privilege escalation | permission guard, no self role/status/MFA changes, no editing held roles; role changes revoke target sessions | admin tests |
| Tampering with audit trail | DB triggers, hash chain, least-privilege role | append-only test, verify-chain test |
| Sensitive data in logs | pino redaction (cookies, auth headers, password/email/token/code), path-only request logs, audit sanitizer | audit "never stores secrets" test |
| Key compromise | key id in ciphertext; decrypt-only old keys; rotation runbook | crypto rotation unit test |
| Mock email in production | env validation refuses `EMAIL_PROVIDER=mock` when `APP_ENV=production` | env unit test |

## Residual risks / follow-ups
- CSP still allows inline scripts (DECISIONS D15) — Phase 11.
- No bot protection (CAPTCHA) on public forms yet — rate limits only. Add when a provider is approved (privacy review needed).
- Breached-password screening (k-anonymity API) not implemented — requires a cross-border transfer assessment.
- Redis-backed limiter not exercised on the build machine (no Redis); covered by CI/Compose.
