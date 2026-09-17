/**
 * Offline tests for Milestone 7 / Phase 2 — field mapping and extraction
 * rules (LegacyImportMap.gs, LegacyImportMapCompose.gs,
 * LegacyImportMapDeposit.gs). Pure data-transformation functions consuming
 * Phase 1's parsed order-group shape; NO writes to Orders/OrderLines/
 * Invoices anywhere in the code under test.
 *
 * Every fixture below is quoted VERBATIM from docs/EXCEL_REFERENCE.md
 * (§3 PO splitting, §4 VAT ratios, §5 CHI TIẾT/ĐVT variants, §6 status
 * values, including all 5 free-text one-off examples) per the phase plan's
 * Success Criteria, so each rule is pinned to a real source example, not
 * tribal knowledge.
 *
 * Run with: node tools/offline-tests/legacy-import-mapping.test.js
 */
const H = require('./harness.js');
const { check, eq } = H;
const env = H.makeEnv();

// Same shape as CONFIG_DEFAULTS.statusList (Config.gs) — the app's current
// default, used to verify mapStatusCell_ against a realistic production
// Config. Includes 'done' (code review 2026-09-16, Fix 4): the highest-
// frequency raw status value (443 of ~534 lines, EXCEL_REFERENCE.md §6) now
// has a matching entry here, same as a freshly-seeded Config sheet would —
// see LegacyImportMapDeposit.gs's doc comment for why the unrelated-note
// filter's 'done' keyword guard stays regardless (still needed for any
// deployment whose Config sheet predates this default, per runbook.md's
// pre-flight step).
const DEFAULT_STATUS_LIST = [
  { key: 'draft', label: 'Nháp' },
  { key: 'confirmed', label: 'Đã xác nhận' },
  { key: 'waiting_stock', label: 'Chờ hàng về' },
  { key: 'stock_arrived', label: 'Hàng về' },
  { key: 'delivered_not_invoiced', label: 'Đã giao, chưa xuất' },
  { key: 'invoiced_unpaid', label: 'Đã xuất, chưa TT' },
  { key: 'paid', label: 'Đã thanh toán' },
  { key: 'cancelled', label: 'Đã huỷ' },
  { key: 'done', label: 'Hoàn thành' }
];
const DEFAULT_UOM_LIST = ['Cái', 'Cuộn', 'Bịch', 'Bộ', 'm', 'Hộp', 'SET', 'Xấp'];
const DEFAULT_CONFIG = { statusList: DEFAULT_STATUS_LIST, uomList: DEFAULT_UOM_LIST, vatRates: [0.08, 0.1] };

/* =========================================================================
   1. mapPoCell_ — EXCEL_REFERENCE.md §3
   ========================================================================= */
console.log('\n1. mapPoCell_ — PO cell splitting (§3)');
eq('3-line PO cell: business number + customer PO joined, "( chTh)" note extracted',
  env.mapPoCell_('26001\n38333\n( chTh)'), { po: '26001; 38333', poNote: 'chTh' });
eq('single-line PO, no note', env.mapPoCell_('26002'), { po: '26002', poNote: '' });
eq('2-line PO (business + customer PO, no note)',
  env.mapPoCell_('26004\n4600041936'), { po: '26004; 4600041936', poNote: '' });
eq('blank PO cell', env.mapPoCell_(''), { po: '', poNote: '' });
eq('blank/whitespace-only PO cell', env.mapPoCell_('   \n  '), { po: '', poNote: '' });

/* =========================================================================
   2. mapChiTietCell_ — EXCEL_REFERENCE.md §5
   ========================================================================= */
console.log('\n2. mapChiTietCell_ — CHI TIẾT splitting (§5)');
eq('Duy Tân internal code: "710004795 :\\nống nhựa"',
  env.mapChiTietCell_('710004795 :\nống nhựa'), { productCode: '710004795', description: 'ống nhựa' });
eq('PCVN quote ref: "Q4695359: cable"',
  env.mapChiTietCell_('Q4695359: cable'), { productCode: 'Q4695359', description: 'cable' });
eq('multi-line description after code, internal newline preserved',
  env.mapChiTietCell_('710004795 :\nống nhựa\ndài 6m'),
  { productCode: '710004795', description: 'ống nhựa\ndài 6m' });
