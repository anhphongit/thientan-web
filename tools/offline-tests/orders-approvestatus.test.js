/**
 * Offline tests for Milestone 3 / 3.8 — the approve-status workflow.
 * Run with: node tools/offline-tests/orders-approvestatus.test.js
 */
const H = require('./harness.js');
const { user, check, eq, throws, withApprovalFlow } = H;

function line(over) {
  return Object.assign({ description: 'Ống nhựa PVC 90', qty: 2, unitPrice: 100000,
                         uom: 'Cái', vatRate: 0.08 }, over || {});
}
function order(over) {
  return Object.assign({ customer: 'Nhựa Duy Tân', orderDate: '2026-08-20',
                         status: 'confirmed', po: '460004' }, over || {});
}

/* ---------- 1. new orders default to draft, flag off or on ---------- */
console.log('\n1. every new order defaults to approveStatus draft');
{
  const env = H.makeEnv();
  const u = user('a@x.com');
  env.actionCreateOrder_(u, { order: order(), lines: [line()] });
  eq('Orders row approveStatus is draft', env.store.Orders[0].approveStatus, 'draft');

  const env2 = H.makeEnv({ approvalFlowEnabled: true });
  env2.actionCreateOrder_(u, { order: order(), lines: [line()] });
  eq('still draft with the flag on', env2.store.Orders[0].approveStatus, 'draft');
}

/* ---------- 1b. create honours confirmApprove (logic revision 2026-09-03, point 1) ---------- */
console.log('\n1b. create auto-approves for an approve_order holder who confirms');
{
  const env = H.makeEnv({ approvalFlowEnabled: true });
  const boss = user('boss@x.com', { approve_order: true });
  const plain = user('plain@x.com', { approve_order: false });

  env.actionCreateOrder_(boss, { order: order(), lines: [line()], confirmApprove: true });
  eq('approve_order + confirmApprove -> born approved', env.store.Orders[0].approveStatus, 'approved');
  const hist = env.store.StatusHistory.filter(r => r.field === 'approveStatus');
  eq('an approveStatus history row was written for the create-approve', hist.length, 1);
  eq('history records the birth transition into approved', hist[0].newStatus, 'approved');
  eq('history records an empty "from" — the order had no prior status', hist[0].oldStatus, '');

  const env2 = H.makeEnv({ approvalFlowEnabled: true });
  env2.actionCreateOrder_(boss, { order: order(), lines: [line()], confirmApprove: false });
  eq('approve_order but declined -> draft', env2.store.Orders[0].approveStatus, 'draft');
  eq('no approveStatus history row for a plain draft create',
     env2.store.StatusHistory.filter(r => r.field === 'approveStatus').length, 0);

  const env3 = H.makeEnv({ approvalFlowEnabled: true });
  env3.actionCreateOrder_(plain, { order: order(), lines: [line()], confirmApprove: true });
  eq('confirmApprove without approve_order is ignored -> draft',
     env3.store.Orders[0].approveStatus, 'draft');

  const env4 = H.makeEnv(); // flag OFF
  env4.actionCreateOrder_(boss, { order: order(), lines: [line()], confirmApprove: true });
  eq('flag off ignores confirmApprove on create -> draft',
     env4.store.Orders[0].approveStatus, 'draft');
}

/* ---------- 2. flag OFF: today's plain edit/view behavior ---------- */
console.log('\n2. flag off falls back to plain edit_order + ownership, no approve gating');
{
  const env = H.makeEnv(); // approvalFlowEnabled: false
  const editorOnly = user('staff@x.com', { approve_order: false, can_edit_approved_order: false });
  const orderId = env.actionCreateOrder_(editorOnly, { order: order(), lines: [line()] }).order.orderId;

  // Force the row into wait_approval/approved directly in the store to prove
  // the flag, not the approveStatus value, is what the gate consults.
  env.store.Orders[0].approveStatus = 'approved';
  const res = env.actionUpdateOrder_(editorOnly, {
    orderId: orderId, order: order({ po: '999999' }), lines: [line()]
  });
  eq('edit succeeds even though the row says approved, because the flag is off',
     res.order.po, '999999');
  eq('approveStatus is left untouched by a save while the flag is off',
     env.store.Orders[0].approveStatus, 'approved');
}

