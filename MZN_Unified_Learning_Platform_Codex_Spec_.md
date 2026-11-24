# MZN Unified Learning Platform — Full Build Specification for Codex (v2.0)

You are the lead engineer building **MZN Unified Learning Platform**, a modular, production-oriented education and training operations platform for MZN Training Company (شركة مزن للتدريب) (Saudi Arabia). Build the complete system described here. This document is the implementation baseline. Any unresolved regulatory, legal, capacity, vendor, or owner decision must be treated as an explicit dependency, not silently assumed.

---

## 0. How you must work

1. **Work in the phases of section 12, in order.** Do not start a phase until the previous one meets its acceptance criteria.
2. At the end of every phase: run lint, typecheck, unit tests, integration tests and e2e tests; fix every failure; update `PROGRESS.md` (what is done, what is next, open questions); commit with a clear message.
3. **No fake internal features.** Every completed screen, endpoint and job must work end to end against the development/test database. External connectors may use clearly labeled mock adapters; never show a mock payment, regulatory submission, or certificate as real in production. Unimplemented regulated integrations must remain disabled in production.
4. **Never invent an external API or regulatory rule.** Verify current official documentation, applicable obligations, and versioned contract tests before implementing each integration. If unavailable, implement only an interface and mock, log `TODO(HUMAN)` in `PROGRESS.md`, and leave the real integration blocked. Do not claim certification or compliance from implementation alone.
5. Use the latest stable LTS/stable release of each tool at build time and pin exact versions in the lockfile.
6. Secrets come only from environment variables. Maintain `.env.example` with every variable documented. Never commit a secret.
7. Write code and comments in English. All user-facing text goes through i18n with **Arabic as the default locale** and English as the second.
8. When this spec is silent, choose the simplest secure option and record the decision in `docs/DECISIONS.md`.
9. Maintain `docs/DOMAIN_OWNERSHIP.md`, `docs/WORKFLOWS.md`, `docs/INTEGRATIONS.md`, `docs/DATA_DICTIONARY.md`, and an ADR for each major architectural decision.
10. Run a short threat-model and data-flow review before implementing any feature that handles identity numbers, payments, grades, attendance, recordings, or external disclosure.
11. Never replace an existing working integration merely to enforce a single codebase. Optimize for a unified user experience, modular internals, and stable contracts.

---

## 1. Product summary

- One unified web portal for applicants, trainees, instructors, academic operations, admissions, finance, support, corporate sponsors and management. One sign-in, consistent navigation, consolidated notifications and auditable workflows.
- Live, instructor-led online training. Planning assumption: about 1,000 registered trainees and sections (cohorts) of up to 120; **concurrency and simultaneous rooms are not established by those figures** and must be confirmed and load-tested separately.
- Trainees register and pay, attend live classes, take quizzes and assignments, and receive verifiable certificates.
- Staff roles cover academics, admissions, marketing, finance, support, compliance and administration.
- Regulatory workstreams to assess with the owner and qualified advisers: applicable TVTC training permissions and program identifiers; whether and how NELC/FutureX reporting applies; PDPL and relevant regulations; applicable NCA controls if in scope; and ZATCA e-invoicing obligations, including relevant integration requirements. **Do not assume that every mentioned control, integration, or identifier applies to every program or business.**
- Hosting: small development/pilot deployment may begin on one VPS, but production sizing is conditional on measured load and security review. LiveKit/media workloads, database backups, and external object storage must be planned separately. Future OCI migration is optional and conditional on availability, residency assessment, service fit and cost. Favor portable components (PostgreSQL, S3-compatible storage, containers) without claiming zero vendor lock-in.
- Product boundary: **not** a full university student information system by default. Accreditation, transcripts, academic standing, degree audit and university-grade equivalencies require a separately scoped Higher Education/SIS extension.

---

