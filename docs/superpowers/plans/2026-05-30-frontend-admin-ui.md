# Local Admin UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local, single-user React admin UI (served by an Express API that wraps the existing `ssm.js`) to browse, reveal, create/update, and delete SSM secrets, with a tiered gate and full audit logging.

**Architecture:** Express app factory (`createApp`) wraps the existing `ssm.js`/`memory.js` modules with injectable deps for testability. React + Vite frontend talks to `/api` (Vite proxy in dev, Express static-serve in prod). All commits land on `main` (per project preference).

**Tech Stack:** Node.js (ESM), Express 4, better-sqlite3 (existing), React 18, Vite 5, Vitest + React Testing Library (frontend tests), `node --test` + supertest (backend tests).

**Spec:** `docs/superpowers/specs/2026-05-30-frontend-design.md`

---

## File Structure

```
src/aws/ssm.js                       MODIFY  + deleteSecret()
src/server/app.js                    CREATE  createApp({client,db,passphrase,staticDir})
src/server/index.js                  CREATE  bootstrap: real client/db, 127.0.0.1 listen, prod static
src/server/routes/secrets.js         CREATE  list / reveal / upsert / delete router
src/server/middleware/errors.js      CREATE  HttpError, asyncHandler, errorHandler
src/server/middleware/passphrase.js  CREATE  requirePassphrase(expected) (timing-safe)
test/aws/ssm.test.js                 CREATE  deleteSecret unit test
test/server/errors.test.js           CREATE  error mapping unit test
test/server/passphrase.test.js       CREATE  passphrase middleware test (supertest)
test/server/secrets.test.js          CREATE  routes integration test (supertest + fake client)
package.json                         MODIFY  + express, concurrently, supertest; scripts
web/package.json                     CREATE  React/Vite/Vitest
web/vite.config.js                   CREATE  react plugin, /api proxy, vitest jsdom
web/index.html                       CREATE
web/src/main.jsx                     CREATE
web/src/styles.css                   CREATE  minimal layout
web/src/api/client.js                CREATE  fetch wrapper (+ passphrase header)
web/src/App.jsx                      CREATE  layout, selection, modal orchestration
web/src/components/TreeList.jsx      CREATE
web/src/components/DetailPanel.jsx   CREATE
web/src/components/RevealModal.jsx   CREATE  (+ test)
web/src/components/EditModal.jsx     CREATE
web/src/components/DeleteModal.jsx   CREATE  (+ test)
web/src/test/setup.js                CREATE  jest-dom import
.claude/rules/secrets.md             MODIFY  gated-reveal policy
docs/iam-policy.json                 CREATE  + ssm:DeleteParameter
```

---

## Task 1: Backend dependencies & scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add deps and scripts to `package.json`**

Replace the `scripts` and dependency blocks so the file reads:

```json
{
  "name": "manage-ssm-secrets",
  "version": "0.1.0",
  "type": "module",
  "bin": { "ssmctl": "src/cli.js" },
  "scripts": {
    "ssm": "node src/cli.js",
    "test": "node --test",
    "dev": "concurrently -k -n api,web \"npm:dev:api\" \"npm:dev:web\"",
    "dev:api": "node --watch src/server/index.js",
    "dev:web": "npm --prefix web run dev",
    "build": "npm --prefix web run build",
    "start": "NODE_ENV=production node src/server/index.js",
    "test:web": "npm --prefix web test"
  },
  "dependencies": {
    "@aws-sdk/client-ssm": "^3.0.0",
    "@aws-sdk/credential-providers": "^3.0.0",
    "better-sqlite3": "^11.0.0",
    "express": "^4.19.2"
  },
  "devDependencies": {
    "concurrently": "^9.1.0",
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: adds `express`, `concurrently`, `supertest` (and transitive deps); `found 0 vulnerabilities` or similar.

- [ ] **Step 3: Verify the existing test runner still works**

Run: `npm test`
Expected: `tests 0 ... pass 0 ... fail 0` (no backend tests yet; exits 0).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add express, concurrently, supertest and server/web npm scripts"
```

---

## Task 2: `deleteSecret` in ssm.js (TDD)

**Files:**
- Test: `test/aws/ssm.test.js`
- Modify: `src/aws/ssm.js`

- [ ] **Step 1: Write the failing test**

