# Code Conventions

Small project, small team, no build step. Optimize for readability and for the next
person (or agent) opening the Apps Script editor a year from now.

---

## Layers

```
ui/*.html          →  google.script.run  →  server/*.gs (handlers)
                                                 ↓
                                        Permissions.gs  (gate)
                                                 ↓
                                        SheetsRepo.gs   (data)
                                                 ↓
                                        Google Sheets
```

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

## Handler shape

```js
function createOrder(payload) {
  const user = getCurrentUser();
  requirePermission(user, 'create_order');
  const clean = validateOrderPayload_(payload);   // throws on bad input
  // ... work ...
  return filterVisibleFields(user, result);
}
```

Rules:
- Never trust the client: recompute all money, ignore client-sent `createdBy`,
  `totalExVat`, `orderId`.
- Throw `new Error('Vietnamese message')` for user-facing failures. `Main.gs` turns
  it into a clean message; the client shows it as-is.
- Log technical detail with `console.error` — never leak it to the UI.

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