## 2. Tech stack (fixed)

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo: `apps/web`, `apps/api`, `apps/worker`, `packages/shared`, `packages/ui`, `infra/` |
| Frontend | Next.js (App Router, TypeScript, React Server Components where useful) |
| UI | Tailwind CSS + shadcn/ui (Radix), full RTL support, design tokens from section 3 |
| Forms / data | React Hook Form + Zod, TanStack Query |
| i18n | next-intl, locales `ar` (default, RTL) and `en` |
| Backend | NestJS (TypeScript), **domain-module modular monolith** with REST + OpenAPI (Swagger), transactional outbox and versioned events; later extraction only if measurements justify it |
| Validation | Zod schemas in `packages/shared`, reused by web and api |
| Database | PostgreSQL + Prisma (migrations committed), PgBouncer in production |
| Cache / queues | Redis + BullMQ (jobs run in `apps/worker`) |
| Live classes | LiveKit self-hosted (server SDK in API, `livekit-client` + LiveKit React components in web), LiveKit Egress for recording; **independent deployment and capacity testing for media** |
| Object storage | S3 API via AWS SDK v3 (MinIO locally and on the VPS, OCI Object Storage later) |
| Auth | Central identity and SSO boundary; server-side sessions in Redis, httpOnly Secure SameSite cookies, Argon2id password hashing, TOTP MFA, email OTP; standards-based OIDC/SAML integration can be added later after security review |
| PDF | HTML templates rendered with headless Chromium (Playwright) so Arabic shaping and RTL are correct |
| Email / SMS | Nodemailer (SMTP) + `SmsProvider` adapter |
| Observability | pino structured logs, Prometheus metrics endpoint, Sentry, health and readiness endpoints |
| Tests | Vitest or Jest (unit), Supertest (API integration against a real Postgres), Playwright (e2e) |
| Delivery | Docker multi-stage images, Docker Compose, Caddy (TLS, HTTP/3), GitHub Actions CI |

---

## 3. Design system

Keep every token in one file (`packages/ui/src/tokens.css` as CSS variables, mapped into Tailwind). Changing a color must be a one-line change.

| Token | Value | Use |
|---|---|---|
| `--color-primary` | `#12526B` | sidebar, primary buttons, links |
| `--color-accent` | `#F2A541` | key call-to-action, highlights (dark text on it) |
| `--color-bg` | `#F4F7F9` | page background |
| `--color-surface` | `#FFFFFF` | cards, header |
| `--color-ink` | `#10232E` | text |
| `--color-success` | `#1A6E46` (soft `#E3F4EB`) | present, completed, paid |
| `--color-warning` | `#7A4800` (soft `#FFF1D6`) | late, pending |
| `--color-danger` | `#A3231C` (soft `#FCE8E6`) | absent, failed, overdue |

- Derived tokens: muted text = ink 70% on surface; borders = ink 14% on surface; primary-soft = primary 11% on surface.
- Font: IBM Plex Sans Arabic (self-hosted with `next/font`), weights 400/500/600/700. Base size 16px.
- Radius: 10px controls, 16px cards. Touch targets at least 44px.
- Layout: sidebar on the right in RTL (primary background), top header (surface), content on `bg`. Sidebar collapses to a drawer on mobile.
- Accessibility: WCAG 2.1 AA. Text contrast at least 4.5:1, visible focus rings, full keyboard navigation, semantic HTML, labels on every input, `dir` and `lang` set per locale, status never conveyed by color alone.
- Dates: store UTC, display in `Asia/Riyadh`, show Gregorian with optional Hijri. Currency SAR.

---

## 4. Roles and permissions

Authorization is **permission-based**. Permissions are code constants (for example `invoice.read`, `refund.approve`, `grade.write`, `certificate.approve`). Roles are database rows that group permissions and are editable from the admin UI. Seed the default roles below. Every API route declares the permission it requires through a guard; the UI hides what the user cannot do, but the API is the enforcement point. Scope checks are mandatory (an instructor sees only their own sections; a sponsor sees only its own trainees).

| Role | Can | Cannot |
|---|---|---|
| Trainee | enroll, pay, attend, submit, view own grades, invoices, certificates | see other trainees' data |
| Instructor | run live classes, upload content, grade, correct attendance for own sections | approve certificates, see payments |
| Program Coordinator | manage programs, sections, schedules, assignments of instructors; approve results and certificates | finance operations |
| Admissions Officer | manual enrollment, section transfers, trainee inquiries | approve results, finance operations |
| Marketing Officer | edit program landing content, create coupons (draft), manage leads, view aggregated campaign statistics | see grades or attendance, change base prices, export trainee lists |
| Marketing Manager | all of the above, plus approve discounts and send campaigns | academic data |
| Finance Officer | view payments and invoices, reconcile, record bank transfers, request refunds, issue credit notes | approve refunds, change prices, academic data |
| Finance Manager | approve refunds and exceptional discounts, financial and VAT reports, exports | edit an issued invoice, academic data |
| Support Agent | handle tickets, reset MFA after identity check, view account status | grades, money |
| Executive | read-only dashboards and reports across the platform | any write |
| Compliance and Security Officer | read audit log, privacy requests, integration status, security reports | any business write |
| System Admin | users, roles, settings, integrations | (all actions still audited) |
| Corporate Sponsor (optional) | enroll own employees, view their progress and certificates | anything outside its organization |
| Public visitor | browse catalog, verify a certificate | — |

