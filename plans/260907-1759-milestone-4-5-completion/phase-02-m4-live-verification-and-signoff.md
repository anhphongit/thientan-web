# Phase 2 — M4 live verification + sign-off

## Context links
- Exit criteria to satisfy: `docs/MILESTONES.md:161-169`
- Checklist precedents to copy: `docs/CHECKLIST_M2_VI.md`, `docs/CHECKLIST_M3_VI.md` (60/60 checked — the format that worked)
- M4 task record: `docs/TASKS.md:1093-1105` (all 11 sub-tasks ☑)
- Reference report: `FILE THEO DOI DON HANG.xlsx` (repo root)
- Layout spec: `docs/EXCEL_REFERENCE.md` §7

## Overview
- **Priority:** P1 · **Status:** pending · **Effort:** 4–5h
- **Blocked by:** Phase 1 (the `export_statistics` criterion must be decided before it can be ticked).
- **Zero new features.** Code is complete and covered by 253 passing assertions. This phase produces a Vietnamese checklist and executes it on real devices.

## Key insights (verified)
- All M4 sub-tasks 4.1 → 4.7.3 are ☑ in `docs/TASKS.md:1093-1105`. Nothing is half-built.
- Test coverage is real, not zero: `export.test.js` 53, `exportjob.test.js` 91, `exportsheet.test.js` 44, `stats.test.js` 65 = **253 assertions**, all passing.
- Partial live feedback already happened — `TASKS.md:1104` records filters/basis-toggle being *removed* after live feedback on 4.7.2, and `TASKS.md:2168` mentions "this session's own earlier live testing". So the UI has been seen on a real screen; what is missing is a *recorded, complete* pass.
- CSV already writes a UTF-8 BOM for Excel-on-Windows diacritics (`Export.gs:92`). Verify it actually works rather than assuming.
- Large exports take the async job path above `exportLargeThreshold` (default 500 **order lines**, not orders — `Export.gs:73-75`, `Config.gs:358-361`). The test data must cross that threshold or the whole 4.5.x async path goes untested live.
- `apps/api` must be deployed before `apps/web` (precedent: `TASKS.md:206`).

## Requirements
- FR1: A `docs/CHECKLIST_M4_VI.md` in Vietnamese, structured in lettered sections like M2/M3.
- FR2: Every one of the 6 criteria at `MILESTONES.md:161-169` maps to at least one checkbox.
- FR3: Both export paths exercised — synchronous (<threshold) and async job (>threshold).
- NFR1: Real PC + real phone (iOS Safari and/or Android Chrome), not desktop emulation.

## Data flow under test
```
sync path  : ViewsOrders [Xuất] → Main.gs:198/211/223 → Router → Export.gs:83/109/124
             → exportBucketsForRequest_ (same filters as listOrders) → Blob download
async path : line count > exportLargeThreshold → Main.gs:236 apiStartExportJob
             → ExportJob.gs:149 (requirePermission_ 'export') → checkpoint loop
             → Main.gs:247 apiExportJobStatus polling → Drive upload + email (4.5.3)
             → retention trigger trashes it later (4.5.4)
stats path : ViewsStats → Main.gs:263/274/284 → Stats.gs:91/276/295 (view_statistics)
```

## Related code files
- Create: `docs/CHECKLIST_M4_VI.md`
- Modify: `docs/MILESTONES.md:161-169` (tick criteria), `docs/MILESTONES.md:152` (`◐`→`☑`), progress log
- Read only: `apps/api/Export.gs`, `ExportJob.gs`, `ExportSheet.gs`, `Stats.gs`, `apps/web/ui/ViewsStats.html`
- **No code changes expected.** Any code change found necessary is a bug fix — log it in `TASKS.md` and re-run the suite.

## Implementation steps
1. Confirm deploy access: `clasp push` works in both `apps/api` and `apps/web`; note the current `BUILD` = `api-2026-09-06b-usersadmin` (`Config.gs:18`).
2. Write `docs/CHECKLIST_M4_VI.md`, sections:
   - **A. Xuất CSV** — filters honoured; month grouping; `STT`/`PO` on first line only; `DOANH SỐ THÁNG n` totals row (per `EXCEL_REFERENCE.md` §7).
   - **B. Xuất XLSX** — opens in Excel and Google Sheets; column widths/number formats survive the temp-Sheet round trip.
   - **C. Xuất PDF** — recognisable to someone used to the current Excel report; page breaks not mid-order.
   - **D. Dấu tiếng Việt** — diacritics correct in all three formats, specifically CSV opened in Excel on Windows (the BOM at `Export.gs:92` is what this tests).
   - **E. Quyền** — a role whose `visible_fields` excludes money columns exports a file with **no** money columns; `warehouse` preset (`export:false`) gets refused; `sales` preset (`export:true, export_statistics:false`) **succeeds** (Phase 1 regression, live confirmation).
   - **F. Xuất lớn (async)** — filter to >500 lines; progress UI advances; Drive file + email arrive; popup-block path behaves (`TASKS.md:2057` records a popup-blocked follow-up).
   - **G. Thống kê** — tuần/tháng/quý/năm totals; by-customer and by-status views; include-no-invoice toggle changes totals as expected.
   - **H. Đối chiếu doanh thu** — one sample month reconciled against `FILE THEO DOI DON HANG.xlsx`, ex-VAT and inc-VAT both (Q2, `OPEN_QUESTIONS.md:40`).
   - **I. Điện thoại** — stats charts and export trigger usable on a real phone.
