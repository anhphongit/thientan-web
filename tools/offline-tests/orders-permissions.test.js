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

/* ---------- 5. permission scoping ---------- */
console.log('\n5. A user without view_all_orders cannot reach another user\'s order');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  const staff = user('staff@x.com', { view_all_orders: false });

  env.actionCreateOrder_(admin, { order: order(), lines: [line()] });            // 0001
  env.actionCreateOrder_(staff, { order: order({ customer: 'Yamato' }), lines: [line()] }); // 0002

  const list = env.actionListOrders_(staff, {});
  eq('staff sees only their own order', list.orders.map(o => o.orderId), ['DH-2026-0002']);
  eq('total reflects the scoped set', list.total, 1);

  throws('staff cannot open the admin order by id',
         () => env.actionGetOrder_(staff, { orderId: 'DH-2026-0001' }), 'không có quyền');
  throws('staff cannot edit the admin order',
         () => env.actionUpdateOrder_(staff, { orderId: 'DH-2026-0001',
               order: order(), lines: [line()] }), 'không có quyền');
  throws('staff cannot delete the admin order',
         () => env.actionDeleteOrder_(staff, { orderId: 'DH-2026-0001' }), 'không có quyền');

  const viewer = user('viewer@x.com', { create_order: false, edit_order: false, delete_order: false });
  throws('viewer cannot create', () => env.actionCreateOrder_(viewer,
         { order: order(), lines: [line()] }), 'không có quyền');
  const asViewer = env.actionGetOrder_(viewer, { orderId: 'DH-2026-0001' });
  eq('viewer gets canEdit false', asViewer.order.canEdit, false);
  eq('viewer gets canDelete false', asViewer.order.canDelete, false);

  const noStatus = user('nostatus@x.com', { change_status: false });
  throws('changing status needs change_status',
         () => env.actionUpdateOrder_(noStatus, { orderId: 'DH-2026-0001',
               order: order({ status: 'confirmed' }), lines: [line()] }), 'không có quyền');
  const same = env.actionUpdateOrder_(noStatus, { orderId: 'DH-2026-0001',
        order: order({ status: 'draft', statusNote: 'ghi chú' }), lines: [line()] });
  eq('editing without touching status is allowed', same.order.statusNote, 'ghi chú');
}

/* ---------- 6. field filtering and money-blind editing ---------- */
console.log('\n6. A user who cannot see prices cannot erase them either');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');
  const created = env.actionCreateOrder_(admin, {
    order: order({ customerDeposit: '47.466.000', supplierName: 'Tâm Thịnh Phát',
                   supplierPaid: '18.765.000' }),
    lines: [line()]
  });
  eq('deposit stored as an integer', env.store.Orders[0].customerDeposit, 47466000);
  eq('supplier payment stored', env.store.Orders[0].supplierPaid, 18765000);

  const warehouse = user('kho@x.com', { visible_fields:
    ['orderId', 'po', 'customer', 'orderDate', 'status', 'description', 'qty', 'uom', 'lineId'] });

  const seen = env.actionGetOrder_(warehouse, { orderId: 'DH-2026-0001' });
  check('warehouse sees no unitPrice', !('unitPrice' in seen.lines[0]));
  check('warehouse sees no totals', !('totalExVat' in seen.order));
  check('warehouse sees no deposit', !('customerDeposit' in seen.order));
  eq('hiddenMoney flag set', seen.hiddenMoney, true);
  eq('warehouse still sees the description', seen.lines[0].description, 'Ống nhựa PVC 90');

  // Their form has no price inputs, so it posts back blanks. Prices must survive.
  env.actionUpdateOrder_(warehouse, {
    orderId: 'DH-2026-0001',
    order: { customer: 'Nhựa Duy Tân', orderDate: '2026-08-20', status: 'draft', po: 'x' },
    lines: [{ lineId: created.lines[0].lineId, description: 'Ống nhựa PVC 90', qty: 2, uom: 'Cái' }]
  });
  eq('unitPrice survived', env.store.OrderLines[0].unitPrice, 1200000);
  eq('vatRate survived', env.store.OrderLines[0].vatRate, 0.08);
  eq('amounts recomputed from the surviving price', env.store.OrderLines[0].amountIncVat, 2592000);
  eq('deposit survived', env.store.Orders[0].customerDeposit, 47466000);
  eq('supplier payment survived', env.store.Orders[0].supplierPaid, 18765000);
}

