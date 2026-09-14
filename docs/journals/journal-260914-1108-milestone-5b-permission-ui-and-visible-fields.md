# Journal: Milestone 5b Planning — Permission UI & Visible Fields

**Date:** 2026-09-14  
**Status:** PLANNING COMPLETE  
**Plan Location:** `plans/260914-1049-milestone-5b-permission-ui-and-visible-fields/plan.md`  
**Plan ID:** ck:plan (via /ck:plan for gaps discovered post-M5.3b)

---

## Summary

Completed planning for Milestone 5b (M5b exit criterion: permission labels on homepage, granted-only view for non-admins, visible-fields editor in admin config). Scope includes two sequential UI gaps in the apps/web + apps/api split: (1) homepage "Quyền hạn" card currently shows all 14 permission keys as raw snake_case to every user; (2) admin permission matrix shipped (M5.3b) but has no UI for editing `visible_fields` (which Orders/OrderLines/Invoices columns a user may see). One concrete test-suite regression risk identified & pre-solved; one security-history callout captured; 5 active phases ready for `/ck:cook`.

---

## Gap 1 Decision: Admin Gate + Hidden Denied Permissions

**Current behavior:** homeHtml() in apps/web/ui/App.html (lines 186–213) renders all 14 permission keys as raw snake_case (view_orders, manage_users, etc.) to every user, showing both granted and denied visually styled differently.

**New behavior:**
- **Non-admin users** (detected via `!manage_users` permission): See ONLY their granted permissions, labeled in Vietnamese (via new shared PERMISSION_GROUPS constant). Denied permissions hidden entirely, not just styled.
- **Admin users** (`manage_users` permission): See full list, labeled in Vietnamese, styled granted vs denied. Same visual shape as today, just with labels.
- **Homepage "Cột được xem" line removal:** Explicit user decision — visible-fields display belongs only in admin config, not homepage.

**Rationale:** Feedback indicated showing denied permissions to restricted users is both confusing and unnecessary. Homepage becomes a "what can I do" view, not an inventory of all possibilities. Admins get full visibility for oversight. Gating on `manage_users` (already the "is admin" signal in existing permission preset logic) keeps the check simple.

---

## Gap 2 Decision: Visible-Fields Editor + Live Field Source

**Current behavior:** Admin permission matrix editor (apps/web/ui/ViewsAdmin.html) has full 14-checkbox UI (M5.3b shipped) but zero UI for visible_fields. Backend's cleanPermissionMatrix_ (apps/api/Admin.gs, lines 207–241) already validates and accepts any client-supplied subset of real column names; the frontend simply always copies visible_fields from the resolved preset base (collect(), line 884).

**New backend source (Phase 2):** Add visibleFieldGroups_() to apps/api/Config.gs, sourced LIVE from HEADERS.Orders/OrderLines/Invoices, deduped (several column names like 'customer'/'createdBy' appear in multiple entities). New action actionListVisibleFieldGroups_ in Admin.gs (gated on manage_users), registered in Router.gs, with pass-through in apps/web/Main.gs. This design avoids hardcoding a duplicate copy and prevents drift across the sibling M5a plan's upcoming schema changes (status/statusNote moving from Orders to OrderLines).

