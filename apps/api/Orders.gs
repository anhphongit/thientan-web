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
 * this task is 3.1, "server-side pagination", absorbed here so it is not
 * built twice.
 *
 * Milestone 3 / 3.2: `payload.month` ('YYYY-MM') or `payload.dateFrom`/
 * `dateTo` ('YYYY-MM-DD') narrow the result to `orderDate` in range, applied
 * AFTER scopeToUser_ so a filter can never leak another user's orders and
 * BEFORE pagination so `total`/`hasMore` describe the filtered set, not the
 * whole sheet. `month` wins if both are sent (the client only ever sends one).
 * Customer/status/created-by filters and free-text search are still 3.3/3.4.
 *
 * Milestone 2.5 / P5: `lineCount` comes straight off the Orders row now,
 * maintained by actionCreateOrder_/actionUpdateOrder_ on every save — no more
 * reading the entire OrderLines sheet just to print a per-card count. Run
 * `migrateAddLineCount()` (Migrations.gs) once before this reaches anyone: an
 * order that predates that migration has nothing in the column yet, and
 * `num_()` below reads that as 0 rather than throwing.
 *
 * Milestone 2.5 / P7: CacheService page cache keyed by ordersVersion + user
 * email + page + pageSize. A hit skips the sheet read entirely. Any create /
 * update / delete bumps the version so every previous page misses. The TTL is
 * only a safety net; version is the real invalidator. Cache key always includes
 * the caller's email so ownership scoping and visible_fields stay correct —
 * never share a list payload across users.
 */
function actionListOrders_(user, payload) {
  requirePermission_(user, 'view_orders');

  var pageSize = Math.min(Math.max(parseInt(payload && payload.pageSize, 10) ||
                                    LIST_PAGE_SIZE_DEFAULT, 1), LIST_PAGE_SIZE_MAX);
  var page = Math.max(parseInt(payload && payload.page, 10) || 1, 1);

  // Milestone 3 / 3.2–3.8's filters, computed by the shared helper (Milestone
  // 4 / 4.1) so actionListOrders_ and Export.gs's actions can never drift
  // apart on what a filter value means or which fields it's gated behind.
  var approveConfig = readPublicConfig_();
  var filters = computeOrderFilters_(user, payload, approveConfig);
  var dateFilter = filters.dateFilter;
  var customerFilter = filters.customerFilter;
  var statusFilter = filters.statusFilter;
  var createdByFilter = filters.createdByFilter;
  var searchQuery = filters.searchQuery;
  var approveStatusFilter = filters.approveStatusFilter;

  var version = getOrdersVersion_();
  var cacheKey = listCacheKey_(version, user.email, page, pageSize,
                                dateFilter, customerFilter, statusFilter, createdByFilter, searchQuery,
                                approveStatusFilter);
  var cached = getListCache_(cacheKey);
  if (cached) return cached;

  var orders = filteredOrderRowsForUser_(user, {
    dateFilter: dateFilter,
    customerFilter: customerFilter,
    statusFilter: statusFilter,
    createdByFilter: createdByFilter,
    approveStatusFilter: approveStatusFilter,
    searchQuery: searchQuery
  });

  var total = orders.length;
  // Milestone 4 / 4.5.2 revision — sum of the FILTERED set's own lineCount
  // (already maintained per-order, Migrations.gs P5), not just the page
  // being shown. Lets the client estimate export size/time by order LINE
  // count rather than order count — a better predictor of how many sheet
  // rows a large export will actually write (ExportJob.gs batches by row,
  // and one order can be anywhere from 1 to MAX_LINES lines), computed
  // here for free since `orders` (the whole filtered set, pre-pagination)
  // is already in memory with lineCount on every row.
  var totalLines = orders.reduce(function (sum, row) { return sum + num_(row.lineCount); }, 0);
  var start = (page - 1) * pageSize;
  var slice = orders.slice(start, start + pageSize);

  var out = slice.map(function (row) {
    return listCardView_(user, row, num_(row.lineCount));
  });

  var result = {
    orders: out,
    total: total,
    totalLines: totalLines,
    shown: out.length,
    page: page,
    pageSize: pageSize,
    hasMore: start + out.length < total
  };

  putListCache_(cacheKey, result);
  return result;
}

/**
 * Milestone 4 / 4.1 — factored out of actionListOrders_ so Export.gs's
 * filtered-export actions apply the EXACT same filters (in the same order,
 * against the same scoped/security-checked row set) rather than a second,
 * possibly-drifting copy. Returns the full filtered+sorted set of RAW
 * Orders rows (not list-card view, not paginated, not fields-filtered —
 * callers do that themselves for their own purpose: actionListOrders_
 * slices+trims to card view, Export.gs's actions build a report row shape).
 *
 * `filters` is the already-computed set of filter values (dateFilter object,
 * customerFilter/statusFilter/createdByFilter/approveStatusFilter/searchQuery
 * strings) — computing those from a raw payload is still the caller's job,
 * since actionListOrders_ and the export actions want the identical
 * gating logic (fieldVisible_/canSeeAllOrders_/approvalFlowEnabled_ checks)
 * applied to the payload before it ever reaches here.
 */
function filteredOrderRowsForUser_(user, filters) {
  var orders = scopeToUser_(user, readAll_(SHEETS.ORDERS));
  if (filters.dateFilter && (filters.dateFilter.fromTime !== null || filters.dateFilter.toTime !== null)) {
    orders = orders.filter(function (row) { return matchesDateFilter_(row, filters.dateFilter); });
  }
  if (filters.customerFilter) {
    orders = orders.filter(function (row) { return normalizeFilter_(row.customer) === filters.customerFilter; });
  }
  if (filters.statusFilter) {
    orders = orders.filter(function (row) { return String(row.status || '') === filters.statusFilter; });
  }
  if (filters.createdByFilter) {
    orders = orders.filter(function (row) { return normalizeFilter_(row.createdBy) === filters.createdByFilter; });
  }
  if (filters.approveStatusFilter) {
    orders = orders.filter(function (row) {
      return String(row.approveStatus || 'draft') === filters.approveStatusFilter;
    });
  }
  if (filters.searchQuery) {
    // Same security reasoning as actionListOrders_ originally had inline:
    // search must never become an oracle for a field a role can't see.
    var lineMatchIds = fieldVisible_(user, 'description') ? searchLineOrderIds_(filters.searchQuery) : {};
    orders = orders.filter(function (row) { return matchesSearch_(row, filters.searchQuery, lineMatchIds, user); });
  }
  orders.sort(compareOrdersNewestFirst_);
  return orders;
}