eq('no colon at all: whole cell is description, code blank',
  env.mapChiTietCell_('Line 2 detail'), { productCode: '', description: 'Line 2 detail' });

/* =========================================================================
   3. detectVatRate_ — EXCEL_REFERENCE.md §4
   ========================================================================= */
console.log('\n3. detectVatRate_ — VAT ratio detection (§4)');
eq('1.08 ratio (8% VAT): H=200000, I=216000',
  env.detectVatRate_('100000', '2', '200000', '216000'), { vatRate: 0.08, wasFallback: false });
eq('1.10 ratio (10% VAT): H=300000, I=330000',
  env.detectVatRate_('30000', '10', '300000', '330000'), { vatRate: 0.10, wasFallback: false });
eq('1.08 ratio with Vietnamese thousand separators: H=630.000-shaped values',
  env.detectVatRate_('40000', '3', '120000', '129600'), { vatRate: 0.08, wasFallback: false });
eq('blank Thành tiền (H) AND blank unitPrice/qty → undefined ratio → fallback flagged',
  env.detectVatRate_('', '', '', '216000'), { vatRate: null, wasFallback: true });
eq('zero Thành tiền (H) AND zero unitPrice/qty → fallback flagged',
  env.detectVatRate_('0', '0', '0', '216000'), { vatRate: null, wasFallback: true });
eq('H recomputed from unitPrice × qty when Thành tiền cell itself is blank',
  env.detectVatRate_('100000', '2', '', '216000.00'), { vatRate: 0.08, wasFallback: false });
eq('blank Trị giá hđ (I) → fallback flagged',
  env.detectVatRate_('100000', '2', '200000', ''), { vatRate: null, wasFallback: true });
eq('ratio matches neither 1.08 nor 1.10 → fallback flagged',
  env.detectVatRate_('100000', '2', '200000', '250000'), { vatRate: null, wasFallback: true });

/* =========================================================================
   4. mapUom_ — EXCEL_REFERENCE.md §5
   ========================================================================= */
console.log('\n4. mapUom_ — ĐVT casing normalization (§5)');
eq('lowercase "cái" → canonical "Cái", matched',
  env.mapUom_('cái', DEFAULT_UOM_LIST), { uom: 'Cái', wasExactMatch: true });
eq('uppercase "CUỘN" → canonical "Cuộn", matched',
  env.mapUom_('CUỘN', DEFAULT_UOM_LIST), { uom: 'Cuộn', wasExactMatch: true });
eq('mixed-case "Bịch" already canonical, matched',
  env.mapUom_('Bịch', DEFAULT_UOM_LIST), { uom: 'Bịch', wasExactMatch: true });
eq('"m" unit, matched', env.mapUom_('M', DEFAULT_UOM_LIST), { uom: 'm', wasExactMatch: true });
eq('unrecognized unit "Thùng" kept raw, not matched',
  env.mapUom_('Thùng', DEFAULT_UOM_LIST), { uom: 'Thùng', wasExactMatch: false });
eq('blank ĐVT cell: nothing to flag',
  env.mapUom_('', DEFAULT_UOM_LIST), { uom: '', wasExactMatch: true });

/* =========================================================================
   5. mapStatusCell_ — EXCEL_REFERENCE.md §6 (5 controlled-ish values)
   ========================================================================= */
console.log('\n5. mapStatusCell_ — controlled status matching (§6)');
eq('"đã xuất chưa tt" matches invoiced_unpaid (label "Đã xuất, chưa TT")',
  env.mapStatusCell_('đã xuất chưa tt', DEFAULT_STATUS_LIST),
  { status: 'invoiced_unpaid', statusNote: '', matched: true });
eq('"đã giao, chưa xuất" matches delivered_not_invoiced',
  env.mapStatusCell_('đã giao, chưa xuất', DEFAULT_STATUS_LIST),
  { status: 'delivered_not_invoiced', statusNote: '', matched: true });
eq('"hàng về" matches stock_arrived',
  env.mapStatusCell_('hàng về', DEFAULT_STATUS_LIST),
  { status: 'stock_arrived', statusNote: '', matched: true });
eq('"chờ hàng về" matches waiting_stock',
  env.mapStatusCell_('chờ hàng về', DEFAULT_STATUS_LIST),
  { status: 'waiting_stock', statusNote: '', matched: true });
