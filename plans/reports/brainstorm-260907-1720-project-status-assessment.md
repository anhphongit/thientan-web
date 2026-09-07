# Project Status Assessment — THIENTAN Order & Inventory Management

**Date:** 2026-09-07  
**Assessment Scope:** Complete review of all project documentation and git history  
**Project Phase:** Active mid-stage implementation (Milestones 4–5)

---

## Executive Summary

**THIENTAN** is a Vietnamese order/inventory management web app for a small business. Built on **Google Apps Script + private Google Sheets**, it's designed for 1 admin + 5–6 employees managing ≤100 orders/month.

**Current Status:** Project is **tracking ahead of documented schedule**. Milestones 0–3 are complete and verified live. Milestone 4 (Export + Statistics) is largely built but undergoing live verification. Milestone 5 (Inventory + Admin UI) has begun implementation despite the official plan marking it as not-started.

---

## Project Architecture (Confirmed)

**Stack:**
- **Backend:** Google Apps Script (deployed as web app)
- **Frontend:** HTML + vanilla JavaScript (no frameworks), fully responsive
- **Data:** Private Google Sheets (owner-only direct access)
- **Auth:** Google account login (employee must auth as themselves)
- **Two-project deployment:** `apps/api` (Execute as Me) + `apps/web` (Execute as User) — employees see their own identity

**Key Security Model:**
- Server-side permission checks on every action
- Fine-grained permission matrix per user (view/create/edit/delete orders, view_all_orders, manage_inventory, manage_users, etc.)
- Field-level visibility control — users see only columns they have access to
- Shared-secret rotation for inter-app communication (30-day expiry, phone-friendly revocation)
- Threat model documented in `docs/SECURITY.md`

---

## Milestone Completion Status

| Milestone | Scope | Official Status | Actual Status | Verified Live |
|-----------|-------|-----------------|---------------|---------------|
| **0** — Setup | Clasp, Apps Script scaffolding | ☑ Done | ✅ Complete | 2026-08-18 |
| **1** — Foundation | Auth, permissions, shell | ☑ Done | ✅ Complete | 2026-08-18 |
| **2** — Order CRUD | Multi-line orders, money/VAT, edit/delete | ☑ Done | ✅ Complete + hardened | 2026-08-27 |
| **2.5–2.5c** — Performance | Caching, pagination, skeleton UI | ☑ Done | ✅ Complete | 2026-08-26 |
| **3** — List/Filter/Search/Status | Filtering, search, status workflow, approve flow | ☑ Done | ✅ Complete + new approval flow | 2026-09-03 |
| **4** — Export + Statistics | CSV/XLSX/PDF export, revenue charts by week/month/quarter/year | ◐ In Progress | ✅ Built, **pending live verification** | TBD |
| **5** — Inventory + Admin | Product CRUD, user management, permission matrix UI | ☐ Not Started | ✅ **In active development** | Not yet |
| **6** — Hardening & Polish | Backup, responsive sweep, Vietnamese completeness | ☐ Not Started | — | — |

### Key Finding: Work is ahead of documentation

Recent git commits show **Milestone 5 work already started** (Admin and Products modules), but `docs/MILESTONES.md` still marks it as not-started. The documentation was last updated after Milestone 3's verification on 2026-09-03; development has continued since.

---

## What's Implemented & Verified Live

### Milestone 2 Hardening (Verified 2026-08-27)
Beyond the original CRUD scope, five critical permission bugs were found and fixed:
- **B1**: Edit could wipe a restricted field (PO) with blank value
- **B2**: Save/delete left form interactive during request flight
- **B3**: Multiple actions could fire simultaneously (save + delete race)
- **B4**: Hidden fields (invisible to restricted roles) were rendered empty, not hidden — wipe risk on edit
- **B5**: **Critical:** New orders/lines could bypass `visible_fields` via direct API calls — role without `po` visibility could set `po` to anything via POST. Fixed with `clampHiddenOrderFields_` / `clampHiddenLineFields_`.

**Result:** Permission surface fully reviewed, fails-closed model confirmed, 257 offline test assertions pass.

### Milestone 3 Order Approval Flow (New in this cycle)
Beyond the original "List/Filter/Search" scope:
- **Task 3.5:** Quick status change directly from order card (separate from full edit flow)
- **Task 3.6:** Admin approval button + `approveOrder` action (one-way, idempotent)
- **Task 3.8:** **New `approveStatus` state machine** (Draft → Wait For Approved → Approved/Rejected) that **gates editing itself**
  - Replaces the original "plain admin-approve stamp" with real workflow control
  - Every approve/reject requires `approve_order` permission (separate from `edit_order`)
  - Behind `approvalFlowEnabled` config flag (default off, can switch without migration)
  - 404 offline test assertions covering the matrix; live verification pending

