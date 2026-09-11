# Phase 03 — Call `rememberUoms_` from Orders.gs

**Priority:** P2 · **Status:** pending · **Effort:** 30m · **Blocked by:** 01
**Owns:** `apps/api/Orders.gs`, `tools/offline-tests/orders-crud.test.js`

## Context links

- Create call site — `apps/api/Orders.gs:437-441` (`bumpOrdersVersion_`, `rememberCustomer_`)
- Update call site — `apps/api/Orders.gs:731-735` (same pair)
- Line validator — `apps/api/Orders.gs:1313-1350` (`uom: text_(line.uom)`, line 1342)
- Hidden-field clamp — `apps/api/Orders.gs:1255-1267` (line 1261 blanks `uom`)
- Line cap — `ORDER_LIMITS.MAX_LINES = 50`, `apps/api/Config.gs:112-116`

## Key insights

1. `clean.lines` is the validated array (`Orders.gs:1295-1297`); each element has a
   `uom` string. Pass the whole mapped array to `rememberUoms_` — **one** lock and
   **one** config write per save, not one per line (up to 50 lines).
2. Place it next to the existing `rememberCustomer_` calls, i.e. **after**
   `withOrderLock_` has returned and after `bumpOrdersVersion_()` — same ordering,
   same "convenience, never fails the order" contract (`Orders.gs:1436`).
3. `clampHiddenLineFields_` sets `line.uom = ''` for a role whose `visible_fields`
   excludes `uom` (`Orders.gs:1261`). Those blanks are dropped by
   `normalizeUomCandidates_` — correct: a role that cannot see the field must not
   be able to grow the list. No extra guard needed, but it is worth a test.
4. On update, lines the user did not touch are re-validated and re-sent too, so
   their (already known) UOMs land in the candidate list — the fast path in
   `rememberUoms_` makes that free.
5. **Today the order form cannot emit an off-list UOM** (`<select class="l-uom">`,
   `ViewsOrders.html:2193-2200`). This phase is therefore API-level correctness
   plus preparation for phase 03b. State that in the commit message so nobody
   later "fixes" it as dead code.

## Requirements

- `actionCreateOrder_` calls `rememberUoms_(clean.lines.map(...uom))` after the lock.
- `actionUpdateOrder_` does the same.
- Never throws into the order path; response unchanged.
- Exactly 2 new call sites in this file.

## Architecture

```js
  bumpOrdersVersion_();
  rememberCustomer_(clean.customer);
  // One batched call for the whole order: a 50-line order must not take the
  // config lock 50 times. rememberUoms_ dedupes and no-ops when nothing is new.
  rememberUoms_(clean.lines.map(function (l) { return l.uom; }));
  return buildOrderResponse_(user, findOrderRow_(result));
```

Identical insertion at `Orders.gs:734`.

## Related code files

- Modify: `apps/api/Orders.gs` (after `:440` and after `:734`)
- Modify: `tools/offline-tests/orders-crud.test.js` (new numbered section)
- Create/delete: none

## Implementation steps

1. Insert the batched call after `rememberCustomer_` in `actionCreateOrder_`.
2. Insert the same after `rememberCustomer_` in `actionUpdateOrder_`.
3. Append a section to `orders-crud.test.js` (harness default `uomList: ['Cái','Cuộn']`,
   `harness.js:22`):
   - create an order with lines `uom: 'Kg'` and `uom: 'Cuộn'` → stored `uomList`
     = `['Cái','Cuộn','Kg']` (one append, no reorder)
   - create a 3-line order with `'Tấn','tấn','Tấn'` → `'Tấn'` appended once
   - update an order, changing one line's uom to `'Thùng'` → appended
   - line with `uom: ''` → nothing appended
   - a user whose `visible_fields` excludes `uom` (see the restricted-user pattern
     in `orders-permissions.test.js`) → nothing appended, order still saves
   - `uomList[0] === 'Cái'` throughout
4. `node tools/offline-tests/orders-crud.test.js` → 0 failed.
5. Full suite green (`orders-permissions`, `orders-approvestatus`, `export*`,
   `stats` all read orders — none should shift).

## Todo list

- [ ] batched `rememberUoms_` in `actionCreateOrder_`
- [ ] batched `rememberUoms_` in `actionUpdateOrder_`
- [ ] `orders-crud.test.js` section (6 assertions)
- [ ] `node tools/offline-tests/orders-crud.test.js` → 0 failed
- [ ] Full offline suite green

## Success criteria

- `grep -c "rememberUoms_" apps/api/Orders.gs` → `2`
- One `updateRecord_` on `Config` per order save at most (spy assertion)
- `node tools/offline-tests/orders-crud.test.js` → `0 failed`
- Full suite: no FAIL; order response shape unchanged

## Risk assessment

| Risk | L×I | Mitigation |
|---|---|---|
| Per-line call instead of batched → 50 lock/write cycles, request timeout | M×H | Batched signature is the only one Orders uses; spy test asserts ≤1 write |
| Placed inside `withOrderLock_` → nested script lock | M×H | Insert strictly after the existing `rememberCustomer_` line |
| Restricted role grows the list via a clamped-blank field | L×M | Clamp already blanks it (`Orders.gs:1261`); covered by a test |
| Looks like dead code (UI can't reach it) and gets removed later | M×M | Comment + commit message; phase 03b closes the gap |
| `DevSeed.gs` bulk seeding pollutes a dev config | L×L | Dev-only; admin can delete items |

## Security considerations

`create_order` / `edit_order` + ownership are enforced long before this runs
(`Orders.gs:371-382`, `:560-620`). Field-level visibility is already clamped
(`Orders.gs:1255-1267`), so a role blind to `uom` contributes nothing. Values are
length- and count-capped inside `rememberUoms_` (phase 01).

## Next steps

Unblocks phase 04. Phase 03b is gated on the user's decision (see `plan.md`).