/**
 * Milestone 4 / 4.1 — builds the same `filters` shape filteredOrderRowsForUser_
 * expects, from a raw action payload. Shared by actionListOrders_ and every
 * Export.gs action so the exact same gating (fieldVisible_, canSeeAllOrders_,
 * approvalFlowEnabled_) decides what a filter value even MEANS, not just
 * whether one was supplied — the same security fixes 3.3/3.4 made for the
 * list stay true for exports automatically, not by remembering to copy them.
 */
function computeOrderFilters_(user, payload, config) {
  return {
    dateFilter: orderDateFilter_(payload),
    customerFilter: fieldVisible_(user, 'customer') ? normalizeFilter_(payload && payload.customer) : '',
    statusFilter: fieldVisible_(user, 'status')
      ? normalizeFilter_(payload && payload.status, { keepCase: true }) : '',
    createdByFilter: canSeeAllOrders_(user) ? normalizeFilter_(payload && payload.createdBy) : '',
    searchQuery: normalizeFilter_(payload && payload.q),
    approveStatusFilter: approvalFlowEnabled_(config)
      ? normalizeFilter_(payload && payload.approveStatus, { keepCase: true }) : ''
  };
}

/**
 * Milestone 3 / 3.4 — order-level fields the free-text search checks
 * directly, plus a fallback to `lineMatchIds` for anything only findable on
 * a line (line `description`).
 *
 * Security fix, 2026-08-31: `po` and `customer` are only checked when this
 * user's `visible_fields` actually includes them — same predicate
 * (`fieldVisible_`) already used to decide whether to render/trust these
 * fields elsewhere in this file. `orderId` is always checked: it is always
 * returned to every caller regardless of visible_fields (see
 * listCardView_'s "always identifiable" comment), so searching by it leaks
 * nothing a role couldn't already see.
 */
function matchesSearch_(row, query, lineMatchIds, user) {
  var haystacks = [row.orderId];
  if (fieldVisible_(user, 'po')) haystacks.push(row.po);
  if (fieldVisible_(user, 'customer')) haystacks.push(row.customer);
  for (var i = 0; i < haystacks.length; i++) {
    if (String(haystacks[i] || '').toLowerCase().indexOf(query) >= 0) return true;
  }
  return !!lineMatchIds[row.orderId];
}

/** Distinct orderIds with at least one line whose description matches `query`. */
function searchLineOrderIds_(query) {
  var ids = {};
  readAll_(SHEETS.ORDER_LINES).forEach(function (line) {
    if (String(line.description || '').toLowerCase().indexOf(query) >= 0) {
      ids[line.orderId] = true;
    }
  });
  return ids;
}

/** Trim + lowercase for a loose equality filter; status keeps its case
 *  (status keys are fixed lowercase_with_underscores already, and comparing
 *  case-sensitively there is one less way to accidentally match a status
 *  that isn't the one on screen). Empty/whitespace-only input means "no
 *  filter", same treatment as the date filter's malformed-input handling. */
function normalizeFilter_(value, opts) {
  var s = String(value === null || value === undefined ? '' : value).trim();
  if (!s) return '';
  return (opts && opts.keepCase) ? s : s.toLowerCase();
}

/**
 * Milestone 3 / 3.3 — data source for the created-by dropdown. Distinct
 * creators actually present in Orders, not the full Users sheet: this app
 * has no user-management screen yet (Milestone 5), and a filter dropdown
 * should only ever offer people who could possibly match something, the
 * same self-filling reasoning as Config.customerList (Q6,
 * docs/OPEN_QUESTIONS.md). Gated on view_all_orders for the same reason the
 * filter itself is: anyone without it already sees only their own orders,
 * so the dropdown would be a list of one.
 */
function actionListOrderCreators_(user) {
  requirePermission_(user, 'view_orders');
  if (!canSeeAllOrders_(user)) return { creators: [] };

  var seen = {};
  var creators = [];
  readAll_(SHEETS.ORDERS).forEach(function (row) {
    var email = String(row.createdBy || '').trim();
    if (!email || seen[email.toLowerCase()]) return;
    seen[email.toLowerCase()] = true;
    var userRow = findBy_(SHEETS.USERS, 'email', email);
    creators.push({ email: email, displayName: (userRow && userRow.displayName) || email });
  });
  creators.sort(function (a, b) { return a.displayName.localeCompare(b.displayName); });
  return { creators: creators };
}

/**
 * Milestone 3 / 3.2 — parse the list request's date filter.
 *
 * `month` ('YYYY-MM', what the <input type="month"> on the client sends) is
 * expanded to the first/last instant of that month. Otherwise `dateFrom`/
 * `dateTo` ('YYYY-MM-DD') are read as local start-of-day / end-of-day so a
 * range is inclusive on both ends. Anything malformed or missing is simply
 * ignored — an unparseable filter must never throw or silently return
 * nothing; it falls back to "no filter" the same as an absent one.
 */
function orderDateFilter_(payload) {
  var out = { fromTime: null, toTime: null };
  var month = payload && payload.month ? String(payload.month).trim() : '';
  var monthMatch = /^(\d{4})-(\d{2})$/.exec(month);
  if (monthMatch) {
    var y = parseInt(monthMatch[1], 10);
    var m = parseInt(monthMatch[2], 10);
    var start = new Date(y, m - 1, 1, 0, 0, 0, 0);
    var end = new Date(y, m, 1, 0, 0, 0, 0).getTime() - 1;
    if (!isNaN(start.getTime())) { out.fromTime = start.getTime(); out.toTime = end; }
    return out;
  }

  var from = payload && payload.dateFrom ? String(payload.dateFrom).trim() : '';
  var to = payload && payload.dateTo ? String(payload.dateTo).trim() : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    var fd = new Date(from + 'T00:00:00');
    if (!isNaN(fd.getTime())) out.fromTime = fd.getTime();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    var td = new Date(to + 'T23:59:59.999');
    if (!isNaN(td.getTime())) out.toTime = td.getTime();
  }
  return out;
}

