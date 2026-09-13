# Phase 2 Deliverables — M4 Live Verification Preparation

**Completion Date:** 2026-09-07  
**Status:** ✅ 100% Complete  
**Ready for:** Immediate user testing

---

## Quick Links to All Documents

### 1. Main Testing Checklist (For Tester to Use)
📋 **`docs/CHECKLIST_M4_VI.md`**
- Vietnamese checklist with 9 sections (A–I)
- 60+ checkboxes for recording test results
- **This is where tester marks ✅/❌/🤔 during testing**
- 13 KB

**How to use:** Open this file on another monitor or print it. Mark each checkbox as you execute the corresponding test step. This is your PRIMARY testing document.

---

### 2. Setup & Reference Guide
📚 **`reference-data-m4-verification.md`**
- Pre-test deployment checklist
- How to extract reference data from `FILE THEO DOI DON HANG.xlsx`
- Explanation of split-order accounting (critical!)
- Test execution log template
- 4.3 KB

**How to use:** Read this BEFORE starting Task 2.5 (revenue reconciliation). It explains how to avoid false positives and document findings correctly.

---

### 3. Detailed Step-by-Step Testing Tasks
👨‍💻 **`phase-02-subtasks-detailed.md`**
- 6 complete sub-tasks with:
  - Prerequisites (what to set up first)
  - Numbered step-by-step instructions
  - Expected results (what you should see)
  - Success criteria (how to verify it worked)
  - Time estimate for each
- 20 KB

