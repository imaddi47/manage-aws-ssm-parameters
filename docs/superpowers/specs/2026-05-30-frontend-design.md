# Frontend Design — manage-ssm-secrets Local Admin UI

- **Date:** 2026-05-30
- **Status:** Approved (brainstorming), pending implementation plan
- **Author:** Brainstorming session (Claude Code)

## Overview

Add a local, single-user web admin UI on top of the existing `manage-ssm-secrets`
CLI. The UI lets the operator browse the AWS SSM Parameter Store tree, reveal a
decrypted value (gated), create/update a value (gated), and delete a parameter
(gated). It is a developer tool that runs on `localhost` only and reuses the
existing AWS and persistence modules unchanged.

This is **net-new** work — the original setup guide produced a CLI only; there
was no prior frontend.

## Goals

- A usable local admin surface for the four operations: list, reveal, upsert, delete.
- Reuse `src/aws/ssm.js`, `src/aws/credentials.js`, and `src/memory.js` as-is
  (CLI behaviour and credential resolution rules are unchanged).
- Keep decrypted secret values on the local machine; never persist or log them.
- A deliberate, tiered gate before sensitive actions, with every action audited.

## Non-goals (out of scope)

- Multi-user / hosted deployment, authentication sessions, HTTPS.
- An in-UI audit-log viewer and tree search/filter (explicitly deselected).
- Bulk operations, import/export, parameter history/rollback.
- Changing the CLI (`src/cli.js`) behaviour.

## Requirements (decisions from brainstorming)

| Decision | Choice |
|---|---|
| Purpose | Full admin: browse, reveal, create/update, delete |
| Deployment | Local single-user, `127.0.0.1`, with a gate before sensitive actions |
| Stack | React + Vite (frontend), Express (backend API) |
| Capabilities | Browse tree, reveal (gated), create/update (gated), **delete** (gated) |
| Audit-log view in UI | No (backend still writes audit rows) |
| Search/filter in UI | No |
| Gate model | Tiered: confirm-click for reveal; server-verified passphrase for create/update + delete |
| Tests | Included — focused on the security-sensitive surface |

## Architecture (Approach A — Express serves API + built UI)

One Express process is the single origin.

- **Dev:** `concurrently` runs the API (`node --watch src/server/index.js`) and the
  Vite dev server. `web/vite.config.js` proxies `/api/*` → `http://127.0.0.1:3000`,
  so the browser only ever talks to one origin (no CORS).
- **Prod / real run:** `npm run build` produces `web/dist`; `npm start` runs Express,
  which serves the static `web/dist` assets **and** the `/api` routes, bound to
  `127.0.0.1` only.

Rationale: for a secrets tool, a single locked-down origin with no CORS surface is
safer and tidier than two cross-origin processes, and it yields a real `npm start`.

## Project structure

```
src/
  aws/credentials.js          (unchanged)
  aws/ssm.js                  (+ deleteSecret wrapper)
  memory.js                   (unchanged; openMemory + logAudit reused by server)
  cli.js                      (unchanged)
  server/
    index.js                  (Express app; binds 127.0.0.1; serves web/dist in prod)
    routes/secrets.js         (list / reveal / upsert / delete handlers)
    middleware/passphrase.js  (timing-safe verify of X-SSM-Passphrase vs env)
    middleware/errors.js      (maps errors to the JSON envelope + status)
web/
  package.json                (react, react-dom, vite, @vitejs/plugin-react)
  vite.config.js              (dev proxy /api -> 127.0.0.1:3000)
  index.html
  src/
    main.jsx
    App.jsx                   (layout + selection state + data fetching)
    api/client.js             (fetch wrapper; attaches passphrase header on mutations)
    components/
      TreeList.jsx            (parameter list: name + type)
      DetailPanel.jsx         (selected parameter; Reveal / Edit / Delete actions)
      RevealModal.jsx         (confirm-click; shows value, copy, clears on close)
      EditModal.jsx           (create/update form + passphrase field)
      DeleteModal.jsx         (type-name-to-confirm + passphrase field)
```

## API surface

All routes are under `/api` and served on `127.0.0.1` only. Parameter names contain
`/`, so they are passed **URL-encoded as query params**, never as path segments.
Every response uses the envelope `{ ok: boolean, data?: any, error?: string }`
(per `~/.claude/rules/common/patterns.md`).

| Method | Route | Gate | ssm.js fn | WithDecryption | Audit action |
|---|---|---|---|---|---|
| GET | `/api/secrets?path=/&recursive=true` | none | `listSecrets` | false | `list` |
| GET | `/api/secrets/value?name=<enc>` | confirm (client-side) | `getSecret` | true | `reveal` |
| POST | `/api/secrets` body `{name, value, type?}` | passphrase | `saveSecret` (Overwrite) | n/a | `set` |
| DELETE | `/api/secrets?name=<enc>` | passphrase | `deleteSecret` (**new**) | n/a | `delete` |

Notes:
- `type` defaults to `SecureString` on create/update (existing `saveSecret` default).
- The reveal endpoint returns the decrypted value in the response **body** (never in
  a URL). The route handler must not log the request for this path.

## Data flows

