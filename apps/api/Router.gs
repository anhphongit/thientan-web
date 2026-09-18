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

  // Milestone 7 / Phase 0 (260917-1210) — record BEFORE the secret/security
  // gates so a later read can tell "reached script code but rejected by our
  // own guard" apart from "Google's edge never dispatched it here at all".
  recordRequestReceipt_(req.action, req.reqId);

  // Milestone 7 / Phase 0 extension (260917-1210) — unconditional start log
  // so a normal 200-OK success (which otherwise logs nothing) still proves
  // this execution happened at all, cheap insurance if something later
  // crashes before the completion log below.
  console.log('doPost reqId=' + req.reqId + ' action=' + req.action);

  /* ---- Guard 1: is the caller our web app? ---- */
  if (!secretMatches_(req.secret)) {
    // Do not echo anything useful — this endpoint is reachable anonymously.
    console.error('doPost: rejected, bad or missing secret. action=' + req.action +
      ' reqId=' + String(req.reqId || '').substring(0, 40));
    logSecurityEvent_('bad_secret', 'action=' + String(req.action).substring(0, 60) +
      ' reqId=' + String(req.reqId || '').substring(0, 40));
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
    console.error('doPost: unknown action ' + req.action +
      ' reqId=' + String(req.reqId || '').substring(0, 40));
    logSecurityEvent_('unknown_action', String(req.action).substring(0, 60) +
      ' reqId=' + String(req.reqId || '').substring(0, 40));
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
    // Milestone 7 / Phase 0 extension (260917-1210) — same {gate, user, read,
    // total} numbers already computed into data._ms above, logged here too
    // so apps/api's own Cloud Logs carry its internal timing breakdown
    // directly, without needing the client's JSON response at all.
    console.log('doPost reqId=' + req.reqId + ' action=' + req.action +
      ' ok gate=' + msGate + ' user=' + msUser + ' read=' + msRead +
      ' total=' + (Date.now() - t0));
    return json_({ ok: true, data: data, build: BUILD });
  } catch (err) {
    // Milestone 6 / Phase 2 — safeErrorMessage_ (Config.gs) only forwards
    // err.message verbatim when it's exactly one of the ~88 already-reviewed
    // MSG.* values; any other exception (which can embed sheet/range names,
    // formula text, or Drive file ids) is logged here in full and replaced
    // with MSG.GENERIC before it ever reaches the browser. This is also the
    // safety net for SheetsRepo.gs's getSpreadsheet_ rethrow (an unmatched
    // permission-error case) — that function never sanitizes its own
    // rethrow; it relies on landing here.
    console.error(req.action + ' failed for ' + req.actor + ': ' +
                  (err && err.stack ? err.stack : err) +
                  ' reqId=' + String(req.reqId || '').substring(0, 40));
    var safeMsg = safeErrorMessage_(err);
    // Milestone 6 / Phase 3 — safeErrorMessage_ only returns MSG.GENERIC on
    // its unexpected-error branch (Config.gs), so this is the same
    // "unexpected, not one of the ~88 reviewed MSG.* values" classification
    // it already makes internally, reused here rather than re-derived.
    // logDevEvent_ never throws (Security.gs — its own try/catch returns a
    // boolean), so this call needs no extra isolation of its own.
    // Latent edge case (harmless today, grep-verified nothing does this):
    // isKnownMessage_ treats MSG.GENERIC as a "known" value too, so a future
    // `throw new Error(MSG.GENERIC)` would be misclassified as unexpected
    // by this equality check and get logged here.
    if (safeMsg === MSG.GENERIC) {
      logDevEvent_('error', req.action, 'unexpected error', '', req.actor,
        String(req.reqId || '').substring(0, 40));
    }
    return json_({ ok: false, error: safeMsg, build: BUILD });
  }
}

/**
 * Milestone 7 / Phase 0 (260917-1210) — live burst instrumentation. Best-
 * effort append of one {t, action} receipt to a capped, TTL-expiring cache
 * entry. Answers one question definitively for a later `getRequestReceipts`
 * read: which requests actually reached doPost, and when. Must never throw
 * or alter the outcome of the request it's observing — same risk class as
 * this file's existing `_ms` timing block.
 */
