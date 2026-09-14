---
phase: 8
title: "Live verification & sign-off"
status: pending
priority: P1
effort: 3h
dependencies: [1, 2, 3, 4, 5, 6, 7]
---

# Phase 8: Live verification & sign-off

## Overview

The only phase that touches the live Google Sheet. Deploy the code, have the **project owner
manually run** `migrateOrderLineStatus()` from the Apps Script editor, verify end-to-end against
real data, and sign off.

**The migration is not automated and must not be.** This project's standing pattern is that
migrations are run by hand from the editor's Run dropdown — `migrateAddApproveStatus()` is
recorded in `docs/MILESTONES.md` as *"has NOT been run against the live sheet yet"*. Same
caution applies here, with more weight: this is the first migration in the series that
**renames** existing columns.

## Requirements

**Functional**
- A full spreadsheet backup exists before anything runs.
- `migrateOrderLineStatus()` runs once, successfully, by the owner.
- `checkOrderHeaders_()` reports clean afterwards.
- End-to-end verification on live data: create an order with mixed line statuses, edit a line's
  status, confirm `StatusHistory` rows, confirm stats and export.
- The approval workflow is verified **unchanged**.
- Sign-off recorded.

**Non-functional**
- Rollback must be possible at every step without data loss.

## Architecture

### Deployment order (strict — reversing steps 2 and 3 loses data)

```
1. Back up the spreadsheet (File → Make a copy)
2. Push apps/api + apps/web  ──► code that no longer writes Orders.status is live
3. Owner runs migrateOrderLineStatus() in the editor
     ├─ adds OrderLines.status / statusNote
     ├─ adds StatusHistory.lineId
     └─ renames Orders.status → status_deprecated (+ statusNote)
4. checkOrderHeaders_()
5. End-to-end verification
```

**Why push before migrate:** between the push and the migration, the code writes line status to
columns that do not exist yet — `appendRecord_` silently drops unknown keys (SheetsRepo.gs:145-154),
so the effect is "line status not saved", which is recoverable by re-saving the order. The
reverse order is worse: renaming `Orders.status` while the old code still writes to it means
every order save fails or writes to a dead column. **Push first, migrate immediately after,
and keep the gap short.**

### Rollback plan

| Step | Rollback |
|---|---|
| After step 2 (code pushed, not migrated) | Redeploy the previous version. The sheet is untouched. |
| After step 3 (migrated) | Rename `status_deprecated` → `status` (and `statusNote`) by hand, redeploy the previous version. `OrderLines.status`/`statusNote` and `StatusHistory.lineId` are extra columns the old code ignores — harmless, and they can be left in place. |
| Catastrophic | Restore the step-1 copy. |

Nothing in the migration is destructive by design (Phase 1 A1), so no rollback path requires the
backup — the backup exists for the unexpected.

### Assumption A15 — sign-off lives in this file, not a new checklist doc

Per Phase 7 A13, no new `CHECKLIST_M*_VI.md` unless `docs-manager` decided otherwise. Default:
the sign-off table below is the record.

## Related Code Files

**Execute (do not edit):** `apps/api/Migrations.gs` → `migrateOrderLineStatus()`;
`apps/api/Setup.gs` → `checkOrderHeaders_()` (299-313).
**Read:** `docs/MILESTONES.md` for the existing not-yet-run-live wording to mirror.
**Modify:** this file (sign-off record); `docs/MILESTONES.md` to flip the migration's status
once actually run.
**Create / Delete:** none.

## Implementation Steps

1. **Owner action — back up.** File → Make a copy of the spreadsheet, named with today's date.
   Do not proceed without it.
2. Confirm the gate: Phase 6 green (18/18), Phase 4 screenshot verification done, Phase 7 docs
   merged.
