# Admin UI Redesign — Design Spec

- **Date:** 2026-05-30
- **Status:** Approved (brainstorming), pending implementation plan
- **Builds on:** `docs/superpowers/specs/2026-05-30-frontend-design.md` (the existing admin UI)

## Overview

Replace the modal-based admin UI with a modern, polished master–detail interface
plus a "Dynamic Island" status/command pill, add an AWS **region switcher**, make
**Edit** pre-load the current (decrypted) value into a **code editor** with
syntax highlighting, and restyle the parameter list so the path is de-emphasized
and the leaf name is the focus. Backend gains per-request region support.

This is an enhancement of the working feature; the security core (gated reveal,
passphrase-gated mutations, no value/passphrase persisted) is preserved and
extended, not loosened beyond the explicit Edit decision below.

## Goals

- A refined master–detail layout with **no modal pop-ups**.
- A **Dynamic Island** pill that morphs across transient states (status, reveal
  confirm, passphrase entry, saving, saved, delete confirm, error).
- A **region switcher** (curated dropdown) that re-scopes all reads/writes.
- **Edit** auto-loads the decrypted current value (audited) into a **CodeMirror**
  editor with language colors chosen by file extension.
- Parameter list shows the **path muted, leaf bold**, grouped by parent path.
- An Apple-/Tailscale-influenced design system with a shaded (gradient) primary.

## Non-goals

- Multi-user/hosted deployment, auth sessions, HTTPS (still localhost single-user).
- In-UI audit-log viewer (backend keeps writing audit rows).
- A light theme (the design is dark; a light variant is future work).
- Listing AWS-enabled regions dynamically (curated static list is enough).

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Layout | Master–detail + Dynamic Island status/command pill; no modals (mockup "A") |
| Edit pre-fill | **Auto-load** the decrypted value into the editor on Edit, **audited as `reveal`**; Save still requires the passphrase |
| Region switcher | **Curated dropdown** of common regions; region passed **per request**; server builds/caches one SSM client per region |
| Code editor | **CodeMirror 6**, language chosen by file extension |
| List display | Flat list grouped by parent path; **path muted, leaf bold** |
| Aesthetic | Apple typography/spacing + Tailscale clean structure; **shaded/gradient primary**; neon accents on the island |

## Design system

Dark theme. Tokens defined once in `web/src/theme.css` and consumed everywhere.

- **Type:** `-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, system-ui, sans-serif`;
  monospace `ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace` for code and leaf names.
  Apple-like scale (12/13/14/18/22), tight headings, generous line-height for body.
- **Surfaces (layered):** base `#0B1020`, panel `#0F1730`, list `#0A0F1E`, editor `#06090F`;
  hairline borders `#1F2937`; soft shadows (`0 24px 60px rgba(0,0,0,.45)` for the shell).
- **Primary (shaded, not flat):** vertical gradient indigo→blue
  `linear-gradient(180deg,#3B82F6,#2563EB)` with a 1px top inner highlight; hover lifts one stop.
- **Neon accents (island/status):** blue `#60A5FA`, amber `#F59E0B`, green `#34D399`,
  red `#F87171`, each with a soft glow (`box-shadow: 0 0 10px <color>`).
- **Radii:** 10px controls, 14–16px panels/island. **Motion:** spring-like 180–240ms
  transitions for island morph and panel changes (Apple feel); respect `prefers-reduced-motion`.

## Layout

```
┌ Toolbar ──────────────────────────────────────────────────────────┐
│ SSM Secrets   [⌖ region ▾]      ◍ Dynamic Island (status)   ⌕search │
├──────────────────────────────┬────────────────────────────────────┤
│ ParameterList (grouped)      │ DetailPanel                         │
│  …/group/                    │  breadcrumb (muted) · leaf (bold)   │
│   leaf-a                     │  [type][version]                    │
│  ▸ leaf-b (selected)         │  [Reveal] [Edit] [Delete]           │
│   leaf-c                     │  ┌ CodeEditor (CodeMirror) ───────┐ │
│                              │  │ syntax-highlighted value       │ │
│                              │  └────────────────────────────────┘ │
└──────────────────────────────┴────────────────────────────────────┘
```

No modals. The right panel hosts the editor inline; transient gating/feedback happens in the island.

## Dynamic Island — state machine

A single top-center component (`DynamicIsland`) that morphs between states. The
active operation lives in App state; the island renders the current state and
emits events back.

| State | Shows | Emits |
|---|---|---|
| `idle` | `<region> · <count> parameters` (or "synced") | — |
| `revealConfirm` | "Reveal `<leaf>`?" + Confirm | `confirmReveal` |
| `passphrase` | passphrase input (for save/delete) | `submitPassphrase(value)` / `cancel` |
| `saving` / `deleting` | spinner + label | — |
| `saved` | "Saved v`<n>` ✓" (auto-returns to idle) | — |
| `deleteConfirm` | "Type `<leaf>` to delete" + passphrase | `confirmDelete(typedName, passphrase)` |
| `error` | mapped error message (auto-dismiss/idle) | — |

Transitions are driven by the operation flows below. The island never displays a
decrypted value or the passphrase characters (input is `type=password`).

## Operation flows

- **Browse:** list loads for the active region; selecting a row shows the detail
  header; the editor is empty/locked until Reveal or Edit. A toolbar **search box
  filters the loaded list client-side** by name/path (lightweight; re-introduced
  from the approved mockup — it was out of scope in the first build).
