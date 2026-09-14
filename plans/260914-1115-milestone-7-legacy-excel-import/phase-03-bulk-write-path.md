---
phase: 3
title: "Bulk Write Path"
status: pending
priority: P2
effort: "8h"
dependencies: [1, 2]
---

# Phase 3: Bulk Write Path

## Overview

Write the mapped orders (Phase 2 output) into live `Orders`/`OrderLines`/`Invoices`/
`StatusHistory`, reusing existing ID-generation and record-building primitives rather than
duplicating them.

## Key Insights

- Reuse, don't duplicate: `nextOrderId_()` (`Orders.gs:1484`, must run inside
  `withOrderLock_`), `buildLineRecord_()` + `sumLines_()` (`Orders.gs:1362-1385`,
  handles per-line VAT rounding and calls `ensureInvoice_` for invoice linkage),
  `ensureInvoice_()` (`Orders.gs:1399`, create-if-missing/reuse-by-`invoiceId`),
  `makeLineId_()` (`Orders.gs:1519`). These are the same primitives `actionCreateOrder_` uses.
- `DevSeed.gs` precedent: bulk creation in this codebase goes through
  `actionCreateOrder_()` row-by-row, because `appendRecord_` has no batch `setValues` variant.
  Follow the same shape here — call the same internal primitives per order, `appendRecord_`
  for `Orders`/`OrderLines`/`Invoices`/`StatusHistory` rows — rather than inventing a new batch
  write path (KISS: this is a several-hundred-row one-time job, not a perf-critical path).
- Unlike `actionCreateOrder_`, this import is **not** behind an authenticated web request, so it
  cannot reuse that action wrapper directly (no permission check needed — it's an
  Admin-in-the-editor operation, same trust level as `migrateAddApproveStatus()`). Call
  `buildLineRecord_`/`sumLines_`/`ensureInvoice_` directly, then `appendRecord_(SHEETS.ORDERS,
  ...)` for the header row — mirroring what `actionCreateOrder_` does internally, minus the
  auth/permission layer.
- **`createdBy`/`changedBy` identity**: the legacy file has no per-order user attribution.
  Options: (a) a fixed marker like `legacy-import@system` (not a real Users row — check whether
  `createdBy` is ever looked up against `Users` elsewhere, e.g. for "own orders only" scoping,
  before picking this), or (b) the running Admin's own email via `loadUser_(ADMIN_EMAIL)`
  (`DevSeed.gs`'s pattern). **Flagged as unresolved in `plan.md` — ask the user before Phase 3
  implementation starts**, since it affects who "owns" ~206 historical orders under
  `view_all_orders`-gated visibility.
- `orderDate` must be the **real historical date** from the source row, not the import
  run's date — preserves chronology for statistics/exports.
- `StatusHistory` gets one row per imported line with a `status` value (per M5a's `lineId`
  column), `oldStatus: ''`, `newStatus: <mapped status>`, `note: 'Nhập từ dữ liệu lịch sử'` (or
  similar), so the audit trail correctly shows these as an import event, not a fabricated user
  action — distinguishable from real usage later.
- `lineCount` on the `Orders` row = the written line array's length, same as
  `actionCreateOrder_`/`actionUpdateOrder_` do today (`Orders.gs:407,706`) — no separate helper.

## Requirements

- Functional: for each mapped order, allocate a real `orderId`, write its `OrderLines` (with
  invoice linkage via `ensureInvoice_`), write the `Orders` header row with computed totals,
  write one `StatusHistory` row per line that has a non-blank status.
- Non-functional: must run within Apps Script's 6-minute execution ceiling — batch/resume
  across multiple manual runs if the full ~206 orders don't fit in one execution (see Phase 4
  for the resumability mechanism this phase's writes must support).

## Architecture

```
migrateImportLegacyOrders()             // no-underscore, guardSetup_()-guarded
  → orders = (Phase 1 parse) + (Phase 2 map), minus any already-imported (Phase 4 marker)
  → adminUser = loadUser_(<decided identity>)
  → for each order (up to a per-run cap, e.g. 150, mirroring DevSeed's 200 cap):
      withOrderLock_(() => {
        orderId = nextOrderId_()
        lines = order.lineFields.map((lf, i) =>
          buildLineRecord_(orderId, i+1, lf, adminUser, makeLineId_(orderId, i+1)))
        totals = sumLines_(lines)
        appendRecord_(SHEETS.ORDER_LINES, ...) for each line
        appendRecord_(SHEETS.ORDERS, { ...order.orderFields, orderId, ...totals,
          lineCount: lines.length, createdBy: adminUser.email, createdAt: now, ... })
        lines.filter(l => l.status).forEach(l =>
          appendRecord_(SHEETS.STATUS_HISTORY, { lineId: l.lineId, orderId, oldStatus: '',
            newStatus: l.status, field: 'status', changedBy: adminUser.email, ... }))
      })
  → returns summary string: orders written this run, orders remaining, per-month counts
```

## Related Code Files

- Modify: `apps/api/LegacyImport.gs` (add `migrateImportLegacyOrders()`, the real write path,
  alongside Phase 1's `dryRunImportLegacyOrders()`)
- Read for context: `apps/api/Orders.gs:1362-1524` (`buildLineRecord_`, `sumLines_`,
  `ensureInvoice_`, `nextOrderId_`, `makeLineId_`, `makeInvoiceId_`, `withOrderLock_`),
  `apps/api/DevSeed.gs` (`loadUser_` / admin-identity pattern, per-run cap precedent)

## Implementation Steps

1. Resolve the `createdBy` identity question with the user (see Key Insights) before writing
   code that hard-codes either choice.
2. Implement `migrateImportLegacyOrders()` per the architecture above, capped per run.
3. Run against a **duplicate/test copy of the spreadsheet first** (never the live production
   sheet on the first attempt) — confirm row counts, spot-check 5–10 orders by eye against the
   original Excel rows before ever running against production.
4. Only after a clean test-copy run, proceed to Phase 4 (resumability) before any production run.

## Success Criteria

- [ ] A full run against a **test copy** of the spreadsheet completes without exceptions,
      writes the expected number of `Orders`/`OrderLines`/`Invoices`/`StatusHistory` rows
- [ ] Spot-checking 10 random imported orders against their source Excel rows shows correct
      `po`, `customer`, `orderDate`, line amounts, VAT rate, and (where present) status
- [ ] `Orders.totalExVat`/`totalIncVat` match the sum of that order's `OrderLines` amounts
      exactly (server-side recompute, not trusted from the source file)
- [ ] Invoice linkage: an invoice number appearing on lines across multiple orders in the
      source file resolves to the **same** `Invoices.invoiceId` in all of them

## Risk Assessment

- **Writing to production before validating on a copy**: mitigated by making step 3 (test-copy
  run) a hard gate in the implementation steps, not optional.
- **Partial run leaves orphaned rows on a crash mid-order**: `withOrderLock_` scopes the lock
  per order, but a crash between `appendRecord_(ORDER_LINES, ...)` calls and the `Orders` header
  write could leave orphan lines. Phase 4 must define how a resumed run detects and either
  completes or cleans up a partially-written order.

## Security Considerations

- Imported orders inherit whatever `createdBy` identity is chosen — verify that identity does
  not accidentally grant those orders special permission-bypass behavior anywhere in
  `Permissions.gs`'s "own orders" logic.
