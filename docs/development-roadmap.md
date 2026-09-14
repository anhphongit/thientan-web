# Development Roadmap

Living document tracking project phases, milestones, and progress toward production. Includes timeline estimates, completion status, and known blockers.

## Project Overview

**Giai đoạn Thương mại Điện tử** (E-commerce Phase) — Building an admin panel for order management, inventory, and user administration on top of Google Sheets and Google Apps Script.

**Target Users:** Admin (Phong) + 3–5 employees (sales, warehouse, admin staff)

**Tech Stack:** Google Apps Script (server), vanilla JS + HTML/CSS (client), Google Sheets (database)

---

## Completed Milestones

### ☑ Milestone 0 — Setup (2026-08-18)

**Status:** Complete | **Live Verification:** Yes

Everything in [`SETUP.md`](SETUP.md): Google Apps Script project initialization, deployment mode configuration, Script Properties, local development setup.

**Exit Criteria:** All ✅

---

### ☑ Milestone 1 — Foundation (2026-08-18)

**Status:** Complete | **Live Verification:** Yes

Authentication, permissions, app shell in Vietnamese. Employees authenticate as themselves (two-project architecture: `apps/api` + `apps/web`).

**Security Hardening (Unplanned, 2026-08-20):**
- Identity bug fix (privilege escalation where everyone was the owner)
- Deactivation made immediate
- Security layer 2: key expiry, revocation, fingerprint check, audit log
- Account switching redesigned

**Exit Criteria:** All ✅

---

### ☑ Milestone 2 — Order CRUD (Multi-line) (2026-08-27)

**Status:** Complete | **Live Verification:** Yes

Order creation, editing, deletion with multi-line items. Schema settled after Q1/Q3/Q4/Q6 answered. All exit criteria met live.

**Bugs Fixed During Verification:**
- Permission-restricted fields editable in form (backend + UI)
- Hidden fields settable via direct API call
- Quick status change cache invalidation

**Exit Criteria:** All ✅

**Offline Assertions:** 257+ passing

---

### ☑ Milestone 3 — List, Filter, Search, Status (2026-09-03)

**Status:** Complete | **Live Verification:** Partial (list/filter/search verified; approve status not yet)

Paginated order list, filtering (date, customer, status, created-by, approve status), free-text search, quick status change with confirmation.

**Tasks Completed:**
- 3.1: Paginated list (newest first)
- 3.2: Date-range filter
- 3.3: Customer, status, created-by filters
- 3.4: Free-text search across order/PO/customer/description
- 3.5: Quick status change from list card + pending state
- 3.6: Admin one-click approve (separate from edit)
- 3.7: Reusable confirm popup (TT.confirm())
- 3.8: Approve status state machine (Draft/Wait/Approved/Rejected)

**Exit Criteria:** All ✅ (except live verification of 3.8)

**Offline Assertions:** See `codebase-summary.md` §3 (1154 total across 18 suites)

---

### ☑ Milestone 4 — Export + Statistics (In Progress)

**Status:** Partial | **Live Verification:** No

Export (CSV/XLSX/PDF) respecting current filters and visible fields. Statistics dashboard (revenue by week/month/customer/status). CSS-based charts.

**Notes:**
- Not fully scoped yet; layout pending reference Excel review
- Permission matrix (`visible_fields`) must be respected on export

---

### ☑ Milestone 5 — Inventory + Admin UI (Phases 1-3b Complete)

**Status:** Phases 1-3b Complete, Phases 4-5 in Progress | **Live Verification:** M5.1–M5.3 sections A–F

Building admin UI for user management and inventory with permission matrix and product CRUD.

**Phase Breakdown:**

#### M5.1 — Product CRUD (Complete)
- Create/edit/delete products
- Low-stock flag and filter
- Autocomplete in order form
- All tests passing

**Status:** ☑ Complete | **Offline Assertions:** 45+

#### M5.2 — User Management (Complete)
- Create/edit user accounts
- Deactivation with immediate effect
- Permission assignment (preset + custom)
- Last-admin protection (cannot deactivate or strip `manage_users`)
- Self-admin protection (cannot self-promote/demote)

**Status:** ☑ Complete | **Offline Assertions:** 38+

