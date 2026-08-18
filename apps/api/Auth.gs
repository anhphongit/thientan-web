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
 * Resolve an actor email into a user with permissions.
 *
 * DELIBERATELY NOT CACHED. An earlier version cached this record for 120s, which
 * meant setting `active` = FALSE in the sheet did nothing for up to two minutes:
 * a revoked employee kept working normally (found 2026-08-17). Access control
 * must take effect when the admin says so, not when a TTL happens to lapse.
 *
 * The cost is one extra `getValues()` on the Users sheet per request — a few
 * hundred milliseconds, for 5–6 people. Correctness is worth more than that.
 * If this ever needs caching, cache the *permissions* and re-read `active`
 * fresh; never cache the fact that someone is allowed in.
 *
 * @param {string} email actor email supplied by the verified caller
 * @return {{email:string, displayName:string, role:string, permissions:Object}}
 */
function loadUser_(email) {
  var normalized = String(email || '').trim().toLowerCase();
  if (!normalized) throw new Error(MSG.NO_IDENTITY);

  var row = findBy_(SHEETS.USERS, 'email', normalized);
  if (!row) throw new Error(MSG.NO_ACCESS);
  if (!isTrue_(row.active)) throw new Error(MSG.INACTIVE);

  return {
    email: normalized,
    displayName: String(row.displayName || normalized).trim(),
    role: String(row.role || 'staff').trim(),
    permissions: parsePermissions_(row.permissions)
  };
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
