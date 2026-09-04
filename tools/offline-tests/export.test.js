/**
 * Offline tests for Milestone 4 / 4.1 — CSV export of the filtered order
 * list. Run with: node tools/offline-tests/export.test.js
 */
const H = require('./harness.js');
const { user, check, eq, throws } = H;

function line(over) {
  return Object.assign({ description: 'Ống nhựa PVC 90', qty: 2, unitPrice: 100000,
                         uom: 'Cái', vatRate: 0.08 }, over || {});
}
function order(over) {
  return Object.assign({ customer: 'Nhựa Duy Tân', orderDate: '2026-08-20',
                         status: 'draft', po: '4600041936' }, over || {});
}

/** Splits a CSV export's `csv` string back into rows/cells for assertions.
 *  Good enough for these fixtures (no embedded commas/newlines tested by
 *  splitting — those are asserted with a direct substring match instead). */
function rows(csv) {
  return csv.replace(/^﻿/, '').split('\r\n').map(r => r.split(','));
}

/* ---------- 1. permission enforcement ---------- */
console.log('\n1. export requires the export permission');
{
  const env = H.makeEnv();
  const noExport = user('a@x.com', { export: false });
  throws('refused without export permission',
    () => env.actionExportOrdersCsv_(noExport, {}));

  const withExport = user('b@x.com', { export: true });
  const res = env.actionExportOrdersCsv_(withExport, {});
  check('succeeds with export permission', !!res.csv);
}

/* ---------- 2. header row + BOM + filename/mimeType shape ---------- */
console.log('\n2. CSV shape: header row, BOM, filename, mimeType');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com', { export: true });
  env.actionCreateOrder_(admin, { order: order(), lines: [line()] });

  const res = env.actionExportOrdersCsv_(admin, {});
  eq('mimeType is text/csv', res.mimeType, 'text/csv');
  check('filename ends with .csv', /\.csv$/.test(res.filename));
  check('csv starts with a UTF-8 BOM', res.csv.charCodeAt(0) === 0xFEFF);

  const header = rows(res.csv)[0];
  eq('header row matches the reference columns', header, [
    'STT', 'PO', 'KHÁCH HÀNG', 'CHI TIẾT',
    'ĐƠN GIÁ BÁN RA VND', 'SL', 'ĐVT',
    'THÀNH TIỀN VND - CHƯA VAT', 'TRỊ GIÁ HĐ',
    'HÓA ĐƠN RA', 'NGÀY HĐ', 'TRẠNG THÁI'
  ]);
}

/* ---------- 3. month grouping + STT + DOANH SỐ total ---------- */
console.log('\n3. grouped by month, STT resets per month, DOANH SỐ total row');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com', { export: true });
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-07-05' }), lines: [line()] });
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-10' }), lines: [line()] });
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-20' }), lines: [line()] });

  const res = env.actionExportOrdersCsv_(admin, {});
  const body = res.csv.replace(/^﻿/, '');

  check('THÁNG 7 group header present', /^THÁNG 7$/m.test(body));
  check('THÁNG 8 group header present', /^THÁNG 8$/m.test(body));
  check('THÁNG 7 comes before THÁNG 8 (oldest month first)',
    body.indexOf('THÁNG 7') < body.indexOf('THÁNG 8'));
  check('a DOANH SỐ THÁNG 7 total row exists', body.indexOf('DOANH SỐ THÁNG 7') >= 0);
  check('a DOANH SỐ THÁNG 8 total row exists', body.indexOf('DOANH SỐ THÁNG 8') >= 0);

  const allRows = rows(res.csv);
  // Two orders in THÁNG 8 -> STT 1 and STT 2 on their first (only) lines.
  const sttCol = allRows.map(r => r[0]);
  check('STT 1 appears (first order of a month)', sttCol.indexOf('1') >= 0);
  check('STT 2 appears (second order of THÁNG 8)', sttCol.indexOf('2') >= 0);
}

/* ---------- 4. multi-line order: STT/PO/status first line only, customer every line ---------- */
console.log('\n4. multi-line order: STT/PO/status on first line only, customer repeated');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com', { export: true });
  env.actionCreateOrder_(admin, {
    order: order({ po: 'PO-999' }),
    lines: [line({ description: 'Dòng 1' }), line({ description: 'Dòng 2' })]
  });

  const res = env.actionExportOrdersCsv_(admin, {});
  const allRows = rows(res.csv);
  const dataRows = allRows.filter(r => r[3] === 'Dòng 1' || r[3] === 'Dòng 2');
  eq('two line rows present', dataRows.length, 2);

  const first = dataRows[0], second = dataRows[1];
  eq('first line carries STT', first[0], '1');
  eq('first line carries PO', first[1], 'PO-999');
  eq('second line has blank STT', second[0], '');
  eq('second line has blank PO', second[1], '');
  eq('customer repeated on both lines', first[2], 'Nhựa Duy Tân');
  eq('customer repeated on both lines (second)', second[2], 'Nhựa Duy Tân');
}

