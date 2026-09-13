# Phase 2 Preparation Complete — M4 Live Verification & Ship

**Date:** 2026-09-07  
**Status:** ✅ READY FOR LIVE TESTING  
**Duration:** Preparation phase 2.0–2.5h (execution phase 3–4h pending)

---

## Executive Summary

Phase 2 (M4 Live Verification) preparation is **100% complete**. All documentation, checklists, and step-by-step guides are ready. User/tester can now execute live testing on real PC and phone devices.

**Preparation included:**
1. ✅ Created `CHECKLIST_M4_VI.md` (Vietnamese, 9 sections, 60+ checkboxes)
2. ✅ Created `reference-data-m4-verification.md` (revenue reconciliation guide)
3. ✅ Created `phase-02-subtasks-detailed.md` (6 sub-tasks, ~20–30 min each)
4. ✅ Verified deployment status (M4 code in both projects, main branch)
5. ✅ Updated `phase-02-m4-live-verification-and-signoff.md` with readiness status

---

## Deliverables

### 1. CHECKLIST_M4_VI.md
**Location:** `docs/CHECKLIST_M4_VI.md`

**Content:**
- 9 lettered sections (A–I) covering all M4 exit criteria
- 60+ checkboxes with 3-state system: ✅ / ❌ / 🤔
- Vietnamese language (matches M3 precedent)
- Structured for on-device testing (PC + phone)

**Sections:**
- **A:** CSV Export — filtering, formatting, totals row
- **B:** XLSX Export — column widths, formatting, Excel/Sheets compatibility
- **C:** PDF Export — layout recognition, page breaks, professional appearance
- **D:** Permission gating — visible_fields enforcement, money column removal
- **E:** Large exports — async job UI, progress, Drive file, email delivery
- **F:** Vietnamese diacritics — UTF-8 BOM, character rendering across formats
- **G:** Statistics views — week/month/quarter/year, customer/status views, toggle
- **H:** Revenue reconciliation — sample month, ex-VAT & inc-VAT matching
- **I:** Mobile UI — phone-optimized layout, chart rendering, no console errors

**Exit criteria mapped:**
| Exit Criterion | Sections |
|---|---|
| Exported file matches screen + filters | A, B, C |
| User cannot export outside visible_fields | D |
| PDF is recognizable to Excel users | C |
| Vietnamese characters render correctly | F (all formats) |
| Revenue reconciles vs. reference Excel | H |
| view_statistics enforced; export_statistics reserved | G.5 |

---

### 2. Reference Data Guide
**Location:** `plans/260907-1759-milestone-4-5-completion/reference-data-m4-verification.md`

**Content:**
- How to extract reference data from `FILE THEO DOI DON HANG.xlsx`
- Sample template for documenting month, order count, ex/inc-VAT totals
- **Critical insight:** Split-order handling (lines in different months = expected, not a bug)
- Reconciliation strategy (how to verify matches ±1%)
- Pre-test deployment checklist
- Test execution log template for audit trail

**Key sections:**
- "Understanding Split Orders" — explains per-line invoice bucketing
- "Deployment Confirmation" — verify both apps are live before testing
- "Test Execution Log" — structured template for recording findings

**Use case:** Tester follows this guide before/during Section H (revenue reconciliation) to avoid false positive "bugs"

---

### 3. Detailed Sub-Tasks
**Location:** `plans/260907-1759-milestone-4-5-completion/phase-02-subtasks-detailed.md`

**Content:** 6 sub-tasks, each with:
- **Prerequisites** (what must be set up)
- **Step-by-step instructions** (numbered, click-by-click)
- **Expected results** (what you should see)
- **Success criteria** (how to confirm it works)
- **Time estimate** (20–30 min each)

**Sub-tasks:**

| Task | Scope | Device | Time | Coverage |
|---|---|---|---|---|
| 2.1 | CSV/XLSX/PDF export, filtering, file format | PC | 20–30 min | A, B, C, reference data |
| 2.2 | Permission gating, visible_fields enforcement | PC | 15–20 min | D |
| 2.3 | Stats views (all 4 time periods, toggle) | PC | 20–25 min | G |
| 2.4 | Stats permission gating (view_statistics) | PC | 10 min | G.5 |
| 2.5 | Revenue reconciliation vs. reference Excel | PC + Excel | 15–20 min | H |
| 2.6 | Large export (async) + mobile UI testing | PC + Phone | 25–30 min | E, I |