Create `test/aws/ssm.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { deleteSecret } from "../../src/aws/ssm.js";

test("deleteSecret sends DeleteParameterCommand with the name", async () => {
  let sent;
  const client = { send: async (cmd) => { sent = cmd; return {}; } };
  const result = await deleteSecret(client, "/a/b");
  assert.equal(sent.constructor.name, "DeleteParameterCommand");
  assert.equal(sent.input.Name, "/a/b");
  assert.deepEqual(result, { name: "/a/b" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/aws/ssm.test.js`
Expected: FAIL — `deleteSecret` is not exported (`SyntaxError`/`undefined is not a function`).

- [ ] **Step 3: Implement**

In `src/aws/ssm.js`, add `DeleteParameterCommand` to the import from `@aws-sdk/client-ssm`, and append:

```js
export async function deleteSecret(client, name) {
  await client.send(new DeleteParameterCommand({ Name: name }));
  return { name };
}
```

The import line becomes:

```js
import {
  SSMClient,
  GetParametersByPathCommand,
  GetParameterCommand,
  PutParameterCommand,
  DeleteParameterCommand,
} from "@aws-sdk/client-ssm";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/aws/ssm.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/aws/ssm.js test/aws/ssm.test.js
git commit -m "feat: add deleteSecret wrapper for SSM DeleteParameter"
```

---

## Task 3: Error middleware (TDD)

**Files:**
- Test: `test/server/errors.test.js`
- Create: `src/server/middleware/errors.js`

- [ ] **Step 1: Write the failing test**

Create `test/server/errors.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { errorHandler, HttpError } from "../../src/server/middleware/errors.js";

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

test("maps HttpError to its status and message", () => {
  const res = fakeRes();
  errorHandler(new HttpError(401, "Invalid passphrase"), {}, res, () => {});
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { ok: false, error: "Invalid passphrase" });
});

test("maps AWS ParameterNotFound to 404", () => {
  const res = fakeRes();
  const err = new Error("nope");
  err.name = "ParameterNotFound";
  errorHandler(err, {}, res, () => {});
  assert.equal(res.statusCode, 404);
});

test("hides the message for unexpected 500 errors", () => {
  const res = fakeRes();
  errorHandler(new Error("internal detail"), {}, res, () => {});
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, "Internal server error");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/server/errors.test.js`
Expected: FAIL — module `src/server/middleware/errors.js` not found.

- [ ] **Step 3: Implement**

Create `src/server/middleware/errors.js`:

```js
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const AWS_STATUS = {
  ParameterNotFound: 404,
  ParameterAlreadyExists: 409,
  AccessDeniedException: 403,
  AccessDenied: 403,
  ValidationException: 400,
};

export function errorHandler(err, _req, res, _next) {
  const status = err.status ?? AWS_STATUS[err.name] ?? 500;
  const message = status === 500 ? "Internal server error" : err.message;
  res.status(status).json({ ok: false, error: message });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/server/errors.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/middleware/errors.js test/server/errors.test.js
git commit -m "feat: add server error middleware with AWS error mapping"
```

---

## Task 4: Passphrase middleware (TDD)

**Files:**
- Test: `test/server/passphrase.test.js`
- Create: `src/server/middleware/passphrase.js`

- [ ] **Step 1: Write the failing test**

Create `test/server/passphrase.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { requirePassphrase } from "../../src/server/middleware/passphrase.js";
import { errorHandler } from "../../src/server/middleware/errors.js";

function appWith(expected) {
  const app = express();
  app.post("/x", requirePassphrase(expected), (_req, res) =>
    res.json({ ok: true, data: "done" })
  );
  app.use(errorHandler);
  return app;
}

test("503 when passphrase is not configured", async () => {
  const res = await request(appWith(undefined)).post("/x");
  assert.equal(res.status, 503);
});

test("401 when the header is missing", async () => {
  const res = await request(appWith("secret")).post("/x");
  assert.equal(res.status, 401);
});

test("401 when the header is wrong", async () => {
  const res = await request(appWith("secret")).post("/x").set("X-SSM-Passphrase", "nope");
  assert.equal(res.status, 401);
});

test("passes through when the header is correct", async () => {
  const res = await request(appWith("secret")).post("/x").set("X-SSM-Passphrase", "secret");
  assert.equal(res.status, 200);
  assert.equal(res.body.data, "done");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/server/passphrase.test.js`
Expected: FAIL — module `src/server/middleware/passphrase.js` not found.

- [ ] **Step 3: Implement**

Create `src/server/middleware/passphrase.js`:

```js
import { timingSafeEqual } from "node:crypto";
import { HttpError } from "./errors.js";

export function requirePassphrase(expected) {
  return function passphraseGate(req, _res, next) {
    if (!expected) {
      return next(new HttpError(503, "Passphrase not configured (set SSM_UI_PASSPHRASE)"));
    }
    const provided = req.get("x-ssm-passphrase") || "";
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return next(new HttpError(401, "Invalid passphrase"));
    }
    next();
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/server/passphrase.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/middleware/passphrase.js test/server/passphrase.test.js
git commit -m "feat: add timing-safe passphrase gate middleware"
```

---

## Task 5: Write the failing routes integration test

**Files:**
- Test: `test/server/secrets.test.js`

- [ ] **Step 1: Write the test**

Create `test/server/secrets.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/server/app.js";
import { openMemory } from "../../src/memory.js";

function makeFake(overrides = {}) {
  return {
    send: async (cmd) => {
      const name = cmd.constructor.name;
      if (overrides[name]) return overrides[name](cmd);
      switch (name) {
        case "GetParametersByPathCommand":
          return { Parameters: [{ Name: "/a/b", Type: "SecureString" }], NextToken: undefined };
        case "GetParameterCommand":
          return { Parameter: { Name: cmd.input.Name, Value: "plain-value", Type: "SecureString", Version: 3 } };
        case "PutParameterCommand":
          return { Version: 5 };
        case "DeleteParameterCommand":
          return {};
        default:
          throw new Error("unexpected command " + name);
      }
    },
  };
}

function build(opts = {}) {
  const db = openMemory(":memory:");
  const app = createApp({ client: makeFake(opts.overrides), db, passphrase: opts.passphrase ?? "pw" });
  return { app, db };
}

const enc = encodeURIComponent;

test("GET /api/secrets lists name+type and audits 'list'", async () => {
  const { app, db } = build();
  const res = await request(app).get("/api/secrets?path=/");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data, [{ name: "/a/b", type: "SecureString" }]);
  const row = db.prepare("SELECT action FROM audit ORDER BY id DESC LIMIT 1").get();
  assert.equal(row.action, "list");
});

test("GET /value reveals and never stores the value in audit", async () => {
  const { app, db } = build();
  const res = await request(app).get("/api/secrets/value?name=" + enc("/a/b"));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.value, "plain-value");
  const row = db.prepare("SELECT action, meta FROM audit ORDER BY id DESC LIMIT 1").get();
  assert.equal(row.action, "reveal");
  assert.ok(!String(row.meta).includes("plain-value"));
});

test("POST /api/secrets is gated by passphrase", async () => {
  const { app } = build();
  const noPass = await request(app).post("/api/secrets").send({ name: "/a/b", value: "x" });
  assert.equal(noPass.status, 401);
  const ok = await request(app)
    .post("/api/secrets")
    .set("X-SSM-Passphrase", "pw")
    .send({ name: "/a/b", value: "x" });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.data, { name: "/a/b", version: 5 });
});

test("DELETE is gated by passphrase and audits 'delete'", async () => {
  const { app, db } = build();
  const noPass = await request(app).delete("/api/secrets?name=" + enc("/a/b"));
  assert.equal(noPass.status, 401);
  const ok = await request(app)
    .delete("/api/secrets?name=" + enc("/a/b"))
    .set("X-SSM-Passphrase", "pw");
  assert.equal(ok.status, 200);
  const row = db.prepare("SELECT action FROM audit ORDER BY id DESC LIMIT 1").get();
  assert.equal(row.action, "delete");
});

test("maps AWS ParameterNotFound to 404", async () => {
  const overrides = {
    GetParameterCommand: () => {
      const e = new Error("nope");
      e.name = "ParameterNotFound";
      throw e;
    },
  };
  const { app } = build({ overrides });
  const res = await request(app).get("/api/secrets/value?name=" + enc("/x"));
  assert.equal(res.status, 404);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/server/secrets.test.js`
Expected: FAIL — module `src/server/app.js` not found.

---

## Task 6: Implement secrets router + app factory

**Files:**
- Create: `src/server/routes/secrets.js`
- Create: `src/server/app.js`

- [ ] **Step 1: Create the router**

Create `src/server/routes/secrets.js`:

