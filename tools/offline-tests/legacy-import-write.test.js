/**
 * Offline tests for Milestone 7 / Phase 3 — bulk write path
 * (LegacyImportWrite.gs's legacyRunImportBatch_, LegacyImportWriteOrder.gs's
 * legacyResolveOrderDate_ / legacyConvertLineFieldsOrThrow_ /
 * legacyWriteOneOrder_).
 *
 * migrateImportLegacyOrders() itself (guardSetup_ + Drive.Files.copy +
 * SpreadsheetApp.openById conversion) is NOT covered here — this harness has
 * no Advanced Drive Service fake and Setup.gs (guardSetup_) is not loaded
 * into it, same limitation legacy-import-parse.test.js already documents for
 * Phase 1's dryRunImportLegacyOrders(). This exercises the full Drive-free
 * parse -> map -> write pipeline instead: a real parseLegacySheet_() call on
 * a synthetic fake sheet, feeding straight into legacyRunImportBatch_(),
 * exactly the same real functions migrateImportLegacyOrders() itself calls
 * once past the Drive conversion step.
 *
 * Run with: node tools/offline-tests/legacy-import-write.test.js
 */
const H = require('./harness.js');
const { check, eq } = H;

const STATUS_LIST = [
  { key: 'draft', label: 'Nháp' },
  { key: 'waiting_stock', label: 'Chờ hàng về' },
  { key: 'stock_arrived', label: 'Hàng về' }
];
const UOM_LIST = ['Cái', 'Cuộn', 'Bịch'];

/** Pads/truncates a row literal to the fixed 12-column A..L width, same
 *  helper legacy-import-parse.test.js uses. */
function row(cells) {
  const out = cells.slice(0, 12);
  while (out.length < 12) out.push('');
  return out;
}

/**
 * Resolves the admin identity through the REAL decided pattern (see phase-03
 * doc): a Users row + ADMIN_EMAIL Script Property, read back via
 * loadUser_(ADMIN_EMAIL) — not a hand-built fixture user object — so this
 * test also pins down that the identity-resolution pattern itself produces
 * a usable user for the write path, not just the write path in isolation.
 */
function seedAdmin(env, email) {
  env.store.Users.push({
    email: email, displayName: 'Quản trị viên', role: 'admin', active: true,
    permissions: '{}', createdAt: new Date(), createdBy: 'system', note: ''
  });
  env.PropertiesService.getScriptProperties().setProperty(env.PROP.ADMIN_EMAIL, email);
  const resolvedEmail = env.PropertiesService.getScriptProperties().getProperty(env.PROP.ADMIN_EMAIL);
  return env.loadUser_(resolvedEmail);
}

/* =========================================================================
   1. Full synthetic parse -> map -> write pipeline
   ========================================================================= */
