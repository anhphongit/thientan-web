# Milestone 7 Completion: Live Production Run — Real Data Taught Us Four Lessons

**Date:** 2026-09-17 14:30
**Severity:** Medium (bugs found and fixed, import succeeded)
**Component:** Legacy Excel Import (LegacyImport*.gs suite, ExportSheet.gs)
**Status:** ✅ COMPLETE — 206 orders / 534 lines imported, 8 months reconciled, all 4 bugs fixed mid-run

---

## What Happened

Live production run of `migrateImportLegacyOrders()` completed successfully. 206 orders across 8 months, 534 line items, all imported and reconciled against the source file's own printed DOANH SỐ THÁNG monthly totals (zero variance). But getting there required finding and fixing **4 entirely real bugs** that the previous day's 162-assertion offline test suite never surfaced — all bugs were triggered by actual data characteristics in the real production file that no synthetic fixture would reasonably have included.

---

## The Brutal Truth

Offline testing was thorough but powerless. We built 5 test files with synthetic fixtures carefully shaped to exercise parsing logic, extraction rules, write ordering, resumability state, and reconciliation math. Every test passed. Every assertion green. Then we ran against real data and discovered we'd been testing in a toy sandbox.

**The gap:** Offline tests can validate algorithmic correctness (does the parser handle "15/3/2026" correctly?). Real data validates assumptions about **what formats actually exist in the file** (and turns out: "15/3/2026", "3/15/2026", bare "15/3", bare "3/15", and mismatched D/M/year combinations all coexist in the same column). No synthetic fixture, however well-intentioned, would have been creative enough to include all of those simultaneously, because they don't make logical sense together — and yet the production file had them.

This is humbling. It's also actionable: **the runbook's manual pre-run steps exist precisely to catch this gap.** We proved it.

---

## Technical Details

### Bug #1: Year-2001 Silent Corruption (Ngày HĐ field)

**Symptoms:** ~40 orders with `Ngày HĐ` (invoice date) rendered as year 2001 instead of 2026, or silently skipped entirely.

**Root cause:** The shared `parseDate_()` function (Orders.gs) handled ISO ("2026-09-17") and full d/m/yyyy ("17/9/2026"), but fell back to native `new Date(text)` for anything else. That fallback is V8's legacy-parser behavior: `new Date("6/6")` succeeds as US m/d with year defaulting to 2001, while `new Date("22/9")` (day>12, unambiguous D/M) correctly fails. The production file had ~40 rows with bare "d/m" (no year), mixed alongside full d/m/yyyy rows in the same column.

**Fix:** New `legacyParseHistoricalDate_()` function (LegacyImportDateParse.gs) explicitly handles bare d/m by defaulting to `legacyImportYear_()` (2026, derived from sheet name `THONGKE_2026`) instead of ever touching the native Date fallback for that input shape. Added diagnostic `legacyAuditNgayHdFormats()` to audit all date formats in the real file before dry-run.

### Bug #2: Mixed US M/D in Vietnamese D/M Column

**Symptoms:** 5 rows in THÁNG 4 block parse as month 21, silently overflowing to 2027 via JS Date overflow arithmetic.

**Root cause:** Five rows had US M/D/YYYY format (e.g., "4/21/2026") mixed into an otherwise all-Vietnamese-D/M file. The d/m/yyyy parsing had no range validation, so day=4/month=21 silently rolled over via `new Date(2026, 20, ...)` (month index 20 = October 2027).

**Fix:** Added day/month range validation to d/m/yyyy branch (day 1–31, month 1–12). If D/M is mathematically invalid (month > 12), fall back to M/D interpretation only — confirmed as the only remaining valid reading for that shape, not a guess. Purpose-built diagnostic confirmed this was the only remaining ambiguity.

### Bug #3: Google Drive API Rate Limit

**Symptoms:** `GoogleJsonResponseException: ... User rate limit exceeded` on `Drive.Files.copy` during the 4th audit/dry-run/write cycle in quick succession.

