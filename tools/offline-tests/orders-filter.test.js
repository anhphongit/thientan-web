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


/* ---------- 8. customer filter ---------- */
console.log('\n8. Customer filter (exact, case/whitespace-insensitive)');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  env.actionCreateOrder_(admin, { order: order({ customer: 'Yamato' }), lines: [line()] });
  env.actionCreateOrder_(admin, { order: order({ customer: 'Nhựa Duy Tân' }), lines: [line()] });
  env.actionCreateOrder_(admin, { order: order({ customer: '  yamato  ' }), lines: [line()] });

  const res = env.actionListOrders_(admin, { customer: 'Yamato' });
  eq('two orders match Yamato, trimmed/case-insensitive', res.total, 2);

  const none = env.actionListOrders_(admin, { customer: 'Không tồn tại' });
  eq('unknown customer matches nothing', none.total, 0);
}

/* ---------- 9. status filter ---------- */
console.log('\n9. Status filter is exact and case-sensitive (fixed status keys)');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  env.actionCreateOrder_(admin, { order: order({ status: 'draft' }), lines: [line()] });
  env.actionCreateOrder_(admin, { order: order({ status: 'confirmed' }), lines: [line()] });
  env.actionCreateOrder_(admin, { order: order({ status: 'confirmed' }), lines: [line()] });

  const res = env.actionListOrders_(admin, { status: 'confirmed' });
  eq('two confirmed orders', res.total, 2);

  const wrongCase = env.actionListOrders_(admin, { status: 'Confirmed' });
  eq('status match is case-sensitive on the fixed status keys', wrongCase.total, 0);
}

/* ---------- 10. createdBy filter, gated on view_all_orders ---------- */
console.log('\n10. createdBy filter is only honoured for a caller who can see everyone');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  const staff = user('staff@x.com', { view_all_orders: false });

  env.actionCreateOrder_(admin, { order: order(), lines: [line()] });      // DH-0001 by admin
  env.actionCreateOrder_(staff, { order: order(), lines: [line()] });      // DH-0002 by staff

  const adminFiltered = env.actionListOrders_(admin, { createdBy: 'staff@x.com' });
  eq('admin filtering by createdBy sees only that person\'s order', adminFiltered.total, 1);
  eq('it is the staff order', adminFiltered.orders[0].orderId, 'DH-2026-0002');

  // staff has no view_all_orders: scopeToUser_ already restricted them to their
  // own row, so a createdBy value is silently ignored rather than applied —
  // it must never be treated as "show me someone else's order".
  const staffAttempt = env.actionListOrders_(staff, { createdBy: 'admin@x.com' });
  eq('createdBy is ignored for a scoped user, not honoured', staffAttempt.total, 1);
  eq('they still only see their own order', staffAttempt.orders[0].orderId, 'DH-2026-0002');
}

/* ---------- 11. filters combine (AND, not OR) ---------- */
console.log('\n11. Date + customer + status + createdBy combine as AND');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  const staff = user('staff@x.com', { view_all_orders: false });

  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-07-05', customer: 'Yamato', status: 'confirmed' }), lines: [line()] }); // 0001 admin, matches all
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-07-05', customer: 'Yamato', status: 'draft' }), lines: [line()] });     // 0002 wrong status
  env.actionCreateOrder_(staff, { order: order({ orderDate: '2026-07-05', customer: 'Yamato', status: 'confirmed' }), lines: [line()] }); // 0003 wrong creator
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-08-01', customer: 'Yamato', status: 'confirmed' }), lines: [line()] }); // 0004 wrong month

  const res = env.actionListOrders_(admin,
    { month: '2026-07', customer: 'Yamato', status: 'confirmed', createdBy: 'admin@x.com' });
  eq('only the order matching every filter is returned', res.total, 1);
  eq('it is DH-2026-0001', res.orders[0].orderId, 'DH-2026-0001');
}

/* ---------- 12. actionListOrderCreators_ ---------- */
console.log('\n12. actionListOrderCreators_ — dropdown data source');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  const staff = user('staff@x.com', { view_all_orders: false });

  env.actionCreateOrder_(admin, { order: order(), lines: [line()] });
  env.actionCreateOrder_(staff, { order: order(), lines: [line()] });
  env.actionCreateOrder_(staff, { order: order(), lines: [line()] });

  const forAdmin = env.actionListOrderCreators_(admin);
  eq('two distinct creators, no duplicates', forAdmin.creators.length, 2);
  check('emails present',
    forAdmin.creators.some(c => c.email === 'admin@x.com') &&
    forAdmin.creators.some(c => c.email === 'staff@x.com'));

  const forStaff = env.actionListOrderCreators_(staff);
  eq('a scoped user (no view_all_orders) gets an empty list, not everyone\'s emails',
     forStaff.creators.length, 0);
}


/* ---------- 13. free-text search: order-level fields ---------- */
console.log('\n13. Free-text search matches orderId, po, customer (substring)');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  env.actionCreateOrder_(admin, { order: order({ customer: 'Yamato', po: 'PO-4600041936' }), lines: [line()] }); // 0001
  env.actionCreateOrder_(admin, { order: order({ customer: 'Nhựa Duy Tân', po: 'ABC' }), lines: [line()] });     // 0002

  const byPo = env.actionListOrders_(admin, { q: '4600041936' });
  eq('substring match on po', byPo.total, 1);
  eq('matched the right order', byPo.orders[0].orderId, 'DH-2026-0001');

  const byCustomer = env.actionListOrders_(admin, { q: 'duy tân' });
  eq('case-insensitive substring match on customer', byCustomer.total, 1);
  eq('matched the right order', byCustomer.orders[0].orderId, 'DH-2026-0002');

  const byOrderId = env.actionListOrders_(admin, { q: 'dh-2026-0002' });
  eq('case-insensitive match on orderId itself', byOrderId.total, 1);

  const none = env.actionListOrders_(admin, { q: 'không có gì khớp' });
  eq('no match returns nothing', none.total, 0);
}