Hard rules:
- Separation of duties: the user who entered a grade cannot approve the certificate for it; the user who requested a refund cannot approve it. Enforce in the API.
- Staff accounts are individual, require MFA, and are disabled (not deleted) on offboarding.
- Every staff write is recorded in the audit log (section 8).

---

## 5. Data model (minimum entities)

Design the Prisma schema to cover at least:

- **Identity:** User, Profile, Role, Permission, RolePermission, UserRole, Session, MfaSecret, PasswordReset, Organization (sponsor).
- **Catalog:** Program (title ar/en, description, hours, price, VAT flag, **TVTC accreditation number**, delivery mode, completion rules), ProgramVersion, Category.
- **Delivery:** Section (capacity configurable, maximum initial policy 120 unless load-tested, instructor, dates), Enrollment (explicit transition state machine: pending_payment, active, withdrawn, completed, failed, cancelled), ClassSession (scheduled, live, ended, cancelled), Recording.
- **Content:** Module, Lesson, Attachment.
- **Assessment:** QuestionBank, Question (MCQ, true/false, short answer, essay), Quiz, QuizAttempt, Answer, Assignment, Submission, Grade, GradeChange (history), GradebookPolicyVersion, GradeApproval, GradePublication, GradeAppeal.
- **Attendance:** AttendanceInterval (validated join/leave events), AttendanceRecord (derived per trainee and session: total unique minutes, status present/late/absent/excused, policy version, source auto/manual, corrected by), AttendanceOverrideRequest, AttendanceOverrideApproval.
- **Completion:** CompletionDecision, Certificate (serial, verification code, PDF key, status issued/revoked).
- **Commerce:** Order, Payment, PaymentAttempt, Refund (requested, approved, rejected, processed), Coupon, CouponRedemption, Invoice, InvoiceLine, CreditNote.
- **Marketing:** Lead, Campaign, CampaignRecipient, ConsentRecord, UtmAttribution.
- **Support:** Ticket, TicketMessage.
- **Compliance:** AuditLog (append-only), LearningEvent, OutboxMessage, InboxMessage, PrivacyRequest, ProcessingRecord, BreachIncident, IntegrationLog, DataRetentionRule, RegulatoryObligation.
- **System:** Notification, Setting, FileObject, IdempotencyKey, IntegrationEndpoint, ExternalIdentityLink, ImportBatch, ImportRowError, ApprovalRequest, DocumentTemplateVersion, CalendarEvent.

Rules: UUID primary keys, `createdAt`/`updatedAt` where meaningful, lawful retention/deletion policies rather than blanket soft-delete, money as integer halalas, indexes on foreign keys and actual high-use filter columns. All cross-module entity references use stable IDs; use transactional constraints, unique keys and explicit state transitions to prevent inconsistent data.

---

## 6. Functional requirements

### 6.1 Accounts and authentication
- Register with name, email and mobile; collect Arabic/English names, national ID/iqama and date of birth **only when justified by a documented lawful purpose and required by the relevant training/compliance workflow**. Encrypt sensitive identifiers at field level and mask them by default.
- Email verification, login, logout everywhere, password reset, session list with revoke.
- MFA: TOTP mandatory for all staff roles, optional for trainees; recovery codes.
- Rate limiting and progressive lockout on login, OTP and reset endpoints.
- Keep an `IdentityProvider` interface so national single sign-on can be added later; do not implement it now.

### 6.2 Public catalog
- SEO-friendly program pages (server-rendered, metadata, sitemap, structured data) in Arabic and English.
- Each program page shows the accreditation number, hours, schedule of open sections, price including VAT, and instructor.
- Lead capture form with explicit marketing consent checkbox (unchecked by default).

### 6.3 Enrollment, payment and invoicing
- Checkout: choose section, apply coupon, initiate payment. Create a short-lived **seat hold** atomically with expiry and idempotency key; activate enrollment only on verified successful payment or authorized manual exception. Release holds on timeout/failure; prevent overselling with database constraints/locking and reconciliation. Issue invoice according to confirmed tax-event policy and send confirmation only after committed state transitions.
- Payments go through `PaymentProvider` (section 9). Verify gateway webhooks by signature, make handlers idempotent, never store card data.
- Bank transfer option: finance officer records and confirms it.
- Invoices: sequential numbering, configured tax rules (Saudi standard VAT rate is currently 15%, but treatment depends on supply and entity status), required seller/buyer fields, QR and Arabic PDF when applicable. **An issued invoice is immutable.** Corrections use lawful linked credit/debit notes. Do not assume every transaction attracts VAT or has the same e-invoicing workflow.
- E-invoicing goes through `EInvoiceProvider` (section 9): each invoice and note is submitted, and the provider's response (status, hash, QR payload) is stored.
- Refunds: two-person approval by default for financial separation of duties; any threshold-based automation requires documented policy and auditable approval. Reconcile gateway status and issue applicable credit note; handle partial refunds and repeated webhook delivery.

