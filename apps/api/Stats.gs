/**
 * Stats.gs — Milestone 4 / 4.6.1: revenue by time period.
 *
 * Aggregates the SAME per-line ex-VAT/inc-VAT figures Export.gs's
 * bucketOrdersForExport_ already groups for XLSX/PDF/CSV, but for
 * statistics: summed totals per period bucket, not full row/grid data for
 * display. Deliberately a separate, leaner aggregation path rather than
 * reusing bucketOrdersForExport_ directly — that function builds full
 * {order, lines} groups sized for writing spreadsheet rows; statistics
 * only ever needs { exVat, incVat, lineCount } sums per bucket, so
 * building the heavier structure just to throw away the row/cell shape
 * would be wasted work on a screen likely to be re-run more often (chart
 * filters) than an export.
 *
 * Reused from Export.gs: monthKey_/monthLabel_/parseDate_ (date parsing/
 * month-bucketing — the week/quarter/year granularities below generalize
 * that same idea, not reimplement date handling from scratch),
 * invoiceIndex_/linesForOrder_ (Orders.gs), and the shared filter
 * machinery (computeOrderFilters_/filteredOrderRowsForUser_) so a stats
 * request is scoped/permission-gated by the exact same rules as the order
 * list and every export action — not a parallel, easier-to-drift set of
 * checks.
 *
 * 4.6.2 (revenue by customer/by status) is a different aggregation axis
 * — grouping by a field, not by date — and lives in its own functions
 * later in this file, added by that task.
 */

/** Basis default for statistics is INVOICE DATE, unlike export's
 *  order-date default — Q2 (OPEN_QUESTIONS.md) settled this explicitly:
 *  "Default is invoice date, because that is what the invoice numbers in
 *  the file imply." Reuses Export.gs's EXPORT_BASIS_ORDER_DATE/
 *  EXPORT_BASIS_INVOICE_DATE constants — one basis vocabulary for the
 *  whole app, not a second one just for stats. */
function statsBasis_(payload) {
  var raw = payload && payload.basis;
  return raw === EXPORT_BASIS_ORDER_DATE ? EXPORT_BASIS_ORDER_DATE : EXPORT_BASIS_INVOICE_DATE;
}

/** Period granularities statsRevenue_ can bucket by. */
var STATS_PERIOD_WEEK = 'week';
var STATS_PERIOD_MONTH = 'month';
var STATS_PERIOD_QUARTER = 'quarter';
var STATS_PERIOD_YEAR = 'year';

function statsPeriod_(payload) {
  var raw = payload && payload.period;
  if (raw === STATS_PERIOD_WEEK || raw === STATS_PERIOD_QUARTER || raw === STATS_PERIOD_YEAR) return raw;
  return STATS_PERIOD_MONTH; // default — matches the reference file's own month-basis reporting
}

/**
 * Action entry point (Router.gs registers this as `statsRevenue`).
 *
 * @param {Object} payload {basis, period, dateFrom, dateTo, month,
 *   customer, status, createdBy, approveStatus, q} — dateFrom/dateTo/month
 *   etc. are the SAME order-date pre-filter shape computeOrderFilters_
 *   already accepts (narrows which orders are even considered, on their
 *   ORDER date, regardless of which date `basis` buckets by — same as
 *   Export.gs's own filter+basis split).
 * @return {{basis:string, period:string, buckets:Array<{bucketKey:string,
 *   label:string, exVat:number, incVat:number, lineCount:number}>,
 *   noInvoice:?{exVat:number, incVat:number, lineCount:number}}}
 *   `noInvoice` is only present for invoice-date basis (Q2: "orders with
 *   no invoice yet are excluded from the invoice-date view and shown as a
 *   separate 'chưa xuất hoá đơn' figure") — always null for order-date
 *   basis, where every line has a home bucket by definition.
 */
function actionStatsRevenue_(user, payload) {
  requirePermission_(user, 'view_statistics');
  var basis = statsBasis_(payload);
  var period = statsPeriod_(payload);
  var config = readPublicConfig_();
  var filters = computeOrderFilters_(user, payload, config);
  var rows = filteredOrderRowsForUser_(user, filters);
  return statsRevenue_(rows, basis, period);
}

/**
 * Core aggregation, split out from the action so 4.6.2 and offline tests
 * can call it directly with an already-filtered row set, same split
 * exportBucketsForRequest_/bucketOrdersForExport_ use in Export.gs.
 */
function statsRevenue_(rows, basis, period) {
  var agg = statsAggregateByLine_(rows, basis, function (order, invDate) {
    if (basis === EXPORT_BASIS_ORDER_DATE) {
      var d = parseDate_(order.orderDate);
      return d ? statsPeriodKey_(d, period) : '(không rõ ngày)';
    }
    return statsPeriodKey_(invDate, period); // invDate is always real here — see statsAggregateByLine_
  });

  var keys = Object.keys(agg.buckets).sort();
  var out = keys.map(function (key) {
    var b = agg.buckets[key];
    return { bucketKey: key, label: statsPeriodLabel_(key, period), exVat: b.exVat, incVat: b.incVat, lineCount: b.lineCount };
  });

  return { basis: basis, period: period, buckets: out, noInvoice: agg.noInvoice };
}

