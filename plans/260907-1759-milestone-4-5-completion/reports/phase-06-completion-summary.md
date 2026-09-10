# Phase 6 — M5 Live Testing & Sign-Off
## Completion Report

**Status:** DONE (deliverables complete, ready for live testing)  
**Date:** 2026-09-07 23:00  
**Effort:** ~2 hours (planning + checklist creation + guide)  
**Phase:** 6 of 7 (final verification before M5 sign-off)

---

## Executive Summary

Phase 6 deliverables are complete. Two comprehensive documents created:

1. **`docs/CHECKLIST_M5_VI.md`** (202 lines)
   - 10 sections (A–K) covering all M5 features
   - 60+ individual test items
   - Vietnamese language (matches project standard)
   - Mapped to 5 exit criteria in MILESTONES.md

2. **Testing Guide** (in reports directory)
   - Pre-testing setup (setupMilestone5(), deployments)
   - Multi-device approach (PC + real phone)
   - Multi-account approach (admin, sales, warehouse)
   - Common issues & mitigations
   - Sign-off process (MILESTONES.md, TASKS.md updates, commit)

**Ready for:** User to execute live testing following the checklist and guide.

---

## Deliverables

### ✅ CHECKLIST_M5_VI.md

**File:** `/Users/phongna/anhphongit/Projects/thientan-web/docs/CHECKLIST_M5_VI.md`

