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
let lastToast = null;
let lastConfirmOpts = null;
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
  toast(msg) { lastToast = msg; },
  // Milestone 3 — T.confirm() replaced the inline confirm-box pattern.
  // Resolve true immediately: these tests exercise "confirmed", the same
  // as the old flow's ask-X + do-X two clicks collapsed into one click
  // here since the popup's own accept/cancel UI isn't real DOM in this
  // harness. lastConfirmOpts records what was PASSED to T.confirm() so a
  // test can assert on title/message/summary without a real popup.
  confirm(opts) { lastConfirmOpts = opts; return Promise.resolve(true); },
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
  if (fn === 'apiGetOrder' && arg === 'DH-RESTRICTED') return fixtureRestrictedOrder(arg);
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
  if (fn === 'apiUpdateOrder' || fn === 'apiCreateOrder') {
    return { hiddenMoney: false, order: {
        orderId: 'DH-2026-0001', customer: 'Nhựa Duy Tân', orderDate: '2026-08-20',
        po: '4600041936', poNote: '', status: 'draft', statusNote: '',
        customerDeposit: 0, supplierName: '', supplierPaid: 0,
        totalExVat: 2400000, totalIncVat: 2592000,
        canEdit: true, canDelete: true, canChangeStatus: true
      }, lines: [
        { lineId: 'L1', productCode: '', description: 'Ống nhựa PVC', unitPrice: 2400000,
          qty: 1, uom: 'Cái', vatRate: 0.08, invoiceNo: '', invoiceDate: '', note: '' }
      ] };
  }
  if (fn === 'apiDeleteOrder') return {};
  return {};
}

