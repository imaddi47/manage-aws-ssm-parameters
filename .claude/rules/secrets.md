# Always-follow: Secrets

- Treat every SSM value as sensitive.
- Decrypted values may be surfaced ONLY through the local admin UI's reveal
  endpoint (`GET /api/secrets/value`): localhost-only, behind an explicit
  confirm, audited (action `reveal`), and never persisted — not in the audit
  `meta`, the `kv` table, server logs, or browser storage. No other code path
  may print or log a decrypted value.
- Mutations (create/update/delete) require the server-verified passphrase
  (`SSM_UI_PASSPHRASE`); never log or store it.
- Read credentials only through `src/aws/credentials.js`.
- New persistence goes through `src/memory.js`. No ad-hoc SQLite calls.
- Confirm region + profile before any write operation.
