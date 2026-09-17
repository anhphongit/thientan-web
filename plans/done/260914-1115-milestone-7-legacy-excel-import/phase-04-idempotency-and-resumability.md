---
phase: 4
title: "Idempotency and Resumability"
status: completed
priority: P2
effort: "4h"
dependencies: [3]
completed: 2026-09-17
---

# Phase 4: Idempotency and Resumability

## Overview

Make `migrateImportLegacyOrders()` safe to run more than once — required both because Apps
Script's 6-minute execution ceiling may force multiple runs to cover ~206 orders, and because
`Migrations.gs`'s house convention (`docs` comment, `Migrations.gs:10-12`) is that every
migration "recomputes from source data rather than trusting anything it wrote on a previous
run," i.e. re-running must never create duplicates.

## Key Insights

- `DevSeed.gs` solves a similar problem (resumable seeding across runs, capped per run for the
  6-minute limit) via `nextSeedNumber_()` — scanning the sheet for the highest `SEED-<n>` tag in
  `po` to know where to resume. This import can use the same shape: tag every imported order
  with a stable, greppable marker so a re-run can skip orders it already wrote.
- **Marker choice**: do not overload `po` (real historical PO values must be preserved exactly,
  unlike `DevSeed`'s synthetic `SEED-n` tags). Instead, use a dedicated marker in `poNote` (e.g.
  append `[legacy-import]` if not already present) or, better, track imported source-row ranges
  in a Script Property (`LEGACY_IMPORT_LAST_ROW` or similar), since Phase 1's parse is
  deterministic and row-ordered — resuming from "the next unimported month/order-group index"
  is simpler and doesn't touch any user-visible field.
- **Partial-order crash recovery** (flagged as a risk in Phase 3): before writing a new order's
  `OrderLines`, check whether any `OrderLines` rows already exist for the `orderId` about to be
  allocated — should be impossible if resuming strictly by "next unimported group index," but
  add a defensive check + log if that invariant is ever violated (fail loud, do not silently
  overwrite).
- Because `nextOrderId_()` already guards against ID collisions with the live sheet
  (`Orders.gs:1497` loop skips existing ids), the resumability mechanism only needs to track
  "which **source rows** have already been converted," not defend `orderId` uniqueness itself.

## Requirements

- Functional: a re-run of `migrateImportLegacyOrders()` after a partial success writes only the
  orders not yet written, never duplicating an already-imported order.
- Non-functional: the resume-position tracking must survive across separate Apps Script
  executions (Script Properties, not in-memory state).

## Related Code Files

- Modify: `apps/api/LegacyImport.gs` — add resume-position read/write around the per-run loop
  from Phase 3
- Create: `tools/offline-tests/legacy-import-resumability.test.js` — simulate a run that stops
  partway (mock a cap of 2 orders out of 5) and assert a second run picks up exactly where the
  first stopped, with no duplicate `orderId`s

## Implementation Steps

1. Add `getLegacyImportResumePoint_()`/`setLegacyImportResumePoint_(index)` reading/writing a
   Script Property, storing the index into Phase 1's deterministic parsed-order array.
2. Wrap Phase 3's per-order loop to start at the resume point and advance it after each
   successfully-written order (update the property **after** the order's `Orders` header row is
   appended — i.e., only count an order as "done" once fully written, so a crash mid-order
   re-attempts that whole order on the next run).
3. Add a defensive pre-check: before writing `OrderLines` for the order about to be processed,
   `findBy_(SHEETS.ORDERS, ...)` shouldn't be needed (resume point already excludes it), but
   assert (throw + log) if `OrderLines` rows already exist tagged for a not-yet-issued
   `orderId` — this should never happen; the assertion is a tripwire, not expected to fire.
4. Add a `resetLegacyImportResumePoint()` admin-only helper (also `guardSetup_()`-guarded) to
   explicitly restart from zero, for the rare case of intentionally re-running against a
   corrected source file.
5. Write the offline resumability test (simulated partial run + resume).

## Success Criteria

**Status: Complete (2026-09-17). Resumability tested and validated across live run.**

- [x] Offline test: a simulated capped run (e.g. 2 of 5 orders) followed by a second run
      completes the remaining 3 with zero duplicate `orderId`s and zero missing orders
      — *offline suite passes*
- [x] Manually killing a real run partway (e.g. via Apps Script's execution timeout on a small
      test copy) and re-running `migrateImportLegacyOrders()` completes cleanly with correct
      final counts — *live run (2026-09-17) executed multiple batches successfully with resumable continuation; zero duplicates*
- [x] `resetLegacyImportResumePoint()` exists and is documented in the Phase 5 runbook as an
      explicit, deliberate action (not something a confused re-run stumbles into) — *code + runbook complete*

## Risk Assessment

- **Resume point drifts from actual sheet state** if someone manually deletes rows from
  `Orders`/`OrderLines` between runs — mitigate by documenting in the Phase 5 runbook that the
  import must run to completion, or be explicitly reset, never manually patched by editing
  sheet rows directly.
- **Off-by-one in "done" bookkeeping** double-importing or skipping one order at the boundary —
  the offline test in step 5 is the primary guard; assert exact order-id sets before/after, not
  just counts.
