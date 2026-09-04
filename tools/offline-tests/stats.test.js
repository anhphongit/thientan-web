/**
 * Offline tests for Milestone 4 / 4.7.3 — "stat by order, not order line"
 * revision of Stats.gs. Run with: node tools/offline-tests/stats.test.js
 *
 * Replaces the old per-line/basis-toggle test suite entirely: the basis
 * concept (order-date vs invoice-date) is gone, every view now sums
 * ORDERS (using each order's own totalExVat/totalIncVat/lineCount), and
 * a new includeNoInvoice toggle (default true) controls whether
 * unbilled orders/portions are folded in or split out to `noInvoice`.
 */
const H = require('./harness.js');
const { user, check, eq, throws } = H;

function line(over) {
  return Object.assign({ description: 'Ống nhựa PVC 90', qty: 2, unitPrice: 100000,
                         uom: 'Cái', vatRate: 0.08 }, over || {});
}
function order(over) {
  return Object.assign({ customer: 'Nhựa Duy Tân', orderDate: '2026-08-20',
                         status: 'draft', po: '4600041936' }, over || {});
}

/** Same helper export.test.js uses — attaches an invoice to one line by
 *  hand (no invoicing action/UI exists yet), purely to exercise the
 *  includeNoInvoice split. */
function attachInvoice(env, orderId, lineNo, invoiceDate, invoiceNo) {
  const invoiceId = 'inv-' + orderId + '-' + lineNo + '-' + Math.random().toString(36).slice(2, 7);
  env.appendRecord_('Invoices', {
    invoiceId: invoiceId, invoiceNo: invoiceNo || ('HD' + lineNo), invoiceDate: invoiceDate,
    customer: '', note: '', createdBy: '', createdAt: new Date()
  });
  const l = env.readAll_('OrderLines').find(x => x.orderId === orderId && Number(x.lineNo) === Number(lineNo));
  if (!l) throw new Error('attachInvoice: no line ' + lineNo + ' on order ' + orderId);
  env.updateRecord_('OrderLines', l._row, { invoiceId: invoiceId });
  return invoiceId;
}

function bucketFor(res, key) {
  return res.buckets.find(b => b.bucketKey === key);
}

/* ---------- 1. permission enforcement ---------- */
console.log('\n1. actionStatsRevenue_ requires view_statistics');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { view_statistics: true });
  const noStats = user('b@x.com', { view_statistics: false });
  env.actionCreateOrder_(admin, { order: order(), lines: [line()] });

  throws('refused without view_statistics', () => env.actionStatsRevenue_(noStats, {}), 'không có quyền');
  const res = env.actionStatsRevenue_(admin, {});
  check('allowed with view_statistics', Array.isArray(res.buckets));
}

/* ---------- 2. defaults: period=month, includeNoInvoice=true ---------- */
console.log('\n2. default period is month, default includeNoInvoice is true');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { view_statistics: true });
  const res = env.actionStatsRevenue_(admin, {});
  eq('period defaults to month', res.period, 'month');
  eq('includeNoInvoice defaults to true', res.includeNoInvoice, true);
}

/* ---------- 3. order-level totals used directly, no per-line summing needed ---------- */
console.log('\n3. buckets sum orders using their own totalExVat/totalIncVat, plus orderCount/lineCount');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { view_statistics: true });
  env.actionCreateOrder_(admin, {
    order: order({ orderDate: '2026-08-20' }),
    lines: [line({ qty: 2, unitPrice: 100000, vatRate: 0.08 })] // 200,000 exVat, 216,000 incVat
  });
  env.actionCreateOrder_(admin, {
    order: order({ orderDate: '2026-08-25' }),
    lines: [line({ qty: 1, unitPrice: 50000, vatRate: 0.1 }), line({ qty: 1, unitPrice: 10000, vatRate: 0.1 })] // 60,000 exVat, 66,000 incVat, 2 lines
  });

  const res = env.actionStatsRevenue_(admin, {});
  eq('exactly one bucket (both orders in August)', res.buckets.length, 1);
  const aug = bucketFor(res, '2026-08');
  check('bucket found', !!aug);
  eq('label is THÁNG 8', aug.label, 'THÁNG 8');
  eq('exVat summed correctly', aug.exVat, 260000);
  eq('incVat summed correctly', aug.incVat, 282000);
  eq('orderCount is 2 (two orders, not lines)', aug.orderCount, 2);
  eq('lineCount is 3 (1 + 2 lines)', aug.lineCount, 3);
  eq('noInvoice is zeroed when includeNoInvoice is true (default)', res.noInvoice.orderCount, 0);
}

