/**
 * DevSeed.gs — throwaway test data, run manually from the API editor.
 *
 * Answers Phong's ask on 2026-08-20 while testing Milestone 2.5 / P4: a way to
 * get "enough" orders into the sheet to actually see pagination, the "Xem
 * thêm" button, and the P1 timing numbers move, without typing 30 orders by
 * hand through the form.
 *
 * seedTestOrders(count) creates `count` orders through the REAL
 * actionCreateOrder_ path — same validation, same DH-2026-nnnn id
 * allocation, same StatusHistory row, same rememberCustomer_ — so seeded
 * data behaves exactly like anything a person typed. The only thing that
 * marks a row as fake is its `po`, always "SEED-<n>"; customer names are
 * prefixed "TEST " for the same reason, visible at a glance in the sheet.
 *
 * deleteSeedTestOrders() finds every order by that "SEED-" po prefix and
 * removes it along with its lines and status history, so cleanup never
 * depends on remembering which ids a particular run created.
 *
 * HOW TO RUN
 *   1. Same project, same setup as setupMilestone1/2 (see Setup.gs) — this
 *      needs ADMIN_EMAIL set and that admin already seeded into Users.
 *   2. Select `seedTestOrders` in the editor's Run dropdown and press Run.
 *      No arguments needed — it defaults to 30. Run it again to add another
 *      batch — nothing here is idempotent on purpose, unlike setupMilestone1/2,
 *      you are explicitly asking for more rows.
 *   3. When done testing, select `deleteSeedTestOrders` and press Run once.
 *
 * RESUMABLE ACROSS RUNS (2026-08-26): each run scans the sheet for the
 * highest existing "SEED-<n>" po tag (see nextSeedNumber_()) and starts
 * numbering from n+1, instead of restarting at SEED-1 every time. That means:
 *   - Running seedTestOrders(30) then seedTestOrders(30) again gives you
 *     SEED-1..SEED-30 and then SEED-31..SEED-60 — 60 distinct orders, never
 *     two rows sharing a po tag.
 *   - orderId/lineId can never collide either way — those already come from
 *     nextOrderId_()/makeLineId_() in Orders.gs, which allocate off the real
 *     sheet contents regardless of what seeded this data.
 *   - This is exactly what makes it safe to run in several smaller batches
 *     (e.g. five runs of 40 instead of one run of 200) rather than one very
 *     long single execution — each run pays its own latency and picks up
 *     exactly where the last one left off.
 *
 * DO NOT run this against a spreadsheet holding real customer data unless you
 * intend to clean it up afterward with deleteSeedTestOrders(). It writes real
 * rows through the real create path — there is no "test mode" flag on the
 * spreadsheet itself, only the SEED- tag on the rows it creates.
 *
 * A NOTE ON TIME: each order goes through the full create path (id
 * allocation, line writes, status history, rememberCustomer_) with no
 * batching — Milestone 2.5 hasn't gotten to that yet (P6 is the closest).
 * Expect roughly one write's worth of latency per order. 200 is capped here
 * as a safety margin under Apps Script's 6-minute execution limit; if you
 * want more than that, run it more than once.
 *
 * A NOTE ON lineCount (Milestone 2.5 / P5): actionCreateOrder_ writes
 * lineCount on every order it creates, seeded ones included — but only if
 * the Orders sheet actually has that column yet (see migrateAddLineCount()
 * in Migrations.gs for why it might not). seedTestOrders() calls
 * ensureLineCountColumn_() first so seeded rows keep their lineCount even on
 * a sheet nobody has migrated yet — a NEW column is all it adds, never a
 * backfill of old rows, so this stays cheap and doesn't do migrateAddLineCount's
 * job for it. Existing pre-P5 orders still show 0 dòng until Phong actually
 * runs migrateAddLineCount() himself.
 */