**Total time estimate:** 2.5–3.5 hours for all 6 tasks

**Example steps (from Task 2.1, CSV Export):**
```
1. Navigate to Danh sách đơn hàng
2. Click Month filter → select Tháng 9 / 2024
3. Verify danh sách shows only that month
4. Click "Xuất CSV" button
5. Expected: File DanhSach_orders_Thang9_2024.csv downloads
6. Open in Excel → verify columns, diacritics, totals row
7. Compare with reference → should match order count & columns
8. Uncheck month filter, export again → file now contains all months
9. Mark CHECKLIST_M4_VI.md §A with ✅
```

Each task follows this pattern with all prerequisites, steps, and success criteria explicit.

---

### 4. Phase 2 File Updates
**Location:** `plans/260907-1759-milestone-4-5-completion/phase-02-m4-live-verification-and-signoff.md`

**Changes made:**
- ✅ Marked preparation tasks complete (CHECKLIST, reference data, sub-tasks)
- ✅ Added "Preparation Status (2026-09-07)" section with completion checkmarks
- ✅ Added "Deployment Verification" section with git commit hashes
- ✅ Updated success criteria to separate "Preparation Phase (COMPLETED)" vs. "Live Testing Phase (PENDING)"
- ✅ Added pre-test deployment checklist
- ✅ Updated risk assessment with new risk: "Tester unfamiliar with split-order accounting" + mitigation

**Phase file now shows:**
- What is prepared ✅
- What is ready to test (6 sub-tasks waiting for execution)
- What remains (user runs tests, records results in checklist)

---

## Deployment Status Verification

### Git Analysis
- **Branch:** main (up to date with origin)
- **apps/api:** M4 code present
  - Commit 83f69c9: "Milestone4: Export Drive Retentions" (async export, Drive upload)
  - Commit 96ff069: "Milestone4: Export large orders email deliver" (async export, email)
  - Commit 9ecce78: "Milestone4: Statistic by customer and by status" (stats views)
  - Commit 72e46ef: "Milestone4: Statistic" (stats base)
- **apps/web:** M4 code present (mirrors api commits)

### Pre-Deployment Requirement
**User must execute before starting live testing:**
```
$ cd apps/api && clasp push && cd ../web && clasp push
```
Verify both deployments complete successfully and are live.

---

## Testing Environment Readiness

### PC Setup Required
- Excel or Google Sheets (for reference data + CSV/XLSX verification)
- PDF viewer (for PDF export verification)
- Two test accounts:
  - Account A: Full admin permissions
  - Account B: Restricted role (warehouse or similar, limited visible_fields)
- `FILE THEO DOI DON HANG.xlsx` open in separate window

### Phone Setup Required
- Real iOS device (Safari) OR Android device (Chrome)
- Same network access to deployed app (or public URL)
- Same test account (Account A) logged in
- No browser dev tools needed on phone (testing is user-focused, not developer)

### Not Needed
- ❌ Desktop phone emulation (must be real device)
- ❌ Local dev server (must test deployed version)
- ❌ Code modifications (all M4 code is complete; live test is QA only)
- ❌ New test data (use existing orders/data)

---

## Phase 2 Execution Flow (User)

### Before Starting
1. Read: `reference-data-m4-verification.md` (10 min)
2. Prepare: Open `FILE THEO DOI DON HANG.xlsx` in Excel (5 min)
3. Deploy: Run `clasp push` in both apps/api and apps/web (5 min)
4. Confirm: Verify both live, login works (5 min)

### During Testing
1. Execute: Sub-task 2.1 (CSV/XLSX/PDF export) — 20–30 min
2. Execute: Sub-task 2.2 (permission gating) — 15–20 min
3. Execute: Sub-task 2.3 (stats views) — 20–25 min
4. Execute: Sub-task 2.4 (stats permissions) — 10 min
5. Execute: Sub-task 2.5 (revenue reconciliation) — 15–20 min
6. Execute: Sub-task 2.6 (large export + mobile) — 25–30 min

**Total: 2.5–3.5 hours**

