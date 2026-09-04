/**
 * Stats.gs — Milestone 4 / 4.6.1: revenue by time period.
 *
 * 4.6.1/4.6.2 originally aggregated per ORDER LINE (summing amountExVat/
 * amountIncVat per line, bucketed either by the order's own date or by
 * each line's own resolved invoice date). Revised, 2026-09-04 ("stat by
 * order, not order line"): Phong wanted all three views (time-period,
 * by-customer, by-status) to count and sum ORDERS, using each order's own
 * pre-computed totalExVat/totalIncVat (Orders.gs already maintains these
 * on every create/update — see buildLineRecord_/sumLines_ callers), not
 * a per-line walk. Two consequences of that switch:
 *
 *   1. The order-date/invoice-date "Cơ sở tính" (basis) toggle is GONE.
 *      It only ever existed to decide which date a LINE's own bucket (or
 *      noInvoice split) used — with orders as the unit, a single order
 *      unavoidably has one order date, so there is nothing left for a
 *      second basis to mean. Every view now buckets/sorts by the order's
 *      own orderDate, unconditionally. (Historical note for anyone
 *      reading old code/docs: Q2 in OPEN_QUESTIONS.md, "stats default to
 *      invoice-date basis", is superseded by this revision.)
 *
 *   2. Invoicing is still recorded per LINE (invoiceId lives on
 *      OrderLines, not on Orders — see Orders.gs's buildLineRecord_/
 *      invoiceIndex_), so a single order CAN have some lines invoiced and
 *      others not. Phong's answer on how the new "include orders without
 *      invoice" toggle should treat that: when the toggle is OFF, such a
 *      mixed order is SPLIT — the invoiced-lines portion counts toward
 *      the stats (grouped/bucketed like any other order, using the
 *      ORDER's date, never an invoice date), and the uninvoiced-lines
 *      portion is added into one single global `noInvoice` total (not
 *      broken down by period/customer/status — same "one grand total"
 *      shape the noInvoice card already had). An order with ZERO
 *      invoiced lines counts entirely as noInvoice; an order with ALL
 *      lines invoiced counts entirely toward the stats, unsplit. When the
 *      toggle is ON (the default), every order counts in full toward the
 *      stats and noInvoice is always zero/empty — nothing is ever
 *      excluded.
 *
 * Every bucket/group (and noInvoice) now carries FOUR figures per Phong's
 * follow-up request: exVat, incVat, orderCount (new — the count of
 * distinct orders/order-portions contributing, since that's the stats
 * unit now) and lineCount (kept alongside it — how many order LINES
 * those orders/portions are made of, still useful context even though
 * lines are no longer what's being summed).
 *
 * Reused from Orders.gs: invoiceIndex_/linesForOrder_ (to resolve which
 * lines of a mixed order are invoiced), parseDate_/monthKey_/monthLabel_
 * (Export.gs, date bucketing), and the shared filter machinery
 * (computeOrderFilters_/filteredOrderRowsForUser_) so a stats request is
 * scoped/permission-gated by the exact same rules as the order list and
 * every export action.
 */

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

/** New global toggle (2026-09-04 revision), default ON ("include orders
 *  without invoice"). ON: every filtered order counts in full, noInvoice
 *  is always zero. OFF: only the invoiced portion of each order counts;
 *  the rest (a fully-unbilled order, or the unbilled lines of a mixed
 *  order) is summed into noInvoice instead — see statsAggregateByOrder_. */
function statsIncludeNoInvoice_(payload) {
  if (!payload || payload.includeNoInvoice === undefined || payload.includeNoInvoice === null) return true;
  return payload.includeNoInvoice !== false;
}

/**
 * Action entry point (Router.gs registers this as `statsRevenue`).
 *
 * @param {Object} payload {period, includeNoInvoice, dateFrom, dateTo,
 *   month, customer, status, createdBy, approveStatus, q} — the date/
 *   customer/etc. fields are the SAME order-date pre-filter shape
 *   computeOrderFilters_ already accepts (narrows which orders are even
 *   considered, same as Export.gs's own filter).
 * @return {{period:string, includeNoInvoice:boolean,
 *   buckets:Array<{bucketKey:string, label:string, exVat:number,
 *   incVat:number, orderCount:number, lineCount:number}>,
 *   noInvoice:{exVat:number, incVat:number, orderCount:number,
 *   lineCount:number}}} noInvoice is always present (zeroed when
 *   includeNoInvoice is true or nothing is unbilled).
 */
