/**
 * Orders.gs — order CRUD (Milestone 2).
 *
 * Shape of every handler: auth (done by Router) → permission → ownership →
 * validate → act → filter fields on the way out.
 *
 * Three rules this file exists to enforce:
 *   1. Money is computed here, never accepted from the client.
 *   2. A user without `view_all_orders` cannot touch an order they did not create
 *      — not by list, not by id, not by edit, not by delete.
 *   3. Ids are allocated inside a script lock, so two people saving at the same
 *      second cannot receive the same DH-2026-nnnn.
 *
 * Schema decisions behind the columns (no orderNo, one free-text `po`, invoices
 * as their own tab) are Q3/Q4 in docs/OPEN_QUESTIONS.md, answered 2026-08-20.
 */

/* =======================================================================
   Actions
   ======================================================================= */

/**
 * List orders the user may see, newest first, one page at a time.
 *
 * Milestone 2.5 / P4: `pageSize` is capped at LIST_PAGE_SIZE_MAX regardless of
 * what the client asks for, and every card is trimmed to LIST_CARD_FIELDS —
 * filtering and search by month/customer/status are still Milestone 3
 * (3.2–3.4); this task is 3.1, "server-side pagination", absorbed here so it
 * is not built twice. Free-text search across line `description` (3.4) needs
 * OrderLines too and stays out of scope for the same reason.
 */
function actionListOrders_(user, payload) {
  requirePermission_(user, 'view_orders');

  var pageSize = Math.min(Math.max(parseInt(payload && payload.pageSize, 10) ||
                                    LIST_PAGE_SIZE_DEFAULT, 1), LIST_PAGE_SIZE_MAX);
  var page = Math.max(parseInt(payload && payload.page, 10) || 1, 1);

  var orders = scopeToUser_(user, readAll_(SHEETS.ORDERS));
  orders.sort(compareOrdersNewestFirst_);

  var total = orders.length;
  var start = (page - 1) * pageSize;
  var slice = orders.slice(start, start + pageSize);
  var lineCounts = countLinesByOrder_();

  var out = slice.map(function (row) {
    return listCardView_(user, row, lineCounts[row.orderId] || 0);
  });

  return {
    orders: out,
    total: total,
    shown: out.length,
    page: page,
    pageSize: pageSize,
    hasMore: start + out.length < total
  };
}

/**
 * One order row, trimmed to what the list card actually draws — see
 * LIST_CARD_FIELDS. `buildOrderResponse_` is the one that returns everything
 * for the detail screen; this is deliberately narrower.
 */
function listCardView_(user, row, lineCount) {
  var slim = {};
  LIST_CARD_FIELDS.forEach(function (f) {
    if (Object.prototype.hasOwnProperty.call(row, f)) slim[f] = row[f];
  });

  var view = filterVisibleFields_(user, slim);
  view.orderId = row.orderId;                       // always identifiable
  view.lineCount = lineCount;
  view.canEdit = mayAct_(user, row, 'edit_order');
  view.canDelete = mayAct_(user, row, 'delete_order');
  return view;
}

/** One order with its lines. */
function actionGetOrder_(user, payload) {
  requirePermission_(user, 'view_orders');

  var row = findOrderRow_(payload && payload.orderId);
  requireOwnershipOrAll_(user, row);

  return buildOrderResponse_(user, row);
}

/** Create an order and its lines. */
function actionCreateOrder_(user, payload) {
  requirePermission_(user, 'create_order');

  var clean = validateOrderPayload_(payload, user);

  var result = withOrderLock_(function () {
    var orderId = nextOrderId_();
    var now = new Date();

    var lines = clean.lines.map(function (line, i) {
      return buildLineRecord_(orderId, i + 1, line, user, makeLineId_(orderId, i + 1));
    });
    var totals = sumLines_(lines);

    appendRecord_(SHEETS.ORDERS, {
      orderId: orderId,
      po: clean.po,
      poNote: clean.poNote,
      customer: clean.customer,
      orderDate: clean.orderDate,
      status: clean.status,
      statusNote: clean.statusNote,
      customerDeposit: clean.customerDeposit,
      supplierName: clean.supplierName,
      supplierPaid: clean.supplierPaid,
      totalExVat: totals.exVat,
      totalIncVat: totals.incVat,
      createdBy: user.email,
      createdAt: now,
      updatedBy: user.email,
      updatedAt: now,
      approvedBy: '',
      approvedAt: ''
    });

    lines.forEach(function (line) { appendRecord_(SHEETS.ORDER_LINES, line); });

    appendStatusHistory_(orderId, '', clean.status, 'Tạo đơn hàng', user);
    return orderId;
  });

  rememberCustomer_(clean.customer);
  return buildOrderResponse_(user, findOrderRow_(result));
}

