/**
 * Migrations.gs — one-time, run-by-hand schema/data migrations.
 *
 * Same convention as Setup.gs: no trailing underscore so the function appears
 * in the API editor's Run dropdown, added to `guardSetup_`'s block list
 * (Setup.gs) so it can never be reached over HTTP. Unlike setupMilestone1/2,
 * a migration here is not about creating sheets — it is about reconciling an
 * existing sheet's shape or data with what the code now expects.
 *
 * Every migration recomputes from source data rather than trusting anything
 * it wrote on a previous run, so re-running one costs a bit of time, never
 * correctness.
 */

/**
 * Milestone 2.5 / P5 — add the `lineCount` column to Orders and backfill it
 * for every order that predates this migration.
 *
 * WHY THIS IS A SEPARATE STEP: `appendRecord_`/`updateRecord_` (SheetsRepo.gs)
 * address columns by the ACTUAL header row on the live sheet, not by the
 * `HEADERS.Orders` array in Config.gs. Adding `'lineCount'` to that array only
 * affects a brand-new sheet — `ensureSheetWithHeaders_` (Setup.gs) skips a
 * sheet that already has data. An Orders sheet created before this migration
 * has no `lineCount` cell at all, so every create/update trying to write it
 * would be silently dropped (not an error — the row object just carries a key
 * the sheet's headers don't have) until this runs once.
 *
 * HOW TO RUN
 *   1. Push apps/api with this migration included.
 *   2. Select `migrateAddLineCount` in the editor's Run dropdown and press
 *      Run — no arguments. Read the returned summary.
 *   3. Safe to run again later (e.g. after restoring an old sheet backup, or
 *      just to double-check): it recomputes every row's real count from
 *      OrderLines and only rewrites the ones that drifted.
 *
 * Until step 2 runs, actionListOrders_ reads every order's lineCount as 0
 * (num_() treats the missing cell as 0, not an error) — cards will show
 * "0 dòng" rather than crash. Not dangerous, just wrong until you run this.
 */
function migrateAddLineCount() {
  guardSetup_();

  var addedHeader = ensureLineCountColumn_();

  var realCounts = countLinesByOrder_();
  var orders = readAll_(SHEETS.ORDERS);
  var updated = 0;

  orders.forEach(function (row) {
    var real = realCounts[row.orderId] || 0;
    if (Number(row.lineCount) !== real) {
      updateRecord_(SHEETS.ORDERS, row._row, { lineCount: real });
      updated++;
    }
  });

  var summary = (addedHeader ? 'Added the "lineCount" column to Orders. '
                              : 'Orders already has a "lineCount" column. ') +
    'Backfilled ' + updated + ' of ' + orders.length + ' order(s); ' +
    (orders.length - updated) + ' already matched.';
  console.log(summary);
  return summary;
}

/**
 * Adds the `lineCount` header cell to the live Orders sheet if it isn't
 * there yet. Split out of migrateAddLineCount() so seedTestOrders()
 * (DevSeed.gs) can call just this half — a seed run needs the column to
 * exist so ITS OWN new rows keep their lineCount, but has no old rows to
 * backfill and no reason to pay for scanning all of OrderLines.
 *
 * @return {boolean} true if the header cell was just added, false if it was
 *   already there.
 */
function ensureLineCountColumn_() {
  var sheet = getSheet_(SHEETS.ORDERS);
  var headers = readHeaders_(sheet);
  if (headers.indexOf('lineCount') >= 0) return false;

  var nextCol = headers.length + 1;
  sheet.getRange(1, nextCol).setValue('lineCount');
  sheet.getRange(1, nextCol).setFontWeight('bold');
  return true;
}
/**
 * Milestone 3 / 3.8 — add the `approveStatus` column to Orders and the
 * `field` column to StatusHistory, then backfill both for rows that predate
 * this migration. Same shape as migrateAddLineCount() above and for the same
 * reason: appendRecord_/updateRecord_ address columns by the sheet's ACTUAL
 * header row, not by HEADERS.Orders/HEADERS.StatusHistory in Config.gs, so an
 * existing sheet needs its header row extended by hand once.
 *
 * Backfill rule for Orders.approveStatus:
 *   - A row that already has approvedBy set (from the old 3.6 admin-approve
 *     stamp) backfills to 'approved' — it really was approved under the old
 *     one-way flow, and 3.8 replaces that flow outright rather than keeping
 *     it alongside the new one (see TASKS.md, "Replace outright").
 *   - Every other row backfills to 'draft', the new default for all orders.
 *   - This runs regardless of whether approvalFlowEnabled is on — the column
 *     is populated either way so turning the flag on later needs no further
 *     backfill (TASKS.md: "Flag only hides UI/permissions; approveStatus
 *     data stays untouched").
 *
 * Backfill rule for StatusHistory.field:
 *   - Every existing row predates the approve-status workflow, so every one
 *     of them describes the business `status` column. Backfill to 'status'.
 *
 * HOW TO RUN
 *   1. Push apps/api with this migration included.
 *   2. Select `migrateAddApproveStatus` in the editor's Run dropdown and
 *      press Run — no arguments. Read the returned summary.
 *   3. Safe to run again later: it recomputes from source data (approvedBy
 *      presence, field blankness) and only rewrites rows that drifted.
 */
