---
phase: 4
title: "Admin Visible-Fields Editor Implementation"
status: done
priority: P1
effort: "6h"
dependencies: [2, 3]
---

# Phase 4: Admin Visible-Fields Editor Implementation

## Overview

Build the approved (Phase 3) per-user `visible_fields` checkbox editor into
`ViewsAdmin.html`, wired to Phase 2's `apiListVisibleFieldGroups`, and rework
`collect()` / `refreshCustomisedBadge_()` so `visible_fields` is finally read
from real UI state instead of always being copied verbatim from the base
preset. Includes the modularization split (user-confirmed in scope): extract
the new, sizeable chunk of markup/logic into its own included partial rather
than growing the already-1578-line `ViewsAdmin.html` further.

## Context Links

- `apps/web/ui/ViewsAdmin.html:277-286` — existing lazy-load pattern for
  `state.presets` (`apiListPermissionPresets`), the pattern to mirror for
  `state.fieldGroups`
- `apps/web/ui/ViewsAdmin.html:759-821` — `permissionDisclosureHtml()`, sibling
  UI this new section sits next to/inside
- `apps/web/ui/ViewsAdmin.html:838-894` — `collect()`, specifically line 884
  (`perms.visible_fields = (base.visible_fields || ['*']).slice();`) — the
  line being replaced
- `apps/web/ui/ViewsAdmin.html:1554-1574` — `refreshCustomisedBadge_()`,
  specifically line 1563, same read that needs the same fix, kept in sync
- `apps/web/ui/ViewsAdmin.html:176-188` — `permissionsEqual_()`/`arraysEqualAsSets_()`
  — already compares `visible_fields` as a set; **no change needed here**,
  it starts working correctly the moment `collect()` feeds it real data
- `tools/offline-tests/admin-ui.test.js` lines ~510-524 — "Group I" escalation
  guard test; read its exact assertions before touching `collect()` (see Key
  Insights — this test should mostly keep passing unmodified)
- Phase 3's "Chosen Mockup" section — the approved layout to implement exactly

## Key Insights

- **`collect()`'s existing fallback pattern already generalizes correctly.**
  The 14-checkbox loop (`permissionKeys_().forEach`, line 873-879) reads
  `el ? !!el.checked : !!base[key]` — present node wins, absent node falls
  back to base. Apply the exact same shape to the new field checkboxes: a
  helper `collectVisibleFields_(base)` that checks the master "all columns"
  toggle node first, then per-field nodes, falling back to `base.visible_fields`
  only if the master toggle node itself is absent (i.e. the whole new section
  never rendered — same "locked/collapsed" scenario the 14-checkbox loop
  already handles). Factor this into ONE shared helper function called from
  both `collect()` (line 884) and `refreshCustomisedBadge_()` (line 1563) —
  do not duplicate the read logic in two places (the current
  `refreshCustomisedBadge_()` already has an inline duplicate of the pre-5b
  visible_fields line; fix both call sites via the shared helper instead of
  perpetuating the duplication).
- **The existing "Group I" escalation-guard test likely needs NO changes.**
  It stubs `#f-preset` and one `#f-perm-delete_order` checkbox only — it never
  stubs any `#f-field-*` node. Since the new helper's fallback-to-base
  behavior triggers exactly when the master-toggle node is absent from the
  test's DOM stub (`root.querySelector` returns `null` for anything not in
  `fieldValues`, per the test harness's `node()` factory), the test should
  still observe `visible_fields` falling back to
  `base.visible_fields`/`DEFAULT_VISIBLE_FIELDS` unchanged. Verify this by
  running the existing test unmodified after this phase's changes — do not
  preemptively rewrite it. Phase 5 adds NEW test groups for the
  now-legitimate "admin explicitly edits visible_fields" path; it does not
  need to weaken or remove Group I's own assertions.
