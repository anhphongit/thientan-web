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

/** Attaches an invoice to a specific line (by lineNo) of an order — writes
 *  an Invoices row, then stamps invoiceId directly onto the OrderLines row
 *  via updateRecord_ (bypassing any invoicing action/UI, which doesn't
 *  exist yet — this is purely for exercising bucketByInvoiceDate_). */
function attachInvoice(env, orderId, lineNo, invoiceDate, invoiceNo) {
  const invoiceId = 'inv-' + orderId + '-' + lineNo + '-' + Math.random().toString(36).slice(2, 7);
  env.appendRecord_('Invoices', {
    invoiceId: invoiceId, invoiceNo: invoiceNo || ('HD' + lineNo), invoiceDate: invoiceDate,
    customer: '', note: '', createdBy: '', createdAt: new Date()
  });
  const line = env.readAll_('OrderLines').find(l => l.orderId === orderId && Number(l.lineNo) === Number(lineNo));
  if (!line) throw new Error('attachInvoice: no line ' + lineNo + ' on order ' + orderId);
  env.updateRecord_('OrderLines', line._row, { invoiceId: invoiceId });
  return invoiceId;
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

/* ---------- 11. invoice-date basis: default stays order-date ---------- */
console.log('\n11. basis defaults to order-date when payload.basis is absent/unknown');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com', { export: true });
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-20' }), lines: [line()] });

  const resDefault = env.actionExportOrdersCsv_(admin, {});
  const resJunk = env.actionExportOrdersCsv_(admin, { basis: 'bogus' });
  check('no basis -> THÁNG 8 (order date)', resDefault.csv.indexOf('THÁNG 8') >= 0);
  check('unknown basis -> falls back to order date', resJunk.csv.indexOf('THÁNG 8') >= 0);
}

/* ---------- 12. invoice-date basis: single order, single invoice ---------- */
console.log('\n12. invoice-date basis buckets a fully-invoiced order by its invoice month');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com', { export: true });
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-20' }), lines: [line()] });
  const created = env.readAll_('Orders')[0];
  attachInvoice(env, created.orderId, 1, '2026-09-05');

  const res = env.actionExportOrdersCsv_(admin, { basis: 'invoiceDate' });
  check('bucketed under THÁNG 9 (invoice month), not THÁNG 8 (order month)',
    res.csv.indexOf('THÁNG 9') >= 0 && res.csv.indexOf('THÁNG 8') < 0);
}

/* ---------- 13. invoice-date basis: a split order appears in two buckets ---------- */
console.log('\n13. invoice-date basis: one order split across two invoice months');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com', { export: true });
  env.actionCreateOrder_(admin, {
    order: order({ orderDate: '2026-08-20' }),
    lines: [line({ description: 'Dòng A' }), line({ description: 'Dòng B' })]
  });
  const created = env.readAll_('Orders')[0];
  attachInvoice(env, created.orderId, 1, '2026-08-28');
  attachInvoice(env, created.orderId, 2, '2026-09-03');

  const res = env.actionExportOrdersCsv_(admin, { basis: 'invoiceDate' });
  const allRows = rows(res.csv);
  const rowA = allRows.filter(r => r[3] === 'Dòng A')[0];
  const rowB = allRows.filter(r => r[3] === 'Dòng B')[0];
  check('both months present', res.csv.indexOf('THÁNG 8') >= 0 && res.csv.indexOf('THÁNG 9') >= 0);
  check('Dòng A carries the order\'s PO/STT (first line of its bucket)', rowA[0] === '1' && rowA[1] === created.po);
  check('Dòng B ALSO carries STT/PO (first line of ITS OWN bucket, a separate orderGroup)',
    rowB[0] === '1' && rowB[1] === created.po);
}

/* ---------- 14. invoice-date basis: unbilled line goes to the "no invoice" bucket ---------- */
console.log('\n14. invoice-date basis: unbilled line -> dedicated no-invoice bucket, sub-grouped by order');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com', { export: true });
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-20' }), lines: [line()] });

  const res = env.actionExportOrdersCsv_(admin, { basis: 'invoiceDate' });
  check('no-invoice bucket label present', res.csv.indexOf('CHƯA XUẤT HÓA ĐƠN') >= 0);
  const allRows = rows(res.csv);
  const dataRow = allRows.filter(r => r[3] === 'Ống nhựa PVC 90')[0];
  check('the unbilled line still shows PO/STT (its own orderGroup)', dataRow[0] === '1' && dataRow[1] === env.readAll_('Orders')[0].po);
}

