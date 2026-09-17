/**
 * Offline tests for Milestone 7 / Phase 4 — idempotency and resumability
 * (LegacyImportWriteResume.gs's getLegacyImportResumePoint_/
 * setLegacyImportResumePoint_/resetLegacyImportResumePoint/
 * legacyAssertNoOrderLinesForOrderId_, and LegacyImportWrite.gs's
 * legacyRunImportBatch_ resume-index wiring).
 *
 * Same offline scope/limitation as legacy-import-write.test.js:
 * migrateImportLegacyOrders() itself (guardSetup_ + Drive.Files.copy +
 * SpreadsheetApp.openById conversion) is NOT covered here — no Advanced
 * Drive Service fake exists in this harness. This exercises
 * legacyRunImportBatch_ directly, the exact same Drive-free function
 * migrateImportLegacyOrders() calls once past the Drive conversion step,
 * across MULTIPLE calls (simulating separate Apps Script executions) that
 * share one env's PropertiesService store — the same way two real runs
 * would share one deployment's Script Properties.
 *
 * Run with: node tools/offline-tests/legacy-import-resumability.test.js
 */
const H = require('./harness.js');
const { check, eq } = H;

const STATUS_LIST = [{ key: 'draft', label: 'Nháp' }];
const UOM_LIST = ['Cái'];

/** Pads/truncates a row literal to the fixed 12-column A..L width, same
 *  helper legacy-import-write.test.js / legacy-import-parse.test.js use. */
function row(cells) {
  const out = cells.slice(0, 12);
  while (out.length < 12) out.push('');
  return out;
}

/** Same real-identity-resolution pattern as legacy-import-write.test.js. */
function seedAdmin(env, email) {
  env.store.Users.push({
    email: email, displayName: 'Quản trị viên', role: 'admin', active: true,
    permissions: '{}', createdAt: new Date(), createdBy: 'system', note: ''
  });
  env.PropertiesService.getScriptProperties().setProperty(env.PROP.ADMIN_EMAIL, email);
  return env.loadUser_(env.PropertiesService.getScriptProperties().getProperty(env.PROP.ADMIN_EMAIL));
}

/** Builds `count` single-line synthetic orders, each with its own STT/PO/
 *  customer/date, so every written order is trivially distinguishable. */
function buildValidOrderRows(count, sttStart) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const stt = sttStart + i;
    const day = String(1 + i).padStart(2, '0');
    out.push(row([String(stt), '5' + String(stt).padStart(4, '0'), 'Cust ' + stt,
      'Item ' + stt, '10000', '1', 'Cái', '10000', '10800', '', day + '/03/2026', '']));
  }
  return out;
}

/* =========================================================================
   1. Capped run + resume run: 5 orders, first run capped at 2, second run
      (uncapped) completes the remaining 3 — no duplicates, none missing.
   ========================================================================= */
console.log('\n1. Capped run (2 of 5) then a resume run completes the rest, no duplicates/missing');
(function () {
  const env = H.makeEnv({ statusList: STATUS_LIST, uomList: UOM_LIST, vatRates: [0.08] });
  const admin = seedAdmin(env, 'admin@thientan.test');

  const ROWS = [row(['THÁNG 1'])].concat(buildValidOrderRows(5, 1));
  const sheet = H.makeFakeSheetFromRows(ROWS);
  const parsed = env.parseLegacySheet_(sheet);

  eq('resume point starts at 0 on a fresh deployment', env.getLegacyImportResumePoint_(), 0);

  const summary1 = env.legacyRunImportBatch_(parsed, admin, 2);
  eq('run 1 writes exactly 2 orders', env.store.Orders.length, 2);
  eq('resume point after run 1 is 2', env.getLegacyImportResumePoint_(), 2);
  check('run 1 summary reports 3 orders remaining',
    summary1.indexOf('remaining') >= 0 && summary1.indexOf(': 3') >= 0, summary1);
  check('run 1 summary reports resume window 0 -> 2 of 5',
    summary1.indexOf('started at order #0, now at #2 of 5') >= 0, summary1);

  // Re-parse fresh (mirrors a real second execution: migrateImportLegacyOrders
  // re-converts + re-parses the source file on every run) and call
  // legacyRunImportBatch_ again on the SAME env, so it shares the same
  // Script Properties + Orders/OrderLines store a real second execution
  // would share via the live spreadsheet.
  const parsed2 = env.parseLegacySheet_(H.makeFakeSheetFromRows(ROWS));
  const summary2 = env.legacyRunImportBatch_(parsed2, admin, 150);

  eq('run 2 writes the remaining 3 orders', env.store.Orders.length, 5);
  eq('resume point after run 2 is 5 (end of the parsed list)', env.getLegacyImportResumePoint_(), 5);
  check('run 2 summary reports no orders remaining', summary2.indexOf('No orders remaining') >= 0, summary2);
  check('run 2 summary reports resume window 2 -> 5 of 5',
    summary2.indexOf('started at order #2, now at #5 of 5') >= 0, summary2);

  const orderIds = env.store.Orders.map(o => o.orderId);
  eq('exactly 5 distinct orderIds (zero duplicates)', new Set(orderIds).size, 5);
  const customers = env.store.Orders.map(o => o.customer).sort();
  eq('all 5 synthetic customers present (zero missing)', customers,
    ['Cust 1', 'Cust 2', 'Cust 3', 'Cust 4', 'Cust 5']);
})();

