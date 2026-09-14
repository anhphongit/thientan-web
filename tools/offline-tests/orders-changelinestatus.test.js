/**
 * Offline tests for Milestone 5a — line-level status changes via actionUpdateOrder_.
 * The old order-level actionChangeStatus_ endpoint is deleted outright (Phase 2, A6).
 * Run with: node tools/offline-tests/orders-changelinestatus.test.js
 */
const H = require('./harness.js');
const { user, check, eq, throws } = H;

function line(over) {
  return Object.assign({ description: 'Ống nhựa PVC 90', qty: 2, unitPrice: 100000,
                         uom: 'Cái', vatRate: 0.08 }, over || {});
}
function order(over) {
  return Object.assign({ customer: 'Nhựa Duy Tân', orderDate: '2026-08-20',
                         po: '460004' }, over || {});
}

/* ---------- 1. blank → set status ---------- */
console.log('\n1. Blank line status → set status');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  env.actionCreateOrder_(admin, { order: order(), lines: [line(), line()] });

  const update = {
    orderId: 'DH-2026-0001',
    order: order(),
    lines: [
      { lineId: env.store.OrderLines[0].lineId, description: 'Ống nhựa PVC 90', qty: 2, unitPrice: 100000, uom: 'Cái', vatRate: 0.08, status: 'confirmed' },
      { lineId: env.store.OrderLines[1].lineId, description: 'Ống nhựa PVC 90', qty: 2, unitPrice: 100000, uom: 'Cái', vatRate: 0.08 }
    ]
  };
  const res = env.actionUpdateOrder_(admin, update);

  eq('line 1 status set to confirmed', env.store.OrderLines[0].status, 'confirmed');
  eq('line 2 status stays blank', env.store.OrderLines[1].status || '', '');

  eq('one history row for line 1 change', env.store.StatusHistory.length, 1);
  const hist = env.store.StatusHistory[0];
  eq('lineId is line 1', hist.lineId, env.store.OrderLines[0].lineId);
  eq('oldStatus was blank', hist.oldStatus, '');
  eq('newStatus is confirmed', hist.newStatus, 'confirmed');
  check('changedBy is admin', hist.changedBy === 'admin@x.com');
}

/* ---------- 2. set → blank ---------- */
console.log('\n2. Set status → blank (clear)');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  env.actionCreateOrder_(admin, { order: order(), lines: [line({ status: 'confirmed' })] });

  const lineId = env.store.OrderLines[0].lineId;
  const update = {
    orderId: 'DH-2026-0001',
    order: order(),
    lines: [
      { lineId: lineId, description: 'Ống nhựa PVC 90', qty: 2, unitPrice: 100000, uom: 'Cái', vatRate: 0.08, status: '' }
    ]
  };
  env.actionUpdateOrder_(admin, update);

  eq('status cleared to blank', env.store.OrderLines[0].status || '', '');
  eq('one history row', env.store.StatusHistory.length, 1);
  const hist = env.store.StatusHistory[0];
  eq('oldStatus was confirmed', hist.oldStatus, 'confirmed');
  eq('newStatus is blank', hist.newStatus, '');
}

/* ---------- 3. no-op: same status → no history row ---------- */
console.log('\n3. Setting same status is no-op — no new history row');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  env.actionCreateOrder_(admin, { order: order(), lines: [line({ status: 'confirmed' })] });

  const lineId = env.store.OrderLines[0].lineId;
  const initialCount = env.store.StatusHistory.length;

  const update = {
    orderId: 'DH-2026-0001',
    order: order(),
    lines: [
      { lineId: lineId, description: 'Ống nhựa PVC 90', qty: 2, unitPrice: 100000, uom: 'Cái', vatRate: 0.08, status: 'confirmed' }
    ]
  };
  env.actionUpdateOrder_(admin, update);

  eq('status unchanged (still confirmed)', env.store.OrderLines[0].status, 'confirmed');
  eq('no new history row', env.store.StatusHistory.length, initialCount);
}

/* ---------- 4. unknown status key rejected ---------- */
console.log('\n4. Unknown status key is rejected');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  env.actionCreateOrder_(admin, { order: order(), lines: [line()] });

  const lineId = env.store.OrderLines[0].lineId;
  const update = {
    orderId: 'DH-2026-0001',
    order: order(),
    lines: [
      { lineId: lineId, description: 'Ống nhựa PVC 90', qty: 2, unitPrice: 100000, uom: 'Cái', vatRate: 0.08, status: 'not_a_status' }
    ]
  };

  throws('unknown status key rejected', () => env.actionUpdateOrder_(admin, update), 'Trạng thái không hợp lệ');
  eq('status unchanged', env.store.OrderLines[0].status || '', '');
}

