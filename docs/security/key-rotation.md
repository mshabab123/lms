# Key rotation procedure

## Field-encryption key (`APP_ENCRYPTION_KEY`)
Ciphertexts carry their key id (`v1:<keyId>:...`).
1. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
2. Deploy with `APP_ENCRYPTION_KEY=<new>`, `APP_ENCRYPTION_KEY_ID=<new id>`, and append the old key to
   `APP_ENCRYPTION_KEYS_OLD=<old id>:<old key>` — new writes use the new key; old data still decrypts.
3. Re-encrypt existing rows (re-encryption job to be added with the first sensitive-field flow; MFA secrets are
   re-encrypted naturally when users re-enrol).
4. Once no ciphertext references the old id, remove it from `APP_ENCRYPTION_KEYS_OLD`.

## Session secret (`SESSION_SECRET`)
Reserved for HMAC of opaque tokens (later phases). Rotation invalidates only HMAC-derived values; plan per feature.

## Database / Redis / SMTP / MinIO credentials
Rotate in the secret store, update `.env` on the host, `docker compose up -d` the affected services, verify `/ready`.

## Metrics token
Update `METRICS_TOKEN` and `infra/compose/app/prometheus/metrics_token` together.