**How to use:** 
- Task 2.1: CSV/XLSX/PDF export (start here)
- Task 2.2: Permission gating
- Task 2.3: Stats views
- Task 2.4: Stats permissions
- Task 2.5: Revenue reconciliation (cross-reference with doc #2)
- Task 2.6: Large async export + mobile testing

**Total testing time:** 2.5–3.5 hours

---

### 4. Phase Overview & Status
📊 **`phase-02-m4-live-verification-and-signoff.md`**
- Phase 2 context, requirements, and risks
- Updated with preparation status (what's done, what's pending)
- Deployment verification details
- Success criteria split: Preparation (DONE) vs. Live Testing (PENDING)
- Pre-test deployment checklist
- 5 KB

**How to use:** Reference this for context and to track phase-wide status. Share with project stakeholders to show readiness.

---

### 5. Comprehensive Preparation Report
📈 **`reports/general-purpose-260907-2200-phase-02-preparation-complete.md`**
- Executive summary of ALL preparation work
- Detailed breakdown of each deliverable
- Exit criteria mapping (which sections cover which criteria)
- Key insights for tester (split orders, async threshold, etc.)
- Testing environment readiness checklist
- Phase 2 execution flow (step-by-step what to do)
- 12 KB

**How to use:** Read this to understand the complete picture before starting. Share with stakeholders as final readiness report.

---

## File Organization Map

```
/Users/phongna/anhphongit/Projects/thientan-web/
│
├── docs/
│   └── CHECKLIST_M4_VI.md ← Use during testing (main document)
│
└── plans/260907-1759-milestone-4-5-completion/
    ├── phase-02-m4-live-verification-and-signoff.md ← Phase overview
    ├── reference-data-m4-verification.md ← Read before Task 2.5
    ├── phase-02-subtasks-detailed.md ← Step-by-step tasks
    ├── PHASE_2_DELIVERABLES.md ← You are here
    │
    └── reports/
        └── general-purpose-260907-2200-phase-02-preparation-complete.md ← Full report
```

---

## Testing Execution Checklist

**Before You Start:**

- [ ] Read `reference-data-m4-verification.md` (understand split orders)
- [ ] Prepare: Have `FILE THEO DOI DON HANG.xlsx` open in Excel
- [ ] Deploy: Run `clasp push` in `apps/api`, then `apps/web`
- [ ] Verify: Both apps live, login works, "Danh sách đơn hàng" and "Thống kê" visible
- [ ] Print: `CHECKLIST_M4_VI.md` (optional, for marking up)
- [ ] Open: `phase-02-subtasks-detailed.md` on another monitor/device

**During Testing:**

- [ ] Execute Task 2.1 (CSV/XLSX/PDF) — mark results in CHECKLIST §A, B, C
- [ ] Execute Task 2.2 (Permission gating) — mark in CHECKLIST §D
- [ ] Execute Task 2.3 (Stats views) — mark in CHECKLIST §G
- [ ] Execute Task 2.4 (Stats permissions) — mark in CHECKLIST §G.5
- [ ] Execute Task 2.5 (Revenue reconciliation) — mark in CHECKLIST §H, use reference guide
- [ ] Execute Task 2.6 (Large async + mobile) — mark in CHECKLIST §E, I

**After Testing:**

- [ ] All checkboxes marked (✅ or documented ❌/🤔)
- [ ] Any ❌ findings logged in `TASKS.md` → "M4 Live Testing Issues"
- [ ] If all ✅: Update `MILESTONES.md:152` → flip ◐ to ☑, add date
- [ ] Share updated `CHECKLIST_M4_VI.md` with team for sign-off

---

## Key Numbers

| Metric | Value |
|--------|-------|
| Checklist sections | 9 (A–I) |
| Checklist checkboxes | 60+ |
| Sub-tasks | 6 |
| Total testing time | 2.5–3.5 hours |
| Exit criteria covered | 6/6 (100%) |
| Deliverable files | 5 documents |
| Reference file | `FILE THEO DOI DON HANG.xlsx` (repo root) |

---

## Success Definition

Phase 2 is **SUCCESSFUL** when:

✅ **CHECKLIST_M4_VI.md has:**
- All 9 sections (A–I) with all checkboxes marked
- Zero unchecked boxes (everything ✅ or documented with reason)
- No ❌ items unresolved

✅ **Testing Results:**
- Revenue reconciliation matches Excel (±1%, or difference documented)
- All 6 sub-tasks completed and signed off
- No critical bugs found (or all found bugs fixed + suite green)

✅ **Sign-off:**
- `MILESTONES.md:152` flipped to `☑ Milestone 4 — Export + statistics *(done 2026-09-07)*`
- Progress log row added with completion date
- Team confirms all M4 exit criteria satisfied

---

## Contact & Support

**Questions during testing?**
1. Check the relevant sub-task (e.g., Task 2.5 for revenue questions)
2. Check the reference guide (`reference-data-m4-verification.md`)
3. Check `TASKS.md` for known M4 implementation details
4. Log issue in `TASKS.md` → "M4 Live Testing Issues" with steps to reproduce

**Found a bug?**
- Document: Steps to reproduce + Expected vs. Actual
- Log in: `TASKS.md` with screenshot/evidence
- Fix: Code changes + offline assertion + full suite re-run (≥943 assertions, 0 failures)
- Re-test: Same sub-task on real device to verify fix

---

## Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| Preparation (Phase 2 Setup) | 2.5h | ✅ COMPLETE |
| Deployment (clasp push) | 5 min | ⏳ USER MUST DO |
| Live Testing (Task 2.1–2.6) | 2.5–3.5h | ⏳ USER MUST DO |
| Sign-off (MILESTONES update) | 10 min | ⏳ AFTER TESTING |
| **Total** | **~6 hours** | In progress |

**Estimated completion:** Same day if testing continuous, or next day if split across sessions

---

## Next Phase (After Phase 2 Complete)

Once Phase 2 is signed off (all ✅, MILESTONES updated):
→ Proceed to **Phase 3: M5.3 Permission Matrix Editor**

Phase 3 will introduce:
- User management UI
- Permission matrix editor (visual grid)
- Role preset management

---

**Document Version:** 2026-09-07  
**Status:** Ready to hand to tester  
**Prepared by:** Claude Code Agent

🚀 **Ready to begin Phase 2 live testing!**