### 6.4 Sections and scheduling
- Coordinator creates sections with capacity, instructor, and a recurring schedule that generates ClassSessions.
- Trainee calendar, reminders by email (24 hours and 30 minutes before), ICS export.
- Transfers between sections with audit trail and capacity check.

### 6.5 Live classroom (LiveKit)
- API issues short-lived LiveKit access tokens with grants by role. Instructor: publish camera, microphone, screen. Trainee: subscribe only by default; may publish microphone after "raise hand" is accepted by the instructor.
- Classroom UI: instructor video and screen share, participant list, chat, raise hand, polls, mute all, remove participant, connection quality indicator, device check before joining.
- One room per ClassSession. Room opens 15 minutes before start for the instructor.
- Recording: instructor or approved policy starts LiveKit Egress to object storage; prior notice, access policy, retention/deletion schedule and any needed legal basis are required. Recordings appear only to authorized enrolled trainees through signed expiring URLs.
- Attendance is computed from verified LiveKit events (join/leave) into deduplicated intervals. A reconciliation job handles delayed, repeated, out-of-order or missing events and caps overlapping minutes. Attendance policy is versioned by program (for example 75% present, 10-minute lateness, **illustrative defaults only**). Instructors request corrections; coordinator approval and audit trail apply to sensitive overrides.
- Fallback: each session has an optional backup meeting URL; if the LiveKit health check fails, the session page shows the backup link and notifies participants.
- LiveKit runs on a separate host; configure URL and keys by environment.

### 6.6 Content
- Modules and lessons with rich text, files (PDF, slides), and session recordings. Upload through presigned URLs with size and MIME checks and antivirus scanning (ClamAV container). Downloads only through signed URLs after an enrollment check.

### 6.7 Assessments and grades
- Question bank per program; quizzes with time limit, availability window, attempts limit, question and option shuffling, auto-grading for objective questions, manual grading for essays.
- Server is the source of truth for timing; autosave answers; resume after disconnect.
- Assignments with file submission, due date, late policy, rubric, feedback.
- Gradebook per section with versioned assessment weights and rounding rules; instructor drafts → coordinator reviews → approved grades lock → trainee publication. Every change records who, when, old/new values and reason; post-lock changes require a separate authorized amendment workflow and grade appeal tracking.

### 6.8 Completion and certificates
- Completion rules per program: minimum attendance percentage, minimum final grade, required assessments.
- A job evaluates eligibility from **approved/published grades** and approved attendance only; the coordinator reviews and approves (separation of duties enforced). Use a frozen policy-version snapshot and completion evidence for every issued certificate.
- Certificate PDF (Arabic and English) with trainee name, program, hours, dates, accreditation number, serial and QR code.
- Public verification page `/verify/<code>` shows validity, holder name, program and issue date, and nothing else. Certificates can be revoked with a reason; the verification page reflects it.
- A certificate QR contains only an unpredictable verification URL or appropriately signed token; public lookup checks server-side certificate state and revocation. Signatures help integrity but do not by themselves prove the issuing organization is trustworthy or that a certificate is regulator-accredited.

### 6.9 Learning records and NELC integration
- Emit versioned domain and learning events; where needed map learning activities to a validated xAPI-compatible profile (actor, verb, object, result, context, timestamp). Do not label custom JSON as standards-compliant xAPI without testing.
- The same transaction writes an `OutboxMessage`. A worker delivers to **authorized and applicable** external integrations through `NelcProvider` (section 9) only after official contracts, credentials and obligations are verified, with retries, exponential backoff, dead-letter queue, idempotency and replay visibility. Never fabricate a successful external submission.

### 6.10 Marketing
- Coupons (percentage or fixed, limits, validity, per-program), created by marketing, activated only after manager approval above a configurable threshold.
- Leads pipeline, UTM attribution on orders, conversion dashboard with aggregated numbers.
- Campaigns by email or SMS **only to recipients with a valid ConsentRecord**; every message has an unsubscribe link; unsubscribes take effect immediately.

### 6.11 Finance
- Payments list, reconciliation view against gateway settlements, refunds queue, VAT report, revenue by program and period, CSV and Excel export, immutable financial audit trail.

### 6.12 Support
- Ticketing between trainees and support with categories, status, internal notes, SLA timers, email notifications.

