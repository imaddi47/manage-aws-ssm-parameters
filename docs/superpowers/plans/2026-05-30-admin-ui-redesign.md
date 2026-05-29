# Admin UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **UI polish:** For the presentational components (Phase 3) and `theme.css`, the implementer SHOULD invoke the **frontend-design** skill to raise the visual quality to the approved mockup (Apple/Tailscale feel, shaded/gradient primary, neon island, spring motion) — but must NOT change the documented props, function signatures, audit/security behavior, or test expectations in this plan. The code blocks here are a working baseline; frontend-design refines aesthetics only.

**Goal:** Replace the modal admin UI with a master–detail layout + a morphing "Dynamic Island" status pill, add a region switcher, make Edit auto-load the decrypted value into a CodeMirror editor, and emphasize the leaf name in the parameter list.

**Architecture:** Backend gains per-request region support (`getClient(region)` cache + `/api/regions` + region validation). Frontend is restructured into Toolbar/RegionSwitcher/ParameterList/DetailPanel/CodeEditor/DynamicIsland with an operation state machine in `App.jsx`; modals are removed.

**Tech Stack:** Node.js/Express (backend), React 18 + Vite, CodeMirror 6, Vitest + RTL, `node --test` + supertest. Dark theme via CSS variables.

**Spec:** `docs/superpowers/specs/2026-05-30-admin-ui-redesign-design.md`

---

## File Structure

```
src/server/regions.js                  CREATE  AWS_REGIONS, DEFAULT_REGION, isAllowedRegion
src/server/app.js                      MODIFY  createApp({getClient,...}) + GET /api/regions
src/server/routes/secrets.js           MODIFY  region per request + getClient(region) + validation
src/server/index.js                    MODIFY  region->client cache (getClient)
test/server/regions.test.js            CREATE  regions unit test
test/server/secrets.test.js            MODIFY  inject getClient, region cases, /api/regions
web/package.json                       MODIFY  + CodeMirror deps
web/src/theme.css                      CREATE  design tokens (CSS variables)
web/src/styles.css                     MODIFY  layout + component styles using tokens
web/src/lib/paramName.js               CREATE  splitParamName(name) -> {group, leaf}
web/src/lib/language.js                CREATE  languageForName(name) -> CodeMirror language
web/src/lib/paramName.test.js          CREATE  unit test
web/src/lib/language.test.js           CREATE  unit test
web/src/api/client.js                  MODIFY  region on every call + getRegions()
web/src/components/CodeEditor.jsx      CREATE  CodeMirror 6 wrapper
web/src/components/RegionSwitcher.jsx  CREATE  curated dropdown (+ test)
web/src/components/ParameterList.jsx   CREATE  grouped list, path muted/leaf bold, search (+ test) [replaces TreeList]
web/src/components/Toolbar.jsx         CREATE  brand + RegionSwitcher + search
web/src/components/DynamicIsland.jsx   CREATE  morphing status/command pill (+ test)
web/src/components/DetailPanel.jsx     REWRITE header + actions + hosts CodeEditor
web/src/App.jsx                        REWRITE shell + operation state machine
web/src/components/TreeList.jsx        DELETE
web/src/components/RevealModal.jsx     DELETE (+ test)
web/src/components/EditModal.jsx       DELETE
web/src/components/DeleteModal.jsx     DELETE (+ test)
.claude/rules/secrets.md               MODIFY  Edit also reveals (audited); region in meta
docs/iam-policy.json                   (unchanged)
```

---

## Phase 1 — Backend region support

### Task 1: Regions module (TDD)

**Files:**
- Test: `test/server/regions.test.js`
- Create: `src/server/regions.js`

- [ ] **Step 1: Write the failing test**

Create `test/server/regions.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { AWS_REGIONS, DEFAULT_REGION, isAllowedRegion } from "../../src/server/regions.js";

test("DEFAULT_REGION is part of AWS_REGIONS", () => {
  assert.ok(AWS_REGIONS.includes(DEFAULT_REGION));
});

test("isAllowedRegion accepts a known region", () => {
  assert.equal(isAllowedRegion("eu-west-1"), true);
});

test("isAllowedRegion rejects unknown values", () => {
  assert.equal(isAllowedRegion("moon-1"), false);
  assert.equal(isAllowedRegion(undefined), false);
  assert.equal(isAllowedRegion(""), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/server/regions.test.js`
Expected: FAIL — module `src/server/regions.js` not found.

- [ ] **Step 3: Implement**

Create `src/server/regions.js`:

```js
/** Curated list of AWS regions offered by the UI region switcher. */
export const AWS_REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "eu-west-1",
  "eu-west-2",
  "eu-central-1",
  "ap-south-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "sa-east-1",
  "ca-central-1",
];

/** Default region when a request omits one. */
export const DEFAULT_REGION = "us-east-1";

/**
 * @param {unknown} region
 * @returns {boolean} true if `region` is in the curated allowlist.
 */
export function isAllowedRegion(region) {
  return typeof region === "string" && AWS_REGIONS.includes(region);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/server/regions.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/regions.js test/server/regions.test.js
git commit -m "feat: add curated AWS region allowlist for the region switcher"
```

---

### Task 2: Region-aware routes + app factory (TDD)

**Files:**
- Modify: `test/server/secrets.test.js`
- Modify: `src/server/routes/secrets.js`
- Modify: `src/server/app.js`

- [ ] **Step 1: Rewrite the integration test to use `getClient` + regions**

Replace the entire contents of `test/server/secrets.test.js` with:

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
  const fake = makeFake(opts.overrides);
  const calls = [];
  const getClient = (region) => {
    calls.push(region);
    return fake;
  };
  const app = createApp({ getClient, db, passphrase: opts.passphrase ?? "pw" });
  return { app, db, calls };
}

const enc = encodeURIComponent;

test("GET /api/regions returns the list and default", async () => {
  const { app } = build();
  const res = await request(app).get("/api/regions");
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data.regions));
  assert.equal(res.body.data.default, "us-east-1");
});

test("list defaults to us-east-1 when region omitted", async () => {
  const { app, calls } = build();
  const res = await request(app).get("/api/secrets?path=/");
  assert.equal(res.status, 200);
  assert.equal(calls.at(-1), "us-east-1");
});

test("list uses the requested region", async () => {
  const { app, calls } = build();
  const res = await request(app).get("/api/secrets?path=/&region=eu-west-1");
  assert.equal(res.status, 200);
  assert.equal(calls.at(-1), "eu-west-1");
});

test("invalid region is rejected with 400", async () => {
  const { app } = build();
  const res = await request(app).get("/api/secrets?path=/&region=moon-1");
  assert.equal(res.status, 400);
});

