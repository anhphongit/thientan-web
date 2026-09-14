---
phase: 7
title: "Live verification and docs sync"
status: pending
priority: P1
effort: "3h"
dependencies: [1, 2, 4, 5, 6]
---

# Phase 7: Live verification and docs sync

## Overview

Closes out the milestone: push both apps, run `docs/CHECKLIST_M6_VI.md` live with Phong (including
a real iPhone Safari + Android Chrome pass for Phase 4's responsive section), confirm every
`docs/MILESTONES.md` M6 exit criterion, then sync `docs/MILESTONES.md`,
`docs/development-roadmap.md`, `docs/codebase-summary.md`, and `docs/project-changelog.md` — same
pattern as every prior milestone's closeout (see `docs/MILESTONES.md`'s progress log entries for
M2-M5 as the template for what a signoff entry looks like).

## Key Insights

- **Corrected (red-team Finding 15): Phase 3 is a soft/optional dependency, not a hard blocker.**
  Phase 3's own Risk Assessment names it "the first phase to cut if time runs short" — a hard
  frontmatter dependency on a phase explicitly designed to be droppable had no documented unblock
  procedure. This phase's `dependencies` frontmatter now lists only `[1, 2, 4, 5, 6]`. If Phase 3
  shipped, walk its part of the checklist too (system-health panel showing real backup/error data)
  and record it as delivered. If Phase 3 was cut, this phase proceeds without it — record the cut
  explicitly in the `docs/MILESTONES.md` signoff entry (step 6 below), it is not silently omitted.
- `docs/development-roadmap.md` is already stale relative to `docs/MILESTONES.md` (it still shows
  M5 phases 4-5 "in progress" as of this plan's creation, while `MILESTONES.md`'s progress log
  shows M5 fully signed off 2026-09-13) — this phase's docs-sync step should reconcile
  `development-roadmap.md` to match `MILESTONES.md`'s actual state, not just append M6, since the
  drift predates this plan and would otherwise persist.
- Deploy order matters (per this repo's established convention, see `docs/SETUP.md` and
  `MILESTONES.md`'s M2 entry: "push **api** first, publish a new version, then run setup, then push
  **web**") — apply the same order here: push `apps/api` (includes Phase 1's `BackupJob.gs`, Phase
  2/3's error/health additions), run any new `setupMilestone6()`/`installBackupTrigger()` editor-
  only functions, then push `apps/web`.
- If Phase 3 (admin health panel, stretch) was cut for time, this phase's docs-sync must record
  that explicitly as a deliberate scope decision (per Phase 3's own risk note), not silently omit
  it from the changelog.
- Confirm the "restorable copy" reading from plan.md's "Out of scope" note during the actual
  checklist walkthrough — have Phong open one produced backup copy directly in Sheets as the
  concrete proof of "restorable," since that's the literal exit criterion wording.

## Requirements

- Functional: every M6 exit criterion in `docs/MILESTONES.md:213-218` confirmed true against the
  live deployment, not just against offline tests.
- Non-functional: docs updated same-day as live signoff, consistent with every prior milestone's
  practice in this repo (see `documentation-management.md`'s "Automatic Updates Required").

## Related Code Files

- Modify: `docs/MILESTONES.md` (flip M6 to ☑, add progress-log entries), `docs/development-
  roadmap.md` (reconcile M5's actual status, add M6 signoff, update the timeline/dependency
  diagram and success-metrics table), `docs/codebase-summary.md`, `docs/project-changelog.md`
- Reference: `docs/CHECKLIST_M6_VI.md` (Phase 6), `docs/PERMISSIONS.md`

## Implementation Steps

1. Push `apps/api`, publish a new version.
2. Run Phase 1's setup/trigger-install editor-only functions (`installBackupTrigger()` if the
   scheduled stretch shipped) and Phase 3's `ErrorLog` sheet setup (if that stretch shipped).
3. Push `apps/web`, publish.
4. Walk `docs/CHECKLIST_M6_VI.md` live with Phong: real iPhone Safari + Android Chrome pass
   (Section A), manual backup button + open the resulting copy directly in Sheets, deliberate
   error-path check (confirm generic Vietnamese message, not raw detail), full
   `docs/PERMISSIONS.md` checklist re-run, guide walkthrough (have an employee, or Phong acting as
   one, attempt the order lifecycle using only `docs/USER_GUIDE_VI.md`).
5. Record every finding — bugs found during this pass get fixed and re-verified before signoff,
   same as every prior milestone's closeout in `docs/MILESTONES.md`'s progress log (see e.g. the
   M5 stale-cache bug entry, 2026-09-12, as the template for how a live-testing bug gets documented
   and closed in the same pass).
6. Once all exit criteria pass: update `docs/MILESTONES.md` (flip M6's checkboxes and header to ☑,
   add a dated progress-log entry summarizing what shipped, including which stretch items made it
   and which were deliberately cut).
7. Reconcile `docs/development-roadmap.md`: fix the stale M5 status, add M6's signoff, update the
   timeline diagram (`M6 ☐ Not Started` → done) and the success-metrics table (particularly
   "Vietnamese completeness" and "Live verification: X/6 milestones").
8. Update `docs/codebase-summary.md` and `docs/project-changelog.md` per this repo's standard
   documentation-management workflow.
9. Confirm no confidential info (Spreadsheet IDs, secrets) is introduced into any doc during this
   sync — same standing rule as every commit in this repo.

## Success Criteria

- [ ] All four `docs/MILESTONES.md` M6 exit criteria confirmed live: backup restorable, iOS
      Safari + Android Chrome usable, full `PERMISSIONS.md` checklist passes, an employee completes
      the order lifecycle unaided using `USER_GUIDE_VI.md`
- [ ] `docs/MILESTONES.md`, `docs/development-roadmap.md`, `docs/codebase-summary.md`,
      `docs/project-changelog.md` all updated and mutually consistent (no stale M5/M6 status left
      in any of them)
- [ ] Any bugs found during the live pass are fixed and re-verified before this phase is marked done
- [ ] Any dropped stretch item (Phase 3 and/or Phase 1's scheduled-backup/retention sub-items) is
      explicitly recorded as a deliberate cut, not silently omitted

## Risk Assessment

- **This is the phase most likely to surface real bugs** (as every prior milestone's live-testing
  pass has) — budget for at least one fix-and-reverify loop before signoff, don't treat "checklist
  written" as "checklist passed."
- **Docs drift compounds if not caught here** — `development-roadmap.md`'s existing staleness
  (predating this plan) is exactly the failure mode this step should stop from recurring; reconcile
  it fully, not just append.

## Security Considerations

- Re-run `docs/PERMISSIONS.md`'s full checklist as M6 explicitly requires — this is the first
  milestone to demand the *complete* matrix re-check (prior milestones checked relevant slices),
  catching any drift accumulated across M2-M5's incremental permission changes.