/* ---------- 14. free-text search: line description ---------- */
console.log('\n14. Free-text search also matches a line description');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  env.actionCreateOrder_(admin, {
    order: order({ customer: 'Yamato' }),
    lines: [line({ description: 'Ống nhựa PVC phi 90' }), line({ description: 'Keo dán ống' })]
  }); // 0001
  env.actionCreateOrder_(admin, {
    order: order({ customer: 'Yamato' }),
    lines: [line({ description: 'Van bi inox' })]
  }); // 0002

  const res = env.actionListOrders_(admin, { q: 'pvc' });
  eq('one order has a line matching "pvc"', res.total, 1);
  eq('it is the order with that line', res.orders[0].orderId, 'DH-2026-0001');

  const res2 = env.actionListOrders_(admin, { q: 'inox' });
  eq('the other order matches on its own line', res2.total, 1);
  eq('it is the second order', res2.orders[0].orderId, 'DH-2026-0002');
}

/* ---------- 15. search combines with the other filters (AND) ---------- */
console.log('\n15. Search combines with date/customer/status/createdBy as AND');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  const staff = user('staff@x.com', { view_all_orders: false });

  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-07-05', customer: 'Yamato', status: 'confirmed' }), lines: [line({ description: 'Ống nhựa PVC' })] }); // 0001, matches everything
  env.actionCreateOrder_(admin, { order: order({ orderDate: '2026-07-05', customer: 'Yamato', status: 'draft' }), lines: [line({ description: 'Ống nhựa PVC' })] });     // 0002, wrong status
  env.actionCreateOrder_(staff, { order: order({ orderDate: '2026-07-05', customer: 'Yamato', status: 'confirmed' }), lines: [line({ description: 'Ống nhựa PVC' })] }); // 0003, wrong creator

  const res = env.actionListOrders_(admin,
    { month: '2026-07', customer: 'Yamato', status: 'confirmed', createdBy: 'admin@x.com', q: 'pvc' });
  eq('only the order matching search AND every other filter', res.total, 1);
  eq('it is DH-2026-0001', res.orders[0].orderId, 'DH-2026-0001');

  // A staff account's search still only ever searches within their own scope.
  const staffRes = env.actionListOrders_(staff, { q: 'pvc' });
  eq('staff search is still ownership-scoped', staffRes.total, 1);
  eq('their own order only', staffRes.orders[0].orderId, 'DH-2026-0003');
}

/* ---------- 16. whitespace-only / empty query means "no search" ---------- */
console.log('\n16. An empty or whitespace-only query is not a filter at all');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  env.actionCreateOrder_(admin, { order: order(), lines: [line()] });
  env.actionCreateOrder_(admin, { order: order(), lines: [line()] });

  const blank = env.actionListOrders_(admin, { q: '   ' });
  eq('whitespace-only query returns everything, unfiltered', blank.total, 2);

  const missing = env.actionListOrders_(admin, {});
  eq('omitted query also returns everything', missing.total, 2);
}


/* ---------- 17. permission leak fix: customer/status filters, and search,
   must be silently ignored for a role blind to that field ---------- */
console.log('\n17. Filters/search never leak a field outside visible_fields');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  // Blind to po, customer, status, description — sees only the base fields.
  const blind = user('blind@x.com', {
    visible_fields: ['orderId', 'orderDate', 'lineId', 'lineNo', 'qty']
  });

  env.actionCreateOrder_(admin, {
    order: order({ customer: 'Yamato', po: 'PO-SECRET-123', status: 'confirmed' }),
    lines: [line({ description: 'Ống nhựa PVC bí mật' })]
  }); // 0001
  env.actionCreateOrder_(admin, {
    order: order({ customer: 'Nhựa Duy Tân', po: 'OTHER', status: 'draft' }),
    lines: [line({ description: 'Van bi inox' })]
  }); // 0002

  const byCustomer = env.actionListOrders_(blind, { customer: 'Yamato' });
  eq('customer filter ignored for a role blind to customer — sees everything', byCustomer.total, 2);

  const byStatus = env.actionListOrders_(blind, { status: 'confirmed' });
  eq('status filter ignored for a role blind to status — sees everything', byStatus.total, 2);

  const byPoSearch = env.actionListOrders_(blind, { q: 'SECRET-123' });
  eq('search on po does NOT leak a match for a role blind to po', byPoSearch.total, 0);

  const byCustomerSearch = env.actionListOrders_(blind, { q: 'yamato' });
  eq('search on customer does NOT leak a match for a role blind to customer', byCustomerSearch.total, 0);

  const byDescSearch = env.actionListOrders_(blind, { q: 'bí mật' });
  eq('search on line description does NOT leak for a role blind to description', byDescSearch.total, 0);

  const byOrderIdSearch = env.actionListOrders_(blind, { q: 'dh-2026-0001' });
  eq('search by orderId itself still works — orderId is always visible', byOrderIdSearch.total, 1);

  // Sanity: the SAME filters/search all still work normally for admin ('*').
  const adminCustomer = env.actionListOrders_(admin, { customer: 'Yamato' });
  eq('admin (visible_fields *) customer filter still works', adminCustomer.total, 1);
  const adminSearch = env.actionListOrders_(admin, { q: 'SECRET-123' });
  eq('admin (visible_fields *) po search still works', adminSearch.total, 1);
}

H.done();