**New frontend UI (Phases 3–4):** Grouped checkboxes (Đơn hàng / Dòng đơn hàng / Hoá đơn) + "Toàn bộ cột" (all columns / ['*']) master toggle in new partial apps/web/ui/AdminVisibleFields.html (modularization — ViewsAdmin.html is already 1578 lines, 7.8x the project's 200-line guideline). Both collect() and refreshCustomisedBadge_() will read visible_fields via a shared helper to prevent duplication.

---

## Critical Finding: Test-Suite Breakage Risk (Pre-Solved)

**Discovery:** tools/offline-tests/admin-ui.test.js evaluates ViewsAdmin.html's raw source in a bare `vm` sandbox (line ~80: `sandbox.window = {}`). The moment Phase 1 extracts PERMISSION_GROUPS into a new shared partial and ViewsAdmin.html reads `window.PERMISSION_GROUPS` instead of declaring its own literal, the test suite breaks immediately — undefined reference in a sandbox with no preload of PermissionLabels.html.

**Risk scope:** Test file has TWO separate sandboxes: main one (Group A–J) and a second isolated one for Group K (~line 510). Both would need the partial preloaded.

**Solution (scoped into Phase 1, not deferred):** Update admin-ui.test.js to include PermissionLabels.html source in both sandbox initializations before evaluating ViewsAdmin.html. This was explicitly documented in the plan as a "Phase 1 implementation step" to prevent silent test breakage after code lands.

---

## Security Callout: R3 History

**Prior incident (2026-09-10, R3 escalation):** Hard-coded `['*']` on every visible_fields save silently granted all money columns (invoice totals, payment amounts, etc.) to restricted roles who should never see them. This was a high-severity privilege escalation.

**Mitigation in Phase 4 code design:** New visible-fields checkbox editor code path NEVER defaults to hardcoding `['*']` as a safety fallback. A `['*']` value is only written to the permission matrix when a human explicitly checks the "Toàn bộ cột" master toggle. No magic defaults, no silent escalation.

**Related test assertion:** Existing regression-guard test (admin-ui.test.js, Group I, ~lines 510–524) asserts that visible_fields equals the base (because nothing currently lets it change). This test will REMAIN UNCHANGED and STILL PASS after Phase 4 lands — the new checkbox-absent fallback path mirrors the existing behavior exactly. Test is a guard, not a constraint.

---

## Cross-Plan Dependency (Resolved Non-Blocking)

**Discovery:** Sibling plan `plans/260914-0907-milestone-5a-order-status-to-line-level` (M5a, pending) modifies HEADERS.Orders/OrderLines schema (moving status/statusNote from Orders to OrderLines). This plan's Phase 2 sources visible-field lists LIVE from HEADERS at request time.

**Decision:** No plan-ordering dependency created. Phase 2's design reads HEADERS live on every request (not a hardcoded duplicate copy), so whatever schema changes M5a makes are automatically reflected in the visible-fields list. Plans can execute in parallel without coordination overhead.

---

## Final State

**5 Active Phases:**
1. ✅ Shared Permission Labels & Homepage Display (includes test-file update)
2. ✅ Backend Visible-Field Groups Source (Config.gs + Admin.gs + Router.gs)
3. ✅ Admin Visible-Fields Editor Mockups (mock-first validation, Phase 3 deferred pending user review of 2–3 design options)
4. ✅ Admin Visible-Fields Editor Implementation (new AdminVisibleFields.html partial + collect()/refreshCustomisedBadge_() integration)
5. ✅ Tests, Docs Sync & Visual Verification (new homeHtml() offline test, admin-ui.test.js assertions, docs/PERMISSIONS.md, docs/system-architecture.md R3 note update, mandatory screenshot vs mockup comparison)

**Ready for:** `/ck:cook` (Phase 3 mockups require user approval before Phases 4–5 proceed).

---

## Key Decisions & Tradeoffs

| Decision | Alternatives | Why This One |
|----------|--------------|--------------|
| Admin gate on `manage_users` (not new flag) | New `viewAllPermissions` permission | `manage_users` already signals admin intent; avoids permission matrix bloat |
| Hide denied permissions from non-admins (not just style) | Style differently (red/strikethrough) | User feedback: showing denied permissions is confusing; "what can I do" view is clearer |
| Visible-fields source reads HEADERS live | Hardcoded copy in Config.gs | Survives M5a schema changes without re-planning; single source of truth |
| New AdminVisibleFields.html partial (not inline) | Keep in ViewsAdmin.html | ViewsAdmin.html already 1578 lines; modularization improves context switching |
| Grouped checkboxes (per-entity) | Flat list of all columns | Aligns with Orders/OrderLines/Invoices entity boundaries; users understand scope |
| Master toggle for all columns (['*']) | Omit all-columns option | Backup option for power users; existing preset system already supports ['*'] |
| Shared helper for collect() + refreshCustomisedBadge_() | Duplicate logic | DRY principle; reduces risk of divergent behavior between two readers |

---

## Lessons Captured

1. **Test sandboxes are execution context, not just observational:** Extracting a shared constant into a new partial breaks tests in a bare sandbox unless the partial is preloaded. This is not a "test is wrong" situation — the sandbox mirrors real Apps Script execution (no global preload). Plan Phase 1 must include test-file updates.

2. **Live data sources beat hardcoded copies for cross-plan safety:** M5a's schema changes won't break visible-fields discovery because Phase 2 reads HEADERS at request time, not at plan/deployment time. This design choice eliminated what would otherwise be a "M5a must complete before M5b" blocking relationship.

3. **Security incident history shapes code patterns:** R3's `['*']` default taught us that magic fallbacks in sensitive code are dangerous. Phase 4 code will only write `['*']` when explicitly chosen, never as a silent escalation path.

4. **Modularization threshold is real and has cascade effects:** ViewsAdmin.html at 1578 lines triggers context-switching burden and introduces merge/rebase friction. New AdminVisibleFields.html partial keeps each file under 200-line guideline and aligns with project standards.

5. **Admin gates using existing permission bits reduce complexity:** Reusing `manage_users` as the admin signal (vs. creating a new permission) is simpler both in schema and in user mental models. Permission matrix is already the source of truth for role definitions.

---

## Unresolved Questions

None at planning level. Phase 3 (Admin Visible-Fields Editor Mockups) is a user-approval gate — 2–3 mockup options will be presented via `/ck:frontend-design` before Phase 4 (implementation) proceeds. No blockers discovered during plan authoring.

---

**Status: PLANNING COMPLETE** ✅  
Ready for Phase 3 mockup generation and user approval.
