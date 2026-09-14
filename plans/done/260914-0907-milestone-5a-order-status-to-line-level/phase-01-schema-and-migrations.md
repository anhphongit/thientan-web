---
phase: 1
title: "Schema & migrations"
status: completed
priority: P1
effort: 3h
dependencies: []
---

# Phase 1: Schema & migrations

## Overview

Reshape the three affected sheet schemas in `apps/api/Config.gs` and add the one-time,
run-by-hand migration that brings a live sheet's header row in line with them. No business
logic, no backfill. After this phase the code still compiles and the old order-level status
logic still runs (it is removed in Phase 2) — this phase only makes the *columns* exist.

**Priority P1:** every later phase reads or writes these columns.

## Requirements

**Functional**
- `HEADERS.Orders` (Config.gs:89) drops `status` and `statusNote`.
- `HEADERS.OrderLines` (Config.gs:95-97) gains `status` and `statusNote`.
- `HEADERS.StatusHistory` (Config.gs:107-108) gains `lineId` (nullable).
- `LIST_CARD_FIELDS` (Config.gs:148) drops `status`.
- `DEFAULT_VISIBLE_FIELDS` (Config.gs:183-187) keeps `status`/`statusNote` — the *keys* are
  unchanged, their meaning shifts from order-scope to line-scope (see Phase 2).
- New migration `migrateOrderLineStatus()` in `apps/api/Migrations.gs`:
  - adds `status`, `statusNote` header cells to `OrderLines` if absent
  - adds `lineId` header cell to `StatusHistory` if absent
  - renames live `Orders!status` → `status_deprecated`, `Orders!statusNote` →
    `statusNote_deprecated` (see Assumption A1)
  - **no backfill of any kind**
  - idempotent and safe to re-run

**Non-functional**
- Migration must be reachable only from the Apps Script editor Run dropdown, never over
  HTTP — same convention as the existing migrations (no trailing underscore + `guardSetup_()`
  first line, Migrations.gs:1-13, 200).

## Architecture

### Data flow (why a migration is needed at all)

```
Config.gs HEADERS.X  ──(only consulted by)──►  ensureSheetWithHeaders_ (Setup.gs)
                                                  └─ SKIPS a sheet that already has data
SheetsRepo appendRecord_/updateRecord_ ──(bind by)──► LIVE sheet header row (readHeaders_)
```

So a `HEADERS` edit alone is inert on an existing sheet: writes to a column the sheet does
not have are **silently dropped** (the row object just carries an unknown key — not an
error). Hence `migrateOrderLineStatus()`.

### Assumption A1 — deprecate, don't delete, the Orders status columns

The task says "drop/stop-using the Orders columns". Three options were weighed:

| Option | Verdict |
|---|---|
| Delete the two columns from the live sheet | Rejected — destructive, irreversible, and the owner may still want to eyeball historical values. |
| Leave them completely untouched | Rejected — `readAll_` (SheetsRepo.gs:104-118) keys rows by the live header row, so `row.status` keeps resolving for old rows. Any missed reader silently reads stale data instead of failing loudly. |
| **Rename to `status_deprecated` / `statusNote_deprecated`** | **Chosen.** Non-destructive, reversible, and it makes `row.status` become `undefined` — a missed reader fails visibly rather than silently. `checkOrderHeaders_` (Setup.gs:299-313) only flags *missing* HEADERS entries, so extra/renamed columns do not trip the health check. |

### Assumption A2 — StatusHistory.lineId placement

Appended as the **last** column (same as `field` was, via `ensureStatusHistoryFieldColumn_`,
Migrations.gs:172-181). All access is by header name (SheetsRepo.gs:4-5), so position is
irrelevant; appending is the only non-destructive choice on a live sheet.

## Related Code Files

**Modify**
- `apps/api/Config.gs` — lines 89 (Orders), 95-97 (OrderLines), 102-108 (StatusHistory
  header + its explanatory comment about `field`), 148 (`LIST_CARD_FIELDS`).
- `apps/api/Migrations.gs` — append new migration after `migrateFixDatetimeColumns()`
  (ends line 328). Follow the shape of `migrateAddRejectReasonColumns()` (lines 199-219) for
  the add-column loop and `ensureStatusHistoryFieldColumn_()` (172-181) for the single-column
  helper.

**Read for context (do not modify in this phase)**
- `apps/api/SheetsRepo.gs:91-181` — `readAll_`, `appendRecord_`, `updateRecord_`, `readHeaders_`.
- `apps/api/Setup.gs:240, 299-313` — `ensureSheetWithHeaders_` call site and `checkOrderHeaders_`.