```js
import { Router } from "express";
import { listSecrets, getSecret, saveSecret, deleteSecret } from "../../aws/ssm.js";
import { logAudit } from "../../memory.js";
import { requirePassphrase } from "../middleware/passphrase.js";
import { asyncHandler, HttpError } from "../middleware/errors.js";

const ALLOWED_TYPES = ["SecureString", "String", "StringList"];

export function createSecretsRouter({ client, db, passphrase }) {
  const router = Router();

  // list (names + types only; no decryption)
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const path = req.query.path || "/";
      const recursive = req.query.recursive !== "false";
      const items = await listSecrets(client, { path, recursive });
      logAudit(db, "list", path, { count: items.length });
      res.json({ ok: true, data: items });
    })
  );

  // reveal a single decrypted value (confirm gate is client-side)
  router.get(
    "/value",
    asyncHandler(async (req, res) => {
      const name = req.query.name;
      if (!name) throw new HttpError(400, "Missing 'name' query parameter");
      const secret = await getSecret(client, name);
      logAudit(db, "reveal", name); // never log the value
      res.json({ ok: true, data: secret });
    })
  );

  // create / update (passphrase gate)
  router.post(
    "/",
    requirePassphrase(passphrase),
    asyncHandler(async (req, res) => {
      const { name, value, type } = req.body ?? {};
      if (!name || typeof value !== "string" || value.length === 0) {
        throw new HttpError(400, "Body must include 'name' and a non-empty 'value'");
      }
      if (type && !ALLOWED_TYPES.includes(type)) {
        throw new HttpError(400, "Invalid 'type'");
      }
      const result = await saveSecret(client, { name, value, type });
      logAudit(db, "set", name, { version: result.version });
      res.json({ ok: true, data: result });
    })
  );

  // delete (passphrase gate)
  router.delete(
    "/",
    requirePassphrase(passphrase),
    asyncHandler(async (req, res) => {
      const name = req.query.name;
      if (!name) throw new HttpError(400, "Missing 'name' query parameter");
      await deleteSecret(client, name);
      logAudit(db, "delete", name);
      res.json({ ok: true, data: { name } });
    })
  );

  return router;
}
```

- [ ] **Step 2: Create the app factory**

Create `src/server/app.js`:

```js
import express from "express";
import { join } from "node:path";
import { createSecretsRouter } from "./routes/secrets.js";
import { errorHandler } from "./middleware/errors.js";

export function createApp({ client, db, passphrase, staticDir } = {}) {
  const app = express();
  app.use(express.json());
  app.use("/api/secrets", createSecretsRouter({ client, db, passphrase }));

  if (staticDir) {
    app.use(express.static(staticDir));
    // SPA fallback for non-API GETs (version-agnostic; avoids Express 5 wildcard syntax)
    app.use((req, res, next) => {
      if (req.method === "GET" && !req.path.startsWith("/api")) {
        return res.sendFile(join(staticDir, "index.html"));
      }
      next();
    });
  }

  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 3: Run the integration test to verify it passes**

Run: `node --test test/server/secrets.test.js`
Expected: PASS (5 tests).

- [ ] **Step 4: Run the whole backend suite**

Run: `npm test`
Expected: PASS — 13 tests total (1 ssm + 3 errors + 4 passphrase + 5 secrets), 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/secrets.js src/server/app.js test/server/secrets.test.js
git commit -m "feat: add /api/secrets routes and Express app factory"
```

---

## Task 7: Server bootstrap (`index.js`)

**Files:**
- Create: `src/server/index.js`

- [ ] **Step 1: Implement the bootstrap**

Create `src/server/index.js`:

```js
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { makeClient } from "../aws/ssm.js";
import { openMemory } from "../memory.js";
import { createApp } from "./app.js";

const PORT = Number(process.env.PORT) || 3000;
const HOST = "127.0.0.1";
const passphrase = process.env.SSM_UI_PASSPHRASE;

const client = makeClient({ region: process.env.AWS_REGION, profile: process.env.AWS_PROFILE });
const db = openMemory();

const __dirname = dirname(fileURLToPath(import.meta.url));
const staticDir =
  process.env.NODE_ENV === "production" ? join(__dirname, "../../web/dist") : undefined;

const app = createApp({ client, db, passphrase, staticDir });

app.listen(PORT, HOST, () => {
  console.log(`SSM admin UI listening on http://${HOST}:${PORT}`);
  if (!passphrase) {
    console.warn("WARNING: SSM_UI_PASSPHRASE not set — create/update/delete are disabled (503).");
  }
});
```

- [ ] **Step 2: Smoke-test the API boots and lists (no AWS write)**

Run:
```bash
PORT=3999 node src/server/index.js &
sleep 1
curl -s "http://127.0.0.1:3999/api/secrets?path=/" ; echo
kill %1
```
Expected: a JSON envelope. With valid AWS creds: `{"ok":true,"data":[...]}`. Without creds/permission: `{"ok":false,"error":...}` with a 4xx/5xx — either confirms the server booted and the route is wired. (No values are written.)

- [ ] **Step 3: Commit**

```bash
git add src/server/index.js
git commit -m "feat: add server bootstrap binding 127.0.0.1 with prod static serving"
```

---

## Task 8: Vite + React app scaffold

**Files:**
- Create: `web/package.json`, `web/vite.config.js`, `web/index.html`, `web/src/main.jsx`, `web/src/styles.css`, `web/src/test/setup.js`
- Create (placeholder shell, replaced in Task 14): `web/src/App.jsx`

- [ ] **Step 1: Create `web/package.json`**

```json
{
  "name": "manage-ssm-secrets-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.1",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^25.0.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `web/vite.config.js`**

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://127.0.0.1:3000" },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
  },
});
```

- [ ] **Step 3: Create `web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SSM Secrets Admin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create `web/src/main.jsx`**

```jsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(<App />);
```

- [ ] **Step 5: Create `web/src/styles.css`**

```css
* { box-sizing: border-box; }
body { margin: 0; font: 14px/1.5 system-ui, sans-serif; color: #1a1a1a; }
.app { max-width: 1000px; margin: 0 auto; padding: 16px; }
header { display: flex; align-items: center; justify-content: space-between; }
.layout { display: grid; grid-template-columns: 320px 1fr; gap: 16px; }
.sidebar { border-right: 1px solid #e2e2e2; padding-right: 12px; max-height: 70vh; overflow: auto; }
.tree { list-style: none; margin: 0; padding: 0; }
.tree-item { display: flex; justify-content: space-between; padding: 6px 8px; cursor: pointer; border-radius: 6px; }
.tree-item:hover { background: #f3f4f6; }
.tree-item.selected { background: #dbeafe; }
.tree-type { color: #6b7280; font-size: 12px; }
.muted { color: #6b7280; }
.actions { display: flex; gap: 8px; margin-top: 12px; }
button { padding: 6px 12px; border: 1px solid #cbd5e1; background: #fff; border-radius: 6px; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
button.danger { border-color: #ef4444; color: #b91c1c; }
.error { color: #b91c1c; }
.value { background: #111827; color: #f9fafb; padding: 10px; border-radius: 6px; overflow: auto; }
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: grid; place-items: center; }
.modal { background: #fff; padding: 20px; border-radius: 10px; width: min(480px, 92vw); display: flex; flex-direction: column; gap: 10px; }
.modal label { display: flex; flex-direction: column; gap: 4px; }
.modal input, .modal select { padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 6px; }
```

- [ ] **Step 6: Create `web/src/test/setup.js`**

```js
import "@testing-library/jest-dom";
```

- [ ] **Step 7: Create a placeholder `web/src/App.jsx`** (replaced in Task 14, but needed so the app builds now)

```jsx
export default function App() {
  return <div className="app">SSM Secrets Admin (wiring in progress)</div>;
}
```

- [ ] **Step 8: Install web deps and verify the build**

Run:
```bash
npm --prefix web install
npm --prefix web run build
```
Expected: install completes; `vite build` emits `web/dist/` with `index.html` and assets, no errors.

- [ ] **Step 9: Commit**

```bash
git add web/package.json web/package-lock.json web/vite.config.js web/index.html web/src/main.jsx web/src/styles.css web/src/test/setup.js web/src/App.jsx
git commit -m "feat: scaffold React + Vite web app with /api proxy and vitest setup"
```

---

## Task 9: API client

**Files:**
- Create: `web/src/api/client.js`

- [ ] **Step 1: Implement the fetch wrapper**

Create `web/src/api/client.js`:

```js
const JSON_HEADERS = { "Content-Type": "application/json" };

async function handle(res) {
  let body = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  if (!res.ok || body.ok === false) {
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return body.data;
}

export function listSecrets(path = "/") {
  const qs = new URLSearchParams({ path }).toString();
  return fetch(`/api/secrets?${qs}`).then(handle);
}

export function revealSecret(name) {
  const qs = new URLSearchParams({ name }).toString();
  return fetch(`/api/secrets/value?${qs}`).then(handle);
}

export function saveSecret({ name, value, type = "SecureString" }, passphrase) {
  return fetch("/api/secrets", {
    method: "POST",
    headers: { ...JSON_HEADERS, "X-SSM-Passphrase": passphrase },
    body: JSON.stringify({ name, value, type }),
  }).then(handle);
}

export function deleteSecret(name, passphrase) {
  const qs = new URLSearchParams({ name }).toString();
  return fetch(`/api/secrets?${qs}`, {
    method: "DELETE",
    headers: { "X-SSM-Passphrase": passphrase },
  }).then(handle);
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/api/client.js
git commit -m "feat: add web API client for the /api/secrets endpoints"
```