console.log('\n1. Full parse -> map -> write pipeline (2 written orders, 1 skipped, shared invoice)');
(function () {
  const env = H.makeEnv({ statusList: STATUS_LIST, uomList: UOM_LIST, vatRates: [0.08, 0.1] });
  const admin = seedAdmin(env, 'admin@thientan.test');

  const SHEET_ROWS = [
    row(['THÁNG 1']),

    // Order A: 2 lines. Line 1 carries HÓA ĐƠN 98 / 15/03/2026 and a matched
    // status ("hàng về" -> stock_arrived). Line 2 has no invoice, no status.
    row(['1', '26001', 'Nhựa Duy Tân', '710004795 :\nống nhựa',
         '100000', '2', 'Cái', '200000', '216000', '98', '15/03/2026', 'hàng về']),
    row(['', '', 'Nhựa Duy Tân', 'Line 2 detail',
         '50000', '1', 'Cái', '50000', '54000', '', '', '']),

    // Order B: 1 line, SAME invoice number + date as order A's line 1 — must
    // resolve to the same Invoices.invoiceId (Success Criteria). Matched
    // status "chờ hàng về" -> waiting_stock.
    row(['2', '26002', 'Yamato', 'Q4695359: cable',
         '30000', '10', 'Cuộn', '300000', '330000', '98', '15/03/2026', 'chờ hàng về']),

    // Order C: no HÓA ĐƠN/Ngày HĐ anywhere in the group — no parseable
    // historical date exists in the source at all, so this must be SKIPPED,
    // never written with a fabricated date.
    row(['3', '26003', 'ACME Corp', 'Item Z',
         '20000', '4', 'Bịch', '80000', '86400', '', '', ''])
  ];

  const sheet = H.makeFakeSheetFromRows(SHEET_ROWS);
  const parsed = env.parseLegacySheet_(sheet);
  const summary = env.legacyRunImportBatch_(parsed, admin, 150);

  console.log('\n1a. Orders/OrderLines row counts');
  eq('2 orders written (order C skipped)', env.store.Orders.length, 2);
  eq('3 OrderLines rows (2 for order A, 1 for order B)', env.store.OrderLines.length, 3);
  eq('orderId allocation: order A gets DH-2026-0001', env.store.Orders[0].orderId, 'DH-2026-0001');
  eq('orderId allocation: order B gets DH-2026-0002', env.store.Orders[1].orderId, 'DH-2026-0002');
  eq('lineCount stored on order A', env.store.Orders[0].lineCount, 2);
  eq('lineCount stored on order B', env.store.Orders[1].lineCount, 1);

  console.log('\n1b. Real historical orderDate preserved (not the import run\'s date)');
  const orderADate = env.store.Orders[0].orderDate;
  check('order A orderDate is a real Date',
    Object.prototype.toString.call(orderADate) === '[object Date]');
  eq('order A orderDate is 15/03/2026',
    orderADate.getDate() + '/' + (orderADate.getMonth() + 1) + '/' + orderADate.getFullYear(),
    '15/3/2026');

  console.log('\n1c. Orders.totalExVat/totalIncVat exactly equal the sum of that order\'s OrderLines');
  const orderALines = env.store.OrderLines.filter(l => l.orderId === env.store.Orders[0].orderId);
  const orderBLines = env.store.OrderLines.filter(l => l.orderId === env.store.Orders[1].orderId);
  eq('order A totalExVat = sum of its lines\' amountExVat', env.store.Orders[0].totalExVat,
    orderALines.reduce((s, l) => s + l.amountExVat, 0));
  eq('order A totalIncVat = sum of its lines\' amountIncVat', env.store.Orders[0].totalIncVat,
    orderALines.reduce((s, l) => s + l.amountIncVat, 0));
  eq('order A totalExVat value', env.store.Orders[0].totalExVat, 250000);
  eq('order A totalIncVat value (8% VAT both lines)', env.store.Orders[0].totalIncVat, 270000);
  eq('order B totalExVat = sum of its lines\' amountExVat', env.store.Orders[1].totalExVat,
    orderBLines.reduce((s, l) => s + l.amountExVat, 0));
  eq('order B totalIncVat value (10% VAT)', env.store.Orders[1].totalIncVat, 330000);

  console.log('\n1d. Invoice linkage: same invoice number+date across 2 orders resolves to the SAME invoiceId');
  eq('exactly one Invoices row created (deduplicated, not 2)', env.store.Invoices.length, 1);
  const invoiceIdOnA = orderALines[0].invoiceId;
  const invoiceIdOnB = orderBLines[0].invoiceId;
  check('both orders\' invoice-carrying line share the same non-blank invoiceId',
    !!invoiceIdOnA && invoiceIdOnA === invoiceIdOnB,
    'A=' + invoiceIdOnA + ' B=' + invoiceIdOnB);
  eq('invoiceId uses the invoice\'s real year (2026), not a fabricated one',
    invoiceIdOnA, 'HD-2026-0098');
  eq('order A\'s second line (no invoice) has a blank invoiceId', orderALines[1].invoiceId, '');

  console.log('\n1e. StatusHistory: one row per line with a non-blank status, none for blank-status lines');
  eq('exactly 2 StatusHistory rows (order A line 1, order B line 1)', env.store.StatusHistory.length, 2);
  const historyForA = env.store.StatusHistory.filter(h => h.orderId === env.store.Orders[0].orderId);
  const historyForB = env.store.StatusHistory.filter(h => h.orderId === env.store.Orders[1].orderId);
  eq('order A has exactly 1 StatusHistory row (line 2 had blank status)', historyForA.length, 1);
  eq('order A\'s row: oldStatus blank, newStatus stock_arrived',
    [historyForA[0].oldStatus, historyForA[0].newStatus], ['', 'stock_arrived']);
  eq('order B\'s row: newStatus waiting_stock', historyForB[0].newStatus, 'waiting_stock');
  eq('history rows carry the import-distinguishing note', historyForA[0].note, 'Nhập từ dữ liệu lịch sử');
  eq('history field is "status" (line-level, not approveStatus)', historyForA[0].field, 'status');
  check('history row carries the line\'s lineId (non-blank)', !!historyForA[0].lineId, historyForA[0].lineId);

  console.log('\n1f. createdBy/changedBy identity: the ADMIN_EMAIL-resolved user, for every write');
  eq('order A createdBy', env.store.Orders[0].createdBy, 'admin@thientan.test');
  eq('order B createdBy', env.store.Orders[1].createdBy, 'admin@thientan.test');
  eq('StatusHistory changedBy (order A)', historyForA[0].changedBy, 'admin@thientan.test');
  eq('StatusHistory changedBy (order B)', historyForB[0].changedBy, 'admin@thientan.test');
  eq('every written order starts as draft approveStatus', env.store.Orders.map(o => o.approveStatus),
    ['draft', 'draft']);

  console.log('\n1g. Order C (no parseable date anywhere) is skipped, not written with a fabricated date');
  check('summary reports 1 skipped order', summary.indexOf('Orders skipped: 1') >= 0, summary);
  check('summary explains the skip reason (no parseable order date)',
    summary.indexOf('no parseable order date') >= 0, summary);
  check('no order in the store has customer "ACME Corp" (order C never written)',
    !env.store.Orders.some(o => o.customer === 'ACME Corp'));

  console.log('\n1h. Run report reflects no cap overflow for this small run');
  check('summary reports no orders remaining', summary.indexOf('No orders remaining') >= 0, summary);
})();

