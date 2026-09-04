/**
 * Export.gs — Milestone 4: CSV export of the currently-filtered order list.
 *
 * Layout mirrors the reference report (docs/EXCEL_REFERENCE.md §1/§2/§3/§7):
 * grouped by month, one row group per order (STT/PO on the first line only,
 * customer repeated per line), a "DOANH SỐ THÁNG n" revenue total row per
 * month. A line with no invoice yet is shown as-is with blank invoice
 * columns — nothing hidden or specially marked, matching how the reference
 * file itself has always represented an unbilled line (Phong's answer,
 * 2026-09-03).
 *
 * Same filters as the order list (actionListOrders_), reusing
 * computeOrderFilters_/filteredOrderRowsForUser_ (Orders.gs) so this can
 * never drift from the list's own security-reviewed filter gating — every
 * fix 3.3/3.4 made for the list (a filter/search value gated on
 * fieldVisible_, createdBy gated on canSeeAllOrders_, etc.) applies here
 * automatically, not by remembering to copy it.
 *
 * Milestone 4 / 4.2 — month-basis toggle (`payload.basis`):
 *   - 'orderDate' (default, matches the reference file): one bucket per
 *     order's own orderDate month. An order's lines all land in the same
 *     bucket regardless of invoice date/absence — this is the historical
 *     4.1 behavior, unchanged.
 *   - 'invoiceDate': bucketed per LINE (invoiceId lives on OrderLines, not
 *     Orders — DATA_MODEL.md §4 — one order can have lines invoiced on
 *     different dates, or not at all), sub-grouped by order within each
 *     month bucket. A single order can legitimately appear in more than one
 *     month bucket if its lines were invoiced in different months. Lines
 *     with no invoice yet go into a dedicated "(Chưa xuất hóa đơn)" bucket,
 *     also sub-grouped by order, rather than being spread across months or
 *     silently dropped (Phong's answer, 2026-09-03).
 * bucketOrdersForExport_() is the ONE place this grouping decision is made
 * — shared with statistics (4.6) so the two never disagree about how a
 * split order's revenue is attributed to a month.
 *
 * CSV only in this task — no temp Sheet, no async job. XLSX/PDF (4.3/4.4)
 * and the large/async path (4.5) build on top of this file, not this
 * function; this one stays small on purpose so it can be the sanity-check
 * that the shared filter/grouping/permission plumbing is right before the
 * heavier formats are layered on.
 */

var EXPORT_BASIS_ORDER_DATE = 'orderDate';
var EXPORT_BASIS_INVOICE_DATE = 'invoiceDate';
var EXPORT_NO_INVOICE_KEY = '(no-invoice)';
var EXPORT_NO_INVOICE_LABEL = 'CHƯA XUẤT HÓA ĐƠN';

/**
 * @param {Object} payload same filter shape as listOrders's payload
 *   (month/dateFrom/dateTo, customer, status, createdBy, approveStatus, q),
 *   plus `basis`: 'orderDate' (default) or 'invoiceDate'.
 * @return {{filename:string, mimeType:string, csv:string}}
 */
function actionExportOrdersCsv_(user, payload) {
  requirePermission_(user, 'export');

  var basis = exportBasis_(payload);
  var config = readPublicConfig_();
  var filters = computeOrderFilters_(user, payload, config);
  var rows = filteredOrderRowsForUser_(user, filters);

  var buckets = bucketOrdersForExport_(rows, basis);
  var csv = buildExportCsv_(user, buckets);

  return {
    filename: exportFilename_('orders', 'csv'),
    mimeType: 'text/csv',
    // BOM so Excel on Windows reads the Vietnamese diacritics as UTF-8
    // instead of guessing a legacy codepage and mangling them.
    csv: '﻿' + csv
  };
}

/** Validates payload.basis, defaulting to order-date (matches the reference
 *  file) for anything missing/unrecognized rather than erroring — a stray
 *  or stale client value should degrade to the safe default, not break the
 *  export. */
function exportBasis_(payload) {
  var raw = payload && payload.basis;
  return raw === EXPORT_BASIS_INVOICE_DATE ? EXPORT_BASIS_INVOICE_DATE : EXPORT_BASIS_ORDER_DATE;
}

/**
 * Shared bucketing for export (4.1/4.2) and statistics (4.6) — the ONE
 * place that decides which month bucket a line's revenue belongs to.
 *
 * @param {Object[]} rows filtered, order-level rows (as from
 *   filteredOrderRowsForUser_).
 * @param {string} basis EXPORT_BASIS_ORDER_DATE or EXPORT_BASIS_INVOICE_DATE.
 * @return {Array<{bucketKey:string, label:string,
 *   orderGroups: Array<{order:Object, lines:Object[]}>}>} sorted for
 *   reading top-to-bottom: real months oldest-first, with a trailing
 *   "no invoice" bucket last when basis is invoiceDate (there's no month to
 *   sort it against, and it reads better as a final catch-all than
 *   interleaved with real months).
 */
