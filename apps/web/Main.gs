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
      return merge_(base, {
        authorized: false,
        reason: 'denied',
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