function migrateAddApproveStatus() {
  guardSetup_();

  var addedOrdersCol = ensureApproveStatusColumn_();
  var addedHistoryCol = ensureStatusHistoryFieldColumn_();

  var orders = readAll_(SHEETS.ORDERS);
  var ordersUpdated = 0;
  orders.forEach(function (row) {
    var want = row.approvedBy ? 'approved' : 'draft';
    if (String(row.approveStatus || '') !== want) {
      updateRecord_(SHEETS.ORDERS, row._row, { approveStatus: want });
      ordersUpdated++;
    }
  });

  var history = readAll_(SHEETS.STATUS_HISTORY);
  var historyUpdated = 0;
  history.forEach(function (row) {
    if (!String(row.field || '').trim()) {
      updateRecord_(SHEETS.STATUS_HISTORY, row._row, { field: 'status' });
      historyUpdated++;
    }
  });

  var summary =
    (addedOrdersCol ? 'Added the "approveStatus" column to Orders. '
                    : 'Orders already has an "approveStatus" column. ') +
    'Backfilled ' + ordersUpdated + ' of ' + orders.length + ' order(s). ' +
    (addedHistoryCol ? 'Added the "field" column to StatusHistory. '
                     : 'StatusHistory already has a "field" column. ') +
    'Backfilled ' + historyUpdated + ' of ' + history.length + ' history row(s).';
  console.log(summary);
  return summary;
}

/**
 * Adds the `approveStatus` header cell to the live Orders sheet if it isn't
 * there yet.
 * @return {boolean} true if the header cell was just added.
 */
function ensureApproveStatusColumn_() {
  var sheet = getSheet_(SHEETS.ORDERS);
  var headers = readHeaders_(sheet);
  if (headers.indexOf('approveStatus') >= 0) return false;

  var nextCol = headers.length + 1;
  sheet.getRange(1, nextCol).setValue('approveStatus');
  sheet.getRange(1, nextCol).setFontWeight('bold');
  return true;
}

/**
 * Adds the `field` header cell to the live StatusHistory sheet if it isn't
 * there yet.
 * @return {boolean} true if the header cell was just added.
 */
function ensureStatusHistoryFieldColumn_() {
  var sheet = getSheet_(SHEETS.STATUS_HISTORY);
  var headers = readHeaders_(sheet);
  if (headers.indexOf('field') >= 0) return false;

  var nextCol = headers.length + 1;
  sheet.getRange(1, nextCol).setValue('field');
  sheet.getRange(1, nextCol).setFontWeight('bold');
  return true;
}

/**
 * Revision 2026-09-03d — add the rejectReason/rejectedBy/rejectedAt
 * columns to Orders (see Config.gs's HEADERS.Orders comment). No backfill
 * of historical rejections: an order rejected before this migration has
 * no reason recorded anywhere on the row (only in StatusHistory, which
 * this revision deliberately stops reading from on every detail load —
 * see TASKS.md), so it simply shows no reject-reason banner until it is
 * rejected again under the new code.
 *
 * HOW TO RUN
 *   1. Push apps/api with this migration included.
 *   2. Select `migrateAddRejectReasonColumns` in the editor's Run dropdown
 *      and press Run — no arguments.
 *   3. Safe to run again later: it only adds header cells that are
 *      missing, never touches existing data.
 */
function migrateAddRejectReasonColumns() {
  guardSetup_();

  var sheet = getSheet_(SHEETS.ORDERS);
  var headers = readHeaders_(sheet);
  var toAdd = ['rejectReason', 'rejectedBy', 'rejectedAt'].filter(function (h) {
    return headers.indexOf(h) < 0;
  });

  toAdd.forEach(function (h) {
    var nextCol = readHeaders_(sheet).length + 1;
    sheet.getRange(1, nextCol).setValue(h);
    sheet.getRange(1, nextCol).setFontWeight('bold');
  });

  var summary = toAdd.length
    ? 'Added column(s) to Orders: ' + toAdd.join(', ') + '.'
    : 'Orders already has rejectReason/rejectedBy/rejectedAt columns.';
  console.log(summary);
  return summary;
}

