# Phase 01 — `rememberUom_()` / `rememberUoms_()` in AdminConfig.gs

**Priority:** P2 · **Status:** pending · **Effort:** 1h · **Blocked by:** —
**Owns:** `apps/api/AdminConfig.gs`, `tools/offline-tests/harness.js`,
`tools/offline-tests/uom-autoadd.test.js` (new)

## Context links

- Template: `apps/api/Orders.gs:1438-1465` (`rememberCustomer_`)
- Lock helper: `apps/api/AdminConfig.gs:248-256` (`withConfigLock_`)
- Cache layers: `apps/api/Router.gs:259-288`, `apps/api/SheetsRepo.gs:43,84-122`
- Admin validator this must stay compatible with: `apps/api/AdminConfig.gs:60-77`
- Harness sandbox stubs: `tools/offline-tests/harness.js:216-268`

## Key insights

1. **Append, never sort.** `uomList[0]` is the default UOM for a new order line
   (`ViewsOrders.html:1822`) and a new product (`ViewsInventory.html:498`).
   `rememberCustomer_` sorts (`Orders.gs:1459`); copying that here would silently
   change both defaults. Append to the end.
2. **The per-request read memo can predate the lock.** `readAll_(SHEETS.CONFIG)`
   is memoized for the whole request (`SheetsRepo.gs:84-95`) and `readPublicConfig_`
   may already have populated it (`Router.gs:267`) before the lock was taken. Under
   the lock we must call `invalidateReadCache_(SHEETS.CONFIG)` first, else two
   concurrent saves read the same snapshot and the second clobbers the first.
3. **`invalidateReadCache_` does not exist in the offline harness.** `SheetsRepo.gs`
   is not loaded (`harness.js:265-268`). A bare call throws `ReferenceError`, which
   the function's own try/catch swallows → every test would pass-by-doing-nothing.
   Add the stub in this phase and prove the positive path with an assertion.
4. **Batch, don't loop.** An order has up to 50 lines (`ORDER_LIMITS.MAX_LINES`,
   `Config.gs:113`). One lock + one write per *save*, not per line.
5. **Fast path matters.** The common case is "every UOM already known". That case
   must not take the script lock at all, or every order save serializes on it.

## Requirements

Functional:
- `rememberUoms_(values)` — array in; appends every genuinely-new UOM in one write.
- `rememberUom_(value)` — single-value convenience wrapper, `rememberUoms_([value])`.
- Normalization: `text_()` trim → drop empty → drop longer than `UOM_LIMITS.MAX_LENGTH`
  → dedupe case-insensitively against each other and against the stored list.
- Cap the list at `UOM_LIMITS.MAX_LIST` entries; beyond that, silently skip.
- On write: `updateRecord_` then `invalidateConfigCache_()`.
- Missing `uomList` row → return quietly (do not create the row).

Non-functional:
- Never throws. Everything wrapped in try/catch → `console.error('rememberUom_: ' + err)`.
- Zero sheet reads and zero lock acquisitions when nothing is new.
- Output must satisfy `EDITABLE_CONFIG_KEYS.uomList.validate` (`AdminConfig.gs:60-77`):
  non-empty array, no empty items, no duplicates.

## Architecture

```js
/* placed next to withConfigLock_, after the Guards & Helpers banner */

/** Caps for auto-remembered UOMs. text_() alone allows 2000 chars
 *  (ORDER_LIMITS.MAX_TEXT) — far too long for a unit label; longest seeded
 *  value is 4 chars (Config.gs:334). MAX_LIST stops a scripted client from
 *  growing the config without bound. */
var UOM_LIMITS = { MAX_LENGTH: 20, MAX_LIST: 200 };

function rememberUom_(value) { rememberUoms_([value]); }

function rememberUoms_(values) {
  try {
    var candidates = normalizeUomCandidates_(values);
    if (!candidates.length) return;

    // Fast path: cached config, no sheet read, no lock.
    var fresh = filterUnknownUoms_(candidates, readPublicConfig_().uomList);
    if (!fresh.length) return;

    withConfigLock_(function () {
      invalidateReadCache_(SHEETS.CONFIG); // memo may predate this lock
      var row = findBy_(SHEETS.CONFIG, 'key', 'uomList');
      if (!row) return;

      var list = [];
      try { list = JSON.parse(row.value) || []; } catch (err) { list = []; }
      if (!Array.isArray(list)) return; // malformed config: leave it to the admin

      var add = filterUnknownUoms_(candidates, list);   // re-filter authoritatively
      if (!add.length) return;
      if (list.length + add.length > UOM_LIMITS.MAX_LIST) return;

      // Append only — uomList[0] is the default UOM in both forms. Never sort.
      updateRecord_(SHEETS.CONFIG, row._row,
                    { value: JSON.stringify(list.concat(add)) });
      invalidateConfigCache_();
    });
  } catch (err) {
    console.error('rememberUom_: ' + err);
  }
}

/** trim → drop empty / over-long → dedupe case-insensitively, order preserved. */
function normalizeUomCandidates_(values) { /* ... */ }

/** candidates not already present in `list` (case-insensitive, trimmed). */
function filterUnknownUoms_(candidates, list) { /* ... */ }
```