function recordRequestReceipt_(action, reqId) {
  try {
    var cache = CacheService.getScriptCache();
    if (!cache) return;
    var arr;
    try { arr = JSON.parse(cache.get(CACHE.REQUEST_RECEIPTS_KEY) || '[]'); } catch (err) { arr = []; }
    if (!Array.isArray(arr)) arr = [];
    // Untrusted, pre-secret-check input (same field truncated at Router.gs's
    // other anonymous-caller log sites below) — bound it before it can grow
    // this cache entry toward CacheService's ~100KB per-key limit.
    arr.push({
      t: Date.now(),
      action: String(action || '').substring(0, 60),
      reqId: String(reqId || '').substring(0, 40)
    });
    if (arr.length > CACHE.REQUEST_RECEIPTS_MAX) {
      arr = arr.slice(arr.length - CACHE.REQUEST_RECEIPTS_MAX);
    }
    cache.put(CACHE.REQUEST_RECEIPTS_KEY, JSON.stringify(arr), CACHE.REQUEST_RECEIPTS_TTL_SECONDS);
  } catch (err) {
    console.error('recordRequestReceipt_: ' + (err && err.stack ? err.stack : err));
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
    /* Milestone 5a / A6 — no changeStatus route: the order-level quick
       change-status action was deleted outright (see Orders.gs), not
       replaced. Line status is editable only through updateOrder's normal
       edit-form path. */

    /* Milestone 3 / 3.8 — approve-status workflow. approveOrder is REUSED
       (same action name as 3.6) but rewritten server-side for the new
       wait_approval-only gate; requestApprove/rejectOrder are new. */
    requestApprove: actionRequestApprove_,
    approveOrder: actionApproveOrder_,
    rejectOrder: actionRejectOrder_,
    /* Logic revision 2026-09-03 (point 5) — send an approved/rejected/
       pending order back to Nháp. Self-approver only; see Orders.gs. */
    setDraftOrder: actionSetDraftOrder_,

    /* Milestone 4 / 4.1 — CSV export of the currently-filtered list. See
       Export.gs. */
    exportOrdersCsv: actionExportOrdersCsv_,

    /* Milestone 4 / 4.3 — XLSX export, same filters/basis, via a temp
       Google Sheet (ExportSheet.gs). */
    exportOrdersXlsx: actionExportOrdersXlsx_,

    /* Milestone 4 / 4.4 — PDF export, same temp-Sheet build as XLSX,
       different final export params (ExportSheet.gs). */
    exportOrdersPdf: actionExportOrdersPdf_,

    /* Milestone 4 / 4.5.2 — large-export job path: start a checkpointed
       XLSX/PDF build (ExportJob.gs) and poll its progress. Only used by
       the client when the filtered order LINE count crosses the
       config-driven exportLargeThreshold_ (Export.gs) — a normal-sized
       export still goes through exportOrdersXlsx/exportOrdersPdf above,
       unchanged. */
    startExportJob: actionStartExportJob_,
    exportJobStatus: actionExportJobStatus_,

    /* Milestone 4 / 4.6.1 — revenue by time period (week/month/quarter/
       year), gated on view_statistics. See Stats.gs. */
    statsRevenue: actionStatsRevenue_,

    /* Milestone 4 / 4.6.2 — revenue by customer / by status, same basis
       semantics as statsRevenue, additionally gated on the relevant
       fieldVisible_ check. See Stats.gs. */
    statsByCustomer: actionStatsByCustomer_,
    statsByStatus: actionStatsByStatus_,

    /* Milestone 5 / 5.1 — product/stock CRUD, gated entirely on
       manage_inventory (no separate view permission for this screen). See
       Products.gs. */
    listProducts: actionListProducts_,
    getProduct: actionGetProduct_,
    createProduct: actionCreateProduct_,
    updateProduct: actionUpdateProduct_,
    deleteProduct: actionDeleteProduct_,

    /* Milestone 5 / 5.5 — lookup products for the order line picker.
       Gated on create_order (not manage_inventory) so sales users can pick.
       See Products.gs. */
    lookupProducts: actionLookupProducts_,

    /* Milestone 5 / 5.2 — user management, gated entirely on manage_users
       (no separate view permission, same shape as Products.gs above). No
       deleteUser — Users are never hard-deleted, only deactivated via
       updateUser. See Admin.gs. */
    listUsers: actionListUsers_,
    getUser: actionGetUser_,
    createUser: actionCreateUser_,
    updateUser: actionUpdateUser_,
    listPermissionPresets: actionListPermissionPresets_,
    listVisibleFieldGroups: actionListVisibleFieldGroups_,

    /* Milestone 5 / 5.4 — config sheet editing (status list, UoM list,
       customer list, VAT rates, currency) without direct sheet access.
       See AdminConfig.gs. */
    listConfig: actionListConfig_,
    updateConfig: actionUpdateConfig_,

    /* Milestone 6 / Phase 1 — manual "Sao lưu ngay" backup-to-Drive button,
       gated on manage_users. See BackupJob.gs. runScheduledBackup_/
       cleanupOldBackups_/installBackupTrigger are trigger/editor-only and
       deliberately absent from this map — see BackupJob.gs's file doc
       comment. */
    backupNow: actionBackupNow_,

    /* Milestone 6 / Phase 3 (stretch) — admin system-health panel: last
       backup status + recent unexpected-error counts. See SystemHealth.gs. */
    systemHealth: actionSystemHealth_,

    /* Milestone 7 / Phase 0 (260917-1210) — live burst instrumentation read:
       returns the receipts recordRequestReceipt_ (above) has been
       recording. See SystemHealth.gs. */
    getRequestReceipts: actionGetRequestReceipts_,
    /* Admin-requested reset (2026-09-18) — clears the same cache entry, so
       a live re-test can start from an empty log. See SystemHealth.gs. */
    clearRequestReceipts: actionClearRequestReceipts_,

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
