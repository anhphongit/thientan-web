/**
 * LegacyImportWriteOrder.gs — Milestone 7 / Phase 3: per-order write
 * mechanics for the legacy Excel import (writes to live Orders/OrderLines/
 * Invoices/StatusHistory). Split out of LegacyImportWrite.gs (which owns
 * orchestration: Drive conversion, the guardSetup_-guarded entry point, the
 * batch loop, and the run report) per the repo's 200-line modularization
 * rule — this file is deliberately the ONLY place in Milestone 7's code that
 * calls appendRecord_ against a live app sheet.
 *
 * Reuses the exact same primitives actionCreateOrder_ (Orders.gs) uses —
 * nextOrderId_, buildLineRecord_, sumLines_, appendStatusHistory_ — inside
 * the same withOrderLock_ scope, so an imported order behaves identically to
 * one a person typed through the form, minus the auth/permission/approve-
 * flow layers this editor-only migration doesn't need (see phase-03's Key
 * Insights).
 */

/**
 * Resolves one parsed order group's real historical date. The source sheet
 * has NO separate "order date" column (docs/EXCEL_REFERENCE.md §2) — the
 * only real date value on an order's rows is "Ngày HĐ" / Invoice date
 * (column K), normally present on the order's FIRST row alongside HÓA ĐƠN
 * (§3). Scans every line of the group (not just the first) for the first
 * parseable date, since a handful of orders may only carry it on a later
 * line. Returns null — never a fabricated date — if no line has one; the
 * caller must skip and flag that order rather than guess, the same "never
 * trust/guess silently" rule Phase 2's mapping followed throughout.
 */
function legacyResolveOrderDate_(group) {
  var lines = group.lines || [];
  for (var i = 0; i < lines.length; i++) {
    var parsed = legacyParseHistoricalDate_(lines[i].ngayHd);
    if (parsed) return parsed;
  }
  return null;
}

/**
 * Converts Phase 2's mapped line fields (`mapLegacyOrderGroup_`'s
 * `lineFields[]`) into the exact shape `buildLineRecord_` expects: real
 * numbers for unitPrice/qty (Phase 2 deliberately leaves these as raw
 * display strings — money/qty parsing is this phase's job, not the pure
 * mapping layer's, same as `validateLine_` does for a normal create via
 * `money_`/`quantity_`), and a real Date (or null) for invoiceDate — the
 * same conversion `validateLine_` performs before an invoice number is ever
 * handed to `ensureInvoice_`. Skipping that conversion would make
 * `makeInvoiceId_` silently fall back to the CURRENT year instead of the
 * invoice's real year (it only reads `invoiceDate.getFullYear()` when
 * `invoiceDate instanceof Date`).
 *
 * Throws on the FIRST line whose unitPrice/qty/invoiceDate cannot be parsed
 * — never returns a partially-converted array — so the caller can skip the
 * WHOLE order before any row is written for it (see legacyRunImportBatch_ in
 * LegacyImportWrite.gs).
 */
function legacyConvertLineFieldsOrThrow_(lineFields) {
  return lineFields.map(function (lf, idx) {
    var unitPrice = money_(lf.unitPrice);
    if (unitPrice === null) {
      throw new Error('line ' + (idx + 1) + ': unparseable unitPrice "' + lf.unitPrice + '"');
    }
    var qty = quantity_(lf.qty);
    if (qty === null) {
      throw new Error('line ' + (idx + 1) + ': unparseable/blank qty "' + lf.qty + '"');
    }

    var invoiceDate = null;
    if (lf.invoiceNo) {
      invoiceDate = legacyParseHistoricalDate_(lf.invoiceDate);
      if (!invoiceDate) {
        throw new Error('line ' + (idx + 1) + ': invoice "' + lf.invoiceNo +
          '" has no parseable invoice date');
      }
    }

    return {
      productCode: lf.productCode, description: lf.description,
      unitPrice: unitPrice, qty: qty, uom: lf.uom, vatRate: lf.vatRate,
      invoiceNo: lf.invoiceNo, invoiceDate: invoiceDate,
      customer: lf.customer, note: lf.note,
      status: lf.status, statusNote: lf.statusNote
    };
  });
}

