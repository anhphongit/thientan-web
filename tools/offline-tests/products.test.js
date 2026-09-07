/**
 * Offline tests for Milestone 5 / 5.1 — Products.gs (product/stock CRUD).
 * Run with: node tools/offline-tests/products.test.js
 */
const H = require('./harness.js');
const { user, check, eq, throws } = H;

function product(over) {
  return Object.assign({ code: 'SP-CODE-1', name: 'Ống nhựa PVC 90', uom: 'Cái',
                         stockQty: 100, minStock: 10, lastPrice: 50000, note: '' }, over || {});
}

/* ---------- 1. permission enforcement ---------- */
console.log('\n1. every action requires manage_inventory');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { manage_inventory: true });
  const noPerm = user('b@x.com', { manage_inventory: false });

  throws('listProducts refused', () => env.actionListProducts_(noPerm, {}), 'không có quyền');
  throws('createProduct refused', () => env.actionCreateProduct_(noPerm, { product: product() }), 'không có quyền');

  const created = env.actionCreateProduct_(admin, { product: product() });
  throws('getProduct refused', () => env.actionGetProduct_(noPerm, { productId: created.productId }), 'không có quyền');
  throws('updateProduct refused', () => env.actionUpdateProduct_(noPerm, { productId: created.productId, product: product() }), 'không có quyền');
  throws('deleteProduct refused', () => env.actionDeleteProduct_(noPerm, { productId: created.productId }), 'không có quyền');

  check('admin\'s create succeeded', !!created.productId);
}

/* ---------- 2. create: validation ---------- */
console.log('\n2. create validates required fields and numeric ranges');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { manage_inventory: true });

  throws('no code', () => env.actionCreateProduct_(admin, { product: product({ code: '' }) }), 'mã sản phẩm');
  throws('no name', () => env.actionCreateProduct_(admin, { product: product({ name: '' }) }), 'tên sản phẩm');
  throws('negative stockQty', () => env.actionCreateProduct_(admin, { product: product({ stockQty: -5 }) }), 'tồn kho không hợp lệ');
  throws('negative minStock', () => env.actionCreateProduct_(admin, { product: product({ minStock: -1 }) }), 'tối thiểu không hợp lệ');
  throws('negative lastPrice', () => env.actionCreateProduct_(admin, { product: product({ lastPrice: -100 }) }), 'Giá không hợp lệ');

  const ok = env.actionCreateProduct_(admin, { product: product() });
  eq('productId assigned (SP-0001)', ok.productId, 'SP-0001');
  eq('code stored', ok.code, 'SP-CODE-1');
  eq('active defaults to true when omitted', ok.active, true);
}

/* ---------- 3. create: productId sequence + code uniqueness ---------- */
console.log('\n3. sequential productId, duplicate code refused');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { manage_inventory: true });

  const p1 = env.actionCreateProduct_(admin, { product: product({ code: 'A1' }) });
  const p2 = env.actionCreateProduct_(admin, { product: product({ code: 'A2' }) });
  eq('first id', p1.productId, 'SP-0001');
  eq('second id', p2.productId, 'SP-0002');

  throws('duplicate code (exact) refused', () => env.actionCreateProduct_(admin, { product: product({ code: 'A1' }) }), 'đã tồn tại');
  throws('duplicate code (case/space-insensitive) refused', () => env.actionCreateProduct_(admin, { product: product({ code: '  a1  ' }) }), 'đã tồn tại');
}

/* ---------- 4. update: validation, self-exclusion on code uniqueness ---------- */
console.log('\n4. update revalidates fields and only refuses code clashing with a DIFFERENT product');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { manage_inventory: true });
  const p1 = env.actionCreateProduct_(admin, { product: product({ code: 'A1', name: 'Tên A1' }) });
  const p2 = env.actionCreateProduct_(admin, { product: product({ code: 'A2', name: 'Tên A2' }) });

  const updated = env.actionUpdateProduct_(admin, { productId: p1.productId, product: product({ code: 'A1', name: 'Tên A1 mới', stockQty: 55 }) });
  eq('same code as before is fine (self-exclusion)', updated.code, 'A1');
  eq('name updated', updated.name, 'Tên A1 mới');
  eq('stockQty updated', updated.stockQty, 55);

  throws('renaming p1 to p2\'s code is refused', () => env.actionUpdateProduct_(admin, { productId: p1.productId, product: product({ code: 'A2' }) }), 'đã tồn tại');

  throws('update on unknown productId', () => env.actionUpdateProduct_(admin, { productId: 'SP-9999', product: product() }), 'Không tìm thấy sản phẩm');
}