/* ---------- 4. bucketing is always by ORDER date now — no basis concept ---------- */
console.log('\n4. an order\'s invoice date (if any) never affects which bucket it lands in');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { view_statistics: true });
  env.actionCreateOrder_(admin, {
    order: order({ orderDate: '2026-08-20' }),
    lines: [line({ qty: 1, unitPrice: 100000, vatRate: 0.08 })]
  });
  const created = env.readAll_('Orders')[0];
  attachInvoice(env, created.orderId, 1, '2026-09-05'); // invoice dated NEXT month

  const res = env.actionStatsRevenue_(admin, {});
  check('bucketed under 2026-08 (order month), not 2026-09 (invoice month)',
    !!bucketFor(res, '2026-08') && !bucketFor(res, '2026-09'));
  eq('August bucket has the order\'s figures', bucketFor(res, '2026-08').exVat, 100000);
}

/* ---------- 5. includeNoInvoice=false: fully-unbilled order excluded, folded into noInvoice ---------- */
console.log('\n5. includeNoInvoice=false: an order with zero invoiced lines is excluded, counted in noInvoice');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { view_statistics: true });
  env.actionCreateOrder_(admin, {
    order: order({ orderDate: '2026-08-20' }),
    lines: [line({ qty: 1, unitPrice: 300000, vatRate: 0.08 })]
  });

  const res = env.actionStatsRevenue_(admin, { includeNoInvoice: false });
  eq('no date buckets at all (the only order is fully unbilled)', res.buckets.length, 0);
  eq('noInvoice orderCount is 1', res.noInvoice.orderCount, 1);
  eq('noInvoice lineCount is 1', res.noInvoice.lineCount, 1);
  eq('noInvoice has the unbilled order\'s figures', res.noInvoice.exVat, 300000);
}

/* ---------- 6. includeNoInvoice=false: fully-invoiced order counts in full, noInvoice stays empty ---------- */
console.log('\n6. includeNoInvoice=false: a fully-invoiced order counts entirely toward its bucket');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { view_statistics: true });
  env.actionCreateOrder_(admin, {
    order: order({ orderDate: '2026-08-20' }),
    lines: [line({ qty: 1, unitPrice: 100000, vatRate: 0.08 }), line({ qty: 1, unitPrice: 50000, vatRate: 0.08 })]
  });
  const created = env.readAll_('Orders')[0];
  attachInvoice(env, created.orderId, 1, '2026-08-25');
  attachInvoice(env, created.orderId, 2, '2026-08-26');

  const res = env.actionStatsRevenue_(admin, { includeNoInvoice: false });
  const aug = bucketFor(res, '2026-08');
  check('bucket exists', !!aug);
  eq('bucket has BOTH lines\' figures (fully invoiced)', aug.exVat, 150000);
  eq('orderCount is 1 (one order, not split)', aug.orderCount, 1);
  eq('lineCount is 2', aug.lineCount, 2);
  eq('noInvoice is empty', res.noInvoice.orderCount, 0);
}

/* ---------- 7. includeNoInvoice=false: MIXED order splits into a counted portion + noInvoice ---------- */
console.log('\n7. includeNoInvoice=false: a mixed order (some lines billed, some not) splits into two portions');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { view_statistics: true });
  env.actionCreateOrder_(admin, {
    order: order({ orderDate: '2026-08-20' }),
    lines: [line({ description: 'A', qty: 1, unitPrice: 100000, vatRate: 0.08 }),
            line({ description: 'B', qty: 1, unitPrice: 300000, vatRate: 0.08 })]
  });
  const created = env.readAll_('Orders')[0];
  attachInvoice(env, created.orderId, 1, '2026-08-25'); // only line A is invoiced

  const res = env.actionStatsRevenue_(admin, { includeNoInvoice: false });
  const aug = bucketFor(res, '2026-08');
  check('bucket exists (the invoiced portion counts)', !!aug);
  eq('bucket has only line A\'s figures', aug.exVat, 100000);
  eq('bucket orderCount is 1 (the invoiced portion counts as one order)', aug.orderCount, 1);
  eq('bucket lineCount is 1', aug.lineCount, 1);
  eq('noInvoice absorbs line B (the unbilled portion)', res.noInvoice.exVat, 300000);
  eq('noInvoice orderCount is 1 (the split-off portion of that same order)', res.noInvoice.orderCount, 1);
  eq('noInvoice lineCount is 1', res.noInvoice.lineCount, 1);
  eq('bucket uses the ORDER\'s date, not any invoice date', aug.bucketKey, '2026-08');
}