### Record Results
- ✅ Mark checkboxes in `CHECKLIST_M4_VI.md` as tests complete
- 📝 Document any ❌ or 🤔 findings in `TASKS.md` → "M4 Live Testing Issues"
- 📋 If bug found: note steps to reproduce, expected vs. actual

### After Testing
1. If all ✅: Flip `MILESTONES.md:152` from `◐ Milestone 4` → `☑ Milestone 4 — Export + statistics *(done 2026-MM-DD)*`
2. If any ❌: File bug, fix code, run offline suite (17 tests, ≥943 assertions), re-test
3. Add progress log row to `MILESTONES.md`

---

## Key Insights for Tester

### 1. Split-Order Accounting
**A single order may appear in two different months if lines have different invoice dates.**
- Line 1: Invoice date 2024-09-10 → September total
- Line 2: Invoice date 2024-10-02 → October total
- This is **CORRECT**, not a bug
- If reconciliation shows mismatch, first check for split orders

### 2. Async Export Threshold
- **Threshold:** 500 **order lines** (not orders; single order = many lines)
- **Config location:** `Config.gs:358-361`
- **If dataset is small:** Temporarily lower threshold to test async path
- **Expected behavior:** >500 lines → popup instead of immediate download → progress → Drive link/email

### 3. Vietnamese Diacritics
- **CSV:** Requires UTF-8 BOM at top of file (verified in `Export.gs:92`)
- **Test:** Open CSV in Excel on Windows → diacritics must render (ơ, ê, ư, á, ả, etc.)
- **If garbled:** Not a character encoding issue, but a BOM/encoding export issue

### 4. Large Export & Email
- **Email:** Sent to logged-in user's email (if configured)
- **Drive:** File uploaded to "THIENTAN_EXPORTS" folder (must be **private**, not public)
- **Quota:** If email hits 25MB ceiling, app provides Drive link fallback (no error, just fallback)

### 5. Permission Gating
- **Money columns removed from file:** Not hidden in the CSV; entire columns are absent
- **Warehouse role (export: false):** Button missing or error on click (not just disabled)
- **Sales role (export: true, export_statistics: false):** Can export, but "Thống kê" tab hidden
- **Test all three:** Full admin, warehouse, sales (at minimum)

---

## Unresolved Questions / Dependencies

None. Phase 2 preparation is complete and self-contained.

**Blockers for Phase 2 execution (user must resolve before starting):**
1. ✓ M4 code merged to main — **DONE** (verified in git)
2. ✓ apps/api & apps/web deployed — **USER MUST DO** (before starting tests)
3. ✓ Test data exists (orders with invoices, non-invoices, split-order scenarios) — **ASSUMED** (existing dataset)

---

## Deliverables Summary

| File | Purpose | Status |
|---|---|---|
| `docs/CHECKLIST_M4_VI.md` | Vietnamese testing checklist, 9 sections, 60+ checkboxes | ✅ Created |
| `reference-data-m4-verification.md` | Revenue reconciliation guide + split-order explanation | ✅ Created |
| `phase-02-subtasks-detailed.md` | 6 sub-tasks with step-by-step instructions, time estimates | ✅ Created |
| `phase-02-m4-live-verification-and-signoff.md` | Phase overview, updated with readiness status | ✅ Updated |

---

## Transition to Live Testing

**Phase 2 is now ready for execution by tester/user.**

**Next step:** User reads this report, follows "Pre-Test" setup in Phase 2 Execution Flow, and begins executing the 6 sub-tasks using `CHECKLIST_M4_VI.md` and `phase-02-subtasks-detailed.md`.

**Expected outcome (on success):**
- `CHECKLIST_M4_VI.md` has 60/60 checkboxes ✅
- No ❌ or 🤔 entries (or all documented with valid explanations)
- Revenue reconciliation passes (±1%)
- All 6 sub-tasks completed and signed off
- `MILESTONES.md:152` flipped to `☑ Milestone 4 — Export + statistics *(done YYYY-MM-DD)*`
- Phase 2 complete; proceed to Phase 3 (M5.3 permission matrix editor)

---

**Prepared by:** Claude Code  
**Date:** 2026-09-07 · 22:00 UTC  
**Status:** ✅ Ready for live testing

Tester: Start with `CHECKLIST_M4_VI.md` section A (CSV Export). Good luck! 🚀
