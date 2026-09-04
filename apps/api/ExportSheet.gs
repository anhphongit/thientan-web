/**
 * ExportSheet.gs — Milestone 4 / 4.3: XLSX export via a temporary Google
 * Sheet.
 *
 * Deliberate, scoped exception to CONVENTIONS.md's "business logic never
 * calls SpreadsheetApp directly — always via SheetsRepo.gs" rule: that
 * rule is about the app's DATA spreadsheet (SheetsRepo.gs owns reading and
 * writing Orders/OrderLines/etc, addressed by header name, never by
 * index). This file never touches that spreadsheet at all — it creates a
 * throwaway, unrelated Spreadsheet purely as an XLSX-writing mechanism
 * (Apps Script's V8 sandbox cannot run an XLSX-writer library directly —
 * see the 2026-09-03 platform research in TASKS.md's Milestone 4 section),
 * and deletes it again before returning. Isolating that narrow, mechanical
 * concern in its own file — same principle as SheetsRepo.gs, just for a
 * different spreadsheet — keeps the "only one file calls SpreadsheetApp
 * for the real data" rule meaningful instead of eroding it by exception.
 *
 * Flow: SpreadsheetApp.create() a temp workbook -> batch-write the same
 * row structure buildExportRows_() already produces for CSV (Export.gs)
 * -> apply minimal formatting (bold header/group/total rows, frozen
 * header, autosized columns) -> fetch its own XLSX export URL via
 * UrlFetchApp + ScriptApp.getOAuthToken() -> base64-encode the bytes for
 * the JSON response (doPost can't return binary) -> delete the temp file
 * in a finally, success or failure.
 */

/**
 * @param {Object} user
 * @param {Array<{bucketKey:string,label:string,orderGroups:Object[]}>} buckets
 *   from bucketOrdersForExport_ — same input buildExportCsv_ takes.
 * @return {{filename:string, mimeType:string, base64:string}}
 */
function buildExportXlsx_(user, buckets) {
  return withTempExportSheet_(user, buckets, function (ss, sheet) {
    return {
      filename: exportFilename_('orders', 'xlsx'),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      base64: fetchSpreadsheetExportBase64_(ss.getId(), 'xlsx', {})
    };
  });
}

/**
 * Milestone 4 / 4.4 — PDF export. Same temp-Sheet build as XLSX
 * (buildExportXlsx_) — only the final export step differs: PDF-specific
 * print params instead of format=xlsx, and the used range must be passed
 * explicitly (`range`) or Drive's PDF export renders the sheet's full
 * default grid — mostly blank pages — instead of just the written rows.
 *
 * @return {{filename:string, mimeType:string, base64:string}}
 */
function buildExportPdf_(user, buckets) {
  return withTempExportSheet_(user, buckets, function (ss, sheet) {
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    var params = {
      gid: sheet.getSheetId(),
      // Portrait A4, fit width to page, gridlines on, print titles
      // (frozen header repeats per page) — the readable-report defaults
      // for a long, many-row export; not user-configurable in 4.4 (no UI
      // control for it), same "ship the sensible default first" approach
      // 4.1/4.2 took before their own options were added.
      size: 'A4', portrait: 'true', fitw: 'true', gridlines: 'true',
      printtitle: 'false', sheetnames: 'false', pagenumbers: 'true',
      fzr: 'true', // repeat frozen row(s) on every page
      top_margin: '0.5', bottom_margin: '0.5', left_margin: '0.5', right_margin: '0.5',
      horizontal_alignment: 'CENTER',
      // Explicit used range — see the doc comment above for why this is
      // required, not optional, for PDF specifically.
      range: sheet.getRange(1, 1, lastRow, lastCol).getA1Notation()
    };
    return {
      filename: exportFilename_('orders', 'pdf'),
      mimeType: 'application/pdf',
      base64: fetchSpreadsheetExportBase64_(ss.getId(), 'pdf', params)
    };
  });
}

/**
 * Shared by XLSX (4.3) and PDF (4.4): build the temp spreadsheet, write
 * the shared row structure into it, hand (ss, sheet) to `fn` to produce
 * the format-specific result, then clean up — success or failure — no
 * matter what `fn` does or throws. One place owns "create, populate,
 * always delete" so the two formats can't drift on the cleanup guarantee.
 */