/* ---------- 8. period granularities: week/quarter/year (still order-date, unaffected by the revision) ---------- */
console.log('\n8. period=year buckets by calendar year');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { view_statistics: true });
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-03-10' }), lines: [line({ qty: 1, unitPrice: 100000 })] });
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-11-02' }), lines: [line({ qty: 1, unitPrice: 50000 })] });
  const res = env.actionStatsRevenue_(admin, { period: 'year' });
  eq('one bucket for the whole year', res.buckets.length, 1);
  eq('bucketKey is the plain year', res.buckets[0].bucketKey, '2026');
  eq('label is NĂM 2026', res.buckets[0].label, 'NĂM 2026');
  eq('both orders summed together', res.buckets[0].exVat, 150000);
  eq('orderCount is 2', res.buckets[0].orderCount, 2);
}

console.log('\n9. period=quarter buckets Q1-Q4 correctly, including a year boundary');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { view_statistics: true });
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-02-15' }), lines: [line({ qty: 1, unitPrice: 10 })] }); // Q1
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-04-01' }), lines: [line({ qty: 1, unitPrice: 20 })] }); // Q2
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-12-31' }), lines: [line({ qty: 1, unitPrice: 40 })] }); // Q4
  const res = env.actionStatsRevenue_(admin, { period: 'quarter' });
  check('Q1 bucket exists', !!bucketFor(res, '2026-Q1'));
  check('Q2 bucket exists', !!bucketFor(res, '2026-Q2'));
  check('Q4 bucket exists', !!bucketFor(res, '2026-Q4'));
  check('no Q3 bucket (no order fell in it)', !bucketFor(res, '2026-Q3'));
  eq('Q4 label is QUÝ 4/2026', bucketFor(res, '2026-Q4').label, 'QUÝ 4/2026');
}

console.log('\n10. period=week buckets by ISO week, two dates in the same week share a bucket');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { view_statistics: true });
  // 2026-08-17 (Mon) and 2026-08-20 (Thu) are the same ISO week.
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-17' }), lines: [line({ qty: 1, unitPrice: 100 })] });
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-20' }), lines: [line({ qty: 1, unitPrice: 200 })] });
  // 2026-08-24 (Mon) is the NEXT ISO week.
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-24' }), lines: [line({ qty: 1, unitPrice: 400 })] });

  const res = env.actionStatsRevenue_(admin, { period: 'week' });
  eq('exactly two week buckets', res.buckets.length, 2);
  const first = res.buckets[0];
  eq('the two same-week orders are summed into one bucket', first.exVat, 300);
  eq('that bucket has orderCount 2', first.orderCount, 2);
  check('bucketKey looks like an ISO week (YYYY-Www)', /^\d{4}-W\d{2}$/.test(first.bucketKey));
}

/* ---------- 11. filters apply the same as export/list (permission-scoped) ---------- */
console.log('\n11. statsRevenue respects the same filters/scoping as the order list');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com', { view_statistics: true, view_all_orders: true });
  const staffNoAll = user('staff@x.com', { view_statistics: true, view_all_orders: false });

  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-20', customer: 'KH A' }), lines: [line({ qty: 1, unitPrice: 1000 })] });
  env.actionCreateOrder_(staffNoAll, { order: order({ orderDate: '2026-08-21', customer: 'KH B' }), lines: [line({ qty: 1, unitPrice: 2000 })] });

  const asAdmin = env.actionStatsRevenue_(admin, {});
  eq('admin sees both orders\' revenue combined', bucketFor(asAdmin, '2026-08').exVat, 3000);

  const asStaff = env.actionStatsRevenue_(staffNoAll, {});
  eq('staff without view_all_orders sees only their own order\'s revenue', bucketFor(asStaff, '2026-08').exVat, 2000);

  const filteredByCustomer = env.actionStatsRevenue_(admin, { customer: 'KH A' });
  eq('customer filter narrows the aggregation same as the list/export', bucketFor(filteredByCustomer, '2026-08').exVat, 1000);
}

