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
