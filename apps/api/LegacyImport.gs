/**
 * LegacyImport.gs — Milestone 7 / Phase 1: ingestion + dry-run parsing of the
 * legacy "FILE THEO DOI DON HANG.xlsx" spreadsheet ONLY.
 *
 * Same run-by-hand convention as Migrations.gs: no trailing underscore on
 * `dryRunImportLegacyOrders` so it appears in the API editor's Run dropdown,
 * `guardSetup_()`-guarded so it can never be reached over HTTP (it is never
 * added to getActions_()'s registry — see Router.gs — which is what actually
 * makes it unreachable; guardSetup_() below is the same belt-and-suspenders
 * sanity assertion every editor-only function in this project calls).
 *
 * THIS PHASE WRITES NOTHING to Orders/OrderLines/Invoices. It only converts
 * the source .xlsx to a temporary Google Sheet, parses its structure, and
 * returns/logs a report so the shape of the data can be reviewed by a human
 * before Phase 2 (field mapping + writes) is built. Grep this file: there is
 * no call to appendRecord_/updateRecord_ for SHEETS.ORDERS, SHEETS.ORDER_LINES
 * or SHEETS.INVOICES anywhere below.
 *
 * HOW TO RUN
 *   1. Upload FILE THEO DOI DON HANG.xlsx to Drive (one-time, manual).
 *   2. Set the `LEGACY_IMPORT_FILE_ID` Script Property to that file's Drive
 *      file id (same "read a configured Script Property" pattern DevSeed.gs
 *      uses for ADMIN_EMAIL — see convertLegacyXlsxToSheet_'s caller below).
 *   3. Push apps/api with this file included (appsscript.json must have the
 *      Advanced Drive Service enabled — see enabledAdvancedServices).
 *   4. Select `dryRunImportLegacyOrders` in the editor's Run dropdown and
 *      press Run. Read the returned report: order/line counts per month,
 *      any unrecognizedRows, and each month's printed DOANH SỐ THÁNG n
 *      total for later reconciliation (Phase 5).
 *
 * SECURITY: the temp converted Sheet holds the same sensitive business data
 * (customer names, prices, deposits) as the source file. It is deleted
 * (trashed) in a `finally` block immediately after parsing, whether parsing
 * succeeds or throws — never left sitting in Drive.
 */

/** The one sheet this legacy workbook has — see docs/EXCEL_REFERENCE.md §1. */
var LEGACY_SHEET_NAME_ = 'THONGKE_2026';

/**
 * Converts the source .xlsx (Drive file id `driveFileId`) into a temporary
 * Google Sheet via the Advanced Drive Service, so SpreadsheetApp can read it
 * (Apps Script has no native xlsx parser). Requires `enabledAdvancedServices`
 * for Drive in appsscript.json (the `drive` OAuth scope is already present).
 *
 * RETRIES on Google's transient "User rate limit exceeded" (2026-09-16
 * incident: repeated same-session runs of the audit/dry-run/write functions
 * — each one converts the file fresh, by design, so the temp copy is never
 * left sitting in Drive — tripped Drive's per-user quota). Any other error
 * (bad file id, permission denied, etc.) is NOT retried; it fails
 * immediately, since retrying those would just waste time.
 *
 * @return {string} the temp spreadsheet's Drive file id. Caller owns
 *   deleting it once parsing is done — see dryRunImportLegacyOrders().
 */
function convertLegacyXlsxToSheet_(driveFileId) {
  var maxAttempts = 5;
  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      var copied = Drive.Files.copy(
        {
          name: 'legacy-import-scratch-' + new Date().getTime(),
          mimeType: 'application/vnd.google-apps.spreadsheet'
        },
        driveFileId
      );
      return copied.id;
    } catch (err) {
      if (!legacyIsRetryableRateLimitError_(err) || attempt === maxAttempts) throw err;
      var waitMs = legacyRetryBackoffMs_(attempt);
      console.warn('convertLegacyXlsxToSheet_: Drive rate limit hit (attempt ' + attempt +
        '/' + maxAttempts + '), retrying in ' + (waitMs / 1000) + 's: ' + err);
      Utilities.sleep(waitMs);
    }
  }
}

