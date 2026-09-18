/**
 * ApiClient.gs — the only file that talks to THIENTAN-API.
 *
 * The employee's email is read HERE, from Session, and attached as `actor`.
 * It is never accepted from the browser: a client that could name its own actor
 * could name the admin's.
 */

/**
 * @param {string} action  registered in the API's getActions_()
 * @param {Object} payload action arguments
 * @return {*} the API's `data` on success
 * @throws {Error} with a Vietnamese message on any failure
 */
function apiCall_(action, payload) {
  var email = resolveActiveEmail_();
  if (!email) throw new Error(MSG.NO_IDENTITY);

  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty(PROP.API_URL);
  var secret = props.getProperty(PROP.SHARED_SECRET);
  if (!url || !secret) {
    console.error('apiCall_: API_URL or SHARED_SECRET missing on the web project.');
    throw new Error(MSG.NOT_CONFIGURED);
  }

  // Milestone 7 / Phase 0 extension (260917-1210) — one id per logical call
  // (covers this call's own internal retries below), threaded through every
  // log line and payload this call already produces, so a later burst's
  // client-side error and apps/api's receipt can be matched exactly instead
  // of by nearest-timestamp guessing.
  var reqId = Utilities.getUuid();
  console.log('apiCall_(' + action + ') start reqId=' + reqId);

  var bodyJson = JSON.stringify({
    secret: secret,
    actor: email,
    action: action,
    payload: payload || {},
    reqId: reqId
  });

  // Milestone 2.5 / P1: this fetch IS the cross-project hop the perf notes in
  // docs/MILESTONES.md point at. tFetch covers the whole round trip, including
  // the API's own processing — msTransport below subtracts that out below.
  // L3: at most one retry, and only for transient failures (network throw,
  // HTTP 5xx, bare 3xx, or bare 404 — see the retry condition below for why
  // each qualifies). Never retry any OTHER 4xx / 405 / parse errors — those
  // would multiply load under congestion without fixing the cause.
  var tFetch = Date.now();
  var response;
  var attempt = 0;
  var lastErr = null;
  while (attempt < 2) {
    attempt++;
    var tAttempt = Date.now();
    try {
      response = postJsonToApi_(url, bodyJson, reqId);
      lastErr = null;
    } catch (err) {
      var msAttemptErr = Date.now() - tAttempt;
      lastErr = err;
      console.error('apiCall_(' + action + '): fetch failed (attempt ' + attempt +
        ', ' + msAttemptErr + 'ms): ' + err + ' reqId=' + reqId);

      // 2026-09-06 — a brand-new visitor whose OAuth consent for THIENTAN-WEB
      // never completed (interrupted, cancelled, or a stale/narrower grant
      // from before a scope was added) makes UrlFetchApp.fetch throw THIS
      // specific permission exception — not a network problem, and retrying
      // never helps, since the missing grant does not appear mid-request.
      // Tag it with its own message so apiGetSession() can show a dedicated
      // "cấp lại quyền" card instead of the generic connectivity message
      // and the (wrong, for this case) account-switch options — see
      // docs/IDENTITY.md §9.
      if (isMissingAuthScopeError_(err)) {
        devNote_('error', 'ApiClient', 'missing OAuth scope grant: ' + action, String(err), reqId);
        throw new Error(MSG.SCOPE_NOT_GRANTED + devSuffix_('fetch threw: ' + err));
      }

      if (attempt < 2) {
        Utilities.sleep(400);
        continue;
      }
      devNote_('error', 'ApiClient', 'fetch failed: ' + action, String(err), reqId);
      throw new Error(MSG.API_UNREACHABLE + devSuffix_('fetch threw: ' + err));
    }

    var msAttempt = Date.now() - tAttempt;
    var code = response.getResponseCode();
    if (code === 200) break;

    // Header/timing capture is logged FIRST and wrapped in its own try/catch
    // so a malformed response's getAllHeaders() can never suppress the
    // body-text log line below it — see plan 260912-1110, Phase 1.
    var headers = {};
    try { headers = response.getAllHeaders(); } catch (e) { /* best-effort only */ }
    console.error('apiCall_(' + action + '): HTTP ' + code + ' (attempt ' + attempt +
      ', ' + msAttempt + 'ms) headers=' + JSON.stringify(headers) + ' reqId=' + reqId);
    console.error('apiCall_(' + action + '): HTTP ' + code + ' (attempt ' + attempt + ') — ' +
      response.getContentText().slice(0, 300) + ' reqId=' + reqId);
    // Retry transient server errors, bare 3xx redirects not resolved by
    // followRedirects:true, AND a bare 404 — plan 260912-1110 Phase 4:
    // live-captured 2026-09-14 with `Server: ESF` in the response headers
    // and a body that's Google's own generic front-end error page, not
    // apps/api's JSON (26.7s elapsed before the 404) — apps/api's own
    // doPost/ContentService can only ever answer 200 when script code
    // actually runs (errors are caught into a 200 JSON payload), so ANY
    // non-200 from this URL — 404 included — is produced by Google's edge
    // in front of the script, not a genuine "route not found." Other 4xx
    // (401/403/429/etc.) stay unretried — no evidence yet that they behave
    // the same way. Same bounded 2-attempt cap as 5xx/3xx.
    if (attempt < 2 && ((code >= 500 && code <= 599) || (code >= 300 && code <= 399) || code === 404)) {
      Utilities.sleep(400);
      continue;
    }
    devNote_('error', 'ApiClient', 'HTTP ' + code + ' on ' + action,
      response.getContentText().slice(0, 1500) +
      ' | headers=' + JSON.stringify(headers).slice(0, 500) +
      ' | msAttempt=' + msAttempt, reqId);
    throw new Error(MSG.API_UNREACHABLE + devSuffix_(
      'HTTP ' + code + ' · ' + snippet_(response.getContentText())));
  }
  var msFetch = Date.now() - tFetch;
  var text = response.getContentText();

  var body;
  try {
    body = JSON.parse(text);
  } catch (err) {
    // "THIENTAN API" = doGet ran (POST was followed as GET on a redirect).
    // HTML = wrong access setting or wrong URL.
    console.error('apiCall_(' + action + '): non-JSON response: ' + text.slice(0, 300) + ' reqId=' + reqId);
    devNote_('error', 'ApiClient', 'non-JSON on ' + action, text.slice(0, 1500), reqId);
    var hint = (String(text).trim() === 'THIENTAN API')
      ? 'got doGet text (redirect followed as GET). Retried once; still failed.'
      : ('body starts with: ' + snippet_(text));
    throw new Error(MSG.API_BAD_RESPONSE + devSuffix_(hint));
  }

  lastApiBuild_ = body.build || '';

  // Milestone 6 / Phase 2 — this pass-through is safe by construction, not
  // routed through this project's own safeErrorMessage_: apps/api's every
  // { ok: false } response now carries either one of ITS OWN already-safe
  // MSG.* values (either an intentional validation message, or MSG.GENERIC
  // from Router.gs's doPost catch, which itself now sanitizes any unexpected
  // exception before it ever leaves apps/api — see Router.gs's doPost). This
  // web project only knows its OWN small MSG vocabulary, not apps/api's ~85
  // messages, so applying isKnownMessage_ here would incorrectly genericize
  // every legitimate API validation error (e.g. MSG.ORDER_LOCK_BUSY).
  if (!body.ok) throw new Error(body.error || MSG.GENERIC);

  if (body.data && typeof body.data === 'object') {
    var apiTotal = (body.data._ms && typeof body.data._ms.total === 'number')
      ? body.data._ms.total : 0;
    body.data._ms = body.data._ms || {};
    body.data._ms.transport = Math.max(0, msFetch - apiTotal);
  }

  console.log('apiCall_(' + action + ') success reqId=' + reqId +
    ' msFetch=' + msFetch + ' attempts=' + attempt);
  return body.data;
}