test("reveal returns value and never stores it in audit", async () => {
  const { app, db } = build();
  const res = await request(app).get("/api/secrets/value?region=us-east-1&name=" + enc("/a/b"));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.value, "plain-value");
  const row = db.prepare("SELECT action, meta FROM audit ORDER BY id DESC LIMIT 1").get();
  assert.equal(row.action, "reveal");
  assert.ok(!String(row.meta).includes("plain-value"));
});

test("POST is gated by passphrase and takes region in the body", async () => {
  const { app, calls } = build();
  const noPass = await request(app).post("/api/secrets").send({ name: "/a/b", value: "x", region: "us-west-2" });
  assert.equal(noPass.status, 401);
  const ok = await request(app)
    .post("/api/secrets")
    .set("X-SSM-Passphrase", "pw")
    .send({ name: "/a/b", value: "x", region: "us-west-2" });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.data, { name: "/a/b", version: 5 });
  assert.equal(calls.at(-1), "us-west-2");
});

test("DELETE is gated and audits 'delete'", async () => {
  const { app, db } = build();
  const noPass = await request(app).delete("/api/secrets?region=us-east-1&name=" + enc("/a/b"));
  assert.equal(noPass.status, 401);
  const ok = await request(app)
    .delete("/api/secrets?region=us-east-1&name=" + enc("/a/b"))
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
  const res = await request(app).get("/api/secrets/value?region=us-east-1&name=" + enc("/x"));
  assert.equal(res.status, 404);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/server/secrets.test.js`
Expected: FAIL — `createApp` still expects `client`, there's no `/api/regions`, and region handling/validation doesn't exist yet.

- [ ] **Step 3: Rewrite the router for region-per-request**

Replace the entire contents of `src/server/routes/secrets.js` with:

```js
import { Router } from "express";
import { listSecrets, getSecret, saveSecret, deleteSecret } from "../../aws/ssm.js";
import { logAudit } from "../../memory.js";
import { requirePassphrase } from "../middleware/passphrase.js";
import { asyncHandler, HttpError } from "../middleware/errors.js";
import { isAllowedRegion, DEFAULT_REGION } from "../regions.js";

const ALLOWED_TYPES = ["SecureString", "String", "StringList"];

/**
 * Resolve and validate a region, falling back to the default.
 * @param {unknown} value
 * @returns {string}
 */
function resolveRegion(value) {
  const region = value || DEFAULT_REGION;
  if (!isAllowedRegion(region)) throw new HttpError(400, `Unsupported region: ${region}`);
  return region;
}

/**
 * Build the `/api/secrets` router. Region is taken per request (query for
 * GET/DELETE, body for POST); a client is obtained via `getClient(region)`.
 * Mutations are gated by {@link requirePassphrase}; decrypted values are never audited.
 * @param {{ getClient: (region: string) => import("@aws-sdk/client-ssm").SSMClient, db: import("better-sqlite3").Database, passphrase: string|undefined }} deps
 * @returns {import("express").Router}
 */
export function createSecretsRouter({ getClient, db, passphrase }) {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const region = resolveRegion(req.query.region);
      const path = req.query.path || "/";
      const recursive = req.query.recursive !== "false";
      const items = await listSecrets(getClient(region), { path, recursive });
      logAudit(db, "list", path, { count: items.length, region });
      res.json({ ok: true, data: items });
    })
  );

  router.get(
    "/value",
    asyncHandler(async (req, res) => {
      const region = resolveRegion(req.query.region);
      const name = req.query.name;
      if (!name) throw new HttpError(400, "Missing 'name' query parameter");
      const secret = await getSecret(getClient(region), name);
      logAudit(db, "reveal", name, { region });
      res.json({ ok: true, data: secret });
    })
  );

  router.post(
    "/",
    requirePassphrase(passphrase),
    asyncHandler(async (req, res) => {
      const { name, value, type, region: regionInput } = req.body ?? {};
      const region = resolveRegion(regionInput);
      if (!name || typeof value !== "string" || value.length === 0) {
        throw new HttpError(400, "Body must include 'name' and a non-empty 'value'");
      }
      if (type && !ALLOWED_TYPES.includes(type)) {
        throw new HttpError(400, "Invalid 'type'");
      }
      const result = await saveSecret(getClient(region), { name, value, type });
      logAudit(db, "set", name, { version: result.version, region });
      res.json({ ok: true, data: result });
    })
  );

  router.delete(
    "/",
    requirePassphrase(passphrase),
    asyncHandler(async (req, res) => {
      const region = resolveRegion(req.query.region);
      const name = req.query.name;
      if (!name) throw new HttpError(400, "Missing 'name' query parameter");
      await deleteSecret(getClient(region), name);
      logAudit(db, "delete", name, { region });
      res.json({ ok: true, data: { name } });
    })
  );

  return router;
}
```

- [ ] **Step 4: Update the app factory for `getClient` + `/api/regions`**

Replace the entire contents of `src/server/app.js` with:

```js
import express from "express";
import { join } from "node:path";
import { createSecretsRouter } from "./routes/secrets.js";
import { errorHandler } from "./middleware/errors.js";
import { AWS_REGIONS, DEFAULT_REGION } from "./regions.js";

/**
 * Build the Express app: JSON parsing, `/api/regions`, the `/api/secrets`
 * router, optional static UI serving (prod), and the error handler.
 * @param {{ getClient: (region: string) => import("@aws-sdk/client-ssm").SSMClient, db: import("better-sqlite3").Database, passphrase: string|undefined, staticDir?: string }} [deps]
 * @returns {import("express").Express}
 */
export function createApp({ getClient, db, passphrase, staticDir } = {}) {
  const app = express();
  app.use(express.json());

  app.get("/api/regions", (_req, res) =>
    res.json({ ok: true, data: { regions: AWS_REGIONS, default: DEFAULT_REGION } })
  );

  app.use("/api/secrets", createSecretsRouter({ getClient, db, passphrase }));

  if (staticDir) {
    app.use(express.static(staticDir));
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

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/server/secrets.test.js`
Expected: PASS (9 tests).
Then: `npm test`
Expected: all backend tests pass (ssm + errors + passphrase + regions + secrets), 0 fail.

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/secrets.js src/server/app.js test/server/secrets.test.js
git commit -m "feat: region-per-request routes, getClient factory, and /api/regions"
```

---

### Task 3: Server bootstrap — per-region client cache

**Files:**
- Modify: `src/server/index.js`

- [ ] **Step 1: Replace `src/server/index.js`**

```js
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { makeClient } from "../aws/ssm.js";
import { openMemory } from "../memory.js";
import { createApp } from "./app.js";

const PORT = Number(process.env.PORT) || 3000;
const HOST = "127.0.0.1";
const passphrase = process.env.SSM_UI_PASSPHRASE;
const profile = process.env.AWS_PROFILE;

const db = openMemory();

/** region -> SSMClient cache (clients are created lazily, once per region). */
const clients = new Map();
function getClient(region) {
  if (!clients.has(region)) {
    clients.set(region, makeClient({ region, profile }));
  }
  return clients.get(region);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const staticDir =
  process.env.NODE_ENV === "production" ? join(__dirname, "../../web/dist") : undefined;

const app = createApp({ getClient, db, passphrase, staticDir });

app.listen(PORT, HOST, () => {
  console.log(`SSM admin UI listening on http://${HOST}:${PORT}`);
  if (!passphrase) {
    console.warn("WARNING: SSM_UI_PASSPHRASE not set — create/update/delete are disabled (503).");
  }
});
```

- [ ] **Step 2: Verify syntax + suite**

Run: `node --check src/server/index.js`
Expected: no output.
Run: `npm test`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/server/index.js
git commit -m "feat: cache one SSM client per region in the server bootstrap"
```