/* ---------- 15. invoice-date basis: DOANH SỐ totals split correctly per bucket ---------- */
console.log('\n15. invoice-date basis: revenue totals are attributed per bucket, not per order');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com', { export: true });
  env.actionCreateOrder_(admin, {
    order: order({ orderDate: '2026-08-20' }),
    lines: [line({ description: 'Dòng A', unitPrice: 100000, qty: 1, amountExVat: 100000, amountIncVat: 108000 }),
            line({ description: 'Dòng B', unitPrice: 200000, qty: 1, amountExVat: 200000, amountIncVat: 216000 })]
  });
  const created = env.readAll_('Orders')[0];
  attachInvoice(env, created.orderId, 1, '2026-08-28');
  attachInvoice(env, created.orderId, 2, '2026-09-03');

  const res = env.actionExportOrdersCsv_(admin, { basis: 'invoiceDate' });
  const body = res.csv.replace(/^﻿/, '');
  check('THÁNG 8 total reflects only Dòng A (100,000)', body.indexOf('DOANH SỐ THÁNG 8,100.000 / 108.000') >= 0);
  check('THÁNG 9 total reflects only Dòng B (200,000)', body.indexOf('DOANH SỐ THÁNG 9,200.000 / 216.000') >= 0);
}

/* ---------- 16. status column shows the Vietnamese label, not the raw key ---------- */
console.log('\n16. TRẠNG THÁI column shows the config label, not the raw status key');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com', { export: true });
  env.actionCreateOrder_(admin, { order: order({ status: 'draft' }), lines: [line()] });

  const res = env.actionExportOrdersCsv_(admin, {});
  const allRows = rows(res.csv);
  const dataRow = allRows.filter(r => r[3] === 'Ống nhựa PVC 90')[0];
  check('status cell shows "Nháp" (config label), not "draft" (the raw key)', dataRow[11] === 'Nháp');
}

/* ---------- 17. buildExportRows_ sets groupSize for XLSX merges (ExportSheet.gs's contract) ---------- */
console.log('\n17. buildExportRows_ marks groupSize on the first line of each order — the XLSX merge contract');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com', { export: true });
  env.actionCreateOrder_(admin, {
    order: order(),
    lines: [line({ description: 'Dòng 1' }), line({ description: 'Dòng 2' }), line({ description: 'Dòng 3' })]
  });
  env.actionCreateOrder_(admin, { order: order({ po: 'PO-SINGLE' }), lines: [line({ description: 'Chỉ 1 dòng' })] });

  const buckets = env.bucketOrdersForExport_(
    env.filteredOrderRowsForUser_(admin, env.computeOrderFilters_(admin, {}, env.readPublicConfig_())),
    'orderDate'
  );
  const exportRows = env.buildExportRows_(admin, buckets);
  const dataRows = exportRows.filter(r => r.kind === 'data');

  const line1 = dataRows.find(r => r.cells[3] === 'Dòng 1');
  const line2 = dataRows.find(r => r.cells[3] === 'Dòng 2');
  const line3 = dataRows.find(r => r.cells[3] === 'Dòng 3');
  const single = dataRows.find(r => r.cells[3] === 'Chỉ 1 dòng');

  check('first line of a 3-line order carries groupSize 3', line1.groupSize === 3);
  check('2nd/3rd lines of that order carry no groupSize (undefined)', line2.groupSize === undefined && line3.groupSize === undefined);
  check('a single-line order\'s only line carries groupSize 1', single.groupSize === 1);
}

/* ---------- 18. exportLargeThreshold_ (Milestone 4 / 4.5.2 revision) ---------- */
console.log('\n18. exportLargeThreshold_ reads the config value, falls back to 500 when missing/invalid');
{
  const env = H.makeEnv();
  eq('default fixture config (no exportLargeThreshold key) falls back to 500',
     env.exportLargeThreshold_(env.readPublicConfig_()), 500);
  eq('a valid configured value is used as-is',
     env.exportLargeThreshold_({ exportLargeThreshold: '250' }), 250);
  eq('zero falls back to the default (not a usable threshold)',
     env.exportLargeThreshold_({ exportLargeThreshold: '0' }), 500);
  eq('a negative value falls back to the default',
     env.exportLargeThreshold_({ exportLargeThreshold: '-5' }), 500);
  eq('garbage/non-numeric falls back to the default',
     env.exportLargeThreshold_({ exportLargeThreshold: 'abc' }), 500);
  eq('a numeric value (not just a string) also works', env.exportLargeThreshold_({ exportLargeThreshold: 800 }), 800);
}

console.log('\n' + H.check.name); // no-op keeps `check` referenced if unused elsewhere
H.done();