/**
 * Update an order and reconcile its lines.
 *
 * Lines are matched by `lineId`: existing ones are updated in place, new ones
 * appended, removed ones deleted. Deliberately not delete-all-then-reinsert —
 * that would churn ids and drop the `invoiceId` of a line nobody touched.
 */
function actionUpdateOrder_(user, payload) {
  requirePermission_(user, 'edit_order');

  var row = findOrderRow_(payload && payload.orderId);
  requireOwnershipOrAll_(user, row);

  var clean = validateOrderPayload_(payload, user);
  var previousStatus = String(row.status || '');

  if (clean.status !== previousStatus) {
    requirePermission_(user, 'change_status');
  }

  // A user who cannot SEE money must not be able to erase it. Their form has no
  // price inputs, so anything it sends for those columns is a zero by omission —
  // the stored value wins instead.
  var blindToMoney = !seesMoney_(user);

  withOrderLock_(function () {
    // Re-read inside the lock: another save may have landed since the check above.
    var current = findOrderRow_(row.orderId);
    var existing = linesForOrder_(current.orderId);
    var byId = {};
    existing.forEach(function (line) { byId[String(line.lineId)] = line; });

    var kept = {};
    var saved = [];
    var maxSeq = maxLineSequence_(existing);

    clean.lines.forEach(function (input, i) {
      var lineNo = i + 1;
      var match = input.lineId ? byId[input.lineId] : null;

      if (match && blindToMoney) {
        input.unitPrice = num_(match.unitPrice);
        input.vatRate = num_(match.vatRate);
      }

      if (match) {
        // id never changes on edit, and it comes from the SHEET, not the client
        var updated = buildLineRecord_(current.orderId, lineNo, input, user, match.lineId);
        updateRecord_(SHEETS.ORDER_LINES, match._row, updated);
        kept[String(match.lineId)] = true;
        saved.push(updated);
      } else {
        // No match: an unknown lineId is treated as a new line, never trusted as
        // an id — otherwise a client could point a line at another order's row.
        maxSeq++;
        var created = buildLineRecord_(current.orderId, lineNo, input, user,
                                       makeLineId_(current.orderId, maxSeq));
        appendRecord_(SHEETS.ORDER_LINES, created);
        saved.push(created);
      }
    });

    // Delete removed lines bottom-up: deleting a row shifts every row below it.
    existing
      .filter(function (line) { return !kept[String(line.lineId)]; })
      .sort(function (a, b) { return b._row - a._row; })
      .forEach(function (line) { deleteRecord_(SHEETS.ORDER_LINES, line._row); });

    var totals = sumLines_(saved);

    updateRecord_(SHEETS.ORDERS, current._row, {
      po: clean.po,
      poNote: clean.poNote,
      customer: clean.customer,
      orderDate: clean.orderDate,
      status: clean.status,
      statusNote: clean.statusNote,
      customerDeposit: blindToMoney ? num_(current.customerDeposit) : clean.customerDeposit,
      supplierName: clean.supplierName,
      supplierPaid: blindToMoney ? num_(current.supplierPaid) : clean.supplierPaid,
      totalExVat: totals.exVat,
      totalIncVat: totals.incVat,
      updatedBy: user.email,
      updatedAt: new Date()
    });

    if (clean.status !== previousStatus) {
      appendStatusHistory_(current.orderId, previousStatus, clean.status,
                           clean.statusNote, user);
    }
  });

  rememberCustomer_(clean.customer);
  return buildOrderResponse_(user, findOrderRow_(row.orderId));
}

