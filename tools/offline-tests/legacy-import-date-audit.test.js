/**
 * Offline tests for the 2026-09-16 date-format audit diagnostic
 * (legacyBuildDateAuditReport_, LegacyImportDateAudit.gs) — classifies every
 * line's raw "Ngày HĐ" text into bare "d/m" (expected), "d/m/yyyy" (a real
 * exception to "always dd/mm"), blank, and "other" (unrecognized shape).
 * legacyAuditNgayHdFormats() itself (Drive conversion) is not exercised
 * offline, same limitation as dryRunImportLegacyOrders() — this test only
 * covers the pure classifier over a synthetic parseLegacySheet_() result.
 *
 * Run with: node tools/offline-tests/legacy-import-date-audit.test.js
 */
const H = require('./harness.js');
const { check, eq } = H;

function row(cells) {
  const out = cells.slice(0, 12);
  while (out.length < 12) out.push('');
  return out;
}

const SHEET_ROWS = [
  row(['THÁNG 1']),

  // bare d/m — the expected shape.
  row(['1', '26001', 'Cust A', 'Item A', '1000', '1', 'Cái', '1000', '1080', '1', '1/2', 'done']),
  row(['2', '26002', 'Cust B', 'Item B', '1000', '1', 'Cái', '1000', '1080', '2', '22/12', 'done']),

  // d/m/yyyy — an exception (has a year).
  row(['3', '26003', 'Cust C', 'Item C', '1000', '1', 'Cái', '1000', '1080', '3', '05/03/2026', 'done']),

  // blank — no date at all (handled elsewhere by scanning other lines).
  row(['4', '26004', 'Cust D', 'Item D', '1000', '1', 'Cái', '1000', '1080', '4', '', 'done']),

  // other — unrecognized shape (stray text, out-of-range day/month).
  row(['5', '26005', 'Cust E', 'Item E', '1000', '1', 'Cái', '1000', '1080', '5', 'n/a', 'done']),
  row(['6', '26006', 'Cust F', 'Item F', '1000', '1', 'Cái', '1000', '1080', '6', '32/1', 'done']),
  row(['7', '26007', 'Cust G', 'Item G', '1000', '1', 'Cái', '1000', '1080', '7', '5/13', 'done']),

  row(['DOANH SỐ THÁNG 1', '', '', '', '', '', '', '7000'])
];

const env = H.makeEnv();
const sheet = H.makeFakeSheetFromRows(SHEET_ROWS);
const parsed = env.parseLegacySheet_(sheet);
const report = env.legacyBuildDateAuditReport_(parsed);

console.log('\n1. Bucket counts');
check('report counts 2 bare d/m', report.indexOf('bare "d/m" (expected): 2') >= 0, report);
check('report counts 1 d/m/yyyy exception', report.indexOf('"d/m/yyyy" (has a year — exception): 1') >= 0, report);
check('report counts 1 blank', report.indexOf('blank: 1') >= 0, report);
check('report counts 3 other (n/a, 32/1 day out of range, 5/13 month out of range)',
  report.indexOf('other / unrecognized shape (exception): 3') >= 0, report);

console.log('\n2. Exception rows listed individually with row number + raw text, not just counted');
check('d/m/yyyy sample lists row 4 (05/03/2026)',
  report.indexOf('row 4: "05/03/2026"') >= 0, report);
check('other samples list "n/a", "32/1", "5/13"',
  report.indexOf('"n/a"') >= 0 && report.indexOf('"32/1"') >= 0 && report.indexOf('"5/13"') >= 0, report);

console.log('\n3. Never crashes on any input shape');
check('report is a non-empty string', typeof report === 'string' && report.length > 0, report);

H.done();