eq('case-insensitive match: "Done" matches the "done" entry (Fix 4, code review 2026-09-16)',
  env.mapStatusCell_('Done', DEFAULT_STATUS_LIST), { status: 'done', statusNote: '', matched: true });
eq('"done" matches the "done" entry directly (key match, lowercase)',
  env.mapStatusCell_('done', DEFAULT_STATUS_LIST), { status: 'done', statusNote: '', matched: true });
eq('"done" still falls through unmatched against a statusList that lacks the entry ' +
  '(pre-Fix-4 Config sheet that has not had the entry added yet, see runbook.md)',
  env.mapStatusCell_('done', DEFAULT_STATUS_LIST.filter(function (s) { return s.key !== 'done'; })),
  { status: '', statusNote: 'done', matched: false });
eq('regression (2026-09-17, user report): matches against the REAL production label ' +
  'the admin actually saved via the Admin UI ("Đã hoàn thành", not the code default ' +
  '"Hoàn thành") — the key match alone is sufficient, label text is irrelevant here',
  env.mapStatusCell_('done',
    [{ key: 'done', label: 'Đã hoàn thành' }, { key: 'draft', label: 'Nháp' }]),
  { status: 'done', statusNote: '', matched: true });
eq('unrecognized free text falls through to statusNote, status blank',
  env.mapStatusCell_('Khách đã cọc 47,466,000đ', DEFAULT_STATUS_LIST),
  { status: '', statusNote: 'Khách đã cọc 47,466,000đ', matched: false });
eq('blank status cell', env.mapStatusCell_('', DEFAULT_STATUS_LIST), { status: '', statusNote: '', matched: false });

/* =========================================================================
   6. extractDepositSupplier_ — EXCEL_REFERENCE.md §6 deposit/supplier examples
   ========================================================================= */
console.log('\n6. extractDepositSupplier_ — deposit/supplier extraction (§6)');
eq('"Khách đã cọc 47,466,000đ" → customer deposit',
  env.extractDepositSupplier_('Khách đã cọc 47,466,000đ'),
  { customerDeposit: 47466000, supplierName: '', supplierPaid: null, matched: true });
eq('"GH 22/09/2026\\nđã cọc 18,765,000 cho Tâm Thịnh Phát" → deposit PAID TO supplier',
  env.extractDepositSupplier_('GH 22/09/2026\nđã cọc 18,765,000 cho Tâm Thịnh Phát'),
  { customerDeposit: null, supplierName: 'Tâm Thịnh Phát', supplierPaid: 18765000, matched: true });
eq('"đã tt đủ NCC Regas" → supplier fully paid, name found, no figure to parse',
  env.extractDepositSupplier_('đã tt đủ NCC Regas'),
  { customerDeposit: null, supplierName: 'Regas', supplierPaid: null, matched: true });
eq('"đã đặt TVP, không cọc" → ordered from supplier, no deposit amount',
  env.extractDepositSupplier_('đã đặt TVP, không cọc'),
  { customerDeposit: null, supplierName: 'TVP', supplierPaid: null, matched: true });
eq('unrelated cash note extracts nothing',
  env.extractDepositSupplier_('Ngày 06/06: mua đt iphone'),
  { customerDeposit: null, supplierName: '', supplierPaid: null, matched: false });
eq('blank text extracts nothing',
  env.extractDepositSupplier_(''), { customerDeposit: null, supplierName: '', supplierPaid: null, matched: false });

/* =========================================================================
   7. mapLegacyOrderGroup_ — composer + unrelated-note filter (decision #1)
   ========================================================================= */
console.log('\n7. mapLegacyOrderGroup_ — composer, review flags, unrelated-note filter');

function line(overrides) {
  return Object.assign({
    rowNumber: 1, chiTiet: 'Item', donGia: '10000', sl: '1', dvt: 'Cái',
    thanhTien: '10000', triGiaHd: '10800', hoaDonRa: '', ngayHd: '', trangThai: ''
  }, overrides);
}