// Fix, 2026-08-26: simulates what filterVisibleFields_ actually does on the
// server for a role missing po/poNote/statusNote/supplierName (order) and
// productCode/uom/invoiceNo/invoiceDate/note (lines) — those keys are absent
// from the response entirely, not present-but-blank. has(o, field) in
// headerCardHtml/lineHtml must key off that absence to hide the input.
function fixtureRestrictedOrder(arg) {
  return { hiddenMoney: false, order: {
      orderId: arg, customer: 'Nhựa Duy Tân', orderDate: '2026-08-20',
      status: 'draft', customerDeposit: 0, supplierPaid: 0,
      totalExVat: 2400000, totalIncVat: 2592000,
      canEdit: true, canDelete: true, canChangeStatus: true
    }, lines: [
      { lineId: 'L1', description: 'Ống nhựa PVC', unitPrice: 2400000, qty: 1, vatRate: 0.08 }
    ] };
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
  ok('status is styled per-status, not a generic badge (UI request 2026-08-26)',
     /class="status-pill status-pill--paid"/.test(list));
  ok('draft status gets the neutral pill style', /class="status-pill status-pill--draft"/.test(list));
  ok('line count is a prominent indicator, not folded into the muted meta text',
     /class="oc-lines"[^>]*>3<\/span>/.test(list));
  ok('line count shows just the number, no unit word, on the card', (function () {
    const m = list.match(/class="oc-lines"[^>]*>([^<]*)<\/span>/);
    return !!m && m[1] === '3';
  })());
  ok('the muted meta line no longer mentions line count', !/oc-meta">[^<]*dòng/.test(list));
  ok('line count is grouped with the order id in the top row, not the customer row',
     /class="oc-top-left"><span class="oc-id">DH-2026-0001<\/span><span class="oc-lines"[^>]*>3<\/span>/.test(list));
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
  ok('every card has its two navigable buttons (id area + rest area), style E1', rows.length === 4);

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

    console.log('\n' + 'UI smoke — field-hiding for a visible_fields-restricted role (blank form)');
    // Fix, 2026-08-26: a role whose visible_fields excludes a field used to
    // still get a blank, editable input for it (only writes were protected,
    // via fieldVisible_/seesMoney server-side). openForm(null)/blankLine()
    // now consult fieldAllowed_() before including a key on the fresh
    // client-side object at all, so headerCardHtml/lineHtml's has(o, field)
    // guards make the input disappear entirely, not just start out empty.
    const fullFields = session.permissions.visible_fields;
    session.permissions.visible_fields =
      ['customer', 'orderDate', 'status', 'description', 'qty', 'unitPrice', 'vatRate'];
    sandbox.window.TTOrders.render(root);
    setTimeout(() => {
      captured.click({ target: { closest: sel => sel.indexOf('data-act') >= 0
        ? { getAttribute: a => (a === 'data-act' ? 'new' : null) } : null } });
      const restrictedForm = painted;
      ok('restricted blank form: PO input is gone, not just empty', !/f-po/.test(restrictedForm));
      ok('restricted blank form: poNote input is gone', !/f-poNote/.test(restrictedForm));
      ok('restricted blank form: statusNote input is gone', !/f-statusNote/.test(restrictedForm));
      ok('restricted blank form: supplierName input is gone', !/f-supplierName/.test(restrictedForm));
      ok('restricted blank form: line productCode input is gone', !/l-productCode/.test(restrictedForm));
      ok('restricted blank form: line uom select is gone', !/l-uom/.test(restrictedForm));
      ok('restricted blank form: line invoice fields are gone',
         !/l-invoiceNo/.test(restrictedForm) && !/l-invoiceDate/.test(restrictedForm));
      ok('restricted blank form: line note input is gone', !/l-note/.test(restrictedForm));
      ok('restricted blank form: still balanced markup', balanced(restrictedForm) === null, balanced(restrictedForm));
      ok('restricted blank form: still has the required customer field', /id="f-customer"/.test(restrictedForm));
      ok('restricted blank form: still has description and qty', /l-description/.test(restrictedForm) && /l-qty/.test(restrictedForm));
      session.permissions.visible_fields = fullFields;

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

        // Bug fix, Milestone 2.5c follow-up: applyOrderData() used to assign
        // data.order straight into state.order, so state.order and the
        // object cached in orderCache were the SAME reference. Editing the
        // form (collect() runs on every add-line/del-line/save) mutated the
        // cache too. Clicking "+ Thêm dòng" here calls collect(), which —
        // against this harness's DOM stub, where every querySelector()
        // returns null — writes '' into every field of state.order,
        // including po. orderCache is module-private, so the only way to
        // observe whether the cache itself got corrupted is indirect:
        // leave without saving, then reopen the SAME order from cache
        // (well within the TTL) and check the textarea still shows the
        // real po. Before the shallowCopy fix this would come back blank.
        captured.click({ target: { closest: sel => sel.indexOf('data-act') >= 0
          ? { getAttribute: a => (a === 'data-act' ? 'add-line' : null) } : null } });
        ok('add-line\'s collect() did blank state.order.po in this stubbed DOM',
           /<textarea id="f-po"[^>]*><\/textarea>/.test(painted), 'sanity check on the stub itself');

        showListForTest();
        clickOpen();
        ok('the cached order survives an edit to the open form (no shared reference)',
           /<textarea id="f-po"[^>]*>4600041936<\/textarea>/.test(painted));

        // Milestone 2.5c / D1 follow-up - force-reload escape hatch.
        const clickAct = act => captured.click({ target: { closest: sel =>
          sel.indexOf('data-act') >= 0
            ? { getAttribute: a => (a === 'data-act' ? act : null) }
            : null } });

        // Milestone 3 — the inline confirm-box is gone; "reload-order" now
        // routes through the shared T.confirm() popup (stubbed above to
        // resolve true immediately, recording what it was called with).
        // That stub resolves via a real Promise microtask, same as the real
        // T.confirm() would while the user is deciding — so reloadOrder()
        // itself doesn't run synchronously off this click; a setTimeout
        // flush (below) is what actually observes its effects, same as
        // every other async action in this file.
        clickAct('reload-order');
        ok('reload-order on an editable order asks T.confirm() first, not a native dialog',
           lastConfirmOpts && /Tải lại/.test(lastConfirmOpts.title));
        ok('the confirm popup carries this order\'s summary (id), not a generic message only',
           lastConfirmOpts && lastConfirmOpts.summary && lastConfirmOpts.summary.id === 'DH-2026-0001');

        setTimeout(() => {
        // Milestone 3 note: with T.confirm() itself resolving through a
        // Promise (same as the real popup), the confirm-to-fetch window no
        // longer straddles a setTimeout(…, 0) boundary the way the old
        // synchronous ask/do two-click flow did — both settle within this
        // same flush, so "still in flight, back is blocked" isn't a
        // separately observable moment here anymore. The busy-lock itself
        // is still covered below, on the save→delete sequence.
        ok('confirming reload calls apiGetOrder again, bypassing the cache',
           callCounts.apiGetOrder === 2, callCounts.apiGetOrder);

        setTimeout(() => {
          const callsAfterFirstOpen = callCounts.apiGetOrder;

          // Leave and reopen the SAME order within the cache TTL: D1 says
          // this must paint instantly with no second apiGetOrder call.
          showListForTest();
          clickOpen();
          ok('reopening a cached order paints without a skeleton',
             !/Đang mở đơn hàng/.test(painted));
          ok('reopening within the TTL does not call apiGetOrder again',
             callCounts.apiGetOrder === callsAfterFirstOpen,
             'calls: ' + callCounts.apiGetOrder);
          ok('cached reopen still shows the order data', /DH-2026-0001/.test(painted));

          console.log('\n' + 'UI smoke — busy-locking on save/delete (issues: disable-all, block-others)');

          clickAct('save');
          const midSave = painted;
          ok('save shows its own progress label', /Đang lưu\.\.\./.test(midSave));
          ok('every header input is locked while saving',
             /id="f-customer"[^>]*disabled/.test(midSave) &&
             /id="f-po"[^>]*disabled/.test(midSave), midSave.match(/<textarea id="f-po"[^>]*>/));
          ok('the back button is disabled while saving', /data-act="back"[^>]*disabled/.test(midSave));
          ok('the delete button is disabled while saving', /data-act="ask-delete"[^>]*disabled/.test(midSave));

          clickAct('back'); // must be a no-op: one action at a time
          ok('back is blocked while a save is in flight (still on the detail form)',
             /Mã đơn DH-2026-0001/.test(painted));
          ok('the blocked back-click did not trigger any new call',
             lastCall.fn === 'apiUpdateOrder');

          setTimeout(() => {
            ok('save resolved: fields unlocked again', !/id="f-customer"[^>]*disabled/.test(painted));
            ok('save button label restored', /Lưu thay đổi/.test(painted) && !/Đang lưu/.test(painted));
            ok('a success toast fired', lastToast === 'Đã lưu thay đổi.');

            // Milestone 3 — same T.confirm() migration as reload above: one
            // click now asks (stubbed to resolve true), and doDelete() runs
            // on the next microtask, not synchronously off this click. Like
            // the reload case, T.confirm()'s own microtask hop means the
            // "mid-delete, busy-locked" window no longer straddles a
            // setTimeout(…, 0) boundary the way the old synchronous
            // ask/do two-click flow did — busy-locking itself is still
            // covered above by the save-in-flight assertions, which don't
            // go through T.confirm() at all.
            clickAct('ask-delete');
            ok('ask-delete asks T.confirm() with this order\'s summary',
               lastConfirmOpts && /Xoá/.test(lastConfirmOpts.title) &&
               lastConfirmOpts.summary && lastConfirmOpts.summary.id === 'DH-2026-0001');

            setTimeout(() => {
              ok('delete resolved and returned to the list', /Tạo đơn hàng|Đơn hàng/.test(painted) &&
                 !/Mã đơn DH-2026-0001/.test(painted));
              ok('a delete success toast fired', lastToast === 'Đã xoá đơn hàng.');

              console.log('\n' + 'UI smoke — field-hiding for a visible_fields-restricted role (order detail)');
              // Fix, 2026-08-26: mirrors the blank-form case above but for an
              // EXISTING order — the fixture here omits po/poNote/statusNote/
              // supplierName and the line's productCode/uom/invoiceNo/
              // invoiceDate/note entirely, exactly like filterVisibleFields_
              // does server-side. has(o, field) in headerCardHtml/lineHtml
              // must hide those inputs, not render them blank.
              const fullFields2 = session.permissions.visible_fields;
              session.permissions.visible_fields =
                ['customer', 'orderDate', 'status', 'description', 'qty', 'unitPrice', 'vatRate'];
              const clickOpenRestricted = () => captured.click({ target: { closest: sel =>
                sel.indexOf('data-open') >= 0
                  ? { getAttribute: a => (a === 'data-open' ? 'DH-RESTRICTED' : null) }
                  : null } });
              showListForTest();
              clickOpenRestricted();
              setTimeout(() => {
                const restrictedDetail = painted;
                ok('restricted detail: asked the server for the restricted order',
                   lastCall.fn === 'apiGetOrder' && lastCall.arg === 'DH-RESTRICTED');
                ok('restricted detail: PO input is gone', !/f-po/.test(restrictedDetail));
                ok('restricted detail: poNote input is gone', !/f-poNote/.test(restrictedDetail));
                ok('restricted detail: statusNote input is gone', !/f-statusNote/.test(restrictedDetail));
                ok('restricted detail: supplierName input is gone', !/f-supplierName/.test(restrictedDetail));
                ok('restricted detail: line productCode input is gone', !/l-productCode/.test(restrictedDetail));
                ok('restricted detail: line uom select is gone', !/l-uom/.test(restrictedDetail));
                ok('restricted detail: line invoice fields are gone',
                   !/l-invoiceNo/.test(restrictedDetail) && !/l-invoiceDate/.test(restrictedDetail));
                ok('restricted detail: line note input is gone', !/l-note/.test(restrictedDetail));
                ok('restricted detail: still balanced markup', balanced(restrictedDetail) === null, balanced(restrictedDetail));
                ok('restricted detail: still shows the visible line description', /Ống nhựa PVC/.test(restrictedDetail));
                session.permissions.visible_fields = fullFields2;

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
  }, 0);

  // "← Danh sách" from the form: click data-act="back".
  function showListForTest() {
    captured.click({ target: { closest: sel => sel.indexOf('data-act') >= 0
      ? { getAttribute: a => (a === 'data-act' ? 'back' : null) } : null } });
  }
}, 0);

