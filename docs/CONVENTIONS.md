# Code Conventions

Small project, small team, no build step. Optimize for readability and for the next
person (or agent) opening the Apps Script editor a year from now.

---

## Layers

```
apps/web/ui/*.html  →  google.script.run  →  apps/web/Main.gs  (api* handlers)
                                                   ↓
                                             ApiClient.gs      (adds actor + secret)
                                                   ↓  HTTPS
                                             apps/api/Router.gs (verifies secret)
                                                   ↓
                                             Auth.gs → Permissions.gs  (gate)
                                                   ↓
                                             SheetsRepo.gs     (data)
                                                   ↓
                                             Google Sheets
```

Adding an API action means two edits: a handler in `getActions_()` on the API side,
and an `api*` wrapper in `apps/web/Main.gs`. Push the API first — see SETUP.md.

- Business logic **never** calls `SpreadsheetApp` directly. Always via `SheetsRepo.gs`.
- `SheetsRepo.gs` contains **no** business or permission logic.
- Every public handler is: `auth → permission → validate → act → return`.

## Naming

- Files: `PascalCase.gs`, `PascalCase.html`.
- Functions: `camelCase`. Public handlers use verb-first names (`listOrders`,
  `createOrder`, `changeOrderStatus`).
- Constants: `UPPER_SNAKE` in `Config.gs`.
- Sheet column keys: `camelCase` in code, matching the header names in `DATA_MODEL.md`.
- Private helpers: prefix with `_` (`_buildLineId`).

## The trailing underscore rule (read this one twice)

In Apps Script, **every global function without a trailing underscore is a public
endpoint.** Any signed-in user can open the browser console and call it:

```js
google.script.run.readAll('Users')      // would dump every user + permission
google.script.run.deleteRow('Orders', 2) // would delete a row
```

A trailing underscore makes a function unreachable from `google.script.run` while
still callable from other server files and from HTML templates.

**Therefore:** every server function gets a trailing underscore, except

| Exception | Why |
|-----------|-----|
| `doGet` | Google calls it |
| `api*` (e.g. `apiGetSession`) | deliberate client endpoints — each one gates itself |
| `setupMilestone1` | must appear in the editor's Run dropdown; guarded by `guardSetup_()` |
| `doPost` (API) | Google calls it; it verifies the shared secret first |

Before adding any function, ask: *should a logged-in employee be able to call this
directly?* If no — and it is almost always no — add the underscore.

## Handler shape

```js
function apiCreateOrder(payload) {
  const user = getCurrentUser_();
  requirePermission_(user, 'create_order');
  const clean = validateOrderPayload_(payload);   // throws on bad input
  // ... work ...
  return filterVisibleFields_(user, result);
}
```

Wrap it with `handle_()` in `Main.gs` so the client always receives
`{ok: true, data}` or `{ok: false, error}`.

Rules:
- Never trust the client: recompute all money, ignore client-sent `createdBy`,
  `totalExVat`, `orderId`.
- Throw `new Error('Vietnamese message')` for user-facing failures. `Main.gs` turns
  it into a clean message; the client shows it as-is.
- Log technical detail with `console.error` — never leak it to the UI.

## Never name a helper after a native Sheet method

`SheetsRepo.gs` exposes `appendRecord_` / `updateRecord_` / `deleteRecord_` — not
`appendRow_` / `deleteRow_`. That is deliberate: `Sheet.appendRow()` and
`Sheet.deleteRow()` are real Google methods, and a helper sharing the name invites
a search-and-replace or a tired reader to turn `sheet.appendRow(row)` into
`sheet.appendRow_(row)`, which fails at runtime with
`TypeError: sheet.appendRow_ is not a function`.

This already happened once (2026-08-15). If you ever bulk-rename functions in this
repo, anchor the pattern so it cannot match after a dot, and then check:

```bash
grep -rnoE '\.[a-zA-Z][A-Za-z0-9]*_\(' src/   # must return nothing
```

## Sheets performance

- Read once with `getDataRange().getValues()`, work in memory, write once with
  `setValues()`. No cell-by-cell loops.
- Use `CacheService` for the `Config` sheet and the current user's permissions
  (short TTL, 60–300s). Invalidate the cache when the Admin edits users or config.
- Any write that appends rows or allocates an ID takes a `LockService` script lock:
  ```js
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { /* ... */ } finally { lock.releaseLock(); }
  ```

## Money and dates

- Money: integer VND. Round at the **line** level, then sum. Never `parseFloat`
  a formatted string.
- Dates: store real `Date` objects, not strings. Timezone `Asia/Ho_Chi_Minh`
  (set in `appsscript.json`).

## Frontend

- One `google.script.run` Promise wrapper, one error handler. No `try/catch` scattered
  around the views.
- Permissions received from the server are a **UI hint only**.
- No inline `onclick=` attributes — attach listeners in `App.html`.
- No `localStorage` for anything security-related.
- Chart.js from CDN is the only external dependency. Adding another needs a reason.

## Git

- Commit `.clasp.json.example`, never `.clasp.json`.
- Never commit real customer data, Sheet IDs, or exported reports.
- One commit per milestone step, message in English, imperative mood.

## Testing

There is no test framework in Apps Script. Instead:
- Each milestone ships a manual checklist in Vietnamese (see `MILESTONES.md`).
- Test with **two** accounts: the Admin, and a limited employee account.
- Test on a real phone browser, not just a desktop narrow window.
