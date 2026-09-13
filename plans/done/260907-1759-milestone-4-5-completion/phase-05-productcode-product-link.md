# Phase 5 — `OrderLines.productCode` ↔ `Products` link

## Context links
- Exit criterion this closes: `docs/MILESTONES.md:184` — "Product CRUD works; `OrderLines.productCode` can link to a product"
- Schema intent: `docs/DATA_MODEL.md:79` — "`productCode` … **optional link** to `Products.code`"
- Products schema: `docs/DATA_MODEL.md:128` §5, `apps/api/Config.gs:61`
- **Open question Q5 (blocking):** `docs/OPEN_QUESTIONS.md:105-113`
- Explicit 5.1 scope exclusion: `apps/api/Products.gs:26-28`

## Overview
- **Priority:** P2 · **Status:** ✅ COMPLETE · **Effort:** 3–4h (link only; auto-deduct is NOT in this estimate) (actual: ~3.5h)
- **Blocked by:** the **Q5 decision**. Not blocked by Phases 3/4 in logic — only in file access if it needs new `Config.gs` MSG entries.
- **Blocks:** Phase 6.
- This gap is **not in the source audit at all**. It was found by tracing `productCode` through the UI.

## Key insights (verified)
- `productCode` on the order line is a **free-text `<input>`**: `apps/web/ui/ViewsOrders.html:2061` renders `field('Mã hàng', '<input class="l-productCode" ...>')`, read back at `:2596`. There is **zero** `listProducts` / `apiListProducts` usage in `ViewsOrders.html` — the two subsystems are entirely disconnected.
- So `MILESTONES.md:184`'s "can link to a product" is currently **unmet**, even though `Products.gs` and `ViewsInventory.html` are both complete. The audit reported M5 as blocked on a non-existent missing file and missed this actual gap.
- `productCode` is already permission-filtered (`ViewsOrders.html:1800-1804,1826`: gated by `fieldAllowed_('productCode')` / `has(line,'productCode')`). Any picker must respect the same gate — a role that cannot see `productCode` must not get a picker.
- `DATA_MODEL.md:79` says **optional** link. Existing `OrderLines` rows hold arbitrary codes (`710004795`, `Q4695359`) that may not exist in `Products`. **A hard FK constraint would break editing existing orders.** Backwards compatibility requires soft linking.
- Stock deduction is explicitly out of scope for 5.1 by design (`Products.gs:26-28`: "stockQty is a plain, manually-edited number: nothing in [orders] adjusts it — out of scope for 5.1"). Do not quietly reintroduce it here.
- Reading products from the order form needs a product read. `actionListProducts_` is gated on `manage_inventory` (`Products.gs:55`) — and a **sales** user has `manage_inventory: false` (`Config.gs:256-262` warehouse has it, sales does not). **Reusing `listProducts` for the picker would deny the picker to exactly the people who create orders.** This is the central design problem of the phase.

## Decision gate — Q5 must be answered first

**Q5 (`OPEN_QUESTIONS.md:105`): does `Products.stockQty` decrease automatically when an order reaches a status, or is stock adjusted manually?**