console.log('\n12. actionStatsByCustomer_ groups by customer, biggest revenue first, with orderCount');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { view_statistics: true });
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-20', customer: 'KH Nhỏ' }), lines: [line({ qty: 1, unitPrice: 100000, vatRate: 0.08 })] });
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-21', customer: 'KH Lớn' }), lines: [line({ qty: 1, unitPrice: 900000, vatRate: 0.08 })] });
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-22', customer: 'KH Lớn' }), lines: [line({ qty: 1, unitPrice: 100000, vatRate: 0.08 })] });

  const res = env.actionStatsByCustomer_(admin, {});
  eq('two customer groups', res.groups.length, 2);
  eq('KH Lớn (bigger, combined across 2 orders) is first', res.groups[0].key, 'KH Lớn');
  eq('KH Lớn totals both its orders', res.groups[0].exVat, 1000000);
  eq('KH Lớn orderCount is 2', res.groups[0].orderCount, 2);
  eq('KH Nhỏ is second', res.groups[1].key, 'KH Nhỏ');
  eq('KH Nhỏ orderCount is 1', res.groups[1].orderCount, 1);
  eq('noInvoice is empty when includeNoInvoice is true (default)', res.noInvoice.orderCount, 0);
}

console.log('\n13. actionStatsByCustomer_ + includeNoInvoice=false: unbilled order\'s customer group excludes it, noInvoice absorbs it as ONE global total');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { view_statistics: true });
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-20', customer: 'KH A' }), lines: [line({ qty: 1, unitPrice: 100000, vatRate: 0.08 })] });
  const created = env.readAll_('Orders')[0];
  attachInvoice(env, created.orderId, 1, '2026-08-25');

  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-21', customer: 'KH B' }), lines: [line({ qty: 1, unitPrice: 500000, vatRate: 0.08 })] });
  // KH B's order has no invoiced lines — should NOT appear as a customer group, should land in noInvoice instead
  // (Phong: noInvoice is a single global total, never broken down by customer/status).

  const res = env.actionStatsByCustomer_(admin, { includeNoInvoice: false });
  eq('only KH A (invoiced) appears as a group', res.groups.length, 1);
  eq('KH A group has its billed figure', res.groups[0].exVat, 100000);
  check('noInvoice absorbs KH B\'s unbilled order as a single global total (not a customer breakdown)',
    !!res.noInvoice && res.noInvoice.exVat === 500000 && res.noInvoice.orderCount === 1);
}

console.log('\n14. actionStatsByCustomer_ is refused for a role blind to the customer field');
{
  const env = H.makeEnv();
  const blind = user('blind@x.com', { view_statistics: true, visible_fields: ['orderDate', 'status'] });
  throws('refused — customer not in visible_fields', () => env.actionStatsByCustomer_(blind, {}), 'không có quyền');
}

console.log('\n15. actionStatsByStatus_ groups by status with real Vietnamese labels and orderCount');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { view_statistics: true });
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-20', status: 'draft' }), lines: [line({ qty: 1, unitPrice: 100000, vatRate: 0.08 })] });
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-21', status: 'confirmed' }), lines: [line({ qty: 1, unitPrice: 300000, vatRate: 0.08 })] });

  const res = env.actionStatsByStatus_(admin, {});
  eq('two status groups', res.groups.length, 2);
  eq('confirmed (bigger) is first', res.groups[0].key, 'confirmed');
  eq('confirmed group uses the real Vietnamese label, not the raw key', res.groups[0].label, 'Đã xác nhận');
  eq('confirmed group orderCount is 1', res.groups[0].orderCount, 1);
  eq('draft group uses its real label too', res.groups.find(g => g.key === 'draft').label, 'Nháp');
}

console.log('\n16. actionStatsByStatus_ is refused for a role blind to the status field');
{
  const env = H.makeEnv();
  const blind = user('blind2@x.com', { view_statistics: true, visible_fields: ['orderDate', 'customer'] });
  throws('refused — status not in visible_fields', () => env.actionStatsByStatus_(blind, {}), 'không có quyền');
}

H.done();