function bucketOrdersForExport_(rows, basis) {
  if (basis === EXPORT_BASIS_INVOICE_DATE) return bucketByInvoiceDate_(rows);
  return bucketByOrderDate_(rows);
}

/** order-date basis: one bucket per order's orderDate month; every line of
 *  an order stays together regardless of invoice date/absence — this is
 *  the original 4.1 behavior. */
function bucketByOrderDate_(rows) {
  var byMonth = {};
  rows.forEach(function (row) {
    var d = parseDate_(row.orderDate);
    var key = d ? monthKey_(d) : '(không rõ ngày)';
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(row);
  });

  var keys = Object.keys(byMonth).sort();
  return keys.map(function (key) {
    var orders = byMonth[key].slice().sort(compareByOrderDateThenId_);
    return {
      bucketKey: key,
      label: monthLabel_(key),
      orderGroups: orders.map(function (order) {
        return { order: order, lines: linesForOrder_(order.orderId)
          .sort(function (a, b) { return num_(a.lineNo) - num_(b.lineNo); }) };
      })
    };
  });
}

/** invoice-date basis: per-LINE bucketing by the line's own invoice date
 *  (falling back to the "no invoice" bucket when the line has no
 *  invoiceId, or its invoiceId doesn't resolve to an invoice with a date),
 *  sub-grouped by order within each bucket. An order whose lines were
 *  invoiced in different months legitimately contributes an orderGroup to
 *  more than one bucket — this is the whole point of per-line bucketing
 *  (DATA_MODEL.md §4). */
function bucketByInvoiceDate_(rows) {
  var invoices = invoiceIndex_();
  // bucketKey -> orderId -> { order, lines: [] }, built incrementally so an
  // order's lines that land in the same bucket stay in one orderGroup.
  var buckets = {};

  rows.forEach(function (order) {
    var orderLines = linesForOrder_(order.orderId)
      .sort(function (a, b) { return num_(a.lineNo) - num_(b.lineNo); });
    if (!orderLines.length) orderLines = [null]; // zero-line order still gets a row, in the "no invoice" bucket

    orderLines.forEach(function (line) {
      var invoice = (line && line.invoiceId) ? invoices[String(line.invoiceId)] : null;
      var invDate = invoice ? parseDate_(invoice.invoiceDate) : null;
      var key = invDate ? monthKey_(invDate) : EXPORT_NO_INVOICE_KEY;

      if (!buckets[key]) buckets[key] = {};
      if (!buckets[key][order.orderId]) buckets[key][order.orderId] = { order: order, lines: [] };
      buckets[key][order.orderId].lines.push(line);
    });
  });

  var monthKeys = Object.keys(buckets).filter(function (k) { return k !== EXPORT_NO_INVOICE_KEY; }).sort();
  var out = monthKeys.map(function (key) { return bucketEntry_(key, monthLabel_(key), buckets[key]); });
  if (buckets[EXPORT_NO_INVOICE_KEY]) {
    out.push(bucketEntry_(EXPORT_NO_INVOICE_KEY, EXPORT_NO_INVOICE_LABEL, buckets[EXPORT_NO_INVOICE_KEY]));
  }
  return out;
}

/** Turns a {orderId: {order, lines}} map into a sorted orderGroups array —
 *  same order-then-id sort as order-date basis, so the two bases read the
 *  same way within a bucket. */
function bucketEntry_(key, label, orderMap) {
  var orderGroups = Object.keys(orderMap).map(function (id) { return orderMap[id]; });
  orderGroups.sort(function (a, b) { return compareByOrderDateThenId_(a.order, b.order); });
  return { bucketKey: key, label: label, orderGroups: orderGroups };
}

function compareByOrderDateThenId_(a, b) {
  var da = parseDate_(a.orderDate), db = parseDate_(b.orderDate);
  var ta = da ? da.getTime() : 0, tb = db ? db.getTime() : 0;
  if (ta !== tb) return ta - tb;
  return String(a.orderId).localeCompare(String(b.orderId));
}

function monthKey_(d) { return d.getFullYear() + '-' + pad_(d.getMonth() + 1, 2); }

function monthLabel_(key) {
  var m = /^\d{4}-(\d{2})$/.exec(key);
  return m ? 'THÁNG ' + parseInt(m[1], 10) : key;
}