**Root cause:** Session's repeated audit and dry-run executions in quick succession tripped Google's per-user Drive API quota (100 calls/user/second, enforced at the user's OAuth token level, not the Apps Script project level).

**Fix:** Exponential backoff retry (2s/4s/8s/16s) scoped to rate-limit errors specifically. Non-rate-limit errors fail fast (no retry). This is how the mirrored `DevSeed.gs` handles the same quota risk.

### Bug #4: Execution Time Timeout

**Symptoms:** `Exceeded maximum execution time` after ~150 orders, even though the original target was 150 orders/run (matching DevSeed.gs's precedent).

**Root cause:** Fixed 150-order cap assumed a per-order write cost that turned out too optimistic for real historical orders. Each legacy order triggers line writes + status history entries + invoice linkage logic + `rememberCustomer_()` and `rememberUoms_()` calls (added during code-review fix pass). Cumulative write cost exceeded 6-minute ceiling before all 206 orders completed.

**Fix:** Added 270-second wall-clock time budget (matching ExportJob.gs's existing `EXPORTJOB_TIME_BUDGET_MS` convention). The batch loop checks elapsed time before starting each order, stopping cleanly and reporting progress instead of letting Apps Script hard-kill mid-execution. Second run completed all 206 orders with 90 seconds remaining budget.

### Bug #5: XLSX Export Status Merge (Separate Issue)

**Symptoms:** User reported XLSX export was still showing a single status per order instead of per-line statuses (despite Milestone 5a's changes moving status from Orders to OrderLines).

**Root cause:** ExportSheet.gs's `buildExportRows_()` correctly computed each line's own status value, but the XLSX cell-merge logic still had `TRẠNG THÁI` in `EXPORT_MERGE_COLS` — a leftover from before status became per-line. Cell-merge then visually collapsed all of an order's lines down to the first line's status, discarding the rest.

**Fix:** Removed `TRẠNG THÁI` from merge-columns list. Data was correct; only the visual rendering was wrong.

### Discovery: The Deployment-Version Trap

**Separate lesson:** After fixing the XLSX export bug and pushing, user reported "the bug is still there." Extensive verification (grep for duplicate merge logic, re-checked CSV and async export path, confirmed no caching) found nothing wrong with the code. Actual cause: **apps/api has TWO Apps Script deployments** — @HEAD (always latest) and a separate frozen-version deployment (e.g., @72) — and `clasp push` updates the script project's source files but does NOT advance what a frozen-version deployment's production URL serves. Redeploying (new version + repoint) fixed it immediately. Saved as `apps-api-dual-deployment-gotcha.md` in memory — non-obvious trap that could cost hours again.

---

## What We Tried

**Offline test suite:** 162 assertions across 5 test files. Covered parsing rules, extraction state, write ordering, resumability tracking, reconciliation math. All green. All worthless against real data's actual variance.

**Diagnostic functions added:** `legacyAuditNgayHdFormats()` to inspect all date shapes in the real file before dry-run. Ran during the session itself and revealed the two date bugs immediately.

**Incremental real-data runs:** Didn't attempt all 206 orders on the first live run; instead, dry-run first (captured review flags), then migrated in two batches (first ~150, then ~56 to hit the timeout and stay under 6-minute ceiling). This controlled learning pace prevented losing work to a single bad run.

---

## Root Cause Analysis

**Why offline tests couldn't catch these bugs:**
1. Synthetic fixtures are shaped by human assumption about "reasonable" data. Real data is unreasonable. A file mixing bare d/m, full d/m/yyyy, and US M/D/YYYY in the same column doesn't make sense — so no reasonable test-fixture author would create it.
2. Infrastructure failures (Google quota) are deployment-time surprises, not code logic. Offline tests can't simulate API rate-limiting without mocking Google's actual quota behavior.
3. Execution time depends on real server state (how many rows the invoicing logic has to traverse, whether `rememberCustomer_` is adding to existing lists or creating new ones). Synthetic small fixtures don't model cumulative cost correctly.

**Why code review didn't catch these bugs:** Code review examined logic (is the algorithm correct?). It didn't run the algorithm against real production data (does the assumption hold?). These are different questions.

---

## Lessons Learned

1. **Offline testing validates assumptions; real testing invalidates them.** Build synthetic fixtures to exercise edge cases you can think of. Then run against real data to discover the edge cases you **can't** think of. Allocate time for both. Treating offline tests as complete verification is false confidence.

2. **Data variance can be non-obvious and adversarial.** A production file accumulating entries over years will have formatting inconsistencies, encoding quirks, and user-entry mistakes that don't cluster neatly. Be paranoid about format assumptions. Add range validation even when it seems unnecessary (month should always be 1–12, right? Turns out: no).

3. **Bulk operations demand infrastructure awareness.** A single-order interactive write doesn't trip Google API quotas or 6-minute timeouts. A bulk migration does. Budget for rate-limit retry logic and wall-clock time gating from the start, not after a failed run.

4. **Code fix being correct ≠ code fix being visible.** A frozen deployment version serves old bytecode regardless of what the source repo contains. After a fix, verify the right deployment is live. This trap cost 30 minutes of re-verification assuming the code was wrong when it was actually right.

---

## Closing Steps (Completed)

**Documentation signed off:** 6 files updated to describe import as completed historical event (2026-09-17):
- README.md (reflects "import completed" status)
- docs/EXCEL_REFERENCE.md (final state, no longer operational)
- docs/MILESTONES.md (Milestone 7 marked complete)
- docs/OPEN_QUESTIONS.md (removed migration uncertainties)
- docs/development-roadmap.md (timeline updated)
- docs/DATA_MODEL.md (historical import notes)

**Plan archived:** `plans/260916-1200-milestone-7-legacy-excel-import/` moved to `plans/done/`.

**Commits made** (on main, not pushed to remote — user's call):
- `0d0ca5c` feat: migration implementation
- `015dc8d` fix: export merge bug
- `73f4c90` docs: archive

**Verification:** All 206 orders reconciled against source file's own DOANH SỐ THÁNG totals (THÁNG 1–8) with zero variance. Import is production-ready; manual-entry-only policy unchanged going forward.

---

## Unresolved Questions

None. Milestone 7 is genuinely complete. The only open decision is whether to push the 3 commits to the remote repository (currently on local main only).
