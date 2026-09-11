---
title: "Auto-add new UOM to Config.uomList"
description: "A UOM typed on a product or order line that is not yet in Config.uomList is remembered automatically, the same way rememberCustomer_ already grows customerList."
status: complete
priority: P2
effort: 3h20
branch: main
tags: [backend, config, products, orders, uom, apps-script]
created: 2026-09-11
completed: 2026-09-11
commit: 925bd94
---

# Auto-add new UOM to Config.uomList

Today `uom` is stored free-text on products (`Products.gs:292` → `text_(src.uom)`)
and on order lines (`Orders.gs:1342` → `text_(line.uom)`), but nothing ever feeds
it back into `Config.uomList`. `rememberCustomer_` (`Orders.gs:1438-1465`) already
solves exactly this problem for `customerList`; this plan clones that idea for UOM
with the concurrency/perf holes closed.

No new sheet, no new permission, no new MSG constant, no migration.

## Verified baseline (re-grepped 2026-09-11)

| Fact | Location |
|---|---|
| `rememberCustomer_` — template: try/catch, read Config row, dedupe ci, write, invalidate | `apps/api/Orders.gs:1438-1465` |
| Called **after** the lock closes, never inside it | `Orders.gs:440` (create), `Orders.gs:734` (update) |
| `withConfigLock_` — script lock + `MSG.CONFIG_LOCK_BUSY` | `apps/api/AdminConfig.gs:248-256` |
| `uomList` admin validator (trim, dedupe, reject empty item) | `AdminConfig.gs:60-77` |
| `uomList` items **can be deleted** by admin (no removal guard, unlike `statusList`) | `AdminConfig.gs:60-77` vs `:225-241` |
| `invalidateConfigCache_` (120s CacheService layer) | `apps/api/Router.gs:285-288` |
| `readPublicConfig_` — cache-first, parses JSON arrays | `Router.gs:259-283` |
| `readAll_` memo is **per-request**, cleared only by a write to that sheet | `apps/api/SheetsRepo.gs:84-122, 43` |
| `invalidateReadCache_(sheetName)` exists; **SheetsRepo.gs is NOT loaded by the offline harness** | `SheetsRepo.gs:43`; `tools/offline-tests/harness.js:265-268` |
| Product create/update write `clean.uom` verbatim | `apps/api/Products.gs:113-123, 141-150` |
| Product input cleaner: `uom = text_(src.uom)`, no allowlist check | `Products.gs:292` |
| Order line validator: `uom: text_(line.uom)`, no allowlist check | `Orders.gs:1342` |
| Hidden-field clamp blanks `line.uom` for roles without `uom` visibility | `Orders.gs:1261` |
| `text_()` caps at `ORDER_LIMITS.MAX_TEXT` = **2000 chars** | `Orders.gs:1552-1555`, `Config.gs:112-116` |
| **`uomList[0]` is the default UOM for a new order line** | `apps/web/ui/ViewsOrders.html:1822` |
| **`uomList[0]` is the default UOM for a new product** | `apps/web/ui/ViewsInventory.html:498` |
| Product form uses **input + `<datalist id="uom-options">`** → free text reaches the API | `ViewsInventory.html:613-617`, asserted `products-ui.test.js:187-188` |
| Order line form uses a **`<select class="l-uom">`** built only from `uomList()` | `ViewsOrders.html:2193-2200` |
| Product-picker autofill sets `line.uom` from the product… | `ViewsOrders.html:2313` |
| …but `collect()` reads the `<select>` back, so an off-list UOM is silently dropped | `ViewsOrders.html:2815` |
| `session.config` is a **page-load snapshot** (`T.config()`), not live | `apps/web/ui/App.html:113`, `apps/web/Main.gs:95` |
| Seeded default `uomList` is usage-ordered, **not alphabetical** | `apps/api/Config.gs:334` |

## Two findings that shape the design

1. **Never sort the list.** `rememberCustomer_` sorts (`Orders.gs:1459`). Copying
   that here would reorder `uomList` and thereby change the *default UOM* of every
   new order line (`ViewsOrders.html:1822`) and new product (`ViewsInventory.html:498`).
   `rememberUom_` must **append only**.
2. **The order form can't produce a new UOM today.** `.l-uom` is a `<select>`
   populated from `uomList` (`ViewsOrders.html:2193`). Even the product-picker
   autofill is lost on save (`:2313` sets state, `:2815` re-reads the DOM). So
   requirement #2 is only reachable from direct API callers unless phase 03b runs.
   → **Decision needed (see below).**

## Data flow

```
actionCreateProduct_/actionUpdateProduct_ (clean.uom)
actionCreateOrder_/actionUpdateOrder_     (clean.lines[].uom)
        │  (after the domain lock is released)
        ▼
rememberUoms_(values)                      AdminConfig.gs (new)
  normalize: trim → drop empty → drop >20 chars → dedupe case-insensitively
        │
  fast path: all already in readPublicConfig_().uomList  → return (no lock, no write)
        │ else
  withConfigLock_:
     invalidateReadCache_(SHEETS.CONFIG)   ← memo may predate the lock
     re-read authoritative row, re-filter, cap at 200 items
     append (NO sort) → updateRecord_ → invalidateConfigCache_()
        │
  any throw → console.error, swallowed (convenience, never fails the save)
```