function withTempExportSheet_(user, buckets, fn) {
  var rows = buildExportRows_(user, buckets);
  var ss = SpreadsheetApp.create('export-' + Utilities.getUuid());
  try {
    var sheet = ss.getSheets()[0];
    writeExportRowsToSheet_(sheet, rows);
    return fn(ss, sheet);
  } finally {
    // Runs on the success path too, not just on error — this file must
    // never leave a temp spreadsheet behind in the deploying account's
    // Drive. DriveApp.getFileById(...).setTrashed(true) rather than a hard
    // delete: recoverable for a short window if something goes wrong,
    // still gets out of the way immediately either way.
    try { DriveApp.getFileById(ss.getId()).setTrashed(true); }
    catch (cleanupErr) { console.error('withTempExportSheet_: temp file cleanup failed for ' +
      ss.getId() + ': ' + (cleanupErr && cleanupErr.message)); }
  }
}

/**
 * Batch-writes the shared row structure (kind: 'group'|'data'|'total')
 * into `sheet`, then applies the same visual hierarchy the reference
 * Excel file has (EXCEL_REFERENCE.md): bold header, bold month/bucket
 * label rows, bold DOANH SỐ total rows, frozen header row, autosized
 * columns. One setValues() call for the whole grid rather than per-row —
 * this can be thousands of rows for a multi-year export (4.5's concern is
 * the 6-minute EXECUTION limit for very large exports; batching the write
 * itself is basic hygiene regardless of size).
 */
/** Columns that get merged down an order's line rows, matching how a
 *  person reading the reference file perceives it (one row per order,
 *  wrapping several item lines) even though the source file itself only
 *  blank-repeats rather than truly merging (EXCEL_REFERENCE.md §3) —
 *  Phong's call, 2026-09-03: the XLSX export should look more finished
 *  than a 1:1 text reproduction. 1-indexed, matches EXPORT_CSV_HEADER. */
var EXPORT_MERGE_COLS = [1, 2, 3, 12]; // STT, PO, KHÁCH HÀNG, TRẠNG THÁI

/** Money columns (ĐƠN GIÁ, THÀNH TIỀN, TRỊ GIÁ HĐ) — Milestone 4 revision,
 *  2026-09-03 (Phong: exported numbers should read as currency, thousand
 *  separators, no currency symbol needed per-cell since VND is implied by
 *  the sheet). A real Sheets/Excel NUMBER FORMAT, not a formatted string:
 *  the cell stays a genuine number (sortable, summable, usable in a
 *  formula) and only its DISPLAY gets the "#,##0" thousand-separator
 *  pattern — matches the reference file's own money columns
 *  (EXCEL_REFERENCE.md §7: "Money right-aligned, thousand separators, no
 *  decimals"). 1-indexed, matches EXPORT_CSV_HEADER. CSV is unaffected —
 *  a flat text format has no number-format concept, so buildExportCsv_
 *  keeps writing plain numbers for the destination app (Excel, Sheets) to
 *  format on open, same as before this revision. */
var EXPORT_MONEY_COLS = [5, 8, 9]; // ĐƠN GIÁ BÁN RA VND, THÀNH TIỀN..., TRỊ GIÁ HĐ

/** Milestone 4 — visual style "Option A" (minimal), Phong's choice
 *  2026-09-04 from 4 mockup options (/tmp/mockups/xlsx-style-options.html):
 *  thin light-grey grid borders on every written cell, plus very light
 *  grey fills on the header/THÁNG/DOANH SỐ rows only — no brand color, so
 *  the file still reads cleanly if printed in black & white. */
var EXPORT_FILL_HEADER = '#f2f3f5';
var EXPORT_FILL_GROUP = '#eef2f6';   // THÁNG banner rows
var EXPORT_FILL_TOTAL = '#f7f7f7';   // DOANH SỐ rows
var EXPORT_BORDER_COLOR = '#d0d5dd';

