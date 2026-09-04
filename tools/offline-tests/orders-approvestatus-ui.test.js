/**
 * Milestone 3 / 3.8 — UI smoke test for the approve-status workflow in
 * ViewsOrders.html. Separate file from orders-ui.test.js (that file's deeply
 * nested setTimeout chain made it risky to splice new assertions into
 * without breaking its final process.exit) but the same technique: run the
 * real module against a DOM stub that only records what it's asked to draw.
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
                 delete_order: true, change_status: true, approve_order: true,
                 visible_fields: ['*'] },
  config: {
    statusList: [{ key: 'draft', label: 'Nháp' }, { key: 'paid', label: 'Đã thanh toán' }],
    uomList: ['Cái', 'Cuộn'], vatRates: [0.08, 0.1], customerList: ['Nhựa Duy Tân'],
    approvalFlowEnabled: true,
    approveStatusList: [
      { key: 'draft', label: 'Nháp' }, { key: 'wait_approval', label: 'Chờ duyệt' },
      { key: 'approved', label: 'Đã duyệt' }, { key: 'rejected', label: 'Từ chối' }
    ]
  }
};

let lastCall = null, lastConfirmOpts = null, lastConfirmNote = '';
const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const sandbox = { document: { getElementById: () => root, createElement: () => node() },
                  setTimeout, console, window: {} };

const TT_BRIDGE = {
  call: (fn, arg) => { lastCall = { fn, arg }; return Promise.resolve(fixture(fn, arg)); },
  can: p => session.permissions[p] === true,
  esc: esc,
  formatVnd: n => Math.round(Number(n) || 0).toLocaleString('vi-VN') + ' ₫',
  formatDate: v => v ? '20/08/2026' : '',
  toast() {},
  confirm(opts) {
    lastConfirmOpts = opts;
    if (opts && opts.noteField) return Promise.resolve({ ok: true, note: lastConfirmNote });
    return Promise.resolve(true);
  },
  config: () => session.config,
  session: () => session,
  // Added 2026-09-04 alongside ViewsOrders.html's own cross-tab race
  // guard (staleView_/myGeneration, mirroring App.html's real
  // viewGeneration/isCurrentView contract) — render() now calls
  // T.viewGeneration() unconditionally, so this fake bridge needs it
  // too. Fixed at 1/true: these tests never simulate leaving the
  // Đơn hàng tab mid-flight, so every callback should always be
  // treated as still current — same effect as the real bridge when
  // nothing else has navigated away.
  viewGeneration: () => 1,
  isCurrentView: () => true
};

sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'ViewsOrders.html' });
sandbox.window.TT = TT_BRIDGE;

function fixture(fn, arg) {
  if (fn === 'apiListOrders') {
    return { total: 1, shown: 1, page: 1, pageSize: 20, hasMore: false, orders: [
      { orderId: 'DH-2026-0001', customer: 'Nhựa Duy Tân', orderDate: '2026-08-20',
        po: '4600041936', status: 'draft', approveStatus: 'wait_approval', lineCount: 1,
        totalExVat: 100, totalIncVat: 108, canEdit: false, canDelete: false,
        canChangeStatus: true, canRequestApprove: false, canApprove: true, canReject: true,
        canSetDraft: true }
    ] };
  }
  if (fn === 'apiGetOrder') {
    // Revision 2026-09-03b — when the fixture is asked for the rejected
    // order id, answer with the reject fields buildOrderResponse_ now
    // attaches, so the B2 banner has something to render in the UI test.
    var rejected = arg === 'DH-2026-0003';
    return { hiddenMoney: false, order: Object.assign({
        orderId: rejected ? 'DH-2026-0003' : 'DH-2026-0001', customer: 'Nhựa Duy Tân',
        orderDate: '2026-08-20',
        po: '4600041936', poNote: '', status: 'draft', statusNote: '',
        customerDeposit: 0, supplierName: '', supplierPaid: 0,
        totalExVat: 100, totalIncVat: 108,
        approveStatus: rejected ? 'rejected' : 'wait_approval',
        updatedBy: 'boss@x.com', updatedAt: '2026-08-31T00:00:00.000Z',
        canEdit: false, canDelete: false, canChangeStatus: true,
        canRequestApprove: rejected, canApprove: false, canReject: false,
        canSetDraft: rejected
      }, rejected ? {
        rejectReason: 'Thiếu thông tin địa chỉ giao hàng',
        rejectedBy: 'lan@x.com', rejectedAt: '2026-09-03T14:02:00.000Z'
      } : { canRequestApprove: false, canApprove: true, canReject: true, canSetDraft: true }),
      lines: [
        { lineId: 'L1', productCode: '', description: 'Ống nhựa PVC', unitPrice: 100,
          qty: 1, uom: 'Cái', vatRate: 0.08, invoiceNo: '', invoiceDate: '', note: '' }
      ] };
  }
  if (fn === 'apiApproveOrder') {
    return { orderId: 'DH-2026-0001', approveStatus: 'approved' };
  }
  if (fn === 'apiSetDraftOrder') {
    return { orderId: 'DH-2026-0001', approveStatus: 'draft' };
  }
  if (fn === 'apiCreateOrder') {
    return { hiddenMoney: false, order: {
        orderId: 'DH-2026-0002', customer: 'Nhựa Duy Tân', orderDate: '2026-08-20',
        status: 'draft', approveStatus: 'approved', canEdit: true, canDelete: true,
        canChangeStatus: true, canRequestApprove: false, canApprove: false,
        canReject: true, canSetDraft: true
      }, lines: [] };
  }
  if (fn === 'apiRejectOrder') {
    return { orderId: 'DH-2026-0001', approveStatus: 'rejected' };
  }
  if (fn === 'apiRequestApprove') {
    return { orderId: 'DH-2026-0001', approveStatus: 'wait_approval' };
  }
  return {};
}

let pass = 0, fail = 0;
const ok = (name, cond, detail) => cond ? (pass++, console.log('  ok   ' + name))
  : (fail++, console.log('  FAIL ' + name + (detail ? ' → ' + detail : '')));
const tick = () => new Promise(r => setTimeout(r, 0));

const captured = {};
root.addEventListener = (type, fn) => { captured[type] = fn; };

/**
 * UI revision (2026-09-03, "Option A") — a click target now needs to answer
 * BOTH kinds of closest() lookup onClick makes: '[data-act], [data-open]'
 * (the delegated dispatch) and '[data-menu-key="<key>"]' (the "is this
 * click inside the currently-open menu's own wrapper" check that decides
 * whether to close it). makeTarget below builds one fake element that
 * answers both, given the attributes it actually carries — closer to how a
 * real DOM element behaves than the old two hand-rolled target shapes.
 */