/** Build string from the most recent API response, for the dev footer. */
var lastApiBuild_ = '';

/**
 * POST JSON to the API /exec URL.
 *
 * IMPORTANT — do NOT use followRedirects:false + re-POST to Location.
 * Google's redirect target often answers 405 Method Not Allowed for POST
 * (seen live 2026-08-26: getSession broke with HTTP 405 + HTML).
 *
 * Default path: followRedirects:true (same as the original working client).
 *
 * Intermittent failure mode: redirect is followed as GET → doGet returns
 * plain text "THIENTAN API". On that body only, wait briefly and retry the
 * same POST once (cold-start / first-hit pattern).
 */
function postJsonToApi_(url, bodyJson, reqId) {
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: bodyJson,
    muteHttpExceptions: true,
    followRedirects: true
  };

  var response = UrlFetchApp.fetch(url, options);
  var text = String(response.getContentText() || '').trim();

  if (text === 'THIENTAN API') {
    console.error('postJsonToApi_: got doGet body "THIENTAN API" — retrying once after short wait' +
      ' reqId=' + reqId);
    Utilities.sleep(500);
    response = UrlFetchApp.fetch(url, options);
  }

  return response;
}

function snippet_(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .substring(0, 120);
}

/**
 * True for Google's own "you have not granted this scope yet" exception —
 * e.g. "Exception: You do not have permission to call UrlFetchApp.fetch.
 * Required permissions: https://www.googleapis.com/auth/script.external_request."
 * Matched on the stable substring Google uses across every restricted-service
 * call (UrlFetchApp, MailApp, etc.), not just this project's specific
 * wording, so a future call added here that hits the same class of error
 * is caught too. Never matches a plain network/HTTP failure.
 */
