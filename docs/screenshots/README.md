# Screenshots

Images referenced by the top-level `README.md`. Drop PNGs here with these names:

| File | Should show |
|---|---|
| `admin-ui.png` | Main master–detail view — grouped list with a `SecureString` row (lock + amber) and a `String` row (neutral), the Dynamic Island, region switcher, and a selected parameter's detail header (breadcrumb + type badge + actions). |
| `region-filter.png` | The region switcher **open**, with the type-to-filter box and the list of regions fetched from your account. |
| `create-type.png` | The **New** view — name field, the type selector (SecureString / String / StringList), and the CodeMirror editor showing syntax highlighting. |

## How to capture

These three PNGs are produced by [`scripts/screenshots.mjs`](../../scripts/screenshots.mjs), which
boots the prod server, drives the UI headless at 1440×900, **masks** every path and ~52% of each
name, then writes the files here — so no real path or full name is ever committed:

```bash
npm run build                                   # the script serves web/dist
npm install --no-save playwright && npx playwright install chromium
SSM_UI_PASSPHRASE=demo node scripts/screenshots.mjs
```

Capturing by hand instead? Build, start the prod server, open the views above at ~1440×900 — then
mask the paths/names yourself before committing (see the safety note below).

```bash
npm run build
SSM_UI_PASSPHRASE=demo PORT=4123 NODE_ENV=production node src/server/index.js
```

## ⚠️ Safety — do NOT screenshot a revealed value

Never capture the editor while a parameter's value is **revealed or being edited** — that would
commit a decrypted secret into the repo. Safe states only:

- the **list** and a parameter's **detail header** in its idle state ("Reveal to view the value…"),
- the **region** dropdown,
- the **New / create** view — and for that shot, type a throwaway name and **fake** value
  (e.g. `/demo/example.json` → `{ "example": true }`) so no real secret is shown.

Also consider whether your real **parameter names** are OK to publish; use a demo path prefix or a
non-production account if not.