function seedTestOrders(count) {
  guardSetup_();
  ensureLineCountColumn_();

  count = Math.min(Math.max(parseInt(count, 10) || 30, 1), 200);

  var email = String(
    PropertiesService.getScriptProperties().getProperty(PROP.ADMIN_EMAIL) || ''
  ).trim().toLowerCase();
  if (!email) throw new Error('seedTestOrders: ADMIN_EMAIL is not set — see Setup.gs.');

  // Real loadUser_() call, not a hand-built object: whatever permissions the
  // admin actually holds in the Users sheet are what seeds the data, exactly
  // as if the admin had typed it in themselves.
  var admin = loadUser_(email);

  var customers = ['Nhựa Duy Tân', 'Yamato', 'ACME Corp', 'Tâm Thịnh Phát',
                    'Song Long', 'Kim Sơn', 'Đại Phát', 'Hưng Thịnh'];
  var statuses = seedStatusKeys_();
  var firstId = null, lastId = null;

  var startSeed = nextSeedNumber_();

  for (var i = 0; i < count; i++) {
    var seedNo = startSeed + i;

    // Spread orderDate across the past `count` days so newest-first sorting
    // (and pagination across that order) is actually exercised, rather than
    // every row landing on the same date and tying on createdAt instead.
    var orderDate = new Date();
    orderDate.setDate(orderDate.getDate() - (count - i));

    var lineCount = 1 + (seedNo % 5); // 1..5 lines, so card lineCount varies too
    var lines = [];
    for (var l = 0; l < lineCount; l++) {
      lines.push({
        description: 'Hàng mẫu ' + seedNo + '.' + (l + 1),
        qty: 1 + (l % 4),
        unitPrice: String(100000 * (1 + ((seedNo + l) % 10))),
        uom: 'Cái',
        vatRate: (l % 2 === 0) ? 0.08 : 0.1
      });
    }

    var result = actionCreateOrder_(admin, {
      order: {
        customer: 'TEST ' + customers[seedNo % customers.length],
        orderDate: orderDate,
        status: statuses[seedNo % statuses.length],
        po: 'SEED-' + seedNo
      },
      lines: lines
    });

    if (!firstId) firstId = result.order.orderId;
    lastId = result.order.orderId;
  }

  var summary = 'seedTestOrders: created ' + count + ' order(s) (SEED-' + startSeed + ' .. SEED-' +
    (startSeed + count - 1) + '), ' + firstId + ' .. ' + lastId +
    '. Run again any time to add more — it will continue from SEED-' + (startSeed + count) +
    '. Run deleteSeedTestOrders() when done testing.';
  console.log(summary);
  return summary;
}

/**
 * Scans the Orders sheet for the highest "SEED-<n>" po tag already present
 * and returns n+1 (or 1 if no seeded order exists yet), so seedTestOrders()
 * continues numbering instead of restarting at SEED-1 every run.
 *
 * A plain max-scan, not a counter stored anywhere: it reads whatever is
 * ACTUALLY in the sheet right now, so it stays correct even if some seeded
 * orders were deleted by hand, deleteSeedTestOrders() was run partway, or
 * the sheet was restored from an older backup.
 */
function nextSeedNumber_() {
  var highest = 0;
  readAll_(SHEETS.ORDERS).forEach(function (o) {
    var m = /^SEED-(\d+)$/.exec(String(o.po || ''));
    if (m) highest = Math.max(highest, parseInt(m[1], 10));
  });
  return highest + 1;
}

/** Status keys from Config, falling back to 'draft' if Config isn't seeded yet. */
function seedStatusKeys_() {
  var list = (readPublicConfig_().statusList || []).map(function (s) { return s.key; });
  return list.length ? list : ['draft'];
}

/**
 * Removes every order seedTestOrders() created, matched by the "SEED-" po
 * prefix — a real order never gets that prefix, so this is safe to run even
 * long after seeding without needing to remember which ids a run produced.
 *
 * Everything happens inside one lock, re-reading `_row` at delete time (same
 * "re-read inside the lock" pattern actionUpdateOrder_ and actionDeleteOrder_
 * use) rather than trusting row numbers captured before the lock was held.
 * Invoices are deliberately left untouched: seeded lines never carry an
 * invoiceNo, so none should exist for a SEED- order, but if one somehow did,
 * an invoice can be shared with a real order (see ensureInvoice_ in
 * Orders.gs) and deleting it blind would be the wrong call.
 */
function deleteSeedTestOrders() {
  guardSetup_();

  var deletedCount = 0;
  withOrderLock_(function () {
    var toDelete = readAll_(SHEETS.ORDERS).filter(function (o) {
      return String(o.po || '').indexOf('SEED-') === 0;
    });
    if (!toDelete.length) return;

    var ids = {};
    toDelete.forEach(function (o) { ids[o.orderId] = true; });

    readAll_(SHEETS.ORDER_LINES)
      .filter(function (l) { return ids[l.orderId]; })
      .sort(function (a, b) { return b._row - a._row; })
      .forEach(function (l) { deleteRecord_(SHEETS.ORDER_LINES, l._row); });

    readAll_(SHEETS.STATUS_HISTORY)
      .filter(function (h) { return ids[h.orderId]; })
      .sort(function (a, b) { return b._row - a._row; })
      .forEach(function (h) { deleteRecord_(SHEETS.STATUS_HISTORY, h._row); });

    toDelete
      .sort(function (a, b) { return b._row - a._row; })
      .forEach(function (o) { deleteRecord_(SHEETS.ORDERS, o._row); });

    deletedCount = toDelete.length;
  });

  var summary = deletedCount
    ? 'deleteSeedTestOrders: removed ' + deletedCount + ' order(s) and their lines/history.'
    : 'deleteSeedTestOrders: nothing to delete (no order has a "SEED-" po).';
  console.log(summary);
  return summary;
}
