/**
 * Smoke test for ViewsOrders.html without a browser: run the module against a
 * DOM stub that only records what it is asked to draw, then check the HTML it
 * produces is well formed and contains the controls the checklist asks for.
 */
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(__dirname + '/../../apps/web/ui/ViewsOrders.html', 'utf8')
  .replace(/^<script>/, '').replace(/<\/script>\s*$/, '');

let painted = '';
const node = () => ({ addEventListener() {}, set innerHTML(v) { painted = v; },
                      get innerHTML() { return painted; },
                      querySelector: () => null, querySelectorAll: () => [] });
const root = node();

const session = {
  permissions: { view_orders: true, create_order: true, edit_order: true,
                 delete_order: true, change_status: true, visible_fields: ['*'] },
  config: { statusList: [{ key: 'draft', label: 'Nháp' }, { key: 'paid', label: 'Đã thanh toán' }],
            uomList: ['Cái', 'Cuộn'], vatRates: [0.08, 0.1],
            customerList: ['Nhựa Duy Tân', 'Yamato & Co <script>'] }
};

let lastCall = null;
const callCounts = {};
const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * IMPORTANT — the sandbox starts with an EMPTY window, and TT is attached only
 * AFTER the module has been evaluated. That reproduces the real load order:
 * ui/Index.html includes ViewsOrders BEFORE App.html, so window.TT does not
 * exist while this file is being parsed. A module that captures TT at load time
 * hangs on "Đang tải đơn hàng..." (the live bug found 2026-08-20). Do not
 * "simplify" this by defining TT up front — that is what hid the bug.
 */
const sandbox = {
  console,
  window: {}
};

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
  toast() {},
  config: () => session.config,
  session: () => session
};

sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'ViewsOrders.html' });

// Only now — exactly like App.html, which is included after this file.
sandbox.window.TT = TT_BRIDGE;

function fixture(fn, arg) {
  if (fn === 'apiListOrders') {
    // Milestone 2.5 / P4: total (25) is bigger than shown (2, this fixture's
    // page), with hasMore true — exercises the "Xem thêm" button below.
    return { total: 25, shown: 2, page: 1, pageSize: 20, hasMore: true, orders: [
      { orderId: 'DH-2026-0001', customer: 'Nhựa Duy Tân', orderDate: '2026-08-20',
        po: '4600041936', status: 'draft', lineCount: 3,
        totalExVat: 2400000, totalIncVat: 2592000, canEdit: true, canDelete: true },
      { orderId: 'DH-2026-0002', customer: 'Yamato & Co <script>', orderDate: '2026-08-19',
        po: '', status: 'paid', lineCount: 1, totalExVat: 100, totalIncVat: 108 }
    ] };
  }
  if (fn === 'apiGetOrder') {
    // Milestone 2.5c / D1 fixture — one order with one line, enough to
    // exercise the detail cache without dragging in the whole form fixture.
    return { hiddenMoney: false, order: {
        orderId: arg, customer: 'Nhựa Duy Tân', orderDate: '2026-08-20',
        po: '4600041936', poNote: '', status: 'draft', statusNote: '',
        customerDeposit: 0, supplierName: '', supplierPaid: 0,
        totalExVat: 2400000, totalIncVat: 2592000,
        canEdit: true, canDelete: true, canChangeStatus: true
      }, lines: [
        { lineId: 'L1', productCode: '', description: 'Ống nhựa PVC', unitPrice: 2400000,
          qty: 1, uom: 'Cái', vatRate: 0.08, invoiceNo: '', invoiceDate: '', note: '' }
      ] };
  }
  return {};
}

/* ---- assertions ---- */
let pass = 0, fail = 0;
const ok = (name, cond, detail) => cond ? (pass++, console.log('  ok   ' + name))
  : (fail++, console.log('  FAIL ' + name + (detail ? ' → ' + detail : '')));

const VOID = ['input', 'br', 'hr', 'img', 'option-void'];
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

