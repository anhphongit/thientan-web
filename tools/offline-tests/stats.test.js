/**
 * Offline tests for Milestone 4 / 4.6.1 — revenue by time period
 * (Stats.gs). Run with: node tools/offline-tests/stats.test.js
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
 *  hand (no invoicing action/UI exists yet), purely to exercise
 *  invoice-date bucketing. */
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

/* ---------- 2. basis default is invoiceDate (Q2), period default is month ---------- */
console.log('\n2. default basis is invoiceDate, default period is month');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { view_statistics: true });
  const res = env.actionStatsRevenue_(admin, {});
  eq('basis defaults to invoiceDate', res.basis, 'invoiceDate');
  eq('period defaults to month', res.period, 'month');
}

/* ---------- 3. order-date basis: simple monthly totals ---------- */
console.log('\n3. order-date basis sums ex-VAT/inc-VAT per month, no noInvoice bucket');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { view_statistics: true });
  env.actionCreateOrder_(admin, {
    order: order({ orderDate: '2026-08-20' }),
    lines: [line({ qty: 2, unitPrice: 100000, vatRate: 0.08 })] // 200,000 exVat, 216,000 incVat
  });
  env.actionCreateOrder_(admin, {
    order: order({ orderDate: '2026-08-25' }),
    lines: [line({ qty: 1, unitPrice: 50000, vatRate: 0.1 })] // 50,000 exVat, 55,000 incVat
  });

  const res = env.actionStatsRevenue_(admin, { basis: 'orderDate' });
  eq('exactly one bucket (both orders in August)', res.buckets.length, 1);
  const aug = bucketFor(res, '2026-08');
  check('bucket found', !!aug);
  eq('label is THÁNG 8', aug.label, 'THÁNG 8');
  eq('exVat summed correctly', aug.exVat, 250000);
  eq('incVat summed correctly', aug.incVat, 271000);
  eq('lineCount is 2', aug.lineCount, 2);
  eq('noInvoice is null for order-date basis', res.noInvoice, null);
}

/* ---------- 4. invoice-date basis: buckets by invoice month, not order month ---------- */
console.log('\n4. invoice-date basis buckets a line by its OWN invoice month');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { view_statistics: true });
  env.actionCreateOrder_(admin, {
    order: order({ orderDate: '2026-08-20' }),
    lines: [line({ qty: 1, unitPrice: 100000, vatRate: 0.08 })]
  });
  const created = env.readAll_('Orders')[0];
  attachInvoice(env, created.orderId, 1, '2026-09-05');

  const res = env.actionStatsRevenue_(admin, { basis: 'invoiceDate' });
  check('bucketed under 2026-09 (invoice month), not 2026-08 (order month)',
    !!bucketFor(res, '2026-09') && !bucketFor(res, '2026-08'));
  eq('September bucket has the line\'s figures', bucketFor(res, '2026-09').exVat, 100000);
}

/* ---------- 5. invoice-date basis: split order contributes to two buckets ---------- */
console.log('\n5. invoice-date basis: one order\'s lines invoiced in different months split correctly');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { view_statistics: true });
  env.actionCreateOrder_(admin, {
    order: order({ orderDate: '2026-08-20' }),
    lines: [line({ description: 'A', qty: 1, unitPrice: 100000, vatRate: 0.08 }),
            line({ description: 'B', qty: 1, unitPrice: 200000, vatRate: 0.08 })]
  });
  const created = env.readAll_('Orders')[0];
  attachInvoice(env, created.orderId, 1, '2026-08-28');
  attachInvoice(env, created.orderId, 2, '2026-09-03');

  const res = env.actionStatsRevenue_(admin, { basis: 'invoiceDate' });
  eq('August bucket has line A only', bucketFor(res, '2026-08').exVat, 100000);
  eq('September bucket has line B only', bucketFor(res, '2026-09').exVat, 200000);
}

