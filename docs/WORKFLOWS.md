# Workflows

Implemented workflows are marked **[live]**; the rest are the target design for later phases.

## Identity [live]

### Trainee registration
1. `POST /auth/register` (rate-limited per IP) with names, email, mobile, password, current privacy-notice and
   terms versions (fetched from `GET /auth/policies`), optional marketing consent (unchecked by default).
2. If the email exists → same `202`, the owner receives an "account exists" email (no enumeration).
3. Otherwise, in one transaction: `User(pending_verification)`, `Profile`, `trainee` role, two `PolicyAcceptance`
   rows, one `ConsentRecord` (granted true/false), a single-use email-verification token, audit `user.registered`.
4. Email link → `POST /auth/verify-email` → `active`.

### Sign-in
```text
password or email-OTP ──► first factor OK?
   ├─ disabled / unverified ─► 403 ACCOUNT_DISABLED / EMAIL_NOT_VERIFIED
   ├─ MFA enabled ─────────► session(mfaSatisfied=false) → POST /auth/mfa/verify (TOTP or recovery code) → token rotated
   ├─ staff, no MFA ───────► session(mfaSatisfied=false) → /mfa-setup → POST /auth/mfa/enable → recovery codes, other sessions revoked
   └─ otherwise ───────────► session(mfaSatisfied=true)
```
Failures increment `failedLoginCount`; every 5th failure locks the account (15 min, doubling, ≤ 24 h). TOTP codes are
single-use (last used time step stored, conditional update prevents concurrent replay).

### Staff onboarding / offboarding
- Admin (`user.write`) creates a staff user with roles → invitation email with a 30-min set-password link → first sign-in
  forces MFA enrolment.
- Role changes revoke all of the target's sessions immediately; admins cannot change their own roles or edit a role they hold.
- Offboarding = `PATCH /admin/users/:id/status {disabled:true}`: sessions revoked, account kept (never deleted).

### MFA reset by support
Support (`mfa.reset`) records an out-of-band identity-check reference; MFA secret and recovery codes are deleted,
sessions revoked, the user is emailed, the action is audited. Self-reset is forbidden.

## State machines (defined in `packages/shared/src/state-machine.ts`)

| Machine | Transitions |
|---|---|
| Enrollment | pending_payment → active \| cancelled; active → withdrawn \| completed \| failed; terminal otherwise |
| ClassSession | scheduled → live \| cancelled; live → ended |
| Refund | requested → approved \| rejected; approved → processed \| failed; failed → approved (retry) |
| Certificate | issued → revoked |

Every status change must call `assertTransition`; invalid transitions return `409 INVALID_TRANSITION`.

## Required end-to-end journeys (spec §15) — planned

1. Visitor → program → register → seat hold → confirmed payment → active enrollment → schedule & classroom (Phases 2–4).
2. Instructor class → verified join/leave → attendance → approved correction → trainee view → completion (Phases 4, 6).
3. Timed quiz → grading → coordinator approval → publication → appeal/amendment → audit (Phase 5).
4. Approved grade + attendance + policy snapshot → completion → certificate approval (SoD) → verification → revocation (Phase 6).
5. Refund/transfer → reconcile seat, invoice, gateway → consistent access and notifications (Phase 3, 10).