console.log('\nUI smoke — list');
ok('module registered itself', typeof sandbox.window.TTOrders === 'object');
ok('render is a function', typeof sandbox.window.TTOrders.render === 'function');
sandbox.window.TTOrders.render(root);
// Milestone 2.5 / P3 replaced the "Đang tải đơn hàng..." text with skeleton
// cards on a cold load — this still proves the same thing the original
// assertion did: render() reached a paint at all instead of throwing when TT
// arrived after load (the 2026-08-20 bug this test exists to catch).
ok('render survived TT arriving after load', painted.indexOf('skeleton') >= 0);
setTimeout(() => {
  const list = painted;
  ok('list markup is balanced', balanced(list) === null, balanced(list));
  ok('shows both order ids', /DH-2026-0001/.test(list) && /DH-2026-0002/.test(list));
  ok('shows the Vietnamese status label', /Đã thanh toán/.test(list));
  ok('shows the create button', /Tạo đơn hàng/.test(list));
  ok('formats money as VND', /2\.592\.000 ₫/.test(list));
  ok('escapes a hostile customer name',
     !/<script>/.test(list.replace(/&lt;script&gt;/g, '')), 'raw <script> reached the DOM');
  ok('asks the server for the list', lastCall.fn === 'apiListOrders');
  ok('Milestone 2.5 / P4: asks page 1 at PAGE_SIZE, not the old { limit }',
     lastCall.arg && lastCall.arg.page === 1 && lastCall.arg.pageSize === 20,
     JSON.stringify(lastCall.arg));
  ok('shows "Xem thêm" when the server says hasMore',
     /data-act="load-more"/.test(list) && /Xem thêm/.test(list));
  ok('shows the running count against the server total (2 shown / 25 total)',
     /Hiển thị 2 \/ 25 đơn/.test(list), list.match(/Hiển thị[^<]*/));
  ok('shows a "Làm mới" control', /data-act="refresh-list"/.test(list));

  console.log('\nUI smoke — blank form');
  const rows = list.match(/data-open="/g) || [];
  ok('every card is clickable', rows.length === 2);

  // openForm(null) is synchronous: click the create button's handler path.
  sandbox.window.TTOrders.render(root);
  setTimeout(() => {
    const before = painted;
    // simulate the delegated click on "+ Tạo đơn hàng"
    const handler = captured.click;
    handler({ target: { closest: sel => sel.indexOf('data-act') >= 0
      ? { getAttribute: a => (a === 'data-act' ? 'new' : null) } : null } });
    const form = painted;
    ok('form markup is balanced', balanced(form) === null, balanced(form));
    ok('form is not the list', form !== before);
    ok('has the customer field with autocomplete', /id="f-customer"[^>]*list="customer-options"/.test(form));
    ok('PO is a textarea, not a split field', /<textarea id="f-po"/.test(form));
    ok('has no orderNo or customerPo field', !/f-orderNo|f-customerPo/.test(form));
    ok('has the deposit field', /id="f-customerDeposit"/.test(form));
    ok('has one line card', (form.match(/class="line-card"/g) || []).length === 1);
    ok('line has an invoice number and date', /l-invoiceNo/.test(form) && /l-invoiceDate/.test(form));
    ok('offers both VAT rates', /value="0.08"/.test(form) && />10%</.test(form));
    ok('has add-line buttons', (form.match(/data-act="add-line"/g) || []).length >= 1);
    ok('has a save button', /data-act="save"/.test(form));
    ok('numeric keyboard on money and qty',
       /inputmode="numeric"/.test(form) && /inputmode="decimal"/.test(form));
    ok('no inline onclick attributes', !/onclick=/i.test(form));
    ok('datalist carries the customer list', /<datalist id="customer-options">/.test(form));

    console.log('\n' + 'UI smoke — order detail (Milestone 2.5c / D1 cache)');
    // Back to the list, then "click" the first order card's data-open.
    sandbox.window.TTOrders.render(root);
    setTimeout(() => {
      const clickOpen = () => captured.click({ target: { closest: sel =>
        sel.indexOf('data-open') >= 0
          ? { getAttribute: a => (a === 'data-open' ? 'DH-2026-0001' : null) }
          : null } });

      clickOpen();
      ok('shows a skeleton on the first (cold) open', /skeleton/.test(painted));
      setTimeout(() => {
        const detail = painted;
        ok('detail markup is balanced', balanced(detail) === null, balanced(detail));
        ok('asked the server for this order', lastCall.fn === 'apiGetOrder' && lastCall.arg === 'DH-2026-0001');
        ok('shows the order id in the heading', /DH-2026-0001/.test(detail));
        ok('shows the line description', /Ống nhựa PVC/.test(detail));
        ok('shows a "Tai lai" control with a freshness stamp',
           /data-act="reload-order"/.test(detail) && /du lieu luc|dữ liệu lúc/.test(detail));

        // Milestone 2.5c / D1 follow-up - force-reload escape hatch.
        const clickAct = act => captured.click({ target: { closest: sel =>
          sel.indexOf('data-act') >= 0
            ? { getAttribute: a => (a === 'data-act' ? act : null) }
            : null } });

        ok('has a hidden confirm box ready for the "discard unsaved edits" prompt',
           /hidden" data-role="confirm-reload"/.test(detail));
        clickAct('reload-order');
        ok('an editable order does not reload immediately — it waits for confirmation first',
           callCounts.apiGetOrder === 1, callCounts.apiGetOrder);

        clickAct('do-reload');
        ok('confirming reload calls apiGetOrder again, bypassing the cache',
           callCounts.apiGetOrder === 2, callCounts.apiGetOrder);

        const callsAfterFirstOpen = callCounts.apiGetOrder;

        // Leave and reopen the SAME order within the cache TTL: D1 says this
        // must paint instantly with no second apiGetOrder call.
        showListForTest();
        clickOpen();
        ok('reopening a cached order paints without a skeleton',
           !/Đang mở đơn hàng/.test(painted));
        ok('reopening within the TTL does not call apiGetOrder again',
           callCounts.apiGetOrder === callsAfterFirstOpen,
           'calls: ' + callCounts.apiGetOrder);
        ok('cached reopen still shows the order data', /DH-2026-0001/.test(painted));

        console.log('\n' + pass + ' passed, ' + fail + ' failed');
        process.exit(fail ? 1 : 0);
      }, 0);
    }, 0);
  }, 0);

  // "← Danh sách" from the form: click data-act="back".
  function showListForTest() {
    captured.click({ target: { closest: sel => sel.indexOf('data-act') >= 0
      ? { getAttribute: a => (a === 'data-act' ? 'back' : null) } : null } });
  }
}, 0);