/**
 * Shared per-line walk underlying every stats aggregation (by period —
 * statsRevenue_ above — and by customer/by status — 4.6.2, below): visits
 * every line of every filtered order exactly once, decides which bucket
 * it belongs to, and sums exVat/incVat/lineCount into that bucket. This
 * is the ONE place the basis/noInvoice split (Q2: order-date basis keys
 * by the ORDER's date and never has an noInvoice bucket; invoice-date
 * basis keys each LINE by its own invoice's date UNLESS it has none, in
 * which case it goes to noInvoice instead) is implemented —
 * statsRevenue_ and the by-customer/by-status aggregators below all get
 * that behavior for free, correctly, by calling this instead of
 * re-deriving it.
 *
 * @param {Object[]} rows filtered order-level rows.
 * @param {string} basis EXPORT_BASIS_ORDER_DATE or EXPORT_BASIS_INVOICE_DATE.
 * @param {function(Object, ?Date):string} keyFn called once per LINE to
 *   decide its bucket key. Receives the line's own order, and — for
 *   invoice-date basis only, when the line resolved to a real invoice
 *   date — that Date; null for order-date basis (the order's own date is
 *   what matters there, not any invoice). statsRevenue_ ignores `order`
 *   and keys off the date/period; statsByField_ (4.6.2) ignores the date
 *   and keys off a field on `order` (customer/status) — same walk, two
 *   different projections of (order, invDate) -> key.
 * @return {{buckets: Object<string,{exVat:number,incVat:number,
 *   lineCount:number}>, noInvoice: ?{exVat:number,incVat:number,
 *   lineCount:number}}} noInvoice is null for order-date basis (nothing
 *   is ever excluded there — see file/Q2 doc comments), populated (even
 *   if all-zero) for invoice-date basis.
 */
function statsAggregateByLine_(rows, basis, keyFn) {
  var buckets = {};
  var noInvoice = null;

  function addTo(key, line) {
    if (!buckets[key]) buckets[key] = { exVat: 0, incVat: 0, lineCount: 0 };
    buckets[key].exVat += num_(line.amountExVat);
    buckets[key].incVat += num_(line.amountIncVat);
    buckets[key].lineCount += 1;
  }
  function addToNoInvoice(line) {
    noInvoice.exVat += num_(line.amountExVat);
    noInvoice.incVat += num_(line.amountIncVat);
    noInvoice.lineCount += 1;
  }

  if (basis === EXPORT_BASIS_ORDER_DATE) {
    rows.forEach(function (order) {
      var key = keyFn(order, null);
      linesForOrder_(order.orderId).forEach(function (line) { addTo(key, line); });
    });
  } else {
    var invoices = invoiceIndex_();
    noInvoice = { exVat: 0, incVat: 0, lineCount: 0 };
    rows.forEach(function (order) {
      linesForOrder_(order.orderId).forEach(function (line) {
        var invoice = line.invoiceId ? invoices[String(line.invoiceId)] : null;
        var invDate = invoice ? parseDate_(invoice.invoiceDate) : null;
        if (!invDate) { addToNoInvoice(line); return; }
        addTo(keyFn(order, invDate), line);
      });
    });
  }

  return { buckets: buckets, noInvoice: noInvoice };
}

/**
 * Turns a real Date into a period bucket key for the requested
 * granularity. Generalizes monthKey_ (Export.gs) rather than
 * reimplementing month bucketing separately here — month/year both defer
 * to it directly.
 */
function statsPeriodKey_(d, period) {
  if (period === STATS_PERIOD_YEAR) return String(d.getFullYear());
  if (period === STATS_PERIOD_QUARTER) return d.getFullYear() + '-Q' + (Math.floor(d.getMonth() / 3) + 1);
  if (period === STATS_PERIOD_WEEK) return statsIsoWeekKey_(d);
  return monthKey_(d); // STATS_PERIOD_MONTH — same key shape export already uses
}

/** ISO-8601 week key: 'YYYY-Www', week 1 is the week containing the
 *  year's first Thursday (equivalently, containing Jan 4th) — the same
 *  definition Google Sheets' own WEEKNUM(date, 21) and most Vietnamese
 *  business reporting use, so a "tuần" bucket here lines up with what
 *  Phong would get computing it by hand in Sheets. Computed by shifting
 *  to the Thursday of the same ISO week (standard ISO-week algorithm),
 *  which also makes the year label the ISO week-year, not the calendar
 *  year on the original date (matters only in the last days of December
 *  / first days of January, where the two occasionally differ). */