#### M5.3a — Permission Matrix (Complete)
- Matrix display: all 14 permissions, card layout (phone-friendly)
- Preset selection (Admin, Sales, Warehouse)
- Quick customize path (individual checkbox edits)

**Status:** ☑ Complete | **Offline Assertions:** 89+

#### M5.3b — Permission Disclosure UI Redesigned (Complete, 2026-09-10)
- Replaced checkbox toggle with collapsible button ("Nhóm quyền chi tiết")
- Added base-role extension (seed matrix from selected role)
- Auto-labels customization ("+ tuỳ chỉnh")
- Auto-expands on edit when permissions unknown
- Payload decides presetKey vs. permissions based on diff

**Security Fix (R3):** Hardcoded `visible_fields = ['*']` removed from matrix save. Now carries from preset.

**Status:** ☑ Complete | **Live Verification:** M5 checklist E–F ✅

#### M5.4 — Config Editing (In Progress)
- Edit status list, UoM list, customer list from UI
- Cache invalidation (changes appear instantly, no 2-min wait)

**Status:** ◐ Not yet verified

#### M5.5 — Product Code Linking (In Progress)
- Order line product code autocomplete
- Auto-fill name, UoM, price from product
- Optional (no foreign key constraint)

**Status:** ◐ Not yet verified

**Overall M5 Exit Criteria:**
- [x] Admin can create users without touching Google Sheets
- [x] Permission change takes effect on user's next action (immediate, no logout needed)
- [x] Last admin cannot be deactivated
- [ ] Product CRUD works; order lines can link products
- [ ] Permission matrix usable on phone

---

## In-Progress Milestones

### ☐ Milestone 5a — Order Status → Line Status (Not Started)

Not M5.1 (already used, complete — "Product CRUD"). Inserted after M5, before M6, per
project-owner sequencing decision (2026-09-14). Plan:
`plans/260914-0907-milestone-5a-order-status-to-line-level/plan.md`.

**Scope:**
- Remove plain `status`/`statusNote` from `Orders` (keep `approveStatus` untouched)
- Add optional `status`/`statusNote` to `OrderLines`; `StatusHistory` gains `lineId`
- Order list/cards drop status entirely; line status editable only in the order edit form
- `Stats.gs`/`Export.gs` reworked to aggregate by line status
- No backfill of existing order status data

**Timeline:** After M5 complete, before M6

**Exit Criteria:**
- [ ] All offline suites green, including new line-status coverage
- [ ] Live migration run once by the project owner, verified end-to-end
- [ ] Docs synced (DATA_MODEL.md, system-architecture.md, PERMISSIONS.md)

### ◐ Milestone 6 — Hardening & Polish (Not Started)

**Scope:**
- Full responsive pass (real devices)
- Vietnamese completeness (zero English strings)
- Error message audit (no stack traces to users)
- Backup feature (`backupNow()` exports all sheets to timestamped Drive folder)
- Short user guide in Vietnamese

**Timeline:** After M5 complete

**Exit Criteria:**
- [ ] Backup produces restorable copy of all six sheets
- [ ] Every screen usable on iOS Safari + Android Chrome
- [ ] Permission checklist passes (PERMISSIONS.md)
- [ ] Employees can complete order lifecycle unaided

### ☐ Milestone 7 — Legacy Excel Order Import (Not Started)

New milestone, for the live/go-live stage, per project-owner request (2026-09-14). Plan:
`plans/260914-1115-milestone-7-legacy-excel-import/plan.md`. Blocked by M5a and M6.

**Scope:**
- One-time admin migration script imports the real historical `FILE THEO DOI DON HANG.xlsx`
  (~206 orders / ~534 lines, Jan–Aug 2026) into live `Orders`/`OrderLines`/`Invoices`
- Deliberate, scoped exception to the 2026-08-15 "never imported" decision — a one-time
  go-live event, not a reversal of manual-entry-only design
- Raw legacy `.xlsx` parsed as-is (month blocks, multi-line cells, per-line VAT detection)
- Line status populated from the source file directly into `OrderLines` (post-M5a schema)
- Reconciled against the file's own printed monthly revenue totals; requires a fresh M6 backup
  immediately before the live run

**Timeline:** After M5a and M6 complete, before employee rollout with real data