/** True when row.orderDate falls inside the (possibly one-sided) filter. */
function matchesDateFilter_(row, filter) {
  var t = time_(row.orderDate);
  if (filter.fromTime !== null && t < filter.fromTime) return false;
  if (filter.toTime !== null && t > filter.toTime) return false;
  return true;
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

  // Milestone 3 / 3.8 — approveStatus is NOT in LIST_CARD_FIELDS (that list
  // only trims what the CARD LAYOUT draws), so it never reaches `slim` and
  // ALWAYS_VISIBLE_FIELDS never gets a chance to act on it here. Set it
  // directly instead, same as orderId just above — this is what actually
  // guarantees "every card, every user" (spec point 2), independent of both
  // LIST_CARD_FIELDS and visible_fields. Defaults to 'draft' for a
  // pre-migration row that has no value yet.
  var approveStatus = String(row.approveStatus || 'draft');
  view.approveStatus = approveStatus;

  var config = readPublicConfig_();
  var editGateOk = canEditForApproveStatus_(user, approveStatus, config);
  view.canEdit = mayAct_(user, row, 'edit_order') && editGateOk;
  view.canDelete = mayAct_(user, row, 'delete_order');
  view.canChangeStatus = mayAct_(user, row, 'change_status'); // Milestone 3 / 3.5

  // Logic revision 2026-09-03 — all four flags come from approveActionFlags_
  // now (self-approvers get the free transitions; everyone else keeps the
  // original wait_approval gate). See that helper for the full matrix.
  var flags = approveActionFlags_(user, row, approveStatus, config);
  view.canRequestApprove = flags.canRequestApprove;
  view.canApprove = flags.canApprove;
  view.canReject = flags.canReject;
  view.canSetDraft = flags.canSetDraft;
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

  // Security review, 2026-08-27: every field this user cannot see must be
  // unsettable, not just "protected once it already has a value". The
  // update path clamps a hidden field to whatever is already stored
  // (blindToMoney / fieldVisible_ / lineFieldsHidden below) — but a brand
  // new order has no stored value to fall back to, so those guards never
  // fired here. Concretely: a role with create_order but no unitPrice/
  // vatRate in visible_fields never gets a price input in their form, but
  // a direct API call (Postman, browser console, curl with a stolen
  // session) could still hand the server any unitPrice it liked, and the
  // server accepted it — same story for customerDeposit/supplierPaid and
  // for po/poNote/statusNote/supplierName. clampHiddenOrderFields_ forces
  // every hidden field to its safe default (0 / '') before anything is
  // written, so the only way to set a field is to be allowed to see it.
  clampHiddenOrderFields_(user, clean);

  // Logic revision 2026-09-03 (point 1) — the save-time auto-approve rule
  // now applies to create as well: an approve_order holder who confirmed
  // the "Duyệt luôn đơn này?" prompt gets an order that is born approved,
  // instead of having to create it and immediately approve it again. Same
  // contract as actionUpdateOrder_ — approved ONLY on an explicit
  // payload.confirmApprove === true, draft in every other case, and inert
  // entirely while the flag is off.
  var createConfig = readPublicConfig_();
  var bornApproved = approvalFlowEnabled_(createConfig) &&
                     hasPermission_(user, 'approve_order') &&
                     !!(payload && payload.confirmApprove === true);
  var initialApproveStatus = bornApproved ? 'approved' : 'draft';

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
      lineCount: lines.length,
      createdBy: user.email,
      createdAt: now,
      updatedBy: user.email,
      updatedAt: now,
      // Revision 2026-09-03e — restored: a create that's born approved
      // (bornApproved below) stamps these the same as actionApproveOrder_
      // does; every other create still writes '' (unapproved at birth).
      approvedBy: bornApproved ? user.email : '',
      approvedAt: bornApproved ? now : '',
      // Milestone 3 / 3.8 — a new order starts life as a draft unless the
      // creating user is an approver who explicitly asked to approve it on
      // the spot (see initialApproveStatus above). Still inert when the
      // flag is off: bornApproved is false there, so this stays 'draft' and
      // the column just sits unused (see the design note in TASKS.md,
      // "Flag only hides UI/permissions; approveStatus data stays
      // untouched").
      approveStatus: initialApproveStatus
    });

    lines.forEach(function (line) { appendRecord_(SHEETS.ORDER_LINES, line); });

    appendStatusHistory_(orderId, '', clean.status, 'Tạo đơn hàng', user, 'status');
    // Only log an approveStatus row when the order did NOT take the default
    // birth state: '' -> 'draft' on every create would be pure noise, but
    // '' -> 'approved' is a real approval event and must be auditable.
    if (bornApproved) {
      appendStatusHistory_(orderId, '', 'approved', 'Tạo và duyệt đơn hàng', user, 'approveStatus');
    }
    return orderId;
  });

  bumpOrdersVersion_();
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
/**
 * Milestone 3 / 3.8 — approve-status helpers.
 *
 * approvalFlowEnabled_() reads the feature flag straight from Config (via
 * readPublicConfig_(), which is itself cached — see CACHE.CONFIG_KEY). When
 * the flag is off, every function below that checks it must fall back to
 * today's plain "edit_order + ownership" behavior, never to a stricter rule
 * — the flag existing at all must not change behavior for a deployment that
 * hasn't turned it on. See TASKS.md, "Milestone 3, task 3.8" for the full
 * design and its decision log.
 */
function approvalFlowEnabled_(config) {
  var v = config && config.approvalFlowEnabled;
  return v === true || v === 'TRUE' || v === 'true';
}

function isKnownApproveStatus_(status) {
  return ['draft', 'wait_approval', 'approved', 'rejected'].indexOf(status) >= 0;
}