/** Delete an order and every line under it. Invoices are left alone. */
function actionDeleteOrder_(user, payload) {
  requirePermission_(user, 'delete_order');

  var row = findOrderRow_(payload && payload.orderId);
  requireOwnershipOrAll_(user, row);

  withOrderLock_(function () {
    var current = findOrderRow_(row.orderId);

    linesForOrder_(current.orderId)
      .sort(function (a, b) { return b._row - a._row; })
      .forEach(function (line) { deleteRecord_(SHEETS.ORDER_LINES, line._row); });

    deleteRecord_(SHEETS.ORDERS, current._row);
    appendStatusHistory_(current.orderId, String(current.status || ''), 'deleted',
                         'Xoá đơn hàng', user);
  });

  return { deleted: true, orderId: row.orderId };
}

/* =======================================================================
   Reading
   ======================================================================= */

/** Header + lines, both field-filtered, with invoice details joined in. */
function buildOrderResponse_(user, row) {
  var invoices = invoiceIndex_();

  var lines = linesForOrder_(row.orderId)
    .sort(function (a, b) { return num_(a.lineNo) - num_(b.lineNo); })
    .map(function (line) {
      var invoice = invoices[String(line.invoiceId || '')] || null;
      var enriched = {};
      Object.keys(line).forEach(function (k) {
        if (k.charAt(0) !== '_') enriched[k] = line[k];
      });
      enriched.invoiceNo = invoice ? invoice.invoiceNo : '';
      enriched.invoiceDate = invoice ? invoice.invoiceDate : '';
      var view = filterVisibleFields_(user, enriched);
      view.lineId = line.lineId;
      return view;
    });

  var order = filterVisibleFields_(user, row);
  order.orderId = row.orderId;
  order.canEdit = mayAct_(user, row, 'edit_order');
  order.canDelete = mayAct_(user, row, 'delete_order');
  order.canChangeStatus = hasPermission_(user, 'change_status');

  return { order: order, lines: lines, hiddenMoney: !seesMoney_(user) };
}

function findOrderRow_(orderId) {
  var id = String(orderId || '').trim();
  if (!id) throw new Error(MSG.ORDER_NOT_FOUND);
  var row = findBy_(SHEETS.ORDERS, 'orderId', id);
  if (!row) throw new Error(MSG.ORDER_NOT_FOUND);
  return row;
}

function linesForOrder_(orderId) {
  var id = String(orderId || '').trim().toLowerCase();
  return readAll_(SHEETS.ORDER_LINES).filter(function (line) {
    return String(line.orderId || '').trim().toLowerCase() === id;
  });
}

function countLinesByOrder_() {
  var counts = {};
  readAll_(SHEETS.ORDER_LINES).forEach(function (line) {
    var id = String(line.orderId || '').trim();
    if (id) counts[id] = (counts[id] || 0) + 1;
  });
  return counts;
}

function invoiceIndex_() {
  var index = {};
  readAll_(SHEETS.INVOICES).forEach(function (inv) {
    index[String(inv.invoiceId || '').trim()] = inv;
  });
  return index;
}

/** Newest first: order date, then creation time as the tie-breaker. */
function compareOrdersNewestFirst_(a, b) {
  var diff = time_(b.orderDate) - time_(a.orderDate);
  if (diff) return diff;
  return time_(b.createdAt) - time_(a.createdAt);
}

/** True if the user holds `permission` AND may act on this particular row. */
function mayAct_(user, row, permission) {
  if (!hasPermission_(user, permission)) return false;
  if (canSeeAllOrders_(user)) return true;
  return String(row.createdBy || '').trim().toLowerCase() === user.email;
}

function seesMoney_(user) {
  var allowed = visibleFields_(user);
  if (allowed.length === 1 && allowed[0] === '*') return true;
  return MONEY_FIELDS.some(function (f) { return allowed.indexOf(f) >= 0; });
}

/* =======================================================================
   Validation — everything the client sends is suspect
   ======================================================================= */

