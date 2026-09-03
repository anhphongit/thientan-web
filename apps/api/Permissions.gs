/**
 * Permissions.gs — authorization enforcement.
 *
 * This file is the real gate. Hiding a button on the client is cosmetic.
 */

/** @return {boolean} */
function hasPermission_(user, name) {
  return !!(user && user.permissions && user.permissions[name] === true);
}

/** Throws a Vietnamese message unless the user holds `name`. */
function requirePermission_(user, name) {
  if (!hasPermission_(user, name)) {
    console.warn('Denied: ' + (user && user.email) + ' lacks ' + name);
    throw new Error(MSG.NO_PERMISSION);
  }
}

/** @return {boolean} true if the user may see other people's orders. */
function canSeeAllOrders_(user) {
  return hasPermission_(user, 'view_all_orders');
}

/**
 * Ownership check, separate from permission. Holding `edit_order` without
 * `view_all_orders` allows acting only on rows the user created.
 */
function requireOwnershipOrAll_(user, record) {
  if (canSeeAllOrders_(user)) return;
  var owner = String((record && record.createdBy) || '').trim().toLowerCase();
  if (owner !== user.email) {
    console.warn('Denied: ' + user.email + ' is not the owner (' + owner + ')');
    throw new Error(MSG.NO_PERMISSION);
  }
}

/** @return {string[]} the columns this user may see. */
function visibleFields_(user) {
  return (user && user.permissions && user.permissions.visible_fields) || DEFAULT_VISIBLE_FIELDS;
}

/**
 * Strip every field outside the user's `visible_fields`, plus internal keys.
 * Run this on the way OUT of the server — a hidden column must be absent from
 * the response, not merely hidden in the DOM.
 *
 * Milestone 3 / 3.8 — ALWAYS_VISIBLE_FIELDS (Config.gs) is layered on top of
 * the allowlist: those columns are included even when the user's configured
 * visible_fields array is explicit and simply omits them. This is NOT the
 * same thing as DEFAULT_VISIBLE_FIELDS (the fallback for an unset/empty
 * array) — it is an unconditional override, checked on every call.
 */
function filterVisibleFields_(user, record) {
  if (!record) return record;
  var allowed = visibleFields_(user);

  // ['*'] means every field. Used by the admin profile seeded in Setup.gs.
  if (allowed.length === 1 && allowed[0] === '*') {
    var all = {};
    Object.keys(record).forEach(function (k) {
      if (k.charAt(0) !== '_') all[k] = record[k];
    });
    return all;
  }

  var out = {};
  for (var i = 0; i < allowed.length; i++) {
    if (Object.prototype.hasOwnProperty.call(record, allowed[i])) {
      out[allowed[i]] = record[allowed[i]];
    }
  }
  ALWAYS_VISIBLE_FIELDS.forEach(function (f) {
    if (Object.prototype.hasOwnProperty.call(record, f)) {
      out[f] = record[f];
    }
  });
  return out;
}

/** filterVisibleFields_ over an array. */
function filterVisibleFieldsAll_(user, records) {
  return (records || []).map(function (r) { return filterVisibleFields_(user, r); });
}

/** Drop other people's records unless the user holds view_all_orders. */
function scopeToUser_(user, records) {
  if (canSeeAllOrders_(user)) return records || [];
  return (records || []).filter(function (r) {
    return String(r.createdBy || '').trim().toLowerCase() === user.email;
  });
}