function makeTarget(attrs) {
  var el = {
    getAttribute: a => (Object.prototype.hasOwnProperty.call(attrs, a) ? attrs[a] : null),
    closest: sel => {
      if (sel === '[data-act], [data-open]') {
        return (attrs['data-act'] !== undefined || attrs['data-open'] !== undefined) ? el : null;
      }
      var m = /^\[data-menu-key="([^"]*)"\]$/.exec(sel);
      if (m) return (attrs['data-menu-key'] === m[1]) ? el : null;
      return null;
    }
  };
  return el;
}

function click(dataAct, extra) {
  var attrs = Object.assign({ 'data-act': dataAct }, extra || {});
  captured.click({ target: makeTarget(attrs) });
}

function open(orderId) {
  captured.click({ target: makeTarget({ 'data-open': orderId }) });
}

/** Bấm vào chính icon trạng thái duyệt (mở/đóng dropdown). */
function toggleApproveMenu(menuKey) {
  captured.click({ target: makeTarget({ 'data-act': 'toggle-approve-menu', 'data-menu-key': menuKey }) });
}

/** Bấm một mục trong dropdown đã mở (ask-approve/ask-reject/...). */
function clickMenuItem(dataAct, menuKey) {
  captured.click({ target: makeTarget({ 'data-act': dataAct, 'data-menu-key': menuKey }) });
}

