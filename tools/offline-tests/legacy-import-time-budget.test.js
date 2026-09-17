/**
 * Offline tests for the 2026-09-16 time-budget fix (legacyRunImportBatch_,
 * LegacyImportWrite.gs) — real incident: a live run against production hit
 * "Exceeded maximum execution time" well before the fixed 150-order/run cap,
 * because real per-order Sheets API cost (id allocation, N line writes, the
 * Orders header, invoice linkage, status history, rememberCustomer_/
 * rememberUoms_) is much higher than the offline harness's instant in-memory
 * writes. Fix: legacyRunImportBatch_ now also checks a wall-clock time
 * budget (LEGACY_IMPORT_TIME_BUDGET_MS_, 270s — same convention as
 * ExportJob.gs's EXPORTJOB_TIME_BUDGET_MS) before starting each order, and
 * stops cleanly (saving the resume position, returning a real report)
 * instead of letting Apps Script hard-kill the execution.
 *
 * Since the harness's writes are instant, this test forces the budget to
 * trip deterministically by overriding LEGACY_IMPORT_TIME_BUDGET_MS_ to a
 * tiny value on the sandbox env before calling legacyRunImportBatch_ —
 * legacyRunImportBatch_ reads it fresh each call (a global, not a closed-
 * over value), so this override takes effect immediately.
 *
 * Run with: node tools/offline-tests/legacy-import-time-budget.test.js
 */
const H = require('./harness.js');
const { check, eq } = H;

const STATUS_LIST = [{ key: 'draft', label: 'Nháp' }];
const UOM_LIST = ['Cái'];

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
  return env.loadUser_(env.PropertiesService.getScriptProperties().getProperty(env.PROP.ADMIN_EMAIL));
}

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

console.log('\n1. A near-zero time budget stops the run after the FIRST order, not mid-order');
(function () {
  const env = H.makeEnv({ statusList: STATUS_LIST, uomList: UOM_LIST, vatRates: [0.08] });
  const admin = seedAdmin(env, 'admin@thientan.test');
  env.LEGACY_IMPORT_TIME_BUDGET_MS_ = -1; // already "expired" before the loop starts

  const ROWS = [row(['THÁNG 1'])].concat(buildValidOrderRows(5, 1));
  const parsed = env.parseLegacySheet_(H.makeFakeSheetFromRows(ROWS));

  const summary = env.legacyRunImportBatch_(parsed, admin, 150); // cap is NOT the limiting factor here

  eq('zero orders written — the budget check runs BEFORE the first order, never mid-order',
    env.store.Orders.length, 0);
  eq('resume point stays at 0 — nothing was resolved yet', env.getLegacyImportResumePoint_(), 0);
  check('summary explicitly names the time-budget stop, not the count cap',
    summary.indexOf('time-budget safety margin') >= 0, summary);
  check('summary still reports all 5 orders remaining',
    summary.indexOf('remaining') >= 0 && summary.indexOf(': 5') >= 0, summary);
})();

console.log('\n2. A generous time budget completes the whole batch in one run (no regression)');
(function () {
  const env = H.makeEnv({ statusList: STATUS_LIST, uomList: UOM_LIST, vatRates: [0.08] });
  const admin = seedAdmin(env, 'admin@thientan.test');
  // Leave LEGACY_IMPORT_TIME_BUDGET_MS_ at its real default (270s) — the
  // harness's writes are instant, so this never trips for a small fixture.

  const ROWS = [row(['THÁNG 1'])].concat(buildValidOrderRows(5, 1));
  const parsed = env.parseLegacySheet_(H.makeFakeSheetFromRows(ROWS));

  const summary = env.legacyRunImportBatch_(parsed, admin, 150);

  eq('all 5 orders written', env.store.Orders.length, 5);
  check('summary reports no orders remaining, no time-budget wording',
    summary.indexOf('No orders remaining') >= 0 && summary.indexOf('time-budget') < 0, summary);
})();

console.log('\n3. A run stopped by the time budget resumes cleanly on the next call, no duplicates');
(function () {
  const env = H.makeEnv({ statusList: STATUS_LIST, uomList: UOM_LIST, vatRates: [0.08] });
  const admin = seedAdmin(env, 'admin@thientan.test');

  const ROWS = [row(['THÁNG 1'])].concat(buildValidOrderRows(5, 1));

  env.LEGACY_IMPORT_TIME_BUDGET_MS_ = -1;
  const summary1 = env.legacyRunImportBatch_(
    env.parseLegacySheet_(H.makeFakeSheetFromRows(ROWS)), admin, 150);
  eq('run 1 (expired budget) writes nothing', env.store.Orders.length, 0);

  env.LEGACY_IMPORT_TIME_BUDGET_MS_ = 270 * 1000; // restore to the real default
  const summary2 = env.legacyRunImportBatch_(
    env.parseLegacySheet_(H.makeFakeSheetFromRows(ROWS)), admin, 150);
  eq('run 2 (real budget) writes all 5 orders — nothing lost, nothing duplicated',
    env.store.Orders.length, 5);
  eq('resume point ends at 5', env.getLegacyImportResumePoint_(), 5);
  check('run 2 summary reports no orders remaining', summary2.indexOf('No orders remaining') >= 0, summary2);
})();

H.done();