/* =========================================================================
   2. Per-run cap
   ========================================================================= */
console.log('\n2. Per-run cap leaves the rest for a later run, never writes past it');
(function () {
  const env = H.makeEnv({ statusList: STATUS_LIST, uomList: UOM_LIST, vatRates: [0.08, 0.1] });
  const admin = seedAdmin(env, 'admin@thientan.test');

  // NGAY_HD (order date source, see legacyResolveOrderDate_) lives in
  // column K (index 10); TRANG_THAI is column L (index 11) — left blank here,
  // status matching is not this section's concern.
  const ROWS = [
    row(['THÁNG 1']),
    row(['1', '30001', 'Cust A', 'Item A', '10000', '1', 'Cái', '10000', '10800', '', '01/02/2026', '']),
    row(['2', '30002', 'Cust B', 'Item B', '20000', '1', 'Cái', '20000', '21600', '', '02/02/2026', '']),
    row(['3', '30003', 'Cust C', 'Item C', '30000', '1', 'Cái', '30000', '32400', '', '03/02/2026', ''])
  ];

  const sheet = H.makeFakeSheetFromRows(ROWS);
  const parsed = env.parseLegacySheet_(sheet);
  const summary = env.legacyRunImportBatch_(parsed, admin, 2);

  eq('only 2 of 3 valid orders written (cap = 2)', env.store.Orders.length, 2);
  check('summary reports 1 order remaining', summary.indexOf('remaining') >= 0 && summary.indexOf(': 1') >= 0,
    summary);
})();

H.done();