function actionStatsRevenue_(user, payload) {
  requirePermission_(user, 'view_statistics');
  var period = statsPeriod_(payload);
  var includeNoInvoice = statsIncludeNoInvoice_(payload);
  var config = readPublicConfig_();
  var filters = computeOrderFilters_(user, payload, config);
  var rows = filteredOrderRowsForUser_(user, filters);
  return statsRevenue_(rows, period, includeNoInvoice);
}

/**
 * Core aggregation, split out from the action so 4.6.2 and offline tests
 * can call it directly with an already-filtered row set, same split
 * exportBucketsForRequest_/bucketOrdersForExport_ use in Export.gs.
 */
function statsRevenue_(rows, period, includeNoInvoice) {
  var agg = statsAggregateByOrder_(rows, includeNoInvoice, function (order) {
    var d = parseDate_(order.orderDate);
    return d ? statsPeriodKey_(d, period) : '(không rõ ngày)';
  });

  var keys = Object.keys(agg.buckets).sort();
  var out = keys.map(function (key) {
    var b = agg.buckets[key];
    return { bucketKey: key, label: statsPeriodLabel_(key, period), exVat: b.exVat, incVat: b.incVat, orderCount: b.orderCount, lineCount: b.lineCount };
  });

  return { period: period, includeNoInvoice: includeNoInvoice, buckets: out, noInvoice: agg.noInvoice };
}

/**
 * Shared per-ORDER walk underlying every stats aggregation (by period —
 * statsRevenue_ above — and by customer/by status — 4.6.2, below).
 * Replaces the old statsAggregateByLine_: visits every filtered order
 * exactly once and decides how much of it counts toward the stats vs.
 * noInvoice, per the includeNoInvoice toggle (see file doc comment for
 * the full split-order rule), then sums exVat/incVat/orderCount/lineCount
 * into whichever bucket keyFn(order) resolves to (or into noInvoice).
 *
 * When includeNoInvoice is true, every order counts in full using its
 * own totalExVat/totalIncVat/lineCount — no need to even look at
 * individual lines or invoices, since nothing is ever split or excluded.
 *
 * When includeNoInvoice is false, each order's lines are partitioned
 * into invoiced/uninvoiced (via invoiceIndex_ + linesForOrder_) and
 * summed separately:
 *   - the invoiced portion (if any lines are invoiced) counts as ONE
 *     contribution to keyFn(order)'s bucket — one order/portion, using
 *     the ORDER's own date/field, never an invoice date;
 *   - the uninvoiced portion (if any lines are not invoiced) is summed
 *     into the single global noInvoice total instead;
 *   - a fully-invoiced order contributes only to its bucket (nothing to
 *     noInvoice); a fully-unbilled order contributes only to noInvoice
 *     (nothing to its bucket) — matching Phong's "could be separate as 2
 *     order" description for a genuinely mixed order, while a wholly
 *     one-sided order isn't artificially counted as two.
 *
 * @param {Object[]} rows filtered order-level rows.
 * @param {boolean} includeNoInvoice the toggle (default true).
 * @param {function(Object):string} keyFn called once per counted order/
 *   portion to decide its bucket key — statsRevenue_ keys by the order's
 *   date/period; statsByField_ (4.6.2) keys by a field on the order
 *   (customer/status). Always receives the real `order` row (never a
 *   line), since the bucket is always order-date/order-field now.
 * @return {{buckets: Object<string,{exVat:number,incVat:number,
 *   orderCount:number,lineCount:number}>, noInvoice:
 *   {exVat:number,incVat:number,orderCount:number,lineCount:number}}}
 */
