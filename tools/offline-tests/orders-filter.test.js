/**
 * Offline tests for Milestone 3 / 3.2 — the order list's month / date-range
 * filter (`orderDateFilter_` + the filtering branch in `actionListOrders_`).
 * Run with: node tools/offline-tests/orders-filter.test.js
 */
const H = require('./harness.js');
const { user, check, eq } = H;

function line(over) {
  return Object.assign({ description: 'Ống nhựa PVC 90', qty: 2, unitPrice: 100000,
                         uom: 'Cái', vatRate: 0.08 }, over || {});
}
function order(over) {
  return Object.assign({ customer: 'Nhựa Duy Tân', orderDate: '2026-08-20',
                         status: 'draft', po: '460004' }, over || {});
}

function seed(env, admin) {
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-06-15' }), lines: [line()] }); // DH-...0001
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-07-01' }), lines: [line()] }); // 0002
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-07-31' }), lines: [line()] }); // 0003
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-01' }), lines: [line()] }); // 0004
}

/* ---------- 1. month filter ---------- */
console.log('\n1. Month filter narrows to that calendar month only');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  seed(env, admin);

  const july = env.actionListOrders_(admin, { month: '2026-07' });
  eq('two orders in July', july.total, 2);
  eq('newest first', july.orders.map(o => o.orderId), ['DH-2026-0003', 'DH-2026-0002']);

  const june = env.actionListOrders_(admin, { month: '2026-06' });
  eq('one order in June', june.total, 1);

  const empty = env.actionListOrders_(admin, { month: '2026-01' });
  eq('no orders in an untouched month', empty.total, 0);
  eq('orders array is empty, not missing', empty.orders.length, 0);
}

/* ---------- 2. no filter still returns everything ---------- */
console.log('\n2. Omitting the filter behaves exactly like before 3.2');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  seed(env, admin);

  const all = env.actionListOrders_(admin, {});
  eq('all four orders returned', all.total, 4);
}

/* ---------- 3. dateFrom/dateTo range, inclusive on both ends ---------- */
console.log('\n3. Explicit date range is inclusive at both boundaries');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  seed(env, admin);

  const range = env.actionListOrders_(admin, { dateFrom: '2026-07-01', dateTo: '2026-07-31' });
  eq('both July orders included (boundary dates inclusive)', range.total, 2);

  const oneDay = env.actionListOrders_(admin, { dateFrom: '2026-06-15', dateTo: '2026-06-15' });
  eq('a single-day range matches that day', oneDay.total, 1);

  const openStart = env.actionListOrders_(admin, { dateTo: '2026-07-01' });
  eq('dateTo alone is an open start (everything up to and including it)', openStart.total, 2);

  const openEnd = env.actionListOrders_(admin, { dateFrom: '2026-07-31' });
  eq('dateFrom alone is an open end (everything from it onward)', openEnd.total, 2);
}

/* ---------- 4. month wins over dateFrom/dateTo if both are sent ---------- */
console.log('\n4. month takes precedence when both are somehow sent together');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  seed(env, admin);

  const res = env.actionListOrders_(admin,
    { month: '2026-06', dateFrom: '2026-08-01', dateTo: '2026-08-31' });
  eq('month wins, so the June order is the one returned', res.total, 1);
  eq('it really is the June order', res.orders[0].orderId, 'DH-2026-0001');
}

/* ---------- 5. malformed filters degrade to "no filter", never throw ---------- */
console.log('\n5. Malformed filter values are ignored rather than rejected');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  seed(env, admin);

  const garbageMonth = env.actionListOrders_(admin, { month: 'not-a-month' });
  eq('bad month string falls back to unfiltered', garbageMonth.total, 4);

  const garbageDates = env.actionListOrders_(admin, { dateFrom: '31/07/2026', dateTo: 'x' });
  eq('bad date strings fall back to unfiltered', garbageDates.total, 4);

  const emptyPayload = env.orderDateFilter_({});
  eq('empty payload yields a fully open filter', emptyPayload, { fromTime: null, toTime: null });
}

/* ---------- 6. filter is applied AFTER ownership scoping ---------- */
console.log('\n6. A filter can never surface another user\'s orders');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  const staff = user('staff@x.com', { view_all_orders: false });

  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-07-10' }), lines: [line()] });
  env.actionCreateOrder_(staff, { order: order({ orderDate: '2026-07-12' }), lines: [line()] });

  const staffView = env.actionListOrders_(staff, { month: '2026-07' });
  eq('staff sees only their own order in that month', staffView.total, 1);
  eq('it is the one they created', staffView.orders[0].orderId, 'DH-2026-0002');

  const adminView = env.actionListOrders_(admin, { month: '2026-07' });
  eq('admin (view_all_orders) sees both', adminView.total, 2);
}

/* ---------- 7. pagination math reflects the FILTERED set, not the whole sheet ---------- */
console.log('\n7. total/hasMore describe the filtered set');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  for (let i = 0; i < 5; i++) {
    env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-07-0' + (i + 1) }), lines: [line()] });
  }
  for (let i = 0; i < 3; i++) {
    env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-0' + (i + 1) }), lines: [line()] });
  }

  const page1 = env.actionListOrders_(admin, { month: '2026-07', page: 1, pageSize: 2 });
  eq('total is 5 (July only), not 8', page1.total, 5);
  eq('shown is capped at pageSize', page1.shown, 2);
  eq('hasMore is true within the filtered set', page1.hasMore, true);

  const page3 = env.actionListOrders_(admin, { month: '2026-07', page: 3, pageSize: 2 });
  eq('last filtered page has the remainder', page3.orders.length, 1);
  eq('hasMore is false at the end of the filtered set', page3.hasMore, false);
}

H.done();