/* ---------- 5. low-stock flag ---------- */
console.log('\n5. isLowStock only fires with a real threshold set, never for inactive products');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { manage_inventory: true });

  const noThreshold = env.actionCreateProduct_(admin, { product: product({ code: 'B1', stockQty: 0, minStock: 0 }) });
  eq('stockQty 0 / minStock 0 (no threshold set) is NOT low stock', noThreshold.isLowStock, false);

  const belowThreshold = env.actionCreateProduct_(admin, { product: product({ code: 'B2', stockQty: 5, minStock: 10 }) });
  eq('stockQty <= minStock (threshold set) IS low stock', belowThreshold.isLowStock, true);

  const atThreshold = env.actionCreateProduct_(admin, { product: product({ code: 'B3', stockQty: 10, minStock: 10 }) });
  eq('stockQty == minStock IS low stock (boundary inclusive)', atThreshold.isLowStock, true);

  const aboveThreshold = env.actionCreateProduct_(admin, { product: product({ code: 'B4', stockQty: 20, minStock: 10 }) });
  eq('stockQty > minStock is NOT low stock', aboveThreshold.isLowStock, false);

  const inactiveLow = env.actionCreateProduct_(admin, { product: product({ code: 'B5', stockQty: 1, minStock: 10, active: true }) });
  const deactivated = env.actionUpdateProduct_(admin, { productId: inactiveLow.productId, product: product({ code: 'B5', stockQty: 1, minStock: 10, active: false }) });
  eq('deactivated product is never flagged low-stock even if under threshold', deactivated.isLowStock, false);
}

/* ---------- 6. list: pagination, search, includeInactive, lowStockOnly, lowStockTotal ---------- */
console.log('\n6. actionListProducts_ pagination/search/filters');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { manage_inventory: true });

  env.actionCreateProduct_(admin, { product: product({ code: 'C1', name: 'Ống nhựa', stockQty: 5, minStock: 10 }) });   // low stock
  env.actionCreateProduct_(admin, { product: product({ code: 'C2', name: 'Van khoá', stockQty: 50, minStock: 10 }) });  // fine
  const inactiveOne = env.actionCreateProduct_(admin, { product: product({ code: 'C3', name: 'Ống thép', stockQty: 1, minStock: 10 }) });
  env.actionUpdateProduct_(admin, { productId: inactiveOne.productId, product: product({ code: 'C3', name: 'Ống thép', stockQty: 1, minStock: 10, active: false }) });

  const activeOnly = env.actionListProducts_(admin, {});
  eq('inactive product excluded by default', activeOnly.total, 2);
  eq('lowStockTotal counts only C1 (C3 inactive is excluded from scope entirely)', activeOnly.lowStockTotal, 1);

  const withInactive = env.actionListProducts_(admin, { includeInactive: true });
  eq('includeInactive:true shows all 3', withInactive.total, 3);

  const searchByName = env.actionListProducts_(admin, { q: 'van' });
  eq('search matches name substring case-insensitively', searchByName.total, 1);
  eq('search result is C2', searchByName.products[0].code, 'C2');

  const searchByCode = env.actionListProducts_(admin, { q: 'c1' });
  eq('search matches code too', searchByCode.total, 1);

  const lowOnly = env.actionListProducts_(admin, { lowStockOnly: true });
  eq('lowStockOnly filters to just C1', lowOnly.total, 1);
  eq('lowStockOnly result is C1', lowOnly.products[0].code, 'C1');

  const sorted = env.actionListProducts_(admin, {});
  eq('sorted by code ascending', sorted.products.map(p => p.code), ['C1', 'C2']);

  const paged = env.actionListProducts_(admin, { pageSize: 1, page: 1 });
  eq('pageSize respected', paged.products.length, 1);
  eq('hasMore true with more rows beyond page 1', paged.hasMore, true);
  const page2 = env.actionListProducts_(admin, { pageSize: 1, page: 2 });
  eq('page 2 has the second row', page2.products.length, 1);
  eq('hasMore false on the last page', page2.hasMore, false);
}

/* ---------- 7. delete: refused when referenced by an OrderLine, allowed otherwise ---------- */
console.log('\n7. deleteProduct refuses when OrderLines.productCode still references it');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { manage_inventory: true, view_orders: true, create_order: true });

  const unreferenced = env.actionCreateProduct_(admin, { product: product({ code: 'D1' }) });
  const result = env.actionDeleteProduct_(admin, { productId: unreferenced.productId });
  check('unreferenced product deletes fine', result.deleted === true);
  throws('deleted product no longer gettable', () => env.actionGetProduct_(admin, { productId: unreferenced.productId }), 'Không tìm thấy sản phẩm');

  const referenced = env.actionCreateProduct_(admin, { product: product({ code: 'D2' }) });
  env.actionCreateOrder_(admin, {
    order: { customer: 'KH Test', orderDate: '2026-09-06', status: 'draft', po: 'PO-1' },
    lines: [{ description: 'Hàng D2', qty: 1, unitPrice: 10000, uom: 'Cái', vatRate: 0.08, productCode: 'D2' }]
  });

  throws('referenced product cannot be deleted', () => env.actionDeleteProduct_(admin, { productId: referenced.productId }), 'Không thể xoá');
  const stillThere = env.actionGetProduct_(admin, { productId: referenced.productId });
  check('referenced product is untouched after the refused delete', stillThere.code === 'D2');

  // Referenced product CAN still be deactivated instead — the door delete closes.
  const deactivated = env.actionUpdateProduct_(admin, { productId: referenced.productId, product: product({ code: 'D2', active: false }) });
  eq('deactivating a referenced product still works', deactivated.active, false);
}