/**
 * Whether `user` may edit an order currently at `approveStatus`, given the
 * edit-gating matrix agreed in TASKS.md:
 *   draft / rejected   → edit_order (+ ownership, same as always)
 *   wait_approval /
 *   approved           → edit_order AND (approve_order OR can_edit_approved_order)
 * Ownership (requireOwnershipOrAll_) is layered on separately by the caller,
 * exactly as it always has been — this only decides the approve-status part.
 * When the feature flag is off, every status is treated as draft-like, so
 * this always returns true once edit_order itself has been checked by the
 * caller (kept as a real check here too, so a direct call is still correct
 * on its own).
 */
function canEditForApproveStatus_(user, approveStatus, config) {
  if (!hasPermission_(user, 'edit_order')) return false;
  if (!approvalFlowEnabled_(config)) return true;

  if (approveStatus === 'wait_approval' || approveStatus === 'approved') {
    return hasPermission_(user, 'approve_order') || hasPermission_(user, 'can_edit_approved_order');
  }
  return true; // draft, rejected, or unrecognized (treated leniently, same as before 3.8)
}

/**
 * Logic revision 2026-09-03 (points 2-5) — a "self-approver" is a user who
 * holds BOTH edit_order and approve_order on THIS order (mayAct_ layers
 * ownership on top of the raw permission, same as everywhere else). Such a
 * user writes and signs off their own work, so the request-approval hop is
 * pointless busywork for them: they skip wait_approval entirely (point 2)
 * and may move an order straight into any approve status it is not already
 * in (points 3-5).
 *
 * Deliberately NOT extended to a user holding approve_order alone (the
 * user's explicit answer, 2026-09-03): a pure approver — someone who can
 * sign off but cannot edit — stays on the original rule, approving or
 * rejecting only what has actually been submitted for approval. Widening
 * that would let a review-only account push an order nobody ever submitted
 * straight to approved, which is exactly the control the wait_approval gate
 * exists to enforce.
 */
function isSelfApprover_(user, row, config) {
  return approvalFlowEnabled_(config) &&
         mayAct_(user, row, 'edit_order') &&
         mayAct_(user, row, 'approve_order');
}

/**
 * The four approve-action flags the client draws its buttons from, computed
 * in ONE place because listCardView_ and buildOrderResponse_ both need them
 * and had drifted into duplicated copies of the same three lines before
 * this revision.
 *
 * Self-approver (edit_order + approve_order):
 *   canRequestApprove — never (point 2: they have no use for the hop)
 *   canApprove        — any status except 'approved'  (point 3)
 *   canReject         — any status except 'rejected'  (point 4)
 *   canSetDraft       — any status except 'draft'     (point 5)
 * Everyone else keeps the pre-existing rules:
 *   canRequestApprove — edit_order, on a draft/rejected order
 *   canApprove/Reject — approve_order, on a wait_approval order only
 *   canSetDraft       — never (this action is self-approver-only)
 */
function approveActionFlags_(user, row, approveStatus, config) {
  var flowOn = approvalFlowEnabled_(config);
  if (!flowOn) {
    return { canRequestApprove: false, canApprove: false, canReject: false, canSetDraft: false };
  }

  var selfApprover = isSelfApprover_(user, row, config);
  var mayApprove = mayAct_(user, row, 'approve_order');

  if (selfApprover) {
    return {
      canRequestApprove: false,
      canApprove: approveStatus !== 'approved',
      canReject: approveStatus !== 'rejected',
      canSetDraft: approveStatus !== 'draft'
    };
  }

  return {
    canRequestApprove: mayAct_(user, row, 'edit_order') &&
      (approveStatus === 'draft' || approveStatus === 'rejected'),
    canApprove: mayApprove && approveStatus === 'wait_approval',
    canReject: mayApprove && approveStatus === 'wait_approval',
    canSetDraft: false
  };
}