// 7a. All 4 legitimate free-text one-offs (§6) must be KEPT — either
// extracted into order-level fields (first line) or preserved verbatim in
// statusNote — never silently dropped.
const legitimateNotes = [
  'GH 22/09/2026\nđã cọc 18,765,000 cho Tâm Thịnh Phát',
  'Khách đã cọc 47,466,000đ',
  'đã tt đủ NCC Regas',
  'đã đặt TVP, không cọc'
];
legitimateNotes.forEach(function (note, i) {
  var group = { stt: '1', po: '2600' + i, customer: 'Yamato', lines: [line({ trangThai: note })] };
  var mapped = env.mapLegacyOrderGroup_(group, DEFAULT_CONFIG);
  check('legitimate note kept in statusNote: "' + note.replace(/\n/g, ' ') + '"',
    mapped.lineFields[0].statusNote === note, JSON.stringify(mapped.lineFields[0]));
  check('legitimate note: no filtered-unrelated-note flag for "' + note.replace(/\n/g, ' ') + '"',
    !mapped.reviewFlags.some(function (f) { return f.type === 'filtered-unrelated-note'; }),
    JSON.stringify(mapped.reviewFlags));
  check('legitimate note: deposit-extraction-attempted flag logged (first line)',
    mapped.reviewFlags.some(function (f) { return f.type === 'deposit-extraction-attempted'; }),
    JSON.stringify(mapped.reviewFlags));
});

// 7b. The 5th (unrelated) free-text one-off is FILTERED OUT and flagged,
// per the user's explicit decision — this is the one case that must NOT
// survive into statusNote.
(function () {
  var group = { stt: '1', po: '26099', customer: 'Yamato',
    lines: [line({ trangThai: 'Ngày 06/06: mua đt iphone' })] };
  var mapped = env.mapLegacyOrderGroup_(group, DEFAULT_CONFIG);
  eq('unrelated cash note: statusNote is dropped', mapped.lineFields[0].statusNote, '');
  check('unrelated cash note: filtered-unrelated-note flag logged with raw text preserved for review',
    mapped.reviewFlags.some(function (f) {
      return f.type === 'filtered-unrelated-note' && f.rawText === 'Ngày 06/06: mua đt iphone' &&
        f.lineIndex === 0;
    }), JSON.stringify(mapped.reviewFlags));
})();

// 7c. "done" is a controlled-ish value (§6, 443 occurrences) that now
// matches DEFAULT_CONFIG's statusList directly (Fix 4, code review
// 2026-09-16) — status set, statusNote blank, no unrelated-note filter or
// status-unmatched flag involved at all.
(function () {
  var group = { stt: '1', po: '26050', customer: 'Yamato', lines: [line({ trangThai: 'done' })] };
  var mapped = env.mapLegacyOrderGroup_(group, DEFAULT_CONFIG);
  eq('"done" matches: status set to "done"', mapped.lineFields[0].status, 'done');
  eq('"done" matches: statusNote blank', mapped.lineFields[0].statusNote, '');
  eq('"done" line has no filtered-unrelated-note flag',
    mapped.reviewFlags.filter(function (f) { return f.type === 'filtered-unrelated-note'; }).length, 0);
})();

// 7c-2. Regression coverage for a Config sheet that predates Fix 4 (the
// 'done' entry has not been added yet, see runbook.md's pre-flight step):
// "done" must still survive into statusNote (not be swallowed by the
// unrelated-note filter) despite matching none of the deposit/supplier
// keywords — this is exactly the case LegacyImportMapDeposit.gs's 'done'
// keyword guard exists for.
(function () {
  var noDoneConfig = {
    statusList: DEFAULT_STATUS_LIST.filter(function (s) { return s.key !== 'done'; }),
    uomList: DEFAULT_UOM_LIST, vatRates: [0.08, 0.1]
  };
  var group = { stt: '1', po: '26051', customer: 'Yamato', lines: [line({ trangThai: 'done' })] };
  var mapped = env.mapLegacyOrderGroup_(group, noDoneConfig);
  eq('"done" preserved in statusNote when unmatched, not filtered',
    mapped.lineFields[0].statusNote, 'done');
  eq('unmatched "done" line has no filtered-unrelated-note flag',
    mapped.reviewFlags.filter(function (f) { return f.type === 'filtered-unrelated-note'; }).length, 0);
})();

