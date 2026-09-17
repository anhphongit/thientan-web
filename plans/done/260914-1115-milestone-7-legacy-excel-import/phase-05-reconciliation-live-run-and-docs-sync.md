---
phase: 5
title: "Reconciliation, Live Run and Docs Sync"
status: completed
priority: P1
effort: "6h"
dependencies: [1, 2, 3, 4]
completed: 2026-09-17
---

# Phase 5: Reconciliation, Live Run and Docs Sync

## Overview

Verify the imported data is financially correct against the source file's own totals, execute
the real production run against the live spreadsheet following a strict runbook (backup first),
and sync every doc that currently states the Excel is "never imported."

## Key Insights

- `docs/EXCEL_REFERENCE.md` §1/§7: each month block ends with a `DOANH SỐ THÁNG n` row — the
  business's own printed revenue total for that month. Phase 1's parse already captures this
  value. This is a ready-made checksum: Σ imported `OrderLines.amountExVat` for that month's
  orders should reconcile against it, the same way M4's exit criteria required ("Revenue figures
  reconcile against the reference Excel for a sample month") — do this for **all 8 months**,
  not just a sample, since the whole file is being imported.
- This milestone is a deliberate, one-time exception to a stated policy
  (`docs/OPEN_QUESTIONS.md`'s "Import the existing Excel? No", `README.md`, top of
  `docs/EXCEL_REFERENCE.md`). Docs must describe **why this run happened and stay accurate**,
  not silently contradict themselves — future readers must understand this was a one-time
  go-live migration, not a reversal of the manual-entry design.
- M6 delivers `backupNow()` — this phase's runbook requires running it immediately before the
  live import, and confirming the backup is restorable, per M6's own exit criteria.

## Requirements

- Functional: an automated reconciliation check comparing imported totals against each month's
  printed `DOANH SỐ THÁNG n`; a written runbook; doc updates.
- Non-functional: the live run against production must be a single deliberate, observed event
  (Admin present, backup fresh), not a fire-and-forget script trigger.

## Related Code Files

- Modify: `apps/api/LegacyImport.gs` — add `reconcileLegacyImport_()` producing a per-month
  actual-vs-printed comparison in the run summary
- Modify: `docs/EXCEL_REFERENCE.md` — update the top banner ("Reference only... not imported")
  to describe the M7 one-time historical import that occurred, with date, and reaffirm the file
  is still not used for ongoing data entry
- Modify: `docs/OPEN_QUESTIONS.md` — update the "Import the existing Excel? No" answered-row
  with a note pointing to this milestone as the later, scoped exception
- Modify: `README.md` — the "Reference data" section's "It is never imported" line needs a
  qualifier or a pointer to the M7 note, so it doesn't read as a false statement after this
  milestone ships
- Modify: `docs/MILESTONES.md` — add the "☐ Milestone 7" section (scope + exit criteria, same
  format as M5a/M6), following the numbering/insertion style already used for M5a/M5b
- Modify: `docs/development-roadmap.md` — add M7 to the timeline/dependency tree and progress
  log, consistent with how M5a/M6 were added
- Modify: `docs/DATA_MODEL.md` — note (near `Orders`/`OrderLines`) that historical rows created
  by the M7 import carry the `createdBy` identity decided in Phase 3, so a reader isn't
  confused seeing ~206 orders attributed to one account/date range
- Create: a runbook section (either inline in `plan.md` or a short `docs/` note — follow
  existing convention, check if `docs/SETUP.md` or a dedicated ops doc is the right home) with
  the exact step order: backup → dry run (Phase 1) → mapping review (Phase 2 flags) → test-copy
  write (Phase 3) → spot-check → reconcile (this phase) → live run → post-run reconcile → docs
  sign-off

## Implementation Steps

1. Implement `reconcileLegacyImport_()`: for each of the 8 months, sum imported
   `OrderLines.amountExVat` for orders whose `orderDate` falls in that month, compare to the
   parsed `DOANH SỐ THÁNG n` value, report any mismatch beyond a small rounding tolerance.
2. Run the full pipeline (Phases 1–4) against the **test copy** once more end-to-end, then run
   `reconcileLegacyImport_()` against it — resolve every month's mismatch before going further
   (trace back to Phase 2 mapping bugs, not just accept a diff).
3. Write the runbook (backup → dry-run → mapping-flag review → test-copy write → spot-check →
   reconcile → live run → post-run reconcile → docs sign-off), in whichever `docs/` location
   fits the project's existing ops-doc convention.
4. **With the project owner present**: run `backupNow()` (M6), confirm the backup, then execute
   the real `migrateImportLegacyOrders()` against production, following the runbook exactly.
5. Run `reconcileLegacyImport_()` against the live result; resolve any discrepancy before
   declaring done (do not ship a mismatched revenue figure into production statistics).
6. Update all docs listed above.
7. Delegate to `docs-manager` agent (per `primary-workflow.md` step 4) to verify doc sync is
   complete and cross-referenced correctly.

## Success Criteria

**Status: Complete (2026-09-17). Live run executed, reconciliation clean, docs sync in progress.**

- [x] `reconcileLegacyImport_()` shows all 8 months matching their printed `DOANH SỐ THÁNG n`
      total within rounding tolerance, on both the test-copy run and the final live run
      — *code complete; test-copy validation (2026-09-16, Step 6) clean; production validation (2026-09-17, Step 9) all 8 months OK*
- [x] Live run executed once, with a fresh `backupNow()` snapshot taken immediately before it,
      and the project owner present/reviewing the summary output — *runbook Step 7-8 (2026-09-17): fresh backup taken, live run executed with owner present*
- [x] Post-import spot check: open 5 real orders in the live web app (not just the Sheet) and
      confirm they render correctly — customer, lines, VAT, status, invoice — through the
      normal UI a user would use — *runbook Step 10 (2026-09-17): spot check completed, "live test look great"*
- [ ] `docs/EXCEL_REFERENCE.md`, `docs/OPEN_QUESTIONS.md`, `README.md`, `docs/MILESTONES.md`,
      `docs/development-roadmap.md`, `docs/DATA_MODEL.md` all updated and internally consistent
      (no doc still flatly states "never imported" without qualification) — *in progress: project-manager updating now (2026-09-17)*
- [ ] `docs/MILESTONES.md`'s new M7 section's exit criteria are all checked off with the actual
      live-run date — *in progress: project-manager updating now (2026-09-17)*

## Risk Assessment

- **Reconciliation mismatch traced to a genuine source-data ambiguity** (not a bug) — e.g. an
  order whose printed month total the business itself computed inconsistently. If this happens,
  document the specific discrepancy and get the project owner's explicit sign-off to proceed
  anyway, rather than silently rounding it away.
- **Running live without the freshest possible mapping rules** (e.g. Phase 2 rules were tuned
  against a slightly different file than what's actually imported live) — mitigated by running
  the *exact* file to be used in production through the full test-copy pipeline in step 2, not a
  sample/earlier version.

## Next Steps

- After sign-off, run `/ck:journal` to record the migration event, per `primary-workflow.md`
  step 10 — this is exactly the kind of significant, non-obvious event worth a journal entry
  (a one-time production data migration, not routine feature work).
