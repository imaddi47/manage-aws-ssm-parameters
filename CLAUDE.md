# Project: manage-ssm-secrets

## Overview
CLI to list, read, and write AWS SSM Parameter Store secrets, with a local SQLite audit log.

## Tech Stack
- Runtime: Node.js (ESM, `"type": "module"`)
- AWS: @aws-sdk/client-ssm, @aws-sdk/credential-providers
- Persistence: SQLite via better-sqlite3 (file: `.memory/app.db`)

## Commands
- Install: `npm install`
- List secrets: `npm run ssm -- list [path]`
- Get secret: `npm run ssm -- get <name>`
- Set secret: `npm run ssm -- set <name> <value>`
- Test: `npm test`

## AWS Credential Resolution (do not change without reason)
1. ENV first: if `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` are set, use them.
2. Fallback: shared credentials file `~/.aws/credentials`.
3. Profile: `AWS_PROFILE` env var, else `default`. Customisable per call.
4. Region: `AWS_REGION` / `AWS_DEFAULT_REGION`, else `us-east-1`.

## Conventions
- Immutable data where practical; small single-purpose modules.
- All SSM writes use `Overwrite: true` and type `SecureString` by default.
- Every list/get/set is recorded in the SQLite `audit` table.
- Memory store is extensible: add tables in `src/memory.js`, never inline SQL elsewhere.

## Security (hard rules)
- NEVER print decrypted secret VALUES to logs, commits, or PR descriptions.
- NEVER read or echo `.env`, `~/.aws/credentials`, or `*.pem`.
- NEVER hardcode credentials. ENV or shared file only.
- `.env` and `.memory/` are gitignored; keep them that way.

## Memory / Continuity
- Durable state lives in `.memory/app.db` (kv + audit tables).
- Use `kv` for cross-run context; `audit` for an append-only action log.
