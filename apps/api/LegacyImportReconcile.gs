/**
 * LegacyImportReconcile.gs — Milestone 7 / Phase 5: post-hoc financial
 * reconciliation for the legacy Excel import. Split out of LegacyImport.gs
 * per the repo's 200-line modularization rule, same as every other
 * LegacyImport*.gs file.
 *
 * This is a READ-ONLY check that runs AFTER an import batch has already
 * written orders (test-copy or production, see the runbook) — it never calls
 * appendRecord_/updateRecord_ against any sheet. For each of the source
 * workbook's month blocks, it sums the imported `OrderLines.amountExVat` for
 * every order whose `orderDate` falls in that calendar month/year, and
 * compares the sum to that month's own printed `DOANH SỐ THÁNG n` total
 * (parsed by Phase 1's parseLegacySheet_, see LegacyImportParse.gs) — the
 * same "reconcile against the reference Excel" check M4's exit criteria
 * required for a sample month, done here for all 8 months since the whole
 * file is imported (see phase-05's Key Insights).
 *
 * Naming/Run-dropdown convention: the entry point below is
 * `reconcileLegacyImport()` — NO trailing underscore, `guardSetup_()`-guarded,
 * never added to getActions_()'s registry (Router.gs) — same "run-by-hand
 * from the editor" shape as `dryRunImportLegacyOrders` (Phase 1) and
 * `migrateImportLegacyOrders` (Phase 3), because the runbook calls this as
 * its own distinct, operator-run step (test copy, then production), not
 * something baked silently into another function's report. The actual
 * month-bucketing/comparison logic lives in `legacyReconcileMonths_`
 * (trailing underscore, `legacy`-prefixed — same internal-helper pattern as
 * `legacyRunImportBatch_`/`legacyWriteOneOrder_`), taking plain already-
 * parsed `months` + already-read `orders`/`orderLines` — no Drive/Sheets API
 * — directly testable offline, same split `migrateImportLegacyOrders()` uses
 * around `legacyRunImportBatch_`. A function literally named
 * `reconcileLegacyImport_` (trailing underscore) is deliberately not ALSO
 * defined here: the Run dropdown lists every top-level no-arg function
 * regardless of underscore (a naming CONVENTION here, not an enforced rule —
 * see Migrations.gs's own trailing-underscore helpers), so two near-identical
 * names differing only by underscore would confuse the operator running this
 * by hand mid-migration.
 *
 * SCOPING CAVEAT: bucketing is by `orderDate` alone (the same field the
 * phase spec calls out), not by `createdBy` — so if the target spreadsheet
 * already holds OTHER orders (manually entered, not from this import) whose
 * orderDate happens to fall in one of the 8 imported months, their amounts
 * are included in "actual" too and will inflate any apparent mismatch. Not a
 * concern for a fresh test copy; worth knowing before reading a production
 * post-run reconcile (see runbook.md).
 */

/** Whole-VND tolerance floor. Every `amountExVat` is Math.round()'d to a
 *  whole VND at write time (Orders.gs's buildLineRecord_) and every printed
 *  "ĐƠN GIÁ ... VND" figure in the source file is itself a whole-VND integer
 *  (docs/EXCEL_REFERENCE.md §2) — there is no VND subunit to round away, so
 *  this only needs to absorb small cumulative drift between the business's
 *  own Excel-formula month sum and this system's independently-computed sum
 *  across potentially dozens of lines, not a real currency-rounding gap. */
var LEGACY_RECONCILE_TOLERANCE_FLOOR_VND_ = 500;

/** Proportional allowance on top of the flat floor, for a month whose
 *  printed total is large enough that 500 VND is unreasonably tight relative
 *  to its size (a few hundred lines' worth of independent per-line rounding
 *  can drift more than a fixed floor on a very large month). */
var LEGACY_RECONCILE_TOLERANCE_PCT_ = 0.0005; // 0.05%

/** @return {number} the tolerance (in VND) allowed against `printedTotal`. */
function legacyReconcileTolerance_(printedTotal) {
  return Math.max(
    LEGACY_RECONCILE_TOLERANCE_FLOOR_VND_,
    Math.round(Math.abs(printedTotal) * LEGACY_RECONCILE_TOLERANCE_PCT_)
  );
}

/**
 * Derives the workbook's calendar year from LEGACY_SHEET_NAME_ (e.g.
 * "THONGKE_2026" -> 2026) instead of a second hardcoded constant, so the two
 * never drift apart if a future year's file is ever imported the same way
 * (docs/EXCEL_REFERENCE.md §1: "one workbook per year — the year is in the
 * sheet name").
 */
function legacyImportYear_() {
  var m = /(\d{4})/.exec(LEGACY_SHEET_NAME_);
  if (!m) {
    throw new Error('legacyImportYear_: could not derive a 4-digit year from LEGACY_SHEET_NAME_ ("' +
      LEGACY_SHEET_NAME_ + '").');
  }
  return parseInt(m[1], 10);
}

