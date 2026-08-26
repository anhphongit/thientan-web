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

  var bodyJson = JSON.stringify({
    secret: secret,
    actor: email,
    action: action,
    payload: payload || {}
  });

  // Milestone 2.5 / P1: this fetch IS the cross-project hop the perf notes in
  // docs/MILESTONES.md point at. tFetch covers the whole round trip, including
  // the API's own processing — msTransport below subtracts that out below.
  // L3: at most one retry, and only for transient failures (network throw or
  // HTTP 5xx). Never retry 4xx / 405 / parse errors — those would multiply load
  // under congestion without fixing the cause.
  var tFetch = Date.now();
  var response;
  var attempt = 0;
  var lastErr = null;
  while (attempt < 2) {
    attempt++;
    try {
      response = postJsonToApi_(url, bodyJson);
      lastErr = null;
    } catch (err) {
      lastErr = err;
      console.error('apiCall_(' + action + '): fetch failed (attempt ' + attempt + '): ' + err);
      if (attempt < 2) {
        Utilities.sleep(400);
        continue;
      }
      devNote_('error', 'ApiClient', 'fetch failed: ' + action, String(err));
      throw new Error(MSG.API_UNREACHABLE + devSuffix_('fetch threw: ' + err));
    }

    var code = response.getResponseCode();
    if (code === 200) break;

    console.error('apiCall_(' + action + '): HTTP ' + code + ' (attempt ' + attempt + ') — ' +
      response.getContentText().slice(0, 300));
    // Retry only transient server errors
    if (attempt < 2 && code >= 500 && code <= 599) {
      Utilities.sleep(400);
      continue;
    }
    devNote_('error', 'ApiClient', 'HTTP ' + code + ' on ' + action,
      response.getContentText().slice(0, 1500));
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
    console.error('apiCall_(' + action + '): non-JSON response: ' + text.slice(0, 300));
    devNote_('error', 'ApiClient', 'non-JSON on ' + action, text.slice(0, 1500));
    var hint = (String(text).trim() === 'THIENTAN API')
      ? 'got doGet text (redirect followed as GET). Retried once; still failed.'
      : ('body starts with: ' + snippet_(text));
    throw new Error(MSG.API_BAD_RESPONSE + devSuffix_(hint));
  }

  lastApiBuild_ = body.build || '';

  if (!body.ok) throw new Error(body.error || MSG.GENERIC);

  if (body.data && typeof body.data === 'object') {
    var apiTotal = (body.data._ms && typeof body.data._ms.total === 'number')
      ? body.data._ms.total : 0;
    body.data._ms = body.data._ms || {};
    body.data._ms.transport = Math.max(0, msFetch - apiTotal);
  }

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
function postJsonToApi_(url, bodyJson) {
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
    console.error('postJsonToApi_: got doGet body "THIENTAN API" — retrying once after short wait');
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
 * Extra text appended to user-facing errors only when WEB DEV_MODE is on.
 * Production stays clean; dev gets the HTTP/body clue without opening Logs.
 */
function devSuffix_(detail) {
  if (!isDevMode_()) return '';
  return ' [DEV] ' + String(detail || '').substring(0, 180);
}

/**
 * Best-effort DevLog write. Only when WEB DEV_MODE is on. Never throws.
 * Uses the same POST helper as apiCall_ (no followRedirects:false).
 */
function devNote_(level, source, message, detail) {
  if (!isDevMode_()) return;
  try {
    var props = PropertiesService.getScriptProperties();
    var url = props.getProperty(PROP.API_URL);
    var secret = props.getProperty(PROP.SHARED_SECRET);
    var email = '';
    try { email = resolveActiveEmail_() || ''; } catch (e) { email = ''; }
    if (!url || !secret) return;
    postJsonToApi_(url, JSON.stringify({
      secret: secret,
      actor: email || 'unknown@dev',
      action: 'logDev',
      payload: {
        level: level || 'error',
        source: source || 'web',
        message: String(message || '').substring(0, 200),
        detail: String(detail || '').substring(0, 1500)
      }
    }));
  } catch (err) {
    console.error('devNote_ failed: ' + err);
  }
}
