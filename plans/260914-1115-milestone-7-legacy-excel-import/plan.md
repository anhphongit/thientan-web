---
title: "Milestone 7 — Legacy Excel Order Import"
description: "One-time admin migration script that imports the historical FILE THEO DOI DON HANG.xlsx (Jan–Aug 2026, ~206 orders/~534 lines) into live Orders/OrderLines/Invoices/StatusHistory, for the live/go-live stage. Reverses the 2026-08-15 'never imported' decision as a deliberate one-off exception, not an ongoing feature."
status: pending
priority: P2
branch: "main"
tags: [milestone-7, import, migration, orders, excel, legacy-data]
blockedBy: ["260914-0907-milestone-5a-order-status-to-line-level", "260913-2326-milestone-6-hardening-and-polish"]
blocks: []
created: "2026-09-14T04:24:01.822Z"
createdBy: "ck:plan"
source: skill
---

# Milestone 7 — Legacy Excel Order Import

## Overview

New milestone, added at the user's request (2026-09-14), for the **live/go-live stage**: a
one-time admin migration script (`migrateImportLegacyOrders()`, following the existing
`Migrations.gs` convention) that reads the business's real historical spreadsheet
(`FILE THEO DOI DON HANG.xlsx`, documented in `docs/EXCEL_REFERENCE.md`) and writes it into
the live `Orders`/`OrderLines`/`Invoices`/`StatusHistory` sheets, so employees start using the
app with real order history already in place instead of an empty database.

**This is a deliberate, scoped exception** to the decision recorded in
`docs/OPEN_QUESTIONS.md` ("Import the existing Excel? No. Reference only; users enter live
data", 2026-08-15) and repeated in `README.md` / `docs/EXCEL_REFERENCE.md`. It does not reverse
that policy going forward — after this one run, the app remains manual-entry-only, exactly as
designed. Docs are updated in Phase 5 to describe this as a one-time historical migration event,
not a standing import feature.

### Scope decisions (confirmed with the user before planning, 2026-09-14)

1. **Mechanism**: one-time admin-triggered script, run from the Apps Script editor like
   existing `migrateAddLineCount()` etc. No UI, no upload button, no repeat-use design.
2. **Data scope**: `Orders` + `OrderLines` + `Invoices` only. `Config.customerList`/`uomList`
   are **not** separately pre-seeded — they self-fill via the same `rememberCustomer_`/
   `rememberUoms_` mechanism already used by live order creation (DRY: no new seeding code).
3. **Source format**: the raw legacy `.xlsx` file, parsed as-is — month blocks, multi-line
   `PO`/`TRẠNG THÁI` cells, per-line VAT-ratio detection, inconsistent casing. No manual
   pre-cleanup spreadsheet.

### Why this sits after M5a and M6 (`blockedBy`)

- **M5a** (`plans/260914-0907-milestone-5a-order-status-to-line-level`) moves business status
  from `Orders.status` to `OrderLines.status`. The source file's `TRẠNG THÁI` column is already
  recorded **per row** (i.e., per line), so importing straight into `OrderLines.status` only
  makes sense once M5a's schema lands. Importing before M5a would write to a column
  (`Orders.status`) that M5a is about to delete.
- **M6** (`plans/260913-2326-milestone-6-hardening-and-polish`) delivers `backupNow()`. Running
  a several-hundred-row historical write against production Sheets without a fresh, verified
  backup immediately beforehand is an unacceptable risk. The live-run runbook (Phase 5) requires
  a manual `backupNow()` pass right before the import, so M6 must exist first.

## Key codebase facts driving this design

(from an Explore pass over `apps/api`, 2026-09-14 — see conversation for full detail)

- **`Migrations.gs` convention**: no-underscore function name (shows in the Run dropdown),
  starts with `guardSetup_()`, ensures any needed columns first, recomputes/backfills from
  source data (idempotent — safe to re-run), logs a plain-string summary via `console.log` +
  `return`. This plan's migration follows the same shape.
- **Reusable write primitives already exist**: `nextOrderId_()` (locked, Script-Properties
  counter, `Orders.gs:1484`), `buildLineRecord_()` + `sumLines_()` (`Orders.gs:1362-1385`,
  computes `amountExVat`/`amountIncVat` with per-line rounding), `ensureInvoice_()`
  (`Orders.gs:1399`, create-if-missing/reuse-if-exists by `invoiceId`). The import reuses these
  directly rather than duplicating VAT/ID logic (DRY).
- **`DevSeed.gs` precedent**: bulk row creation in this codebase goes through the full
  `actionCreateOrder_()` action, row-by-row (`appendRecord_` has no batch `setValues` variant
  anywhere in `SheetsRepo.gs`), capped and resumable across runs because of Apps Script's
  6-minute execution limit. This import follows the same resumable, row-by-row shape rather
  than inventing batch writes.
- **No xlsx-ingestion code exists anywhere in the repo.** `apps/api`'s manifest already has the
  `drive` and `spreadsheets` OAuth scopes, but `dependencies: {}` is empty — the Advanced Drive
  Service must be enabled to convert the uploaded `.xlsx` into a temporary Google Sheet
  (`Drive.Files.copy` with a target Sheets mimeType is the standard Apps Script technique; no
  precedent for this in the repo, built from scratch in Phase 1).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Ingestion and Dry-Run Parsing](./phase-01-ingestion-and-dry-run-parsing.md) | Pending |
| 2 | [Field Mapping and Extraction Rules](./phase-02-field-mapping-and-extraction-rules.md) | Pending |
| 3 | [Bulk Write Path](./phase-03-bulk-write-path.md) | Pending |
| 4 | [Idempotency and Resumability](./phase-04-idempotency-and-resumability.md) | Pending |
| 5 | [Reconciliation, Live Run and Docs Sync](./phase-05-reconciliation-live-run-and-docs-sync.md) | Pending |

## Dependencies

- **Blocked by** `plans/260914-0907-milestone-5a-order-status-to-line-level` — schema
  (`OrderLines.status`/`statusNote`, `StatusHistory.lineId`) must exist first.
- **Blocked by** `plans/260913-2326-milestone-6-hardening-and-polish` — `backupNow()` must exist
  as a pre-flight safety step before the live run.
- **Blocks** nothing — this is the last milestone before employee rollout with real data.

## Unresolved questions

- Exact identity to use for `createdBy`/`StatusHistory.changedBy` on imported rows (a dedicated
  system marker email vs. the admin's own email) — flagged for the user in Phase 3, not decided
  here.
- Whether the ~20 free-text status one-offs (`docs/EXCEL_REFERENCE.md` §6, e.g. cash notes like
  "mua đt iphone") should be imported at all, or dropped — flagged for the user in Phase 2.