/* ---------- 3. edit-gating matrix, flag ON ---------- */
console.log('\n3. edit-gating matrix per approveStatus (flag on)');
{
  const env = H.makeEnv({ approvalFlowEnabled: true });
  const owner = user('owner@x.com', { approve_order: false, can_edit_approved_order: false, view_all_orders: true });
  const orderId = env.actionCreateOrder_(owner, { order: order(), lines: [line()] }).order.orderId;

  const editOnly = user('editonly@x.com', { approve_order: false, can_edit_approved_order: false, view_all_orders: true });
  const approver = user('approver@x.com', { approve_order: true, can_edit_approved_order: false, view_all_orders: true });
  const editApproved = user('editapproved@x.com', { approve_order: false, can_edit_approved_order: true, view_all_orders: true });

  // draft: edit_order alone is enough
  env.store.Orders[0].approveStatus = 'draft';
  check('draft: plain editor can edit',
    (() => { env.actionUpdateOrder_(editOnly, { orderId: orderId, order: order(), lines: [line()] }); return true; })());

  // rejected: same as draft
  env.store.Orders[0].approveStatus = 'rejected';
  check('rejected: plain editor can edit',
    (() => { env.actionUpdateOrder_(editOnly, { orderId: orderId, order: order(), lines: [line()] }); return true; })());

  // wait_approval: plain editor blocked, approver and editApproved allowed
  env.store.Orders[0].approveStatus = 'wait_approval';
  throws('wait_approval: plain editor is refused',
    () => env.actionUpdateOrder_(editOnly, { orderId: orderId, order: order(), lines: [line()] }));
  env.store.Orders[0].approveStatus = 'wait_approval';
  check('wait_approval: approve_order holder can edit',
    (() => { env.actionUpdateOrder_(approver, { orderId: orderId, order: order(), lines: [line()] }); return true; })());
  env.store.Orders[0].approveStatus = 'wait_approval';
  check('wait_approval: can_edit_approved_order holder can edit',
    (() => { env.actionUpdateOrder_(editApproved, { orderId: orderId, order: order(), lines: [line()] }); return true; })());

  // approved: same rule as wait_approval
  env.store.Orders[0].approveStatus = 'approved';
  throws('approved: plain editor is refused',
    () => env.actionUpdateOrder_(editOnly, { orderId: orderId, order: order(), lines: [line()] }));
  env.store.Orders[0].approveStatus = 'approved';
  check('approved: can_edit_approved_order holder can edit',
    (() => { env.actionUpdateOrder_(editApproved, { orderId: orderId, order: order(), lines: [line()] }); return true; })());

  // Server-side, not just UI: calling the action directly still enforces this.
  env.store.Orders[0].approveStatus = 'approved';
  throws('the gate is enforced in the handler itself, not just hidden client-side',
    () => env.actionUpdateOrder_(editOnly, { orderId: orderId, order: order(), lines: [line()] }),
    'quyền');
}

/* ---------- 4. save-time transition: draft-by-default / auto-approve ---------- */
console.log('\n4. saving sets approveStatus to draft unless confirmApprove + approve_order');
{
  const env = H.makeEnv({ approvalFlowEnabled: true });
  const approver = user('approver@x.com', { approve_order: true, view_all_orders: true });
  const orderId = env.actionCreateOrder_(approver, { order: order(), lines: [line()] }).order.orderId;
  env.store.Orders[0].approveStatus = 'wait_approval';

  // Save without confirming -> goes to draft, even though the saver holds approve_order.
  env.actionUpdateOrder_(approver, { orderId: orderId, order: order(), lines: [line()] });
  eq('unconfirmed save by an approver goes to draft', env.store.Orders[0].approveStatus, 'draft');

  // Save WITH confirmApprove -> approved, in one step.
  env.actionUpdateOrder_(approver, {
    orderId: orderId, order: order(), lines: [line()], confirmApprove: true
  });
  eq('confirmed save by an approver goes straight to approved', env.store.Orders[0].approveStatus, 'approved');

  // A can_edit_approved_order (non-approver) editor saving an approved order:
  // always drops to draft, never prompted, regardless of any confirmApprove flag.
  const editApproved = user('editapproved@x.com', { approve_order: false, can_edit_approved_order: true, view_all_orders: true });
  env.store.Orders[0].approveStatus = 'approved';
  env.actionUpdateOrder_(editApproved, {
    orderId: orderId, order: order(), lines: [line()], confirmApprove: true // ignored: no approve_order
  });
  eq('can_edit_approved_order editor always drops the order to draft on save',
     env.store.Orders[0].approveStatus, 'draft');
}

