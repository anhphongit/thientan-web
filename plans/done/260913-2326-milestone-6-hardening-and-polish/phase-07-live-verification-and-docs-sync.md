---
phase: 7
title: "Live verification and docs sync"
status: complete
priority: P1
effort: "3h"
dependencies: [1, 2, 3, 4, 5, 6]
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

- **Update (2026-09-16): Phase 3 shipped — un-cancelled at user request, implemented after all.**
  This phase's `dependencies` frontmatter now lists `[1, 2, 3, 4, 5, 6]`. Walk Phase 3's part of the
  checklist (system-health panel showing real backup/error data from the live deployment) and
  record it as delivered in the `docs/MILESTONES.md` signoff entry, alongside the other stretch
  items.
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
- Phase 3 (admin health panel, stretch) shipped — record it as delivered in the changelog/signoff
  entry, not as a cut item.
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
   scheduled stretch shipped). Phase 3 needs no separate setup function — it extends the existing
   `DevLog` sheet/`logDevEvent_` mechanism, not a new sheet.
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

- [x] All four `docs/MILESTONES.md` M6 exit criteria confirmed live: backup restorable, iOS
      Safari + Android Chrome usable, full `PERMISSIONS.md` checklist passes, an employee completes
      the order lifecycle unaided using `USER_GUIDE_VI.md`
- [x] `docs/MILESTONES.md`, `docs/development-roadmap.md`, `docs/codebase-summary.md`,
      `docs/project-changelog.md` all updated and mutually consistent (no stale M5/M6 status left
      in any of them)
- [x] Any bugs found during the live pass are fixed and re-verified before this phase is marked done
- [x] Any dropped stretch item (e.g. Phase 1's scheduled-backup/retention sub-items, if not
      shipped) is explicitly recorded as a deliberate cut, not silently omitted; Phase 3 is recorded
      as delivered

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

## Live Verification Result

**Date:** 2026-09-16  
**Status:** All exit criteria confirmed passed

User pushed both apps live (api first, then web per protocol), ran editor-only setup functions
(`installBackupTrigger()`, no separate Phase 3 setup needed). Full walkthrough of
`docs/CHECKLIST_M6_VI.md` completed with live deployment:

- ✓ Backup restorable: Manual backup button tested, resulting copy opened directly in Sheets
- ✓ iOS Safari (iPhone) + Android Chrome (Emulator) responsive pass verified  
- ✓ Full `docs/PERMISSIONS.md` checklist matrix re-run: all permissions correct
- ✓ Employee (Phong) order lifecycle: completed unaided using `docs/USER_GUIDE_VI.md`
- ✓ Admin health panel (Phase 3 stretch): live deployment showing real backup/error data, all 4
  tracked triggers confirmed installed via health panel status display

No bugs surfaced during live testing. All Milestone 6 stretch items delivered (Phase 1: scheduled
backup + retention, Phase 3: admin health panel, Phase 5: regression-guard script).
