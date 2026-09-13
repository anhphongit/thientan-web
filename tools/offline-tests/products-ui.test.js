/**
 * Smoke test for ViewsInventory.html without a browser — same technique and
 * scope as orders-ui.test.js: run the module against a DOM stub that only
 * records what it is asked to draw, then check the HTML it produces is well
 * formed and contains the controls the checklist asks for. Not a full
 * simulated-typing test (querySelector always returns null here, same as
 * orders-ui.test.js — collect() against real input values is exercised by
 * hand during Phong's live test, not here); this proves render/list/filter/
 * pagination/form-shape/cross-tab-guard wiring, matching the actual rigor
 * orders-ui.test.js applies to ViewsOrders.html.
 */
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(__dirname + '/../../apps/web/ui/ViewsInventory.html', 'utf8')
  .replace(/^<script>/, '').replace(/<\/script>\s*$/, '');

let painted = '';
const node = () => ({ addEventListener() {}, set innerHTML(v) { painted = v; },
                      get innerHTML() { return painted; },
                      querySelector: () => null, querySelectorAll: () => [] });
const root = node();

const session = {
  permissions: { manage_inventory: true },
  config: { uomList: ['Cái', 'Cuộn', 'Bịch'] }
};

let lastCall = null;
let lastToast = null;
let lastConfirmOpts = null;
const callCounts = {};
const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Same load-order discipline as orders-ui.test.js: window starts empty and
 * TT is only attached AFTER the module evaluates — ui/Index.html includes
 * every ui/Views*.html file BEFORE ui/App.html, so window.TT does not exist
 * while this module's IIFE runs. Do not simplify this away.
 */
const sandbox = { console, window: {} };

const TT_BRIDGE = {
  call: (fn, arg) => {
    lastCall = { fn, arg };
    callCounts[fn] = (callCounts[fn] || 0) + 1;
    return Promise.resolve(fixture(fn, arg));
  },
  can: p => session.permissions[p] === true,
  esc: esc,
  formatVnd: n => Math.round(Number(n) || 0).toLocaleString('vi-VN') + ' ₫',
  formatDate: v => v ? '20/08/2026' : '',
  toast(msg) { lastToast = msg; },
  confirm(opts) { lastConfirmOpts = opts; return Promise.resolve(true); },
  config: () => session.config,
  session: () => session,
  // Cross-tab guard fixture, same fixed-current convention as
  // orders-ui.test.js: these tests never simulate leaving the Kho hàng tab
  // mid-flight, so every async callback should be treated as still current.
  viewGeneration: () => 1,
  isCurrentView: () => true
};

sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'ViewsInventory.html' });

// Only now — exactly like App.html, which is included after every view module.
sandbox.window.TT = TT_BRIDGE;

function fixture(fn, arg) {
  if (fn === 'apiListProducts') {
    // total (5) bigger than shown (2, this fixture's page) with hasMore true
    // — exercises "Xem thêm"; lowStockTotal (1) independent of q/lowStockOnly
    // per actionListProducts_'s own contract.
    return { total: 5, shown: 2, page: 1, pageSize: 20, hasMore: true, lowStockTotal: 1, products: [
      { productId: 'SP-0001', code: 'SP-CODE-1', name: 'Ống nhựa PVC 90', uom: 'Cái',
        stockQty: 5, minStock: 10, lastPrice: 50000, active: true, note: '', isLowStock: true },
      { productId: 'SP-0002', code: 'A2 & <script>', name: 'Van khoá', uom: 'Cái',
        stockQty: 50, minStock: 10, lastPrice: 120000, active: false, note: '', isLowStock: false }
    ] };
  }
  if (fn === 'apiGetProduct') {
    return { productId: arg, code: 'SP-CODE-9', name: 'Sản phẩm khác', uom: 'Cuộn',
      stockQty: 3, minStock: 0, lastPrice: 0, active: true, note: '', isLowStock: false };
  }
  if (fn === 'apiCreateProduct' || fn === 'apiUpdateProduct') {
    return { productId: 'SP-0001', code: 'SP-CODE-1', name: 'Ống nhựa PVC 90', uom: 'Cái',
      stockQty: 5, minStock: 10, lastPrice: 50000, active: true, note: '', isLowStock: true };
  }
  if (fn === 'apiDeleteProduct') return { deleted: true, productId: arg };
  return {};
}

/* ---- assertions ---- */
let pass = 0, fail = 0;
const ok = (name, cond, detail) => cond ? (pass++, console.log('  ok   ' + name))
  : (fail++, console.log('  FAIL ' + name + (detail ? ' → ' + detail : '')));

const VOID = ['input', 'br', 'hr', 'img'];
function balanced(html) {
  const stack = [];
  const re = /<(\/?)([a-z][a-z0-9]*)\b[^>]*?(\/?)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const [, closing, tag, selfClose] = m;
    if (VOID.indexOf(tag.toLowerCase()) >= 0 || selfClose) continue;
    if (closing) {
      if (stack.pop() !== tag.toLowerCase()) return 'mismatched </' + tag + '>';
    } else stack.push(tag.toLowerCase());
  }
  return stack.length ? 'unclosed <' + stack.join('>, <') + '>' : null;
}