/* ---------- 5. change_status permission required per line ---------- */
console.log('\n5. change_status permission required per line');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  const noChange = user('staff@x.com', { change_status: false, view_all_orders: false });
  env.actionCreateOrder_(admin, { order: order(), lines: [line()] });

  const lineId = env.store.OrderLines[0].lineId;
  const update = {
    orderId: 'DH-2026-0001',
    order: order(),
    lines: [
      { lineId: lineId, description: 'Ống nhựa PVC 90', qty: 2, unitPrice: 100000, uom: 'Cái', vatRate: 0.08, status: 'confirmed' }
    ]
  };

  throws('user without change_status denied', () => env.actionUpdateOrder_(noChange, update), 'quyền');
  eq('status unchanged after denial', env.store.OrderLines[0].status || '', '');
}

/* ---------- 6. multiple lines with status changes ---------- */
console.log('\n6. Multiple lines with status changes in one update');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  env.actionCreateOrder_(admin, { order: order(), lines: [line(), line(), line()] });

  const l1 = env.store.OrderLines[0].lineId;
  const l2 = env.store.OrderLines[1].lineId;
  const l3 = env.store.OrderLines[2].lineId;

  const update = {
    orderId: 'DH-2026-0001',
    order: order(),
    lines: [
      { lineId: l1, description: 'Ống nhựa PVC 90', qty: 2, unitPrice: 100000, uom: 'Cái', vatRate: 0.08, status: 'confirmed' },
      { lineId: l2, description: 'Ống nhựa PVC 90', qty: 2, unitPrice: 100000, uom: 'Cái', vatRate: 0.08, status: 'draft' },
      { lineId: l3, description: 'Ống nhựa PVC 90', qty: 2, unitPrice: 100000, uom: 'Cái', vatRate: 0.08 } // unchanged
    ]
  };
  env.actionUpdateOrder_(admin, update);

  eq('line 1 is confirmed', env.store.OrderLines[0].status, 'confirmed');
  eq('line 2 is draft', env.store.OrderLines[1].status, 'draft');
  eq('line 3 is blank', env.store.OrderLines[2].status || '', '');

  eq('two history rows (l1 and l2)', env.store.StatusHistory.length, 2);
  const h1 = env.store.StatusHistory.find(h => h.lineId === l1);
  const h2 = env.store.StatusHistory.find(h => h.lineId === l2);
  eq('l1 changed from blank→confirmed', h1.newStatus, 'confirmed');
  eq('l2 changed from blank→draft', h2.newStatus, 'draft');
}

/* ---------- 7. clampHiddenLineFields_ prevents set when role blind to status ---------- */
console.log('\n7. Hidden-status role cannot set line status (§6b security clamp)');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  const blindToStatus = user('staff@x.com', {
    view_all_orders: true, change_status: true,
    visible_fields: ['customer', 'orderDate', 'po']
  });

  env.actionCreateOrder_(admin, { order: order(), lines: [line()] });

  const lineId = env.store.OrderLines[0].lineId;
  const update = {
    orderId: 'DH-2026-0001',
    order: order(),
    lines: [
      { lineId: lineId, description: 'Ống nhựa PVC 90', qty: 2, unitPrice: 100000, uom: 'Cái', vatRate: 0.08, status: 'confirmed', statusNote: 'test' }
    ]
  };

  env.actionUpdateOrder_(blindToStatus, update);

  eq('status clamped (not set)', env.store.OrderLines[0].status || '', '');
  eq('statusNote clamped (not set)', env.store.OrderLines[0].statusNote || '', '');
  eq('no history row (no actual change)', env.store.StatusHistory.length, 0);
}

/* ---------- 8. new line with status writes correct lineId to history ---------- */
console.log('\n8. New line with status writes correct lineId to history');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  env.actionCreateOrder_(admin, { order: order(), lines: [line()] });

  const existingLineId = env.store.OrderLines[0].lineId;
  const update = {
    orderId: 'DH-2026-0001',
    order: order(),
    lines: [
      { lineId: existingLineId, description: 'Ống nhựa PVC 90', qty: 2, unitPrice: 100000, uom: 'Cái', vatRate: 0.08 },
      { description: 'Ống nhựa PVC 90 khác', qty: 1, unitPrice: 50000, uom: 'Cái', vatRate: 0.08, status: 'confirmed' }
    ]
  };

  env.actionUpdateOrder_(admin, update);

  eq('second line created', env.store.OrderLines.length, 2);
  const newLineId = env.store.OrderLines[1].lineId;
  eq('new line has confirmed status', env.store.OrderLines[1].status, 'confirmed');

  eq('one history row for new line', env.store.StatusHistory.length, 1);
  const hist = env.store.StatusHistory[0];
  eq('lineId is new line', hist.lineId, newLineId);
  eq('oldStatus blank', hist.oldStatus, '');
  eq('newStatus confirmed', hist.newStatus, 'confirmed');
}

H.done();