3. Push `apps/api` and `apps/web` (`clasp push` or the project's usual path).
4. **Owner action — run the migration.** Apps Script editor → Run dropdown →
   `migrateOrderLineStatus` → Run, no arguments. Read and save the returned summary; paste it
   into the sign-off table below.
5. Run `checkOrderHeaders_()`. Expect clean. A "thiếu cột" report means the migration did not
   complete — stop and diagnose before any user touches the app.
6. Spot-check the sheet by eye: `OrderLines` has the two new columns; `StatusHistory` has
   `lineId`; `Orders` shows `status_deprecated`/`statusNote_deprecated` with their old values
   intact.
7. **Live E2E:** create an order with 3 lines — one `confirmed`, one `paid`, one **blank**.
   Save. Verify the sheet rows, then reopen the order and confirm the blank line is still blank
   (not defaulted).
8. Change one line's status from the UI. Verify exactly one new `StatusHistory` row with the
   correct `lineId`, `oldStatus`, `newStatus`, `changedBy`, `changedAt`, `field='status'`.
9. Verify the order **list** shows no business-status pill and offers no status filter, and that
   `approveStatus` still renders as before.
10. Run the stats-by-status report and an export against real data. Confirm stats reconcile and
    the export shows status on every line.
11. **Approval-workflow regression check:** with `Config.approvalFlowEnabled` in its current
    (default off) state, confirm order save/edit behaves exactly as before. If it is on in this
    deployment, walk request→approve→reject→draft once.
12. Permission spot-check with a non-admin account: a role without `change_status` cannot change
    a line's status; a role whose `visible_fields` omits `status` sees no line status control.
13. Mobile check on a real phone at ~360px — the lines table with two extra fields per row is the
    highest-risk layout in this change.
14. Update `docs/MILESTONES.md`: mark `migrateOrderLineStatus()` as **run**, with the date.
15. Fill in the sign-off table and mark the plan complete (`ck plan check 8`).

## Todo List

- [ ] Spreadsheet backup taken (date recorded below)
- [ ] Gate confirmed: tests green, screenshots done, docs merged
- [ ] Code pushed
- [ ] Migration run by owner; summary pasted below
- [ ] `checkOrderHeaders_()` clean
- [ ] Sheet spot-checked by eye
- [ ] E2E: mixed + blank line statuses
- [ ] E2E: status change writes exactly one correct history row
- [ ] Order list free of business status; approveStatus intact
- [ ] Stats + export verified on real data
- [ ] Approval workflow regression-checked
- [ ] Permission spot-check on a non-admin account
- [ ] Mobile 360px check
- [ ] `docs/MILESTONES.md` migration status flipped to run
- [ ] Sign-off table completed

## Success Criteria

- [ ] Migration returns a success summary and is safely re-runnable.
- [ ] `checkOrderHeaders_()` returns "all order sheets match HEADERS in Config.gs."
- [ ] A live order saves with mixed and blank line statuses; blank stays blank on reload.
- [ ] One line status change → exactly one `StatusHistory` row with the correct `lineId`.
- [ ] `Orders.status_deprecated` still holds its historical values (nothing destroyed).
- [ ] Approval workflow behaves identically to pre-change.
- [ ] Stats and export produce correct numbers on real data.
- [ ] Usable at 360px on a real device.
- [ ] Sign-off table filled in with the owner's name and date.

## Risk Assessment

| Risk | L×I | Mitigation |
|---|---|---|
| Live sheet already holds real test/seed data — M5 was live-verified 2026-09-13 | **High** × High | Step 1 backup is a hard gate. Migration is non-destructive by design (rename, never delete). Rollback table covers every step. |
| Migration run before the code is pushed → old code writes to a renamed column | Med × **High** | Deployment order is explicit and justified. Steps 3 and 4 are adjacent and must not be separated in time. |
| Window between push and migrate silently drops line status on saves | **High** × Low | Documented as expected and recoverable (re-save the order). Keep the window to minutes and avoid it during working hours. |
| Migration half-completes (Apps Script execution timeout / transient Drive error) | Med × Med | Idempotent by construction (Phase 1) — just re-run. `checkOrderHeaders_()` at step 5 detects a partial run. |
| `status_deprecated` rename confuses the owner looking at the sheet | Med × Low | Phase 7 documents it in `DATA_MODEL.md` §2; mention it explicitly at hand-off. |
| Approval workflow regression only surfaces in production | Low × **High** | Step 11 is a mandatory explicit check, not an assumption — this is the one system the whole plan promised not to touch. |
| Users mid-edit during deployment lose work | Med × Med | Pre-employee-rollout, so exposure is minimal — but still deploy outside the owner's working hours. |
| Sign-off skipped once "it seems to work" | Med × Med | The filled table is the phase deliverable. |

## Security Considerations

- `guardSetup_()` keeps the migration unreachable over HTTP — confirm it is present before
  pushing (Phase 1 criterion, re-checked here).
- Step 12's permission spot-check on a **real non-admin account** is the only end-to-end proof
  that the `change_status` re-scope and the `visible_fields` clamp behave on live data. Do not
  substitute the offline suite for it.
- The backup copy contains real business data — store it in the same Drive scope, do not
  download or share it externally.

## Sign-off

| Item | Value |
|---|---|
| Backup taken (date / filename) | |
| Code pushed (date / deployment) | |
| Migration run by | |
| Migration summary output | |
| `checkOrderHeaders_()` result | |
| E2E verified by / date | |
| Approval workflow regression-checked | |
| Mobile 360px verified | |
| Outstanding issues | |

## Next Steps

Plan complete. Consider `/ck:journal` to record the two-status→line-status decision and the
deployment-ordering constraint for future reference.