## Phases

| # | Phase | Owns | Blocked by | Effort | Status |
|---|-------|------|-----------|--------|--------|
| 01 | [rememberUom_ + harness stub](phase-01-remember-uom-function.md) | `apps/api/AdminConfig.gs`, `tools/offline-tests/harness.js`, `tools/offline-tests/uom-autoadd.test.js` (new) | — | 1h | pending |
| 02 | [Products.gs integration](phase-02-products-integration.md) | `apps/api/Products.gs`, `tools/offline-tests/products.test.js` | 01 | 30m | pending |
| 03 | [Orders.gs integration](phase-03-orders-integration.md) | `apps/api/Orders.gs`, `tools/offline-tests/orders-crud.test.js` | 01 | 30m | pending |
| 03b | [Order line UOM input (optional)](phase-03b-order-line-uom-input.md) | `apps/web/ui/ViewsOrders.html`, `tools/offline-tests/orders-ui.test.js` | 03 + user decision | 40m | blocked (decision) |
| 04 | [Edge cases + full suite](phase-04-edge-cases-and-tests.md) | `tools/offline-tests/uom-autoadd.test.js`, `tools/offline-tests/README.md` | 02, 03 | 40m | pending |

**File ownership:** 02 and 03 touch disjoint files and may run in parallel after
01. 01 and 04 both own `uom-autoadd.test.js` — 04 runs last, so no overlap. 03b
is the only phase touching `apps/web/`.

## Key dependencies / constraints

- **No build step.** Apps Script. The compile check is running the offline tests:
  `for f in tools/offline-tests/*.test.js; do node "$f" >/dev/null || echo "FAIL $f"; done`
- **The harness does not load `SheetsRepo.gs` nor `Router.gs`** (`harness.js:265-268`);
  `readAll_`/`updateRecord_`/`readPublicConfig_`/`invalidateConfigCache_` are sandbox
  stubs (`harness.js:216-260`). `invalidateReadCache_` has **no stub** — phase 01
  must add one or every `rememberUoms_` call silently dies in its own try/catch.
- **Append only, never sort** (see finding 1).
- **Never throw.** A failure to remember a UOM must never fail a product or order
  save — same contract as `rememberCustomer_` (`Orders.gs:1436`).
- **Call outside the domain lock.** `withProductLock_`/`withOrderLock_`/`withConfigLock_`
  all take the *same* `LockService.getScriptLock()`; nesting is not worth the risk.
- Vietnamese UI copy only where new copy is needed (none in 01-04).

## Definition of done

1. `grep -n "rememberUom" apps/api/*.gs` shows the definition in `AdminConfig.gs`
   and exactly 4 call sites (Products create/update, Orders create/update).
2. Creating a product with `uom: 'Kg'` (not in `uomList`) leaves `Kg` **appended
   last** in the stored `Config.uomList` JSON, and `uomList[0]` is unchanged.
3. Saving the same product again adds nothing (idempotent); `'kg'` / `' Kg '`
   add nothing (case- and whitespace-insensitive).
4. A 50-line order introducing 3 distinct new UOMs performs **one** Config write.
5. An order/product save where every UOM is already known performs **zero**
   Config reads-from-sheet and **zero** lock acquisitions.
6. A forced failure inside `rememberUoms_` still returns a successful order/product
   response (asserted, not assumed).
7. `for f in tools/offline-tests/*.test.js; do node "$f" >/dev/null || echo "FAIL $f"; done`
   → no FAIL; `node tools/offline-tests/uom-autoadd.test.js` → 0 failed.
8. Admin can still delete an auto-added UOM from the config screen (regression
   assert against `actionUpdateConfig_`).

## Rollback

One commit per phase, each touching disjoint files. `git revert <sha>` of 02/03
stops the auto-adding immediately; reverting 01 additionally removes the helper
(harmless once its callers are gone — revert 02/03 first). Data written is
additive and admin-removable via the existing config screen; no migration, no
schema change, nothing to un-write. Reverting 03b restores the `<select>`.

## Decisions needed

1. **Phase 03b — swap the order line `<select class="l-uom">` for an
   input + `<datalist>` (same control the product form already uses)?**
   Without it, requirement #2 ("order line with a new UOM") is unreachable from
   the web UI and the phase-03 code is API-only defence. With it, order lines
   behave like the product form and the product-picker autofill stops silently
   dropping off-list UOMs. Recommended: **yes**, as a follow-up commit.
2. **UOM max length = 20 chars** (proposed cap; `text_()` alone would allow 2000).
   Longest seeded value is 4 chars (`Config.gs:334`). Confirm 20 is comfortable.
3. **Newly remembered UOM only appears after a page reload**, because
   `T.config()` is a page-load snapshot (`App.html:113`). Accept, or log a separate
   task for live session-config refresh (the same deferral already made in
   `plans/260910-1512-*/phase-06-optional-session-config-refresh.md`)?