/**
 * Milestone 4 / 4.5.1 refactor: writeExportRowsToSheet_ used to build the
 * grid, write it, AND style it in one pass — fine for the synchronous
 * XLSX/PDF path (4.3/4.4), but the large/async job path (ExportJob.gs)
 * needs to write the grid in checkpointable SLICES while styling only
 * needs to run once, at the very end, over the whole finished sheet.
 * Split into three pieces so both paths share the same logic instead of
 * two implementations drifting apart:
 *   - buildExportGrid_    pure, builds the 2D array + bookkeeping
 *                         (which rows are bold/group/total, which orders
 *                         merge) from the same `rows` shape
 *                         buildExportRows_ (Export.gs) already produces.
 *   - writeExportGridValues_  the actual sheet.getRange().setValues()
 *                         call — the one that's expensive/checkpointable
 *                         for a huge export.
 *   - applyExportGridStyles_  bold/merge/number-format/border/background/
 *                         frozen-row/autosize — everything that must see
 *                         the FULL grid to run correctly (e.g. the money-
 *                         format range spans first-to-last data row).
 * writeExportRowsToSheet_ itself is now a thin wrapper of these three,
 * unchanged in behavior for its existing callers (withTempExportSheet_).
 */
function buildExportGrid_(rows) {
  var width = EXPORT_CSV_HEADER.length;
  var grid = [EXPORT_CSV_HEADER.slice()];
  var boldRowIndexes = [0]; // header
  var groupHeaderRowIndexes = []; // "THÁNG n" banner rows — merge A:L
  var totalRowIndexes = [];       // "DOANH SỐ..." rows — merge A:G (blank lead-in)
  var orderMerges = [];           // {row, span} for each multi-line order group
  var dataRowIndexes = [];        // plain data rows — money-format their money cells

  rows.forEach(function (row) {
    if (row.kind === 'group') {
      var groupRow = new Array(width).fill('');
      groupRow[0] = row.cells[0];
      grid.push(groupRow);
      boldRowIndexes.push(grid.length - 1);
      groupHeaderRowIndexes.push(grid.length - 1);
    } else {
      grid.push(padRow_(row.cells, width));
      if (row.kind === 'total') {
        boldRowIndexes.push(grid.length - 1);
        totalRowIndexes.push(grid.length - 1);
      } else {
        dataRowIndexes.push(grid.length - 1);
        if (row.groupSize > 1) orderMerges.push({ row: grid.length - 1, span: row.groupSize });
      }
    }
  });

  return {
    width: width, grid: grid,
    boldRowIndexes: boldRowIndexes, groupHeaderRowIndexes: groupHeaderRowIndexes,
    totalRowIndexes: totalRowIndexes, orderMerges: orderMerges, dataRowIndexes: dataRowIndexes
  };
}

/** Writes built.grid (from buildExportGrid_) to `sheet` starting at row 1.
 *  Always writes, even with zero data rows — the header alone must still
 *  land on the sheet (caught by a test: an earlier `> 1` guard here
 *  originally skipped setValues entirely for an empty result, leaving the
 *  temp sheet completely blank instead of "just a header"). */
function writeExportGridValues_(sheet, built) {
  sheet.getRange(1, 1, built.grid.length, built.width).setValues(built.grid);
}

/** Applies every visual touch (bold/merge/number-format/border/
 *  background/frozen-row/autosize) to `sheet`, using `built`'s bookkeeping
 *  from buildExportGrid_. Must run AFTER every row has been written
 *  (writeExportGridValues_ or ExportJob.gs's batched equivalent) — several
 *  of these calls (the money-format range, the full-grid border) size
 *  themselves off built.grid.length / the full row set, not a single
 *  batch's worth. */