function actionUpdateOrder_(user, payload) {
  requirePermission_(user, 'edit_order');

  var row = findOrderRow_(payload && payload.orderId);
  requireOwnershipOrAll_(user, row);

  // Milestone 3 / 3.8 — the approve-status edit gate. This is a SERVER check,
  // not a UI hint: a user whose edit_order is real but who lacks both
  // approve_order and can_edit_approved_order must be refused here even if
  // they call updateOrder directly, bypassing whatever the client hides.
  var config = readPublicConfig_();
  var previousApproveStatus = String(row.approveStatus || 'draft');
  if (!canEditForApproveStatus_(user, previousApproveStatus, config)) {
    throw new Error(MSG.APPROVE_STATUS_EDIT_DENIED);
  }

  var clean = validateOrderPayload_(payload, user);
  var previousStatus = String(row.status || '');

  if (clean.status !== previousStatus) {
    requirePermission_(user, 'change_status');
  }

  // Milestone 3 / 3.8 — save-time approve-status transition (points 8/9).
  // Every save defaults to 'draft' UNLESS the saving user holds approve_order
  // AND explicitly confirmed the auto-approve prompt on the client (payload.
  // confirmApprove === true). This check runs on every save by an
  // approve_order holder, not only saves of a wait_approval/approved order
  // (per the user's explicit answer: "Every save by an edit+approve user").
  // When the flag is off, approveStatus is left exactly as it was — the
  // column is inert until a deployment turns the flow on.
  var nextApproveStatus = previousApproveStatus;
  if (approvalFlowEnabled_(config)) {
    if (hasPermission_(user, 'approve_order') && payload && payload.confirmApprove === true) {
      nextApproveStatus = 'approved';
    } else {
      nextApproveStatus = 'draft';
    }
  }

  // A user who cannot SEE money must not be able to erase it. Their form has no
  // price inputs, so anything it sends for those columns is a zero by omission —
  // the stored value wins instead.
  var blindToMoney = !seesMoney_(user);

  withOrderLock_(function () {
    // Re-read inside the lock: another save may have landed since the check
    // above — including someone else's approve/reject/request-approve, which
    // could have moved this order into a stricter approveStatus. Re-check the
    // edit gate against the FRESH row, not the one read before the lock.
    var current = findOrderRow_(row.orderId);
    if (!canEditForApproveStatus_(user, String(current.approveStatus || 'draft'), config)) {
      throw new Error(MSG.APPROVE_STATUS_EDIT_DENIED);
    }
    var existing = linesForOrder_(current.orderId);
    var byId = {};
    existing.forEach(function (line) { byId[String(line.lineId)] = line; });

    var kept = {};
    var saved = [];
    var maxSeq = maxLineSequence_(existing);

    // Same reasoning as the order-level fields in updateRecord_ below: a
    // line field this user's visible_fields excludes was never in their
    // form, so preserve the stored value on a matched (existing) line
    // instead of trusting a blank the client never showed. Only meaningful
    // for a MATCHED line — a brand new line has no prior value to protect.
    var lineFieldsHidden = {
      productCode: !fieldVisible_(user, 'productCode'),
      uom: !fieldVisible_(user, 'uom'),
      note: !fieldVisible_(user, 'note'),
      invoice: !fieldVisible_(user, 'invoiceNo') // invoiceNo/invoiceDate are edited as one pair
    };

    clean.lines.forEach(function (input, i) {
      var lineNo = i + 1;
      var match = input.lineId ? byId[input.lineId] : null;

      if (match && blindToMoney) {
        input.unitPrice = num_(match.unitPrice);
        input.vatRate = num_(match.vatRate);
      }
      if (match) {
        if (lineFieldsHidden.productCode) input.productCode = match.productCode;
        if (lineFieldsHidden.uom) input.uom = match.uom;
        if (lineFieldsHidden.note) input.note = match.note;
      }

      if (match) {
        // id never changes on edit, and it comes from the SHEET, not the client
        var updated = buildLineRecord_(current.orderId, lineNo, input, user, match.lineId);
        if (lineFieldsHidden.invoice) {
          // buildLineRecord_ re-derives invoiceId from input.invoiceNo/
          // invoiceDate, which for a blind-to-invoices role are always
          // blank — that would silently unlink an existing invoice. Keep
          // whatever was already stored instead.
          updated.invoiceId = match.invoiceId;
        }
        updateRecord_(SHEETS.ORDER_LINES, match._row, updated);
        kept[String(match.lineId)] = true;
        saved.push(updated);
      } else {
        // No match: an unknown lineId is treated as a new line, never trusted as
        // an id — otherwise a client could point a line at another order's row.
        // Security review, 2026-08-27: a brand new line has no stored value to
        // preserve, so lineFieldsHidden/blindToMoney above (which only fire
        // `if (match)`) never touch it — clamp hidden fields here the same
        // way clampHiddenOrderFields_ does for a whole new order, otherwise
        // adding a line is an unguarded way to write a price or a hidden
        // field this user's own form never lets them set.
        clampHiddenLineFields_(user, input);
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
      // po / poNote / statusNote / supplierName: preserve the stored value
      // when this user's visible_fields excludes the field — see
      // fieldVisible_ above. customer / orderDate / status are always
      // rendered regardless of visible_fields, so they stay unconditional.
      po: fieldVisible_(user, 'po') ? clean.po : current.po,
      poNote: fieldVisible_(user, 'poNote') ? clean.poNote : current.poNote,
      customer: clean.customer,
      orderDate: clean.orderDate,
      status: clean.status,
      statusNote: fieldVisible_(user, 'statusNote') ? clean.statusNote : current.statusNote,
      customerDeposit: blindToMoney ? num_(current.customerDeposit) : clean.customerDeposit,
      supplierName: fieldVisible_(user, 'supplierName') ? clean.supplierName : current.supplierName,
      supplierPaid: blindToMoney ? num_(current.supplierPaid) : clean.supplierPaid,
      totalExVat: totals.exVat,
      totalIncVat: totals.incVat,
      lineCount: saved.length,
      approveStatus: nextApproveStatus,
      updatedBy: user.email,
      updatedAt: new Date(),
      // Revision 2026-09-03e — restored: a save that lands on 'approved'
      // (the save-time auto-approve prompt) stamps these the same as
      // actionApproveOrder_ and the create-time path do. A save that
      // does NOT change approveStatus, or moves it to draft/rejected/
      // wait_approval, leaves the existing stored value untouched
      // (updateRecord_ only overwrites keys it's given — this key is
      // simply omitted in that branch, same pattern as the other
      // fieldVisible_-gated columns above).
      approvedBy: nextApproveStatus === 'approved' ? user.email : current.approvedBy,
      approvedAt: nextApproveStatus === 'approved' ? new Date() : current.approvedAt
    });

    if (clean.status !== previousStatus) {
      appendStatusHistory_(current.orderId, previousStatus, clean.status,
                           clean.statusNote, user, 'status');
    }
    // current.approveStatus (not previousApproveStatus, read before the lock)
    // is the value the gate above just re-verified against — logging against
    // it keeps the history row honest even if something changed in between.
    var approveStatusBefore = String(current.approveStatus || 'draft');
    if (nextApproveStatus !== approveStatusBefore) {
      appendStatusHistory_(current.orderId, approveStatusBefore, nextApproveStatus,
                           '', user, 'approveStatus');
    }
  });

  bumpOrdersVersion_();
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
                         'Xoá đơn hàng', user, 'status');
  });

  bumpOrdersVersion_();
  return { deleted: true, orderId: row.orderId };
}

/**
 * Milestone 3 / 3.5 — one-purpose status change, for the quick control on
 * the order list card. Deliberately separate from actionUpdateOrder_: that
 * one requires the WHOLE order + all its lines and re-validates everything,
 * which is the right shape for the edit form but far too much to ask for
 * "flip this one order from confirmed to delivered" from a list of cards.
 * Same rules as the status change inside actionUpdateOrder_ (change_status,
 * ownership, a known status, StatusHistory with who/when) — just without
 * the rest of the order along for the ride.
 */