/* ---------- 6. invoice-date basis: unbilled line goes into noInvoice, not a date bucket ---------- */
console.log('\n6. invoice-date basis: unbilled line is excluded from date buckets, summed in noInvoice instead');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { view_statistics: true });
  env.actionCreateOrder_(admin, {
    order: order({ orderDate: '2026-08-20' }),
    lines: [line({ qty: 1, unitPrice: 300000, vatRate: 0.08 })]
  });

  const res = env.actionStatsRevenue_(admin, { basis: 'invoiceDate' });
  eq('no date buckets at all', res.buckets.length, 0);
  check('noInvoice is populated', !!res.noInvoice);
  eq('noInvoice has the unbilled line\'s figures', res.noInvoice.exVat, 300000);
  eq('noInvoice lineCount is 1', res.noInvoice.lineCount, 1);
}

/* ---------- 7. period granularities: week/quarter/year ---------- */
console.log('\n7. period=year buckets by calendar year');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { view_statistics: true });
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-03-10' }), lines: [line({ qty: 1, unitPrice: 100000 })] });
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-11-02' }), lines: [line({ qty: 1, unitPrice: 50000 })] });
  const res = env.actionStatsRevenue_(admin, { basis: 'orderDate', period: 'year' });
  eq('one bucket for the whole year', res.buckets.length, 1);
  eq('bucketKey is the plain year', res.buckets[0].bucketKey, '2026');
  eq('label is NĂM 2026', res.buckets[0].label, 'NĂM 2026');
  eq('both orders summed together', res.buckets[0].exVat, 150000);
}

console.log('\n8. period=quarter buckets Q1-Q4 correctly, including a year boundary');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { view_statistics: true });
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-02-15' }), lines: [line({ qty: 1, unitPrice: 10 })] }); // Q1
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-04-01' }), lines: [line({ qty: 1, unitPrice: 20 })] }); // Q2
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-12-31' }), lines: [line({ qty: 1, unitPrice: 40 })] }); // Q4
  const res = env.actionStatsRevenue_(admin, { basis: 'orderDate', period: 'quarter' });
  check('Q1 bucket exists', !!bucketFor(res, '2026-Q1'));
  check('Q2 bucket exists', !!bucketFor(res, '2026-Q2'));
  check('Q4 bucket exists', !!bucketFor(res, '2026-Q4'));
  check('no Q3 bucket (no order fell in it)', !bucketFor(res, '2026-Q3'));
  eq('Q4 label is QUÝ 4/2026', bucketFor(res, '2026-Q4').label, 'QUÝ 4/2026');
}

console.log('\n9. period=week buckets by ISO week, two dates in the same week share a bucket');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { view_statistics: true });
  // 2026-08-17 (Mon) and 2026-08-20 (Thu) are the same ISO week.
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-17' }), lines: [line({ qty: 1, unitPrice: 100 })] });
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-20' }), lines: [line({ qty: 1, unitPrice: 200 })] });
  // 2026-08-24 (Mon) is the NEXT ISO week.
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-24' }), lines: [line({ qty: 1, unitPrice: 400 })] });

  const res = env.actionStatsRevenue_(admin, { basis: 'orderDate', period: 'week' });
  eq('exactly two week buckets', res.buckets.length, 2);
  const first = res.buckets[0];
  eq('the two same-week orders are summed into one bucket', first.exVat, 300);
  check('bucketKey looks like an ISO week (YYYY-Www)', /^\d{4}-W\d{2}$/.test(first.bucketKey));
}

/* ---------- 10. filters apply the same as export/list (permission-scoped) ---------- */
console.log('\n10. statsRevenue respects the same filters/scoping as the order list');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com', { view_statistics: true, view_all_orders: true });
  const staffNoAll = user('staff@x.com', { view_statistics: true, view_all_orders: false });

  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-20', customer: 'KH A' }), lines: [line({ qty: 1, unitPrice: 1000 })] });
  env.actionCreateOrder_(staffNoAll, { order: order({ orderDate: '2026-08-21', customer: 'KH B' }), lines: [line({ qty: 1, unitPrice: 2000 })] });

  const asAdmin = env.actionStatsRevenue_(admin, { basis: 'orderDate' });
  eq('admin sees both orders\' revenue combined', bucketFor(asAdmin, '2026-08').exVat, 3000);

  const asStaff = env.actionStatsRevenue_(staffNoAll, { basis: 'orderDate' });
  eq('staff without view_all_orders sees only their own order\'s revenue', bucketFor(asStaff, '2026-08').exVat, 2000);

  const filteredByCustomer = env.actionStatsRevenue_(admin, { basis: 'orderDate', customer: 'KH A' });
  eq('customer filter narrows the aggregation same as the list/export', bucketFor(filteredByCustomer, '2026-08').exVat, 1000);
}