### Performance & UX Polish (Built alongside Milestone 2–3)
- Client-side list cache + skeleton cards (60s TTL, "Làm mới" button to force-refresh)
- Order detail cache + "Tải lại" button
- Server-side list caching (via `CacheService`, keyed by data version)
- Pagination (20-row pages)
- Status color-coding per workflow step
- Optimistic writes + stale-while-revalidate pattern

### Test Coverage
- **257 offline assertions** across Milestone 2 permission/CRUD tests
- **404 assertions** for Milestone 3 (filter/search/approve-status logic)
- **Whole-repo total:** See `TASKS.md` for per-milestone breakdown; runs via `node tools/offline-tests/*.test.js`
- Tests verify permission matrix enforcement, not just UI behavior

---

## Milestone 4 Status (Export + Statistics)

**Official Exit Criteria:**
- [ ] Exported file matches filtered list on screen
- [ ] User cannot export columns outside `visible_fields`
- [ ] PDF recognizable to current-Excel users
- [ ] Vietnamese characters render in CSV/XLSX/PDF
- [ ] Revenue reconciles against reference Excel
- [ ] `view_statistics` / `export_statistics` permissions enforced

**Git Evidence (commits since Milestone 3 sign-off):**
- `Milestone4: Export CSV base on order line invoice date` (dad2577)
- `Milestone4: Export XLSX` (59891f3)
- `Milestone4: Export PDF` (c5f5b13)
- `Milestone4: Export large orders` (b2fefb9)
- `Milestone4: Export large orders email deliver` (96ff069)
- `Milestone4: Export Drive Retentions` (83f69c9)
- `Milestone4: Statistic` (72e46ef)
- `Milestone4: Statistic by customer and by status` (9ecce78)
- `Milestone4: Done` (316fe2a)

**Status:** Code appears built and feature-complete. Needs live verification against the exit criteria checklist (none of the checkboxes are ticked yet).

---

## Milestone 5 Status (Inventory + Admin UI)

**Official Scope:**
- `Inventory.gs` + UI: product/stock CRUD, low-stock flag
- `Admin.gs` + UI: user list, add/edit/deactivate, permission matrix editor, Config editing

**Git Evidence (most recent commits):**
- `Milestone5: Products` (124a071)
- `Milestone5: Admin` (1030566)

**Status:** Already in active development, though officially marked "not-started." Implementation has begun; completion status unknown without code review.

---

## Documentation Organization

All docs live in `./docs/`:

| File | Purpose | Status |
|------|---------|--------|
| `PROJECT_INSTRUCTION.md` | Requirements spec (source of truth) | ✅ Current |
| `MILESTONES.md` | Build plan with exit criteria + progress log | ⚠️ Out of date (last entry 2026-09-03, work continues) |
| `TASKS.md` | Per-milestone task breakdown | ⚠️ Partially out of date (Milestone 5 started but not yet reflected) |
| `DATA_MODEL.md` | Sheet schemas, field types, ID rules | ✅ Current |
| `PERMISSIONS.md` | Permission matrix, enforcement rules | ✅ Current (corrected for Q1/Q3/Q4/Q6) |
| `SECURITY.md` | Threat model, key expiry, revocation, audit log | ✅ Current |
| `IDENTITY.md` | Why two-project split (employee sees own identity) | ✅ Current |
| `CONVENTIONS.md` | Code style + patterns | ✅ Current |
| `GLOSSARY_VI.md` | Vietnamese UI wording | ✅ Current |
| `SETUP.md` | One-time setup steps | ✅ Current |
| `OPEN_QUESTIONS.md` | Decisions pending from Phong | ⚠️ Mostly answered (Q1/Q3/Q4/Q6 done; check for Q2/Q5/Q7+) |
| `CHECKLIST_M2_VI.md` | Milestone 2 live verification checklist | ✅ All boxes checked 2026-08-27 |
| `CHECKLIST_M3_VI.md` | Milestone 3 live verification checklist | ⚠️ Sections A–H checked; Section I (approval flow) marked "ready to check" after task 3.8 |

**Observation:** Documentation is comprehensive but lags implementation. Progress log in `MILESTONES.md` is accurate up to Milestone 3 sign-off (2026-09-03); subsequent work isn't reflected.

---

## Key Decisions Already Made (Do Not Re-open)

1. **Option C Architecture:** Google Apps Script + Sheets (not Option B self-hosted Node.js)
2. **Two-Project Split:** `apps/api` (Execute as Me) + `apps/web` (Execute as User) so employees auth as themselves
3. **Permission Model:** Server-side enforcement, fine-grained matrix per user, ownership-scoped reads
4. **No Frameworks:** Vanilla JS on frontend (no React/Vue), Apps Script on backend
5. **Approval Flow:** Real state machine (Draft/Wait/Approved/Rejected) that gates editing, not just a stamp (decided during Milestone 3, task 3.8)
6. **Data Visibility:** Field-level `visible_fields` per role; money-blind roles preserve existing values on edit

---

## Outstanding Work

### Immediate (Next Session)