/* capture the listeners render() attaches, before anything renders */
const captured = {};
root.addEventListener = (type, fn) => { captured[type] = fn; };

function clickDataAct(act) {
  captured.click({ target: { closest: sel => sel.indexOf('data-act') >= 0
    ? { getAttribute: a => (a === 'data-act' ? act : null) } : null } });
}
function clickOpen(productId) {
  captured.click({ target: { closest: sel => sel.indexOf('data-open') >= 0
    ? { getAttribute: a => (a === 'data-open' ? productId : null) } : null } });
}

console.log('\nUI smoke — list');
ok('module registered itself', typeof sandbox.window.TTInventory === 'object');
ok('render is a function', typeof sandbox.window.TTInventory.render === 'function');
sandbox.window.TTInventory.render(root);
ok('render survived TT arriving after load', painted.indexOf('skeleton') >= 0);

setTimeout(() => {
  const list = painted;
  ok('list markup is balanced', balanced(list) === null, balanced(list));
  ok('shows both product codes', /SP-CODE-1/.test(list) && /A2 &amp; &lt;script&gt;/.test(list));
  ok('escapes a hostile product code', !/<script>/.test(list.replace(/&lt;script&gt;/g, '')),
     'raw <script> reached the DOM');
  ok('shows the low-stock badge on the flagged product', /pc-lowstock">Sắp hết hàng/.test(list));
  ok('shows the inactive badge on the deactivated product',
     /status-pill status-pill--cancelled">Ngừng kinh doanh/.test(list));
  ok('shows the standing low-stock summary line (independent of any filter)',
     /lowstock-summary/.test(list) && /1 sản phẩm đang ở mức tồn kho thấp/.test(list));
  ok('formats money as VND', /50\.000 ₫/.test(list));
  ok('shows the create button', /Thêm sản phẩm/.test(list));
  ok('asks the server for the list', lastCall.fn === 'apiListProducts');
  ok('asks page 1 at PAGE_SIZE 20 (mirrors LIST_PAGE_SIZE_DEFAULT)',
     lastCall.arg && lastCall.arg.page === 1 && lastCall.arg.pageSize === 20,
     JSON.stringify(lastCall.arg));
  ok('shows "Xem thêm" when the server says hasMore',
     /data-act="load-more"/.test(list) && /Xem thêm/.test(list));
  ok('shows the running count against the server total (2 shown / 5 total)',
     /Hiển thị 2 \/ 5 sản phẩm/.test(list), list.match(/Hiển thị[^<]*/));
  ok('shows a "Làm mới" control', /data-act="refresh-list"/.test(list));
  ok('shows the compact filter bar (search + two checkboxes, no collapsible panel)',
     /id="f-filter-q"/.test(list) && /id="f-filter-includeInactive"/.test(list) &&
     /id="f-filter-lowStockOnly"/.test(list));
  ok('no inline onclick attributes', !/onclick=/i.test(list));

  const rows = list.match(/data-open="/g) || [];
  ok('every product card is one navigable button', rows.length === 2);

  console.log('\nUI smoke — filters');
  clickDataAct('submit-search'); // disabled (empty draft) — must no-op, not throw
  ok('empty-search submit did not fire a second request', callCounts.apiListProducts === 1);

  // Toggling a filter checkbox applies immediately (no separate "Áp dụng").
  captured.change({ target: { id: 'f-filter-includeInactive', checked: true } });
  ok('checkbox toggle asked the server again', callCounts.apiListProducts === 2);
  ok('includeInactive was sent as true', lastCall.arg.includeInactive === true,
     JSON.stringify(lastCall.arg));

  setTimeout(() => {
    console.log('\nUI smoke — pagination');
    clickDataAct('load-more');
    ok('load-more asked for page 2', lastCall.arg && lastCall.arg.page === 2,
       JSON.stringify(lastCall.arg));

    setTimeout(() => {
      console.log('\nUI smoke — blank form');
      sandbox.window.TTInventory.render(root);
      setTimeout(() => {
        clickDataAct('new');
        const form = painted;
        ok('form markup is balanced', balanced(form) === null, balanced(form));
        ok('has the code and name fields', /id="f-code"/.test(form) && /id="f-name"/.test(form));
        ok('has a uom field with a datalist (free text, suggested list)',
           /id="f-uom"[^>]*list="uom-options"/.test(form) && /<datalist id="uom-options">/.test(form));
        ok('stockQty/minStock use a decimal keyboard, not the money grouping',
           /id="f-stockQty" inputmode="decimal"/.test(form) &&
           /id="f-minStock" inputmode="decimal"/.test(form));
        ok('lastPrice is the one grouped/money-formatted field',
           /id="f-lastPrice" class="money" inputmode="numeric"/.test(form));
        ok('active defaults to checked on a brand-new product', /id="f-active" checked/.test(form));
        ok('has a save button, no delete button on a new (unsaved) product',
           /data-act="save"/.test(form) && !/data-act="ask-delete"/.test(form));
        ok('no inline onclick attributes', !/onclick=/i.test(form));

        console.log('\nUI smoke — existing product (opened from the already-loaded list cache)');
        sandbox.window.TTInventory.render(root);
        setTimeout(() => {
          const before = callCounts.apiGetProduct || 0;
          clickOpen('SP-0001');
          const detail = painted;
          ok('detail markup is balanced', balanced(detail) === null, balanced(detail));
          ok('opening a product already in the list cache does NOT call apiGetProduct',
             (callCounts.apiGetProduct || 0) === before);
          ok('shows the product code in the heading', /SP-CODE-1/.test(detail));
          ok('has a delete button on an existing product', /data-act="ask-delete"/.test(detail));

          console.log('\nUI smoke — delete confirm flow');
          clickDataAct('ask-delete');
          ok('asked for confirmation before deleting', !!lastConfirmOpts);
          ok('confirm popup carries a product summary (code/status/name/stock)',
             !!lastConfirmOpts.summary && lastConfirmOpts.summary.id === 'SP-CODE-1');

          setTimeout(() => {
            ok('confirmed delete called apiDeleteProduct with the productId', lastCall.fn === 'apiDeleteProduct' &&
               lastCall.arg === 'SP-0001', JSON.stringify(lastCall));

            console.log('\nUI smoke — product not in cache falls back to apiGetProduct');
            sandbox.window.TTInventory.render(root);
            setTimeout(() => {
              const beforeGet = callCounts.apiGetProduct || 0;
              clickOpen('SP-9999');
              ok('shows a skeleton on the (cold) open', /skeleton/.test(painted));
              setTimeout(() => {
                ok('fell back to apiGetProduct for an id not on the current page',
                   (callCounts.apiGetProduct || 0) === beforeGet + 1 && lastCall.fn === 'apiGetProduct' &&
                   lastCall.arg === 'SP-9999');

                console.log('\nUI smoke — cache invalidation on filter mismatch (bug fix 2026-09-12)');
                /* Regression test: when a product is edited to no longer match the
                   current filters (e.g. active→inactive while includeInactive=false),
                   it should disappear from the cached list, not sit there stale until
                   a hard refresh. Drives upsertCachedProduct/removeCachedProduct
                   directly against real `state` (exposed via _test) since this test
                   file's DOM stub can't simulate the actual edit-form submit. */
                const T_ = sandbox.window.TTInventory._test;

                T_.state.filters = { q: '', includeInactive: false, lowStockOnly: false };
                T_.state.products = [
                  { productId: 'SP-1', code: 'C1', name: 'N1', active: true, isLowStock: false },
                  { productId: 'SP-2', code: 'C2', name: 'N2', active: true, isLowStock: false }
                ];
                T_.state.productsMeta = { total: 2, shown: 2 };
                T_.state.productsLoadedAt = Date.now();

                T_.upsertCachedProduct({ productId: 'SP-1', code: 'C1', name: 'N1',
                  active: false, isLowStock: false });
                ok('deactivating a product removes it from the cache when includeInactive is off',
                   T_.state.products.length === 1 && T_.state.products[0].productId === 'SP-2',
                   JSON.stringify(T_.state.products));
                ok('productsMeta.total is decremented alongside the removal',
                   T_.state.productsMeta.total === 1, T_.state.productsMeta.total);

                T_.upsertCachedProduct({ productId: 'SP-2', code: 'C2', name: 'N2 renamed',
                  active: true, isLowStock: false });
                ok('a product that still matches filters is updated in place, not dropped',
                   T_.state.products.length === 1 && T_.state.products[0].name === 'N2 renamed',
                   JSON.stringify(T_.state.products));

                T_.state.filters = { q: '', includeInactive: false, lowStockOnly: true };
                T_.state.products = [
                  { productId: 'SP-3', code: 'C3', name: 'N3', active: true, isLowStock: true }
                ];
                T_.state.productsMeta = { total: 1, shown: 1 };
                T_.upsertCachedProduct({ productId: 'SP-3', code: 'C3', name: 'N3',
                  active: true, isLowStock: false });
                ok('a product that drops below the low-stock threshold is removed when lowStockOnly is on',
                   T_.state.products.length === 0, JSON.stringify(T_.state.products));

                T_.state.filters = { q: '', includeInactive: true, lowStockOnly: false };
                T_.state.products = [];
                T_.state.productsMeta = { total: 0, shown: 0 };
                T_.upsertCachedProduct({ productId: 'SP-4', code: 'C4', name: 'N4',
                  active: false, isLowStock: false });
                ok('a newly-inactive product is still added when includeInactive is on',
                   T_.state.products.length === 1 && T_.state.products[0].productId === 'SP-4',
                   JSON.stringify(T_.state.products));

                console.log('\n' + pass + ' passed, ' + fail + ' failed');
                process.exit(fail ? 1 : 0);
              }, 0);
            }, 0);
          }, 0);
        }, 0);
      }, 0);
    }, 0);
  }, 0);
}, 0);