function isMissingAuthScopeError_(err) {
  var msg = String(err || '');
  return /do not have permission to call/i.test(msg);
}

/**
 * Extra text appended to user-facing errors only when WEB DEV_MODE is on.
 * Production stays clean; dev gets the HTTP/body clue without opening Logs.
 */
function devSuffix_(detail) {
  if (!isDevMode_()) return '';
  return ' [DEV] ' + String(detail || '').substring(0, 180);
}

/**
 * Best-effort DevLog write. Always attempts the write (no longer gated on
 * WEB DEV_MODE — 2026-09-14: errors need to be recorded in production too,
 * not just while a developer happens to have DEV_MODE on). Never throws.
 * Uses the same POST helper as apiCall_ (no followRedirects:false).
 */
function devNote_(level, source, message, detail, reqId) {
  try {
    var props = PropertiesService.getScriptProperties();
    var url = props.getProperty(PROP.API_URL);
    var secret = props.getProperty(PROP.SHARED_SECRET);
    var email = '';
    try { email = resolveActiveEmail_() || ''; } catch (e) { email = ''; }
    if (!url || !secret) return;
    var response = postJsonToApi_(url, JSON.stringify({
      secret: secret,
      actor: email || 'unknown@dev',
      action: 'logDev',
      payload: {
        level: level || 'error',
        source: source || 'web',
        message: String(message || '').substring(0, 200),
        detail: String(detail || '').substring(0, 1500),
        // Milestone 7 / Phase 0 extension (260917-1210) — read by
        // actionLogDev_ (Security.gs) and prefixed into the DevLog row's
        // detail cell server-side by logDevEvent_.
        reqId: reqId || ''
      }
    }), reqId);

    // 2026-09-14 — the round trip succeeding (HTTP 200) proves nothing about
    // whether a row actually landed in the DevLog sheet: logDevEvent_ (API
    // side) swallows its own write exceptions into a bare console.error.
    // Without checking body.data.logged, a "silent success" here was
    // indistinguishable from a real write — see plan 260912-1110's Phase 3
    // investigation (the DEV_MODE-gating this originally guarded against
    // is gone as of Phase 4 — logging is unconditional on both sides now —
    // but the write can still genuinely throw, e.g. a locked/moved sheet).
    var body;
    try { body = JSON.parse(response.getContentText()); } catch (e) { body = null; }
    if (!body || !body.ok || !(body.data && body.data.logged)) {
      console.error('devNote_: DevLog row NOT written for "' + message + '" — ' +
        (body ? JSON.stringify(body) : 'non-JSON response') +
        ' (logDevEvent_ likely threw — see its own console.error on the API side)');
    }
  } catch (err) {
    console.error('devNote_ failed: ' + err);
  }
}