/**
 * Writes ONE already-mapped-and-converted order into Orders/OrderLines/
 * Invoices/StatusHistory.
 *
 * WRITE ORDER — deliberately OrderLines (and StatusHistory) BEFORE the
 * Orders header row, the opposite of actionCreateOrder_'s order
 * (Orders.gs:387-418, header first — right for an interactive single-order
 * create whose UI polls the header back immediately). Wrong here: this
 * bulk/unattended migration writes ~206 orders sequentially against Apps
 * Script's 6-minute ceiling, so a mid-order crash is expected, not rare.
 * Header-first would leave, on a crash, an `Orders` row whose
 * `lineCount`/totals claim lines that were never written — and
 * `nextOrderId_()` always allocates a fresh id next run, so that broken row
 * is never revisited, only left behind while a full duplicate is written
 * under a new id. Lines/history-first instead leaves only orphaned rows
 * with no `Orders` header pointing at them — invisible to the app (reads by
 * iterating `Orders`, joining lines, never the reverse) and harmless until
 * the resume index (LegacyImportWriteResume.gs) re-attempts the order
 * whole. The header being the LAST append here is also what
 * LegacyImportWriteResume.gs's resume-index comment already assumes ("its
 * Orders header row is the last thing it appends").
 *
 * Lines are still built first (invoice-linked via ensureInvoice_ inside
 * buildLineRecord_) and totals still come from sumLines_ (server-
 * recomputed, never trusted from the source file) before any append.
 *
 * @param {Object} mapped `mapLegacyOrderGroup_`'s output — only
 *   `orderFields` is read here; `lineFields` is NOT used, pass the already
 *   validated/converted `convertedLines` instead (see
 *   legacyConvertLineFieldsOrThrow_ above).
 * @param {Array} convertedLines output of legacyConvertLineFieldsOrThrow_.
 * @param {Date} orderDate output of legacyResolveOrderDate_ — the real
 *   historical date, never the import run's date.
 * @param {Object} adminUser loadUser_() result every row is attributed to
 *   (see LegacyImportWrite.gs's migrateImportLegacyOrders()).
 * @return {string} the allocated orderId.
 */
function legacyWriteOneOrder_(mapped, convertedLines, orderDate, adminUser) {
  var orderId;
  var lineUoms;

  withOrderLock_(function () {
    orderId = nextOrderId_();
    // Milestone 7 / Phase 4 — tripwire: should never fire (see
    // LegacyImportWriteResume.gs), fails loud rather than silently
    // overwriting/duplicating OrderLines if it ever does. Must run right
    // after nextOrderId_() and before any appends — orthogonal to the
    // write-order fix above, it guards id-allocation collisions, not
    // append sequencing.
    legacyAssertNoOrderLinesForOrderId_(orderId);
    var now = new Date();

    var lines = convertedLines.map(function (lf, i) {
      return buildLineRecord_(orderId, i + 1, lf, adminUser, makeLineId_(orderId, i + 1));
    });
    var totals = sumLines_(lines);

    lines.forEach(function (line) { appendRecord_(SHEETS.ORDER_LINES, line); });

    // One StatusHistory row per line that carries a status — the note below
    // is what makes this distinguishable from a real user action in the
    // audit trail later (phase-03's Key Insights). Written before the Orders
    // header row too, same crash-safety rationale as OrderLines above.
    lines.forEach(function (line) {
      if (line.status) {
        appendStatusHistory_(orderId, line.lineId, '', line.status,
          'Nhập từ dữ liệu lịch sử', adminUser, 'status');
      }
    });

    appendRecord_(SHEETS.ORDERS, {
      orderId: orderId,
      po: mapped.orderFields.po,
      poNote: mapped.orderFields.poNote,
      customer: mapped.orderFields.customer,
      orderDate: orderDate,
      customerDeposit: mapped.orderFields.customerDeposit || 0,
      supplierName: mapped.orderFields.supplierName,
      supplierPaid: mapped.orderFields.supplierPaid || 0,
      totalExVat: totals.exVat,
      totalIncVat: totals.incVat,
      lineCount: lines.length,
      createdBy: adminUser.email,
      createdAt: now,
      updatedBy: adminUser.email,
      updatedAt: now,
      // Milestone 7 — an imported order starts life as an ordinary draft,
      // same as any create with no confirmApprove flag; nothing about a
      // historical import earns it a special approve-status shortcut.
      approvedBy: '',
      approvedAt: '',
      approveStatus: 'draft',
      rejectReason: '',
      rejectedBy: '',
      rejectedAt: ''
    });

    lineUoms = lines.map(function (line) { return line.uom; })
      .filter(function (u) { return u; });
  });

  // Milestone 7 / Fix 2 (code review 2026-09-16) — same self-fill mechanism
  // actionCreateOrder_ uses (Orders.gs:436-439): a historical customer/UoM
  // that has never appeared in a live-created order should still land in
  // Config.customerList/uomList so the create-order form's autocomplete
  // offers it, exactly as if a person had typed this order in themselves.
  // Called outside withOrderLock_, same placement actionCreateOrder_ itself
  // uses relative to its own withOrderLock_ block — these Config-sheet
  // writes are not part of the order's own critical section.
  rememberCustomer_(mapped.orderFields.customer);
  rememberUoms_(lineUoms);

  return orderId;
}
