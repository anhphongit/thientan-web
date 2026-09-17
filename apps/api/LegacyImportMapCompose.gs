/**
 * LegacyImportMapCompose.gs — Milestone 7 / Phase 2: `mapLegacyOrderGroup_`,
 * the composer that ties every per-field mapping rule (LegacyImportMap.gs)
 * plus the deposit/supplier extraction and unrelated-note filter
 * (LegacyImportMapDeposit.gs) into one order group's final
 * `{orderFields, lineFields[], invoiceRefs[]}` shape. Split into its own
 * file per the repo's 200-line modularization rule — LegacyImportMap.gs
 * already holds six field-level functions on its own.
 *
 * Pure data transformation only — NO writes to Orders/OrderLines/Invoices/
 * StatusHistory anywhere in this file (grep it: no appendRecord_/
 * updateRecord_ calls).
 */

/**
 * Maps every line of one parsed order group. Internal helper for
 * `mapLegacyOrderGroup_` below — `ctx` carries the shared config lookups
 * (`statusList`, `uomList`, `defaultVatRate`), the order's `customer` (every
 * line repeats it, EXCEL_REFERENCE.md §2), the in-progress `orderFields`
 * object (so a first-line deposit/supplier extraction can write straight
 * into it), and the shared `reviewFlags` array every heuristic hit is
 * logged into.
 */
function legacyMapOneLine_(line, idx, ctx) {
  var chiTiet = mapChiTietCell_(line.chiTiet);

  var vat = detectVatRate_(line.donGia, line.sl, line.thanhTien, line.triGiaHd);
  var vatRate = vat.wasFallback ? ctx.defaultVatRate : vat.vatRate;
  if (vat.wasFallback) {
    ctx.reviewFlags.push({
      type: 'vat-fallback', lineIndex: idx, rowNumber: line.rowNumber, vatRate: vatRate,
      detail: 'Could not derive VAT ratio from Thành tiền/Trị giá hđ; used Config default.'
    });
  }

  var uomMapped = mapUom_(line.dvt, ctx.uomList);
  if (!uomMapped.wasExactMatch && uomMapped.uom) {
    ctx.reviewFlags.push({
      type: 'uom-no-match', lineIndex: idx, rowNumber: line.rowNumber, rawUom: line.dvt,
      detail: 'ĐVT not found in Config.uomList; kept raw value.'
    });
  }

  var statusMapped = mapStatusCell_(line.trangThai, ctx.statusList);
  var statusNote = statusMapped.statusNote;
  if (!statusMapped.matched && statusNote) {
    statusNote = legacyResolveUnmatchedStatusNote_(statusNote, idx, line, ctx);
  }

  return {
    productCode: chiTiet.productCode,
    description: chiTiet.description,
    unitPrice: line.donGia,
    qty: line.sl,
    uom: uomMapped.uom,
    vatRate: vatRate,
    invoiceNo: String(line.hoaDonRa || '').trim(),
    invoiceDate: line.ngayHd,
    customer: ctx.customer,
    note: '',
    status: statusMapped.status,
    statusNote: statusNote
  };
}

/**
 * Composes every mapping rule into one order group's final shape. `config`
 * is the live public Config (`readPublicConfig_()` shape: `statusList`,
 * `uomList`, `vatRates`, ...) — passed in rather than read globally so this
 * stays a pure, testable function.
 *
 * `reviewFlags[]` collects every heuristic hit for this order (VAT
 * fallback, UoM no-match, status unmatched, deposit/supplier extraction
 * attempted, filtered-unrelated-note) — nothing here is a silent guess, per
 * the phase plan's Risk Assessment. `orderIndex` on `filtered-unrelated-note`
 * flags is left `null`: this function only sees one order at a time and has
 * no notion of its position among the parsed months/orders — the caller
 * (the dry-run report builder, Phase 1/3) should fill it in when flattening
 * reviewFlags across multiple orders.
 */
function mapLegacyOrderGroup_(group, config) {
  var cfg = config || {};
  var statusList = Array.isArray(cfg.statusList) ? cfg.statusList : [];
  var uomList = Array.isArray(cfg.uomList) ? cfg.uomList : [];
  var vatRates = Array.isArray(cfg.vatRates) && cfg.vatRates.length ? cfg.vatRates : [0.08];
  var defaultVatRate = vatRates[0];

  var reviewFlags = [];
  var poMapped = mapPoCell_(group.po);
  var customer = String(group.customer || '').trim();

  var orderFields = {
    po: poMapped.po,
    poNote: poMapped.poNote,
    customer: customer,
    customerDeposit: null,
    supplierName: '',
    supplierPaid: null
  };

  var rawLines = group.lines || [];
  var lineFields = rawLines.map(function (line, idx) {
    return legacyMapOneLine_(line, idx, {
      statusList: statusList, uomList: uomList, defaultVatRate: defaultVatRate,
      customer: customer, orderFields: orderFields, reviewFlags: reviewFlags
    });
  });

  var invoiceRefs = [];
  var seenInvoiceNos = {};
  rawLines.forEach(function (line) {
    var invoiceNo = String(line.hoaDonRa || '').trim();
    if (invoiceNo && !seenInvoiceNos[invoiceNo]) {
      seenInvoiceNos[invoiceNo] = true;
      invoiceRefs.push({ invoiceNo: invoiceNo, invoiceDate: line.ngayHd });
    }
  });

  return {
    orderFields: orderFields, lineFields: lineFields, invoiceRefs: invoiceRefs,
    reviewFlags: reviewFlags
  };
}