---

## Task 10: Presentational components (TreeList + DetailPanel)

**Files:**
- Create: `web/src/components/TreeList.jsx`, `web/src/components/DetailPanel.jsx`

- [ ] **Step 1: Create `web/src/components/TreeList.jsx`**

```jsx
export default function TreeList({ items, selected, onSelect }) {
  if (!items.length) return <p className="muted">No parameters found.</p>;
  return (
    <ul className="tree">
      {items.map((it) => (
        <li
          key={it.name}
          className={it.name === selected ? "tree-item selected" : "tree-item"}
          onClick={() => onSelect(it.name)}
        >
          <span className="tree-name">{it.name}</span>
          <span className="tree-type">{it.type}</span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Create `web/src/components/DetailPanel.jsx`**

```jsx
export default function DetailPanel({ secret, onReveal, onEdit, onDelete }) {
  if (!secret) return <p className="muted">Select a parameter.</p>;
  return (
    <div className="detail">
      <h2>{secret.name}</h2>
      <p>Type: {secret.type}</p>
      <div className="actions">
        <button onClick={onReveal}>Reveal value</button>
        <button onClick={onEdit}>Edit</button>
        <button className="danger" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/TreeList.jsx web/src/components/DetailPanel.jsx
git commit -m "feat: add TreeList and DetailPanel components"
```

---

## Task 11: RevealModal (TDD)

**Files:**
- Create: `web/src/components/RevealModal.jsx`
- Test: `web/src/components/RevealModal.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `web/src/components/RevealModal.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RevealModal from "./RevealModal.jsx";

describe("RevealModal", () => {
  it("reveals on confirm and clears the value when closed", async () => {
    const reveal = vi.fn().mockResolvedValue({ value: "s3cr3t" });
    const onClose = vi.fn();
    const { rerender } = render(
      <RevealModal open name="/a/b" reveal={reveal} onClose={onClose} />
    );

    fireEvent.click(screen.getByText("Confirm reveal"));
    await waitFor(() => expect(screen.getByText("s3cr3t")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalled();

    rerender(<RevealModal open={false} name="/a/b" reveal={reveal} onClose={onClose} />);
    rerender(<RevealModal open name="/a/b" reveal={reveal} onClose={onClose} />);
    expect(screen.queryByText("s3cr3t")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix web test`
Expected: FAIL — cannot resolve `./RevealModal.jsx`.

- [ ] **Step 3: Implement `web/src/components/RevealModal.jsx`**

```jsx
import { useEffect, useState } from "react";

export default function RevealModal({ open, name, reveal, onClose }) {
  const [value, setValue] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setValue(null);
      setError(null);
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  async function onConfirm() {
    setLoading(true);
    setError(null);
    try {
      const data = await reveal(name);
      setValue(data.value);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Reveal value</h3>
        <p>{name}</p>
        {value === null ? (
          <button onClick={onConfirm} disabled={loading}>
            {loading ? "Revealing…" : "Confirm reveal"}
          </button>
        ) : (
          <div>
            <pre className="value">{value}</pre>
            <button onClick={() => navigator.clipboard?.writeText(value)}>Copy</button>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix web test`
Expected: PASS (1 test file, 1 test).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/RevealModal.jsx web/src/components/RevealModal.test.jsx
git commit -m "feat: add RevealModal with confirm gate and clear-on-close"
```

---

## Task 12: EditModal (create/update)

**Files:**
- Create: `web/src/components/EditModal.jsx`

- [ ] **Step 1: Implement `web/src/components/EditModal.jsx`**

```jsx
import { useEffect, useState } from "react";

export default function EditModal({ open, mode, initialName = "", onSave, onClose }) {
  const [name, setName] = useState(initialName);
  const [value, setValue] = useState("");
  const [type, setType] = useState("SecureString");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setValue("");
      setType("SecureString");
      setPassphrase("");
      setError(null);
      setSaving(false);
    }
  }, [open, initialName]);

  if (!open) return null;

  const canSave = name.trim() && value.length > 0 && passphrase.length > 0 && !saving;

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), value, type }, passphrase);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <h3>{mode === "edit" ? "Update value" : "Create parameter"}</h3>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} readOnly={mode === "edit"} />
        </label>
        <label>
          Value
          <input type="password" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option>SecureString</option>
            <option>String</option>
            <option>StringList</option>
          </select>
        </label>
        <label>
          Passphrase
          <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="submit" disabled={!canSave}>{saving ? "Saving…" : "Save"}</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/EditModal.jsx