- **Q5 = manual (recommended, and the current code's assumption):** this phase is scoped to *lookup + autocomplete + soft validation*. 3–4h. YAGNI holds; `Products.gs:26-28` already documents manual as the design.
- **Q5 = automatic:** this phase grows by 8–12h and becomes its own milestone-sized task — it needs a trigger status, a reversal rule for cancellation/rejection, idempotency (a status can be re-entered), and interaction with the M3 approval state machine. **Do not fold that into this phase.** Split it out as 5.5 and re-plan.

Everything below assumes **Q5 = manual**.

## Requirements
- FR1: When entering a line, the user can search the product catalogue by code or name and pick one; picking fills `productCode`, and `uom` / `unitPrice` as defaults.
- FR2: A hand-typed code that matches no product is **still accepted** (soft link, per `DATA_MODEL.md:79`), with a non-blocking hint.
- FR3: Existing orders with unmatched codes open, edit, and save unchanged.
- FR4: `stockQty` is not modified by any order operation.
- NFR1: Picker respects `fieldAllowed_('productCode')`.
- NFR2: A user who can create orders must get the picker without being granted `manage_inventory`.
- NFR3: No extra sheet read on list rendering — lookup is on-demand, per line edit.

## Architecture / data flow
```
ViewsOrders.html  line editor, "Mã hàng" field
  │  gate: fieldAllowed_('productCode')                      (:1804 existing)
  │  user types ≥2 chars → debounced lookup
  ▼
Main.gs  apiLookupProducts(q)                                 ← NEW pass-through
  ▼
Router.gs  'lookupProducts' → actionLookupProducts_           ← NEW registry entry
  ▼
Products.gs  actionLookupProducts_(user, payload)             ← NEW action
   requirePermission_(user, 'create_order')   // NOT manage_inventory — see below
   → reuse the existing search/filter of actionListProducts_ (:54)
   → active products only, capped result count
   → return MINIMAL shape: {code, name, uom, lastPrice}
     ── no stockQty, no minStock, no note ──
  ▼
client fills .l-productCode (+ uom, unitPrice as editable defaults)
save path unchanged: ViewsOrders.html:2596 → updateOrder → Orders.gs
                     (no Products write anywhere)
```

**Why a new action instead of reusing `listProducts`:** `actionListProducts_` requires `manage_inventory` (`Products.gs:55`), which order creators (`sales` preset, `Config.gs:250-256`) do not have. Loosening `actionListProducts_`'s gate would expose `stockQty`/`minStock`/`lastPrice` and the full paginated catalogue to every order creator. A separate action with a narrower permission **and a narrower response shape** is the smaller change and the safer one. Do not relax `Products.gs:55`.

**Permission choice:** `create_order`. Rationale — the capability is "fill in an order line", which is exactly what `create_order` (and `edit_order`) authorise. Accept either: `create_order || edit_order`. No new permission key (YAGNI, and adding one to `PERMISSION_KEYS` changes every stored user's `permissions` JSON on next write).

## Related code files
**Modify**
- `apps/api/Products.gs` — new `actionLookupProducts_` (reuse `compareProductsByCode_`:227, `buildProductResponse_`:199 shape trimmed)
- `apps/api/Router.gs` — 1 registry entry near `:197-201`
- `apps/web/Main.gs` — 1 pass-through near `:293`
- `apps/web/ui/ViewsOrders.html` — picker on the `Mã hàng` field (`:2061`), read-back unchanged (`:2596`)
- `apps/api/Config.gs` — `MSG` entry only if a hint string is needed; **`BUILD` bump** (`:18`) ⇒ if Phase 4 is in flight, serialize behind it
- `tools/offline-tests/products.test.js`, `tools/offline-tests/orders-ui.test.js`

**Do not modify:** `apps/api/Config.gs` `HEADERS` (`:61`, `:97`) — no schema change. `Products.gs:55` gate. Any `stockQty` write path.

## Implementation steps
1. **Tests first**, `products.test.js`:
   - `actionLookupProducts_` returns matches by code prefix and by name substring
   - inactive products excluded
   - response shape contains **no** `stockQty` / `minStock` (money/stock leak guard)
   - a user with `create_order` but `manage_inventory: false` **succeeds** (the `sales` preset case)
   - a user with neither is refused
   - result count is capped
2. `orders-ui.test.js`: line editor still renders when `productCode` is not allowed (no picker, no crash); markup balanced and escaped with a picker present.
3. Implement `actionLookupProducts_` in `Products.gs`, reusing the existing search predicate from `actionListProducts_` (`:54-94`) rather than writing a second matcher (DRY).
4. Register in `Router.gs`; add the `Main.gs` pass-through mirroring `apiListProducts` (`:293`).
5. `ViewsOrders.html`: debounced (~250ms) lookup on the `Mã hàng` input, suggestion list, click-to-fill. On pick, set `uom` and `unitPrice` as **editable defaults** — never lock them; the reference workbook has per-order price variation.
6. Unmatched code → small non-blocking hint ("Mã hàng không có trong kho"). Save must still succeed.
7. Verify an existing order whose `productCode` matches nothing still opens/edits/saves.
8. Bump `BUILD`. Run all suites.

## Todo
- [x] **Q5 answered and recorded in `OPEN_QUESTIONS.md`** (flip 🟡 → ✅ manual stock deduction)
- [x] Failing assertions written first (products.test.js + orders-ui.test.js)
- [x] `actionLookupProducts_` gated on `create_order`/`edit_order`, minimal response shape (verified: no stockQty/minStock in response)
- [x] `Router.gs` + `Main.gs` wiring (2 registry entries + pass-throughs)
- [x] Picker in `ViewsOrders.html`, respects `fieldAllowed_('productCode')` (debounced autocomplete with 250ms)
- [x] Unmatched code still saveable (soft link with non-blocking hint "Mã hàng không có trong kho")
- [x] Existing-order regression checked (existing orders with unmatched codes still open/edit/save)
- [x] No `stockQty` write introduced anywhere (grep verified)
- [x] `BUILD` bumped ('api-2026-09-07c-product-lookup'), all 18 suites green (946+ assertions)

## Success criteria
- A `sales` user (no `manage_inventory`) types 3 characters in `Mã hàng` and gets suggestions.
- Picking one fills code + uom + unit price, all still editable.
- Typing an unknown code saves fine with a hint.
- An order created before this phase opens and saves with no change to its `productCode`.
- `grep` proves no order action writes `stockQty`.
- `MILESTONES.md:184` truthfully tickable.

## Risk assessment
| Risk | L×I | Mitigation |
|---|---|---|
| Loosening `actionListProducts_`'s gate to serve the picker → leaks `stockQty`/`minStock`/catalogue to all order creators | **High** × **High** | Separate `actionLookupProducts_` with a narrower gate **and** trimmed response; assertion that the shape omits stock fields |
| Hard FK validation added → existing orders with unmatched codes become unsaveable | Med × **High** | Soft link is a stated requirement (FR2/FR3) and `DATA_MODEL.md:79` says "optional"; explicit regression step 7 |
| Auto-deduct scope creep into this phase | Med × **High** | Q5 decision gate up front; auto-deduct is split out as 5.5 with its own 8–12h estimate |
| Lookup on every keystroke → Apps Script quota / latency | Med × Med | ≥2-char minimum + 250ms debounce + capped results; on-demand only, never on list render |
| Overwriting a user's typed `unitPrice` on pick | Med × Med | Fill only when the field is empty, or fill as an editable default and never re-fill |
| `BUILD` / `Config.gs` collision with Phase 4 | Med × Low | Serialize behind Phase 4 if a `MSG` entry is needed |

## Security considerations
- Response shape is the control here, not just the permission. `buildProductResponse_` (`Products.gs:199`) returns `stockQty`/`minStock`/`lastPrice`; the lookup response must be built separately, not reused wholesale.
- `lastPrice` is arguably money data. If any order-creating role's `visible_fields` excludes prices (`warehouse` uses `DEFAULT_VISIBLE_FIELDS`, `Config.gs:181-186`, which has no money columns), the lookup must omit `lastPrice` for that role — run it through the same `fieldVisible_` logic rather than trusting the client to hide it.
- `requirePermission_` stays the literal first line of the new action, per codebase convention.

## Next steps
→ Phase 6 (M5 live verification + sign-off).