function validateOrderPayload_(payload, user) {
  var raw = (payload && payload.order) || {};
  var rawLines = (payload && payload.lines) || [];
  var config = readPublicConfig_();

  var customer = text_(raw.customer);
  if (!customer) throw new Error(MSG.ORDER_NO_CUSTOMER);

  var orderDate = parseDate_(raw.orderDate);
  if (!orderDate) throw new Error(MSG.ORDER_BAD_DATE);

  var status = text_(raw.status) || defaultStatus_(config);
  if (!isKnownStatus_(config, status)) throw new Error(MSG.ORDER_BAD_STATUS);

  if (!rawLines.length) throw new Error(MSG.ORDER_NO_LINES);
  if (rawLines.length > ORDER_LIMITS.MAX_LINES) throw new Error(MSG.ORDER_TOO_MANY_LINES);

  var deposit = money_(raw.customerDeposit);
  if (deposit === null) throw new Error(MSG.ORDER_BAD_DEPOSIT);
  var supplierPaid = money_(raw.supplierPaid);
  if (supplierPaid === null) throw new Error(MSG.ORDER_BAD_SUPPLIER_PAID);

  var lines = rawLines.map(function (line, i) {
    return validateLine_(line, i + 1, config, customer, user);
  });

  return {
    po: text_(raw.po),
    poNote: text_(raw.poNote),
    customer: customer,
    orderDate: orderDate,
    status: status,
    statusNote: text_(raw.statusNote),
    customerDeposit: deposit,
    supplierName: text_(raw.supplierName),
    supplierPaid: supplierPaid,
    lines: lines
  };
}

function validateLine_(line, lineNo, config, customer, user) {
  var where = MSG.LINE_PREFIX + lineNo;
  var description = text_(line && line.description);
  if (!description) throw new Error(where + MSG.LINE_NO_DESCRIPTION);

  var qty = quantity_(line.qty);
  if (qty === null || qty <= 0) throw new Error(where + MSG.LINE_BAD_QTY);

  var unitPrice = money_(line.unitPrice);
  if (unitPrice === null) throw new Error(where + MSG.LINE_BAD_PRICE);

  var vatRate = vat_(line.vatRate, config);
  if (vatRate === null) throw new Error(where + MSG.LINE_BAD_VAT);

  // Invoice is optional. A number without a date is a mistake, not a default.
  var invoiceNo = text_(line.invoiceNo);
  var invoiceDate = null;
  if (invoiceNo) {
    if (!line.invoiceDate) throw new Error(where + MSG.LINE_INVOICE_NO_DATE);
    invoiceDate = parseDate_(line.invoiceDate);
    if (!invoiceDate) throw new Error(where + MSG.LINE_INVOICE_BAD_DATE);
  }

  return {
    lineId: text_(line.lineId),
    productCode: text_(line.productCode),
    description: description,
    unitPrice: unitPrice,
    qty: qty,
    uom: text_(line.uom),
    vatRate: vatRate,
    note: text_(line.note),
    invoiceNo: invoiceNo,
    invoiceDate: invoiceDate,
    customer: customer,
    actorEmail: user.email
  };
}

/* =======================================================================
   Building records — the only place line money is produced
   ======================================================================= */

function buildLineRecord_(orderId, lineNo, input, user, lineId) {
  var amountExVat = Math.round(input.unitPrice * input.qty);
  var amountIncVat = Math.round(amountExVat * (1 + input.vatRate));

  return {
    lineId: lineId,
    orderId: orderId,
    lineNo: lineNo,
    productCode: input.productCode,
    description: input.description,
    unitPrice: input.unitPrice,
    qty: input.qty,
    uom: input.uom,
    vatRate: input.vatRate,
    amountExVat: amountExVat,
    amountIncVat: amountIncVat,
    invoiceId: input.invoiceNo
      ? ensureInvoice_(input.invoiceNo, input.invoiceDate, input.customer, user)
      : '',
    note: input.note
  };
}