git commit -m "feat: add EditModal for create/update with passphrase gate"
```

---

## Task 13: DeleteModal (TDD)

**Files:**
- Create: `web/src/components/DeleteModal.jsx`
- Test: `web/src/components/DeleteModal.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `web/src/components/DeleteModal.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DeleteModal from "./DeleteModal.jsx";

describe("DeleteModal", () => {
  it("enables Delete only when the typed name matches and a passphrase is present", () => {
    const onConfirm = vi.fn();
    render(<DeleteModal open name="/a/b" onConfirm={onConfirm} onClose={() => {}} />);

    const btn = screen.getByRole("button", { name: /^delete$/i });
    expect(btn).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "/wrong" } });
    expect(btn).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "/a/b" } });
    expect(btn).toBeDisabled(); // name matches but no passphrase yet

    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "pw" } });
    expect(btn).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix web test`
Expected: FAIL — cannot resolve `./DeleteModal.jsx`.

- [ ] **Step 3: Implement `web/src/components/DeleteModal.jsx`**

```jsx
import { useEffect, useState } from "react";

export default function DeleteModal({ open, name, onConfirm, onClose }) {
  const [confirmName, setConfirmName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setConfirmName("");
      setPassphrase("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  const canDelete = confirmName === name && passphrase.length > 0 && !busy;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(passphrase);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Delete parameter</h3>
        <p>Type the full name to confirm: <code>{name}</code></p>
        <label>
          Name
          <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
        </label>
        <label>
          Passphrase
          <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="danger" onClick={submit} disabled={!canDelete}>
            {busy ? "Deleting…" : "Delete"}
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix web test`
Expected: PASS (2 test files: RevealModal + DeleteModal).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/DeleteModal.jsx web/src/components/DeleteModal.test.jsx
git commit -m "feat: add DeleteModal with type-to-confirm and passphrase gate"
```

---

## Task 14: Wire App.jsx

**Files:**
- Modify: `web/src/App.jsx` (replaces the Task 8 placeholder)

- [ ] **Step 1: Replace `web/src/App.jsx` with the full app**

```jsx
import { useEffect, useState, useCallback } from "react";
import * as api from "./api/client.js";
import TreeList from "./components/TreeList.jsx";
import DetailPanel from "./components/DetailPanel.jsx";
import RevealModal from "./components/RevealModal.jsx";
import EditModal from "./components/EditModal.jsx";
import DeleteModal from "./components/DeleteModal.jsx";