/* ---------- 5. request approval ---------- */
console.log('\n5. requestApprove: draft/rejected -> wait_approval');
{
  const env = H.makeEnv({ approvalFlowEnabled: true });
  const editor = user('editor@x.com', { approve_order: false, view_all_orders: true });
  const orderId = env.actionCreateOrder_(editor, { order: order(), lines: [line()] }).order.orderId;

  const res = env.actionRequestApprove_(editor, { orderId: orderId });
  eq('moves to wait_approval', res.approveStatus, 'wait_approval');
  eq('Orders row updated', env.store.Orders[0].approveStatus, 'wait_approval');
  eq('StatusHistory got a field=approveStatus row',
     env.store.StatusHistory[env.store.StatusHistory.length - 1].field, 'approveStatus');

  throws('cannot request approval again from wait_approval',
    () => env.actionRequestApprove_(editor, { orderId: orderId }));

  // rejected also allows a fresh request
  env.store.Orders[0].approveStatus = 'rejected';
  const res2 = env.actionRequestApprove_(editor, { orderId: orderId });
  eq('rejected -> wait_approval too', res2.approveStatus, 'wait_approval');

  const noEdit = user('noedit@x.com', { edit_order: false, view_all_orders: true });
  env.store.Orders[0].approveStatus = 'draft';
  throws('edit_order is required to request approval',
    () => env.actionRequestApprove_(noEdit, { orderId: orderId }),
    'quyền');
}

/* ---------- 6. approve / reject — PURE APPROVER (approve_order, no edit_order) ----------
   Logic revision 2026-09-03: the original wait_approval-only gate still
   governs a user who can sign off but cannot edit. Note edit_order: false
   throughout — user() defaults it to TRUE, and an edit+approve user is a
   "self-approver" with much freer rules (section 6b below). */
console.log('\n6. approveOrder / rejectOrder — pure approver still needs wait_approval');
{
  const env = H.makeEnv({ approvalFlowEnabled: true });
  const editor = user('editor@x.com', { approve_order: false, view_all_orders: true });
  const approver = user('approver@x.com', { edit_order: false, approve_order: true, view_all_orders: true });
  const editApproved = user('editapproved@x.com', { approve_order: false, can_edit_approved_order: true, view_all_orders: true });
  const orderId = env.actionCreateOrder_(editor, { order: order(), lines: [line()] }).order.orderId;

  throws('pure approver cannot approve a draft order (must be wait_approval)',
    () => env.actionApproveOrder_(approver, { orderId: orderId }));

  env.actionRequestApprove_(editor, { orderId: orderId });

  throws('can_edit_approved_order alone does not grant approve',
    () => env.actionApproveOrder_(editApproved, { orderId: orderId }),
    'quyền');

  const res = env.actionApproveOrder_(approver, { orderId: orderId });
  eq('approve moves to approved', res.approveStatus, 'approved');

  throws('pure approver cannot approve twice (not wait_approval anymore)',
    () => env.actionApproveOrder_(approver, { orderId: orderId }));

  // Reject path, with optional note. Force the row back to wait_approval
  // directly (it's currently 'approved' from the approve above).
  env.store.Orders[0].approveStatus = 'wait_approval';
  const rej = env.actionRejectOrder_(approver, { orderId: orderId, note: 'Thiếu thông tin' });
  eq('reject moves to rejected', rej.approveStatus, 'rejected');
  const historyRow = env.store.StatusHistory[env.store.StatusHistory.length - 1];
  eq('reject note recorded', historyRow.note, 'Thiếu thông tin');
  eq('reject note field is approveStatus', historyRow.field, 'approveStatus');

  // The freer self-approver rules must NOT leak to a pure approver.
  env.store.Orders[0].approveStatus = 'approved';
  throws('pure approver cannot send an approved order back to draft',
    () => env.actionSetDraftOrder_(approver, { orderId: orderId }), 'quyền');
}