### 6.13 Administration and reporting
- Users, roles and permissions editor, platform settings, integration status page, audit log viewer with filters and export.
- Dashboards per role: trainee, instructor, coordinator, marketing, finance, executive (enrollments, revenue, attendance rate, completion rate, satisfaction survey results).
- End-of-program satisfaction survey for trainees.

### 6.14 Privacy (PDPL)
- Privacy notice and terms shown at registration with versioned acceptance stored.
- Separate, optional marketing consent; consent history kept.
- Self-service privacy requests: access (export my data), correction, deletion; staff workflow with due dates.
- Retention schedule per data category with scheduled anonymization jobs; financial and academic records kept for the configured legal period.
- Records of processing activities and a breach incident register with notification deadline tracking.
- Data minimization in every list and export; exports require a specific permission and are audited.

---

## 7. Non-functional requirements

**Performance**
- Target API p95 under 300 ms for standard cached/non-complex reads **at a validated load profile**, excluding video and third-party latency. The original 1,000 concurrent-user target is aspirational until load scenarios, infrastructure and budget are agreed; catalog pages use caching.
- No N+1 queries; pagination everywhere; background jobs for anything slower than 1 second.
- Load test scripts (k6) for: login bursts, enrollment peaks, 120 users joining one class (plus optional 150-user stretch), total simultaneous video-room loads, and 500 concurrent quiz submissions. Define failure thresholds, topology and network conditions before calling a run passing.

**Reliability**
- Health and readiness endpoints for every service; graceful shutdown; idempotent jobs and webhooks.
- Backups: pgBackRest with WAL archiving (PITR) to off-server encrypted object storage; tested restore and retention, independent storage backup strategy. **Design targets** RPO 15 minutes, RTO 2 hours, subject to rehearsal and chosen hosting capabilities; never assert achieved objectives before testing.
- `infra/` contains a one-command rebuild of the whole stack on a fresh server.

**Observability**
- Structured logs with request IDs and no personal data; metrics; Sentry; uptime checks; alert rules for API errors, queue backlog, failed outbox deliveries, backup failures, certificate expiry.

---

## 8. Security requirements

- OWASP ASVS Level 2 as an engineering baseline; conduct an applicability assessment of relevant NCA controls rather than asserting automatic coverage or mandatory scope for every private training provider.
- TLS everywhere; HSTS; strict Content Security Policy; secure headers; CSRF protection for cookie sessions; strict CORS.
- Input validation with Zod on every endpoint; parameterized queries only; output encoding; file upload hardening.
- Field-level encryption (AES-256-GCM, key from environment or KMS) for national ID, date of birth and MFA secrets; encrypted backups.
- Rate limiting per IP and per account; bot protection on public forms.
- **Audit log:** append-only events recording actor, role, action, entity, timestamp, correlation ID and strictly minimized field-level change metadata. Avoid credentials, national IDs, medical data and sensitive free text in before/after logs. Prevent UPDATE/DELETE by application role; provide tamper-evidence, protected retention and privileged access controls.
- Least-privilege database users; containers run as non-root; read-only file systems where possible; only Caddy is exposed publicly.
- Dependency and image scanning in CI (fail on high severity); secret scanning; SAST lint rules.
- Exam integrity: server-side timing, attempt tokens, answer payloads never include correct answers before submission.
- Security documentation in `docs/security/`: threat model, access control matrix, incident response runbook, backup and restore runbook, key rotation procedure.

---

## 9. External adapters

Each adapter is a TypeScript interface in the API with a `mock` implementation (deterministic, used in development and tests) and a real implementation selected by environment variable. Log every call to `IntegrationLog` without secrets.

| Interface | Purpose | Real implementation |
|---|---|---|
| `PaymentProvider` | create payment, verify webhook, refund, fetch status | One selected card/mada gateway first; BNPL (Tamara/Tabby) optional after business approval and provider eligibility |
| `EInvoiceProvider` | submit applicable invoice and notes, return status and required fields | ZATCA-compatible implementation/provider chosen after official verification of scope and technical requirements |
| `NelcProvider` | deliver applicable learning records (if required/authorized) | implement strictly from verified current NELC integration specification; disabled until legal/technical applicability confirmed |
| `SmsProvider` | OTP and notifications | a Saudi SMS provider chosen by the owner |
| `EmailProvider` | transactional and campaign email | SMTP |
| `LiveProvider` | tokens, rooms, recording, webhooks | LiveKit |
| `StorageProvider` | presigned upload and download | any S3-compatible store |
| `AntivirusProvider` | scan uploads | ClamAV |

---

## 10. Infrastructure