/* ---------- 7. invoices ---------- */
console.log('\n7. One invoice across several orders, several invoices in one order');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');

  env.actionCreateOrder_(admin, {
    order: order(),
    lines: [
      line({ description: 'L1', invoiceNo: '50', invoiceDate: '2026-03-30' }),
      line({ description: 'L2', invoiceNo: '51', invoiceDate: '2026-04-02' }),
      line({ description: 'L3' })
    ]
  });
  env.actionCreateOrder_(admin, {
    order: order({ customer: 'Yamato' }),
    lines: [line({ description: 'K1', invoiceNo: '50', invoiceDate: '2026-03-30' })]
  });

  eq('two invoice records only', env.store.Invoices.map(i => i.invoiceId),
     ['HD-2026-0050', 'HD-2026-0051']);
  eq('invoice 50 shared by two orders',
     env.store.OrderLines.filter(l => l.invoiceId === 'HD-2026-0050').map(l => l.orderId),
     ['DH-2026-0001', 'DH-2026-0002']);
  eq('one order carries two invoices',
     env.store.OrderLines.filter(l => l.orderId === 'DH-2026-0001')
       .map(l => l.invoiceId), ['HD-2026-0050', 'HD-2026-0051', '']);

  const fetched = env.actionGetOrder_(admin, { orderId: 'DH-2026-0001' });
  eq('invoice number joined back for display', fetched.lines[0].invoiceNo, '50');
  check('invoice date joined back', !!fetched.lines[0].invoiceDate);
  eq('uninvoiced line shows no number', fetched.lines[2].invoiceNo, '');

  throws('an invoice number without a date is refused',
         () => env.actionCreateOrder_(admin, { order: order(),
               lines: [line({ invoiceNo: '77' })] }), 'ngày hoá đơn');
}

/* ---------- 8. validation ---------- */
console.log('\n8. Validation refuses what the sheet should never hold');
{
  const env = H.makeEnv();
  const admin = user('admin@x.com');

  throws('no customer', () => env.actionCreateOrder_(admin,
    { order: order({ customer: '  ' }), lines: [line()] }), 'khách hàng');
  throws('no lines', () => env.actionCreateOrder_(admin,
    { order: order(), lines: [] }), 'ít nhất một dòng');
  throws('bad date', () => env.actionCreateOrder_(admin,
    { order: order({ orderDate: 'hôm qua' }), lines: [line()] }), 'Ngày đặt hàng');
  throws('unknown status', () => env.actionCreateOrder_(admin,
    { order: order({ status: 'xong_roi' }), lines: [line()] }), 'Trạng thái');
  throws('empty description', () => env.actionCreateOrder_(admin,
    { order: order(), lines: [line({ description: '' })] }), 'Dòng 1');
  throws('zero quantity', () => env.actionCreateOrder_(admin,
    { order: order(), lines: [line(), line({ qty: 0 })] }), 'Dòng 2');
  throws('negative quantity', () => env.actionCreateOrder_(admin,
    { order: order(), lines: [line({ qty: -3 })] }), 'số lượng');
  throws('VAT rate not on the list', () => env.actionCreateOrder_(admin,
    { order: order(), lines: [line({ vatRate: 0.15 })] }), 'VAT');
  const many = [];
  for (let i = 0; i < 51; i++) many.push(line());
  throws('more than 50 lines', () => env.actionCreateOrder_(admin,
    { order: order(), lines: many }), 'tối đa 50');
  throws('unknown orderId on update', () => env.actionUpdateOrder_(admin,
    { orderId: 'DH-2026-9999', order: order(), lines: [line()] }), 'Không tìm thấy');

  eq('nothing was written', env.store.Orders.length, 0);

  // A hostile client trying to reuse another order's lineId must not repoint it.
  env.actionCreateOrder_(admin, { order: order(), lines: [line({ description: 'X' })] });
  env.actionCreateOrder_(admin, { order: order(), lines: [line({ description: 'Y' })] });
  env.actionUpdateOrder_(admin, { orderId: 'DH-2026-0002', order: order(),
    lines: [{ lineId: 'DH-2026-0001-L01', description: 'cướp dòng', qty: 1,
              unitPrice: 1, vatRate: 0.08 }] });
  eq('order 0001 still owns its line',
     env.store.OrderLines.filter(l => l.orderId === 'DH-2026-0001').length, 1);
  eq('order 0001 line untouched',
     env.store.OrderLines.filter(l => l.orderId === 'DH-2026-0001')[0].description, 'X');
  eq('the stolen id was reissued under 0002',
     env.store.OrderLines.filter(l => l.orderId === 'DH-2026-0002')[0].lineId,
     'DH-2026-0002-L02');

  // Client-supplied money and ownership must be ignored.
  const forged = env.actionCreateOrder_(admin, {
    order: order({ orderId: 'DH-2026-0001', totalExVat: 999, createdBy: 'boss@x.com' }),
    lines: [line({ amountExVat: 1, qty: 1, unitPrice: 1000 })]
  });
  eq('client orderId ignored', forged.order.orderId, 'DH-2026-0003');
  eq('client total ignored', forged.order.totalExVat, 1000);
  eq('client createdBy ignored', forged.order.createdBy, 'admin@x.com');
}

H.done();