/* ---------- 6b. self-approver (edit_order + approve_order) ----------
   Logic revision 2026-09-03, points 2-5. */
console.log('\n6b. self-approver moves freely between approve statuses');
{
  const env = H.makeEnv({ approvalFlowEnabled: true });
  const boss = user('boss@x.com', { approve_order: true, view_all_orders: true }); // edit_order defaults true
  const orderId = env.actionCreateOrder_(boss, { order: order(), lines: [line()] }).order.orderId;
  const statusOf = () => env.store.Orders[0].approveStatus;

  // point 3 — approve from draft, no request-approval hop first
  eq('starts as draft', statusOf(), 'draft');
  eq('approves straight from draft',
     env.actionApproveOrder_(boss, { orderId: orderId }).approveStatus, 'approved');
  throws('cannot approve an already-approved order', 
    () => env.actionApproveOrder_(boss, { orderId: orderId }), 'Đã duyệt');

  // point 5 — send it back to draft
  eq('approved -> draft', env.actionSetDraftOrder_(boss, { orderId: orderId }).approveStatus, 'draft');
  throws('cannot draft an already-draft order',
    () => env.actionSetDraftOrder_(boss, { orderId: orderId }), 'Nháp');
  eq('set-draft logged as an approveStatus history row',
     env.store.StatusHistory[env.store.StatusHistory.length - 1].field, 'approveStatus');

  // point 4 — reject straight from draft, then approve straight from rejected
  eq('rejects straight from draft',
     env.actionRejectOrder_(boss, { orderId: orderId }).approveStatus, 'rejected');
  throws('cannot reject an already-rejected order',
    () => env.actionRejectOrder_(boss, { orderId: orderId }), 'Từ chối');
  eq('approves straight from rejected',
     env.actionApproveOrder_(boss, { orderId: orderId }).approveStatus, 'approved');

  // rejected <- approved, and wait_approval is still a legal source for both
  env.store.Orders[0].approveStatus = 'wait_approval';
  eq('approves from wait_approval as before',
     env.actionApproveOrder_(boss, { orderId: orderId }).approveStatus, 'approved');
  eq('rejects straight from approved',
     env.actionRejectOrder_(boss, { orderId: orderId }).approveStatus, 'rejected');

  // point 2 — no request-approval flow for a self-approver
  env.store.Orders[0].approveStatus = 'draft';
  const detail = env.actionGetOrder_(boss, { orderId: orderId });
  eq('canRequestApprove is false for a self-approver', detail.order.canRequestApprove, false);
  eq('canApprove is true on a draft order', detail.order.canApprove, true);
  eq('canReject is true on a draft order', detail.order.canReject, true);
  eq('canSetDraft is false on a draft order', detail.order.canSetDraft, false);

  const card = env.actionListOrders_(boss, {}).orders[0];
  eq('list card agrees: canRequestApprove false', card.canRequestApprove, false);
  eq('list card agrees: canApprove true', card.canApprove, true);
  eq('list card agrees: canSetDraft false on draft', card.canSetDraft, false);

  env.store.Orders[0].approveStatus = 'approved';
  const approvedDetail = env.actionGetOrder_(boss, { orderId: orderId });
  eq('approved: canApprove false', approvedDetail.order.canApprove, false);
  eq('approved: canReject true', approvedDetail.order.canReject, true);
  eq('approved: canSetDraft true', approvedDetail.order.canSetDraft, true);
}

/* ---------- 6c. plain editor keeps the request-approval flow ---------- */
console.log('\n6c. plain editor (no approve_order) still uses Gửi duyệt');
{
  const env = H.makeEnv({ approvalFlowEnabled: true });
  const editor = user('editor@x.com', { approve_order: false, view_all_orders: true });
  const orderId = env.actionCreateOrder_(editor, { order: order(), lines: [line()] }).order.orderId;

  const detail = env.actionGetOrder_(editor, { orderId: orderId });
  eq('canRequestApprove is true on a draft order', detail.order.canRequestApprove, true);
  eq('canApprove is false without approve_order', detail.order.canApprove, false);
  eq('canSetDraft is false without approve_order', detail.order.canSetDraft, false);

  throws('setDraftOrder needs approve_order',
    () => env.actionSetDraftOrder_(editor, { orderId: orderId }), 'quyền');
}