function statsIsoWeekKey_(d) {
  var date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var day = (date.getDay() + 6) % 7; // Mon=0 .. Sun=6
  date.setDate(date.getDate() - day + 3); // Thursday of this ISO week
  var isoYear = date.getFullYear();
  var jan4 = new Date(isoYear, 0, 4);
  var jan4Day = (jan4.getDay() + 6) % 7;
  var week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - jan4Day);
  var weekNum = Math.round((date.getTime() - week1Monday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return isoYear + '-W' + pad_(weekNum, 2);
}

/** Vietnamese label per period granularity, mirroring monthLabel_'s
 *  "THÁNG N" convention for the other three. */
function statsPeriodLabel_(key, period) {
  if (period === STATS_PERIOD_YEAR) return 'NĂM ' + key;
  if (period === STATS_PERIOD_QUARTER) {
    var qm = /^(\d{4})-Q(\d)$/.exec(key);
    return qm ? 'QUÝ ' + qm[2] + '/' + qm[1] : key;
  }
  if (period === STATS_PERIOD_WEEK) {
    var wm = /^(\d{4})-W(\d{2})$/.exec(key);
    return wm ? 'TUẦN ' + parseInt(wm[2], 10) + '/' + wm[1] : key;
  }
  return monthLabel_(key); // month
}

/* =======================================================================
   Milestone 4 / 4.6.2 — revenue by customer, revenue by status
   ======================================================================= */

/**
 * Action entry point (Router.gs registers this as `statsByCustomer`).
 * Same basis/noInvoice semantics as actionStatsRevenue_ (Q2) — see
 * statsAggregateByLine_'s doc comment — just grouped by `order.customer`
 * instead of by date period. Gated additionally on fieldVisible_(user,
 * 'customer'): a role that can't see the customer column on an order
 * shouldn't get a customer breakdown either — same principle
 * computeOrderFilters_ already applies to the customer FILTER, extended
 * here to the customer GROUPING.
 *
 * @return {{basis:string, groups:Array<{key:string, label:string,
 *   exVat:number, incVat:number, lineCount:number}>, noInvoice:?Object}}
 *   groups sorted by incVat descending — a revenue breakdown reads
 *   top-to-bottom as "biggest customer first", not alphabetically.
 */
function actionStatsByCustomer_(user, payload) {
  requirePermission_(user, 'view_statistics');
  if (!fieldVisible_(user, 'customer')) throw new Error(MSG.NO_PERMISSION);
  var basis = statsBasis_(payload);
  var config = readPublicConfig_();
  var filters = computeOrderFilters_(user, payload, config);
  var rows = filteredOrderRowsForUser_(user, filters);
  return statsByField_(rows, basis, function (order) {
    return String(order.customer || '').trim() || '(không rõ khách hàng)';
  });
}

/**
 * Action entry point (Router.gs registers this as `statsByStatus`). Same
 * shape/reasoning as actionStatsByCustomer_, grouped by `order.status`
 * instead, with the group label resolved through the SAME statusLabelIndex_
 * Export.gs already uses — one Vietnamese label per status key, not a
 * second copy of the status list's labels drifting from Config.statusList.
 */
function actionStatsByStatus_(user, payload) {
  requirePermission_(user, 'view_statistics');
  if (!fieldVisible_(user, 'status')) throw new Error(MSG.NO_PERMISSION);
  var basis = statsBasis_(payload);
  var config = readPublicConfig_();
  var filters = computeOrderFilters_(user, payload, config);
  var rows = filteredOrderRowsForUser_(user, filters);
  var statusLabels = statusLabelIndex_(config);
  var result = statsByField_(rows, basis, function (order) { return String(order.status || ''); });
  result.groups.forEach(function (g) { g.label = statusLabelText_(statusLabels, g.key); });
  return result;
}

/**
 * Shared by both actions above: groups filtered rows by whatever
 * `keyFn(order)` returns, using statsAggregateByLine_ for the actual
 * exVat/incVat/lineCount summing (and its basis/noInvoice handling) —
 * this function only adds the "group by a field, not by date" part on
 * top, plus sorting groups by revenue (biggest first) rather than by
 * bucket key the way the time-period view sorts chronologically.
 *
 * `label` defaults to the same string as `key` here; actionStatsByStatus_
 * overwrites it afterward with the real Vietnamese status label — kept
 * that way (rather than passing a labelFn into this shared function too)
 * since customer needs no such translation and threading an identity
 * labelFn through just for symmetry would be needless indirection.
 */
function statsByField_(rows, basis, fieldKeyFn) {
  // Group by the ORDER's field (customer/status) regardless of basis —
  // statsAggregateByLine_'s keyFn receives (order, invDate); this ignores
  // invDate entirely (it only ever matters for deciding bucket-vs-
  // noInvoice, which statsAggregateByLine_ already handles before calling
  // keyFn at all) and keys purely off the order.
  var agg = statsAggregateByLine_(rows, basis, function (order) { return fieldKeyFn(order); });

  var keys = Object.keys(agg.buckets);
  var out = keys.map(function (key) {
    var b = agg.buckets[key];
    return { key: key, label: key, exVat: b.exVat, incVat: b.incVat, lineCount: b.lineCount };
  });
  // Biggest customer/status first — a revenue breakdown reads top-to-
  // bottom as "who/what contributes most", not alphabetically or by
  // insertion order.
  out.sort(function (a, b) { return b.incVat - a.incVat; });

  return { basis: basis, groups: out, noInvoice: agg.noInvoice };
}
