/**
 * Router.gs — the API's only entry point.
 *
 * Contract (POST, JSON):
 *   { secret: "...", actor: "employee@gmail.com", action: "getSession", payload: {} }
 * Response:
 *   { ok: true,  data: {...}, build: "api-..." }
 *   { ok: false, error: "thông báo tiếng Việt", build: "api-..." }
 *
 * Order matters and is not negotiable:
 *   1. verify the shared secret   → proves the caller is THIENTAN-WEB
 *   2. resolve the actor          → proves who the employee is
 *   3. check the permission       → proves they may do this
 */

function doPost(e) {
  // Milestone 2.5 / P1: raw numbers before guessing where the slowness is.
  // Read-only and purely additive — nothing below decides on `t0` or `_ms`.
  var t0 = Date.now();

  var req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    console.error('doPost: unparseable body');
    logSecurityEvent_('bad_request', 'unparseable body');
    return json_({ ok: false, error: MSG.BAD_REQUEST, build: BUILD });
  }

  /* ---- Guard 1: is the caller our web app? ---- */
  if (!secretMatches_(req.secret)) {
    // Do not echo anything useful — this endpoint is reachable anonymously.
    console.error('doPost: rejected, bad or missing secret. action=' + req.action);
    logSecurityEvent_('bad_secret', 'action=' + String(req.action).substring(0, 60));
    return json_({ ok: false, error: MSG.UNAUTHORIZED_CALLER, build: BUILD });
  }

  /* ---- Guard 2: is that secret still blessed and unexpired? ---- */
  var tGate = Date.now();
  var gate = securityGate_();
  var msGate = Date.now() - tGate;

  if (!gate.ok) {
    // The secret matched, so this really is our web app; safe to resolve the
    // actor in order to tell an admin what to do rather than stonewalling them.
    var actor = null;
    try { actor = loadUser_(req.actor); } catch (err) { actor = null; }
    var isAdmin = !!(actor && hasPermission_(actor, 'manage_users'));

    logSecurityEvent_('gate_' + gate.state, 'actor=' + String(req.actor).substring(0, 80));

    if (ACTIONS_ALLOWED_WHEN_LOCKED.indexOf(req.action) >= 0) {
      return json_({
        ok: true,
        data: { locked: true, security: securityPayload_(gate, isAdmin),
                message: isAdmin ? gate.adminMessage : MSG.LOCKED_USER },
        build: BUILD
      });
    }
    return json_({
      ok: false,
      error: isAdmin ? gate.adminMessage : MSG.LOCKED_USER,
      build: BUILD
    });
  }

  /* ---- Action must exist. Checked AFTER the gate on purpose: while the system
         is locked, an unknown action should report "locked", not reveal whether
         that action exists. ---- */
  var handler = getActions_()[req.action];
  if (!handler) {
    console.error('doPost: unknown action ' + req.action);
    logSecurityEvent_('unknown_action', String(req.action).substring(0, 60));
    return json_({ ok: false, error: MSG.UNKNOWN_ACTION + req.action, build: BUILD });
  }

  /* ---- Guard 3: who is this, and may they do it? ---- */
  try {
    var tUser = Date.now();
    var user = loadUser_(req.actor);
    var msUser = Date.now() - tUser;

    var tRead = Date.now();
    var data = handler(user, req.payload || {});
    var msRead = Date.now() - tRead;

    if (data && typeof data === 'object') {
      data.security = securityPayload_(gate, hasPermission_(user, 'manage_users'));
      // {gate, user, read, total} — total includes body parsing and both guards
      // above, so it should roughly equal gate + user + read + a small remainder.
      data._ms = { gate: msGate, user: msUser, read: msRead, total: Date.now() - t0 };
    }
    return json_({ ok: true, data: data, build: BUILD });
  } catch (err) {
    console.error(req.action + ' failed for ' + req.actor + ': ' +
                  (err && err.stack ? err.stack : err));
    return json_({ ok: false, error: (err && err.message) || MSG.GENERIC, build: BUILD });
  }
}

/**
 * What the browser is told about the security state.
 *
 * Employees get the state only — enough for a "temporarily locked" message.
 * Dates and remaining days go to admins, who are the ones who can act on them.
 */
function securityPayload_(gate, isAdmin) {
  var out = { state: gate.state };
  if (!isAdmin) return out;

  var fmt = function (d) {
    return d ? Utilities.formatDate(d, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy') : '';
  };
  out.daysLeft = gate.daysLeft;
  out.rotatedAt = fmt(gate.rotatedAt);
  out.expiresAt = fmt(gate.expiresAt);
  out.adminMessage = gate.adminMessage;
  out.isAdmin = true;
  return out;
}

/**
 * The API is deployed with anonymous access so THIENTAN-WEB can POST to it
 * without the OAuth-redirect problems that break Authorization headers.
 * A GET therefore reveals nothing — only the static string below.
 *
 * If WEB ever logs: non-JSON response: THIENTAN API
 * that means UrlFetchApp followed a redirect as GET and hit this function
 * instead of doPost. Fixed in apps/web/ApiClient.gs (postJsonKeepMethod_).
 */
function doGet() {
  return ContentService.createTextOutput('THIENTAN API').setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Action registry. Built inside a function so it never depends on the order in
 * which Apps Script evaluates files.
 */
function getActions_() {
  return {
    getSession: actionGetSession_,

    /* Milestone 2 — orders. Each handler gates itself; being in this list is
       not permission to run it. See Orders.gs. */
    listOrders: actionListOrders_,
    listOrderCreators: actionListOrderCreators_,
    getOrder: actionGetOrder_,
    createOrder: actionCreateOrder_,
    updateOrder: actionUpdateOrder_,
    deleteOrder: actionDeleteOrder_,

    logDev: actionLogDev_
  };
}

function actionGetSession_(user) {
  return {
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    permissions: user.permissions,
    config: readPublicConfig_()
  };
}

/**
 * Constant-time comparison. Timing attacks over HTTPS are impractical, but this
 * is the front door and the check costs eight lines.
 */
function secretMatches_(candidate) {
  var expected = PropertiesService.getScriptProperties().getProperty(PROP.SHARED_SECRET) || '';
  if (!expected) {
    console.error('secretMatches_: SHARED_SECRET is not set on the API project.');
    return false;
  }
  var given = String(candidate || '');
  if (given.length !== expected.length) return false;

  var diff = 0;
  for (var i = 0; i < expected.length; i++) {
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/** Display vocabulary only — status labels, units. No business or user data. */
function readPublicConfig_() {
  var cache = CacheService.getScriptCache();
  var cached = cache ? cache.get(CACHE.CONFIG_KEY) : null;
  if (cached) {
    try { return JSON.parse(cached); } catch (err) { /* reload below */ }
  }

  var out = {};
  var rows = readAll_(SHEETS.CONFIG);
  for (var i = 0; i < rows.length; i++) {
    var key = String(rows[i].key || '').trim();
    if (!key) continue;
    var raw = rows[i].value;
    try {
      out[key] = (typeof raw === 'string' && (raw.charAt(0) === '[' || raw.charAt(0) === '{'))
        ? JSON.parse(raw)
        : raw;
    } catch (err) {
      out[key] = raw;
    }
  }

  if (cache) cache.put(CACHE.CONFIG_KEY, JSON.stringify(out), CACHE.TTL_SECONDS);
  return out;
}

function invalidateConfigCache_() {
  var cache = CacheService.getScriptCache();
  if (cache) cache.remove(CACHE.CONFIG_KEY);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