/* ---------- 8. getProduct not found ---------- */
console.log('\n8. getProduct on an unknown id throws PRODUCT_NOT_FOUND');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { manage_inventory: true });
  throws('unknown productId', () => env.actionGetProduct_(admin, { productId: 'SP-9999' }), 'Không tìm thấy sản phẩm');
  throws('blank productId', () => env.actionGetProduct_(admin, {}), 'Không tìm thấy sản phẩm');
}

/* ---------- 9. lookupProducts: permission gate on create_order, response shape ---------- */
console.log('\n9. actionLookupProducts_ (product picker for order lines)');
{
  const env = H.makeEnv();
  const noPermAtAll = user('a@x.com', { create_order: false, manage_inventory: false });
  const warehouse = user('b@x.com', { create_order: false, manage_inventory: true });  // can see inventory, not orders
  const sales = user('c@x.com', { create_order: true, manage_inventory: false });      // can create orders, not inventory
  const admin = user('d@x.com', { create_order: true, manage_inventory: true });

  throws('user with no permissions refused', () => env.actionLookupProducts_(noPermAtAll, { q: 'test' }), 'không có quyền');
  throws('warehouse (manage_inventory but no create_order) refused', () => env.actionLookupProducts_(warehouse, { q: 'test' }), 'không có quyền');

  // Create some test products
  const p1 = env.actionCreateProduct_(admin, { product: product({ code: 'VAL-001', name: 'Van lõi trắng' }) });
  const p2 = env.actionCreateProduct_(admin, { product: product({ code: 'VAL-002', name: 'Van lõi vàng' }) });
  const p3 = env.actionCreateProduct_(admin, { product: product({ code: 'ONG-001', name: 'Ống PVC xanh' }) });
  const inactive = env.actionCreateProduct_(admin, { product: product({ code: 'OLD-001', name: 'Sản phẩm cũ' }) });
  env.actionUpdateProduct_(admin, { productId: inactive.productId, product: product({ code: 'OLD-001', name: 'Sản phẩm cũ', active: false }) });

  // Sales user can call lookupProducts
  const byCodePrefix = env.actionLookupProducts_(sales, { q: 'val' });
  eq('code prefix match returns 2 products (VAL-001, VAL-002)', byCodePrefix.length, 2);
  eq('first result code', byCodePrefix[0].code, 'VAL-001');

  const byName = env.actionLookupProducts_(sales, { q: 'van' });
  eq('name substring match returns 2 products', byName.length, 2);

  const noMatch = env.actionLookupProducts_(sales, { q: 'xxx' });
  eq('no match returns empty array', noMatch.length, 0);

  const underMinLen = env.actionLookupProducts_(sales, { q: 'v' });
  eq('query < 2 chars returns empty array', underMinLen.length, 0);

  // Response shape: should have code, name, uom, lastPrice; should NOT have productId, stockQty, minStock
  const result = byCodePrefix[0];
  check('response has code', result.code === 'VAL-001');
  check('response has name', result.name === 'Van lõi trắng');
  check('response has uom', result.uom !== undefined);
  check('response has lastPrice', result.lastPrice !== undefined);
  check('response does NOT have productId', result.productId === undefined);
  check('response does NOT have stockQty', result.stockQty === undefined);
  check('response does NOT have minStock', result.minStock === undefined);

  // Inactive products excluded
  const allActive = env.actionLookupProducts_(sales, { q: 'on' }); // Matches ONG-001 (active), OLD-001 (inactive)
  eq('inactive products excluded from lookup', allActive.length, 1);
  eq('only active product returned', allActive[0].code, 'ONG-001');

  // Results sorted by code
  const multiMatch = env.actionLookupProducts_(sales, { q: 'va' }); // Matches VAL-001, VAL-002
  const codes = multiMatch.map(p => p.code);
  eq('results sorted by code ascending', codes[0] <= codes[1], true);

  // Admin can also call (they have create_order: true)
  const adminResult = env.actionLookupProducts_(admin, { q: 'val' });
  eq('admin can also call lookupProducts', adminResult.length, 2);
}

H.done();