/* ---------- 5. unbilled line shows blank invoice columns, nothing special ---------- */
console.log('\n5. a line with no invoice yet shows blank invoiceNo/invoiceDate');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com', { export: true });
  env.actionCreateOrder_(admin, { order: order(), lines: [line()] });

  const res = env.actionExportOrdersCsv_(admin, {});
  const allRows = rows(res.csv);
  const dataRow = allRows.filter(r => r[3] === 'Ống nhựa PVC 90')[0];
  eq('HÓA ĐƠN RA is blank', dataRow[9], '');
  eq('NGÀY HĐ is blank', dataRow[10], '');
}

/* ---------- 6. price-blind role: money columns and month total are blank ---------- */
console.log('\n6. price-blind role sees no money in the export');
{
  const env = H.makeEnv();
  const blind = user('blind@x.com', {
    export: true, view_all_orders: true,
    visible_fields: ['customer', 'orderDate', 'status', 'description', 'qty', 'uom']
  });
  env.actionCreateOrder_(blind, { order: order(), lines: [line()] });

  const res = env.actionExportOrdersCsv_(blind, {});
  const body = res.csv.replace(/^﻿/, '');
  const allRows = rows(res.csv);
  const dataRow = allRows.filter(r => r[3] === 'Ống nhựa PVC 90')[0];

  eq('unit price blank', dataRow[4], '');
  eq('amount ex-VAT blank', dataRow[7], '');
  eq('amount inc-VAT blank', dataRow[8], '');
  check('qty still shown (not a money field)', dataRow[5] === '2');
  check('DOANH SỐ total row has no figures', !/DOANH SỐ THÁNG 8,[\d]/.test(body));
}

/* ---------- 7. view_all_orders scoping applies to export ---------- */
console.log('\n7. a user without view_all_orders only exports their own orders');
{
  const env = H.makeEnv();
  const owner = user('owner@x.com', { export: true, view_all_orders: false });
  const other = user('other@x.com', { export: true, view_all_orders: true });
  env.actionCreateOrder_(owner, { order: order(), lines: [line({ description: 'Của owner' })] });
  env.actionCreateOrder_(other, { order: order(), lines: [line({ description: 'Của other' })] });

  const res = env.actionExportOrdersCsv_(owner, {});
  check('sees own order', res.csv.indexOf('Của owner') >= 0);
  check('does not see the other user\'s order', res.csv.indexOf('Của other') < 0);
}

/* ---------- 8. filters apply the same as the list (customer filter) ---------- */
console.log('\n8. export honours the same filters as listOrders');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com', { export: true });
  env.actionCreateOrder_(admin, { order: order({ customer: 'A' }), lines: [line({ description: 'Hàng A' })] });
  env.actionCreateOrder_(admin, { order: order({ customer: 'B' }), lines: [line({ description: 'Hàng B' })] });

  const res = env.actionExportOrdersCsv_(admin, { customer: 'A' });
  check('customer A included', res.csv.indexOf('Hàng A') >= 0);
  check('customer B excluded', res.csv.indexOf('Hàng B') < 0);
}

/* ---------- 9. CSV escaping ---------- */
console.log('\n9. a value containing a comma or quote is properly CSV-escaped');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com', { export: true });
  env.actionCreateOrder_(admin, {
    order: order({ customer: 'Công ty "ABC", chi nhánh 2' }),
    lines: [line()]
  });

  const res = env.actionExportOrdersCsv_(admin, {});
  check('comma+quote value is quoted and doubled',
    res.csv.indexOf('"Công ty ""ABC"", chi nhánh 2"') >= 0);
}

/* ---------- 10. an order with zero lines still gets one row ---------- */
console.log('\n10. an order with zero lines still produces a row (STT/PO only)');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com', { export: true });
  // actionCreateOrder_ requires at least one line normally; simulate a
  // zero-line row directly in the store to cover the defensive branch.
  env.store.Orders.push({
    orderId: 'DH-2026-9999', po: 'PO-EMPTY', customer: 'Ai đó', orderDate: '2026-08-01',
    status: 'draft', createdBy: 'admin@x.com', totalExVat: 0, totalIncVat: 0, lineCount: 0
  });

  const res = env.actionExportOrdersCsv_(admin, {});
  check('zero-line order still appears with its PO', res.csv.indexOf('PO-EMPTY') >= 0);
}

console.log('\n' + H.check.name); // no-op keeps `check` referenced if unused elsewhere
H.done();
