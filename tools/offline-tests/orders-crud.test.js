const H = require('./harness.js');
const { user, check, eq, throws } = H;

function line(over) {
  return Object.assign({ description: 'Ống nhựa PVC 90', qty: 2, unitPrice: '1.200.000',
                         uom: 'Cái', vatRate: 0.08 }, over || {});
}
function order(over) {
  return Object.assign({ customer: 'Nhựa Duy Tân', orderDate: '2026-08-20',
                         status: 'draft', po: '4600041936' }, over || {});
}

/* ---------- 1. create: one line ---------- */
console.log('\n1. Create an order with one line');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  const res = env.actionCreateOrder_(admin, { order: order(), lines: [line()] });

  eq('orderId is DH-2026-0001', res.order.orderId, 'DH-2026-0001');
  eq('one header row', env.store.Orders.length, 1);
  eq('one line row', env.store.OrderLines.length, 1);
  eq('lineId', env.store.OrderLines[0].lineId, 'DH-2026-0001-L01');
  eq('amountExVat = 2 x 1.200.000', env.store.OrderLines[0].amountExVat, 2400000);
  eq('amountIncVat at 8%', env.store.OrderLines[0].amountIncVat, 2592000);
  eq('header totalExVat', env.store.Orders[0].totalExVat, 2400000);
  eq('header totalIncVat', env.store.Orders[0].totalIncVat, 2592000);
  eq('createdBy is the actor', env.store.Orders[0].createdBy, 'admin@x.com');
  eq('Milestone 2.5 / P5: lineCount stored on create', env.store.Orders[0].lineCount, 1);
  eq('status history written', env.store.StatusHistory.length, 1);
  check('orderDate is a real Date',
     Object.prototype.toString.call(env.store.Orders[0].orderDate) === '[object Date]');
  eq('orderDate is 20/08/2026', env.store.Orders[0].orderDate.getDate() + '/' +
     (env.store.Orders[0].orderDate.getMonth() + 1), '20/8');
  eq('new customer remembered', JSON.parse(env.store.Config[0].value),
     ['Nhựa Duy Tân', 'Yamato']);
}

/* ---------- 2. create: eight lines, mixed VAT ---------- */
console.log('\n2. Create an order with eight lines and mixed VAT');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  const lines = [];
  for (let i = 0; i < 8; i++) {
    lines.push(line({ description: 'Hàng ' + (i + 1), qty: i + 1, unitPrice: 100000,
                      vatRate: i % 2 ? 0.1 : 0.08 }));
  }
  const res = env.actionCreateOrder_(admin, { order: order(), lines: lines });

  eq('eight line rows', env.store.OrderLines.length, 8);
  eq('line numbers 1..8', env.store.OrderLines.map(l => l.lineNo), [1,2,3,4,5,6,7,8]);
  eq('line ids L01..L08', env.store.OrderLines.map(l => l.lineId.slice(-3)),
     ['L01','L02','L03','L04','L05','L06','L07','L08']);

  const expectedEx = [1,2,3,4,5,6,7,8].reduce((sum, q) => sum + q * 100000, 0);
  const expectedInc = [1,2,3,4,5,6,7,8].reduce(
    (sum, q, i) => sum + Math.round(q * 100000 * (1 + (i % 2 ? 0.1 : 0.08))), 0);
  eq('totalExVat = sum of lines', env.store.Orders[0].totalExVat, expectedEx);
  eq('totalIncVat = sum of per-line rounded amounts', env.store.Orders[0].totalIncVat, expectedInc);
  eq('Milestone 2.5 / P5: lineCount stored on create matches the 8 lines',
     env.store.Orders[0].lineCount, 8);
  eq('response carries 8 lines', res.lines.length, 8);
  eq('second order gets 0002',
     env.actionCreateOrder_(admin, { order: order(), lines: [line()] }).order.orderId,
     'DH-2026-0002');
}

