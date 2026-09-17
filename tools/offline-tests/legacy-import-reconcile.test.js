/**
 * Offline tests for Milestone 7 / Phase 5 — post-hoc reconciliation
 * (LegacyImportReconcile.gs's legacyReconcileMonths_ / legacyImportYear_ /
 * legacyReconcileTolerance_ / legacyBuildReconcileReport_).
 *
 * reconcileLegacyImport() itself (guardSetup_ + Drive.Files.copy +
 * SpreadsheetApp.openById conversion) is NOT covered here — same documented
 * harness limitation as legacy-import-write.test.js's note on
 * migrateImportLegacyOrders(). This instead runs the real Drive-free
 * parse -> map -> write pipeline (parseLegacySheet_ -> legacyRunImportBatch_,
 * exactly like legacy-import-write.test.js) to produce real Orders/
 * OrderLines rows for two synthetic months, then feeds the resulting parsed
 * month totals + written rows straight into legacyReconcileMonths_ — the
 * same Drive-free core reconcileLegacyImport() itself calls once past its
 * own Drive conversion step.
 *
 * Run with: node tools/offline-tests/legacy-import-reconcile.test.js
 */
const H = require('./harness.js');
const { check, eq } = H;

const UOM_LIST = ['Cái', 'Cuộn'];

/** Pads/truncates a row literal to the fixed 12-column A..L width, same
 *  helper legacy-import-parse.test.js / legacy-import-write.test.js use. */
function row(cells) {
  const out = cells.slice(0, 12);
  while (out.length < 12) out.push('');
  return out;
}

function seedAdmin(env, email) {
  env.store.Users.push({
    email: email, displayName: 'Quản trị viên', role: 'admin', active: true,
    permissions: '{}', createdAt: new Date(), createdBy: 'system', note: ''
  });
  env.PropertiesService.getScriptProperties().setProperty(env.PROP.ADMIN_EMAIL, email);
  return env.loadUser_(email);
}

/* =========================================================================
   1. Two written months: one reconciles OK, one deliberately mismatches
   ========================================================================= */
console.log('\n1. reconcileLegacyImport_ core: one month matches its printed total, one does not');
(function () {
  const env = H.makeEnv({ uomList: UOM_LIST, vatRates: [0.08, 0.1] });
  const admin = seedAdmin(env, 'admin@thientan.test');

  // THÁNG 1 — one order, unitPrice 100000 x qty 2 = amountExVat 200000.
  // DOANH SỐ THÁNG 1 printed as exactly 200000 — must reconcile 'ok'.
  //
  // THÁNG 2 — one order, unitPrice 100000 x qty 3 = amountExVat 300000.
  // DOANH SỐ THÁNG 2 printed as 250000 — 50000 VND off, far beyond the
  // tolerance (max(500, 0.05% of 250000) = 500) — must reconcile 'mismatch'.
  const SHEET_ROWS = [
    row(['THÁNG 1']),
    row(['1', '10001', 'Cust A', 'Item A',
         '100000', '2', 'Cái', '200000', '216000', '', '15/01/2026', '']),
    row(['DOANH SỐ THÁNG 1', '', '', '', '', '', '', '200000']), // total in col H, same convention as legacy-import-parse.test.js

    row(['THÁNG 2']),
    row(['1', '20001', 'Cust B', 'Item B',
         '100000', '3', 'Cái', '300000', '324000', '', '10/02/2026', '']),
    row(['DOANH SỐ THÁNG 2', '', '', '', '', '', '', '250000'])
  ];

  const sheet = H.makeFakeSheetFromRows(SHEET_ROWS);
  const parsed = env.parseLegacySheet_(sheet);

  console.log('\n1a. Sanity: Phase 1 parse captured both printed totals');
  eq('THÁNG 1 printedTotal parsed as 200000', parsed.months[0].printedTotal, 200000);
  eq('THÁNG 2 printedTotal parsed as 250000', parsed.months[1].printedTotal, 250000);

  const writeSummary = env.legacyRunImportBatch_(parsed, admin, 150);
  eq('both orders written (no skips)', env.store.Orders.length, 2);
  check('write summary reports no skipped orders (line only appears when skipped > 0)',
    writeSummary.indexOf('Orders skipped') < 0, writeSummary);

  const orders = env.readAll_(env.SHEETS.ORDERS);
  const orderLines = env.readAll_(env.SHEETS.ORDER_LINES);
  const results = env.legacyReconcileMonths_(parsed.months, orders, orderLines);

  console.log('\n1b. legacyReconcileMonths_ per-month results');
  eq('THÁNG 1 actualTotal = 200000 (matches its written order line)',
    results[0].actualTotal, 200000);
  eq('THÁNG 1 status is "ok" (diff 0, within tolerance)', results[0].status, 'ok');
  eq('THÁNG 1 diff is exactly 0', results[0].diff, 0);

  eq('THÁNG 2 actualTotal = 300000 (matches its written order line)',
    results[1].actualTotal, 300000);
  eq('THÁNG 2 status is "mismatch" (diff 50000, far beyond tolerance)',
    results[1].status, 'mismatch');
  eq('THÁNG 2 diff is exactly 50000 (actual - printed)', results[1].diff, 50000);

  console.log('\n1c. legacyBuildReconcileReport_ human-readable summary');
  const report = env.legacyBuildReconcileReport_(results);
  check('report marks THÁNG 1 OK', /THÁNG 1: OK/.test(report), report);
  check('report marks THÁNG 2 MISMATCH', /THÁNG 2: MISMATCH/.test(report), report);
  check('report\'s closing line counts exactly 1 mismatched month out of 2',
    report.indexOf('1 month(s) MISMATCHED') >= 0 && report.indexOf('out of 2 total') >= 0, report);
})();

/* =========================================================================
   2. A month with no printed total at all is flagged, not silently OK
   ========================================================================= */
console.log('\n2. A month whose DOANH SỐ THÁNG n row was never found reconciles as "no-printed-total"');
(function () {
  const env = H.makeEnv({ uomList: UOM_LIST, vatRates: [0.08, 0.1] });
  const admin = seedAdmin(env, 'admin@thientan.test');

  // THÁNG 3 has an order but its DOANH SỐ THÁNG 3 row is simply missing from
  // the sheet — parseLegacySheet_ leaves printedTotal as null (see
  // LegacyImportParse.gs), which must NOT be silently treated as a match.
  const SHEET_ROWS = [
    row(['THÁNG 3']),
    row(['1', '30001', 'Cust C', 'Item C',
         '50000', '1', 'Cái', '50000', '54000', '', '05/03/2026', ''])
  ];

  const sheet = H.makeFakeSheetFromRows(SHEET_ROWS);
  const parsed = env.parseLegacySheet_(sheet);
  eq('THÁNG 3 printedTotal is null (no DOANH SỐ row present)', parsed.months[0].printedTotal, null);

  env.legacyRunImportBatch_(parsed, admin, 150);
  const orders = env.readAll_(env.SHEETS.ORDERS);
  const orderLines = env.readAll_(env.SHEETS.ORDER_LINES);
  const results = env.legacyReconcileMonths_(parsed.months, orders, orderLines);

  eq('status is "no-printed-total"', results[0].status, 'no-printed-total');
  eq('diff is null (nothing to diff against)', results[0].diff, null);
  eq('actualTotal is still computed (50000)', results[0].actualTotal, 50000);

  const report = env.legacyBuildReconcileReport_(results);
  check('report flags the missing printed total explicitly', report.indexOf('NO PRINTED TOTAL') >= 0, report);
})();

H.done();
