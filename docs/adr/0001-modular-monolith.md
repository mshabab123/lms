# ADR 0001 — Domain-module modular monolith

- Status: accepted (2026-11-20)

## Context
Spec §2/§14: one unified portal; bounded internal domains with clear ownership; no microservices "to imitate enterprise
scale"; extraction only when measurements justify it. Expected scale (≈1,000 registered trainees) does not justify
distributed transactions or per-service deployment.

## Decision
- One NestJS API process (`apps/api`) composed of domain modules; one worker process (`apps/worker`); one Next.js portal.
- One PostgreSQL database; each domain owns its tables (`docs/DOMAIN_OWNERSHIP.md`). Cross-domain writes go through the
  owning module's service; asynchronous effects through a transactional outbox.
- Shared contracts (permissions, Zod schemas, state machines) live in `packages/shared` and are used by web and API.

## Consequences
- Simple deployment and strong consistency inside a request.
- Module boundaries are enforced by convention and review today; a lint rule for cross-module Prisma access is planned (Phase 10).
- A module can be extracted later because it already communicates through services and versioned events.
