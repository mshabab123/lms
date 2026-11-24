# Integrations

Connector states (spec §17): `disabled`, `mock`, `configured`, `validated`, `active`, `degraded`, `failed`.
`mock` and `configured` are **never** production-ready or compliant. Every adapter call is recorded in
`IntegrationLog` without secrets or personal payloads.

| Adapter | Purpose | Current state | Real implementation | Blocked on |
|---|---|---|---|---|
| `EmailProvider` | transactional (and later campaign) email | **mock** in dev/test; `smtp` implemented (Nodemailer, STARTTLS); production refuses `mock` | SMTP | TODO(HUMAN) #4: SMTP credentials, sending domain, SPF/DKIM/DMARC |
| `SmsProvider` | OTP and notifications | not implemented (no flow uses SMS yet) | Saudi SMS provider | TODO(HUMAN) #4 |
| `PaymentProvider` | create payment, verify webhook, refund, status | Phase 3 | one card/mada gateway | TODO(HUMAN) #2 |
| `EInvoiceProvider` | submit invoices/notes, store status/hash/QR | Phase 3 | ZATCA-compatible provider after scope verification | TODO(HUMAN) #3 |
| `LiveProvider` | tokens, rooms, recording, webhooks | Phase 4 | self-hosted LiveKit (separate host) | capacity inputs TODO(HUMAN) #8 |
| `StorageProvider` | presigned upload/download | Phase 5 | S3-compatible (MinIO → OCI later) | TODO(HUMAN) #14 |
| `AntivirusProvider` | scan uploads | Phase 5 | ClamAV container | — |
| `NelcProvider` | deliver applicable learning records | Phase 7, **disabled until applicability and official spec are confirmed** | from verified NELC spec only | TODO(HUMAN) #1, #9 |
| `IdentityProvider` | future national SSO / OIDC / SAML | interface only (not implemented, per spec §6.1) | after security review | owner decision |

## Integration contract template (fill per connector before enabling)

Provider · purpose · legal basis (if personal data) · direction · authentication · API version · field mappings ·
retries/backoff · idempotency key · reconciliation job · failure mode/user impact · data owner · operational owner ·
contract tests · monitoring/alerts · runbook · round-trip recovery test.

## Email (implemented)

- **Purpose:** account verification, password reset, staff invitation, email OTP, security notices.
- **Legal basis:** necessary for the account contract / security (to be confirmed in the privacy notice).
- **Data sent:** recipient address, localized message body. No body content is logged; `IntegrationLog` stores template key, mode, success, duration, error class.
- **Failure mode:** SMTP errors propagate to the request (registration/reset return 500 and can be retried; tokens are single-use and re-issuable).
- **Dev mailbox:** `GET /api/v1/dev/mailbox/latest?to=` exists only when `APP_ENV` is `development` or `test`.
