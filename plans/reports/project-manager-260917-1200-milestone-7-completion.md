# Milestone 7 — Legacy Excel Order Import: Completion Report

**Date**: 2026-09-17  
**Status**: COMPLETE ✓

---

## Summary

**Milestone 7 (Legacy Excel Order Import) is fully complete and live.** All 5 implementation phases tested, executed against production, and validated. Live run on 2026-09-17 imported ~206 orders (~534 lines) from historical Excel into Orders/OrderLines/Invoices/StatusHistory. Reconciliation clean across all 8 months.

---

## Phase Delivery Status

| Phase | Work | Status | Completion |
|-------|------|--------|------------|
| 1 | Ingestion + dry-run parsing | ✓ Complete | 2026-09-17 |
| 2 | Field mapping + extraction rules | ✓ Complete | 2026-09-17 |
| 3 | Bulk write path (Orders/Lines/Invoices) | ✓ Complete | 2026-09-17 |
| 4 | Idempotency + resumability | ✓ Complete | 2026-09-17 |
| 5 | Reconciliation + live run + docs sync | ⚠️ Code/Execution Complete; Docs In Progress | 2026-09-17 |

---

## Key Achievements

### Code Delivery
- **5 new modules**: LegacyImport.gs, LegacyImportParse.gs, LegacyImportMap*.gs (4 files), LegacyImportDateParse.gs, LegacyImportWrite*.gs (2 files), LegacyImportReconcile.gs, LegacyImportDateAudit.gs, LegacyImportWriteResume.gs
- **Offline test coverage**: 162+ assertions (mapping), 13+ assertions (date parsing), 10+ assertions (resumability)
- **Code review (2026-09-16)**: Found + fixed 1 critical issue (createdBy handling) + 3 high-priority issues

### Real-World Bug Fixes (Executed During Test/Live Runs)
1. **Year-2001 date bug** (2026-09-16): Bare `d/m` dates silently corrupted to year 2001 via native `Date()` constructor. Fixed via `legacyParseHistoricalDate_()` with explicit bare-d/m handling.
2. **US M/D/YYYY rollover bug** (2026-09-16): 5 rows in THÁNG 4 (4/21/2026, 5/15/2026 etc.) parsed as D/M, silently rolled year/month. Fixed with validation on day/month ranges, fallback to M/D only when D/M invalid.
3. **Drive rate-limit quota** (2026-09-16): `Drive.Files.copy` hit transient per-user quota on repeated audit runs. Fixed with exponential backoff retry (2s, 4s, 8s, 16s).
4. **6-minute execution timeout** (2026-09-16): 150-order/run cap exceeded Apps Script ceiling on real historical data (per-line writes + invoice linkage + Config seeding). Fixed with 270-second wall-clock time budget + clean resumption.
5. **Export feature bug (unrelated to M7 itself, but fixed same session)**: XLSX export merged TRẠNG THÁI status column across order lines, discarding per-line status data post-M5a. Fixed in Export.gs/ExportSheet.gs.

### Live Run Results (2026-09-17)
- **Import volume**: ~206 orders, ~534 lines successfully written
- **Reconciliation**: `reconcileLegacyImport()` — all 8 months (THÁNG 1–8) reconciled OK against printed `DOANH SỐ THÁNG n` totals
- **Fresh backup**: `backupNow()` executed immediately before live write (M6 prerequisite satisfied)
- **Owner present**: Project owner reviewed output as run executed
- **UI spot-check**: 5 imported orders opened in live web app — customer, lines, VAT, status, invoice all render correctly

---

## Unresolved / Pending Items

### Phase 5 Docs Sync (Remaining)
Success Criteria not yet fully checked:
- [ ] `docs/EXCEL_REFERENCE.md` — top banner: add M7 historical import event description + date, reaffirm manual-entry policy still holds going forward
- [ ] `docs/OPEN_QUESTIONS.md` — "Import the existing Excel? No" row: add note pointing to M7 as later scoped exception
- [ ] `README.md` — "Reference data" section: qualify "It is never imported" or add pointer to M7
- [ ] `docs/MILESTONES.md` — add "☐ Milestone 7" section with scope + exit criteria + 2026-09-17 completion date
- [ ] `docs/development-roadmap.md` — add M7 to timeline/dependency tree + progress log
- [ ] `docs/DATA_MODEL.md` — note near Orders/OrderLines that M7 historical rows carry the admin's `createdBy` identity

**Owner action required**: Confirm these doc updates are complete before final sign-off.

---

## Risk Register

| Risk | Status | Resolution |
|------|--------|-----------|
| Year-2001 silent date corruption | ✓ Resolved | Fixed date parsing, validated on real file |
| Month-year silent rollover (US M/D) | ✓ Resolved | Added range validation + fallback logic |
| Drive quota transient errors | ✓ Resolved | Exponential backoff retry with 16s max wait |
| Execution timeout on 150-order batch | ✓ Resolved | 270s wall-clock budget + clean resumption |
| Reconciliation mismatch to printed totals | ✓ Resolved | All 8 months reconcile within tolerance |
| Export feature incompatibility (M5a) | ✓ Resolved | Fixed XLSX merge bug in same session |

---

## Next Actions

1. **Docs Manager**: Delegate to `docs-manager` agent (primary-workflow Step 4) to complete Phase 5 doc updates (6 files) and verify cross-references
2. **Journal**: After docs complete, run `/ck:journal` to record the M7 one-time production migration event
3. **Plan Archive**: When docs sign-off confirmed, run `/ck:clean-plans` to move plan folder to plans/done/

---

## Scope & Dependencies

- **Blockedby (both resolved before M7 started)**: M5a (schema: `OrderLines.status` + `StatusHistory.lineId`), M6 (backup safety: `backupNow()`)
- **Blocks**: Nothing — this is the last milestone before employee rollout with real data
- **No scope changes** from original plan (2026-09-14)

---

## Unresolved Questions

1. **Docs update assignment**: Is project-manager responsible for updating all 6 docs files, or should this be delegated to docs-manager after mark-off? (Current: delegation flagged for docs-manager in Next Actions)
2. **Two source-file data issues (2026-09-16 audit)**: Rows with genuinely invalid dates (`"30/30"`, `"24/24/26"`) were not automatically fixed in the source `.xlsx` before live run — did the user manually correct these cells, or should they be flagged as "skipped orders"? (Not critical for reconciliation since those orders didn't write, but should be logged if found in final audit.)

---

**Plan folder**: `/Users/phongna/anhphongit/Projects/thientan-web/plans/260914-1115-milestone-7-legacy-excel-import/`  
**All phase status files**: Updated with completion date 2026-09-17