export default function App() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null); // 'reveal' | 'edit' | 'create' | 'delete' | null

  const load = useCallback(async () => {
    try {
      setItems(await api.listSecrets("/"));
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedSecret = items.find((i) => i.name === selected) || null;

  return (
    <div className="app">
      <header>
        <h1>SSM Secrets Admin</h1>
        <button onClick={() => setModal("create")}>New parameter</button>
      </header>
      {error && <p className="error">{error}</p>}
      <main className="layout">
        <aside className="sidebar">
          <TreeList items={items} selected={selected} onSelect={setSelected} />
        </aside>
        <section className="content">
          <DetailPanel
            secret={selectedSecret}
            onReveal={() => setModal("reveal")}
            onEdit={() => setModal("edit")}
            onDelete={() => setModal("delete")}
          />
        </section>
      </main>

      <RevealModal
        open={modal === "reveal"}
        name={selected}
        reveal={api.revealSecret}
        onClose={() => setModal(null)}
      />
      <EditModal
        open={modal === "edit" || modal === "create"}
        mode={modal === "edit" ? "edit" : "create"}
        initialName={modal === "edit" ? selected || "" : ""}
        onSave={async (payload, passphrase) => {
          await api.saveSecret(payload, passphrase);
          setModal(null);
          await load();
        }}
        onClose={() => setModal(null)}
      />
      <DeleteModal
        open={modal === "delete"}
        name={selected}
        onConfirm={async (passphrase) => {
          await api.deleteSecret(selected, passphrase);
          setModal(null);
          setSelected(null);
          await load();
        }}
        onClose={() => setModal(null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify the build and tests still pass**

Run:
```bash
npm --prefix web run build
npm --prefix web test
```
Expected: build emits `web/dist` with no errors; 2 test files pass.

- [ ] **Step 3: Commit**

```bash
git add web/src/App.jsx
git commit -m "feat: wire App with list, selection, and reveal/edit/delete modals"
```

---

## Task 15: Update secrets rule for the gated-reveal policy

**Files:**
- Modify: `.claude/rules/secrets.md`

- [ ] **Step 1: Replace `.claude/rules/secrets.md` with the policy that matches reality**

```md
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
```

- [ ] **Step 2: Commit**

```bash
git add .claude/rules/secrets.md
git commit -m "docs: update secrets rule for gated, audited reveal policy"
```

---

## Task 16: IAM policy reference

**Files:**
- Create: `docs/iam-policy.json`

- [ ] **Step 1: Create `docs/iam-policy.json`**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParametersByPath",
        "ssm:GetParameter",
        "ssm:PutParameter",
        "ssm:DeleteParameter"
      ],
      "Resource": "*"
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add docs/iam-policy.json
git commit -m "docs: add IAM policy reference including ssm:DeleteParameter"
```

---

## Task 17: Manual end-to-end verification (no code)

**Prerequisites:** valid AWS creds/profile able to read the target path; a chosen passphrase.

- [ ] **Step 1: Build the UI**

Run: `npm run build`
Expected: `web/dist` produced.

- [ ] **Step 2: Start in production mode with a passphrase**

Run: `SSM_UI_PASSPHRASE='choose-one' npm start`
Expected: `SSM admin UI listening on http://127.0.0.1:3000`, no passphrase warning.

- [ ] **Step 3: Exercise each flow in the browser at `http://127.0.0.1:3000`**

- [ ] Browse: the parameter list loads (names + types).
- [ ] Reveal: select a param → Reveal → Confirm → value shows; Close → value gone.
- [ ] Create/update: New parameter → fill name/value + passphrase → Save → list refreshes.
- [ ] Delete: select → Delete → type exact name + passphrase → Delete → item removed.
- [ ] Negative: try a mutation with a wrong passphrase → inline error (401); stop the server, unset `SSM_UI_PASSPHRASE`, restart, attempt a mutation → 503 message.

- [ ] **Step 4: Confirm audit + no value leakage**

Run: `npm run ssm -- list /` then inspect `.memory/app.db` audit rows (or via the CLI usage). Confirm `reveal`/`set`/`delete` rows exist and no row's `meta` contains a decrypted value.

---

## Self-Review

**Spec coverage:**
- Browse → Tasks 6 (route) + 10/14 (UI). Reveal (confirm gate) → Tasks 6 + 11/14. Create/update (passphrase) → Tasks 6 + 12/14. Delete (passphrase, new wrapper + IAM) → Tasks 2, 6, 13/14, 16.
- Architecture (Approach A, 127.0.0.1, Vite proxy dev / static prod) → Tasks 6 (factory + static), 7 (bootstrap/bind), 8 (proxy).
- Tiered gate → confirm-click (Task 11), passphrase middleware (Task 4) applied to POST/DELETE (Task 6).
- Security: timing-safe passphrase (Task 4); decrypted value never in audit (asserted in Task 5); secrets.md policy (Task 15).
- Error mapping/envelope → Task 3 (unit) + Task 5 (integration).
- Tests (security surface) → Tasks 2,3,4,5 backend; 11,13 frontend.
- No audit-view / no search in UI → intentionally absent (matches spec non-goals).
- Env/config (`SSM_UI_PASSPHRASE`, `PORT`, AWS resolution) → Tasks 4/7.

**Placeholder scan:** No TBD/TODO; every code step contains complete code; the Task 8 `App.jsx` is an explicit, replaced placeholder (replaced in Task 14), not an unfilled blank.

**Type/name consistency:** client fns (`listSecrets`, `revealSecret`, `saveSecret`, `deleteSecret`) match `App.jsx` usage; component props (`reveal`, `onSave`, `onConfirm`, `name`, `open`, `onClose`) match the modals' definitions and `App.jsx`; envelope `{ ok, data, error }` consistent across server (Task 6) and client (Task 9); header `X-SSM-Passphrase` consistent (Tasks 4, 9); audit actions `list`/`reveal`/`set`/`delete` consistent (Tasks 6, 17).