- `infra/compose/app/`: caddy, web, api, worker, postgres, pgbouncer, redis, minio, clamav, prometheus, grafana. Use resource profiles; monitoring and public endpoints must be appropriately isolated.
- `infra/compose/live/`: livekit, livekit-egress, redis, caddy (separate host; UDP ports documented).
- Environments: `development`, `staging`, `production`, driven only by environment variables.
- CI (GitHub Actions): install, lint, typecheck, unit, integration (service containers), e2e, build images, scan. Deployment by a manual-approval job that pulls images and runs migrations.
- `docs/ops/`: deploy, rollback, restore from backup, rotate keys, add a LiveKit node, migrate to OCI (PostgreSQL to OCI PostgreSQL, MinIO to OCI Object Storage, Compose to container instances or Kubernetes).
- Maintain a documented personal-data inventory, processing locations and cross-border transfer assessment for cloud, CDN, analytics, SMS, email, support and incident tooling. Region selection alone does not establish compliance; disable unreviewed transfers and third-party trackers by default.

---

## 11. Quality bar and definition of done

A feature is done only when:
1. It works in the UI in Arabic (RTL) and English, on desktop and at 390px width.
2. Its API has Zod validation, permission and scope guards, OpenAPI documentation and integration tests for success, forbidden and invalid cases.
3. Writes are audited and learning events are emitted where relevant.
4. It has at least one Playwright e2e test on the main path.
5. Lint and typecheck pass with no ignored errors; no `any` without justification.

Minimum coverage: 80% on API services, and 100% of permission guards exercised by tests (generate a test per route from the route metadata).

---

## 12. Build phases

Complete each phase fully, including its tests, before the next. A phase with blocked external credentials can pass **mock-based development acceptance** but not production readiness. Add the unified-experience/domain-contract checks below to the existing phase gates.

| # | Phase | Acceptance criteria |
|---|---|---|
| 0 | Foundation: monorepo, tooling, Docker Compose, CI, design tokens, app shell (RTL layout, sidebar, header), i18n, health checks | `docker compose up` gives a running shell in Arabic and English; CI green |
| 1 | Identity: registration, login, sessions, MFA, RBAC with seeded roles, admin user and role management, audit log | Every role can log in and sees only its menu; permission tests pass; audit entries written; unified identity model verified |
| 2 | Catalog, sections, scheduling, public program pages | Coordinator creates a program and section; it appears publicly with SEO metadata |
| 3 | Checkout, payments (mock + real adapters), coupons, invoices, credit notes, refunds, finance screens | Full paid enrollment e2e with mock provider; invoice PDF correct in Arabic; refund needs two different users |
| 4 | Live classroom, recording, automatic attendance, fallback link | Instructor and 3 test trainees hold a class locally; attendance intervals recorded from webhooks; recording playable |
| 5 | Content, quizzes, assignments, gradebook, grade approvals and appeals | Timed quiz survives a refresh; grade history, approval lock and publication are tested |
| 6 | Completion rules, certificates, public verification | Certificate issued after approval by a different user; QR verifies; revocation works |
| 7 | Learning events, outbox, NELC adapter, integration status screen | Events delivered to the mock in order with retry and replay |
| 8 | Marketing, support, notifications, surveys, sponsor portal | Campaign reaches only consented recipients; unsubscribe works |
| 9 | Privacy workflows, retention jobs, dashboards and reports for every role | Data rights workflows execute according to documented retention/legal exceptions; dashboard metric definitions and reconciliation tested |
| 10 | Unified portal and domain integration hardening: cross-module journeys, accessibility, data reconciliation, role-based navigation, contract and migration tests | Five end-to-end journeys in section 15 pass, and domain ownership rules verified |
| 11 | Production hardening: security review, load tests, backup/restore drill, operational runbooks and controlled pilot | Required documents present; restore drill passes; load targets met on agreed topology; owners approve external dependencies and production checklist |

---

## 13. Inputs required from the owner

Record these in `PROGRESS.md` as `TODO(HUMAN)` and keep building with mocks until they arrive:

1. Official NELC FutureX integration specification and credentials.
2. Card/mada payment gateway choice and keys; Tamara and Tabby keys.
3. ZATCA-certified e-invoicing provider choice and credentials; seller VAT details.
4. SMS provider and sender name; SMTP credentials and sending domain.
5. Final brand colors and logo (defaults are in section 3).
6. Legal texts: privacy notice, terms, refund policy, retention periods.
7. Domain names and the server location for production.
8. Registered versus peak concurrent trainees, simultaneous rooms, realistic upload/recording volumes, and measured bandwidth.
9. Legal/entity identity, regulatory applicability and program-by-program accreditation/approval details (if any).
10. Ownership of the canonical enrollment, attendance, approved grades and billing records if an existing registration system must remain in service.
11. Whether university-grade SIS features or multi-tenant SaaS are explicitly in scope; both excluded from initial launch unless approved.
12. Recording policy, retention periods and documented permissions/consents when applicable.
13. Whether this platform replaces or links to the existing MZN registration site.

