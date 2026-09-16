# Journal: Milestone 5b — Permission UI & Visible Fields (Completion)

**Date:** 2026-09-14  
**Status:** ✅ COMPLETE  
**Commit:** ffc7a7a  
**Plan Location:** `plans/done/260914-1049-milestone-5b-permission-ui-and-visible-fields/`

---

## Summary

Completed Milestone 5b (M5b exit criteria: permission labels on homepage, granted-only view for non-admins, editable per-user visible_fields). Two independent UX gaps resolved: (1) homepage "Quyền hạn" card now shows Vietnamese-labeled permissions, non-admins see only granted permissions; (2) admin visible_fields editor fully functional with master toggle + grouped checkboxes + two-way sync. Code-review discipline caught and fixed a real bug pre-ship: always-visible fields being incorrectly included in saved visible_fields, which would silently flip preset-based users to `role:'custom'`. Post-completion UX follow-up improved master toggle interaction model. Total: 1,129+ test assertions, **ffc7a7a** on main.

---

## What Was Built

### Phases 1–2 (Parallel Implementation)
- **PermissionLabels.html** (shared partial): Vietnamese-labeled permission groups
- **homeHtml()** rewrite: Non-admins see only granted permissions (gated on `manage_users`); admins see full labeled list
- **listVisibleFieldGroups** (backend): Live field list sourced from HEADERS (37 unique fields deduped across Orders/OrderLines/Invoices), avoids hardcoded duplicate copies

### Phase 3: Mockup-First Design
- Presented 2 design options (grouped always-expanded vs. compact collapsible-with-filter)
- User approved Option B (compact collapsible with inline filter)

### Phase 4: Visible-Fields Editor
- **AdminVisibleFields.html** (new partial): Master "Toàn bộ cột" toggle, per-group collapsible checkboxes, live filter, always-visible/money field tags
- **Code-review catch:** Always-visible fields being included in saved `visible_fields` list. Bug: would silently flip preset-based users (e.g., warehouse) to `role:'custom'` on untouched save. Fixed with regression test.

### Phase 5: Testing & Verification
- 1,129+ test assertions across milestone (homeHtml offline test, admin-ui.test.js coverage, edge cases)
- Docs synced: PERMISSIONS.md, system-architecture.md, MILESTONES.md
- Screenshot verification against approved mockup (zero visual drift)

### Post-Completion: UX Follow-Up
- Master toggle interaction improved: individual checkboxes now render checked whenever a field is effectively visible; true two-way sync added (cascade from master, sync from individuals)
- Checking master checks all non-locked fields; unchecking any individual auto-unchecks master
- Fields remain fully interactive always
- Restricting from "all" is now subtractive (uncheck a few) vs. additive (check dozens)
- 39 new tests added; second code-review pass reconfirmed R3 security contract (`['*']` only written when master explicitly checked)

---

## Critical Finding: R3 History Shaped Review Discipline

**2026-09-10 R3 Incident:** Hardcoded `['*']` on every visible_fields save silently granted all money columns to restricted roles. High-severity privilege escalation.

**M5b Approach:** Every phase's code review explicitly re-verified the invariant: `['*']` is ONLY written when a human explicitly checks the master toggle, never as a silent escalation path. **This discipline caught a real bug during Phase 4 review** — the always-visible-fields false-diff — before it shipped. Not a theoretical concern; the code-review gate actually prevented a live issue.

---

## Key Decision: Security-Sensitive Code Requires Repeated Verification

Visible-fields handling is treated as security-sensitive, not just UX. Every phase re-verified the R3 contract. This pattern worked: caught a genuinely new bug (always-visible-fields shadowing) that would have been invisible to tests but broken the permission model at runtime.

---

## Lessons Captured

1. **Security incident history justifies defensive review patterns:** R3's `['*']` default taught us that magic fallbacks in sensitive code are dangerous. M5b's repeated verification found a real new bug, validating this discipline.

2. **Two-way sync improves restrictive-editing experience:** Master toggle now genuinely reflects the aggregate state of individual checkboxes. Users can restrict from "all" with simple unchecks (subtractive) instead of manually checking dozens (additive).

3. **Code-review gates prevent silent privilege escalation:** The always-visible-fields bug would have escaped functional tests (they would pass) but broken the permission matrix at runtime. Code review + security context caught it.

4. **Post-completion UX polish required rethinking the interaction model:** Initial design (master toggle dims checkboxes via CSS opacity) didn't match the actual use case. User feedback drove true two-way sync, making the UI honest about the underlying state.

---

**Status: COMPLETE & SHIPPED** ✅  
Ready for production deployment.