// 7d. Multi-line order: deposit/supplier extraction only attempted on the
// FIRST line; a deposit-shaped note on a LATER line is preserved verbatim
// in that line's statusNote but does NOT populate order-level fields.
(function () {
  var group = {
    stt: '1', po: '26010', customer: 'Duy Tân',
    lines: [
      line({ rowNumber: 10, trangThai: 'done' }),
      line({ rowNumber: 11, trangThai: 'Khách đã cọc 5,000,000đ' })
    ]
  };
  var mapped = env.mapLegacyOrderGroup_(group, DEFAULT_CONFIG);
  eq('order-level customerDeposit stays null: deposit note was on line 2, not line 1',
    mapped.orderFields.customerDeposit, null);
  eq('line 2 statusNote keeps the raw deposit text untouched',
    mapped.lineFields[1].statusNote, 'Khách đã cọc 5,000,000đ');
  eq('no deposit-extraction-attempted flag for line 2 (only first line is eligible)',
    mapped.reviewFlags.filter(function (f) {
      return f.type === 'deposit-extraction-attempted' && f.lineIndex === 1;
    }).length, 0);
})();

// 7e. VAT fallback and UoM no-match flags surface through the composer.
(function () {
  var group = {
    stt: '1', po: '26020', customer: 'PCVN',
    lines: [line({ rowNumber: 20, thanhTien: '', triGiaHd: '', donGia: '', sl: '', dvt: 'Thùng' })]
  };
  var mapped = env.mapLegacyOrderGroup_(group, DEFAULT_CONFIG);
  eq('VAT fallback uses Config.vatRates[0] (0.08)', mapped.lineFields[0].vatRate, 0.08);
  check('vat-fallback review flag logged',
    mapped.reviewFlags.some(function (f) { return f.type === 'vat-fallback'; }), JSON.stringify(mapped.reviewFlags));
  check('uom-no-match review flag logged for "Thùng"',
    mapped.reviewFlags.some(function (f) { return f.type === 'uom-no-match' && f.rawUom === 'Thùng'; }),
    JSON.stringify(mapped.reviewFlags));
})();

// 7f. Controlled status matches produce no review flag at all for that line.
(function () {
  var group = { stt: '1', po: '26030', customer: 'THP', lines: [line({ trangThai: 'hàng về' })] };
  var mapped = env.mapLegacyOrderGroup_(group, DEFAULT_CONFIG);
  eq('matched status: status set, statusNote blank', mapped.lineFields[0].status, 'stock_arrived');
  eq('matched status: no status-unmatched / filtered flags',
    mapped.reviewFlags.filter(function (f) {
      return f.type === 'status-unmatched' || f.type === 'filtered-unrelated-note';
    }).length, 0);
})();

// 7g. invoiceRefs: distinct invoice numbers across an order's lines are
// deduplicated.
(function () {
  var group = {
    stt: '1', po: '26040', customer: 'Yamato',
    lines: [
      line({ rowNumber: 40, hoaDonRa: '98', ngayHd: '01/01/2026' }),
      line({ rowNumber: 41, hoaDonRa: '98', ngayHd: '01/01/2026' }),
      line({ rowNumber: 42, hoaDonRa: '99', ngayHd: '02/01/2026' }),
      line({ rowNumber: 43, hoaDonRa: '' })
    ]
  };
  var mapped = env.mapLegacyOrderGroup_(group, DEFAULT_CONFIG);
  eq('invoiceRefs deduplicated to 2 distinct invoice numbers',
    mapped.invoiceRefs, [{ invoiceNo: '98', invoiceDate: '01/01/2026' }, { invoiceNo: '99', invoiceDate: '02/01/2026' }]);
})();

// 7h. No uncaught exceptions on a maximally messy/blank line (Success
// Criteria: "a messy/unexpected row degrades to a review flag, never a
// crash").
(function () {
  var group = { stt: '1', po: '', customer: '', lines: [line({
    chiTiet: '', donGia: '', sl: '', dvt: '', thanhTien: '', triGiaHd: '',
    hoaDonRa: '', ngayHd: '', trangThai: ''
  })] };
  var mapped;
  var threw = false;
  try { mapped = env.mapLegacyOrderGroup_(group, DEFAULT_CONFIG); } catch (err) { threw = true; }
  check('fully blank line does not throw', !threw);
  eq('fully blank line: no status-related flags (blank status is not "unmatched")',
    mapped.reviewFlags.filter(function (f) {
      return f.type === 'status-unmatched' || f.type === 'filtered-unrelated-note';
    }).length, 0);
})();

H.done();