**Exit Criteria:**
- [ ] All 8 months reconcile against printed `DOANH SỐ THÁNG n` totals
- [ ] Live run executed once against production with a fresh verified backup, owner present
- [ ] Spot-checked orders render correctly in the live web app
- [ ] Docs (`EXCEL_REFERENCE.md`, `OPEN_QUESTIONS.md`, `README.md`, `DATA_MODEL.md`) synced

---

## Known Issues & Blockers

### Security (High Priority)

| Date | Issue | Status | Notes |
|------|-------|--------|-------|
| 2026-09-10 | Privilege escalation in `visible_fields` (R3) | FIXED | Hardcoded visible_fields removed; now carries from preset. Users need to retake permissions post-deploy. |
| — | Shared-secret model risk | DOCUMENTED | Accepted risk; mitigated by API permission gates. See `Security.gs`. |

### Known Limitations

| Item | Scope | Resolution |
|------|-------|-----------|
| Approve status state machine | Not yet live (3.8) | Needs full live pass before enabling `approvalFlowEnabled` flag |
| Config cache invalidation | M5.4 | Must verify 2-min cache doesn't block config changes |
| Product code foreign key | M5.5 | Not enforced (optional link); allows old data without products |

---

## Timeline & Dependencies

```
M0 (Setup)
├─→ M1 (Foundation) ✅ 2026-08-18
    ├─→ M2 (Order CRUD) ✅ 2026-08-27
    │   └─→ M3 (List/Filter/Search) ✅ 2026-09-03
    │       └─→ M4 (Export/Stats) ◐ In Progress
    └─→ M5 (Inventory + Admin) ◐ Phases 1-3b ✅, Phases 4-5 ◐ In Progress
        └─→ M5a (Order Status → Line Status) ☐ Not Started
            └─→ M6 (Hardening & Polish) ☐ Not Started
                └─→ M7 (Legacy Excel Order Import) ☐ Not Started
```

### Critical Path

**Go/No-Go Decisions:**
1. ✅ M3.8 (approve status) live verified before using in production
2. ◐ M5 Phases 4–5 complete and tested live before M6
3. ☐ M5a (order status → line status) complete and live-verified before M6
4. ☐ Full M6 hardening done before employee rollout
5. ☐ M7 (legacy Excel import) reconciled and live-verified before employees start using real
   historical data

---

## Success Metrics

| Metric | Target | Status |
|--------|--------|--------|
| **Offline test coverage** | >300 assertions | 1154 (18 suites) ✅ — see `codebase-summary.md` |
| **Permission matrix phone-usable** | No horizontal scroll, 44px+ targets | ✅ (M5.3) |
| **Admin privilege protection** | Last admin + self-admin checks enforced | ✅ (M5.2) |
| **Security vulnerabilities** | Zero severity-high unresolved | 0/0 ✅ (R3 fixed) |
| **Live verification** | Every milestone tested on real Google account | 4/6 milestones ✅ |
| **Vietnamese completeness** | Zero English strings in UI | Not yet audited (M6) |
| **Response time** | Order list <3s with year of data | ✅ Confirmed (M3) |

---

## Notes & Decisions

**Approved Design Decisions:**
- Two-project architecture (`apps/api` + `apps/web`) for employee authentication
- Permission matrix on admin tab (not in order form)
- Preset + custom path (no complex UX for rarely-needed permission tweaks)
- CSS-based charts, not charting library (M4)
- Collapsible permission group (not toggle checkbox) for clarity (M5.3b)

**Deferred / Out of Scope:**
- `export_statistics` (reserved for future stats export UI)
- Optional customer/UoM/status picker validation (values not enforced as foreign keys)
- Multi-language support (Vietnamese only for now)

---

## Revision History

| Date | Change | Milestone |
|------|--------|-----------|
| 2026-09-10 | M5.3b permission UI redesign + R3 security fix documented | M5 |
| 2026-09-03 | M3 signed off; M4 roadmap clarified | M3–M4 |
| 2026-08-27 | M2 signed off; M5 timeline projected | M2–M5 |
| 2026-08-18 | M0 + M1 signed off; security hardening unplanned phase logged | M0–M1 |
| 2026-08-15 | Initial roadmap created; blocked on Q1/Q3/Q4/Q6 | Project Init |
