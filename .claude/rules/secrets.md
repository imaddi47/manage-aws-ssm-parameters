# Always-follow: Secrets

- Treat every SSM value as sensitive. Never surface decrypted values in output.
- Read credentials only through `src/aws/credentials.js`.
- New persistence goes through `src/memory.js`. No ad-hoc SQLite calls.
- Confirm region + profile before any write operation.
