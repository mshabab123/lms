# Domain ownership

One portal, bounded internal domains (spec §14). A domain module is the only writer of the tables it owns; other
modules call its application services or consume its events. Read models built from another domain's data are
labelled *derived* and are refreshable.

## Module dependency map

```text
apps/web (Next.js portal, ar/en)
   │  same-origin /api/v1/*  (cookie session, CSRF header)
   ▼
apps/api (NestJS modular monolith)
   ├── platform      Prisma, Redis, rate limiter, audit writer, integration log, email adapter   (cross-cutting)
   ├── identity      auth, sessions, MFA, users, roles                                           [implemented]
   ├── audit         audit query/export/verify                                                   [implemented]
   ├── catalog       programs, versions, categories, landing content                            [Phase 2]
   ├── delivery      sections, schedules, class sessions, calendar                              [Phase 2]
   ├── enrollment    seat holds, enrollments, transfers                                          [Phase 3]
   ├── commerce      orders, payments, invoices, credit notes, refunds, coupons                  [Phase 3]
   ├── classroom     LiveKit adapter, join tokens, recordings, raw join/leave events             [Phase 4]
   ├── attendance    intervals, derived records, override requests                               [Phase 4]
   ├── content       modules, lessons, attachments                                               [Phase 5]
   ├── assessment    question banks, quizzes, assignments, gradebook, approvals, appeals         [Phase 5]
   ├── completion    completion decisions, certificates, verification                           [Phase 6]
   ├── integrations  outbox delivery, NELC adapter, connector registry                          [Phase 7]
   ├── marketing     leads, campaigns, consent, UTM                                              [Phase 8]
   ├── support       tickets, notifications, surveys                                             [Phase 8]
   └── compliance    privacy requests, retention, processing records, breaches, reporting        [Phase 9]
apps/worker  scheduled jobs (advisory-locked), later outbox/BullMQ consumers
packages/shared  permissions, navigation, state machines, money, Zod schemas (browser-safe)
packages/db      Prisma schema + client, field crypto, RBAC sync, seed (server-only)
packages/ui      design tokens + primitives
```

Allowed dependency direction: `web → shared, ui`; `api/worker → db, shared`; `db → shared`. Domain modules may depend
on `platform` and on another domain's **exported application service**, never on its tables.

## Canonical records (spec §15)

| Record | Owning module | Tables (current/planned) | Who may change | Consumers |
|---|---|---|---|---|
| Person & staff identity | identity | User, Profile, Session, MfaSecret, RecoveryCode, VerificationToken, Role, Permission, RolePermission, UserRole, Organization | Account owner (own password/MFA/locale/sessions); identity admin (`user.write`, `user.disable`, `role.write`); support (`mfa.reset` with identity-check reference) | every domain via stable `User.id` |
| Policy acceptance | identity (compliance-relevant) | PolicyAcceptance | written once at registration; append-only by convention | compliance |
| Marketing consent | marketing | ConsentRecord | subject (grant/withdraw); registration writes the initial choice | marketing campaigns |
| Audit trail | platform/audit | AuditLog | append-only (DB trigger); nobody updates or deletes | compliance, security |
| Outbox | platform | OutboxMessage | written in the producer's transaction; delivery status by worker only | integrations |
| Program version & completion rules | catalog | Program, ProgramVersion, Category | coordinator drafts; academic approver publishes | enrollment, assessment, completion |
| Section membership & enrollment status | enrollment | Enrollment, seat holds | admissions/coordinator within documented controls | classroom, assessment, reporting |
| Raw join/leave events | classroom | AttendanceInterval (raw) | append-only verified ingestion | attendance |
| Approved attendance | attendance | AttendanceRecord, override request/approval | instructor proposes; coordinator approves | completion, reports |
| Approved grades | assessment | Grade, GradeChange, GradeApproval, GradePublication, GradeAppeal | instructor grades; separate approver publishes | completion, trainee view |
| Payment, invoice, credit note | commerce | Order, Payment, Invoice, CreditNote, Refund | finance with separation of duties | enrollment eligibility, reporting |
| Certificate status | completion | CompletionDecision, Certificate | issuance/revocation workflow (SoD) | public verification, trainee |

## Rules

1. No module writes another module's tables. Tightly related state changes inside one request use one DB transaction
   **through the owning module's service** (e.g. enrollment activation calls the commerce service).
2. Cross-module asynchronous effects go through the outbox with idempotent consumers.
3. No duplication of authoritative grades, enrollment or financial states.
4. Every external record shown in the UI displays provenance and last-sync time.