function sumLines_(lines) {
  var exVat = 0, incVat = 0;
  lines.forEach(function (line) {
    exVat += line.amountExVat;
    incVat += line.amountIncVat;
  });
  return { exVat: exVat, incVat: incVat };
}

/**
 * Find or create the invoice. One invoice can cover several orders (Q4), so an
 * existing row is reused as-is — its date is NOT overwritten from an order form,
 * because that date also belongs to every other order on the same invoice.
 */
function ensureInvoice_(invoiceNo, invoiceDate, customer, user) {
  var id = makeInvoiceId_(invoiceNo, invoiceDate);
  var existing = findBy_(SHEETS.INVOICES, 'invoiceId', id);
  if (existing) return existing.invoiceId;

  appendRecord_(SHEETS.INVOICES, {
    invoiceId: id,
    invoiceNo: invoiceNo,
    invoiceDate: invoiceDate,
    customer: customer,
    note: '',
    createdBy: user.email,
    createdAt: new Date()
  });
  return id;
}

function appendStatusHistory_(orderId, oldStatus, newStatus, note, user) {
  appendRecord_(SHEETS.STATUS_HISTORY, {
    historyId: 'LS-' + Utilities.getUuid().substring(0, 8).toUpperCase(),
    orderId: orderId,
    oldStatus: oldStatus,
    newStatus: newStatus,
    note: text_(note),
    changedBy: user.email,
    changedAt: new Date()
  });
}

/**
 * Add a customer typed for the first time to Config.customerList, so the
 * suggestion list fills itself before the admin screen exists (Q6).
 * A failure here must never fail the order — it is a convenience, not data.
 */
function rememberCustomer_(customer) {
  try {
    var name = text_(customer);
    if (!name) return;

    var rows = readAll_(SHEETS.CONFIG);
    var row = null;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].key).trim() === 'customerList') { row = rows[i]; break; }
    }
    if (!row) return;

    var list = [];
    try { list = JSON.parse(row.value) || []; } catch (err) { list = []; }
    if (!Array.isArray(list)) list = [];

    var needle = name.toLowerCase();
    var known = list.some(function (c) { return String(c).trim().toLowerCase() === needle; });
    if (known) return;

    list.push(name);
    list.sort(function (a, b) { return String(a).localeCompare(String(b), 'vi'); });
    updateRecord_(SHEETS.CONFIG, row._row, { value: JSON.stringify(list) });
    invalidateConfigCache_();
  } catch (err) {
    console.error('rememberCustomer_: ' + err);
  }
}

/* =======================================================================
   Ids
   ======================================================================= */

/**
 * Allocate the next DH-{year}-{0001}. Call inside withOrderLock_.
 *
 * The counter lives in Script Properties, but is re-seeded from the sheet
 * whenever the year changes or the property is missing: a property that gets
 * cleared must not start handing out ids that already exist.
 */
function nextOrderId_() {
  var props = PropertiesService.getScriptProperties();
  var year = new Date().getFullYear();
  var storedYear = parseInt(props.getProperty(PROP.ORDER_SEQ_YEAR), 10);
  var next = parseInt(props.getProperty(PROP.ORDER_SEQ_NEXT), 10);

  if (storedYear !== year || !next || next < 1) {
    next = highestOrderSequence_(year) + 1;
  }

  var id = 'DH-' + year + '-' + pad_(next, 4);

  // Belt and braces: never hand out an id the sheet already holds.
  while (findBy_(SHEETS.ORDERS, 'orderId', id)) {
    next++;
    id = 'DH-' + year + '-' + pad_(next, 4);
  }

  props.setProperty(PROP.ORDER_SEQ_YEAR, String(year));
  props.setProperty(PROP.ORDER_SEQ_NEXT, String(next + 1));
  return id;
}

function highestOrderSequence_(year) {
  var prefix = 'DH-' + year + '-';
  var highest = 0;
  readAll_(SHEETS.ORDERS).forEach(function (row) {
    var id = String(row.orderId || '');
    if (id.indexOf(prefix) !== 0) return;
    var seq = parseInt(id.substring(prefix.length), 10);
    if (seq > highest) highest = seq;
  });
  return highest;
}