/** @return {boolean} true if `err` looks like a transient Google API
 *  rate/quota error worth retrying, false for anything else (bad file id,
 *  permission denied, etc. — those should fail fast, not retry). */
function legacyIsRetryableRateLimitError_(err) {
  var msg = String((err && err.message) || err || '');
  return /rate limit|quota exceeded|user rate limit exceeded/i.test(msg);
}

/** Exponential backoff delay in ms for retry attempt N (1-based): 2s, 4s,
 *  8s, 16s. Kept short relative to Apps Script's 6-minute execution ceiling
 *  — this is a handful of quick retries, not a long wait loop. */
function legacyRetryBackoffMs_(attempt) {
  return Math.pow(2, attempt) * 1000;
}

/**
 * Best-effort delete of the temp converted Sheet. Failures are logged, not
 * thrown — cleanup must never mask the real result (success or error) of the
 * dry run itself, and a leftover scratch file is a minor, visible cleanup
 * task, not a correctness problem.
 */
function legacyCleanupTempFile_(tempFileId) {
  if (!tempFileId) return;
  try {
    DriveApp.getFileById(tempFileId).setTrashed(true);
  } catch (err) {
    console.error('legacyCleanupTempFile_: failed to delete temp file ' + tempFileId + ': ' + err);
  }
}

/**
 * Runs the conversion + parse and returns/logs a report ONLY. Writes nothing
 * to any live app sheet — see the file doc comment above.
 * @return {string} the human-readable report.
 */
function dryRunImportLegacyOrders() {
  guardSetup_();

  var fileId = String(
    PropertiesService.getScriptProperties().getProperty('LEGACY_IMPORT_FILE_ID') || ''
  ).trim();
  if (!fileId) {
    throw new Error('dryRunImportLegacyOrders: LEGACY_IMPORT_FILE_ID is not set in Script ' +
      'Properties — set it to the Drive file id of FILE THEO DOI DON HANG.xlsx.');
  }

  var tempSheetId = null;
  var parsed;
  try {
    tempSheetId = convertLegacyXlsxToSheet_(fileId);
    var ss = SpreadsheetApp.openById(tempSheetId);
    var sheet = ss.getSheetByName(LEGACY_SHEET_NAME_);
    if (!sheet) {
      throw new Error('dryRunImportLegacyOrders: sheet "' + LEGACY_SHEET_NAME_ +
        '" not found in the converted spreadsheet.');
    }
    parsed = parseLegacySheet_(sheet);
  } finally {
    legacyCleanupTempFile_(tempSheetId);
  }

  var summary = legacyBuildDryRunReport_(parsed);
  console.log(summary);
  return summary;
}

/** Builds the human-readable dry-run report from parseLegacySheet_'s output. */
function legacyBuildDryRunReport_(parsed) {
  var lines = ['Legacy import dry run (' + LEGACY_SHEET_NAME_ + ') — no writes performed.'];

  var totalOrders = 0, totalLines = 0;
  parsed.months.forEach(function (m) {
    var lineCount = m.orders.reduce(function (sum, o) { return sum + o.lines.length; }, 0);
    totalOrders += m.orders.length;
    totalLines += lineCount;
    lines.push('THÁNG ' + m.month + ': ' + m.orders.length + ' order(s), ' + lineCount +
      ' line(s), DOANH SỐ THÁNG ' + m.month + ' = ' +
      (m.printedTotal === null ? 'not found' : m.printedTotal));
  });

  if (parsed.unrecognizedRows.length) {
    lines.push('Unrecognized rows: ' + parsed.unrecognizedRows.length);
    parsed.unrecognizedRows.forEach(function (u) {
      lines.push('  - row ' + u.rowNumber + ': ' + u.reason);
    });
  } else {
    lines.push('Unrecognized rows: none');
  }

  lines.push('Totals: ' + totalOrders + ' order(s), ' + totalLines + ' line(s) across ' +
    parsed.months.length + ' month(s).');

  return lines.join('\n');
}