---

## 14. Architecture principle: one user experience, bounded internal domains

**Product rule:** One portal, one account, one navigation, one notification center, one search, and one consistent design system for users. **Implementation rule:** Domain boundaries, clear ownership, separate authorization, versioned APIs and events. Do **not** split into separately deployed microservices merely to imitate enterprise scale.

```text
Web / Mobile-responsive unified portal (Arabic + English)
  -> Identity / SSO + permission and organization scoping
  -> API / Backend-for-frontend facade
      ├── Catalog & Marketing
      ├── Admissions & Enrollment  [canonical enrollment]
      ├── Academic Delivery & Calendar
      ├── Classroom adapter -> LiveKit (separate media infrastructure)
      ├── Attendance               [canonical approved attendance]
      ├── Assessments & Gradebook   [canonical approved grades]
      ├── Completion & Certificates [canonical issuance/revocation]
      ├── Orders / Payments / Finance [canonical financial ledger]
      ├── Support & Notifications
      └── Reporting / Compliance / Integrations
  -> PostgreSQL domain schemas + transactional outbox
  -> Redis / BullMQ worker + explicit external adapters
  -> S3-compatible objects / recording archive
```

- Domain modules may share a physical PostgreSQL instance during the first release, but **must not directly update another domain's owned tables**. Define explicit application services and events, and use internal DB transactions for tightly related state changes.
- Avoid distributed transactions. Use outbox/inbox, idempotent consumers, retries, dead letters and reconciliation for asynchronous workflows.
- Introduce external LMS/SIS integration only when a real institution needs it. Use adapters and agreed schema contracts, not uncontrolled bidirectional table sync.
- No duplication of authoritative grades, enrollment or financial states. Other modules may maintain read models, labeled as derived and refreshable.
- The UI presents one journey without forcing all modules to be deployed, scaled, or upgraded together.

## 15. Canonical records and end-to-end workflows

| Record | System of record | Who can alter / approve | Consumers |
|---|---|---|---|
| Person & staff identity | Identity | Account owner (limited fields), authorized identity admin | Every domain via stable User ID |
| Program version and completion rules | Program/Catalog | Coordinator drafts; authorized academic approver publishes | Enrollment, grades, certificates |
| Section membership & enrollment status | Admissions & Enrollment | Admissions/coordinator within documented controls | Classroom, assessments, reporting |
| Raw join/leave events | Classroom integration event store | Append-only verified ingestion | Attendance derivation |
| Approved attendance | Attendance | Instructor can propose; authorized coordinator approves changes | Completion, reports |
| Assessment scores and final approved grades | Assessment & Gradebook | Instructor grades; separate approver publishes | Completion, learner transcript-style view |
| Payment state and invoice/credit note | Commerce / Finance | Finance controls with approved separation of duties | Enrollment eligibility, reporting |
| Certificate status and verification record | Completion & Certificates | Authorized issuance / revocation workflow | Public verification, trainee view |

**Required testable journeys:**

1. Visitor finds program → registers → reserves seat → confirmed payment → active enrollment → schedule and classroom access.
2. Instructor hosts class → verified participation events → attendance calculation → review/approved correction → trainee view → completion evaluation.
3. Student attempts timed quiz → instructor grading → coordinator approval → final grade publication → appeal or authorized amendment → audit history.
4. Approved grade + approved attendance + program policy snapshot → completion decision → certificate approval → signed/opaque verification URL → revocation reflected publicly.
5. Refund or transfer → reconcile seat, invoice and gateway state → permissions, financial accounting, learner access and notifications remain consistent.

Every journey must have tests for duplicate events, concurrent updates, retries, disconnects, role violations, and state reconciliation. Design explicit transition matrices and negative tests for each critical state machine.

## 16. Shared UX and operational requirements