/* ---------- 3. edit: keep, change, add, remove ---------- */
console.log('\n3. Edit: keep one line, change one, add one, remove one');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  const created = env.actionCreateOrder_(admin, {
    order: order(),
    lines: [line({ description: 'A' }), line({ description: 'B' }), line({ description: 'C' })]
  });
  const ids = created.lines.map(l => l.lineId);

  const updated = env.actionUpdateOrder_(admin, {
    orderId: 'DH-2026-0001',
    order: order({ status: 'confirmed', statusNote: 'Khách đã cọc' }),
    lines: [
      { lineId: ids[0], description: 'A', qty: 2, unitPrice: 1200000, vatRate: 0.08 },
      { lineId: ids[2], description: 'C sửa', qty: 5, unitPrice: 200000, vatRate: 0.1 },
      { description: 'D mới', qty: 1, unitPrice: 500000, vatRate: 0.08 }
    ]
  });

  eq('still one header', env.store.Orders.length, 1);
  eq('three lines after edit', env.store.OrderLines.length, 3);
  eq('kept line A keeps its id', env.store.OrderLines[0].lineId, ids[0]);
  eq('B is gone', env.store.OrderLines.filter(l => l.description === 'B').length, 0);
  eq('C keeps its id after being changed',
     env.store.OrderLines.filter(l => l.description === 'C sửa')[0].lineId, ids[2]);
  eq('new line got a fresh id',
     env.store.OrderLines.filter(l => l.description === 'D mới')[0].lineId, 'DH-2026-0001-L04');
  eq('line numbers renumbered 1..3',
     env.store.OrderLines.map(l => l.lineNo).sort(), [1, 2, 3]);
  eq('totals recomputed', env.store.Orders[0].totalExVat, 2400000 + 1000000 + 500000);
  eq('status change logged', env.store.StatusHistory.length, 2);
  eq('updatedBy set', env.store.Orders[0].updatedBy, 'admin@x.com');
  eq('response line count', updated.lines.length, 3);
  eq('no orphan lines',
     env.store.OrderLines.filter(l => l.orderId !== 'DH-2026-0001').length, 0);
  eq('Milestone 2.5 / P5: lineCount stays correct after edit (3 lines in, 3 out)',
     env.store.Orders[0].lineCount, 3);

  // Edit again, this time actually changing the count, to prove lineCount
  // tracks the CURRENT save rather than the value from creation.
  env.actionUpdateOrder_(admin, {
    orderId: 'DH-2026-0001',
    order: order({ status: 'confirmed' }),
    lines: [{ lineId: ids[0], description: 'A', qty: 2, unitPrice: 1200000, vatRate: 0.08 }]
  });
  eq('Milestone 2.5 / P5: lineCount drops to 1 after trimming down to one line',
     env.store.Orders[0].lineCount, 1);
}

/* ---------- 4. delete ---------- */
console.log('\n4. Delete removes the header and every line');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  env.actionCreateOrder_(admin, { order: order(), lines: [line(), line(), line()] });
  env.actionCreateOrder_(admin, { order: order({ customer: 'Yamato' }), lines: [line()] });

  env.actionDeleteOrder_(admin, { orderId: 'DH-2026-0001' });

  eq('one header left', env.store.Orders.length, 1);
  eq('surviving header is 0002', env.store.Orders[0].orderId, 'DH-2026-0002');
  eq('only the other order\'s line remains', env.store.OrderLines.length, 1);
  eq('remaining line belongs to 0002', env.store.OrderLines[0].orderId, 'DH-2026-0002');
  throws('deleted order cannot be fetched',
         () => env.actionGetOrder_(admin, { orderId: 'DH-2026-0001' }), 'Không tìm thấy');
}

/* ---------- 9. Milestone 2.5 / P4 — pagination ---------- */
console.log('\n9. Pagination: 25 orders, page 1 and page 2');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');

  // Distinct orderDate per order (not the shared wall-clock createdAt tie-
  // breaker) so newest-first order is deterministic regardless of how fast
  // this loop runs.
  for (let i = 1; i <= 25; i++) {
    env.actionCreateOrder_(admin, {
      order: order({ orderDate: '2026-08-' + String(i).padStart(2, '0') }),
      lines: [line()]
    });
  }

  const p1 = env.actionListOrders_(admin, { page: 1, pageSize: 20 });
  eq('page 1 has 20 rows', p1.orders.length, 20);
  eq('page 1 total is 25', p1.total, 25);
  eq('page 1 hasMore', p1.hasMore, true);
  eq('page 1 is newest first', p1.orders[0].orderId, 'DH-2026-0025');
  eq('page 1 last row', p1.orders[19].orderId, 'DH-2026-0006');

  const p2 = env.actionListOrders_(admin, { page: 2, pageSize: 20 });
  eq('page 2 has the remaining 5 rows', p2.orders.length, 5);
  eq('page 2 hasMore is false', p2.hasMore, false);
  eq('page 2 picks up where page 1 stopped', p2.orders[0].orderId, 'DH-2026-0005');
  eq('page 2 last row is the oldest order', p2.orders[4].orderId, 'DH-2026-0001');

  const noParams = env.actionListOrders_(admin, {});
  eq('default pageSize is 20', noParams.pageSize, 20);
  eq('default page is 1', noParams.page, 1);

  const oversized = env.actionListOrders_(admin, { pageSize: 9999 });
  eq('pageSize is capped at LIST_PAGE_SIZE_MAX, not what the client asked for',
     oversized.pageSize, 100);
  eq('capped pageSize still only returns the 25 that exist', oversized.orders.length, 25);
}

H.done();
