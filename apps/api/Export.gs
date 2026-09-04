/**
 * Export.gs — Milestone 4 / 4.1: CSV export of the currently-filtered order
 * list.
 *
 * Layout mirrors the reference report (docs/EXCEL_REFERENCE.md §1/§2/§3/§7):
 * grouped by month (order date — the invoice-date toggle is 4.2), one row
 * group per order (STT/PO on the first line only, customer repeated per
 * line), a "DOANH SỐ THÁNG n" revenue total row per month. A line with no
 * invoice yet is shown as-is with blank invoice columns — nothing hidden or
 * specially marked, matching how the reference file itself has always
 * represented an unbilled line (Phong's answer, 2026-09-03, order-date
 * basis specifically).
 *
 * Same filters as the order list (actionListOrders_), reusing
 * computeOrderFilters_/filteredOrderRowsForUser_ (Orders.gs) so this can
 * never drift from the list's own security-reviewed filter gating — every
 * fix 3.3/3.4 made for the list (a filter/search value gated on
 * fieldVisible_, createdBy gated on canSeeAllOrders_, etc.) applies here
 * automatically, not by remembering to copy it.
 *
 * CSV only in this task — no temp Sheet, no async job. XLSX/PDF (4.3/4.4)
 * and the large/async path (4.5) build on top of this file, not this
 * function; this one stays small on purpose so it can be the sanity-check
 * that the shared filter/grouping/permission plumbing is right before the
 * heavier formats are layered on.
 */

/**
 * @param {Object} payload same filter shape as listOrders's payload
 *   (month/dateFrom/dateTo, customer, status, createdBy, approveStatus, q).
 * @return {{filename:string, mimeType:string, csv:string}}
 */
function actionExportOrdersCsv_(user, payload) {
  requirePermission_(user, 'export');

  var config = readPublicConfig_();
  var filters = computeOrderFilters_(user, payload, config);
  var rows = filteredOrderRowsForUser_(user, filters);

  var groups = groupOrdersByMonth_(rows);
  var csv = buildExportCsv_(user, groups);

  return {
    filename: exportFilename_('orders', 'csv'),
    mimeType: 'text/csv',
    // BOM so Excel on Windows reads the Vietnamese diacritics as UTF-8
    // instead of guessing a legacy codepage and mangling them.
    csv: '﻿' + csv
  };
}

/**
 * Groups the (already filtered, already newest-first) order rows by
 * `orderDate`'s YYYY-MM, and within each month sorts OLDEST first — the
 * reference file reads top-to-bottom as the month progresses, opposite of
 * the app's own "newest first" list convention, so this is a deliberate
 * re-sort for export, not a reuse of filteredOrderRowsForUser_'s order.
 *
 * @return {Array<{monthKey:string, label:string, orders:Object[]}>} sorted
 *   oldest month first, matching "THÁNG 1" ... "THÁNG n" reading order.
 */
function groupOrdersByMonth_(rows) {
  var byMonth = {};
  rows.forEach(function (row) {
    var d = parseDate_(row.orderDate);
    var key = d ? (d.getFullYear() + '-' + pad_(d.getMonth() + 1, 2)) : '(không rõ ngày)';
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(row);
  });

  var keys = Object.keys(byMonth).sort();
  return keys.map(function (key) {
    var orders = byMonth[key].slice().sort(function (a, b) {
      var da = parseDate_(a.orderDate), db = parseDate_(b.orderDate);
      var ta = da ? da.getTime() : 0, tb = db ? db.getTime() : 0;
      if (ta !== tb) return ta - tb;
      return String(a.orderId).localeCompare(String(b.orderId));
    });
    var monthNum = /^\d{4}-(\d{2})$/.exec(key);
    var label = monthNum ? 'THÁNG ' + parseInt(monthNum[1], 10) : key;
    return { monthKey: key, label: label, orders: orders };
  });
}

/** CSV field columns, in reference-file order (EXCEL_REFERENCE.md §2). */
var EXPORT_CSV_HEADER = [
  'STT', 'PO', 'KHÁCH HÀNG', 'CHI TIẾT',
  'ĐƠN GIÁ BÁN RA VND', 'SL', 'ĐVT',
  'THÀNH TIỀN VND - CHƯA VAT', 'TRỊ GIÁ HĐ',
  'HÓA ĐƠN RA', 'NGÀY HĐ', 'TRẠNG THÁI'
];

function buildExportCsv_(user, groups) {
  var lines = [EXPORT_CSV_HEADER.map(csvCell_).join(',')];
  // Read once, not once per order — readAll_ memoizes the sheet for the
  // request either way, but rebuilding the {invoiceId: row} index inside
  // the order loop was pure waste.
  var invoices = invoiceIndex_();
  var showMoney = seesMoney_(user);

  groups.forEach(function (group) {
    lines.push(csvCell_(group.label));

    var stt = 1;
    var monthExVat = 0, monthIncVat = 0;

    group.orders.forEach(function (order) {
      var view = filterVisibleFields_(user, order);
      var orderLines = linesForOrder_(order.orderId)
        .sort(function (a, b) { return num_(a.lineNo) - num_(b.lineNo); });

      if (!orderLines.length) orderLines = [null]; // an order with zero lines still gets one row

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

        // Month total only counts money this user is actually allowed to
        // see — a price-blind role must not learn the revenue total either
        // (that would leak exactly the numbers seesMoney_ hides per line).
        if (line && showMoney) {
          monthExVat += num_(line.amountExVat);
          monthIncVat += num_(line.amountIncVat);
        }
      });

      if (first_(orderLines)) stt++;
    });

    lines.push([
      '', '', '', '', '', '', '',
      'DOANH SỐ ' + group.label,
      showMoney ? (formatExportMoney_(monthExVat) + ' / ' + formatExportMoney_(monthIncVat)) : '',
      '', '', ''
    ].map(csvCell_).join(','));
  });

  return lines.join('\r\n');
}

function first_(arr) { return arr.length > 0; }

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