- **Single trainee dashboard:** registrations and pending actions, today's classes, lesson progress, attendance rate with denominator, approved grades, payments and invoices, certificates, support requests and alerts in one place.
- **Single instructor dashboard:** assigned sections, calendar, lesson content, webinar control, submissions, grade drafts, attendance exceptions and messages; no financial data.
- **Single coordinator dashboard:** programs, rosters, room schedules, approvals, attendance anomalies, grades requiring sign-off, completion and certificates.
- **Admissions/finance/support workspaces:** task-focused queues with strict domain permissions; no privilege escalation from shared navigation.
- Global search filters only data the actor can access; notification deep links preserve identity and permissions; search index stores minimum necessary personal data.
- Consistent terminology across modules (`Program`, `Section`, `Session`, `Enrollment`, `Grade`, `Certificate`); status definitions and KPI formulas in a shared data dictionary.
- Show data provenance and last-sync time for external records and read-model reports. Never imply real-time accuracy when data is delayed.
- Offer accessible mobile layouts and responsive low-bandwidth fallbacks; allow basic actions without video if a connection is poor, but do not incorrectly mark attendance.
- Admin reports distinguish *registrations*, *paid enrollments*, *active learners*, *unique attendees*, *concurrent active sessions*, and *completion*; these are not interchangeable counts.

## 17. Integration and change-management contracts

- Every external integration documents: provider, purpose, legal basis when personal data involved, direction, authentication, version, mappings, retries, idempotency, reconciliation, failure mode, data owner and operational owner.
- Prefer OpenAPI contracts for internal REST; use OIDC or SAML for third-party sign-on where actually supported; optionally support LTI 1.3 for external learning tools and OneRoster where exchanging roster/grade data with compatible systems is required. Implement only after verifying each partner's supported profile.
- Use explicit connector states: `disabled`, `mock`, `configured`, `validated`, `active`, `degraded`, `failed`. Never label `configured` or `mock` as compliant/production-ready.
- Define deterministic external ID mapping and deduplication; staged CSV migration/import includes preview, row-level errors, dry-run, rollback strategy and audit.
- When existing software stays authoritative for a function, configure ownership per integration and prohibit conflicting writes. Bidirectional sync is prohibited until a conflict-resolution policy is documented and tested.
- Maintain contract tests, monitoring, alerts, runbooks and at least one round-trip recovery test for each critical integration.

## 18. Security, privacy and compliance decision gates

- Before production, obtain an owner-approved regulatory applicability matrix referencing current official requirements and the specific licensed entity, training mode and each program. Regulatory identifiers displayed only if issued and verified; don't auto-fill accreditation numbers.
- Do not promise automatic FutureX/NELC integration, ZATCA certification, TVTC accreditation or a specific NCA compliance outcome. Those require relevant external conditions and/or official confirmation.
- Classify data; establish controller/processor roles, retention schedule, subject rights workflows and lawful disclosure rules. Implement data export/deletion without silently destroying records that lawfully must be retained.
- Avoid collecting government ID or date of birth by default. Restrict it to workflows with a clear documented need.
- Public certificate verification must minimize exposed personal information and protect against enumeration/rate abuse; use opaque high-entropy identifiers and revocation checks.
- Introduce security tests for API object-level authorization (IDOR/BOLA), file access, payment spoofing/replay, grade edits, attendance override abuse, and data export abuse.
- Before go-live, demonstrate a restore to a clean environment, reconcile transaction totals, validate documented backups and agree pilot rollback criteria.

## 19. Scoping, capacity and release strategy

**Release A — operational core:** unified portal, identity/RBAC, catalog and enrollment, one payment gateway, scheduling, content, video adapter, attendance, assessments, approval-based grades, certificates, financial records and basic support/reporting. Uses simulated external adapters in development only.

**Release B — extended operations:** marketing campaigns, corporate sponsorship, richer analytics, advanced approvals, import/migration utilities, advanced reporting and additional payment methods as approved.

**Release C — institution integrations:** external SIS/LMS interoperability (LTI/OneRoster where relevant), optional FutureX integration where applicable, optional higher education records module and optional multi-tenant features **only by separately approved scope**.

**Capacity planning:** 1,000 registered users is not equal to 1,000 concurrent sessions. Obtain expected peak online users, concurrent video classrooms, maximum participants per classroom, presenter camera/screen parameters, recording hours, file-upload volume, data retention and desired uptime. Validate with a production-representative load test; the existing single VPS is a development/pilot starting point and **not a verified capacity commitment**.

**Release gates:** pilot with real administrators using sandbox financial accounts → privacy/security review → measured capacity → restored backup drill → external integration validation → controlled production release with rollback and observability. No launch before legal, financial, instructor, trainee and IT owner sign-off.

---

## 20. Start now

Begin with Phase 0. First output: repository structure; `PROGRESS.md`; `docs/DECISIONS.md`; `docs/DOMAIN_OWNERSHIP.md`; a module dependency map; explicit assumptions and blocked external integrations; and a short Phase 0 plan. Then implement Phase 0. **Do not state the system is production-ready until Phase 11 and all external/owner gates pass.**