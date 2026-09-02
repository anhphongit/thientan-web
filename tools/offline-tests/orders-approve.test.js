/**
 * Offline tests for Milestone 3 / 3.6 — actionApproveOrder_, the one-purpose
 * admin approval action.
 * Run with: node tools/offline-tests/orders-approve.test.js
 */
const H = require('./harness.js');
const { user, check, eq, throws } = H;

function line(over) {
  return Object.assign({ description: 'Ống nhựa PVC 90', qty: 2, unitPrice: 100000,
                         uom: 'Cái', vatRate: 0.08 }, over || {});
}
function order(over) {
  return Object.assign({ customer: 'Nhựa Duy Tân', orderDate: '2026-08-20',
                         status: 'confirmed', po: '460004' }, over || {});
}

/* ---------- 1. happy path ---------- */
console.log('\n1. approve_order stamps approvedBy/approvedAt');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com', { approve_order: true });
  env.actionCreateOrder_(admin, { order: order(), lines: [line()] }); // DH-2026-0001

  const res = env.actionApproveOrder_(admin, { orderId: 'DH-2026-0001' });
  eq('response echoes orderId', res.orderId, 'DH-2026-0001');
  eq('response echoes approvedBy', res.approvedBy, 'admin@x.com');
  check('response has an approvedAt Date',
    Object.prototype.toString.call(res.approvedAt) === '[object Date]');

  eq('Orders row approvedBy set', env.store.Orders[0].approvedBy, 'admin@x.com');
  check('Orders row approvedAt is a real Date',
    Object.prototype.toString.call(env.store.Orders[0].approvedAt) === '[object Date]');
  eq('updatedBy also stamped', env.store.Orders[0].updatedBy, 'admin@x.com');
}

/* ---------- 2. permission enforcement ---------- */
console.log('\n2. approve_order is required, server-side');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com', { approve_order: true });
  const noPermission = user('staff@x.com', { approve_order: false, view_all_orders: false });
  env.actionCreateOrder_(admin, { order: order(), lines: [line()] });

  throws('a user without approve_order is refused',
    () => env.actionApproveOrder_(noPermission, { orderId: 'DH-2026-0001' }),
    'quyền');
  eq('approvedBy unchanged after the refused attempt', env.store.Orders[0].approvedBy, '');
}

/* ---------- 3. ownership enforcement ---------- */
console.log('\n3. Ownership still applies — approve_order alone is not enough');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  // Has approve_order, but not view_all_orders, and didn't create this order.
  const otherApprover = user('other@x.com', { approve_order: true, view_all_orders: false });
  env.actionCreateOrder_(admin, { order: order(), lines: [line()] });

  throws('cannot approve someone else\'s order without view_all_orders',
    () => env.actionApproveOrder_(otherApprover, { orderId: 'DH-2026-0001' }),
    'quyền');
  eq('approvedBy unchanged', env.store.Orders[0].approvedBy, '');

  // The order's own creator, with approve_order, CAN approve it.
  const creator = user('admin@x.com', { approve_order: true, view_all_orders: false });
  const res = env.actionApproveOrder_(creator, { orderId: 'DH-2026-0001' });
  eq('the creator can approve their own order', res.approvedBy, 'admin@x.com');
}

/* ---------- 4. already-approved is refused, not silently re-stamped ---------- */
console.log('\n4. Approving twice is rejected — approvedBy/At is a first-approval record');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com', { approve_order: true });
  env.actionCreateOrder_(admin, { order: order(), lines: [line()] });
  env.actionApproveOrder_(admin, { orderId: 'DH-2026-0001' });
  const firstApprovedAt = env.store.Orders[0].approvedAt;

  throws('a second approval attempt is rejected',
    () => env.actionApproveOrder_(admin, { orderId: 'DH-2026-0001' }));
  eq('approvedAt was not overwritten', env.store.Orders[0].approvedAt, firstApprovedAt);

  // Even a different admin can't re-approve it.
  const secondAdmin = user('boss@x.com', { approve_order: true });
  throws('a different admin also cannot re-approve an already-approved order',
    () => env.actionApproveOrder_(secondAdmin, { orderId: 'DH-2026-0001' }));
  eq('approvedBy still the original approver', env.store.Orders[0].approvedBy, 'admin@x.com');
}

/* ---------- 5. unknown orderId ---------- */
console.log('\n5. Unknown orderId is rejected');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com', { approve_order: true });
  throws('an unknown orderId is rejected',
    () => env.actionApproveOrder_(admin, { orderId: 'DH-2026-9999' }));
}

/* ---------- 6. list card + detail response expose canApprove ---------- */
console.log('\n6. canApprove is ownership-aware and false once already approved');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com', { approve_order: true });
  const staffNoApprove = user('staff@x.com', { approve_order: false, view_all_orders: false });
  env.actionCreateOrder_(admin, { order: order(), lines: [line()] }); // DH-2026-0001
  env.actionCreateOrder_(staffNoApprove, { order: order(), lines: [line()] }); // DH-2026-0002, their own

  var adminList = env.actionListOrders_(admin, {});
  var ownCard = adminList.orders.filter(o => o.orderId === 'DH-2026-0001')[0];
  eq('admin card can approve before approval', ownCard.canApprove, true);

  var staffList = env.actionListOrders_(staffNoApprove, {});
  eq('a role without approve_order never sees the card as approvable, even for their own order',
     staffList.orders[0].canApprove, false);

  env.actionApproveOrder_(admin, { orderId: 'DH-2026-0001' });
  var adminListAfter = env.actionListOrders_(admin, {});
  var approvedCard = adminListAfter.orders.filter(o => o.orderId === 'DH-2026-0001')[0];
  eq('once approved, canApprove flips to false even for an admin', approvedCard.canApprove, false);

  var detail = env.actionGetOrder_(admin, { orderId: 'DH-2026-0001' });
  eq('detail response canApprove is false too', detail.order.canApprove, false);
  eq('detail response carries approvedBy', detail.order.approvedBy, 'admin@x.com');
}

H.done();
