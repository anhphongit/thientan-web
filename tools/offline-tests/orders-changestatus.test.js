/**
 * Offline tests for Milestone 3 / 3.5 — actionChangeStatus_, the one-purpose
 * status change used by the order list's quick-status control.
 * Run with: node tools/offline-tests/orders-changestatus.test.js
 */
const H = require('./harness.js');
const { user, check, eq, throws } = H;

function line(over) {
  return Object.assign({ description: 'Ống nhựa PVC 90', qty: 2, unitPrice: 100000,
                         uom: 'Cái', vatRate: 0.08 }, over || {});
}
function order(over) {
  return Object.assign({ customer: 'Nhựa Duy Tân', orderDate: '2026-08-20',
                         status: 'draft', po: '460004' }, over || {});
}

/* ---------- 1. happy path ---------- */
console.log('\n1. change_status flips the status and logs history');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  env.actionCreateOrder_(admin, { order: order(), lines: [line()] }); // DH-2026-0001, draft

  const res = env.actionChangeStatus_(admin, { orderId: 'DH-2026-0001', status: 'confirmed', note: 'Đã xác nhận qua điện thoại' });
  eq('response echoes the new status', res.status, 'confirmed');
  eq('orderId in the response', res.orderId, 'DH-2026-0001');
  eq('Orders row actually updated', env.store.Orders[0].status, 'confirmed');
  eq('updatedBy set', env.store.Orders[0].updatedBy, 'admin@x.com');

  // one history row from create (''→draft) + one from this change
  eq('two history rows total', env.store.StatusHistory.length, 2);
  const last = env.store.StatusHistory[1];
  eq('history oldStatus', last.oldStatus, 'draft');
  eq('history newStatus', last.newStatus, 'confirmed');
  eq('history note', last.note, 'Đã xác nhận qua điện thoại');
  eq('history changedBy', last.changedBy, 'admin@x.com');
  check('history changedAt is a real Date',
    Object.prototype.toString.call(last.changedAt) === '[object Date]');
}

/* ---------- 2. permission enforcement ---------- */
console.log('\n2. change_status is required, server-side');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  const noPermission = user('staff@x.com', { change_status: false, view_all_orders: false, createdBy: undefined });
  env.actionCreateOrder_(admin, { order: order(), lines: [line()] });

  throws('a user without change_status is refused',
    () => env.actionChangeStatus_(noPermission, { orderId: 'DH-2026-0001', status: 'confirmed' }),
    'quyền');
  eq('status unchanged after the refused attempt', env.store.Orders[0].status, 'draft');
  eq('no extra history row written', env.store.StatusHistory.length, 1); // just the create-time row
}

/* ---------- 3. ownership enforcement ---------- */
console.log('\n3. Ownership still applies — change_status alone is not enough');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  // Has change_status, but not view_all_orders, and didn't create this order.
  const otherOwner = user('other@x.com', { view_all_orders: false });
  env.actionCreateOrder_(admin, { order: order(), lines: [line()] });

  throws('cannot change status on someone else\'s order without view_all_orders',
    () => env.actionChangeStatus_(otherOwner, { orderId: 'DH-2026-0001', status: 'confirmed' }),
    'quyền');
  eq('status unchanged', env.store.Orders[0].status, 'draft');

  // The order's own creator, with change_status, CAN change it.
  const creator = user('admin@x.com', { view_all_orders: false });
  const res = env.actionChangeStatus_(creator, { orderId: 'DH-2026-0001', status: 'confirmed' });
  eq('the creator can change their own order\'s status', res.status, 'confirmed');
}

/* ---------- 4. validation ---------- */
console.log('\n4. Unknown / missing status is rejected');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  env.actionCreateOrder_(admin, { order: order(), lines: [line()] });

  throws('an unknown status key is rejected',
    () => env.actionChangeStatus_(admin, { orderId: 'DH-2026-0001', status: 'not_a_real_status' }));
  throws('a missing status is rejected',
    () => env.actionChangeStatus_(admin, { orderId: 'DH-2026-0001' }));
  throws('an unknown orderId is rejected',
    () => env.actionChangeStatus_(admin, { orderId: 'DH-2026-9999', status: 'confirmed' }));
  eq('status still unchanged after all the rejections', env.store.Orders[0].status, 'draft');
}

/* ---------- 5. same-status is a no-op, not a logged event ---------- */
console.log('\n5. Setting the SAME status is a no-op — no history row, no version bump');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  env.actionCreateOrder_(admin, { order: order({ status: 'confirmed' }), lines: [line()] });
  eq('one history row from create', env.store.StatusHistory.length, 1);

  const res = env.actionChangeStatus_(admin, { orderId: 'DH-2026-0001', status: 'confirmed' });
  eq('response still echoes the status', res.status, 'confirmed');
  eq('no new history row for a no-op change', env.store.StatusHistory.length, 1);
}

/* ---------- 6. list card exposes canChangeStatus ---------- */
console.log('\n6. actionListOrders_ cards carry canChangeStatus, ownership-aware');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  const staffNoChange = user('staff@x.com', { change_status: false, view_all_orders: false });
  env.actionCreateOrder_(admin, { order: order(), lines: [line()] });
  env.actionCreateOrder_(staffNoChange, { order: order(), lines: [line()] }); // their own order

  const adminList = env.actionListOrders_(admin, {});
  const adminOwn = adminList.orders.filter(o => o.orderId === 'DH-2026-0001')[0];
  eq('admin card can change status', adminOwn.canChangeStatus, true);

  const staffList = env.actionListOrders_(staffNoChange, {});
  eq('staff sees only their own order', staffList.orders.length, 1);
  eq('a role without change_status never sees the card as changeable, even for their own order',
     staffList.orders[0].canChangeStatus, false);
}

/* ---------- 7. note is optional ---------- */
console.log('\n7. note is optional on a quick status change');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  env.actionCreateOrder_(admin, { order: order(), lines: [line()] });

  const res = env.actionChangeStatus_(admin, { orderId: 'DH-2026-0001', status: 'confirmed' });
  eq('status changed without a note', res.status, 'confirmed');
  eq('history note is blank, not "undefined"', env.store.StatusHistory[1].note, '');
}

H.done();