function statsAggregateByOrder_(rows, includeNoInvoice, keyFn) {
  var buckets = {};
  var noInvoice = { exVat: 0, incVat: 0, orderCount: 0, lineCount: 0 };

  function addTo(key, exVat, incVat, orderCount, lineCount) {
    if (!buckets[key]) buckets[key] = { exVat: 0, incVat: 0, orderCount: 0, lineCount: 0 };
    buckets[key].exVat += exVat;
    buckets[key].incVat += incVat;
    buckets[key].orderCount += orderCount;
    buckets[key].lineCount += lineCount;
  }

  if (includeNoInvoice) {
    rows.forEach(function (order) {
      var key = keyFn(order);
      addTo(key, num_(order.totalExVat), num_(order.totalIncVat), 1, num_(order.lineCount));
    });
    return { buckets: buckets, noInvoice: noInvoice };
  }

  var invoices = invoiceIndex_();
  rows.forEach(function (order) {
    var lines = linesForOrder_(order.orderId);
    var billed = { exVat: 0, incVat: 0, count: 0 };
    var unbilled = { exVat: 0, incVat: 0, count: 0 };
    lines.forEach(function (line) {
      var invoice = line.invoiceId ? invoices[String(line.invoiceId)] : null;
      var target = invoice ? billed : unbilled;
      target.exVat += num_(line.amountExVat);
      target.incVat += num_(line.amountIncVat);
      target.count += 1;
    });

    if (billed.count > 0) {
      addTo(keyFn(order), billed.exVat, billed.incVat, 1, billed.count);
    }
    if (unbilled.count > 0) {
      noInvoice.exVat += unbilled.exVat;
      noInvoice.incVat += unbilled.incVat;
      noInvoice.orderCount += 1;
      noInvoice.lineCount += unbilled.count;
    }
  });

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
 * Same includeNoInvoice/noInvoice semantics as actionStatsRevenue_ — see
 * statsAggregateByOrder_'s doc comment — just grouped by `order.customer`
 * instead of by date period. Gated additionally on fieldVisible_(user,
 * 'customer'): a role that can't see the customer column on an order
 * shouldn't get a customer breakdown either — same principle
 * computeOrderFilters_ already applies to the customer FILTER, extended
 * here to the customer GROUPING.
 *
 * @return {{includeNoInvoice:boolean, groups:Array<{key:string,
 *   label:string, exVat:number, incVat:number, orderCount:number,
 *   lineCount:number}>, noInvoice:Object}} groups sorted by incVat
 *   descending — a revenue breakdown reads top-to-bottom as "biggest
 *   customer first", not alphabetically.
 */
function actionStatsByCustomer_(user, payload) {
  requirePermission_(user, 'view_statistics');
  if (!fieldVisible_(user, 'customer')) throw new Error(MSG.NO_PERMISSION);
  var includeNoInvoice = statsIncludeNoInvoice_(payload);
  var config = readPublicConfig_();
  var filters = computeOrderFilters_(user, payload, config);
  var rows = filteredOrderRowsForUser_(user, filters);
  return statsByField_(rows, includeNoInvoice, function (order) {
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
  var includeNoInvoice = statsIncludeNoInvoice_(payload);
  var config = readPublicConfig_();
  var filters = computeOrderFilters_(user, payload, config);
  var rows = filteredOrderRowsForUser_(user, filters);
  var statusLabels = statusLabelIndex_(config);
  var result = statsByField_(rows, includeNoInvoice, function (order) { return String(order.status || ''); });
  result.groups.forEach(function (g) { g.label = statusLabelText_(statusLabels, g.key); });
  return result;
}

/**
 * Shared by both actions above: groups filtered rows by whatever
 * `keyFn(order)` returns, using statsAggregateByOrder_ for the actual
 * exVat/incVat/orderCount/lineCount summing (and its includeNoInvoice
 * handling) — this function only adds the "group by a field, not by
 * date" part on top, plus sorting groups by revenue (biggest first)
 * rather than by bucket key the way the time-period view sorts
 * chronologically.
 *
 * `label` defaults to the same string as `key` here; actionStatsByStatus_
 * overwrites it afterward with the real Vietnamese status label — kept
 * that way (rather than passing a labelFn into this shared function too)
 * since customer needs no such translation and threading an identity
 * labelFn through just for symmetry would be needless indirection.
 */
function statsByField_(rows, includeNoInvoice, fieldKeyFn) {
  var agg = statsAggregateByOrder_(rows, includeNoInvoice, fieldKeyFn);

  var keys = Object.keys(agg.buckets);
  var out = keys.map(function (key) {
    var b = agg.buckets[key];
    return { key: key, label: key, exVat: b.exVat, incVat: b.incVat, orderCount: b.orderCount, lineCount: b.lineCount };
  });
  // Biggest customer/status first — a revenue breakdown reads top-to-
  // bottom as "who/what contributes most", not alphabetically or by
  // insertion order.
  out.sort(function (a, b) { return b.incVat - a.incVat; });

  return { includeNoInvoice: includeNoInvoice, groups: out, noInvoice: agg.noInvoice };
}