function actionChangeStatus_(user, payload) {
  requirePermission_(user, 'change_status');

  var row = findOrderRow_(payload && payload.orderId);
  requireOwnershipOrAll_(user, row);

  var config = readPublicConfig_();
  var newStatus = text_(payload && payload.status);
  if (!newStatus || !isKnownStatus_(config, newStatus)) {
    throw new Error(MSG.ORDER_BAD_STATUS);
  }

  var note = text_(payload && payload.note);
  var wroteChange = false;

  withOrderLock_(function () {
    // Re-read (and re-compare) INSIDE the lock, not just before it: someone
    // else's status change may have landed between the check above and
    // acquiring the lock, and comparing against a stale `row.status` could
    // either skip a real change or log a false "X → X" no-op.
    var current = findOrderRow_(row.orderId);
    var previousStatus = String(current.status || '');
    if (newStatus === previousStatus) return; // nothing to do, nothing to log

    updateRecord_(SHEETS.ORDERS, current._row, {
      status: newStatus,
      updatedBy: user.email,
      updatedAt: new Date()
    });
    appendStatusHistory_(current.orderId, previousStatus, newStatus, note, user, 'status');
    wroteChange = true;
  });

  if (wroteChange) bumpOrdersVersion_();
  return { orderId: row.orderId, status: newStatus };
}

/**
 * Milestone 3 / 3.8 — request approval. Moves a draft/rejected order into
 * wait_approval. REPLACES the 3.6 actionApproveOrder_ outright (per the
 * user's explicit "Replace outright" answer) rather than living alongside
 * it. Requires only edit_order (+ ownership) — this is the "Gửi duyệt"
 * button every editor sees on their own draft/rejected orders, not an
 * approver-only action.
 */
function actionRequestApprove_(user, payload) {
  requirePermission_(user, 'edit_order');

  var row = findOrderRow_(payload && payload.orderId);
  requireOwnershipOrAll_(user, row);

  var config = readPublicConfig_();
  if (!approvalFlowEnabled_(config)) {
    throw new Error(MSG.APPROVAL_FLOW_DISABLED);
  }

  var now = new Date();
  withOrderLock_(function () {
    var current = findOrderRow_(row.orderId);
    var before = String(current.approveStatus || 'draft');
    if (before !== 'draft' && before !== 'rejected') {
      throw new Error(MSG.APPROVE_STATUS_NOT_DRAFTLIKE);
    }
    updateRecord_(SHEETS.ORDERS, current._row, {
      approveStatus: 'wait_approval',
      updatedBy: user.email,
      updatedAt: now
    });
    appendStatusHistory_(current.orderId, before, 'wait_approval', '', user, 'approveStatus');
  });

  bumpOrdersVersion_();
  return { orderId: row.orderId, approveStatus: 'wait_approval' };
}

/**
 * Milestone 3 / 3.8 — approve. Requires approve_order (+ ownership) only;
 * can_edit_approved_order alone does not grant this (per the user's explicit
 * "can_approve only" answer). Only a wait_approval order may be approved.
 */
function actionApproveOrder_(user, payload) {
  requirePermission_(user, 'approve_order');

  var row = findOrderRow_(payload && payload.orderId);
  requireOwnershipOrAll_(user, row);

  var config = readPublicConfig_();
  if (!approvalFlowEnabled_(config)) {
    throw new Error(MSG.APPROVAL_FLOW_DISABLED);
  }

  var now = new Date();
  withOrderLock_(function () {
    var current = findOrderRow_(row.orderId);
    var before = String(current.approveStatus || 'draft');
    // Logic revision 2026-09-03 (point 3) — a self-approver may approve from
    // ANY status except one already approved; everyone else still needs the
    // order to be sitting at wait_approval. Re-derived inside the lock
    // against the FRESH row for the same reason the edit gate is.
    if (isSelfApprover_(user, current, config)) {
      if (before === 'approved') throw new Error(MSG.APPROVE_STATUS_ALREADY_APPROVED);
    } else if (before !== 'wait_approval') {
      throw new Error(MSG.APPROVE_STATUS_NOT_PENDING);
    }
    updateRecord_(SHEETS.ORDERS, current._row, {
      approveStatus: 'approved',
      updatedBy: user.email,
      updatedAt: now,
      // Revision 2026-09-03e — restored: written on every transition INTO
      // 'approved' (same mirror as rejectReason/rejectedBy/rejectedAt on
      // actionRejectOrder_ above). Retired at 3.8, brought back per
      // Phong's explicit request — write-only for now, no UI change.
      approvedBy: user.email,
      approvedAt: now
    });
    appendStatusHistory_(current.orderId, before, 'approved', '', user, 'approveStatus');
  });

  bumpOrdersVersion_();
  return { orderId: row.orderId, approveStatus: 'approved' };
}

/**
 * Milestone 3 / 3.8 — reject, with an optional note (per the user's explicit
 * "Optional note on reject" answer). Same permission as approve: approve_order
 * only. Only a wait_approval order may be rejected.
 */
function actionRejectOrder_(user, payload) {
  requirePermission_(user, 'approve_order');

  var row = findOrderRow_(payload && payload.orderId);
  requireOwnershipOrAll_(user, row);

  var config = readPublicConfig_();
  if (!approvalFlowEnabled_(config)) {
    throw new Error(MSG.APPROVAL_FLOW_DISABLED);
  }

  var note = text_(payload && payload.note);
  var now = new Date();
  withOrderLock_(function () {
    var current = findOrderRow_(row.orderId);
    var before = String(current.approveStatus || 'draft');
    // Logic revision 2026-09-03 (point 4) — mirror of the approve gate: a
    // self-approver may reject from ANY status except one already rejected.
    if (isSelfApprover_(user, current, config)) {
      if (before === 'rejected') throw new Error(MSG.APPROVE_STATUS_ALREADY_REJECTED);
    } else if (before !== 'wait_approval') {
      throw new Error(MSG.APPROVE_STATUS_NOT_PENDING);
    }
    updateRecord_(SHEETS.ORDERS, current._row, {
      approveStatus: 'rejected',
      updatedBy: user.email,
      updatedAt: now,
      // Revision 2026-09-03d — written directly on the order row instead
      // of being read back from StatusHistory on every detail load (see
      // Config.gs's HEADERS.Orders comment for why).
      rejectReason: note,
      rejectedBy: user.email,
      rejectedAt: now
    });
    appendStatusHistory_(current.orderId, before, 'rejected', note, user, 'approveStatus');
  });

  bumpOrdersVersion_();
  return { orderId: row.orderId, approveStatus: 'rejected' };
}