- **Reveal:** click → island `revealConfirm` → on confirm, `GET /value` →
  editor shows value **read-only** (highlighted); audit `reveal`. (Keeps the
  existing deliberate-peek gate.)
- **Edit:** click → **auto** `GET /value` (audit `reveal`) → editor becomes
  **editable** with the current value pre-loaded → on Save, island `passphrase`
  → `POST` with region + passphrase → audit `set` → island `saved`, list refreshes.
- **Create:** "New" → empty editable editor + a name field → Save → island
  `passphrase` → `POST` → audit `set`.
- **Delete:** click → island `deleteConfirm` (type leaf name + passphrase) →
  `DELETE` with region + passphrase → audit `delete` → selection cleared, list refreshes.

## Backend changes (region per request)

- New `src/server/regions.js`: exports `AWS_REGIONS` (curated list, e.g.
  us-east-1/2, us-west-1/2, eu-west-1/2, eu-central-1, ap-south-1,
  ap-southeast-1/2, ap-northeast-1, sa-east-1, ca-central-1), `DEFAULT_REGION`
  (`us-east-1`), and `isAllowedRegion(r)`.
- `createApp({ getClient, db, passphrase, staticDir })` — **signature change**:
  replaces the single `client` with `getClient(region) => SSMClient`.
- Routes (`routes/secrets.js`) read `region` from the request (**query param** for
  GET/DELETE; in the **JSON body** for POST), default to `DEFAULT_REGION`, validate
  via `isAllowedRegion` (invalid → 400), then call `getClient(region)`.
- New route `GET /api/regions` → `{ ok, data: { regions: AWS_REGIONS, default: DEFAULT_REGION } }`.
- `src/server/index.js`: builds `getClient` as a `region → SSMClient` cache (Map)
  using the existing `makeClient({ region, profile })`; passes it to `createApp`.

Credential resolution is unchanged; only the region varies per client. Decrypted
values and the passphrase remain un-logged and un-persisted; region is safe to log
in audit `meta` (it is not sensitive) — e.g. `logAudit(db, "set", name, { version, region })`.

## Frontend structure

```
web/src/theme.css                      design tokens (replaces ad-hoc styles.css rules)
web/src/App.jsx                        shell + active-operation state machine
web/src/api/client.js                  + region param on every call; + getRegions()
web/src/lib/paramName.js               splitParamName(name) -> { group, leaf }
web/src/lib/language.js                languageForName(name) -> CodeMirror language
web/src/components/Toolbar.jsx         brand + RegionSwitcher + search
web/src/components/RegionSwitcher.jsx  curated dropdown
web/src/components/ParameterList.jsx   grouped list; path muted, leaf bold (replaces TreeList)
web/src/components/DetailPanel.jsx     header (breadcrumb/badges) + actions + hosts CodeEditor
web/src/components/CodeEditor.jsx      CodeMirror 6 wrapper (value, language, readOnly, onChange)
web/src/components/DynamicIsland.jsx   morphing status/command pill (state machine above)
```

Removed: `RevealModal.jsx`, `EditModal.jsx`, `DeleteModal.jsx` (and their tests) —
their behavior moves into `DetailPanel` + `CodeEditor` + `DynamicIsland`.

## Dependencies (web)

CodeMirror 6: `codemirror` (meta) + `@codemirror/lang-json`, `@codemirror/lang-yaml`,
and `@codemirror/legacy-modes` (shell, properties/ini, etc.). A small custom dark
theme via `EditorView.theme` (no extra theme dependency). `languageForName` maps:
`.sh`→shell, `.ini`/`.conf`/`.dsn`→properties, `.json`→json, `.yaml`/`.yml`→yaml,
`.txt`/unknown→plain.

## Security model (updates)

- **Edit auto-load is a deliberate, audited reveal.** Opening Edit fetches the
  decrypted value (audited `reveal`) and shows it editable. This is the user's
  explicit choice; Save still requires the passphrase. Update
  `.claude/rules/secrets.md` to note Edit also reveals (audited).
- Mutations still require the server-verified passphrase (`SSM_UI_PASSPHRASE`);
  unchanged.
- Region is validated against the allowlist (no arbitrary client creation).
- Decrypted values and the passphrase are still never logged, persisted, or sent
  off `127.0.0.1`. Region is logged in audit meta (non-sensitive).

## Testing

Backend (`node --test`, supertest, injected `getClient`):
- region param flows to `getClient` (spy asserts the requested region); default region applied when omitted; invalid region → 400.
- `GET /api/regions` returns the list + default.
- existing reveal/set/delete behavior + "no value in audit" still hold (now with region in requests).

Frontend (Vitest + RTL):
- `splitParamName` and `languageForName` pure-unit tests (extensions → group/leaf, ext → language).
- `DynamicIsland` delete-confirm logic: confirm enabled only when typed name matches and passphrase present (ports the old DeleteModal test).
- `RegionSwitcher` selection calls `onChange` with the chosen region.

## Out of scope / risks

- Light theme; dynamic region discovery; audit-log viewer.
- CodeMirror adds bundle size (~tens of KB gzipped) — acceptable for a local tool.
- The island is a focused state component; keeping its state machine in one place
  (App or a `useOperation` hook) avoids scattering operation logic.