**Create:** none.
**Delete:** none.

## Implementation Steps

1. Edit `HEADERS.Orders` (Config.gs:89): remove `'status', 'statusNote'`. Update the
   surrounding comment block to state that business status now lives on OrderLines and that
   `approveStatus` is the only status left on an order.
2. Edit `HEADERS.OrderLines` (Config.gs:95-97): append `'status', 'statusNote'`. Add a
   comment: optional (a line may be blank), values from `Config.statusList`.
3. Edit `HEADERS.StatusHistory` (Config.gs:107-108): append `'lineId'`. Extend the existing
   `field` comment (102-106) to explain that `lineId` is blank for `approveStatus` rows and
   for every pre-migration row, and set for line-status rows.
4. Edit `LIST_CARD_FIELDS` (Config.gs:148): remove `'status'`. Update the docstring above it
   (137-147), which currently names `status` as something the card draws.
5. Add `migrateOrderLineStatus()` to `Migrations.gs` with the full HOW-TO-RUN docblock the
   other migrations carry. Body: `guardSetup_()`, then
   (a) add missing `status`/`statusNote` columns to `OrderLines`,
   (b) add missing `lineId` column to `StatusHistory`,
   (c) rename `Orders!status`/`Orders!statusNote` header cells to the `_deprecated` names
       (skip cleanly if already renamed or already absent),
   (d) return a human-readable multi-line summary, `console.log` it.
6. Explicitly document in the docblock: **no backfill** — existing order status values are
   deliberately discarded, existing lines stay blank.
7. Syntax check the two edited files (`node --check` on a copy, or the project's existing
   compile check) — do **not** run the migration.

## Todo List

- [x] `HEADERS.Orders` — remove status/statusNote (+ comment)
- [x] `HEADERS.OrderLines` — add status/statusNote (+ comment)
- [x] `HEADERS.StatusHistory` — add lineId (+ comment)
- [x] `LIST_CARD_FIELDS` — remove status (+ docstring)
- [x] `migrateOrderLineStatus()` written, idempotent, `guardSetup_()` first
- [x] Docblock states "no backfill" explicitly
- [x] Syntax check passes

## Success Criteria

- [x] `grep -n "'status'" apps/api/Config.gs` shows no hit inside `HEADERS.Orders` or `LIST_CARD_FIELDS`.
- [x] `HEADERS.OrderLines` contains `status` and `statusNote`; `HEADERS.StatusHistory` contains `lineId`.
- [x] `migrateOrderLineStatus` exists, starts with `guardSetup_()`, has no trailing underscore.
- [x] Re-reading the migration source shows every write guarded by an `indexOf(...) < 0` check (idempotent).
- [x] Both files parse without syntax error.
- [x] The migration was **not** executed as part of this phase (correct at the time — Phase 8
      owned that). **Update (2026-09-14):** Phase 8 has since run it against the live sheet;
      this criterion described Phase 1's own scope boundary, not a standing constraint.

## Risk Assessment

| Risk | L×I | Mitigation |
|---|---|---|
| Migration run against the live sheet before the code that needs it is deployed | Med × High | Do not run it here. Phase 8 owns execution, as a manual owner step. Mirrors `migrateAddApproveStatus()` which per `docs/MILESTONES.md` "has NOT been run against the live sheet yet". |
| Live sheet already holds real test/seed data — M5 was live-verified 2026-09-13 | High × Med | Rename (A1), never delete. Nothing is destroyed; a rollback is a rename back. Take a sheet copy before Phase 8. |
| `HEADERS` edited but migration not run → writes silently dropped, no error | Med × High | Phase 8 step 1 runs `checkOrderHeaders_()` which reports any `HEADERS` entry missing from the live sheet. |
| Renaming `Orders!status` breaks a reader missed in Phase 2 | Med × Med | This is the *intended* effect — it converts a silent stale read into a visible `undefined`. Phase 6's suite is the net. |
| Someone re-runs the migration after Phase 8 | Low × Low | Idempotent by construction: every step is guarded by a header-presence check. |

## Security Considerations

- `guardSetup_()` is mandatory as the first statement — it is what keeps the function
  unreachable over HTTP (Migrations.gs:1-13 convention).
- No permission logic changes here; `DEFAULT_VISIBLE_FIELDS` keys are deliberately unchanged
  so no role silently gains or loses visibility in this phase.

## Next Steps

Phase 2 (backend logic) — cannot start until these headers exist in `HEADERS`.
