/**
 * Main.gs — web app entry point and the browser-facing API surface.
 *
 * Only doGet and api* functions may omit the trailing underscore: in Apps Script
 * every global function without one is callable from the browser via
 * google.script.run. See docs/CONVENTIONS.md.
 */

function doGet() {
  return HtmlService.createTemplateFromFile('ui/Index').evaluate()
    .setTitle('THIÊN TÂN — Quản lý đơn hàng')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Partial-include helper used by ui/Index.html. */
function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** Always hand the client {ok, data} or {ok, error}; log the technical detail. */
function handle_(name, fn) {
  try {
    return { ok: true, data: fn() };
  } catch (err) {
    console.error(name + ' failed: ' + (err && err.stack ? err.stack : err));
    return { ok: false, error: (err && err.message) ? err.message : MSG.GENERIC };
  }
}

/**
 * Everything the shell needs. Denial is a normal outcome, not an exception:
 * the client still needs the email and the sign-out link to fix it.
 */
function apiGetSession() {
  return handle_('apiGetSession', function () {
    var email = resolveActiveEmail_();
    var base = {
      urls: buildAccountUrls_(),
      diag: collectDiagnostics_(),
      build: buildStamp_(null)
    };

    if (!email) {
      return merge_(base, {
        authorized: false,
        reason: 'no_identity',
        message: MSG.NO_IDENTITY,
        email: ''
      });
    }

    var data;
    try {
      data = apiCall_('getSession', {});
    } catch (err) {  // includes the security gate refusing a non-getSession action
      // 2026-09-06 — a distinct reason for the one case where the generic
      // "denied" card actively misleads: the visitor's own account never
      // completed (or holds a stale) OAuth consent for THIENTAN-WEB, so
      // apiCall_ never even reached the API — retrying or switching Google
      // account both do nothing. See ApiClient.gs's isMissingAuthScopeError_
      // and docs/IDENTITY.md §9 for the full failure mode and why the fix
      // is revoking access at myaccount.google.com/permissions, not the
      // three account-switch options this screen normally offers.
      var scopeMissing = String(err.message || '').indexOf(MSG.SCOPE_NOT_GRANTED) === 0;
      return merge_(base, {
        authorized: false,
        reason: scopeMissing ? 'scope_missing' : 'denied',
        message: err.message,
        email: email,
        build: buildStamp_(lastApiBuild_)
      });
    }

    // The security gate can lock the system even for a valid employee. getSession
    // still answers, so the UI can explain rather than look broken.
    if (data.locked) {
      return merge_(base, {
        authorized: false,
        reason: 'locked',
        message: data.message || MSG.LOCKED,
        email: email,
        security: data.security || null,
        build: buildStamp_(lastApiBuild_)
      });
    }

    return merge_(base, {
      authorized: true,
      reason: 'ok',
      email: data.email || email,
      displayName: data.displayName,
      role: data.role,
      permissions: data.permissions,
      config: data.config,
      security: data.security || null,
      build: buildStamp_(lastApiBuild_)
    });
  });
}

/* =======================================================================
   Orders (Milestone 2)

   Thin pass-throughs. Every one of them is a PUBLIC endpoint reachable from the
   browser console, which is exactly why none of them decides anything: the API
   re-runs identity, permission and ownership on the other side of apiCall_.
   Nothing here may add an `actor`, a permission flag, or a default that the API
   would otherwise refuse.
   ======================================================================= */

/** @param {{limit:number}=} payload */
function apiListOrders(payload) {
  return handle_('apiListOrders', function () {
    return apiCall_('listOrders', payload || {});
  });
}

function apiGetOrder(orderId) {
  return handle_('apiGetOrder', function () {
    return apiCall_('getOrder', { orderId: orderId });
  });
}

/** Milestone 3 / 3.3 — created-by filter dropdown data. */
function apiListOrderCreators() {
  return handle_('apiListOrderCreators', function () {
    return apiCall_('listOrderCreators', {});
  });
}

/** @param {{order:Object, lines:Object[]}} payload */
function apiCreateOrder(payload) {
  return handle_('apiCreateOrder', function () {
    return apiCall_('createOrder', payload || {});
  });
}

/** @param {{orderId:string, order:Object, lines:Object[]}} payload */
function apiUpdateOrder(payload) {
  return handle_('apiUpdateOrder', function () {
    return apiCall_('updateOrder', payload || {});
  });
}

function apiDeleteOrder(orderId) {
  return handle_('apiDeleteOrder', function () {
    return apiCall_('deleteOrder', { orderId: orderId });
  });
}

/** Milestone 3 / 3.5 — quick status change from the order list card.
 *  @param {{orderId:string, status:string, note:string}} payload */
function apiChangeStatus(payload) {
  return handle_('apiChangeStatus', function () {
    return apiCall_('changeStatus', payload || {});
  });
}

/** Milestone 3 / 3.8 — "Gửi duyệt": draft/rejected → wait_approval.
 *  @param {{orderId:string}} payload */
function apiRequestApprove(payload) {
  return handle_('apiRequestApprove', function () {
    return apiCall_('requestApprove', payload || {});
  });
}

/** @param {{orderId:string}} payload */
function apiApproveOrder(payload) {
  return handle_('apiApproveOrder', function () {
    return apiCall_('approveOrder', payload || {});
  });
}

/** Milestone 3 / 3.8 — reject with an optional note.
 *  @param {{orderId:string, note:string}} payload */
function apiRejectOrder(payload) {
  return handle_('apiRejectOrder', function () {
    return apiCall_('rejectOrder', payload || {});
  });
}

/** Logic revision 2026-09-03 — "Về Nháp": any status → draft. Requires
 *  edit_order AND approve_order server-side (see actionSetDraftOrder_).
 *  @param {{orderId:string}} payload */
function apiSetDraftOrder(payload) {
  return handle_('apiSetDraftOrder', function () {
    return apiCall_('setDraftOrder', payload || {});
  });
}

/** Milestone 4 / 4.1 — CSV export of the currently-filtered order list.
 *  Same filter payload shape as apiListOrders (month/dateFrom/dateTo,
 *  customer, status, createdBy, approveStatus, q). Returns
 *  {filename, mimeType, csv} — the client builds a Blob and triggers a
 *  browser download; nothing is written to Drive for CSV.
 *  @param {Object} payload */
function apiExportOrdersCsv(payload) {
  return handle_('apiExportOrdersCsv', function () {
    return apiCall_('exportOrdersCsv', payload || {});
  });
}

/** Milestone 4 / 4.3 — XLSX export of the currently-filtered order list.
 *  Same payload shape as apiExportOrdersCsv. Returns
 *  {filename, mimeType, base64} — the client decodes base64 into a Blob
 *  and triggers a download the same way CSV does; nothing is written to
 *  Drive on the client side, the temp Sheet on the server is already
 *  deleted by the time this returns (ExportSheet.gs).
 *  @param {Object} payload */
function apiExportOrdersXlsx(payload) {
  return handle_('apiExportOrdersXlsx', function () {
    return apiCall_('exportOrdersXlsx', payload || {});
  });
}

/** Milestone 4 / 4.4 — PDF export of the currently-filtered order list.
 *  Same payload shape and {filename, mimeType, base64} response shape as
 *  apiExportOrdersXlsx — the client's base64ToBlob_ already handles any
 *  binary format, so no new client-side decoding logic was needed, just
 *  a new format branch (see ViewsOrders.html's doExportCsv/runExportPdf).
 *  @param {Object} payload */
function apiExportOrdersPdf(payload) {
  return handle_('apiExportOrdersPdf', function () {
    return apiCall_('exportOrdersPdf', payload || {});
  });
}

/** Milestone 4 / 4.5.2 — starts a checkpointed XLSX/PDF export job for a
 *  large filtered order set. Same filter/basis payload shape as
 *  apiExportOrdersXlsx, plus `format`: 'xlsx' or 'pdf'. Returns
 *  {jobId, status} — status is 'done' if the job happened to finish
 *  inline (a job that turned out smaller than expected), or 'running' if
 *  the client should start polling apiExportJobStatus(jobId).
 *  @param {Object} payload */
function apiStartExportJob(payload) {
  return handle_('apiStartExportJob', function () {
    return apiCall_('startExportJob', payload || {});
  });
}

/** Milestone 4 / 4.5.2 — polls one export job's progress. Scoped to the
 *  calling user's own job server-side (ExportJob.gs's
 *  actionExportJobStatus_) — polling someone else's jobId or an
 *  unknown/expired one returns the same "not found" error either way.
 *  @param {string} jobId */
function apiExportJobStatus(jobId) {
  return handle_('apiExportJobStatus', function () {
    return apiCall_('exportJobStatus', { jobId: jobId });
  });
}

/** Milestone 4 / 4.6.1 — revenue by time period (week/month/quarter/year).
 *  Revised 4.7.3 (2026-09-04, "stat by order"): aggregation is per ORDER
 *  now (not per line), always bucketed by the order's own date — the old
 *  order-date/invoice-date `basis` payload field is gone.
 *  @param {Object} payload {period, includeNoInvoice, dateFrom, dateTo,
 *    month, customer, status, createdBy, approveStatus, q} — same
 *    order-date pre-filter shape apiExportOrdersCsv etc. accept;
 *    includeNoInvoice defaults to true, period defaults to month. Returns
 *    {period, includeNoInvoice, buckets, noInvoice} — see Stats.gs's
 *    actionStatsRevenue_ for the exact shape. */
function apiStatsRevenue(payload) {
  return handle_('apiStatsRevenue', function () {
    return apiCall_('statsRevenue', payload || {});
  });
}

/** Milestone 4 / 4.6.2 — revenue by customer, biggest first. Same filter/
 *  includeNoInvoice payload shape as apiStatsRevenue. Returns
 *  {includeNoInvoice, groups, noInvoice} — see Stats.gs's
 *  actionStatsByCustomer_.
 *  @param {Object} payload */
function apiStatsByCustomer(payload) {
  return handle_('apiStatsByCustomer', function () {
    return apiCall_('statsByCustomer', payload || {});
  });
}

/** Milestone 4 / 4.6.2 — revenue by status, biggest first. Same shape as
 *  apiStatsByCustomer, grouped by order status instead — see Stats.gs's
 *  actionStatsByStatus_.
 *  @param {Object} payload */
function apiStatsByStatus(payload) {
  return handle_('apiStatsByStatus', function () {
    return apiCall_('statsByStatus', payload || {});
  });
}

/** Milestone 5 / 5.1 — product/stock CRUD. Same pass-through shape as every
 *  other apiXxx here: manage_inventory is re-checked on the API side
 *  (Products.gs), nothing here decides anything. */
function apiListProducts(payload) {
  return handle_('apiListProducts', function () {
    return apiCall_('listProducts', payload || {});
  });
}

function apiGetProduct(productId) {
  return handle_('apiGetProduct', function () {
    return apiCall_('getProduct', { productId: productId });
  });
}

/** @param {{product:Object}} payload */
function apiCreateProduct(payload) {
  return handle_('apiCreateProduct', function () {
    return apiCall_('createProduct', payload || {});
  });
}

/** @param {{productId:string, product:Object}} payload */
function apiUpdateProduct(payload) {
  return handle_('apiUpdateProduct', function () {
    return apiCall_('updateProduct', payload || {});
  });
}

function apiDeleteProduct(productId) {
  return handle_('apiDeleteProduct', function () {
    return apiCall_('deleteProduct', { productId: productId });
  });
}

/** Milestone 5 / 5.2 — user management. Same thin pass-through shape as
 *  every other apiXxx here: manage_users is re-checked on the API side
 *  (Admin.gs), nothing here decides anything. */
function apiListUsers() {
  return handle_('apiListUsers', function () {
    return apiCall_('listUsers', {});
  });
}

function apiGetUser(email) {
  return handle_('apiGetUser', function () {
    return apiCall_('getUser', { email: email });
  });
}

/** @param {{user:Object, presetKey:string, active:boolean}} payload */
function apiCreateUser(payload) {
  return handle_('apiCreateUser', function () {
    return apiCall_('createUser', payload || {});
  });
}

/** @param {{email:string, user:Object, active:boolean, presetKey:string=}} payload
 *  presetKey is OPTIONAL — omit it to change displayName/active/note without
 *  touching permissions at all. See Admin.gs's actionUpdateUser_ doc comment. */
function apiUpdateUser(payload) {
  return handle_('apiUpdateUser', function () {
    return apiCall_('updateUser', payload || {});
  });
}

/** The {key,label} pairs the add/edit form's preset dropdown offers. */
function apiListPermissionPresets() {
  return handle_('apiListPermissionPresets', function () {
    return apiCall_('listPermissionPresets', {});
  });
}

/** Milestone 5 / 5.4 — config sheet editing. Gated on manage_users.
 *  @return {{config:Object[]}} */
function apiListConfig() {
  return handle_('apiListConfig', function () {
    return apiCall_('listConfig', {});
  });
}

/** @param {{key:string, value:*}} payload */
function apiUpdateConfig(payload) {
  return handle_('apiUpdateConfig', function () {
    return apiCall_('updateConfig', payload || {});
  });
}

/** DEV_MODE only — write a line to the API DevLog sheet (no-op if API DEV_MODE off). */
function apiDevLog(payload) {
  return handle_('apiDevLog', function () {
    if (!isDevMode_()) return { logged: false };
    return apiCall_('logDev', payload || {});
  });
}

/**
 * Build strings, for spotting the one real hazard of a two-project setup:
 * pushing one side and forgetting to publish a new version of the other.
 * Null outside DEV_MODE so production shows nothing.
 */
function buildStamp_(apiBuild) {
  if (!isDevMode_()) return null;
  return { web: BUILD, api: apiBuild || '(chưa gọi API)' };
}

/**
 * Account information for the UI.
 *
 * PRODUCT DECISION: this app supports the **primary Google account of the
 * browser profile** it is opened in. Fast switching between several signed-in
 * accounts is not a feature we offer.
 *
 * That is worded as our own scope, not as a Google restriction — the person
 * using the app does not care whose limitation it is, only what to do next. The
 * engineering history behind the decision (four redirect schemes, all dead ends)
 * is recorded in docs/IDENTITY.md §6d, for us, not for them.
 *
 * `logout` is provided because signing out IS a legitimate choice a person may
 * make — it is offered as one option of three, clearly labelled with its cost,
 * never as the default path.
 */
function buildAccountUrls_() {
  var exec = '';
  try {
    exec = ScriptApp.getService().getUrl() || '';
  } catch (err) {
    console.error('buildAccountUrls_: service URL unavailable: ' + err);
  }

  return {
    app: exec,
    logout: 'https://accounts.google.com/Logout',
    supportEmail: PropertiesService.getScriptProperties()
      .getProperty(PROP.SUPPORT_EMAIL) || ''
  };
}

function merge_(base, extra) {
  var out = {};
  Object.keys(base).forEach(function (k) { out[k] = base[k]; });
  Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
  return out;
}
