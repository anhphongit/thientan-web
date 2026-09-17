/**
 * Offline tests for Milestone 7 / Phase 1 — parseLegacySheet_() (LegacyImport-
 * Parse.gs), the row-walker that groups THONGKE_2026 rows into month blocks
 * and order groups. Ingestion (Drive.Files.copy conversion) and the
 * dryRunImportLegacyOrders() orchestration are NOT covered here — this
 * harness has no Advanced Drive Service fake, and the phase's own
 * constraints say not to run against the real Drive file offline. This test
 * only exercises the pure, Drive-free row-grouping logic via a synthetic
 * fake sheet built with H.makeFakeSheetFromRows().
 *
 * Synthetic dataset covers (per the phase's Implementation Steps):
 *   - 2 months (THÁNG 1, THÁNG 2), 2–3 orders per month
 *   - a multi-line PO cell (order 1's "26001\n38333\n( chTh)")
 *   - a multi-line TRẠNG THÁI cell (order 1 line 2's "GH ...\nđã cọc ...")
 *   - one THÁNG n boundary (THÁNG 1 -> THÁNG 2)
 *   - one DOANH SỐ THÁNG n row per month, with a Vietnamese-formatted total
 *   - two deliberately malformed rows (STT set but no other data; blank STT
 *     with no order group open) — both must land in unrecognizedRows, never
 *     crash the walk or silently vanish
 *
 * Run with: node tools/offline-tests/legacy-import-parse.test.js
 */
const H = require('./harness.js');
const { check, eq } = H;

/** Pads/truncates a row literal to the fixed 12-column A..L width. */
function row(cells) {
  const out = cells.slice(0, 12);
  while (out.length < 12) out.push('');
  return out;
}

const SHEET_ROWS = [
  row(['FILE THEO DOI DON HANG']),                              // 1: title — preamble, before any THÁNG
  row(['STT', 'PO', 'KHÁCH HÀNG', 'CHI TIẾT']),                  // 2: header row — preamble
  row(['', '', '', '', '', '', '', '', '', '', '', '2026']),     // 3: year row — preamble

  row(['THÁNG 1']),                                              // 4: opens month 1

  // Order 1: STT row + one continuation line. Multi-line PO on the STT row,
  // multi-line TRẠNG THÁI on the continuation line.
  row(['1', '26001\n38333\n( chTh)', 'Nhựa Duy Tân', '710004795 :\nống nhựa',
       '100000', '2', 'Cái', '200000', '216000', '98', '01/01/2026', 'done']),
  row(['', '', 'Nhựa Duy Tân', 'Line 2 detail',
       '50000', '1', 'Cái', '50000', '54000', '', '',
       'GH 22/09/2026\nđã cọc 18,765,000 cho Tâm Thịnh Phát']),

  // Order 2: single-line order, no continuation.
  row(['2', '26002', 'Yamato', 'Q4695359: cable',
       '30000', '10', 'cuộn', '300000', '330000', '99', '02/01/2026', 'đã xuất chưa tt']),

  // Deliberately malformed: STT set, everything else blank.
  row(['7']),

  // Order 3: single-line order.
  row(['3', '26005', 'ACCREDO ASIA', 'Item Z',
       '20000', '4', 'Bịch', '80000', '86400', '102', '05/01/2026', 'Done']),

  row(['DOANH SỐ THÁNG 1', '', '', '', '', '', '', '630.000']),   // 10: closes month 1, total in col H

  row(['THÁNG 2']),                                              // 11: opens month 2

  // Deliberately malformed: blank STT immediately after the month header,
  // before any order has started — a stray continuation with nothing to
  // continue.
  row(['', '', '', 'stray leftover detail']),

  // Order 4 and 5.
  row(['1', '26003', 'PCVN', 'Q1111: valve',
       '40000', '3', 'Bộ', '120000', '129600', '100', '03/02/2026', 'Done']),
  row(['2', '26004\n4600041936', 'THP', 'Item X',
       '70000', '5', 'Hộp', '350000', '378000', '101', '04/02/2026', 'hàng về']),

  row(['DOANH SỐ THÁNG 2', '', '', '', '', '', '', '', '507,600']), // 16: closes month 2, total in col I

  row([]) // 17: trailing fully-blank row — must be skipped silently
];

const env = H.makeEnv();
const sheet = H.makeFakeSheetFromRows(SHEET_ROWS);
const result = env.parseLegacySheet_(sheet);

console.log('\n1. Month detection');
eq('two months detected', result.months.map(m => m.month), [1, 2]);

console.log('\n2. Order/line counts per month');
eq('THÁNG 1 has 3 orders', result.months[0].orders.length, 3);
eq('THÁNG 1 has 4 lines total (order 1 has 2, orders 2 & 3 have 1 each)',
  result.months[0].orders.reduce((n, o) => n + o.lines.length, 0), 4);
eq('THÁNG 2 has 2 orders', result.months[1].orders.length, 2);
eq('THÁNG 2 has 2 lines total (one line each)',
  result.months[1].orders.reduce((n, o) => n + o.lines.length, 0), 2);

console.log('\n3. Multi-line PO cell preserved verbatim (with \\n, not merged/split)');
eq('order 1 PO keeps all 3 lines', result.months[0].orders[0].po, '26001\n38333\n( chTh)');

console.log('\n4. Multi-line TRẠNG THÁI cell preserved verbatim on the continuation line');
eq('order 1 line 2 trangThai keeps both lines',
  result.months[0].orders[0].lines[1].trangThai,
  'GH 22/09/2026\nđã cọc 18,765,000 cho Tâm Thịnh Phát');

console.log('\n5. DOANH SỐ THÁNG n printed totals captured (Vietnamese thousand separators parsed)');
eq('THÁNG 1 printed total = 630000 (from "630.000")', result.months[0].printedTotal, 630000);
eq('THÁNG 2 printed total = 507600 (from "507,600")', result.months[1].printedTotal, 507600);

console.log('\n6. Malformed/unrecognized rows land in unrecognizedRows — never crash, never silently dropped');
eq('exactly two unrecognized rows', result.unrecognizedRows.length, 2);
check('first unrecognized row is the "STT with no other data" row (sheet row 8)',
  result.unrecognizedRows[0].rowNumber === 8 &&
  result.unrecognizedRows[0].reason.indexOf('STT "7"') === 0,
  JSON.stringify(result.unrecognizedRows[0]));
check('second unrecognized row is the "blank STT, no order open" row (sheet row 12)',
  result.unrecognizedRows[1].rowNumber === 12 &&
  result.unrecognizedRows[1].reason.indexOf('Continuation row') === 0,
  JSON.stringify(result.unrecognizedRows[1]));

console.log('\n7. Preamble and trailing blank rows are skipped silently (not unrecognized, not orders)');
eq('order + unrecognized rows account for exactly 5 + 2 = 7 non-structural rows; nothing extra leaked in',
  result.months.reduce((n, m) => n + m.orders.length, 0) + result.unrecognizedRows.length, 7);

H.done();