/* =========================================================================
   2. resetLegacyImportResumePoint() — deliberate rewind to 0
   ========================================================================= */
console.log('\n2. resetLegacyImportResumePoint() rewinds to 0 so a third run reprocesses everything');
(function () {
  const env = H.makeEnv({ statusList: STATUS_LIST, uomList: UOM_LIST, vatRates: [0.08] });
  const admin = seedAdmin(env, 'admin@thientan.test');
  // This harness never loads Setup.gs (no Advanced Drive Service / Router
  // fake either — same documented limitation legacy-import-write.test.js
  // notes for migrateImportLegacyOrders() itself), so guardSetup_ is
  // undefined here. Stub it as a no-op just for this call: the real
  // guardSetup_'s only job is asserting an editor-only function name never
  // leaked into the HTTP action registry, which this offline test has no
  // registry to check against anyway.
  env.guardSetup_ = function () {};

  const ROWS = [row(['THÁNG 1'])].concat(buildValidOrderRows(3, 1));
  const sheet1 = H.makeFakeSheetFromRows(ROWS);
  env.legacyRunImportBatch_(env.parseLegacySheet_(sheet1), admin, 150);

  eq('resume point is 3 after a full single run', env.getLegacyImportResumePoint_(), 3);
  eq('3 orders in the store after run 1', env.store.Orders.length, 3);

  const resetSummary = env.resetLegacyImportResumePoint();
  eq('resume point is 0 immediately after reset', env.getLegacyImportResumePoint_(), 0);
  check('reset summary explains this is a deliberate, non-undo action',
    resetSummary.indexOf('does not undo') === -1 && resetSummary.toLowerCase().indexOf('deliberately') >= 0,
    resetSummary);

  // A run after reset starts back at index 0 and reprocesses every parsed
  // order — this is the documented, EXPECTED consequence of a deliberate
  // reset while old rows are still present (see LegacyImportWriteResume.gs's
  // resetLegacyImportResumePoint doc comment: "does not undo any written
  // order"), not a bug this test is trying to prevent.
  const sheet2 = H.makeFakeSheetFromRows(ROWS);
  env.legacyRunImportBatch_(env.parseLegacySheet_(sheet2), admin, 150);
  eq('resume point is 3 again after the post-reset run', env.getLegacyImportResumePoint_(), 3);
  eq('store now holds 6 orders total (3 original + 3 reprocessed — reset is not a data undo)',
    env.store.Orders.length, 6);
})();

/* =========================================================================
   3. A date-less SKIPPED order still advances the resume index (never
      retried forever), distinguishable from a written order in the report.
   ========================================================================= */