**List / browse:** `App` loads `GET /api/secrets?path=/` on mount → renders names +
types in `TreeList`. Selecting an item shows it in `DetailPanel` (no value fetched).

**Reveal (confirm gate):** user clicks Reveal in `DetailPanel` → `RevealModal` asks
for an explicit confirm → on confirm, client calls `GET /api/secrets/value?name=…`
→ server `getSecret` (decrypt), `logAudit("reveal", name)`, returns value → modal
displays it with copy-to-clipboard. Value lives in component state only and is
cleared when the modal closes.

**Create / update (passphrase gate):** user opens `EditModal` (name editable on
create, locked on edit) → enters value, type, and passphrase → client `POST
/api/secrets` with header `X-SSM-Passphrase` → `passphrase.js` verifies → `saveSecret`
(Overwrite) → `logAudit("set", name, {version})` → returns `{version}` → list refreshes.

**Delete (passphrase gate):** user opens `DeleteModal` → must type the exact
parameter name **and** enter the passphrase → client `DELETE /api/secrets?name=…`
with header `X-SSM-Passphrase` → verify → `deleteSecret` → `logAudit("delete", name)`
→ returns `{ ok: true }` → list refreshes.

## Security & gate model

- **Binding:** server binds `127.0.0.1` only (never `0.0.0.0`). No CORS configured.
- **Passphrase:** read from `SSM_UI_PASSPHRASE` env var. Mutating routes require the
  `X-SSM-Passphrase` request header, compared with `crypto.timingSafeEqual`
  (length-guarded). If the env var is unset, mutations are refused with a clear
  error (HTTP 503). The passphrase is never logged, returned, or written to SQLite.
- **Decrypted values:** leave the backend only via the reveal endpoint, only over
  localhost. They are never written to the audit `meta`, the `kv` table, server
  logs, or browser `localStorage`. The audit table continues to store action + name
  (+ version for `set`) only — matching current CLI behaviour.
- **Gate UX (tiered):** reveal = confirm-click; create/update = form + passphrase;
  delete = type-name-to-confirm + passphrase.

## Error handling

`middleware/errors.js` maps errors to the `{ ok:false, error }` envelope with an
appropriate status; no message ever includes a secret value:

| Condition | Status |
|---|---|
| `ParameterNotFound` | 404 |
| `AccessDeniedException` / `AccessDenied` | 403 |
| `ValidationException` / bad input | 400 |
| missing/invalid passphrase | 401 |
| passphrase not configured (`SSM_UI_PASSPHRASE` unset) | 503 |
| anything else | 500 |

Frontend `api/client.js` throws on `ok:false`; components surface the error inline
(per-modal or a small banner). Input is validated at the boundary (name/value
present, type in the allowed set).

## Testing (focused on the security-sensitive surface)

Backend (`node --test` runner + `supertest`; the SSM client is injected as a fake
object whose `send()` returns canned responses or throws SDK-shaped errors — no
mocking library needed):
- passphrase middleware: accepts the correct value, rejects wrong/missing (401),
  refuses when unset (503); timing-safe path exercised.
- `reveal` does **not** write the decrypted value into the audit `meta` (assert on DB row).
- AWS error mapping (404/403/400/500) returns the correct status + envelope.
- delete and upsert are unreachable without a valid passphrase.

Frontend (Vitest + React Testing Library):
- `DeleteModal` enables the destructive action only when the typed name matches and
  a passphrase is present.
- `RevealModal` clears the revealed value from state on close.

## New dependencies

- Backend (root `package.json`): `express`. Dev: `concurrently`, `supertest`.
  Backend tests run on the built-in `node --test` runner (the existing root `test`
  script) with an injected fake SSM client — no extra test framework added.
- Frontend (`web/package.json`, its own `test` script): `react`, `react-dom`, `vite`,
  `@vitejs/plugin-react`; dev/test: `vitest`, `@testing-library/react`,
  `@testing-library/jest-dom`, `jsdom`.

## Configuration / environment

- `SSM_UI_PASSPHRASE` — required to perform any mutation (create/update/delete).
- `PORT` — API/serve port, default `3000`; always bound to `127.0.0.1`.
- Existing AWS resolution is unchanged: `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`
  → `~/.aws/credentials`; `AWS_PROFILE` (default `default`); `AWS_REGION` (default
  `us-east-1`).

## IAM changes

Add `ssm:DeleteParameter` to the policy (the guide's policy currently grants only
`GetParametersByPath`, `GetParameter`, `PutParameter`).

## Follow-ups outside this spec

- Update `.claude/rules/secrets.md`: the gated, audited reveal endpoint is a
  deliberate, documented exception to the "never surface decrypted values" rule —
  the rule file should be amended to describe the policy (localhost-only, audited,
  never persisted) rather than an absolute prohibition.

## Risks / open considerations

- Sending the passphrase as a request header over localhost HTTP is acceptable for a
  single-user local tool (no network egress), but it is plaintext in process memory;
  this is documented, not mitigated further.
- Revealed values transit to the browser and sit in DOM/JS memory until the modal
  closes; copy-to-clipboard leaves the OS clipboard populated (user-managed).
```