---

## Phase 2 — Frontend foundations

### Task 4: Install CodeMirror dependencies

**Files:**
- Modify: `web/package.json`

- [ ] **Step 1: Add CodeMirror deps to `web/package.json` dependencies**

Add these to the `"dependencies"` block (keep `react`/`react-dom`):

```json
    "@codemirror/lang-json": "^6.0.1",
    "@codemirror/lang-yaml": "^6.1.1",
    "@codemirror/language": "^6.10.2",
    "@codemirror/legacy-modes": "^6.4.0",
    "@codemirror/state": "^6.4.1",
    "@codemirror/view": "^6.28.0",
    "codemirror": "^6.0.1"
```

The resulting `"dependencies"` is:

```json
  "dependencies": {
    "@codemirror/lang-json": "^6.0.1",
    "@codemirror/lang-yaml": "^6.1.1",
    "@codemirror/language": "^6.10.2",
    "@codemirror/legacy-modes": "^6.4.0",
    "@codemirror/state": "^6.4.1",
    "@codemirror/view": "^6.28.0",
    "codemirror": "^6.0.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  }
```

- [ ] **Step 2: Install**

Run: `npm --prefix web install`
Expected: CodeMirror packages added; no errors.

- [ ] **Step 3: Confirm the suite still runs**

Run: `npm --prefix web test`
Expected: existing tests pass (RevealModal + DeleteModal still present at this point).

- [ ] **Step 4: Commit**

```bash
git add web/package.json web/package-lock.json
git commit -m "chore: add CodeMirror 6 dependencies to the web app"
```

---

### Task 5: `splitParamName` util (TDD)

**Files:**
- Test: `web/src/lib/paramName.test.js`
- Create: `web/src/lib/paramName.js`

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/paramName.test.js`:

```js
import { describe, it, expect } from "vitest";
import { splitParamName } from "./paramName.js";