console.log('\n3. A skipped (date-less) order advances the resume index exactly like a written one');
(function () {
  const env = H.makeEnv({ statusList: STATUS_LIST, uomList: UOM_LIST, vatRates: [0.08] });
  const admin = seedAdmin(env, 'admin@thientan.test');

  // Order 2 (STT 2) has no HÓA ĐƠN / Ngày HĐ anywhere in its group — must be
  // skipped, per Phase 3's design (LegacyImportWriteOrder.gs's
  // legacyResolveOrderDate_), never retried on a later run.
  const ROWS = [
    row(['THÁNG 1']),
    row(['1', '60001', 'Cust A', 'Item A', '10000', '1', 'Cái', '10000', '10800', '', '01/03/2026', '']),
    row(['2', '60002', 'Cust B (no date)', 'Item B', '20000', '1', 'Cái', '20000', '21600', '', '', '']),
    row(['3', '60003', 'Cust C', 'Item C', '30000', '1', 'Cái', '30000', '32400', '', '03/03/2026', ''])
  ];

  const summary1 = env.legacyRunImportBatch_(env.parseLegacySheet_(H.makeFakeSheetFromRows(ROWS)), admin, 150);
  eq('2 orders written, 1 skipped', [env.store.Orders.length], [2]);
  check('summary reports 1 skipped order', summary1.indexOf('Orders skipped: 1') >= 0, summary1);
  eq('resume point advanced past ALL 3 entries (written + skipped)',
    env.getLegacyImportResumePoint_(), 3);

  // Re-running must NOT re-attempt the skipped order — the resume index
  // already excludes it, same as a written one.
  const summary2 = env.legacyRunImportBatch_(env.parseLegacySheet_(H.makeFakeSheetFromRows(ROWS)), admin, 150);
  eq('a second run writes/skips nothing further (resume index already at the end)',
    env.store.Orders.length, 2);
  check('second run summary reports no orders remaining', summary2.indexOf('No orders remaining') >= 0, summary2);
})();

/* =========================================================================
   4. Resume-point get/set primitives: defaulting, persistence, bad input.
   ========================================================================= */
console.log('\n4. getLegacyImportResumePoint_/setLegacyImportResumePoint_ primitives');
(function () {
  const env = H.makeEnv({});
  eq('defaults to 0 when the Script Property was never set', env.getLegacyImportResumePoint_(), 0);

  env.setLegacyImportResumePoint_(42);
  eq('read-back after set reflects the written value', env.getLegacyImportResumePoint_(), 42);
  eq('value is persisted as the exact Script Property key documented in Config.gs',
    env.PropertiesService.getScriptProperties().getProperty(env.PROP.LEGACY_IMPORT_RESUME_INDEX), '42');

  env.PropertiesService.getScriptProperties().setProperty(env.PROP.LEGACY_IMPORT_RESUME_INDEX, 'not-a-number');
  eq('a corrupted/non-numeric property value falls back to 0, not NaN', env.getLegacyImportResumePoint_(), 0);

  env.PropertiesService.getScriptProperties().setProperty(env.PROP.LEGACY_IMPORT_RESUME_INDEX, '-5');
  eq('a negative stored value falls back to 0, never a negative resume point',
    env.getLegacyImportResumePoint_(), 0);
})();

/* =========================================================================
   5. Tripwire: legacyAssertNoOrderLinesForOrderId_ fails loud if OrderLines
      already holds a row for the orderId about to be written to.
   ========================================================================= */
console.log('\n5. legacyAssertNoOrderLinesForOrderId_ tripwire (should never fire in real use)');
(function () {
  const env = H.makeEnv({});

  check('no OrderLines rows exist yet -> assertion passes silently', (() => {
    try { env.legacyAssertNoOrderLinesForOrderId_('DH-2026-9999'); return true; }
    catch (err) { return false; }
  })());

  env.store.OrderLines.push({ lineId: 'L1', orderId: 'DH-2026-9999', lineNo: 1 });
  let threw = false, message = '';
  try { env.legacyAssertNoOrderLinesForOrderId_('DH-2026-9999'); }
  catch (err) { threw = true; message = err.message; }
  check('an existing OrderLines row for that orderId makes it throw', threw);
  check('error message identifies the offending orderId', message.indexOf('DH-2026-9999') >= 0, message);

  check('a DIFFERENT orderId with no existing rows still passes', (() => {
    try { env.legacyAssertNoOrderLinesForOrderId_('DH-2026-8888'); return true; }
    catch (err) { return false; }
  })());
})();

H.done();
