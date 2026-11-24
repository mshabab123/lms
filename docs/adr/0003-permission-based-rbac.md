# ADR 0003 — Permission-based authorization with declared route policies

- Status: accepted (2026-11-20)

## Decision
- Permissions are code constants (`packages/shared/src/permissions.ts`), mirrored into the `Permission` table on seed.
  Roles are DB rows grouping permissions, editable in the admin UI; default roles are seeded and flagged `isSystem`.
- Each route declares exactly one policy: `@Public()`, `@Authenticated()` or `@RequirePermissions(...)`. Boot fails if a
  route has none; the guard fails closed.
- Scope checks (own sections, own organization, own records) and separation-of-duties rules are enforced in domain
  services, with negative tests per rule.
- Guard tests are generated from route metadata (`apps/api/test/access-matrix.int.test.ts`).
- Anti-escalation: users cannot change their own roles, edit a role they hold, disable themselves or reset their own MFA.

## Consequences
- Navigation is derived from the same permissions (`visibleNav`) but is only UX; the API is the enforcement point.
