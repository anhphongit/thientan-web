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
  var req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    console.error('doPost: unparseable body');
    return json_({ ok: false, error: MSG.BAD_REQUEST, build: BUILD });
  }

  if (!secretMatches_(req.secret)) {
    // Do not echo anything useful — this endpoint is reachable anonymously.
    console.error('doPost: rejected, bad or missing secret. action=' + req.action);
    return json_({ ok: false, error: MSG.UNAUTHORIZED_CALLER, build: BUILD });
  }

  var handler = getActions_()[req.action];
  if (!handler) {
    console.error('doPost: unknown action ' + req.action);
    return json_({ ok: false, error: MSG.UNKNOWN_ACTION + req.action, build: BUILD });
  }

  try {
    var user = loadUser_(req.actor);
    return json_({ ok: true, data: handler(user, req.payload || {}), build: BUILD });
  } catch (err) {
    console.error(req.action + ' failed for ' + req.actor + ': ' +
                  (err && err.stack ? err.stack : err));
    return json_({ ok: false, error: (err && err.message) || MSG.GENERIC, build: BUILD });
  }
}

/**
 * The API is deployed with anonymous access so THIENTAN-WEB can POST to it
 * without the OAuth-redirect problems that break Authorization headers.
 * A GET therefore reveals nothing.
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
    getSession: actionGetSession_
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