describe("splitParamName", () => {
  it("splits the parent path from the leaf", () => {
    expect(splitParamName("/toddle/x/init-script.sh")).toEqual({
      group: "/toddle/x",
      leaf: "init-script.sh",
    });
  });
  it("handles a single leading slash", () => {
    expect(splitParamName("/top")).toEqual({ group: "", leaf: "top" });
  });
  it("handles a name with no slash", () => {
    expect(splitParamName("solo")).toEqual({ group: "", leaf: "solo" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix web test`
Expected: FAIL — cannot resolve `./paramName.js`.

- [ ] **Step 3: Implement**

Create `web/src/lib/paramName.js`:

```js
/**
 * Split an SSM parameter name into its parent path ("group") and leaf segment.
 * @param {string} name e.g. "/toddle/x/init-script.sh"
 * @returns {{ group: string, leaf: string }} e.g. { group: "/toddle/x", leaf: "init-script.sh" }
 */
export function splitParamName(name) {
  const clean = String(name || "");
  const i = clean.lastIndexOf("/");
  if (i < 0) return { group: "", leaf: clean };
  return { group: clean.slice(0, i), leaf: clean.slice(i + 1) };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm --prefix web test`
Expected: the `splitParamName` suite passes (alongside existing tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/paramName.js web/src/lib/paramName.test.js
git commit -m "feat: add splitParamName util for path/leaf display"
```

---

### Task 6: `languageIdForName` util (TDD)

**Files:**
- Test: `web/src/lib/language.test.js`
- Create: `web/src/lib/language.js`

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/language.test.js`:

```js
import { describe, it, expect } from "vitest";
import { languageIdForName } from "./language.js";

describe("languageIdForName", () => {
  it("maps shell scripts", () => {
    expect(languageIdForName("/x/init-script.sh")).toBe("shell");
  });
  it("maps json", () => {
    expect(languageIdForName("config.json")).toBe("json");
  });
  it("maps ini and conf", () => {
    expect(languageIdForName("pgbouncer.ini")).toBe("ini");
    expect(languageIdForName("pg_hba.conf")).toBe("ini");
  });
  it("maps yaml", () => {
    expect(languageIdForName("stack.yaml")).toBe("yaml");
  });
  it("falls back to plain", () => {
    expect(languageIdForName("userlist.txt")).toBe("plain");
    expect(languageIdForName("noext")).toBe("plain");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix web test`
Expected: FAIL — cannot resolve `./language.js`.

- [ ] **Step 3: Implement (pure — no CodeMirror imports here)**

Create `web/src/lib/language.js`:

```js
/**
 * Map a parameter name's file extension to a language id. Pure (no CodeMirror
 * imports) so it is trivially unit-testable; CodeEditor maps the id to an extension.
 * @param {string} name
 * @returns {"shell"|"json"|"yaml"|"ini"|"plain"}
 */
export function languageIdForName(name) {
  const leaf = String(name || "").split("/").pop() || "";
  const dot = leaf.lastIndexOf(".");
  const ext = dot >= 0 ? leaf.slice(dot + 1).toLowerCase() : "";
  switch (ext) {
    case "sh":
    case "bash":
      return "shell";
    case "json":
      return "json";
    case "yaml":
    case "yml":
      return "yaml";
    case "ini":
    case "conf":
    case "cfg":
    case "properties":
      return "ini";
    default:
      return "plain";
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm --prefix web test`
Expected: the `languageIdForName` suite passes.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/language.js web/src/lib/language.test.js
git commit -m "feat: add languageIdForName util for editor syntax selection"
```

---

### Task 7: Design tokens + restyle

> **Apply the frontend-design skill here** to refine the palette/typography/motion to the approved mockup (Apple/Tailscale, shaded primary, neon island). Keep the CSS variable names and class names below stable — components reference them.

**Files:**
- Create: `web/src/theme.css`
- Modify: `web/src/styles.css`
- Modify: `web/src/main.jsx` (import theme before styles)

- [ ] **Step 1: Create `web/src/theme.css` (tokens)**

```css
:root {
  --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, system-ui, sans-serif;
  --font-mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;

  --bg: #0b1020;
  --surface: #0f1730;
  --surface-2: #0a0f1e;
  --editor-bg: #06090f;
  --border: #1f2937;
  --text: #e5e7eb;
  --text-muted: #5f6b82;
  --text-strong: #ffffff;

  --primary-from: #3b82f6;
  --primary-to: #2563eb;
  --primary-grad: linear-gradient(180deg, var(--primary-from), var(--primary-to));

  --neon-blue: #60a5fa;
  --neon-amber: #f59e0b;
  --neon-green: #34d399;
  --neon-red: #f87171;

  --radius-sm: 8px;
  --radius: 10px;
  --radius-lg: 16px;
  --shadow-lg: 0 24px 60px rgba(0, 0, 0, 0.45);
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
}
```

- [ ] **Step 2: Replace `web/src/styles.css` with token-based layout/component styles**

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: var(--font-sans); color: var(--text); background: var(--bg); }
.app { display: flex; flex-direction: column; height: 100vh; }

/* Toolbar */
.toolbar { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--border); background: linear-gradient(180deg, #0d1326, var(--bg)); }
.brand { font-weight: 700; color: var(--text-strong); }
.search { margin-left: auto; background: var(--surface-2); border: 1px solid var(--border); color: var(--text); border-radius: var(--radius); padding: 7px 11px; width: 220px; font: inherit; }

/* Region switcher */
.region { display: inline-flex; align-items: center; gap: 7px; background: var(--surface); border: 1px solid var(--border); color: var(--text); border-radius: var(--radius); padding: 6px 10px; font: inherit; cursor: pointer; }
.region .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--neon-green); box-shadow: 0 0 8px var(--neon-green); }

/* Layout */
.layout { display: grid; grid-template-columns: 320px 1fr; flex: 1; min-height: 0; }
.sidebar { border-right: 1px solid var(--border); overflow: auto; background: var(--surface-2); padding: 8px; }
.content { padding: 18px; overflow: auto; }

/* List */
.grp { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin: 12px 6px 4px; }
.item { display: flex; flex-direction: column; gap: 1px; padding: 8px 10px; border-radius: var(--radius-sm); cursor: pointer; }
.item:hover { background: #101830; }
.item.active { background: #15213f; outline: 1px solid #2b6cb0; }
.item .leaf { font-weight: 700; color: #eef2ff; font-family: var(--font-mono); font-size: 13px; }
.item .path { font-size: 10px; color: var(--text-muted); }

/* Detail */
.crumb { font-size: 11px; color: var(--text-muted); }
.title { font-size: 20px; font-weight: 800; color: var(--text-strong); display: flex; align-items: center; gap: 9px; }
.badge { font-size: 10px; border-radius: 6px; padding: 2px 7px; border: 1px solid var(--border); color: #a7f3d0; }
.actions { display: flex; gap: 8px; margin: 12px 0; }
button { font: inherit; font-size: 13px; border-radius: var(--radius); padding: 7px 13px; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; transition: transform 120ms var(--ease), filter 120ms var(--ease); }
button:hover:not(:disabled) { filter: brightness(1.12); }
button:active:not(:disabled) { transform: translateY(1px); }
button:disabled { opacity: 0.5; cursor: not-allowed; }
button.primary { background: var(--primary-grad); border-color: var(--primary-to); color: #fff; box-shadow: inset 0 1px 0 rgba(255,255,255,0.18); }
button.danger { background: #1b0f12; border-color: #5b1d22; color: #fca5a5; }

/* CodeMirror host */
.editor-host { border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; background: var(--editor-bg); }
.editor-host .cm-editor { height: 52vh; }

/* Dynamic Island */
.island { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); background: #000; color: #fff; border: 1px solid #222; border-radius: 999px; padding: 8px 16px; display: flex; align-items: center; gap: 10px; box-shadow: var(--shadow-lg); transition: border-radius 200ms var(--ease), padding 200ms var(--ease); z-index: 50; max-width: 90vw; }
.island.expanded { border-radius: var(--radius-lg); padding: 12px 16px; flex-direction: column; align-items: stretch; gap: 8px; width: 420px; }
.island .mini { width: 8px; height: 8px; border-radius: 50%; }
.island.s-idle .mini { background: var(--neon-blue); box-shadow: 0 0 8px var(--neon-blue); }
.island.s-confirm .mini, .island.s-passphrase .mini { background: var(--neon-amber); box-shadow: 0 0 8px var(--neon-amber); }
.island.s-saved .mini { background: var(--neon-green); box-shadow: 0 0 8px var(--neon-green); }
.island.s-error .mini, .island.s-delete .mini { background: var(--neon-red); box-shadow: 0 0 8px var(--neon-red); }
.island input { font: inherit; background: #0a0f1e; border: 1px solid #243049; color: #fff; border-radius: var(--radius-sm); padding: 6px 9px; }
.island .row { display: flex; gap: 8px; align-items: center; }

.error { color: var(--neon-red); }
.muted { color: var(--text-muted); }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
```

- [ ] **Step 3: Import the theme before styles in `web/src/main.jsx`**

Replace the import lines so theme loads first:

```jsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./theme.css";
import "./styles.css";

createRoot(document.getElementById("root")).render(<App />);
```

- [ ] **Step 4: Verify build**

Run: `npm --prefix web run build`
Expected: clean build (no CSS import errors).

- [ ] **Step 5: Commit**

```bash
git add web/src/theme.css web/src/styles.css web/src/main.jsx
git commit -m "feat: add design tokens and restyle to the dark Apple/Tailscale system"
```

---

### Task 8: Region-aware API client

**Files:**
- Modify: `web/src/api/client.js`

- [ ] **Step 1: Replace `web/src/api/client.js`**

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

function qs(params) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""));
  return new URLSearchParams(clean).toString();
}

/** @returns {Promise<{ regions: string[], default: string }>} */
export function getRegions() {
  return fetch("/api/regions").then(handle);
}

/**
 * @param {string} [path]
 * @param {string} [region]
 * @returns {Promise<Array<{ name: string, type: string }>>}
 */
export function listSecrets(path = "/", region) {
  return fetch(`/api/secrets?${qs({ path, region })}`).then(handle);
}

/**
 * @param {string} name
 * @param {string} [region]
 * @returns {Promise<{ name: string, value: string, type: string, version: number }>}
 */
export function revealSecret(name, region) {
  return fetch(`/api/secrets/value?${qs({ name, region })}`).then(handle);
}

/**
 * @param {{ name: string, value: string, type?: string }} params
 * @param {string} passphrase
 * @param {string} [region]
 * @returns {Promise<{ name: string, version: number }>}
 */
export function saveSecret({ name, value, type = "SecureString" }, passphrase, region) {
  return fetch("/api/secrets", {
    method: "POST",
    headers: { ...JSON_HEADERS, "X-SSM-Passphrase": passphrase },
    body: JSON.stringify({ name, value, type, region }),
  }).then(handle);
}

/**
 * @param {string} name
 * @param {string} passphrase
 * @param {string} [region]
 * @returns {Promise<{ name: string }>}
 */
export function deleteSecret(name, passphrase, region) {
  return fetch(`/api/secrets?${qs({ name, region })}`, {
    method: "DELETE",
    headers: { "X-SSM-Passphrase": passphrase },
  }).then(handle);
}
```

- [ ] **Step 2: Verify build**

Run: `npm --prefix web run build`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add web/src/api/client.js
git commit -m "feat: pass region on every API call and add getRegions()"
```

---

## Phase 3 — Components

> Apply the **frontend-design** skill to these for visual polish; keep the documented props/behavior and test expectations.

### Task 9: CodeEditor (CodeMirror 6 wrapper)

**Files:**
- Create: `web/src/components/CodeEditor.jsx`

- [ ] **Step 1: Implement `web/src/components/CodeEditor.jsx`**

```jsx
import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { languageIdForName } from "../lib/language.js";

function languageExtension(id) {
  switch (id) {
    case "json": return json();
    case "yaml": return yaml();
    case "shell": return StreamLanguage.define(shell);
    case "ini": return StreamLanguage.define(properties);
    default: return [];
  }
}

const darkTheme = EditorView.theme(
  {
    "&": { backgroundColor: "transparent", color: "#e5e7eb", fontSize: "13px" },
    ".cm-content": { fontFamily: "var(--font-mono)" },
    ".cm-gutters": { backgroundColor: "transparent", color: "#374151", border: "none" },
    "&.cm-focused": { outline: "none" },
  },
  { dark: true }
);

/**
 * CodeMirror 6 editor. Language is chosen from the parameter name's extension.
 * @param {{ name: string, value: string, readOnly?: boolean, onChange?: (v: string) => void }} props
 */
export default function CodeEditor({ name, value, readOnly = false, onChange }) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Rebuild when the language (name) or readOnly changes.
  useEffect(() => {
    if (!hostRef.current) return undefined;
    const state = EditorState.create({
      doc: value ?? "",
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        languageExtension(languageIdForName(name)),
        darkTheme,
        EditorView.editable.of(!readOnly),
        EditorState.readOnly.of(readOnly),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && onChangeRef.current) onChangeRef.current(u.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, readOnly]);

  // Sync external value changes (loading a different param) without rebuilding.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value != null && value !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return <div className="editor-host" ref={hostRef} />;
}
```

- [ ] **Step 2: Verify build**

Run: `npm --prefix web run build`
Expected: clean build (CodeMirror imports resolve).

- [ ] **Step 3: Commit**

```bash
git add web/src/components/CodeEditor.jsx
git commit -m "feat: add CodeMirror 6 editor with language-by-extension"
```

---

### Task 10: RegionSwitcher (TDD)

**Files:**
- Test: `web/src/components/RegionSwitcher.test.jsx`
- Create: `web/src/components/RegionSwitcher.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RegionSwitcher from "./RegionSwitcher.jsx";

describe("RegionSwitcher", () => {
  it("calls onChange with the selected region", () => {
    const onChange = vi.fn();
    render(<RegionSwitcher regions={["us-east-1", "eu-west-1"]} value="us-east-1" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("AWS region"), { target: { value: "eu-west-1" } });
    expect(onChange).toHaveBeenCalledWith("eu-west-1");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix web test`
Expected: FAIL — cannot resolve `./RegionSwitcher.jsx`.

- [ ] **Step 3: Implement `web/src/components/RegionSwitcher.jsx`**

```jsx
/**
 * Curated AWS region dropdown.
 * @param {{ regions: string[], value: string, onChange: (region: string) => void }} props
 */
export default function RegionSwitcher({ regions, value, onChange }) {
  return (
    <label className="region">
      <span className="dot" />
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="AWS region">
        {regions.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm --prefix web test`
Expected: the RegionSwitcher test passes.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/RegionSwitcher.jsx web/src/components/RegionSwitcher.test.jsx
git commit -m "feat: add RegionSwitcher dropdown"
```

---

### Task 11: ParameterList (TDD)

**Files:**
- Test: `web/src/components/ParameterList.test.jsx`
- Create: `web/src/components/ParameterList.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ParameterList from "./ParameterList.jsx";

const items = [
  { name: "/toddle/x/init-script.sh", type: "String" },
  { name: "/toddle/x/pgbouncer.ini", type: "SecureString" },
];

describe("ParameterList", () => {
  it("renders leaf names and selects on click", () => {
    const onSelect = vi.fn();
    render(<ParameterList items={items} selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("init-script.sh"));
    expect(onSelect).toHaveBeenCalledWith("/toddle/x/init-script.sh");
  });

  it("filters by query (case-insensitive)", () => {
    render(<ParameterList items={items} selected={null} query="PGBOUNCER" onSelect={() => {}} />);
    expect(screen.queryByText("init-script.sh")).not.toBeInTheDocument();
    expect(screen.getByText("pgbouncer.ini")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix web test`
Expected: FAIL — cannot resolve `./ParameterList.jsx`.

- [ ] **Step 3: Implement `web/src/components/ParameterList.jsx`**

```jsx
import { splitParamName } from "../lib/paramName.js";

/**
 * Grouped parameter list — parent path shown as a group header, leaf bold.
 * Filters client-side by `query` (matches the full name).
 * @param {{ items: Array<{ name: string, type: string }>, selected: string|null, query?: string, onSelect: (name: string) => void }} props
 */
export default function ParameterList({ items, selected, query = "", onSelect }) {
  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((it) => it.name.toLowerCase().includes(q)) : items;
  if (!filtered.length) return <p className="muted" style={{ padding: 10 }}>No parameters.</p>;

  const groups = new Map();
  for (const it of filtered) {
    const { group, leaf } = splitParamName(it.name);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ ...it, leaf });
  }

  return (
    <div>
      {[...groups.entries()].map(([group, rows]) => (
        <div key={group || "(root)"}>
          <div className="grp">{group || "/"}</div>
          {rows.map((it) => (
            <div
              key={it.name}
              className={it.name === selected ? "item active" : "item"}
              onClick={() => onSelect(it.name)}
            >
              <span className="leaf">{it.leaf}</span>
              <span className="path">{it.type}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm --prefix web test`
Expected: the ParameterList tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ParameterList.jsx web/src/components/ParameterList.test.jsx
git commit -m "feat: add grouped ParameterList with path-muted/leaf-bold + filter"
```

---

### Task 12: Toolbar

**Files:**
- Create: `web/src/components/Toolbar.jsx`

- [ ] **Step 1: Implement `web/src/components/Toolbar.jsx`**

```jsx
import RegionSwitcher from "./RegionSwitcher.jsx";

/**
 * Top bar: brand, region switcher, and client-side search box.
 * @param {{ regions: string[], region: string, onRegionChange: (r: string) => void,
 *   query: string, onQueryChange: (q: string) => void }} props
 */
export default function Toolbar({ regions, region, onRegionChange, query, onQueryChange }) {
  return (
    <div className="toolbar">
      <span className="brand">SSM&nbsp;Secrets</span>
      <RegionSwitcher regions={regions} value={region} onChange={onRegionChange} />
      <input
        className="search"
        placeholder="Search parameters…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        aria-label="Search parameters"
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm --prefix web run build`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/Toolbar.jsx
git commit -m "feat: add Toolbar (brand + region switcher + search)"
```

---

### Task 13: DynamicIsland (TDD)

**Files:**
- Test: `web/src/components/DynamicIsland.test.jsx`
- Create: `web/src/components/DynamicIsland.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DynamicIsland from "./DynamicIsland.jsx";

const noop = () => {};

describe("DynamicIsland — deleteConfirm", () => {
  it("enables Delete only when the typed name matches and a passphrase is present", () => {
    const onConfirmDelete = vi.fn();
    render(
      <DynamicIsland
        state={{ kind: "deleteConfirm", leaf: "init-script.sh" }}
        onConfirmReveal={noop}
        onSubmitPassphrase={noop}
        onConfirmDelete={onConfirmDelete}
        onCancel={noop}
      />
    );
    const btn = screen.getByRole("button", { name: /^delete$/i });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Confirm name"), { target: { value: "wrong" } });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Confirm name"), { target: { value: "init-script.sh" } });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "pw" } });
    expect(btn).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix web test`
Expected: FAIL — cannot resolve `./DynamicIsland.jsx`.

- [ ] **Step 3: Implement `web/src/components/DynamicIsland.jsx`**

```jsx
import { useEffect, useState } from "react";

const STATE_CLASS = {
  idle: "s-idle",
  revealConfirm: "s-confirm",
  passphrase: "s-passphrase",
  deleteConfirm: "s-delete",
  busy: "s-idle",
  saved: "s-saved",
  error: "s-error",
};

/**
 * Morphing status/command pill. Renders the current operation `state` and emits
 * events. Never displays a decrypted value; passphrase input is masked.
 * @param {{ state: { kind: string, [k: string]: any },
 *   onConfirmReveal: () => void,
 *   onSubmitPassphrase: (pw: string) => void,
 *   onConfirmDelete: (typedName: string, pw: string) => void,
 *   onCancel: () => void }} props
 */
export default function DynamicIsland({ state, onConfirmReveal, onSubmitPassphrase, onConfirmDelete, onCancel }) {
  const [pw, setPw] = useState("");
  const [typed, setTyped] = useState("");
  useEffect(() => {
    setPw("");
    setTyped("");
  }, [state.kind, state.leaf]);

  const { kind } = state;
  const expanded = kind === "revealConfirm" || kind === "passphrase" || kind === "deleteConfirm";
  const cls = `island ${expanded ? "expanded" : ""} ${STATE_CLASS[kind] || "s-idle"}`;

  return (
    <div className={cls} role="status">
      <span className="mini" />
      {kind === "idle" && <span>{state.region} · {state.count} parameters</span>}
      {kind === "busy" && <span>{state.label}…</span>}
      {kind === "saved" && <span>Saved v{state.version} ✓</span>}
      {kind === "error" && <span className="error">{state.message}</span>}

      {kind === "revealConfirm" && (
        <>
          <span>Reveal <strong>{state.leaf}</strong>?</span>
          <div className="row">
            <button className="primary" onClick={onConfirmReveal}>Reveal</button>
            <button onClick={onCancel}>Cancel</button>
          </div>
        </>
      )}

      {kind === "passphrase" && (
        <>
          <span>{state.label || "Passphrase to save"}</span>
          <div className="row">
            <input
              type="password"
              value={pw}
              autoFocus
              placeholder="passphrase"
              aria-label="Passphrase"
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && pw) onSubmitPassphrase(pw); }}
            />
            <button className="primary" disabled={!pw} onClick={() => onSubmitPassphrase(pw)}>Confirm</button>
            <button onClick={onCancel}>Cancel</button>
          </div>
        </>
      )}

      {kind === "deleteConfirm" && (
        <>
          <span>Type <strong>{state.leaf}</strong> + passphrase to delete</span>
          <div className="row">
            <input value={typed} autoFocus placeholder="name" aria-label="Confirm name" onChange={(e) => setTyped(e.target.value)} />
            <input type="password" value={pw} placeholder="passphrase" aria-label="Passphrase" onChange={(e) => setPw(e.target.value)} />
            <button className="danger" disabled={typed !== state.leaf || !pw} onClick={() => onConfirmDelete(typed, pw)}>Delete</button>
            <button onClick={onCancel}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm --prefix web test`
Expected: the DynamicIsland test passes.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/DynamicIsland.jsx web/src/components/DynamicIsland.test.jsx
git commit -m "feat: add DynamicIsland morphing status/command pill"
```

---

### Task 14: DetailPanel (rewrite)

**Files:**
- Modify (rewrite): `web/src/components/DetailPanel.jsx`

- [ ] **Step 1: Replace `web/src/components/DetailPanel.jsx`**

```jsx
import CodeEditor from "./CodeEditor.jsx";
import { splitParamName } from "../lib/paramName.js";

/**
 * Right-hand panel. Renders the selected parameter's header + actions and hosts
 * the CodeEditor. `mode` drives view/edit/create. All logic is delegated to App.
 * @param {{
 *   secret: { name: string, type: string } | null,
 *   mode: "idle" | "view" | "edit" | "create",
 *   editorName: string,
 *   value: string,
 *   nameInput: string,
 *   onNameInput: (v: string) => void,
 *   onValueChange: (v: string) => void,
 *   onReveal: () => void, onEdit: () => void, onDelete: () => void, onNew: () => void,
 *   onSave: () => void, onCancel: () => void
 * }} props
 */
export default function DetailPanel(props) {
  const {
    secret, mode, editorName, value, nameInput, onNameInput, onValueChange,
    onReveal, onEdit, onDelete, onNew, onSave, onCancel,
  } = props;

  if (mode === "create") {
    return (
      <div>
        <div className="title">New parameter</div>
        <div className="actions">
          <input className="search" style={{ width: 360 }} placeholder="/path/to/name" value={nameInput} aria-label="New name" onChange={(e) => onNameInput(e.target.value)} />
          <button className="primary" disabled={!nameInput.trim()} onClick={onSave}>Save</button>
          <button onClick={onCancel}>Cancel</button>
        </div>
        <CodeEditor name={nameInput || ""} value={value} readOnly={false} onChange={onValueChange} />
      </div>
    );
  }

  if (!secret) return <p className="muted">Select a parameter, or create a new one.</p>;

  const { group, leaf } = splitParamName(secret.name);
  const editing = mode === "edit";

  return (
    <div>
      <div className="crumb">{group || "/"}</div>
      <div className="title">{leaf} <span className="badge">{secret.type}</span></div>
      <div className="actions">
        {!editing && <button onClick={onReveal}>Reveal</button>}
        {!editing && <button className="primary" onClick={onEdit}>Edit</button>}
        {!editing && <button className="danger" onClick={onDelete}>Delete</button>}
        {!editing && <button onClick={onNew}>New</button>}
        {editing && <button className="primary" onClick={onSave}>Save</button>}
        {editing && <button onClick={onCancel}>Cancel</button>}
      </div>
      {(mode === "view" || mode === "edit") && (
        <CodeEditor name={editorName} value={value} readOnly={mode === "view"} onChange={onValueChange} />
      )}
      {mode === "idle" && <p className="muted">Reveal to view the value, or Edit to load and change it.</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm --prefix web run build`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/DetailPanel.jsx
git commit -m "feat: rewrite DetailPanel to host the CodeEditor with view/edit/create modes"
```

---

## Phase 4 — Orchestration & cleanup

### Task 15: Rewrite App.jsx (operation state machine)

**Files:**
- Modify (rewrite): `web/src/App.jsx`

- [ ] **Step 1: Replace `web/src/App.jsx`**

```jsx
import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "./api/client.js";
import { splitParamName } from "./lib/paramName.js";
import Toolbar from "./components/Toolbar.jsx";
import ParameterList from "./components/ParameterList.jsx";
import DetailPanel from "./components/DetailPanel.jsx";
import DynamicIsland from "./components/DynamicIsland.jsx";

const leafOf = (name) => splitParamName(name || "").leaf;

/**
 * Root admin UI: regions + list loading, selection, and the reveal/edit/create/
 * delete operation state machine that drives the DetailPanel and DynamicIsland.
 */
export default function App() {
  const [regions, setRegions] = useState([]);
  const [region, setRegion] = useState("us-east-1");
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("idle"); // idle | view | edit | create
  const [value, setValue] = useState("");
  const [editorName, setEditorName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [island, setIsland] = useState({ kind: "idle", region: "us-east-1", count: 0 });
  const [error, setError] = useState(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const regionRef = useRef(region);
  regionRef.current = region;

  const goIdle = useCallback(() => {
    setIsland({ kind: "idle", region: regionRef.current, count: itemsRef.current.length });
  }, []);

  const loadList = useCallback(async (r) => {
    try {
      const data = await api.listSecrets("/", r);
      setItems(data);
      itemsRef.current = data;
      setError(null);
      setIsland({ kind: "idle", region: r, count: data.length });
    } catch (e) {
      setError(e.message);
      setIsland({ kind: "error", message: e.message });
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { regions: list, default: def } = await api.getRegions();
        setRegions(list);
        setRegion(def);
        regionRef.current = def;
        await loadList(def);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [loadList]);

  const selectedSecret = items.find((i) => i.name === selected) || null;

  function onRegionChange(r) {
    setRegion(r);
    regionRef.current = r;
    setSelected(null);
    setMode("idle");
    setValue("");
    loadList(r);
  }

  function onSelect(name) {
    setSelected(name);
    setMode("idle");
    setValue("");
    goIdle();
  }

  function onReveal() {
    if (selected) setIsland({ kind: "revealConfirm", leaf: leafOf(selected) });
  }

  async function onConfirmReveal() {
    try {
      setIsland({ kind: "busy", label: "Revealing" });
      const data = await api.revealSecret(selected, regionRef.current);
      setValue(data.value);
      setEditorName(selected);
      setMode("view");
      goIdle();
    } catch (e) {
      setIsland({ kind: "error", message: e.message });
    }
  }

  async function onEdit() {
    if (!selected) return;
    try {
      setIsland({ kind: "busy", label: "Loading" });
      const data = await api.revealSecret(selected, regionRef.current); // auto-load (audited reveal)
      setValue(data.value);
      setEditorName(selected);
      setMode("edit");
      goIdle();
    } catch (e) {
      setIsland({ kind: "error", message: e.message });
    }
  }

  function onNew() {
    setSelected(null);
    setNameInput("");
    setValue("");
    setMode("create");
    goIdle();
  }

  function onSaveRequest() {
    const name = mode === "create" ? nameInput.trim() : selected;
    if (!name) return;
    setIsland({ kind: "passphrase", label: `Passphrase to save ${leafOf(name)}` });
  }

  async function onSubmitPassphrase(pw) {
    const name = mode === "create" ? nameInput.trim() : selected;
    try {
      setIsland({ kind: "busy", label: "Saving" });
      const res = await api.saveSecret({ name, value, type: "SecureString" }, pw, regionRef.current);
      await loadList(regionRef.current);
      setSelected(name);
      setEditorName(name);
      setMode("view");
      setIsland({ kind: "saved", version: res.version });
      setTimeout(goIdle, 1600);
    } catch (e) {
      setIsland({ kind: "error", message: e.message });
    }
  }

  function onDelete() {
    if (selected) setIsland({ kind: "deleteConfirm", leaf: leafOf(selected) });
  }

  async function onConfirmDelete(_typed, pw) {
    try {
      setIsland({ kind: "busy", label: "Deleting" });
      await api.deleteSecret(selected, pw, regionRef.current);
      setSelected(null);
      setMode("idle");
      setValue("");
      await loadList(regionRef.current);
    } catch (e) {
      setIsland({ kind: "error", message: e.message });
    }
  }

  function detailCancel() {
    setMode("idle");
    setValue("");
    goIdle();
  }

  return (
    <div className="app">
      <Toolbar
        regions={regions}
        region={region}
        onRegionChange={onRegionChange}
        query={query}
        onQueryChange={setQuery}
      />
      {error && <p className="error" style={{ padding: "6px 16px" }}>{error}</p>}
      <div className="layout">
        <aside className="sidebar">
          <ParameterList items={items} selected={selected} query={query} onSelect={onSelect} />
        </aside>
        <section className="content">
          <DetailPanel
            secret={selectedSecret}
            mode={mode}
            editorName={editorName}
            value={value}
            nameInput={nameInput}
            onNameInput={setNameInput}
            onValueChange={setValue}
            onReveal={onReveal}
            onEdit={onEdit}
            onDelete={onDelete}
            onNew={onNew}
            onSave={onSaveRequest}
            onCancel={detailCancel}
          />
        </section>
      </div>
      <DynamicIsland
        state={island}
        onConfirmReveal={onConfirmReveal}
        onSubmitPassphrase={onSubmitPassphrase}
        onConfirmDelete={onConfirmDelete}
        onCancel={goIdle}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify build + tests**

Run: `npm --prefix web run build`
Expected: clean build (App imports Toolbar/ParameterList/DetailPanel/DynamicIsland; no modal imports).
Run: `npm --prefix web test`
Expected: all current web tests pass (util + component tests + the still-present modal tests).

- [ ] **Step 3: Commit**

```bash
git add web/src/App.jsx
git commit -m "feat: rewrite App with region + operation state machine (island/list/detail)"
```

---

### Task 16: Remove the old modal components and TreeList

**Files:**
- Delete: `web/src/components/TreeList.jsx`, `RevealModal.jsx`, `RevealModal.test.jsx`, `EditModal.jsx`, `DeleteModal.jsx`, `DeleteModal.test.jsx`

- [ ] **Step 1: Remove the files**

```bash
git rm web/src/components/TreeList.jsx \
       web/src/components/RevealModal.jsx \
       web/src/components/RevealModal.test.jsx \
       web/src/components/EditModal.jsx \
       web/src/components/DeleteModal.jsx \
       web/src/components/DeleteModal.test.jsx
```

- [ ] **Step 2: Verify nothing references them**

Run: `grep -rn "RevealModal\|EditModal\|DeleteModal\|TreeList" web/src || echo "no references"`
Expected: `no references`.

- [ ] **Step 3: Verify build + tests**

Run: `npm --prefix web run build`
Expected: clean build.
Run: `npm --prefix web test`
Expected: 5 test files pass — `paramName`, `language`, `RegionSwitcher`, `ParameterList`, `DynamicIsland` (the modal tests are gone).

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor: remove modal components and TreeList (replaced by inline panel + island)"
```

---

### Task 17: Update the secrets rule for Edit-reveal + region

**Files:**
- Modify (rewrite): `.claude/rules/secrets.md`

- [ ] **Step 1: Replace `.claude/rules/secrets.md`**

```md
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
```

- [ ] **Step 2: Commit**

```bash
git add .claude/rules/secrets.md
git commit -m "docs: note Edit also reveals (audited) and region handling in secrets rule"
```

---

### Task 18: Final verification (no code)

- [ ] **Step 1: Backend suite**

Run: `npm test`
Expected: all backend tests pass, 0 fail (ssm, errors, passphrase, regions, secrets).

- [ ] **Step 2: Frontend suite + build**

Run: `npm --prefix web test`
Expected: 5 files pass.
Run: `npm run build`
Expected: `web/dist` produced, no errors.

- [ ] **Step 3: Prod smoke (safe — no real writes)**

```bash
SSM_UI_PASSPHRASE='smoke' PORT=3997 NODE_ENV=production node src/server/index.js &
SRV=$!; sleep 2
curl -s --max-time 10 -o /dev/null -w "GET / -> %{http_code}\n" http://127.0.0.1:3997/
curl -s --max-time 10 -w "\n/api/regions -> %{http_code}\n" http://127.0.0.1:3997/api/regions | head -c 300
curl -s --max-time 15 -o /dev/null -w "list us-east-1 -> %{http_code}\n" "http://127.0.0.1:3997/api/secrets?path=/&region=us-east-1"
curl -s --max-time 10 -o /dev/null -w "invalid region -> %{http_code}\n" "http://127.0.0.1:3997/api/secrets?path=/&region=moon-1"
curl -s --max-time 10 -o /dev/null -w "delete wrong-pass -> %{http_code}\n" -X DELETE -H "X-SSM-Passphrase: WRONG" "http://127.0.0.1:3997/api/secrets?region=us-east-1&name=/nope"
kill $SRV 2>/dev/null; wait $SRV 2>/dev/null
```
Expected: `GET / -> 200`; `/api/regions -> 200` with a JSON list; `list us-east-1 -> 200`; `invalid region -> 400`; `delete wrong-pass -> 401`.

- [ ] **Step 4: Manual browser check (user-driven)**

`SSM_UI_PASSPHRASE='…' npm start` → http://127.0.0.1:3000. Verify: region switch reloads the list; leaf-bold/path-muted rows; Reveal (island confirm → value read-only, syntax colored); Edit (auto-loads value, editable, syntax colored); Save (island passphrase → saved); Delete (island type-name + passphrase). Confirm `.memory/app.db` audit rows include `reveal`/`set`/`delete` with `region` and no decrypted value.

---

## Self-Review

**Spec coverage:**
- Dynamic Island UI → Task 13 (component) + 15 (state machine) + 7 (styles).
- Region switcher → Tasks 1–3 (backend), 8 (client), 10 (RegionSwitcher), 12 (Toolbar), 15 (wiring).
- Edit pre-fills current value (auto-load, audited) → Task 15 `onEdit` + reveal route (Task 2) + 17 (policy).
- Code editor with file-type colors → Tasks 6 (languageId) + 9 (CodeEditor).
- Path muted / leaf bold → Tasks 5 (splitParamName) + 11 (ParameterList) + 7 (styles).
- Better than modals → Tasks 14 (inline DetailPanel) + 15 (App) + 16 (remove modals).
- Aesthetic (Apple/Tailscale, shaded primary, neon) → Task 7 + frontend-design polish note in header.
- Tests → backend Tasks 1,2; frontend Tasks 5,6,10,11,13.

**Placeholder scan:** No TBD/TODO; every code step has complete code; "frontend-design polish" is an explicit instruction to enhance aesthetics within fixed interfaces, not an unfilled blank.

**Type/name consistency:** client fns `listSecrets(path,region)`, `revealSecret(name,region)`, `saveSecret({name,value,type},pw,region)`, `deleteSecret(name,pw,region)`, `getRegions()` match App usage; `createApp({getClient,db,passphrase,staticDir})` matches index.js + tests; `getClient(region)` used in routes; DynamicIsland `state.kind` values (`idle`/`revealConfirm`/`passphrase`/`deleteConfirm`/`busy`/`saved`/`error`) match every `setIsland` call in App; DetailPanel props match App; `splitParamName`/`languageIdForName` names consistent across utils, components, and tests.

**Note:** Phase 1 (Tasks 1–3) is independently shippable (backend gains region support; the old UI keeps working on the default region). Phases 2–4 deliver the new UI as a whole.