**Milestone 4 Live Verification:**
- Run `CHECKLIST_M4_VI.md` (needs to be created or is implicit in the exit criteria)
- Verify export formats (CSV/XLSX/PDF) against the reference Excel file
- Confirm permission gating (`view_statistics` / `export_statistics`)
- Test on real phone + PC
- Tick off exit criteria in `MILESTONES.md`

**Milestone 5 Status Check:**
- Code review of Inventory + Admin modules (currently mid-build)
- Verify permission matrix UI — is `manage_users` enforced?
- Test user add/deactivate on real device

### Follow-up

**Milestone 6 Scope** (not yet started):
- Backup function (export all sheets to timestamped Drive folder)
- Full responsive pass on real iOS/Android
- Vietnamese completeness sweep (zero English strings)
- Error message review (no stack traces to users)
- User guide for employees (Vietnamese)

**Approval Flow Live Test:**
- `approvalFlowEnabled` flag must be flipped on in the live `Config` sheet
- `migrateAddApproveStatus()` must be run once before testing (adds new columns to `Orders` sheet)
- Full workflow test: create order (Draft) → request approval (Wait For Approved) → approve/reject (Approved/Rejected)
- Verify edit-gating matrix (who can edit at each state)
- Test on restricted employee role (should not see approval buttons if no `approve_order` permission)

---

## Questions & Observations

### Unresolved in Docs
1. **Has `OPEN_QUESTIONS.md` Q2/Q5/Q7+` been answered?** Q1/Q3/Q4/Q6 are ticked; check if more questions emerged during Milestone 4–5 build.
2. **Approval flow live status:** Marked "ready to check" in `CHECKLIST_M3_VI.md`, but no confirmation it's been tested live yet. The flag must be on and migration run.
3. **Milestone 4 exit criteria:** No checklist document found (`CHECKLIST_M4_VI.md` doesn't exist). Will need to be created or inferred from `MILESTONES.md` prose.

### Discrepancies
1. **Documentation lag:** `MILESTONES.md` last updated after M3 sign-off (2026-09-03). Milestone 4 built + work on Milestone 5 started, but docs don't reflect it. Recommend updating after M4 verification.
2. **Approval flow scope creep:** Task 3.8 introduced a full state machine beyond the original "admin approve/delete" scope. It's architected well and tested offline (404 assertions), but represents a design pivot mid-milestone that users should be aware of.

### Risk Flags
1. **Permission B5 (critical direct-API bypass):** Fixed with `clampHiddenOrderFields_`. Worth spot-checking after any future permission model changes.
2. **Shared-secret model:** `SECURITY.md` accepts this as documented risk. Key rotation working, but anyone with the secret can impersonate any user — mitigated only by 30-day expiry + Sheets-only revoke, not by Apps Script code.
3. **Milestone 4 export**: No live verification recorded yet despite code being committed. Recommend testing before considering M4 "done."

---

## Recommendations

### For Next Session

**Immediate action items:**
1. **Verify Milestone 4:** Create `CHECKLIST_M4_VI.md` if it doesn't exist. Run full export/statistics verification on PC + phone. Tick off exit criteria.
2. **Review & integrate Milestone 5:** Code review Inventory + Admin modules, test on real devices, ensure permission matrix UI works end-to-end.
3. **Update documentation:** After M4 verification, update `MILESTONES.md` progress log and `TASKS.md` to reflect current state. Mark Milestone 5 as "in progress."
4. **Run live approval test:** If not yet done, enable `approvalFlowEnabled` in Config, run `migrateAddApproveStatus()`, and test the full Draft → Approve → Approved workflow with multiple roles.

### Strategic

1. **Test coverage:** Current 600+ offline assertions is strong. Ensure Milestone 5 (Admin UI, especially permission matrix editor) has similar coverage before ship.
2. **Performance:** No new performance work is scoped for Milestones 4–5. Milestone 2's caching/pagination strategy should carry through; monitor if stats queries (full revenue scan) become slow with real data.
3. **Responsive design:** No dedicated phone pass recorded for Milestone 4 export/stats views yet. Flag if PDF/chart rendering doesn't work well on phones.

---

## Summary Table

| Milestone | Scope | Build Status | Live Verification | Ready to Ship |
|-----------|-------|--------------|-------------------|---------------|
| 0 | Setup | ✅ | ✅ 2026-08-18 | ✅ |
| 1 | Foundation | ✅ | ✅ 2026-08-18 | ✅ |
| 2 | Order CRUD | ✅ + hardened | ✅ 2026-08-27 | ✅ |
| 3 | List/Filter/Search | ✅ + approval flow | ✅ 2026-09-03 | ⚠️ Approval flow needs live test |
| 4 | Export + Stats | ✅ Built | ⏳ Pending | ⏳ |
| 5 | Inventory + Admin | ✅ In progress | — | — |
| 6 | Polish & Backup | — | — | — |

---

**End of Assessment**