/**
 * Drive-free reconciliation core. Given Phase 1's parsed month blocks and the
 * live/test-copy Orders + OrderLines rows (readAll_ output), returns one
 * result per month.
 * @param {Array} months parseLegacySheet_'s `months` array: [{ month, printedTotal }, ...].
 * @param {Array} orders readAll_(SHEETS.ORDERS) rows.
 * @param {Array} orderLines readAll_(SHEETS.ORDER_LINES) rows.
 * @return {Array} [{ month, printedTotal, actualTotal, diff, status }], where
 *   status is 'ok' | 'mismatch' | 'no-printed-total'. `diff` is null when
 *   status is 'no-printed-total' (nothing to diff against).
 */
function legacyReconcileMonths_(months, orders, orderLines) {
  var year = legacyImportYear_();

  var lineTotalByOrderId = {};
  orderLines.forEach(function (line) {
    var amt = Number(line.amountExVat) || 0;
    lineTotalByOrderId[line.orderId] = (lineTotalByOrderId[line.orderId] || 0) + amt;
  });

  var actualByMonth = {};
  orders.forEach(function (order) {
    var date = order.orderDate;
    if (!(date instanceof Date) || isNaN(date.getTime())) return;
    if (date.getFullYear() !== year) return;
    var monthNo = date.getMonth() + 1;
    var orderTotal = lineTotalByOrderId[order.orderId] || 0;
    actualByMonth[monthNo] = (actualByMonth[monthNo] || 0) + orderTotal;
  });

  return months.map(function (m) {
    var actualTotal = actualByMonth[m.month] || 0;

    if (m.printedTotal === null) {
      return { month: m.month, printedTotal: null, actualTotal: actualTotal,
        diff: null, status: 'no-printed-total' };
    }

    var diff = actualTotal - m.printedTotal;
    var tolerance = legacyReconcileTolerance_(m.printedTotal);
    return {
      month: m.month, printedTotal: m.printedTotal, actualTotal: actualTotal,
      diff: diff, status: (Math.abs(diff) <= tolerance) ? 'ok' : 'mismatch'
    };
  });
}

/** Builds the human-readable reconciliation report from legacyReconcileMonths_'s output. */
function legacyBuildReconcileReport_(results) {
  var lines = ['Legacy import reconciliation — imported totals vs printed DOANH SỐ THÁNG n.'];
  var mismatchCount = 0, noPrintedCount = 0;

  results.forEach(function (r) {
    if (r.status === 'no-printed-total') {
      noPrintedCount++;
      lines.push('THÁNG ' + r.month + ': NO PRINTED TOTAL — actual imported = ' + r.actualTotal +
        ' (DOANH SỐ THÁNG ' + r.month + ' was not found/parsed — cannot reconcile this month).');
      return;
    }
    if (r.status === 'mismatch') mismatchCount++;
    lines.push('THÁNG ' + r.month + ': ' + (r.status === 'ok' ? 'OK' : 'MISMATCH') +
      ' — printed = ' + r.printedTotal + ', actual imported = ' + r.actualTotal +
      ', diff = ' + r.diff);
  });

  lines.push('');
  lines.push(mismatchCount === 0 && noPrintedCount === 0
    ? 'All ' + results.length + ' month(s) reconcile within tolerance.'
    : mismatchCount + ' month(s) MISMATCHED, ' + noPrintedCount +
      ' month(s) had no printed total to check, out of ' + results.length + ' total.');

  return lines.join('\n');
}

/**
 * Entry point — run by hand from the editor's Run dropdown, per the runbook
 * (once against the test copy, once against production). Re-converts the
 * source .xlsx the same way dryRunImportLegacyOrders/migrateImportLegacyOrders
 * do (to read each month's printed total fresh, not trust a stale copy), then
 * reads back whichever spreadsheet this API project is currently configured
 * against (SPREADSHEET_ID Script Property — point it at the test copy or
 * production before running, see runbook.md) and reconciles.
 * @return {string} the human-readable reconciliation report.
 */
function reconcileLegacyImport() {
  guardSetup_();

  var fileId = String(
    PropertiesService.getScriptProperties().getProperty('LEGACY_IMPORT_FILE_ID') || ''
  ).trim();
  if (!fileId) {
    throw new Error('reconcileLegacyImport: LEGACY_IMPORT_FILE_ID is not set in Script ' +
      'Properties — set it to the Drive file id of FILE THEO DOI DON HANG.xlsx.');
  }

  var tempSheetId = null;
  var parsed;
  try {
    tempSheetId = convertLegacyXlsxToSheet_(fileId);
    var ss = SpreadsheetApp.openById(tempSheetId);
    var sheet = ss.getSheetByName(LEGACY_SHEET_NAME_);
    if (!sheet) {
      throw new Error('reconcileLegacyImport: sheet "' + LEGACY_SHEET_NAME_ +
        '" not found in the converted spreadsheet.');
    }
    parsed = parseLegacySheet_(sheet);
  } finally {
    legacyCleanupTempFile_(tempSheetId);
  }

  var orders = readAll_(SHEETS.ORDERS);
  var orderLines = readAll_(SHEETS.ORDER_LINES);
  var results = legacyReconcileMonths_(parsed.months, orders, orderLines);

  var summary = legacyBuildReconcileReport_(results);
  console.log(summary);
  return summary;
}