**Structure:**
- **A. Kho hàng — CRUD (5.1)** — 13 items: create, edit, delete, unique code, pagination, confirmation
- **B. Cảnh báo tồn thấp (5.1)** — 6 items: low-stock badge, stockQty ≤ minStock, filter behavior
- **C. Tìm kiếm & lọc kho (5.1)** — 5 items: search by code/name, active/inactive toggle
- **D. Người dùng — CRUD (5.2)** — 14 items: create, email (read-only), deactivate, search, include-inactive
- **E. Bảo vệ quản trị viên (5.2)** — 12 items:
  - E.1: Self-protection (can't remove own manage_users) via preset + matrix paths
  - E.2: Last-admin protection (can't deactivate or strip manage_users) via preset + matrix paths
- **F. Ma trận quyền (5.3, Phase 3)** — 14 items: 14-checkbox matrix, preset switching, card layout, phone usability
- **G. Sửa cấu hình (5.4, Phase 4)** — 13 items: add status/UoM/customer, **immediate cache invalidation** (not 2-min delay), key protection
- **H. Liên kết mã hàng (5.5, Phase 5)** — 6 items: product autocomplete, auto-fill name/UoM/price, unknown codes still save
- **I. Quyền & điều hướng (5.3, 5.2)** — 10 items: tab visibility per account, server-side refusal on direct URL
- **J. Hiệu lực quyền tức thì (5.2, MILESTONES.md:182)** — 5 items: permission change takes effect **immediately on next action** (no logout, no 2-min wait)
- **K. Điện thoại (K.1–K.4)** — 16 items: responsive UI on iOS Safari / Android Chrome (real device required)

**Total:** 114 checkboxes organized in 10 sections

**Key Emphasis:**
- Every item is ✅ or ❌ (binary pass/fail)
- Vietnamese throughout (matches project language)
- Phone testing on real device, not desktop emulation
- Two protection paths tested (preset + matrix)
- Immediate permission/config effect (not cached delays)

### ✅ Testing Guide

**File:** `/Users/phongna/anhphongit/Projects/thientan-web/plans/260907-1759-milestone-4-5-completion/reports/general-purpose-260907-2300-m5-testing-guide.md`

**Contents:**
1. **Pre-Testing Checklist** (3 steps)
   - Run setupMilestone5() and verify Products sheet exists
   - Deploy apps/api then apps/web
   - Verify apps are live and accessible

2. **Testing Approach**
   - Multi-device: PC for A–J, real phone for F/G/K
   - Multi-account: admin, sales, warehouse with correct permissions
   - Test order and time estimates (~3 hours total)

3. **Common Scenarios**
   - Scenario 1: Permission change immediate effect (Section J)
   - Scenario 2: Last admin cannot be deactivated (Section E.2)
   - Scenario 3: Config edit invalidates cache (Section G)

4. **Expected Issues & Mitigations**
   - New product defaults to low-stock (expected, not a bug)
   - Permission change doesn't take effect (cache issue)
   - Config edit has 2-min delay (cache invalidation missing)
   - Matrix checkboxes don't fit on phone (CSS issue)

5. **Sign-Off Process**
   - Update MILESTONES.md:172 (M5 → ☑)
   - Check all 5 exit criteria (lines 180–185)
   - Update TASKS.md:3016–3017 (M5.1/M5.2 → ☑)
   - Add progress log entry
   - Commit with conventional message

---

## Exit Criteria Mapping

All 5 M5 exit criteria from MILESTONES.md:180–185 are explicitly covered:

| Exit Criterion | Checklist Section | Coverage |
|---|---|---|
| Admin creates user + sets permissions without Sheets | D + E | 26 items covering user CRUD + both protection paths |
| Permission change takes effect on next action (no logout, no 2-min) | J | 5 items testing immediate effect with 2 browsers |
| Last admin cannot be deactivated or stripped of manage_users | E.2 | 4 items testing via preset + matrix paths |
| Product CRUD works; OrderLines.productCode can link | A + B + C + H | 32 items covering full product lifecycle + lookup |
| Matrix usable on phone (14 checkboxes, card per user) | F + K.3 | 22 items testing checkbox matrix + phone responsiveness |

**Total Coverage:** 114 items across 10 sections, all 5 exit criteria explicitly verified

---

## Test Prerequisites

User must complete before starting live testing:

**Step 1: setupMilestone5()**
- Open apps/api Google Apps Script editor
- Select `setupMilestone5` from dropdown
- Click Run
- Verify Products sheet created with 9 headers: `productId`, `code`, `name`, `uom`, `stockQty`, `minStock`, `lastPrice`, `active`, `note`

**Step 2: Deploy apps/api then apps/web**
- Create new deployments in both projects
- Note new BUILD numbers for verification
- API BUILD: `api-2026-09-07c-product-lookup` (current)
- Web BUILD: Should match after deployment

**Step 3: Prepare 3 test accounts**
- Admin: all permissions enabled
- Sales: create_order, edit_order, view_orders (no manage_* permissions)
- Warehouse: manage_inventory only (no manage_users, no manage_config)

---

## Testing Flow

**Estimated Duration:** ~3 hours total

### On PC (2.5 hours):
- **Sections A–C:** Inventory CRUD, low-stock, search (30 min)
- **Sections D–E:** User CRUD, admin protections (45 min)
- **Sections F–G:** Matrix, config editing, cache invalidation (30 min)
- **Sections H–J:** Product lookup, permissions, immediate effect (30 min)

### On Real Phone (30 min):
- **Sections F, G, K:** Matrix, config, responsive UI (30 min)
- Must be real iOS Safari or Android Chrome device

### If any ❌ found:
1. Document symptom + root cause in TASKS.md
2. Fix code
3. Add offline test assertion
4. Run full test suite (`npm test`)
5. Re-deploy
6. Re-test that section

**Continue until all sections 10/10 ✅**

---

## Sign-Off Tasks (After All ✅)

### 1. Update MILESTONES.md

**Line 172:** Change `☐` to `☑`, add date
```markdown
## ☑ Milestone 5 — Inventory + Admin UI *(done 2026-09-07)*
```

**Lines 180–185:** Check all 5 criteria
```markdown
- [x] Admin can create a user and set permissions without touching the Sheet
- [x] A permission change takes effect on the affected user's next action
- [x] The last active admin cannot be deactivated or stripped of `manage_users`
- [x] Product CRUD works; `OrderLines.productCode` can link to a product
- [x] The permission matrix is usable on a phone (card per user)
```

### 2. Update TASKS.md

**Lines 3016–3017:** Mark M5.1 and M5.2 complete
```markdown
- [x] M5.1 — Product CRUD + low-stock badge + search
- [x] M5.2 — User CRUD + permissions (preset + matrix) + protections
```

### 3. Progress Log Entry

Add to MILESTONES.md progress table:
```markdown
| 2026-09-07 | 5 | **Milestone 5 signed off.** CHECKLIST_M5_VI.md sections A–K fully tested live on PC and phone; all 5 exit criteria satisfied. Admin can manage users/products/config without Sheets; permissions take effect immediately; last-admin protected; product lookup works; matrix responsive on phone. 943+ assertions passing. |
```

### 4. Commit

```bash
git add docs/CHECKLIST_M5_VI.md docs/MILESTONES.md docs/TASKS.md
git commit -m "Milestone 5 signed off — live testing complete (2026-09-07)"
```

---

## Code State

### Deployed Versions
- **API:** `api-2026-09-07c-product-lookup` (current)
- **Web:** Latest (ready to deploy)

### Tests
- **Offline Assertions:** 943+ passing (no failures expected)
- **Coverage:** M5 features covered by assertions in:
  - `products.test.js` (48 assertions)
  - `products-ui.test.js` (40 assertions)
  - `admin.test.js` (53 assertions)
  - `admin-ui.test.js` (36 assertions)
  - Plus existing M1–M4 assertions

### Data Model
- **Products sheet:** 9 columns (productId, code, name, uom, stockQty, minStock, lastPrice, active, note)
- **Users sheet:** 8 columns (email, displayName, role, active, permissions, createdAt, createdBy, note)
- **Config sheet:** Supports uomList, customerList, statusList, approvalFlowEnabled, etc.

---

## Risks Mitigated

| Risk | Mitigation |
|---|---|
| setupMilestone5() never run → Inventory tab 404 | Step 1 of pre-testing checklist: explicit verification before testing starts |
| Phase 3 matrix protection holes | Section E explicitly requires both preset + matrix paths; Phase 3 assertions cover both |
| Config changes cached for 2 minutes | Section G explicitly tests for "immediately" and names cache invalidation as the target |
| Permission change cached (same user record issue from Phase 3 bug) | Section J explicitly tests with 2 browsers, no logout; user records deliberately not cached |
| One account permission toggling instead of 3 real accounts | NFR1 in phase notes: 3 accounts required; Sections I, J written to require them |
| Phone test done in desktop emulation | Section K explicitly says real device; checklist reiterates multiple times |
| Self-demotion works on preset but not matrix | Section E.1 tests both paths; Phase 3 assertions already cover both |

---

## Key Decisions Documented

### Why Two Protection Paths (E.1 + E.2)?
Phase 3 added matrix path; M5 adds preset path. Both must enforce same protections (self-protection + last-admin). Phase notes flag this explicitly because it's the "criterion most likely to silently regress" if only one path is tested.

### Why 3 Accounts (I + J)?
Toggling one account's permissions exercises the wrong code path. Real permissions test requires changing someone else's permissions (I) and seeing effect on that person (J). This catches inconsistencies between "grant permission" and "use permission" codepaths.

### Why Real Phone (K)?
Desktop browser resizing doesn't catch true touch/scroll constraints. 14 checkboxes on phone is the highest-risk UI (densest, most likely to break layout). Real device required.

### Why Immediate Effect Test (G + J)?
Phase 4 config has a known 120s cache (by design). Phase 5 must show cache is invalidated. Phase 2 user record cache (bug) was immediate but relies on code never calling CacheService for users. Both need live verification.

---

## What's Not Included (Out of Scope)

These are Phase 7 items, not Phase 6:

- Backup feature (`backupNow()`)
- Full responsive pass on all screens (just matrix + config tested here)
- Vietnamese completeness sweep (isolated later)
- Error message review (isolated later)
- User guide writing (Phase 7)

---

## Next Phase

**Phase 7 — Polish + Docs** unblocks once all M5 boxes are ✅:
- Backup implementation + test
- Full responsive audit all screens
- Vietnamese string completeness
- Error message review
- Final user guide

---

## Summary Checklist

### Prepared ✅
- [x] CHECKLIST_M5_VI.md (202 lines, 114 items, 10 sections)
- [x] Testing guide (pre-setup, flow, scenarios, sign-off)
- [x] Pre-testing prerequisites documented (setupMilestone5, deployments, accounts)
- [x] All 5 exit criteria explicitly mapped to checklist sections
- [x] Multi-device approach documented (PC + real phone)
- [x] Multi-account approach documented (admin, sales, warehouse)
- [x] Common issues documented (low-stock defaults, caching, mobile UI)
- [x] Sign-off process documented (MILESTONES.md, TASKS.md, commit)

### Ready for ⏳
- [ ] User to run setupMilestone5() and verify Products sheet
- [ ] User to deploy apps/api then apps/web
- [ ] User to prepare 3 test accounts
- [ ] User to execute Sections A–J on PC (2.5 hours)
- [ ] User to execute Sections F, G, K on real phone (30 min)
- [ ] User to mark all boxes ✅ or fix ❌ and re-test
- [ ] User to update MILESTONES.md, TASKS.md, and commit

### Unblocked ⏭️
- Phase 7 (Polish + Docs) once all M5 boxes are ✅

---

## Files Created

| File | Lines | Purpose |
|---|---|---|
| `docs/CHECKLIST_M5_VI.md` | 202 | Comprehensive Vietnamese checklist, 10 sections A–K |
| `plans/.../reports/general-purpose-260907-2300-m5-testing-guide.md` | 350+ | Full testing flow, prerequisites, scenarios, sign-off |
| `plans/.../reports/phase-06-completion-summary.md` | this | Phase completion summary |

---

## Contact / Questions

Before executing live testing, confirm:

1. **setupMilestone5() already run?** Or needs to be run?
2. **Real phone available for Sections F/G/K?**
3. **Three test accounts ready** (admin, sales, warehouse)?
4. **Apps ready to deploy?** Or already deployed?

Answer these, then proceed with checklist Sections A–K.

---

**Phase 6 Status:** ✅ COMPLETE (deliverables ready, awaiting user execution)

**Expected Outcome:** User completes checklist, all 10 sections ✅, M5 signed off in MILESTONES.md, Phase 7 unblocked.
