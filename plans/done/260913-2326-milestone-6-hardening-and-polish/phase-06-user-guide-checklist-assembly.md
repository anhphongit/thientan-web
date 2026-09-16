---
phase: 6
title: "User guide + checklist assembly"
status: complete
priority: P2
effort: "3h"
dependencies: [1, 2, 4, 5]
---

# Phase 6: User guide + checklist assembly

## Overview

Base scope: "Short user guide in Vietnamese for the employees" (`docs/MILESTONES.md` M6, exit
criterion "Employees can complete a full order lifecycle unaided using the guide"). Format decided
2026-09-13 scope challenge: a markdown doc (`docs/USER_GUIDE_VI.md`), matching the
`GLOSSARY_VI.md`/`CHECKLIST_*_VI.md` convention already established in this repo — not a new
in-app help screen.

This phase also assembles `docs/CHECKLIST_M6_VI.md` (the milestone's live-verification checklist,
same pattern as `CHECKLIST_M2..M5_VI.md`), pulling in Phase 4's already-drafted responsive section
plus new sections for backup, error handling, and the full permission checklist re-run
(`docs/PERMISSIONS.md`) that M6's own exit criteria require.

## Key Insights

- Depends on Phases 1/2/4/5 being functionally complete — the guide describes real button
  labels/flows (e.g. Phase 1's "Sao lưu ngay" button) and the checklist references them; writing
  this first would risk describing features that don't match what got built.
- Audience is **existing employees who already use the app** (Milestones 2-5 already shipped and
  are in live use per `docs/MILESTONES.md`'s progress log) — this is a reference/refresher guide
  for the full order lifecycle, not an onboarding doc explaining Google Sheets/Apps Script concepts
  from zero. Keep it task-oriented: "để tạo đơn hàng mới, làm theo các bước sau," not narrative.
- Reuse `docs/GLOSSARY_VI.md`'s approved vocabulary throughout — the guide is itself a Vietnamese-
  completeness artifact; it should model the standard it's asking users to trust.
- `docs/MILESTONES.md`'s exit criterion is specifically "complete a full order lifecycle unaided" —
  the guide's structural spine should be the order lifecycle (create → edit → status change →
  approve if applicable → invoice/export), not an alphabetical feature list.

## Requirements

- Functional:
  - `docs/USER_GUIDE_VI.md`: covers, at minimum — logging in / account switching (already has
    in-app help per Milestone 1, link to it rather than duplicate), creating an order (multi-line),
    editing, changing status, the approve-status flow (if `approvalFlowEnabled` is on for this
    deployment — confirm current flag state before writing this section, since it changes what
    "unaided" means), filtering/searching the list, exporting, viewing statistics, and (new this
    milestone) the admin backup button if the reading user has `manage_users`.
  - `docs/CHECKLIST_M6_VI.md`: sections for backup (manual button produces a valid, openable copy;
    if the scheduled-trigger stretch shipped, note it separately as "tự động, không cần thao tác"),
    error handling (trigger a deliberate failure path if one exists safely, e.g. a validation
    error, and confirm the message shown is Vietnamese/generic, not a stack trace), Section A
    (responsive, drafted in Phase 4, executed live here in Phase 7), Vietnamese sweep confirmation,
    and a full run-through of `docs/PERMISSIONS.md`'s permission checklist (M6's own exit criterion
    explicitly requires this, not just a repeat of earlier milestones' partial checks).
- Non-functional: matches the existing checklist files' format/tone exactly (open one of
  `CHECKLIST_M4_VI.md`/`CHECKLIST_M5_VI.md` as the template before writing, don't invent a new
  structure).

## Related Code Files

- Create: `docs/USER_GUIDE_VI.md`, `docs/CHECKLIST_M6_VI.md`
- Reference (read, don't modify): `docs/GLOSSARY_VI.md`, `docs/PERMISSIONS.md`,
  `docs/CHECKLIST_M5_VI.md` (most recent, closest template)

## Implementation Steps

1. Read `docs/CHECKLIST_M4_VI.md` and `docs/CHECKLIST_M5_VI.md` fully to match their exact
   section/checkbox format before drafting `CHECKLIST_M6_VI.md`.
2. Confirm current `approvalFlowEnabled` Config flag state (live, not assumed) so the user guide's
   approve-status section matches what employees actually see today.
3. Draft `docs/USER_GUIDE_VI.md` following the order-lifecycle spine above, in
   `docs/GLOSSARY_VI.md`-approved vocabulary throughout.
4. Assemble `docs/CHECKLIST_M6_VI.md`: pull in Phase 4's drafted responsive section verbatim, add
   backup/error-handling/Vietnamese-sweep-confirmation/full-permissions-recheck sections.
5. Cross-check the guide against the actual current UI (button labels, exact copy) — do not
   describe a button label that doesn't match what Phases 1/2/4/5 actually shipped; fix either the
   doc or flag a mismatch back to those phases if something drifted.

## Success Criteria

- [ ] `docs/USER_GUIDE_VI.md` covers the full order lifecycle end to end, task-oriented, in
      approved-vocabulary Vietnamese
- [ ] `docs/CHECKLIST_M6_VI.md` exists, matches the M2-M5 checklist format, and its sections map
      1:1 to M6's documented exit criteria (backup restorability, responsive, permissions, guide
      sufficiency)
- [ ] Every button/label/flow named in the guide matches the actual shipped UI (spot-checked, not
      assumed)

## Risk Assessment

- **Guide could drift from reality if written before Phases 1/2/4/5 settle** — mitigated by the
  explicit `dependencies: [1, 2, 4, 5]` ordering and step 5's cross-check.
- **"Unaided" is subjective** — Phase 7's live verification with Phong is the actual test of
  whether the guide succeeds; this phase can only produce a good-faith draft, not prove
  sufficiency on its own.
