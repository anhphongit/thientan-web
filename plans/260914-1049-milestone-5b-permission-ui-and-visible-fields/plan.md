---
title: "Milestone 5b — Permission Labels & Per-User Visible Fields Config"
description: "Homepage 'Quyền hạn' shows Vietnamese labels and hides denied permissions from non-admins (admins see all, styled granted/denied); admin permission matrix editor gains a real per-user visible_fields (column visibility) checkbox editor — today it's read-only, inherited silently from whichever preset the user's base resolves to."
status: pending
priority: P2
milestone: "5b"
branch: "main"
tags: [milestone-5b, permissions, admin-ui, visible-fields, i18n]
blockedBy: []
blocks: []
created: "2026-09-14T03:57:03.718Z"
createdBy: "ck:plan"
source: skill
---

# Milestone 5b — Permission Labels & Per-User Visible Fields Config

## Overview

Two independent UI gaps in the existing permission system (backend enforcement is
already correct and unaffected by this plan):

1. **Homepage "Quyền hạn" card** (`apps/web/ui/App.html:186-213`, `homeHtml()`)
   renders all 14 permission keys as raw snake_case strings (`view_orders`,
   `manage_users`, ...) to EVERY user, granted and denied alike. It should show
   Vietnamese labels, and a non-admin should only see what they were actually
   granted — denied permissions add no value to them and just clutter the
   screen. Admins keep seeing the full list, styled granted/denied, since
   they're the ones who might need to reason about the whole matrix. The
   `visible_fields` line ("Cột được xem") is dropped from the homepage
   entirely per user decision — that belongs only in the admin config screen.

2. **Admin permission matrix editor** (`apps/web/ui/ViewsAdmin.html`) has a
   full per-checkbox editor for the 14 boolean permissions (M5.3b, done), but
   `visible_fields` (which Orders/OrderLines/Invoices columns a user may see)
   has **no editor at all** — `collect()` (line 884) always copies it verbatim
   from the resolved preset base, never from any UI control. The backend
   (`cleanPermissionMatrix_`, `Admin.gs:207-241`) already validates and accepts
   any client-supplied subset of real column names — this is a pure frontend
   gap, confirmed by an existing regression test
   (`admin-ui.test.js` Group I) that currently asserts visible_fields can only
   ever equal the base, by design, since there's nothing to change it with.

Both are UI-and-labeling work, not new permission semantics — no changes to
`Permissions.gs`, `filterVisibleFields_`, ownership checks, or the last-admin/
self-escalation guards. Given `visible_fields` had a HIGH-severity escalation
bug as recently as 2026-09-10 (`docs/MILESTONES.md` progress log), Phase 4
implements the new editor to reuse the exact same base-diff/preset-comparison
plumbing that already exists (`permissionsEqual_`, `isCustomised_`) rather than
inventing new save logic, and Phase 5 explicitly re-verifies the escalation
guard test's assumptions still hold.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Shared Permission Labels and Homepage Display](./phase-01-shared-permission-labels-and-homepage-display.md) | Pending |
| 2 | [Backend Visible-Field Groups Source](./phase-02-backend-visible-field-groups-source.md) | Pending |
| 3 | [Admin Visible-Fields Editor Mockups](./phase-03-admin-visible-fields-editor-mockups.md) | Pending |
| 4 | [Admin Visible-Fields Editor Implementation](./phase-04-admin-visible-fields-editor-implementation.md) | Pending |
| 5 | [Tests, Docs Sync and Visual Verification](./phase-05-tests-docs-sync-and-visual-verification.md) | Pending |

Phase 1 and Phase 2 are independent of each other (different files, no shared
state) and can be built in either order or in parallel. Phase 3 depends on
Phase 2 (mockups need the real, deduped field/group list to be realistic).
Phase 4 depends on Phase 3 (mock-first rule — no editor code before an
approved mockup, per `.claude/rules/ui-implementation-guidelines.md`). Phase 5
depends on Phases 1, 2 and 4 all being code-complete.

## Dependencies

No cross-plan blocking relationship. `plans/260914-0907-milestone-5a-order-status-to-line-level`
(Milestone 5a) changes `HEADERS.Orders`/`HEADERS.OrderLines` (moves `status`/
`statusNote` from Orders to OrderLines) — this plan's Phase 2 deliberately
sources the visible-fields group list *live* from `HEADERS` at request time
(never a hand-duplicated field list), so it is correct regardless of which
plan lands first and needs no coordination beyond "don't hardcode the field
list twice." Documented as a note, not a `blockedBy`.

`plans/260913-2326-milestone-6-hardening-and-polish` (M6) does an i18n
completeness sweep ("zero English strings left") — this plan's new Vietnamese
label sets (Phase 1's reused `PERMISSION_GROUPS`, Phase 2's new
`FIELD_LABELS_VI`) are additive good citizens for that sweep, not a
dependency either way.

## Milestone doc

`docs/MILESTONES.md` gets a new `## ☐ Milestone 5b` section (inserted between
5a and the "Unplanned" entry, same pattern as 5a's own insertion) as part of
finalizing this plan — see that file for the authoritative scope/exit-criteria
text mirrored from this plan.