(async function main() {
  console.log('\nUI smoke — approve-status workflow (3.8)');
  sandbox.window.TTOrders.render(root);
  await tick();

  // UI revision (2026-09-02, "Option N") — the list card no longer draws a
  // separate approve-status-pill row; the marker is fused onto the order id
  // (oc-id-fused--<state>) and is colour + icon ONLY on the list — the
  // label text lives in a title/aria-label attribute for accessibility,
  // not as visible text, so a plain /Chờ duyệt/ match on the card would
  // pass for the wrong reason. Assert the fused marker's class instead, and
  // separately assert the label text appears ONLY via that attribute (spec
  // point: list = colour + icon only, no visible text).
  ok('list card shows the fused approve-status marker', /oc-id-fused--waiting/.test(painted));
  // This fixture's card IS actionable (canApprove/canReject true), so its
  // trigger's accessible label also says so, rather than just the bare
  // status label — either way the point holds: the label is on the
  // element's accessible name, never rendered as visible text on the card.
  ok('list card marker has an accessible label (not visible text)',
     /aria-label="Chờ duyệt, có thao tác khả dụng"/.test(painted));
  ok('list card does NOT show approve-status as its own text row',
     !/approve-status-pill/.test(painted));
  ok('list card marker is the quick-action trigger (Option A)',
     /data-act="toggle-approve-menu"[^>]*data-menu-key="DH-2026-0001"/.test(painted));
  ok('list card menu items not rendered until opened',
     !/data-act="ask-approve"/.test(painted));

  open('DH-2026-0001');
  await tick();
  await tick();

  var detail = painted;
  ok('detail title fuses the approve-status marker onto the order id',
     /oc-id-fused--waiting/.test(detail));
  ok('detail markup mentions the approve-status badge', /approve-status-banner/.test(detail));
  ok('detail shows Đã duyệt/Chờ duyệt label for the badge', /Chờ duyệt/.test(detail));
  ok('detail shows last-updated-by line', /Cập nhật lần cuối bởi boss@x\.com/.test(detail));
  // UI revision (2026-09-03, "Option A") — the approve actions are no
  // longer a standing button row; they live behind the title marker's
  // dropdown. Closed, the marker is still clickable (has a chevron) but
  // the action items themselves are not in the DOM until opened.
  ok('title marker is clickable (has an approve action available)',
     /data-act="toggle-approve-menu"[^>]*data-menu-key="detail"/.test(detail));
  ok('menu items not rendered until opened', !/data-act="ask-approve"/.test(detail));
  ok('no Lưu button — canEdit is false', !/data-act="save"/.test(detail));
  ok('read-only note still shown', /ro-note/.test(detail));

  toggleApproveMenu('detail');
  await tick();

  var detailOpen = painted;
  ok('opening the marker reveals Duyệt (read-only order still gets it)',
     /data-act="ask-approve"/.test(detailOpen));
  ok('opening the marker reveals Từ chối', /data-act="ask-reject"/.test(detailOpen));
  ok('no Gửi duyệt item (canRequestApprove false)', !/data-act="ask-request-approve"/.test(detailOpen));

  clickMenuItem('ask-approve', 'detail');
  await tick();
  await tick();

  ok('approve asked T.confirm() with a summary', lastConfirmOpts && !!lastConfirmOpts.summary);
  ok('approve called apiApproveOrder', lastCall.fn === 'apiApproveOrder');
  ok('detail repainted with approved badge', /Đã duyệt/.test(painted));
  ok('menu closed itself once the action fired', !/data-act="ask-reject"/.test(painted));

  // Logic revision 2026-09-03 (points 3-5) — this fixture's user holds BOTH
  // edit_order and approve_order, i.e. a "self-approver", so after approving
  // the order is now approved — the one status Duyệt can't target again —
  // while Từ chối and Về Nháp stay available. Re-open the menu to see them
  // (it closed itself when the approve action fired, above).
  toggleApproveMenu('detail');
  await tick();

  ok('Duyệt item gone after approving', !/data-act="ask-approve"/.test(painted));
  ok('Từ chối still offered on an approved order', /data-act="ask-reject"/.test(painted));
  ok('Về Nháp still offered on an approved order', /data-act="ask-set-draft"/.test(painted));
  ok('no Gửi duyệt for a self-approver', !/data-act="ask-request-approve"/.test(painted));

  // "Về Nháp" round trip: approved -> draft, then Duyệt comes back and
  // Về Nháp itself retires (draft is the one status it cannot re-enter).
  clickMenuItem('ask-set-draft', 'detail');
  await tick();
  await tick();

  ok('set-draft asked for confirmation', lastConfirmOpts && /Nháp/.test(lastConfirmOpts.title || ''));
  ok('set-draft called apiSetDraftOrder', lastCall.fn === 'apiSetDraftOrder');
  ok('detail repainted as Nháp', /Nháp/.test(painted));

  toggleApproveMenu('detail');
  await tick();

  ok('Về Nháp gone once the order IS draft', !/data-act="ask-set-draft"/.test(painted));
  ok('Duyệt offered again on a draft order', /data-act="ask-approve"/.test(painted));
  ok('Từ chối offered on a draft order', /data-act="ask-reject"/.test(painted));

  // Logic revision 2026-09-03 (point 1) — creating an order now asks the
  // same auto-approve question a save does, and forwards the answer as
  // payload.confirmApprove. Before this revision create skipped the prompt
  // entirely and never sent the flag, because a new order was always born
  // a draft server-side.
  lastConfirmOpts = null;
  click('new');
  await tick();
  ok('new-order form drawn', /data-act="save"/.test(painted));

  click('save');
  await tick();
  await tick();

  ok('create asked the auto-approve question',
     lastConfirmOpts && /Tạo và duyệt/.test(lastConfirmOpts.title || ''));
  ok('create prompt offers a draft-only escape hatch',
     lastConfirmOpts && /Nháp/.test(lastConfirmOpts.cancelLabel || ''));
  ok('create called apiCreateOrder', lastCall.fn === 'apiCreateOrder');
  ok('create forwarded confirmApprove', lastCall.arg && lastCall.arg.confirmApprove === true);
  ok('create sent no orderId', lastCall.arg && !lastCall.arg.orderId);

  // UI revision (2026-09-03, "Option A") — the list card's own marker is
  // a second, independent quick-action trigger (not just the detail
  // title's). Back to the list to exercise it directly, separately from
  // whatever state the detail-view exercises above left behind.
  click('back');
  await tick();

  ok('back at the list', /order-card/.test(painted));
  ok('list card menu items not rendered until opened (fresh check)',
     !/data-act="ask-approve"/.test(painted));

  toggleApproveMenu('DH-2026-0001');
  await tick();

  var listOpen = painted;
  ok('opening the LIST card marker reveals its own Duyệt item',
     /data-act="ask-approve"[^>]*data-menu-key="DH-2026-0001"/.test(listOpen));

  // Clicking anywhere outside the open menu's own wrapper closes it without
  // firing any action — the standard "click outside to dismiss" contract.
  captured.click({ target: { closest: () => null } });
  await tick();
  ok('clicking outside the open list menu closes it',
     !/data-act="ask-approve"/.test(painted));

  toggleApproveMenu('DH-2026-0001');
  await tick();
  clickMenuItem('ask-approve', 'DH-2026-0001');
  await tick();
  await tick();

  ok('list quick-action approve called apiApproveOrder', lastCall.fn === 'apiApproveOrder');
  ok('list quick-action sent the right orderId', lastCall.arg && lastCall.arg.orderId === 'DH-2026-0001');
  ok('list quick-action closed the menu once fired',
     !/data-act="ask-reject"/.test(painted));
  ok('still on the list (quick action never navigates into the order)',
     /class="order-card/.test(painted));

  // Revision 2026-09-03c — same-order locking between the approve-menu
  // trigger and the business-status quick-select (point 1 of the
  // 2026-09-03 feedback). Both fixture calls resolve via a real Promise
  // microtask (see TT_BRIDGE.call above), so a plain await tick() would
  // let the WHOLE round trip finish before we ever get to look — swap in
  // a manually-controlled (deferred) response for the call under test so
  // the "still in flight" moment can be inspected directly.
  {
    var deferredResolve;
    var originalCall = TT_BRIDGE.call;
    TT_BRIDGE.call = function (fn, arg) {
      lastCall = { fn: fn, arg: arg };
      if (fn === 'apiApproveOrder' || fn === 'apiRejectOrder' || fn === 'apiSetDraftOrder') {
        return new Promise(function (resolve) {
          deferredResolve = function () { resolve(fixture(fn, arg)); };
        });
      }
      return originalCall(fn, arg);
    };

    toggleApproveMenu('DH-2026-0001');
    await tick();
    // DH-2026-0001 is 'approved' at this point (approved just above) —
    // Từ chối/Về Nháp are the actions on offer now.
    clickMenuItem('ask-reject', 'DH-2026-0001');
    await tick(); // lets T.confirm()'s .then fire and set the busy flag; the
                  // deferred apiRejectOrder call itself never resolves here

    var midApprove = painted;
    ok('approve action in flight: this order\'s status quick-select is dropped',
       !/data-act="quick-status" data-order="DH-2026-0001"/.test(midApprove));
    ok('approve action in flight: the approve marker shows the pending spinner',
       /aria-label="Đang cập nhật trạng thái duyệt"/.test(midApprove));

    deferredResolve();
    await tick();
    await tick();
    TT_BRIDGE.call = originalCall;
  }

  {
    var deferredResolve2;
    var originalCall2 = TT_BRIDGE.call;
    TT_BRIDGE.call = function (fn, arg) {
      lastCall = { fn: fn, arg: arg };
      if (fn === 'apiChangeStatus') {
        return new Promise(function (resolve) {
          deferredResolve2 = function () { resolve(fixture(fn, arg)); };
        });
      }
      return originalCall2(fn, arg);
    };

    captured.change({ target: { matches: function (sel) { return sel === '[data-act="quick-status"]'; },
                                 getAttribute: function (a) { return a === 'data-order' ? 'DH-2026-0001' : 'paid'; },
                                 value: 'paid' } });
    await tick();

    var midStatus = painted;
    ok('status quick-change in flight: this order\'s approve marker is not a button',
       !/data-act="toggle-approve-menu" data-menu-key="DH-2026-0001"/.test(midStatus));
    ok('status quick-change in flight: the status pill shows its own pending state',
       /status-pill--pending/.test(midStatus));

    deferredResolve2();
    await tick();
    await tick();
    TT_BRIDGE.call = originalCall2;
  }

  // Revision 2026-09-03b — "B2" reject-reason banner on the detail screen.
  captured.click({ target: makeTarget({ 'data-act': 'back' }) });
  await tick();
  open('DH-2026-0003');
  await tick();
  await tick();
  await tick();

  var detailPainted = painted;
  ok('reject-reason line rendered on a rejected order\'s detail screen',
     /class="reject-reason-line"/.test(detailPainted));
  ok('reject reason text is shown',
     /Thiếu thông tin địa chỉ giao hàng/.test(detailPainted));
  ok('who rejected is shown',
     /lan@x\.com/.test(detailPainted));

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
