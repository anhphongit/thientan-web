---
phase: 1
title: "Ingestion and Dry-Run Parsing"
status: completed
priority: P2
effort: "6h"
dependencies: []
completed: 2026-09-17
---

# Phase 1: Ingestion and Dry-Run Parsing

## Overview

Get the raw `.xlsx` into a form Apps Script can read, then parse its month-block/order-group
structure into an in-memory array of plain JS objects — **no writes to Orders/OrderLines/
Invoices yet**. This phase produces a parse-only "dry run" report so the shape of the data can
be reviewed before anything touches production sheets.

## Key Insights

- No xlsx-parsing library exists in Apps Script. The standard technique: upload the `.xlsx` to
  Drive, then `Drive.Files.copy(fileId, {mimeType: 'application/vnd.google-apps.spreadsheet'})`
  (Advanced Drive Service) converts it into a real Google Sheet, which `SpreadsheetApp.openById`
  can then read normally. Requires enabling the Advanced Drive Service in
  `apps/api/appsscript.json` (`enabledAdvancedServices`) — currently `dependencies: {}` is
  empty. The `drive` OAuth scope is already present.
- Per `docs/EXCEL_REFERENCE.md` §1: one sheet `THONGKE_2026`, used range `A1:L1278`, row 2 =
  header, row 3 = year, then repeating `THÁNG n` / order rows / `DOANH SỐ THÁNG n` blocks for
  n = 1..8.
- Per §3: an order is a **group of consecutive rows** — first row has `STT` (col A) and usually
  `PO`/`HÓA ĐƠN`/`Ngày HĐ`; continuation rows leave A/B blank and repeat only customer + line
  data. Use `getDisplayValues()` (not `getValues()`) so multi-line cell text and Vietnamese
  formatting come through as typed.
- Multi-line cells (PO, TRẠNG THÁI) contain literal `\n` — split on that reliably; do not assume
  a fixed number of lines (§3 shows both 2- and 3-line PO cells).

## Requirements

- Functional: convert xlsx → temp Sheet, locate month blocks, group rows into order units,
  emit one structured object per order (with a nested array of line objects) covering all
  8 observed months.
- Non-functional: parsing must be **read-only** against the legacy data — no writes to the
  live app sheets in this phase. The temporary converted Sheet is deleted (or left in a
  clearly-named Drive folder) after parsing; it is scratch, not part of the app's spreadsheet.

## Architecture

```
Admin uploads FILE THEO DOI DON HANG.xlsx to Drive (manual step, one time)
  → migrateImportLegacyOrders() reads the Drive file ID from a Script Property
    (LEGACY_IMPORT_FILE_ID, same pattern as ADMIN_EMAIL in DevSeed.gs)
  → Drive.Files.copy(...) converts it to a temp Google Sheet
  → SpreadsheetApp.openById(tempSheetId).getSheetByName('THONGKE_2026')
  → parseLegacySheet_(sheet) walks rows top to bottom:
      - detect "THÁNG n" rows → set currentMonth
      - detect "DOANH SỐ THÁNG n" rows → close out the month, record its printed total
        for Phase 5's reconciliation check
      - otherwise: STT non-blank → start new order group; STT blank → append line to
        current order group
  → returns { months: [{month, orders: [...], printedTotal}], unrecognizedRows: [...] }
```

## Related Code Files

- Create: `apps/api/LegacyImport.gs` (new file — keeps `Migrations.gs` focused on schema
  migrations; this is a data migration, distinct concern, kept under 200 lines per file per
  the modularization rule — split into `LegacyImport.gs` for orchestration and
  `LegacyImportParse.gs` for the row-grouping/parsing helpers if it grows past ~200 lines)
- Modify: `apps/api/appsscript.json` — add `enabledAdvancedServices` for Drive v2/v3
- Read for context: `apps/api/Migrations.gs` (function-naming/guard convention),
  `apps/api/DevSeed.gs` (Script-Properties-driven admin identity pattern),
  `docs/EXCEL_REFERENCE.md` (full structure spec)

## Implementation Steps

1. Add Advanced Drive Service to `apps/api/appsscript.json`.
2. Write `convertLegacyXlsxToSheet_(driveFileId)` — copies + converts, returns the temp
   spreadsheet ID.
3. Write `parseLegacySheet_(sheet)` — row-walker producing the `{months, unrecognizedRows}`
   structure above, using `getDisplayValues()`.
4. Write `dryRunImportLegacyOrders()` (no-underscore, `guardSetup_()`-guarded, appears in the
   Run dropdown) — runs the conversion + parse, and **logs a report only**: order count per
   month, line count per month, any row that didn't match the expected group pattern
   (`unrecognizedRows`), and the month's printed `DOANH SỐ THÁNG n` value for later
   reconciliation. Returns the report string; writes nothing to `Orders`/`OrderLines`/
   `Invoices`.
5. Manually run `dryRunImportLegacyOrders()` against the real file once, and confirm the
   reported order/line counts roughly match `docs/EXCEL_REFERENCE.md`'s observed counts
   (~206 orders, ~534 lines) before proceeding to Phase 2.

## Success Criteria

**Status: Complete (2026-09-17). Live execution against production file succeeded.**

- [x] `dryRunImportLegacyOrders()` runs end-to-end against the real `.xlsx` with zero writes
      to any live sheet (verified by checking `Orders`/`OrderLines`/`Invoices` row counts are
      unchanged before/after) — *executed runbook Step 2, 2026-09-16; confirmed zero writes*
- [x] Reported order/line counts are within a small margin of the ~206/~534 documented in
      `EXCEL_REFERENCE.md` (exact match not expected — some rows may be genuinely ambiguous)
      — *offline parse tests pass; real file execution confirmed count accuracy*
- [x] Every one of the 8 month blocks (THÁNG 1–8) is detected and its `DOANH SỐ THÁNG n`
      printed total captured — *offline tests pass; real file execution confirmed all 8 months detected*
- [x] `unrecognizedRows` is reviewed manually and is either empty or fully explained (e.g. a
      stray blank row) before Phase 2 begins — *runbook Step 2 execution, reviewed and acceptable*

## Risk Assessment

- **Advanced Drive Service quota/permission issues**: mitigate by testing the conversion step
  in isolation first, on a small dummy `.xlsx`, before pointing it at the real file.
- **Silent misparse of a multi-line cell** (e.g. a 4-line PO cell nobody anticipated): the
  `unrecognizedRows`/manual-count-check step in step 5 is the guard against this reaching
  Phase 3 undetected.

## Security Considerations

- The temporary converted Sheet contains the same sensitive business data as the main app
  spreadsheet (customer names, prices, deposits) — must not be left world-readable in Drive;
  create it in a private folder or delete it immediately after parsing succeeds.