/** CSV field columns, in reference-file order (EXCEL_REFERENCE.md §2). */
var EXPORT_CSV_HEADER = [
  'STT', 'PO', 'KHÁCH HÀNG', 'CHI TIẾT',
  'ĐƠN GIÁ BÁN RA VND', 'SL', 'ĐVT',
  'THÀNH TIỀN VND - CHƯA VAT', 'TRỊ GIÁ HĐ',
  'HÓA ĐƠN RA', 'NGÀY HĐ', 'TRẠNG THÁI'
];

/**
 * @param {Array<{bucketKey:string, label:string,
 *   orderGroups: Array<{order:Object, lines:Object[]}>}>} buckets from
 *   bucketOrdersForExport_ — basis-agnostic by the time it gets here.
 */
function buildExportCsv_(user, buckets) {
  var lines = [EXPORT_CSV_HEADER.map(csvCell_).join(',')];
  // Read once, not once per order — readAll_ memoizes the sheet for the
  // request either way, but rebuilding the {invoiceId: row} index inside
  // the order loop was pure waste.
  var invoices = invoiceIndex_();
  var showMoney = seesMoney_(user);

  buckets.forEach(function (bucket) {
    lines.push(csvCell_(bucket.label));

    var stt = 1;
    var bucketExVat = 0, bucketIncVat = 0;

    bucket.orderGroups.forEach(function (group) {
      var order = group.order;
      var view = filterVisibleFields_(user, order);
      var orderLines = group.lines.length ? group.lines : [null];

      orderLines.forEach(function (line, i) {
        var first = i === 0;
        var invoice = (line && line.invoiceId) ? invoices[String(line.invoiceId)] : null;

        lines.push([
          first ? stt : '',
          first && fieldVisible_(user, 'po') ? (view.po || '') : '',
          fieldVisible_(user, 'customer') ? (view.customer || '') : '',
          line ? lineDescriptionText_(user, line) : '',
          line && showMoney ? line.unitPrice : '',
          line ? line.qty : '',
          line ? line.uom : '',
          line && showMoney ? line.amountExVat : '',
          line && showMoney ? line.amountIncVat : '',
          invoice ? invoice.invoiceNo : '',
          invoice ? formatExportDate_(invoice.invoiceDate) : '',
          first && fieldVisible_(user, 'status') ? (statusExportLabel_(user, view) || '') : ''
        ].map(csvCell_).join(','));

        // Bucket total only counts money this user is actually allowed to
        // see — a price-blind role must not learn the revenue total either
        // (that would leak exactly the numbers seesMoney_ hides per line).
        if (line && showMoney) {
          bucketExVat += num_(line.amountExVat);
          bucketIncVat += num_(line.amountIncVat);
        }
      });

      stt++;
    });

    lines.push([
      '', '', '', '', '', '', '',
      'DOANH SỐ ' + bucket.label,
      showMoney ? (formatExportMoney_(bucketExVat) + ' / ' + formatExportMoney_(bucketIncVat)) : '',
      '', '', ''
    ].map(csvCell_).join(','));
  });

  return lines.join('\r\n');
}

/** "productCode : description" — matches how the reference file's own CHI
 *  TIẾT column is written (EXCEL_REFERENCE.md §5). Blank productCode is
 *  common and fine — just the description alone then. */
function lineDescriptionText_(user, line) {
  if (!fieldVisible_(user, 'description')) return '';
  var code = text_(line.productCode);
  var desc = text_(line.description);
  return code ? (code + ' : ' + desc) : desc;
}

/** statusNote folded into the same cell as status, matching the reference
 *  file's own mixing of controlled status + free text (EXCEL_REFERENCE.md
 *  §6) — this export is meant to read the way that file already does. */
function statusExportLabel_(user, view) {
  var status = text_(view.status);
  var note = fieldVisible_(user, 'statusNote') ? text_(view.statusNote) : '';
  return note ? (status + ' — ' + note) : status;
}

function formatExportDate_(value) {
  var d = parseDate_(value);
  if (!d) return '';
  return pad_(d.getDate(), 2) + '/' + pad_(d.getMonth() + 1, 2) + '/' + d.getFullYear();
}

function formatExportMoney_(n) {
  return Math.round(num_(n)).toLocaleString('vi-VN');
}

/** One CSV cell: quoted, internal quotes doubled, matches RFC 4180. Numbers
 *  pass through unquoted (Excel treats a quoted "1000" as text, not a
 *  number, which breaks the reference file's expected right-aligned
 *  numeric columns). */
function csvCell_(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  var s = String(value);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function exportFilename_(base, ext) {
  var now = new Date();
  var stamp = now.getFullYear() + pad_(now.getMonth() + 1, 2) + pad_(now.getDate(), 2) +
    '-' + pad_(now.getHours(), 2) + pad_(now.getMinutes(), 2);
  return base + '-' + stamp + '.' + ext;
}
