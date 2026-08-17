/**
 * Auth.gs — resolve an actor email into a user with permissions.
 *
 * There is no Session identity here. This project runs as the OWNER for every
 * request, so Session.getActiveUser() would always say "owner" — the mistake that
 * caused the 2026-08-17 privilege-escalation bug.
 *
 * The email arrives as `actor` on the request. It is trusted ONLY because
 * Router.gs verified the shared secret first, proving the call came from
 * THIENTAN-WEB, which reads the email from its own Session (where it is real).
 */

/**
 * @param {string} email actor email supplied by the verified caller
 * @return {{email:string, displayName:string, role:string, permissions:Object}}
 */
function loadUser_(email) {
  var normalized = String(email || '').trim().toLowerCase();
  if (!normalized) throw new Error(MSG.NO_IDENTITY);

  // Script cache, keyed by email — see the warning in Config.gs CACHE.
  var cache = CacheService.getScriptCache();
  var key = CACHE.userKey(normalized);

  var cached = cache ? cache.get(key) : null;
  if (cached) {
    try { return JSON.parse(cached); } catch (err) { /* reload below */ }
  }

  var row = findBy_(SHEETS.USERS, 'email', normalized);
  if (!row) throw new Error(MSG.NO_ACCESS);
  if (!isTrue_(row.active)) throw new Error(MSG.INACTIVE);

  var user = {
    email: normalized,
    displayName: String(row.displayName || normalized).trim(),
    role: String(row.role || 'staff').trim(),
    permissions: parsePermissions_(row.permissions)
  };

  if (cache) cache.put(key, JSON.stringify(user), CACHE.TTL_SECONDS);
  return user;
}

/** Call after an Admin edits a user, so the change lands on their next request. */
function invalidateUserCache_(email) {
  var cache = CacheService.getScriptCache();
  if (cache && email) cache.remove(CACHE.userKey(String(email).trim().toLowerCase()));
}

/** Sheets give TRUE/FALSE, 'TRUE'/'true', 1/0 — normalise all of it. */
function isTrue_(value) {
  if (value === true) return true;
  if (value === 1) return true;
  if (typeof value === 'string') {
    var v = value.trim().toLowerCase();
    return v === 'true' || v === 'yes' || v === 'x' || v === '1';
  }
  return false;
}

/** Deny by default: anything unparseable yields no permissions, not an open door. */
function parsePermissions_(raw) {
  var parsed = {};
  if (raw && typeof raw === 'object') {
    parsed = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error('parsePermissions_: invalid JSON in Users.permissions: ' + err);
      parsed = {};
    }
  }

  var out = {};
  for (var i = 0; i < PERMISSION_KEYS.length; i++) {
    out[PERMISSION_KEYS[i]] = parsed[PERMISSION_KEYS[i]] === true;
  }
  out.visible_fields = Array.isArray(parsed.visible_fields) && parsed.visible_fields.length
    ? parsed.visible_fields.slice()
    : DEFAULT_VISIBLE_FIELDS.slice();
  return out;
}