/* ---------- 7. flag off disables the new actions ---------- */
console.log('\n7. flag off refuses requestApprove/approveOrder/rejectOrder');
{
  const env = H.makeEnv(); // flag off
  const editor = user('editor@x.com', { approve_order: true, view_all_orders: true });
  const orderId = env.actionCreateOrder_(editor, { order: order(), lines: [line()] }).order.orderId;

  throws('requestApprove refused while the flag is off',
    () => env.actionRequestApprove_(editor, { orderId: orderId }));
  throws('approveOrder refused while the flag is off',
    () => env.actionApproveOrder_(editor, { orderId: orderId }));
  throws('rejectOrder refused while the flag is off',
    () => env.actionRejectOrder_(editor, { orderId: orderId }));
  throws('setDraftOrder refused while the flag is off',
    () => env.actionSetDraftOrder_(editor, { orderId: orderId }));
}

/* ---------- 8. always-visible: approveStatus shows regardless of visible_fields ---------- */
console.log('\n8. approveStatus/updatedBy/updatedAt are always visible, even with a narrow visible_fields');
{
  const env = H.makeEnv({ approvalFlowEnabled: true });
  const admin = user('admin@x.com');
  const narrow = user('narrow@x.com', {
    view_all_orders: false,
    visible_fields: ['customer', 'orderDate', 'status'] // deliberately omits approveStatus/updatedBy/updatedAt
  });
  const orderId = env.actionCreateOrder_(narrow, { order: order(), lines: [line()] }).order.orderId;

  const list = env.actionListOrders_(narrow, {});
  check('approveStatus present on the card despite a narrow visible_fields array',
    Object.prototype.hasOwnProperty.call(list.orders[0], 'approveStatus'));
  eq('approveStatus value is draft', list.orders[0].approveStatus, 'draft');

  const detail = env.actionGetOrder_(narrow, { orderId: orderId });
  check('approveStatus present on the detail response too',
    Object.prototype.hasOwnProperty.call(detail.order, 'approveStatus'));
  check('updatedBy present on the detail response despite a narrow visible_fields array',
    Object.prototype.hasOwnProperty.call(detail.order, 'updatedBy'));
  check('updatedAt present on the detail response despite a narrow visible_fields array',
    Object.prototype.hasOwnProperty.call(detail.order, 'updatedAt'));

  // Fields genuinely excluded (po is not in narrow's visible_fields) must
  // still be absent — proving ALWAYS_VISIBLE_FIELDS didn't accidentally
  // open up everything.
  check('po is still hidden for the narrow role', !Object.prototype.hasOwnProperty.call(detail.order, 'po'));
}

/* ---------- 9. canRequestApprove / canApprove / canReject on list + detail ---------- */
console.log('\n9. canRequestApprove/canApprove/canReject flags reflect state + permission');
{
  const env = H.makeEnv({ approvalFlowEnabled: true });
  const editor = user('editor@x.com', { approve_order: false, view_all_orders: true });
  const approver = user('approver@x.com', { approve_order: true, view_all_orders: true });
  const orderId = env.actionCreateOrder_(editor, { order: order(), lines: [line()] }).order.orderId;

  var listEditor = env.actionListOrders_(editor, {});
  eq('draft order: editor can request approve', listEditor.orders[0].canRequestApprove, true);
  eq('draft order: editor cannot approve', listEditor.orders[0].canApprove, false);

  env.actionRequestApprove_(editor, { orderId: orderId });

  var listApprover = env.actionListOrders_(approver, {});
  eq('wait_approval: approver canApprove', listApprover.orders[0].canApprove, true);
  eq('wait_approval: approver canReject', listApprover.orders[0].canReject, true);
  eq('wait_approval: approver canRequestApprove is false (not draft/rejected)',
     listApprover.orders[0].canRequestApprove, false);

  var detail = env.actionGetOrder_(approver, { orderId: orderId });
  eq('detail mirrors canApprove', detail.order.canApprove, true);

  // Flag off: none of these controls should ever appear as true.
  const envOff = H.makeEnv();
  const orderId2 = envOff.actionCreateOrder_(editor, { order: order(), lines: [line()] }).order.orderId;
  var listOff = envOff.actionListOrders_(editor, {});
  eq('flag off: canRequestApprove is false', listOff.orders[0].canRequestApprove, false);
  eq('flag off: canApprove is false', listOff.orders[0].canApprove, false);
}