function applyExportGridStyles_(sheet, built) {
  var width = built.width;

  built.boldRowIndexes.forEach(function (i) {
    sheet.getRange(i + 1, 1, 1, width).setFontWeight('bold');
  });

  // 0-indexed `i` above -> 1-indexed sheet row is i + 1 throughout below,
  // same convention as the bold loop.
  built.groupHeaderRowIndexes.forEach(function (i) {
    sheet.getRange(i + 1, 1, 1, width).merge();
  });
  built.totalRowIndexes.forEach(function (i) {
    sheet.getRange(i + 1, 1, 1, 7).merge(); // A:G blank lead-in before the DOANH SỐ label in H
  });
  built.orderMerges.forEach(function (m) {
    EXPORT_MERGE_COLS.forEach(function (col) {
      sheet.getRange(m.row + 1, col, m.span, 1).merge();
    });
  });
  // Merged multi-row cells default to bottom/middle-aligned in Sheets;
  // top-align so STT/PO/KHÁCH HÀNG/TRẠNG THÁI line up with the order's
  // FIRST item line, not float to the visual center of the merged block.
  if (built.orderMerges.length) {
    built.orderMerges.forEach(function (m) {
      EXPORT_MERGE_COLS.forEach(function (col) {
        sheet.getRange(m.row + 1, col, m.span, 1).setVerticalAlignment('top');
      });
    });
  }

  // Money columns get a real number format ("#,##0" — thousand
  // separators, no decimals, no currency symbol) rather than a
  // pre-formatted string, so the cell stays a genuine number (Phong,
  // 2026-09-03). Applied over the whole data-row span per column in one
  // call rather than per contiguous run: group/THÁNG and DOANH SỐ rows
  // sit inside that span too, but they hold text in these columns, not
  // numbers, so a number format on them is inert — simpler than
  // reconstructing the (possibly many) contiguous data-row sub-ranges a
  // multi-month export would otherwise need.
  if (built.dataRowIndexes.length) {
    var firstDataRow = built.dataRowIndexes[0] + 1;
    var lastDataRow = built.dataRowIndexes[built.dataRowIndexes.length - 1] + 1;
    var spanRows = lastDataRow - firstDataRow + 1;
    EXPORT_MONEY_COLS.forEach(function (col) {
      sheet.getRange(firstDataRow, col, spanRows, 1).setNumberFormat('#,##0');
    });
  }

  // Option A styling: thin grey grid on every written cell, plus very
  // light grey fills marking header/THÁNG/DOANH SỐ rows (no brand color —
  // see EXPORT_FILL_* doc comment above).
  var fullRange = sheet.getRange(1, 1, built.grid.length, width);
  fullRange.setBorder(true, true, true, true, true, true, EXPORT_BORDER_COLOR, SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(1, 1, 1, width).setBackground(EXPORT_FILL_HEADER);
  built.groupHeaderRowIndexes.forEach(function (i) {
    sheet.getRange(i + 1, 1, 1, width).setBackground(EXPORT_FILL_GROUP);
  });
  built.totalRowIndexes.forEach(function (i) {
    sheet.getRange(i + 1, 1, 1, width).setBackground(EXPORT_FILL_TOTAL);
  });

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, width);
}

function writeExportRowsToSheet_(sheet, rows) {
  var built = buildExportGrid_(rows);
  writeExportGridValues_(sheet, built);
  applyExportGridStyles_(sheet, built);
}

function padRow_(cells, width) {
  var out = cells.slice(0, width);
  while (out.length < width) out.push('');
  return out;
}

/**
 * Fetches a spreadsheet's own Drive export URL as raw bytes, returned
 * base64-encoded (doPost's JSON response has no binary channel — the
 * client decodes this back into a Blob/File, see apiExportOrdersXlsx /
 * apiExportOrdersPdf in apps/web/Main.gs). `format` is the Drive export
 * `exportFormat` ('xlsx' or 'pdf'); `params` (Milestone 4 / 4.4) are
 * extra query params for that format — PDF needs several (gid, size,
 * range, margins, ...) to render as a real report instead of the sheet's
 * full default grid; XLSX passes {} since the whole used range exports
 * as-is with no extra params needed.
 */
function fetchSpreadsheetExportBase64_(spreadsheetId, format, params) {
  var query = 'format=' + format;
  Object.keys(params || {}).forEach(function (key) {
    query += '&' + encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
  });
  var url = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/export?' + query;
  var resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Export tải file thất bại (HTTP ' + resp.getResponseCode() + ').');
  }
  return Utilities.base64Encode(resp.getBlob().getBytes());
}