console.log('\n11. actionStatsByCustomer_ groups by customer, biggest revenue first');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { view_statistics: true });
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-20', customer: 'KH Nhỏ' }), lines: [line({ qty: 1, unitPrice: 100000, vatRate: 0.08 })] });
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-21', customer: 'KH Lớn' }), lines: [line({ qty: 1, unitPrice: 900000, vatRate: 0.08 })] });
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-22', customer: 'KH Lớn' }), lines: [line({ qty: 1, unitPrice: 100000, vatRate: 0.08 })] });

  const res = env.actionStatsByCustomer_(admin, { basis: 'orderDate' });
  eq('two customer groups', res.groups.length, 2);
  eq('KH Lớn (bigger, combined across 2 orders) is first', res.groups[0].key, 'KH Lớn');
  eq('KH Lớn totals both its orders', res.groups[0].exVat, 1000000);
  eq('KH Nhỏ is second', res.groups[1].key, 'KH Nhỏ');
  eq('noInvoice is null for order-date basis', res.noInvoice, null);
}

console.log('\n12. actionStatsByCustomer_ respects invoice-date basis + noInvoice split (Q2)');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { view_statistics: true });
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-20', customer: 'KH A' }), lines: [line({ qty: 1, unitPrice: 100000, vatRate: 0.08 })] });
  const created = env.readAll_('Orders')[0];
  attachInvoice(env, created.orderId, 1, '2026-09-05');

  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-21', customer: 'KH B' }), lines: [line({ qty: 1, unitPrice: 500000, vatRate: 0.08 })] });
  // KH B's line has no invoice — should NOT appear in KH B's customer group, should land in noInvoice instead.

  const res = env.actionStatsByCustomer_(admin, { basis: 'invoiceDate' });
  eq('only KH A (invoiced) appears as a group', res.groups.length, 1);
  eq('KH A group has its billed figure', res.groups[0].exVat, 100000);
  check('noInvoice absorbs KH B\'s unbilled line', !!res.noInvoice && res.noInvoice.exVat === 500000);
}

console.log('\n13. actionStatsByCustomer_ is refused for a role blind to the customer field');
{
  const env = H.makeEnv();
  const blind = user('blind@x.com', { view_statistics: true, visible_fields: ['orderDate', 'status'] });
  throws('refused — customer not in visible_fields', () => env.actionStatsByCustomer_(blind, {}), 'không có quyền');
}

console.log('\n14. actionStatsByStatus_ groups by status with real Vietnamese labels');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { view_statistics: true });
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-20', status: 'draft' }), lines: [line({ qty: 1, unitPrice: 100000, vatRate: 0.08 })] });
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-21', status: 'confirmed' }), lines: [line({ qty: 1, unitPrice: 300000, vatRate: 0.08 })] });

  const res = env.actionStatsByStatus_(admin, { basis: 'orderDate' });
  eq('two status groups', res.groups.length, 2);
  eq('confirmed (bigger) is first', res.groups[0].key, 'confirmed');
  eq('confirmed group uses the real Vietnamese label, not the raw key', res.groups[0].label, 'Đã xác nhận');
  eq('draft group uses its real label too', res.groups.find(g => g.key === 'draft').label, 'Nháp');
}

console.log('\n15. actionStatsByStatus_ is refused for a role blind to the status field');
{
  const env = H.makeEnv();
  const blind = user('blind2@x.com', { view_statistics: true, visible_fields: ['orderDate', 'customer'] });
  throws('refused — status not in visible_fields', () => env.actionStatsByStatus_(blind, {}), 'không có quyền');
}

H.done();
