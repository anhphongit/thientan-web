---
phase: 5
title: "Tests, Docs Sync and Visual Verification"
status: pending
priority: P1
effort: "5h"
dependencies: [1, 2, 4]
---

# Phase 5: Tests, Docs Sync and Visual Verification

## Overview

Close out the milestone: new/updated offline test coverage for both features,
a screenshot-vs-mockup comparison for the new visible-fields editor
(mandatory per `.claude/rules/ui-implementation-guidelines.md`), and doc sync
across `PERMISSIONS.md`, `system-architecture.md`, and `MILESTONES.md`'s exit criteria.

## Context Links

- `.claude/rules/ui-implementation-guidelines.md` Rule 2 + Rule 7 — screenshot
  comparison workflow, mandatory before considering Phase 4 complete
- `tools/offline-tests/admin-ui.test.js` — existing suite, Group I (~510-524)
  is the escalation guard whose assumptions this phase re-verifies
- `tools/offline-tests/admin.test.js` — server-side `Admin.gs` coverage
- `docs/PERMISSIONS.md` §1, §3 — permission list and preset table
- `docs/system-architecture.md:227-242,392-400` — `visible_fields` section and
  the R3 threat-model note ("Now carried from base preset; only overridden if
  user explicitly customizes.") — now stale, must be updated to describe the
  real editor
- `docs/MILESTONES.md` — new Milestone 5b section (already added when this
  plan was created; this phase ticks its exit criteria)

## Key Insights

- Per Phase 1 and Phase 4's own "Key Insights", most of the *existing* test
  suite should keep passing with **additions**, not rewrites:
  - `admin-ui.test.js` Group I (visible_fields escalation guard) is expected
    to still pass unmodified — verify this explicitly and document the
    result; only touch it if it unexpectedly fails, and if so treat that as a
    real regression to investigate, not a test to loosen.
  - The one MANDATORY test-file change from Phase 1 (pre-loading
    `PermissionLabels.html` into both `admin-ui.test.js` sandboxes) should
    already be done — this phase just confirms the suite is green, it
    doesn't redo that work.
- No test exists today for `App.html`'s `homeHtml()` — this phase creates the
  first one.
- `docs/system-architecture.md:242`'s "R3" line is specifically about the
  *hardcoded-['*']* bug and its fix (carry-from-base). That fix is NOT
  reverted by this milestone — the base-carry-when-untouched behavior is
  still exactly correct (Phase 4's Key Insights). What changes is that an
  admin now has a real, explicit, human-in-the-loop way to change it away
  from the base. The doc update should describe both facts precisely, not
  imply the R3 protection was removed.

## Requirements

- Functional: full offline suite green; new coverage for both homepage
  display and visible_fields editing; docs describe actual shipped behavior.
- Non-functional: screenshot comparison actually performed and recorded
  (not skipped) per project rules, for the new visible_fields editor and for
  the changed homepage.

## Related Code Files

- Create: `tools/offline-tests/app-home-permissions.test.js` — new test file
  for `homeHtml()`
- Modify: `tools/offline-tests/admin-ui.test.js` — add new assertion groups
  for the visible_fields editor (do not remove/weaken Group I)
- Modify: `tools/offline-tests/admin.test.js` — add assertions for
  `visibleFieldGroups_()`/`actionListVisibleFieldGroups_` (per Phase 2)
- Modify: `docs/PERMISSIONS.md` — note that `visible_fields` is now editable
  per-user via the admin UI (§1's `visible_fields` row currently reads as if
  it's config-only/implicit)
- Modify: `docs/system-architecture.md` — update the `visible_fields` section
  and the R3 threat-model note to describe the real, now-editable UI
- Modify: `docs/MILESTONES.md` — tick Milestone 5b's exit criteria (added at plan creation)

## Implementation Steps

1. **New test**: `tools/offline-tests/app-home-permissions.test.js`, same
   `vm`-sandbox technique as `admin-ui.test.js` (load `PermissionLabels.html`
   into the sandbox, then `App.html`'s script). Cover:
   - A `session.permissions` with `manage_users: false` and a realistic mix
     of granted/denied → `homeHtml()` output contains ONLY the granted
     labels (assert each granted label string is present, assert zero `class="perm"`
     — i.e. no plain/denied chip — appears in the output).
   - A `session.permissions` with `manage_users: true` → output contains all
     14 labels, correct count of `perm on` vs plain `perm` classes matching
     the fixture's granted/denied split.
   - No raw snake_case key (e.g. `view_orders`) appears anywhere in the
     rendered string, for either fixture.
   - `"Cột được xem"` / `"Toàn bộ cột"` text does not appear anywhere in the
     homepage output.
2. **Extend `admin-ui.test.js`**: add a new assertion group (after Group I,
   e.g. "Group L") covering the new editor:
   - Explicitly checking an individual `#f-field-<key>` box (not present in
     base) → saved `visible_fields` includes that key.
   - Explicitly checking the `#f-field-all` master toggle → saved
     `visible_fields` is exactly `['*']`, regardless of individual box states.
   - Unchecking every previously-visible field down to zero → saved
     `visible_fields` is `[]` (confirms the UI allows an intentional empty
     selection, per Phase 2/4's Key Insights that this safely falls back
     server-side, not a client-side bug).
   - Re-confirm (no code change expected) that Group I still passes.
3. **Extend `admin.test.js`**: assertions that every key from
   `visibleFieldGroups_()` validates via `cleanPermissionMatrix_`, and that
   no key appears in two groups (per Phase 2's success criteria — belongs in
   the test suite, not just manual verification).
4. **Screenshot verification** (ui-implementation-guidelines.md Rule 2/7):
   run the app (local dev/clasp deployment per `run` skill or project's usual
   local-preview approach), open the admin edit-user form, expand the new
   visible-fields section, screenshot it, compare side-by-side against
   Phase 3's approved mockup. Check layout structure, grouping, always-visible/
   money-field styling, master-toggle behavior, spacing. Fix any drift before
   marking this phase done. Also screenshot the homepage for both an admin
   and non-admin test account, confirming the label/granted-only behavior
   visually (not just via offline test assertions).
5. **Docs sync**:
   - `docs/PERMISSIONS.md` §1: add a line to the `visible_fields` row noting
     it's configurable per-user via the admin permission matrix editor
     (Milestone 5b), not only inherited from a preset.
   - `docs/system-architecture.md`: update the `visible_fields` section
     (~line 227+) to describe the real editor (grouped checkboxes + "Toàn bộ
     cột" toggle), and update the R3 note (~line 242) to clarify the
     hardcoding bug's fix (carry-from-base-when-untouched) is preserved, with
     explicit editing now layered on top, not replacing it.
   - `docs/MILESTONES.md`: tick Milestone 5b's exit criteria checkboxes (see
     plan.md's "Milestone doc" section) and add a progress-log entry
     following the file's existing style (date, milestone, one paragraph).
6. Run the full offline suite once more after all doc/test changes to
   confirm everything is green together.

## Todo List

- [ ] `app-home-permissions.test.js` created and passing
- [ ] `admin-ui.test.js` new group added; Group I confirmed still passing unmodified
- [ ] `admin.test.js` new assertions added and passing
- [ ] Screenshot comparison done for visible-fields editor vs. Phase 3 mockup
- [ ] Screenshot comparison done for homepage (admin + non-admin)
- [ ] `docs/PERMISSIONS.md` updated
- [ ] `docs/system-architecture.md` updated
- [ ] `docs/MILESTONES.md` exit criteria ticked + progress-log entry added
- [ ] Full offline suite green

## Success Criteria

- [ ] All offline test files pass, old and new, with the total assertion
      count increased (not decreased) relative to before this milestone
- [ ] Screenshot comparisons recorded and match the approved mockup /
      described behavior with no unresolved visual drift
- [ ] `docs/PERMISSIONS.md`, `docs/system-architecture.md`, `docs/MILESTONES.md`
      accurately describe the shipped behavior, with no stale "not built yet"
      or "read-only" language left about visible_fields
- [ ] Milestone 5b's `docs/MILESTONES.md` exit criteria (see plan.md) are all checked

## Risk Assessment

- **Test-suite entropy**: adding coverage without checking existing
  assertions still hold their original intent risks the suite silently
  drifting in meaning. Mitigation: explicitly re-read Group I's assertions
  (not just re-run them) before declaring this phase done, per Phase 4's
  Key Insights.
- **Doc drift**: `system-architecture.md`'s R3 note is easy to either leave
  stale (implies editing is still impossible) or over-correct (implies the
  escalation protection was removed). Get the wording right — both facts are
  true simultaneously.

## Security Considerations

Re-verify, as part of this phase's manual/offline check pass, that:
- A non-`manage_users` user still cannot call `listVisibleFieldGroups` or
  `updateUser`/`createUser` with an arbitrary `visible_fields` and have it
  accepted beyond what `cleanPermissionMatrix_` already allows (no regression
  to the server-side allowlist — this milestone changes nothing there, but
  worth a explicit re-confirmation given the R3 history).
- Self/last-admin locking still hides the visible-fields editor entirely for
  those accounts (Phase 4's requirement), confirmed via test, not just code
  inspection.

## Next Steps

None within this plan — this is the final phase. Follow-on: consider whether
`ViewsAdmin.html`'s remaining bulk (still large even after this phase's
extraction) warrants a dedicated future modularization pass, per
`development-rules.md`'s 200-line guideline — note as a candidate for a
future plan if it comes up, do not scope-creep it into this milestone.