/* ---------- 10. approveStatus filter ---------- */
console.log('\n10. listOrders filters by approveStatus, ANDed with other filters');
{
  const env = H.makeEnv({ approvalFlowEnabled: true });
  const admin = user('admin@x.com');
  env.actionCreateOrder_(admin, { order: order({ customer: 'A' }), lines: [line()] }); // draft
  const id2 = env.actionCreateOrder_(admin, { order: order({ customer: 'A' }), lines: [line()] }).order.orderId;
  env.actionRequestApprove_(admin, { orderId: id2 }); // wait_approval
  env.actionCreateOrder_(admin, { order: order({ customer: 'B' }), lines: [line()] }); // draft

  var waiting = env.actionListOrders_(admin, { approveStatus: 'wait_approval' });
  eq('only the wait_approval order comes back', waiting.total, 1);
  eq('it is the right order', waiting.orders[0].orderId, id2);

  var draftsForA = env.actionListOrders_(admin, { approveStatus: 'draft', customer: 'A' });
  eq('approveStatus AND customer combine correctly', draftsForA.total, 1);

  // Flag off: the approveStatus param is ignored entirely (never throws, never filters).
  const envOff = H.makeEnv();
  envOff.actionCreateOrder_(admin, { order: order(), lines: [line()] });
  var allOff = envOff.actionListOrders_(admin, { approveStatus: 'wait_approval' });
  eq('flag off: approveStatus filter is ignored, all orders still show', allOff.total, 1);
}


/* ---------- 11. reject reason surfaced on the detail response (B2 banner) ---------- */
console.log('\n11. buildOrderResponse_ surfaces the latest reject reason');
{
  const env = H.makeEnv({ approvalFlowEnabled: true });
  const approver = user('approver@x.com', { edit_order: true, approve_order: true });
  const orderId = env.actionCreateOrder_(approver, { order: order(), lines: [line()] }).order.orderId;

  env.actionRequestApprove_(approver, { orderId: orderId });
  env.actionRejectOrder_(approver, { orderId: orderId, note: 'Thiếu thông tin địa chỉ' });

  const detail = env.actionGetOrder_(approver, { orderId: orderId });
  eq('rejectReason present on detail response', detail.order.rejectReason, 'Thiếu thông tin địa chỉ');
  eq('rejectedBy present on detail response', detail.order.rejectedBy, 'approver@x.com');
  eq('rejectedAt present on detail response', !!detail.order.rejectedAt, true);

  // Not rejected -> no reject fields at all (undefined, not empty string).
  const orderId2 = env.actionCreateOrder_(approver, { order: order(), lines: [line()] }).order.orderId;
  const detail2 = env.actionGetOrder_(approver, { orderId: orderId2 });
  eq('draft order has no rejectReason', detail2.order.rejectReason, undefined);

  // Reject again with a different note -> latest reason wins, not the first.
  // Self-approver may reject from any status except already-rejected, so no
  // need to force the row back to wait_approval between the two rejects.
  env.actionRequestApprove_(approver, { orderId: orderId2 });
  env.actionRejectOrder_(approver, { orderId: orderId2, note: 'first note' });
  env.actionApproveOrder_(approver, { orderId: orderId2 }); // self-approver: approved allowed from rejected
  env.actionRejectOrder_(approver, { orderId: orderId2, note: 'second note' }); // self-approver: reject allowed from approved
  const detail3 = env.actionGetOrder_(approver, { orderId: orderId2 });
  eq('latest reject reason wins over an earlier one', detail3.order.rejectReason, 'second note');
}

H.done();
