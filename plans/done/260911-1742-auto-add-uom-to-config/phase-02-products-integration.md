# Phase 02 — Call `rememberUom_` from Products.gs

**Priority:** P2 · **Status:** pending · **Effort:** 30m · **Blocked by:** 01
**Owns:** `apps/api/Products.gs`, `tools/offline-tests/products.test.js`

## Context links

- `actionCreateProduct_` — `apps/api/Products.gs:105-127`
- `actionUpdateProduct_` — `apps/api/Products.gs:130-154`
- `cleanProductInput_` — `apps/api/Products.gs:283-308` (`uom = text_(src.uom)`, line 292)
- Call-site pattern to mirror — `apps/api/Orders.gs:437-441`
- Product form emits free text via datalist — `apps/web/ui/ViewsInventory.html:613-617`

## Key insights

1. The product form is already free-text (`input list="uom-options"`,
   `products-ui.test.js:187-188`), so this phase is the one that actually fires in
   real use today.
2. Both actions currently `return withProductLock_(function () { ... })` directly
   (`Products.gs:109`, `:135`). They must be restructured to capture the result,
   call `rememberUom_` **after the lock is released**, then return — exactly the
   shape `actionCreateOrder_` already uses (`Orders.gs:437-441`).
3. `clean.uom` may be `''` (uom is optional — `cleanProductInput_` never rejects a
   blank). `rememberUoms_` drops empties, so no caller-side guard is needed.
4. Only create/update. `actionDeleteProduct_` and `actionLookupProducts_` must not
   call it (delete removes nothing from the config by design; lookup is read-only).

## Requirements

- `actionCreateProduct_` calls `rememberUom_(clean.uom)` after `withProductLock_` returns.
- `actionUpdateProduct_` calls `rememberUom_(clean.uom)` after `withProductLock_` returns.
- A failure inside `rememberUom_` never changes the response (guaranteed by phase 01's
  try/catch; asserted here).
- Exactly 2 new call sites in this file.

## Architecture

```js
function actionCreateProduct_(user, payload) {
  requirePermission_(user, 'manage_inventory');
  var clean = cleanProductInput_(payload && payload.product);

  var result = withProductLock_(function () {
    /* unchanged body */
  });

  // Grow the UOM suggestion list from what people actually type, same spirit as
  // rememberCustomer_ for customerList. Outside the lock: withProductLock_ and
  // withConfigLock_ share one script lock, and this must never fail the save.
  rememberUom_(clean.uom);
  return result;
}
```

Same two-line change in `actionUpdateProduct_`.

## Related code files

- Modify: `apps/api/Products.gs` (two actions)
- Modify: `tools/offline-tests/products.test.js` (new numbered section at the end)
- Create/delete: none

## Implementation steps

1. `Products.gs:109` — change `return withProductLock_(...)` to
   `var result = withProductLock_(...);`, add `rememberUom_(clean.uom);`, `return result;`.
2. `Products.gs:135` — same change in `actionUpdateProduct_`.
3. Append a section to `products.test.js` (follow its numbered-section style,
   `products.test.js:13+`):
   - create with `uom: 'Kg'` (harness default `uomList: ['Cái','Cuộn']`,
     `harness.js:22`) → stored `uomList` becomes `['Cái','Cuộn','Kg']`
   - create with `uom: 'Cái'` → `uomList` unchanged
   - create with `uom: ''` → `uomList` unchanged
   - update an existing product's uom to `'Tấn'` → appended
   - `uomList[0] === 'Cái'` after all of the above
   - product create still succeeds when `rememberUom_` throws (monkeypatch
     `env.updateRecord_` to throw only for `SHEETS.CONFIG`, assert `productId` returned)
4. `node tools/offline-tests/products.test.js` → 0 failed.
5. Full suite green.

## Todo list

- [ ] `rememberUom_(clean.uom)` in `actionCreateProduct_`
- [ ] `rememberUom_(clean.uom)` in `actionUpdateProduct_`
- [ ] `products.test.js` section (6 assertions)
- [ ] `node tools/offline-tests/products.test.js` → 0 failed
- [ ] Full offline suite green

## Success criteria

- `grep -c "rememberUom_" apps/api/Products.gs` → `2`
- `node tools/offline-tests/products.test.js` → `0 failed`, count ≥ previous + 6
- Full suite: no FAIL
- Response shape of create/update is byte-identical to before (no new keys)

## Risk assessment

| Risk | L×I | Mitigation |
|---|---|---|
| Refactor of `return withProductLock_(...)` drops the return value | L×H | Existing product tests assert on `created.productId` and on the update response |
| Call placed *inside* the lock (nested script lock) | M×H | Explicit code shape above; review checks it sits after the closing `});` |
| Duplicate-code entry added to `actionDeleteProduct_` by mistake | L×M | `grep -c` = exactly 2 in Definition of done |

## Security considerations

Both actions already enforce `manage_inventory` (`Products.gs:106`, `:131`) before
`rememberUom_` is reachable. No new endpoint, no new permission, no response change.

## Next steps

Independent of phase 03 (disjoint files) — the two may run in parallel.
Both must land before phase 04.
