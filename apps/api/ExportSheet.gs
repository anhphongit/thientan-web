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
  var rows = buildExportRows_(user, buckets);
  var ss = SpreadsheetApp.create('export-' + Utilities.getUuid());
  try {
    var sheet = ss.getSheets()[0];
    writeExportRowsToSheet_(sheet, rows);
    return {
      filename: exportFilename_('orders', 'xlsx'),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      base64: fetchSpreadsheetExportBase64_(ss.getId(), 'xlsx')
    };
  } finally {
    // Runs on the success path too, not just on error — this file must
    // never leave a temp spreadsheet behind in the deploying account's
    // Drive. DriveApp.getFileById(...).setTrashed(true) rather than a hard
    // delete: recoverable for a short window if something goes wrong,
    // still gets out of the way immediately either way.
    try { DriveApp.getFileById(ss.getId()).setTrashed(true); }
    catch (cleanupErr) { console.error('buildExportXlsx_: temp file cleanup failed for ' +
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

function writeExportRowsToSheet_(sheet, rows) {
  var width = EXPORT_CSV_HEADER.length;
  var grid = [EXPORT_CSV_HEADER.slice()];
  var boldRowIndexes = [0]; // header
  var groupHeaderRowIndexes = []; // "THÁNG n" banner rows — merge A:L
  var totalRowIndexes = [];       // "DOANH SỐ..." rows — merge A:G (blank lead-in)
  var orderMerges = [];           // {row, span} for each multi-line order group

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
      } else if (row.groupSize > 1) {
        orderMerges.push({ row: grid.length - 1, span: row.groupSize });
      }
    }
  });

  // Always write, even with zero data rows — the header alone must still
  // land on the sheet (caught by a test: the `> 1` guard here originally
  // skipped setValues entirely for an empty result, leaving the temp sheet
  // completely blank instead of "just a header").
  sheet.getRange(1, 1, grid.length, width).setValues(grid);

  boldRowIndexes.forEach(function (i) {
    sheet.getRange(i + 1, 1, 1, width).setFontWeight('bold');
  });

  // 0-indexed `i` above -> 1-indexed sheet row is i + 1 throughout below,
  // same convention as the bold loop.
  groupHeaderRowIndexes.forEach(function (i) {
    sheet.getRange(i + 1, 1, 1, width).merge();
  });
  totalRowIndexes.forEach(function (i) {
    sheet.getRange(i + 1, 1, 1, 7).merge(); // A:G blank lead-in before the DOANH SỐ label in H
  });
  orderMerges.forEach(function (m) {
    EXPORT_MERGE_COLS.forEach(function (col) {
      sheet.getRange(m.row + 1, col, m.span, 1).merge();
    });
  });
  // Merged multi-row cells default to bottom/middle-aligned in Sheets;
  // top-align so STT/PO/KHÁCH HÀNG/TRẠNG THÁI line up with the order's
  // FIRST item line, not float to the visual center of the merged block.
  if (orderMerges.length) {
    orderMerges.forEach(function (m) {
      EXPORT_MERGE_COLS.forEach(function (col) {
        sheet.getRange(m.row + 1, col, m.span, 1).setVerticalAlignment('top');
      });
    });
  }

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, width);
}

function padRow_(cells, width) {
  var out = cells.slice(0, width);
  while (out.length < width) out.push('');
  return out;
}

/**
 * Fetches a spreadsheet's own Drive export URL as raw bytes, returned
 * base64-encoded (doPost's JSON response has no binary channel — the
 * client decodes this back into a Blob/File, see apiExportOrdersXlsx in
 * apps/web/Main.gs). `format` is the Drive export `exportFormat`
 * ('xlsx' here; 'pdf' would be 4.4's same helper, different format and
 * print params).
 */
function fetchSpreadsheetExportBase64_(spreadsheetId, format) {
  var url = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId +
    '/export?format=' + format;
  var resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Export tải file thất bại (HTTP ' + resp.getResponseCode() + ').');
  }
  return Utilities.base64Encode(resp.getBlob().getBytes());
}
