# Screenshots

Images referenced by the top-level `README.md`. Drop PNGs here with these names:

| File | Should show |
|---|---|
| `admin-ui.png` | Main master–detail view — grouped list with a `SecureString` row (lock + amber) and a `String` row (neutral), the Dynamic Island, region switcher, and a selected parameter's detail header (breadcrumb + type badge + actions). |
| `region-filter.png` | The region switcher **open**, with the type-to-filter box and the list of regions fetched from your account. |
| `create-type.png` | The **New** view — name field, the type selector (SecureString / String / StringList), and the CodeMirror editor showing syntax highlighting. |

## How to capture

```bash
npm run build
SSM_UI_PASSPHRASE=demo PORT=4123 NODE_ENV=production node src/server/index.js
# open http://127.0.0.1:4123 in a browser at ~1440×900 and screenshot the views above
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
