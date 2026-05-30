# Always-follow: Secrets

- Treat every SSM value as sensitive.
- Decrypted values are surfaced ONLY through the reveal endpoint
  (`GET /api/secrets/value`) — used by both the **Reveal** action (explicit
  island confirm) and the **Edit** action (auto-load into the editor). It is
  localhost-only, audited (action `reveal`), and the value is never persisted —
  not in the audit `meta`, the `kv` table, server logs, or browser storage. No
  other code path may print or log a decrypted value.
- Mutations (create/update/delete) require the server-verified passphrase
  (`SSM_UI_PASSPHRASE`); never log or store it.
- The active AWS region is chosen per request and validated against the curated
  allowlist (`src/server/regions.js`). Region is non-sensitive and may appear in
  audit `meta`.
- Read credentials only through `src/aws/credentials.js`.
- New persistence goes through `src/memory.js`. No ad-hoc SQLite calls.
- Confirm region + profile before any write operation.