/**
 * Revision 2026-09-03f (corrected) — Phong confirmed only
 * Orders.approvedAt/rejectedAt actually show date-only on the live
 * sheet; createdAt/updatedAt/changedAt display correctly. That lines up
 * with the code review: createdAt/updatedAt/changedAt have carried real
 * datetime values continuously since long before this session, while
 * approvedAt/rejectedAt are the two columns that only just started being
 * WRITTEN today (approvedAt was added at 3.8 but never written until
 * revision 2026-09-03e restored it; rejectedAt is brand new from
 * 2026-09-03d) — both were blank, freshly-appended columns with no prior
 * data, which is exactly the situation where Sheets' automatic format
 * detection can land on date-only instead of full datetime. The write
 * path itself was still confirmed correct (both stamp a real
 * `new Date()` — see actionApproveOrder_/actionRejectOrder_/
 * actionCreateOrder_/actionUpdateOrder_ in Orders.gs); this is purely
 * the live column's cell FORMAT, or possibly a handful of cells that
 * hold plain text with no time ever recorded. `readAll_`'s getValues()
 * reads the real underlying value regardless of display format, so
 * app logic was never affected either way — this is cosmetic on the
 * sheet, not a data-correctness bug.
 *
 * This migration resets Orders.approvedAt/rejectedAt's number format to
 * a full datetime pattern, and rewrites any cell that ISN'T already a
 * real JS Date object (i.e. Sheets parsed it as plain text) into
 * `new Date(y, m, d, 0, 0, 0)` — an explicit midnight — so every cell in
 * these two columns is a genuine, unambiguous datetime value afterward.
 * A cell that's already a real Date object (any time, including a
 * genuine midnight) is left completely untouched.
 *
 * Columns covered: Orders.approvedAt, Orders.rejectedAt ONLY.
 * createdAt/updatedAt/changedAt/Invoices.createdAt are untouched — they
 * were never actually affected, no need to touch what already works.
 * Deliberately excludes Orders.orderDate too — that one is meant to stay
 * date-only by design.
 *
 * HOW TO RUN
 *   1. Push apps/api with this migration included.
 *   2. Select `migrateFixDatetimeColumns` in the editor's Run dropdown
 *      and press Run — no arguments. Read the returned summary.
 *   3. Safe to run again later: format-setting is idempotent, and a cell
 *      already holding a real Date object is left completely untouched
 *      (its actual time, whatever it is, is never overwritten) — only
 *      cells that are NOT a Date object get rewritten, and only once,
 *      since after the first run they become real Date objects too.
 */
function migrateFixDatetimeColumns() {
  guardSetup_();

  var DATETIME_FORMAT = 'M/d/yyyy H:mm:ss';
  var targets = [
    { sheetName: SHEETS.ORDERS, columns: ['approvedAt', 'rejectedAt'] }
  ];

  var summaryLines = [];

  targets.forEach(function (target) {
    var sheet = getSheet_(target.sheetName);
    var headers = readHeaders_(sheet);
    var lastRow = sheet.getLastRow();

    target.columns.forEach(function (colName) {
      var colIndex = headers.indexOf(colName);
      if (colIndex < 0) {
        summaryLines.push(target.sheetName + '.' + colName + ': column not found, skipped.');
        return;
      }
      var col1based = colIndex + 1;

      if (lastRow < 2) {
        // Header only, no data rows yet — still worth fixing the format
        // so every future write displays correctly from row 2 on.
        sheet.getRange(2, col1based, 1, 1).setNumberFormat(DATETIME_FORMAT);
        summaryLines.push(target.sheetName + '.' + colName + ': no data rows, format set for future rows.');
        return;
      }

      var range = sheet.getRange(2, col1based, lastRow - 1, 1);
      range.setNumberFormat(DATETIME_FORMAT);

      var values = range.getValues();
      var normalized = 0;
      var rewritten = values.map(function (row) {
        var v = row[0];
        if (v === '' || v === null) return [v]; // genuinely blank — leave alone
        if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
          return [v]; // already a real datetime value — never touched, time preserved as-is
        }
        // Not a real Date object: Sheets read this back as text (or an
        // unparsed number) — no time was ever recorded for it. Parse
        // what we can and normalize to an explicit midnight.
        var parsed = new Date(v);
        var fixed = isNaN(parsed.getTime())
          ? new Date() // last resort: unparsable garbage, stamp "now" rather than leave it broken
          : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0);
        normalized++;
        return [fixed];
      });
      range.setValues(rewritten);

      summaryLines.push(target.sheetName + '.' + colName + ': format fixed, ' +
        normalized + ' of ' + values.length + ' row(s) normalized to 00:00:00 (rest were already real datetimes, untouched).');
    });
  });

  var summary = summaryLines.join('\n');
  console.log(summary);
  return summary;
}