/**
 * Logic revision 2026-09-03 (point 5) — send an order back to Nháp. New in
 * this revision; there was no way to undo an approve/reject before, short
 * of saving the order again (which forced a draft as a side effect rather
 * than as an explicit, auditable action).
 *
 * Self-approver ONLY (edit_order AND approve_order, plus ownership): this
 * reopens an order for editing, so it needs the same authority as approving
 * it in the first place — requiring both permissions here, rather than
 * either one, is what keeps a pure approver from quietly unapproving work
 * they cannot edit, and a plain editor from bypassing a rejection.
 */
function actionSetDraftOrder_(user, payload) {
  requirePermission_(user, 'edit_order');
  requirePermission_(user, 'approve_order');

  var row = findOrderRow_(payload && payload.orderId);
  requireOwnershipOrAll_(user, row);

  var config = readPublicConfig_();
  if (!approvalFlowEnabled_(config)) {
    throw new Error(MSG.APPROVAL_FLOW_DISABLED);
  }

  var now = new Date();
  withOrderLock_(function () {
    var current = findOrderRow_(row.orderId);
    if (!isSelfApprover_(user, current, config)) {
      throw new Error(MSG.APPROVE_STATUS_SET_DRAFT_DENIED);
    }
    var before = String(current.approveStatus || 'draft');
    if (before === 'draft') throw new Error(MSG.APPROVE_STATUS_ALREADY_DRAFT);

    updateRecord_(SHEETS.ORDERS, current._row, {
      approveStatus: 'draft',
      updatedBy: user.email,
      updatedAt: now
    });
    appendStatusHistory_(current.orderId, before, 'draft', '', user, 'approveStatus');
  });

  bumpOrdersVersion_();
  return { orderId: row.orderId, approveStatus: 'draft' };
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

  // Milestone 3 / 3.8 — approveStatus/updatedBy/updatedAt are already kept
  // by ALWAYS_VISIBLE_FIELDS, defaulted here for a pre-migration row.
  var approveStatus = String(row.approveStatus || 'draft');
  order.approveStatus = approveStatus;

  var config = readPublicConfig_();
  var editGateOk = canEditForApproveStatus_(user, approveStatus, config);
  order.canEdit = mayAct_(user, row, 'edit_order') && editGateOk;
  order.canDelete = mayAct_(user, row, 'delete_order');
  order.canChangeStatus = hasPermission_(user, 'change_status');

  // Logic revision 2026-09-03 — same shared helper as listCardView_, so the
  // list card and the detail screen can never disagree about which approve
  // actions this user has on this order.
  var flags = approveActionFlags_(user, row, approveStatus, config);
  order.canRequestApprove = flags.canRequestApprove;
  order.canApprove = flags.canApprove;
  order.canReject = flags.canReject;
  order.canSetDraft = flags.canSetDraft;

  // Revision 2026-09-03b/d — surface the reject reason on the detail
  // screen (B2 banner), read directly off the order row (see
  // rejectReason/rejectedBy/rejectedAt in HEADERS.Orders) rather than
  // scanned back out of StatusHistory. Only exposed when the approval
  // flow is actually on AND the order is currently rejected — with the
  // flag off there's no approve/reject workflow to explain a rejection
  // for, even if a stale value happens to still be sitting on the row.
  // filterVisibleFields_ above may already have copied these straight
  // through for a '*' (admin) visible_fields profile, so they're always
  // deleted first and only re-added when the gate actually passes —
  // otherwise a flag-off response would still leak a stale reason.
  delete order.rejectReason;
  delete order.rejectedBy;
  delete order.rejectedAt;
  if (approvalFlowEnabled_(config) && approveStatus === 'rejected' && row.rejectReason) {
    order.rejectReason = row.rejectReason;
    order.rejectedBy = row.rejectedBy;
    order.rejectedAt = row.rejectedAt;
  }

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

/**
 * Full-sheet line count, keyed by orderId. No longer used by actionListOrders_
 * as of Milestone 2.5 / P5 — that reads the maintained `lineCount` column on
 * Orders instead. Kept for `migrateAddLineCount()` (Migrations.gs), which
 * needs exactly this to backfill orders that predate the column, and for any
 * future audit that wants to double-check the column against ground truth.
 */
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

/* =======================================================================
   Milestone 2.5 / P7 — list page cache (CacheService + ordersVersion)
   ======================================================================= */

/**
 * Current global orders version. Starts at 1. Stored in ScriptCache so it is
 * shared across all concurrent executions of this project.
 *
 * Failure-safe like its siblings below: if CacheService is unavailable or
 * throws, this must degrade to "treat the cache as empty" (version 1), never
 * take the whole list request down with it. A missed version bump / read is
 * the same acceptable risk bumpOrdersVersion_ already documents — a possibly
 * stale page until TTL, never a correctness or security problem.
 */
function getOrdersVersion_() {
  try {
    var cache = CacheService.getScriptCache();
    var raw = cache.get(CACHE.ORDERS_VERSION_KEY);
    var n = parseInt(raw, 10);
    return (n && n > 0) ? n : 1;
  } catch (err) {
    console.error('getOrdersVersion_ failed: ' + err);
    return 1;
  }
}

/**
 * Bump the version after any order write. All previous list cache keys become
 * unreachable (they embed the old version). Failures are swallowed — a missed
 * bump only means a stale page may be served until TTL expires, never a
 * security hole (keys are still per-user).
 */
function bumpOrdersVersion_() {
  try {
    var cache = CacheService.getScriptCache();
    var next = getOrdersVersion_() + 1;
    // 6 hours — long enough that a quiet system does not reset to 1 and
    // accidentally re-hit an old key that somehow still exists.
    cache.put(CACHE.ORDERS_VERSION_KEY, String(next), 21600);
  } catch (err) {
    console.error('bumpOrdersVersion_ failed: ' + err);
  }
}

function listCacheKey_(version, email, page, pageSize, dateFilter, customerFilter, statusFilter, createdByFilter, searchQuery, approveStatusFilter) {
  var safeEmail = String(email || '').trim().toLowerCase().replace(/[^a-z0-9@._+-]/g, '_');
  // Milestone 3 / 3.2-3.4: fold every filter into the key so a filtered and an
  // unfiltered (or differently-filtered) request for the same page never
  // collide on the same cache entry. safeToken_ keeps arbitrary customer/
  // createdBy/search text from breaking the key's own delimiter structure.
  var f = (dateFilter && (dateFilter.fromTime !== null || dateFilter.toTime !== null))
    ? (':f' + (dateFilter.fromTime === null ? '' : dateFilter.fromTime) +
       '-' + (dateFilter.toTime === null ? '' : dateFilter.toTime))
    : '';
  var c = customerFilter ? (':c' + safeToken_(customerFilter)) : '';
  var st = statusFilter ? (':st' + safeToken_(statusFilter)) : '';
  var cb = createdByFilter ? (':cb' + safeToken_(createdByFilter)) : '';
  var q = searchQuery ? (':q' + safeToken_(searchQuery)) : '';
  var ap = approveStatusFilter ? (':ap' + safeToken_(approveStatusFilter)) : '';
  return CACHE.LIST_KEY_PREFIX +
         'v' + version +
         ':u' + safeEmail +
         ':p' + page +
         ':s' + pageSize +
         f + c + st + cb + q + ap;
}

/** Cache-key-safe token: anything not alphanumeric/@._- collapses to '_'. */
function safeToken_(value) {
  return String(value || '').replace(/[^a-z0-9@._+-]/gi, '_');
}

function getListCache_(key) {
  try {
    var raw = CacheService.getScriptCache().get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function putListCache_(key, value) {
  try {
    CacheService.getScriptCache().put(
      key,
      JSON.stringify(value),
      CACHE.LIST_TTL_SECONDS
    );
  } catch (err) {
    // Cache is best-effort. A put failure must never break the list response.
    console.error('putListCache_ failed: ' + err);
  }
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

/**
 * Generalizes the money-blindness reasoning (above) to any other optional
 * order-level field: a field this user's visible_fields excludes was never
 * rendered in their form, so whatever the client sent for it is a blank
 * default, not a deliberate edit. Used by actionUpdateOrder_ to decide,
 * per field, whether to trust the incoming value or keep what is already
 * stored. Money fields keep their own coarser, already-tested rule
 * (blindToMoney / seesMoney_ — "sees ANY money field") rather than going
 * through this; this covers po / poNote / statusNote / supplierName, which
 * have nothing to do with money but can independently be left out of a
 * hand-typed visible_fields array (see docs/PERMISSIONS.md history — its
 * own examples still said `orderNo` for a while after Q3 replaced it with
 * `po`, exactly the kind of stale config this guards against).
 */
function fieldVisible_(user, field) {
  var allowed = visibleFields_(user);
  if (allowed.length === 1 && allowed[0] === '*') return true;
  return allowed.indexOf(field) >= 0;
}

/**
 * Security review, 2026-08-27: "hide the field" must mean "this user cannot
 * set it", not just "cannot see its old value overwritten". blindToMoney /
 * fieldVisible_ / lineFieldsHidden (used inside actionUpdateOrder_) all
 * follow the pattern "if the field is hidden, keep whatever is already
 * stored" — correct for editing something that already exists, but silent
 * on a BRAND NEW order or line, where there is nothing stored yet to fall
 * back to. Without this, a role whose web form never renders a price/PO/
 * product-code input for a new record could still set one by calling the
 * API directly (Postman, browser console, a captured request replayed with
 * different values) instead of through the form. These two functions are
 * the single place that clamps every such field to its safe default (0 for
 * money, '' for text) on anything new — called from actionCreateOrder_ for
 * the whole order, and from actionUpdateOrder_ for each newly-added line.
 */
function clampHiddenOrderFields_(user, clean) {
  if (!seesMoney_(user)) {
    clean.customerDeposit = 0;
    clean.supplierPaid = 0;
  }
  if (!fieldVisible_(user, 'po')) clean.po = '';
  if (!fieldVisible_(user, 'poNote')) clean.poNote = '';
  if (!fieldVisible_(user, 'statusNote')) clean.statusNote = '';
  if (!fieldVisible_(user, 'supplierName')) clean.supplierName = '';
  (clean.lines || []).forEach(function (line) { clampHiddenLineFields_(user, line); });
}

/** Per-line half of clampHiddenOrderFields_ — see that comment. */
function clampHiddenLineFields_(user, line) {
  if (!seesMoney_(user)) {
    line.unitPrice = 0;
    line.vatRate = 0;
  }
  if (!fieldVisible_(user, 'productCode')) line.productCode = '';
  if (!fieldVisible_(user, 'uom')) line.uom = '';
  if (!fieldVisible_(user, 'note')) line.note = '';
  if (!fieldVisible_(user, 'invoiceNo')) {
    line.invoiceNo = '';
    line.invoiceDate = null;
  }
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

function appendStatusHistory_(orderId, oldStatus, newStatus, note, user, field) {
  appendRecord_(SHEETS.STATUS_HISTORY, {
    historyId: 'LS-' + Utilities.getUuid().substring(0, 8).toUpperCase(),
    orderId: orderId,
    oldStatus: oldStatus,
    newStatus: newStatus,
    note: text_(note),
    changedBy: user.email,
    changedAt: new Date(),
    // Milestone 3 / 3.8 — disambiguates which of an order's two status
    // columns this row describes. Every existing call site passes 'status'
    // explicitly now; a row written before this column existed reads back
    // with an empty field cell, which historyField_ below treats as 'status'.
    field: field || 'status'
  });
}

/** @return {string} 'status' or 'approveStatus' — see appendStatusHistory_. */
function historyField_(row) {
  var f = String((row && row.field) || '').trim();
  return f === 'approveStatus' ? 'approveStatus' : 'status';
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
