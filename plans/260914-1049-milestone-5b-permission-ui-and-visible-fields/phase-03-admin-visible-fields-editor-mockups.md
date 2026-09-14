---
phase: 3
title: "Admin Visible-Fields Editor Mockups"
status: pending
priority: P1
effort: "2h"
dependencies: [2]
---

# Phase 3: Admin Visible-Fields Editor Mockups

## Overview

**Mandatory per `.claude/rules/ui-implementation-guidelines.md` Rule 1 and
`.claude/rules/development-rules.md` "UI Design Process"**: no HTML/CSS for
this new editor gets written (Phase 4) until 2-3 mockup options are presented
and the user picks/approves one. This is explicitly called out in the
project's own rules as required for "permission matrix editors, config
panels" — this feature is exactly that.

## Context Links

- `.claude/rules/ui-implementation-guidelines.md` — mock-first + screenshot
  verification rules this phase and Phase 5 must satisfy
- `apps/web/ui/ViewsAdmin.html:759-821` — existing `permissionDisclosureHtml()`,
  the visual/interaction pattern to stay consistent with (collapsible
  section, group headers, "+ tuỳ chỉnh" badge concept)
- Phase 2's `visibleFieldGroups_()` output shape — the real data the mockups
  must render against (3 groups: Đơn hàng / Dòng đơn hàng / Hoá đơn, ~35-40
  fields total, 3 flagged `alwaysVisible`, ~8 flagged `isMoney`)

## Key Insights

- The existing 14-permission-checkbox editor already solved "grouped
  checkboxes inside a collapsible disclosure, diff-badged against a preset
  base" — the new field editor is the same interaction pattern applied to a
  larger, differently-grouped list. Mockups should explore layout variants
  for a LARGER list (~38 items vs 14), not reinvent the interaction model.
- Must visually distinguish three states per field: normal (toggleable),
  `alwaysVisible` (locked-on, greyed, with a short explanatory note — e.g.
  "luôn hiển thị"), and `isMoney` (a subtle tag/icon, echoing
  `PERMISSIONS.md`'s "money-blindness" concept so an admin restricting a
  warehouse role can spot money columns at a glance).
- Must include the master "Toàn bộ cột" (all columns / `['*']`) toggle
  clearly, since that's the existing semantic shorthand `PERMISSION_PRESETS`
  already uses (`admin`/`sales`/`accounting` → `['*']`) — checking it should
  visually disable/grey the individual checkboxes (they're moot once `['*']`
  is selected) rather than leaving them in a confusing "checked but ignored" state.
- Phone usability is non-negotiable — `docs/MILESTONES.md` M5's own exit
  criteria required "the permission matrix is usable on a phone (card per
  user)" and this is strictly more content per user than that. All 2-3
  options must be evaluated at a phone-width viewport, not just desktop.

## Requirements

- Functional: produce 2-3 distinct, minimal-but-complete HTML mockup options
  (static, non-functional markup is fine — this is a layout/UX decision tool,
  not a prototype) covering:
  1. Layout/grouping approach for ~38 fields (e.g. always-expanded groups vs.
     nested collapsibles vs. a compact multi-column checkbox grid)
  2. Visual treatment for `alwaysVisible` and `isMoney` fields
  3. Placement/prominence of the "Toàn bộ cột" master toggle
  4. How this section relates visually to the existing "Nhóm quyền chi tiết"
     permission checkboxes directly above it (one combined disclosure? a
     second, separate disclosure? two tabs?)
- Present via the Artifact tool (or an equivalent renderable HTML file per
  project convention) so the user can view and compare on both desktop and
  phone width.
- Non-functional: get explicit user approval on ONE option (or an explicit
  merge of elements from more than one) before Phase 4 starts. Document the
  chosen option's key decisions inline in this phase file once approved.

## Architecture

N/A — this phase produces static comparison mockups, not integrated code.
Mockups render Phase 2's real field list/groups (paste the actual
`visibleFieldGroups_()` output shape as static JSON in the mockup, not
placeholder Lorem Ipsum field names) so the user is judging against real content density.

## Related Code Files

- Create: mockup HTML file(s) under this plan's `visuals/` directory (or via
  the Artifact tool, per `development-rules.md` "Visual Aids" — either is
  acceptable; Artifact is preferred for easy side-by-side/phone-width review)
- Read (for visual consistency, do not modify): `apps/web/ui/Styles.html` —
  reuse existing CSS custom properties/classes (`.card`, `.form-section`,
  `.perm-group`, `.field-check`, button styles) so mockups look native to the
  app, not a foreign design

## Implementation Steps

1. Extract Phase 2's real field groups (or a representative static copy) as
   the data source for all mockup options — same content in every option, so
   the comparison is purely about layout/interaction, not content.
2. Build Option A: grouped, always-expanded checkbox sections (closest to the
   existing permission-matrix visual pattern; 3 group headers, all fields
   visible at once under a single "Cột dữ liệu được xem" disclosure).
3. Build Option B: a more compact variant — e.g. per-group collapsible
   sub-sections (nested disclosure), or a 2-column checkbox grid on desktop
   collapsing to 1 column on phone, aimed at reducing scroll length for the
   ~38-item list.
4. (Optional third option) Build Option C only if Options A/B reveal a real,
   distinct third direction worth comparing (e.g. a searchable/filterable
   list) — do not manufacture a token third option with no real difference.
5. Render all options as one Artifact (tabs or stacked sections, phone-width
   safe) and present to the user for review.
6. Record the user's choice (and any requested tweaks) directly in this
   phase file's "Chosen Mockup" section below, before starting Phase 4.

## Todo List

- [ ] Option A built
- [ ] Option B built
- [ ] Option C built only if warranted
- [ ] Presented to user via Artifact
- [ ] User approval recorded below (chosen option + any tweaks)

## Chosen Mockup

<!-- Fill in after user approval, before Phase 4 begins:
     - Chosen option (A/B/C or a named hybrid)
     - Key visual decisions locked in (grouping style, always-visible/money
       field treatment, master-toggle placement, relationship to the
       existing permission checkboxes)
     - Any user-requested tweaks not reflected in the original mockup -->

## Success Criteria

- [ ] 2-3 real, distinct mockup options presented (not variations differing
      only in color/spacing)
- [ ] User has explicitly approved exactly one option (or a named hybrid)
- [ ] The approved option is documented in this file, referenceable during
      Phase 4 implementation and Phase 5's screenshot-comparison step
- [ ] Approved option was evaluated at both desktop and ~360px phone width

## Risk Assessment

- **Skipping this phase** is the single highest-risk shortcut available here
  — `.claude/rules/ui-implementation-guidelines.md`'s own "Failure mode we
  hit" examples are exactly this class of mistake (built the wrong
  fundamental structure, had to redo it). Do not let Phase 4 start without a
  recorded approval in this file.
- **Content-density surprise**: ~38 checkboxes is a lot more than the
  existing 14-permission matrix. If every mockup looks cluttered even in
  Option B's compact form, escalate to the user rather than picking the
  least-bad option silently — a real UX problem (e.g. "should this be a
  search box instead of exhaustive checkboxes") is worth surfacing before
  Phase 4, not after.

## Next Steps

Phase 4 implements exactly the approved mockup — no material layout
deviation without going back to the user.