Why `AdminConfig.gs` and not `Orders.gs`: this is config-list maintenance, the same
concern as `EDITABLE_CONFIG_KEYS.uomList`, and both Products and Orders call it —
putting it in either caller would make the other depend on a domain file.
(`rememberCustomer_` living in `Orders.gs` is a pre-existing wart; not moved here.)

`AdminConfig.gs` grows from 256 → ~320 lines, still under the 200-line *guideline*
for new files and well under any split threshold for an existing one.

## Related code files

- Modify: `apps/api/AdminConfig.gs` (append helpers after `withConfigLock_`)
- Modify: `tools/offline-tests/harness.js` — add `invalidateReadCache_(name) {}` to
  the sandbox next to `invalidateConfigCache_() {}` (`harness.js:260`)
- Create: `tools/offline-tests/uom-autoadd.test.js`
- Create/delete: none

## Implementation steps

1. Add `UOM_LIMITS`, `rememberUom_`, `rememberUoms_`, `normalizeUomCandidates_`,
   `filterUnknownUoms_` to `AdminConfig.gs` under the "Guards & Helpers" banner
   (`AdminConfig.gs:217-219`), with the append-only rationale as a comment.
2. Add the `invalidateReadCache_` stub to `harness.js` sandbox (~line 260).
3. Create `tools/offline-tests/uom-autoadd.test.js` following `admin-config.test.js`
   conventions (`const H = require('./harness.js')`, numbered `console.log` sections).
4. Unit-test sections (call `env.rememberUom_` / `env.rememberUoms_` directly, read
   back `env.store.Config.find(c => c.key === 'uomList').value`):
   1. new UOM is appended **last**; `uomList[0]` unchanged
   2. known UOM → list byte-identical; `'cái'`, `' Cái '` → no change
   3. `''`, `null`, `undefined`, `'   '` → no change
   4. 21-char string → no change; 20-char string → appended
   5. `rememberUoms_(['Kg','kg','Tấn','Kg'])` → exactly `['…','Kg','Tấn']`, **one**
      `updateRecord_` call (spy by wrapping `env.updateRecord_`)
   6. no `uomList` row in the Config store → no throw, no row created
   7. malformed `value` (`'{oops'`) → no throw, row untouched
   8. result still passes `env.actionUpdateConfig_` validation round-trip
5. Run `node tools/offline-tests/uom-autoadd.test.js` → 0 failed.
6. Run the whole suite (see Success criteria) — nothing else may change.

## Todo list

- [ ] `UOM_LIMITS` + 4 functions in `AdminConfig.gs`
- [ ] `invalidateReadCache_` stub in `harness.js`
- [ ] `uom-autoadd.test.js` sections 1-8
- [ ] `node tools/offline-tests/uom-autoadd.test.js` → 0 failed
- [ ] Full offline suite still green

## Success criteria

- `node tools/offline-tests/uom-autoadd.test.js` → `0 failed`, ≥ 14 assertions.
- Batch test proves exactly **1** `updateRecord_` call for 4 input values.
- Known-only input proves **0** `updateRecord_` and **0** `LockService` calls
  (spy `env.LockService.getScriptLock`).
- `for f in tools/offline-tests/*.test.js; do node "$f" >/dev/null || echo "FAIL $f"; done`
  → no FAIL.

## Risk assessment

| Risk | L×I | Mitigation |
|---|---|---|
| Harness silently swallows `ReferenceError: invalidateReadCache_` → tests green, prod no-op | H×H | Stub added in this phase + a positive assertion that the value actually changed |
| Sorting sneaks in from the `rememberCustomer_` template → default UOM changes | M×H | Explicit test asserting `uomList[0]` is unchanged and the new item is last |
| Lost update between two concurrent saves | L×M | `withConfigLock_` + `invalidateReadCache_` inside the lock, re-filter after re-read |
| Script-lock contention added to every order save | M×M | Fast path returns before any lock when nothing is new |
| Config polluted by typos / scripted abuse | M×L | 20-char cap, 200-item cap, admin can delete items (`AdminConfig.gs:60-77` has no removal guard) |
| `AdminConfig.gs` past the 200-line guideline | H×L | Accepted: cohesive config-maintenance concern; splitting would scatter it |

## Security considerations

- No permission check: this is a side effect of an action that already enforced
  `manage_inventory` / `create_order` / `edit_order`. It writes only to the
  display-vocabulary `uomList` key, never to a behaviour flag, and never to the
  `Security` sheet.
- Input is attacker-controlled free text → length-capped (20), list-size-capped
  (200), JSON-serialized (no formula injection path: the value is written as a
  JSON string into one cell, not as a formula).
- Failure is silent by design and logged via `console.error` only.

## Next steps

Unblocks phase 02 (Products) and phase 03 (Orders), which may run in parallel.