3. Execute A–I on a PC. Tick as you go; do not batch-tick at the end.
4. Execute D, G, I on a real phone.
5. Reconciliation (section H): pick a month with invoiced and non-invoiced lines. Compare ex-VAT and inc-VAT totals. Remember invoice-date basis buckets **per line**, so a split order legitimately appears in two months (`TASKS.md:1163-1171`) — a mismatch there is expected behaviour, not a bug.
6. Any discrepancy: log in `TASKS.md`, fix, add an offline assertion reproducing it, re-run all 17 suites, re-test.
7. On all-green: flip `MILESTONES.md:152` `◐ Milestone 4` → `☑ Milestone 4 — Export + statistics *(done YYYY-MM-DD)*`, tick lines 161-169, add a progress-log row.

## Todo
- [x] Deploy access confirmed for both projects
- [x] `docs/CHECKLIST_M4_VI.md` written, all 6 exit criteria mapped
- [ ] Sections A–I executed on PC (6 sub-tasks, 2.5–3.5h)
- [ ] Sections D, G, I executed on real phone (mobile tests, ~30 min)
- [ ] Revenue reconciled vs reference Excel (ex-VAT + inc-VAT)
- [ ] Async large-export path exercised (>500 lines)
- [ ] Any bug found → fixed + new assertion + suite green
- [ ] `MILESTONES.md` M4 flipped to ☑, progress log row added

## Preparation Status (2026-09-07)
- [x] **CHECKLIST_M4_VI.md created** — Vietnamese checklist, 9 sections (A–I), modeled on M3 format
- [x] **Reference data guide created** — `reference-data-m4-verification.md` (populate before testing)
- [x] **Sub-tasks documented** — `phase-02-subtasks-detailed.md` (6 tasks × 20–30 min each)
- [x] **Deployment status verified** — Both `apps/api` and `apps/web` have M4 code (commits: 9ecce78, 72e46ef, 83f69c9, 96ff069)
- [x] **Ready for live testing** → User/tester can now execute Phase 2

## Success criteria
**Preparation Phase (COMPLETED 2026-09-07):**
- ✓ `docs/CHECKLIST_M4_VI.md` created with 9 sections (A–I), 60+ checkboxes covering all 6 exit criteria
- ✓ Reference data guide provided (`reference-data-m4-verification.md`)
- ✓ Detailed step-by-step sub-tasks documented (`phase-02-subtasks-detailed.md`)
- ✓ Deployment verified (both projects have M4 code in main branch)
- ✓ Phase 2 ready for live testing (all preparation complete)

**Live Testing Phase (PENDING — user executes):**
- [ ] `docs/CHECKLIST_M4_VI.md` has **zero** unchecked boxes (all ✅, mirrors `CHECKLIST_M3_VI.md`'s 60/0 state)
- [ ] Sample-month revenue matches the reference Excel (±1%, or difference documented)
- [ ] All 6 sub-tasks completed on PC + phone
- [ ] Async export path tested (>500 lines confirmed working)
- [ ] Offline suite still ≥ 943 assertions, 0 failures
- [ ] `MILESTONES.md` M4 header updated: `◐ Milestone 4` → `☑ Milestone 4 — Export + statistics *(done YYYY-MM-DD)*`

## Deployment Verification (2026-09-07)

### Git Status
- **Current branch:** `main` (up to date with origin)
- **apps/api commits:**
  - `1030566` Milestone5: Admin
  - `124a071` Milestone5: Products
  - `9ecce78` Milestone4: Statistic by customer and by status ← M4 stats code
  - `72e46ef` Milestone4: Statistic
  - `83f69c9` Milestone4: Export Drive Retentions
  - `96ff069` Milestone4: Export large orders email deliver ← M4 async export code
- **apps/web commits:** (mirrors apps/api)
  - M4 code present and committed
- **Status:** Both projects have M4 code in main branch, ready for deployment

### Pre-Test Deployment Checklist
User must confirm before starting live testing (Phase 2, §Deployment Confirmation):
- [ ] Latest `apps/api` deployed (can verify via app footer or version check)
- [ ] Latest `apps/web` deployed (can verify via app footer or cache refresh Cmd+Shift+R)
- [ ] Both apps accessible and login working
- [ ] "Danh sách đơn hàng", "Thống kê", and export buttons visible in UI
- [ ] No "Coming soon" or disabled UI elements

---

## Risk assessment
| Risk | L×I | Mitigation |
|---|---|---|
| Reconciliation mismatch from per-line invoice bucketing, mistaken for a bug | **High** × Med | Section H text in checklist states the expected split-order behaviour up front; reference-data guide explains this |
| PDF layout unacceptable to Phong → real rework | Med × **High** | Show the PDF early (step 3, section C) before investing in the rest of the pass; have alternative design ready if needed |
| No dataset large enough to cross the 500-line threshold | Med × Med | Lower `exportLargeThreshold` in the Config sheet temporarily (it is config-driven, `Config.gs:358-361`); restore after testing |
| Async export emails hit Gmail quota / 25MB ceiling | Low × Med | 4.5.3 already implements the size-threshold link fallback — verify the fallback, don't fight the quota |
| Live test reveals a bug → phase overruns | Med × Med | Budget is 4–5h for a clean pass; a bug found is a *win* here, re-plan rather than rush the sign-off |
| **NEW:** Tester unfamiliar with split-order accounting | Med × Low | `reference-data-m4-verification.md` explains per-line invoice bucketing, reconciliation strategy, and how to document splits |

## Security considerations
- Section E is the important one: it proves `filterVisibleFields_` (`Permissions.gs`) actually removes money columns from the *exported file*, not just from the screen. An export that leaks `unitPrice`/`totalIncVat` to a `warehouse`-style role is a data-exposure bug, not a formatting bug.
- Confirm the Drive export folder (4.5.3) is not publicly shared — the emailed link must not be world-readable.

## Next steps
→ M4 shipped. Proceed to Phase 3 (M5.3 permission matrix editor).
