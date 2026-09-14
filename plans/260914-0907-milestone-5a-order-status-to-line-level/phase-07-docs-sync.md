---
phase: 7
title: "Docs sync"
status: pending
priority: P2
effort: 2h
dependencies: [6]
---

# Phase 7: Docs sync

## Overview

Update `./docs` to describe the shipped two-status→one-status-plus-line-status design.
Per this project's workflow, documentation is owned by the **`docs-manager` agent** — this
phase dispatches that agent with a precise brief rather than writing doc prose here.

Sequenced after Phase 6 deliberately: docs must describe what shipped, not what was planned.
This repo has a recorded history of `docs/` lagging the code and of aspirational filenames in
`docs/MILESTONES.md` misleading later work — which is precisely why this phase is not optional.

## Requirements

**Functional**
- Every doc that describes the two-status design is corrected.
- `docs/DATA_MODEL.md` reflects the new `Orders` / `OrderLines` / `StatusHistory` shapes.
- This work is tracked as **"Milestone 5a"** (project-owner decision, 2026-09-14 — see plan.md
  Overview). Placeholder entries already exist in `docs/MILESTONES.md` and
  `docs/development-roadmap.md` (added at planning time, marked ☐ Not Started). This phase's
  job is to flip those to ☑ done with a completion note, mirroring how other milestones close
  out (e.g. `docs/MILESTONES.md`'s Milestone 5 entry) — not to invent a new entry.
- Never label this "M5.1" or "M5.2" — both already taken by completed, unrelated work
  (`docs/development-roadmap.md:102,110`: Product CRUD, User Management).
- The test-file map records the `orders-changestatus` → `orders-changelinestatus` rename.
- The new migration is documented as **not yet run against the live sheet**, matching how
  `migrateAddApproveStatus()` is recorded today.

**Non-functional**
- Do not rewrite unrelated sections. Targeted edits only.
- Preserve the Vietnamese-language conventions in `GLOSSARY_VI.md` and any `CHECKLIST_M*_VI.md`.

## Architecture

### Doc → change mapping (audit-supplied; re-verify each anchor before editing)

| Doc | Anchor | Change |
|---|---|---|
| `docs/DATA_MODEL.md` | §2 Orders | Remove `status`/`statusNote`; note the live columns are renamed `*_deprecated`, not deleted (Phase 1 A1) |
| | §3 OrderLines | Add `status`/`statusNote` as **optional** |
| | §6 StatusHistory | Add `lineId` (nullable; blank for approveStatus + pre-migration rows) |
| | §7 Config | `statusList` now referenced by OrderLines |
| `docs/system-architecture.md` | 39-60, 120-200, 340-370, 490-550 | Two-status design, cache invalidation, test file map |
| `docs/PERMISSIONS.md` | 38, 68 | `visible_fields` examples — `status`/`statusNote` keys unchanged, scope now line-level; `change_status` meaning re-scoped |
| `docs/code-standards.md` | 94, 250-251 | Code example + test command references |
| `docs/GLOSSARY_VI.md` | 38 | `statusNote` entry becomes line-level |
| `docs/MILESTONES.md` | "☐ Milestone 5a" section (added 2026-09-14, after M5, before Unplanned) | Flip to "☑ Milestone 5a … *(done <date>)*"; check off exit criteria; add a Progress-log row |
| `docs/development-roadmap.md` | "☐ Milestone 5a" subsection (added 2026-09-14, under In-Progress) + Timeline diagram + Critical Path item 3 | Flip to done/complete; record the migration as not-yet-run-live if Phase 8 hasn't executed it yet |

### Assumption A13 — no new `CHECKLIST_M*_VI.md`

This work is a schema refactor, not a milestone of new user-facing capability, and the
sign-off checklist lives in Phase 8. Default: **fold sign-off into the existing checklist
series or into the Phase 8 file, do not create a new `CHECKLIST_*_VI.md`.** YAGNI. Final call
belongs to `docs-manager` — if it decides a new checklist is warranted, that decision and its
reason get recorded in this file.

### Assumption A14 — `docs/TASKS.md` is the current task record

Per prior experience in this repo, `docs/MILESTONES.md`'s progress log lags `docs/TASKS.md`.
If `docs/TASKS.md` exists, it gets the entry too, and it is the one to trust when the two
disagree.

## Related Code Files

**Modify (by `docs-manager`):** the eight docs in the table above, plus `docs/TASKS.md` if present.
**Read for context:** this plan's `plan.md` and phases 1-6, especially Phase 3's recorded
aggregation decision and Phase 4's recorded mockup choice — both are design decisions the docs
must reflect and neither is knowable from this file alone.

**Create:** none by default (A13).
**Delete:** none.

## Implementation Steps

1. Confirm Phase 6 is green and Phases 3/4 have recorded their decisions. Docs written before
   those decisions exist will be wrong.
2. Re-verify every doc anchor in the table (line numbers are audit-supplied and may have
   shifted). Correct the table in this file if they moved.
3. Dispatch `docs-manager` with a brief containing:
   - work context `/Users/phongna/anhphongit/Projects/thientan-web`
   - this plan's directory path
   - the doc→change table above
   - the **naming constraint**: this work is **"Milestone 5a"**, never "M5.1" or "M5.2" (both
     taken by completed, unrelated work) — flip the existing ☐ placeholder sections in
     `docs/MILESTONES.md`/`development-roadmap.md` to done, don't create new entries
   - the constraint that `approveStatus` documentation is unchanged and must not be edited
   - A13 (no new checklist doc unless it decides otherwise, with reason recorded)
   - the instruction to record the migration as not-yet-run-live
4. Review the agent's output against the table — confirm no unrelated section was rewritten and
   `approveStatus` docs are untouched.
5. Grep the whole `docs/` tree for residual claims that an order carries a business status, and
   for `orders-changestatus`.
6. Record in this file: which docs changed, and `docs-manager`'s checklist decision.

## Todo List

- [ ] Phase 6 green; Phase 3 + Phase 4 decisions recorded
- [ ] Doc anchors re-verified
- [ ] `docs-manager` dispatched with the full brief
- [ ] Output reviewed against the table
- [ ] `docs/` grepped for residual two-status claims and the old test filename
- [ ] Outcome + checklist decision recorded here

## Success Criteria

- [ ] `grep -rn "orders-changestatus" docs/` returns nothing.
- [ ] `docs/DATA_MODEL.md` shows `status`/`statusNote` under OrderLines (marked optional) and
      not under Orders; `StatusHistory` lists `lineId`.
- [ ] `docs/MILESTONES.md` and `docs/development-roadmap.md`'s existing "Milestone 5a" sections
      are flipped from ☐ Not Started to ☑ done, with exit criteria checked and a completion
      note/date — no duplicate or new milestone entry created.
- [ ] The existing completed M5.1 — Product CRUD and M5.2 — User Management entries
      (`development-roadmap.md:102,110`) are untouched.
- [ ] The new migration is documented as not yet run against the live sheet.
- [ ] `approveStatus` documentation is byte-for-byte unchanged.
- [ ] This file records what changed and the checklist decision.

## Risk Assessment

| Risk | L×I | Mitigation |
|---|---|---|
| Docs labelled "M5.1"/"M5.2", colliding with completed Product CRUD/User Management milestones | **High** × High | The naming constraint ("Milestone 5a", flip the existing placeholder, don't invent a new label) is repeated in the brief (step 3) and in the Success Criteria. |
| Docs written before Phase 3/4 decisions exist → documents guesses | Med × High | Step 1 gate. |
| `docs-manager` rewrites unrelated sections | Med × Med | Brief is a targeted table, not "update the docs". Step 4 review. |
| `approveStatus` docs edited as collateral | Med × High | Explicit do-not-touch in the brief and in the criteria. |
| Audit-supplied line anchors are stale | **High** × Low | Step 2 re-verification. Known repo characteristic: `docs/` lags the code. |
| A doc keeps claiming orders carry a business status, misleading future work | Med × High | Step 5 tree-wide grep. This repo has already lost time to exactly this. |
| Live sheet | Low × Low | Docs only. |

## Security Considerations

- `docs/PERMISSIONS.md` is a reference admins copy `visible_fields` arrays from. A stale example
  there produces real misconfigured roles. Its `status`/`statusNote` examples must state clearly
  that the keys now govern **line** fields.
- Document that `change_status` now means "may set/change a line's status" so no admin assumes
  it still gates an order-level action.

## Next Steps

Phase 8 — live verification and sign-off.