function makeLineId_(orderId, sequence) {
  return orderId + '-L' + pad_(sequence, 2);
}

/** HD-{year of the invoice date}-{number}. Yearly numbering cannot collide. */
function makeInvoiceId_(invoiceNo, invoiceDate) {
  var year = (invoiceDate instanceof Date) ? invoiceDate.getFullYear() : new Date().getFullYear();
  var raw = String(invoiceNo).trim();
  var part = /^\d+$/.test(raw) ? pad_(parseInt(raw, 10), 4)
                               : raw.toUpperCase().replace(/[^A-Z0-9]+/g, '-');
  return 'HD-' + year + '-' + part;
}

/* =======================================================================
   Small helpers
   ======================================================================= */

function withOrderLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error(MSG.ORDER_LOCK_BUSY);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function maxLineSequence_(lines) {
  var highest = 0;
  lines.forEach(function (line) {
    var match = /-L(\d+)$/.exec(String(line.lineId || ''));
    if (match) {
      var seq = parseInt(match[1], 10);
      if (seq > highest) highest = seq;
    }
  });
  return highest;
}

function text_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().substring(0, ORDER_LIMITS.MAX_TEXT);
}

/** VND integer. Accepts 1200000, "1.200.000", "1 200 000". null = invalid. */
function money_(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') {
    if (!isFinite(value) || value < 0 || value > ORDER_LIMITS.MAX_MONEY) return null;
    return Math.round(value);
  }
  var digits = String(value).replace(/[^\d]/g, '');
  if (!digits) return 0;
  var parsed = parseInt(digits, 10);
  if (!isFinite(parsed) || parsed > ORDER_LIMITS.MAX_MONEY) return null;
  return parsed;
}

/** Quantity may be fractional (metres, sets). null = invalid. */
function quantity_(value) {
  if (value === null || value === undefined || value === '') return null;
  var parsed = (typeof value === 'number') ? value
                                           : parseFloat(String(value).replace(',', '.'));
  if (!isFinite(parsed) || parsed <= 0 || parsed > 1e9) return null;
  return parsed;
}

/** Accepts 0.08 or 8; rejects anything not offered by Config.vatRates (0 is ok). */
function vat_(value, config) {
  if (value === null || value === undefined || value === '') return 0;
  var parsed = (typeof value === 'number') ? value : parseFloat(String(value).replace(',', '.'));
  if (!isFinite(parsed) || parsed < 0) return null;
  if (parsed > 1) parsed = parsed / 100;
  parsed = Math.round(parsed * 10000) / 10000;

  var allowed = (config && config.vatRates) || [0.08, 0.1];
  if (parsed === 0) return 0;
  for (var i = 0; i < allowed.length; i++) {
    if (Math.abs(Number(allowed[i]) - parsed) < 1e-9) return parsed;
  }
  return null;
}

/**
 * Date-only parsing. `new Date('2026-08-20')` is parsed as UTC midnight, which in
 * Asia/Ho_Chi_Minh is still 2026-08-20 07:00 — fine — but the same string one
 * timezone west lands on the previous day. Build the date from its parts instead.
 */
function parseDate_(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  var text = String(value).trim();
  var iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  var vn = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (vn) return new Date(Number(vn[3]), Number(vn[2]) - 1, Number(vn[1]));

  var fallback = new Date(text);
  return isNaN(fallback.getTime()) ? null : fallback;
}

function defaultStatus_(config) {
  var list = (config && config.statusList) || [];
  return (list[0] && list[0].key) ? String(list[0].key) : 'draft';
}

function isKnownStatus_(config, status) {
  var list = (config && config.statusList) || [];
  if (!list.length) return true;                    // Config not seeded yet
  return list.some(function (s) { return String(s.key) === status; });
}

function num_(value) {
  var parsed = Number(value);
  return isFinite(parsed) ? parsed : 0;
}

function time_(value) {
  if (value instanceof Date) return value.getTime();
  if (!value) return 0;
  var parsed = new Date(value);
  return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function pad_(n, width) {
  var s = String(n);
  while (s.length < width) s = '0' + s;
  return s;
}