- Master "Toàn bộ cột" toggle ↔ individual checkboxes relationship: when the
  master toggle is checked, treat `visible_fields` as `['*']` regardless of
  individual checkbox states (matching how `['*']` already behaves
  server-side — an all-or-nothing shorthand, not a 39th field). When
  unchecked, `visible_fields` is exactly the set of checked individual boxes
  (may legitimately be empty — `cleanPermissionMatrix_`/`Permissions.gs`
  already treat empty as "fall back to `DEFAULT_VISIBLE_FIELDS`", so this is
  safe, not a foot-gun, per Phase 2's Key Insights).
- Field checkbox ids must not collide with the existing `#f-perm-<key>`
  namespace (permission keys and field keys are drawn from different
  vocabularies today, but use a distinct prefix — e.g. `#f-field-<key>` —
  defensively, so a future permission key and column name collision can never
  cause a silent bug).
- Modularization (user-confirmed): extract this phase's new markup-building
  function(s) and the field-editor-specific JS (state loading, the new
  `collectVisibleFields_()` helper, checkbox-group HTML builder) into a new
  included partial, e.g. `apps/web/ui/AdminVisibleFields.html`, following the
  same "assign to `window`, no IIFE, included before the consumer" shape as
  Phase 1's `PermissionLabels.html` — `ViewsAdmin.html`'s own IIFE calls into
  it. This is the concrete first step of splitting the 1578-line file down,
  without needing to restructure the rest of the file in this pass.

## Requirements

- Functional:
  - New disclosure section (per Phase 3's approved mockup) renders grouped
    field checkboxes + master "Toàn bộ cột" toggle, seeded from the resolved
    base's `visible_fields` (same base-resolution rules as the permission
    checkboxes: session base-picker > server-derived presetKey > raw stored
    permissions).
  - Editing any field checkbox or the master toggle updates the "+ tuỳ chỉnh"
    badge live (via the shared `refreshCustomisedBadge_()` fix), exactly like
    editing a permission checkbox already does.
  - Saving submits the real edited `visible_fields` (not a copy of base) when
    it differs from base; submits nothing extra (still resolves to
    `presetKeyToSave` path) when untouched — same R1 gating `collect()`
    already does for the 14 booleans, now covering `visible_fields` too.
  - Locked users (self/last-admin) render no field editor at all — same rule
    as the permission checkboxes (`lockPermissions` gate already covers this
    if the new section lives inside the same locked/unlocked branch).
- Non-functional: no new file exceeds ~250 lines post-split (soft target,
  not a hard gate); existing admin flows (create/edit user, preset switch,
  self/last-admin locking) are behaviorally unchanged.

## Architecture

```
ViewsAdmin.html
  render() -> ensurePresetsLoaded() [existing]
           -> ensureFieldGroupsLoaded() [NEW, mirrors ensurePresetsLoaded]
  formCardHtml()
    presetSelectHtml()
    permissionDisclosureHtml()           [existing, unchanged]
    AdminVisibleFields.visibleFieldsDisclosureHtml(u, base, locked)   [NEW, from partial]
  collect()
    ... 14 boolean keys (unchanged) ...
    perms.visible_fields = AdminVisibleFields.collectVisibleFields_(root, base)   [NEW shared helper]
  refreshCustomisedBadge_()
    collected.visible_fields = AdminVisibleFields.collectVisibleFields_(root, base)  [same helper]
```

## Related Code Files

- Create: `apps/web/ui/AdminVisibleFields.html` — new partial: field-group
  HTML builder, `state.fieldGroups` loader, `collectVisibleFields_()` shared helper
- Modify: `apps/web/ui/Index.html` — include the new partial (after
  `PermissionLabels`, before `ViewsAdmin`)
- Modify: `apps/web/ui/ViewsAdmin.html`:
  - `render()`/init path — call the new `ensureFieldGroupsLoaded()`
  - wherever `permissionDisclosureHtml(u, lockPermissions)` is called
    (line ~687) — also call the new visible-fields disclosure renderer
  - `collect()` line 884 — replace with the shared helper call
  - `refreshCustomisedBadge_()` line 1563 — replace with the same shared helper call
- Modify: `apps/web/ui/Styles.html` — any new CSS classes the approved
  mockup introduces (reuse existing `.form-section`/`.perm-group`/`.field-check`
  patterns as much as possible; only add what's genuinely new, e.g. a style
  for the `alwaysVisible`/`isMoney` tags)

## Implementation Steps

1. Create `apps/web/ui/AdminVisibleFields.html` (no IIFE — assigns to
   `window.TTAdminVisibleFields` or similar, consumed by `ViewsAdmin.html`'s
   IIFE the same way `T`/`TT` bridges are consumed elsewhere in the app):
   - `loadFieldGroups_()` — calls `apiListVisibleFieldGroups`, caches result
     (mirrors `ensurePresetsLoaded`'s shape at `ViewsAdmin.html:277-286`
     exactly, including its loading/failure-state handling).
   - `visibleFieldsDisclosureHtml(u, base, locked, fieldGroups)` — per
     Phase 3's approved layout: master "Toàn bộ cột" checkbox
     (`#f-field-all`), then per-group sections of individual checkboxes
     (`#f-field-<key>`), each seeded checked/unchecked from
     `(base.visible_fields||[]).indexOf('*') >= 0` (master) or
     `.indexOf(key) >= 0` (individual, only meaningful when master is
     unchecked). `alwaysVisible` fields render checked + `disabled` with a
     short inline note; `isMoney` fields get a visual tag per the approved mockup.
   - `collectVisibleFields_(root, base)` — the shared read helper:
     ```js
     function collectVisibleFields_(root, base) {
       var allEl = root.querySelector('#f-field-all');
       if (!allEl) return (base.visible_fields || ['*']).slice(); // section not rendered (locked/collapsed)
       if (allEl.checked) return ['*'];
       var out = [];
       (fieldKeys_() /* flatten fieldGroups the same way permissionKeys_() flattens PERMISSION_GROUPS */)
         .forEach(function (key) {
           var el = root.querySelector('#f-field-' + key);
           if (el ? el.checked : (base.visible_fields || []).indexOf(key) >= 0) out.push(key);
         });
       return out;
     }
     ```
     (Adjust exact fallback semantics to match Phase 3's approved mockup if it
     specifies different empty-selection UX, e.g. a warning message — the
     underlying save-what's-checked logic stays the same either way.)
2. `apps/web/ui/Index.html`: add
   `<?!= include_('ui/AdminVisibleFields'); ?>` after `PermissionLabels`
   (Phase 1) and before `ViewsAdmin`.
3. `apps/web/ui/ViewsAdmin.html`:
   - Add `ensureFieldGroupsLoaded()` alongside the existing
     `ensurePresetsLoaded()` call site, following its exact loading/caching shape.
   - In the form-building function (around line 687, right after
     `permissionDisclosureHtml(u, lockPermissions)`), call
     `window.TTAdminVisibleFields.visibleFieldsDisclosureHtml(u, basePermissions_(u), lockPermissions, state.fieldGroups)`
     and append its output.
   - `collect()` line 884: replace
     `perms.visible_fields = (base.visible_fields || ['*']).slice();` with
     `perms.visible_fields = window.TTAdminVisibleFields.collectVisibleFields_(root, base);`
   - `refreshCustomisedBadge_()` line 1563: replace the equivalent line with
     the same call, `collected.visible_fields = window.TTAdminVisibleFields.collectVisibleFields_(root, base);`
   - Wire a change/click listener on the new field checkboxes (and the master
     toggle) to call `refreshCustomisedBadge_()`, same as the existing
     `#f-perm-*` checkboxes already do — find that existing listener wiring
     and extend its selector/delegation to cover `#f-field-*` too.
4. Add any new CSS the approved mockup needs to `Styles.html` (reuse
   `.form-section`/`.perm-group`/`.field-check` first; only add genuinely new
   classes, e.g. `.field-tag-money`, `.field-locked`).
5. Manually exercise the flow once end-to-end (or via `run`/local dev
   harness if available): pick a preset, expand the new section, toggle a
   few fields, confirm the "+ tuỳ chỉnh" badge appears, save, reopen the
   user, confirm the saved `visible_fields` round-trips correctly.

## Todo List

- [x] `AdminVisibleFields.html` partial created with loader, HTML builder,
      shared `collectVisibleFields_()` helper
- [x] Included in `Index.html` at the right position
- [x] `ViewsAdmin.html` wired: load call, render call, `collect()` fix,
      `refreshCustomisedBadge_()` fix, change-listener extension
- [x] New CSS added if the approved mockup needs any
- [x] End-to-end manual check: edit → save → reopen round-trips correctly
- [x] Existing `admin-ui.test.js` Group I still passes unmodified (verify, per Key Insights)

## Success Criteria

- [x] Admin can check/uncheck individual visible_fields for a user and save
      successfully; the change persists and round-trips on reopen
- [x] "Toàn bộ cột" toggle correctly maps to `['*']` and disables/greys
      individual checkboxes while checked
- [x] `alwaysVisible` fields render locked-on with an explanatory note, never
      appear uncheckable-but-unexplained
- [x] "+ tuỳ chỉnh" badge reacts live to a visible_fields edit, same as it
      already does for permission checkbox edits
- [x] Locked users (self/last-admin) show no visible_fields editor, same as
      today's permission checkboxes
- [x] `collect()` and `refreshCustomisedBadge_()` share one read
      implementation — no duplicated logic between them
- [x] Offline test suite green, including the untouched Group I assertions
- [x] Screenshot-verified against Phase 3's approved mockup (see Phase 5)

## Risk Assessment

- **Re-introducing the R3 escalation bug in a new form**: the whole reason
  `visible_fields` was previously left read-only was the 2026-09-10 HIGH
  severity bug where a hardcoded `['*']` silently escalated every save. This
  phase must NEVER hardcode `['*']` as a default in any code path — the only
  place `['*']` is written is when the master toggle is explicitly checked by
  a human. Double-check `collectVisibleFields_()`'s fallback branch returns
  `base.visible_fields`, never `['*']`, when the section isn't rendered.
- **Two call sites drifting**: `collect()` and `refreshCustomisedBadge_()`
  must read `visible_fields` identically or the live badge and the actual
  save can disagree. Mitigated by the shared helper (Key Insights) — do not
  let this regress into two near-duplicate implementations.
- **File growth**: even with the new partial extracted, `ViewsAdmin.html`
  gains new call sites and wiring. Acceptable per user's modularization
  decision — the NEW bulk of markup/logic lives in `AdminVisibleFields.html`,
  not inline in `ViewsAdmin.html`.

## Security Considerations

This phase touches code with a documented prior HIGH-severity escalation bug
(R3, 2026-09-10) — treat with the same care as that fix. The server-side
allowlist (`cleanPermissionMatrix_`) is unchanged and remains the real
security boundary; this phase only adds a legitimate client-side way to
produce a value that boundary already validates. Recommend running
`/ck:code-review` with explicit attention to `collectVisibleFields_()`'s
fallback branches before this phase is considered done.

## Next Steps

Phase 5 adds/updates test coverage for the new editor, re-verifies the
existing escalation-guard assertions, syncs docs, and does the mandatory
screenshot-vs-mockup comparison.

## Addendum (2026-09-14, post-Phase-5 UX refinement)

User feedback after reviewing the live editor: the master "Toàn bộ cột"
toggle only dimmed individual checkboxes (CSS opacity), it didn't actually
check them, and there was no reverse sync. Fixed:
- Individual checkboxes now render **checked** whenever a field is
  effectively visible, including when master/`['*']` is selected (was blank
  before) — `checked = isLocked || masterChecked || membership`.
- Real two-way sync: checking master cascades to check every non-locked
  field (`cascadeFieldMaster_`); unchecking any individual afterward
  auto-unchecks master (`syncFieldMasterFromIndividuals_`). Fields stay fully
  interactive at all times — restricting from "all" is now subtractive
  (uncheck a few), not additive (check dozens).
- Dim/opacity CSS removed (`field-groups--dimmed`), superseded by real
  checked-state.
- `collectVisibleFields_`'s R3 contract (`['*']` only when master node
  present AND `.checked===true`; alwaysVisible excluded from explicit list;
  fallback to `base.visible_fields`, never a bare literal) verified
  unchanged by a dedicated code-review pass.
- New test file `tools/offline-tests/admin-visible-fields-editor.test.js`
  (39 assertions) added for this behavior. Full suite (22 files) green.
- User confirmed against the live deployment.
