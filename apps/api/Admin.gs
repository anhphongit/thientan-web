/**
 * Admin.gs — user management (Milestone 5 / 5.2).
 *
 * Gated entirely on the single `manage_users` permission — same shape as
 * Products.gs's `manage_inventory` gate: no separate "view" permission, no
 * per-row ownership concept, and App.html's nav already gates the whole
 * "Người dùng" tab on it.
 *
 * Users are NEVER hard-deleted (DATA_MODEL.md §1: "Users are never deleted,
 * only deactivated — history stays intact"), so unlike Products.gs there is
 * no deleteUser action at all — deactivating is just an update with
 * `active: false`.
 *
 * Add/edit assigns permissions via a PERMISSION_PRESETS entry (Config.gs) —
 * a per-checkbox matrix editor is Milestone 5 / 5.3, not built yet. `role`
 * is never its own form field; it always mirrors whichever preset was
 * picked (DATA_MODEL.md §1: role is "a convenience label; permissions are
 * what actually count").
 *
 * No pagination here, unlike Products.gs's list — Phong's "mirror the order
 * list's pattern" choice was specific to the Inventory task; a small team
 * (Auth.gs's own comment: "a few hundred milliseconds, for 5–6 people")
 * doesn't need it, and a flat list is simpler to build and to read.
 *
 * Two enforcement rules from PERMISSIONS.md §4 point 6 / DATA_MODEL.md §1,
 * both re-checked here (never trust the client) on every update:
 *   1. A user cannot remove their OWN `manage_users` — regardless of how
 *      many other admins exist. Only a DIFFERENT admin can strip it.
 *   2. The last active user holding `manage_users` can be neither
 *      deactivated nor stripped of `manage_users` by anyone, including
 *      themselves — "at least one active admin must always exist" is a
 *      standing invariant, not just a self-service guard.
 */

/* =======================================================================
   Actions
   ======================================================================= */

/**
 * List every user (active and inactive — an admin needs to see and
 * reactivate a deactivated account too), sorted by displayName then email.
 *
 * @return {{users:Object[]}}
 */
function actionListUsers_(user, payload) {
  requirePermission_(user, 'manage_users');
  var rows = readAll_(SHEETS.USERS).slice().sort(compareUsersByName_);
  return { users: rows.map(function (row) { return buildUserResponse_(row, user); }) };
}

/** @param {Object} payload {email} */
function actionGetUser_(user, payload) {
  requirePermission_(user, 'manage_users');
  var row = findUserOrThrow_(payload && payload.email);
  return buildUserResponse_(row, user);
}

/**
 * @param {Object} payload {user: {email, displayName, note}, presetKey,
 *   permissions, active}. `active` defaults to true when omitted (a brand-new
 *   account is normally created ready to use). Either presetKey OR permissions
 *   may be supplied, but not both (ambiguous intent).
 */
function actionCreateUser_(user, payload) {
  requirePermission_(user, 'manage_users');
  var clean = cleanUserInput_(payload && payload.user);
  var active = (payload && payload.active === false) ? false : true;

  var presetKey = payload && payload.presetKey;
  var applyingPreset = presetKey !== undefined && presetKey !== null && presetKey !== '';
  var applyingMatrix = !!(payload && payload.permissions);

  // Ambiguous: reject if both supplied
  if (applyingPreset && applyingMatrix) {
    throw new Error(MSG.USER_AMBIGUOUS_PERMISSION_PAYLOAD);
  }

  var preset = applyingPreset ? presetOrThrow_(presetKey) : null;
  var permissions = applyingMatrix ? cleanPermissionMatrix_(payload.permissions) :
                    (applyingPreset ? preset.permissions : null);
  var role = applyingPreset ? preset.role : (applyingMatrix ? 'custom' : null);

  if (!permissions) throw new Error(MSG.USER_BAD_PRESET);

  return withUserLock_(function () {
    if (findBy_(SHEETS.USERS, 'email', clean.email)) throw new Error(MSG.USER_EMAIL_DUPLICATE);

    appendRecord_(SHEETS.USERS, {
      email: clean.email,
      displayName: clean.displayName,
      role: role,
      active: active,
      permissions: JSON.stringify(permissions),
      createdAt: new Date(),
      createdBy: user.email,
      note: clean.note
    });

    return buildUserResponse_(findBy_(SHEETS.USERS, 'email', clean.email), user);
  });
}

/**
 * @param {Object} payload {email, user: {displayName, note}, active,
 *   presetKey, permissions}. `presetKey` and `permissions` are both OPTIONAL
 *   — omit both to change displayName/active/note without touching permissions
 *   at all (e.g. just fixing a typo'd name, or reactivating someone with
 *   whatever preset they already had). When presetKey is present, the target's
 *   role AND full permissions object are replaced wholesale by that preset.
 *   When permissions is present, those custom permissions are applied instead.
 *   Supplying both is an error (ambiguous intent).
 */
function actionUpdateUser_(user, payload) {
  requirePermission_(user, 'manage_users');
  var current = findUserOrThrow_(payload && payload.email);
  var clean = cleanUserInput_(payload && payload.user, /* requireEmail */ false);
  var active = !!(payload && payload.active);

  var presetKey = payload && payload.presetKey;
  var applyingPreset = presetKey !== undefined && presetKey !== null && presetKey !== '';
  var applyingMatrix = !!(payload && payload.permissions);

  // Ambiguous: reject if both supplied
  if (applyingPreset && applyingMatrix) {
    throw new Error(MSG.USER_AMBIGUOUS_PERMISSION_PAYLOAD);
  }

  var preset = applyingPreset ? presetOrThrow_(presetKey) : null;
  var resultingPermissions = applyingPreset ? preset.permissions :
                            (applyingMatrix ? cleanPermissionMatrix_(payload.permissions) :
                             parsePermissions_(current.permissions));
  var resultingRole = applyingPreset ? preset.role :
                     (applyingMatrix ? 'custom' : current.role);

  // Validate permission guards BEFORE the lock
  requireNotSelfRemovingAdmin_(user, current, resultingPermissions);
  requireNotStrippingLastAdmin_(current.email, active, !!resultingPermissions.manage_users);

  return withUserLock_(function () {
    var patch = { displayName: clean.displayName, active: active, note: clean.note, role: resultingRole };
    if (applyingPreset || applyingMatrix) patch.permissions = JSON.stringify(resultingPermissions);
    updateRecord_(SHEETS.USERS, current._row, patch);
    return buildUserResponse_(findBy_(SHEETS.USERS, 'email', current.email), user);
  });
}

/** @return {{presets:{key:string, label:string}[]}} */
function actionListPermissionPresets_(user, payload) {
  requirePermission_(user, 'manage_users');
  return {
    presets: Object.keys(PERMISSION_PRESETS).map(function (key) {
      return { key: key, label: PERMISSION_PRESETS[key].label };
    })
  };
}

/* =======================================================================
   Helpers
   ======================================================================= */

function findUserOrThrow_(email) {
  var normalized = String(email || '').trim().toLowerCase();
  if (!normalized) throw new Error(MSG.USER_NOT_FOUND);
  var row = findBy_(SHEETS.USERS, 'email', normalized);
  if (!row) throw new Error(MSG.USER_NOT_FOUND);
  return row;
}

function presetOrThrow_(presetKey) {
  var key = String(presetKey || '').trim();
  var preset = PERMISSION_PRESETS[key];
  if (!preset) throw new Error(MSG.USER_BAD_PRESET);
  // Deep clone: PERMISSION_PRESETS is a module-level constant shared by
  // every request in this execution — a caller mutating the returned
  // permissions object (JSON.stringify below does not mutate, but nothing
  // stops a future change here) must never poison the shared preset for
  // the next request.
  return {
    role: preset.role,
    permissions: JSON.parse(JSON.stringify(preset.permissions))
  };
}

/**
 * Validates and sanitizes a permission matrix from the client.
 * Implements deny-by-default: unknown keys are dropped, missing keys default
 * to false. visible_fields is validated as an array of known column names.
 *
 * @param {Object} input — client-supplied permissions object
 * @return {Object} — sanitized object with exactly PERMISSION_KEYS (all boolean)
 *   + validated visible_fields array
 * @throws on invalid visible_fields
 */
function cleanPermissionMatrix_(input) {
  var src = input || {};
  var out = {};

  // Deny-by-default: iterate ONLY over allowed keys, coerce to boolean
  for (var i = 0; i < PERMISSION_KEYS.length; i++) {
    var key = PERMISSION_KEYS[i];
    out[key] = !!src[key];
  }

  // visible_fields: accept ['*'], a subset of column names, or empty array
  // (which defaults to DEFAULT_VISIBLE_FIELDS at read time in Permissions.gs).
  var vf = src.visible_fields;
  if (!Array.isArray(vf)) {
    vf = [];
  } else {
    // Validate: each element must be a known column name or '*'
    for (var j = 0; j < vf.length; j++) {
      var field = String(vf[j] || '');
      if (field === '*') continue;
      // Check against all known column headers
      var validColumns = [].concat(
        HEADERS.Orders || [],
        HEADERS.OrderLines || [],
        HEADERS.Invoices || []
      );
      if (validColumns.indexOf(field) < 0) {
        throw new Error(MSG.USER_BAD_VISIBLE_FIELDS);
      }
    }
  }
  out.visible_fields = vf;

  return out;
}

/**
 * @param {Object} input {email, displayName, note}
 * @param {boolean} [requireEmail=true] create needs a real, unused email;
 *   update never changes the email (it's the primary key — DATA_MODEL.md
 *   §1), so it isn't even read from `input` there.
 */
function cleanUserInput_(input, requireEmail) {
  var src = input || {};
  var out = { note: text_(src.note) };

  if (requireEmail !== false) {
    var email = text_(src.email).toLowerCase();
    if (!email) throw new Error(MSG.USER_NO_EMAIL);
    if (email.indexOf('@') < 1 || email.indexOf('@') === email.length - 1) {
      throw new Error(MSG.USER_BAD_EMAIL);
    }
    out.email = email;
  }

  var displayName = text_(src.displayName);
  if (!displayName) throw new Error(MSG.USER_NO_NAME);
  out.displayName = displayName;

  return out;
}

/**
 * Rule 1 (PERMISSIONS.md §4.6): a user can never remove their OWN
 * manage_users, regardless of how many other admins exist — only a
 * DIFFERENT admin can do that for them. Checked against the CURRENT stored
 * permissions (not the resulting ones) so this only fires on an actual
 * removal, never on a no-op re-save of an already-non-admin account.
 */
function requireNotSelfRemovingAdmin_(actingUser, targetRow, resultingPermissions) {
  var isSelf = String(targetRow.email || '').trim().toLowerCase() === actingUser.email;
  if (!isSelf) return;
  var hadManageUsers = !!parsePermissions_(targetRow.permissions).manage_users;
  if (hadManageUsers && !resultingPermissions.manage_users) {
    throw new Error(MSG.USER_SELF_REMOVE_ADMIN);
  }
}

/**
 * Rule 2 (DATA_MODEL.md §1 / PERMISSIONS.md §4.6): at least one ACTIVE user
 * with manage_users must always exist, full stop — regardless of who is
 * acting or why. If the target's own resulting state (active AND
 * manage_users) already satisfies that, there's nothing to check. Otherwise
 * count every OTHER active admin; refuse only if that count is zero.
 */
function requireNotStrippingLastAdmin_(targetEmail, resultingActive, resultingManageUsers) {
  if (resultingActive && resultingManageUsers) return;

  var normalizedTarget = String(targetEmail || '').trim().toLowerCase();
  var others = readAll_(SHEETS.USERS).filter(function (row) {
    if (String(row.email || '').trim().toLowerCase() === normalizedTarget) return false;
    return bool_(row.active) && !!parsePermissions_(row.permissions).manage_users;
  });
  if (others.length === 0) throw new Error(MSG.USER_LAST_ADMIN);
}

function compareUsersByName_(a, b) {
  var an = String(a.displayName || a.email || '').toLowerCase();
  var bn = String(b.displayName || b.email || '').toLowerCase();
  if (an < bn) return -1;
  if (an > bn) return 1;
  return 0;
}

/**
 * Matches a row's parsed permissions against PERMISSION_PRESETS, for a
 * cosmetic "which profile is this" label on the list/detail screen — NOT
 * used for any authorization decision, only display. Returns null (client
 * shows "Tuỳ chỉnh") when nothing matches exactly, e.g. a row hand-edited
 * in the Sheet, or once Milestone 5 / 5.3's matrix editor lets an admin
 * fine-tune past a preset.
 */
function matchPresetKey_(permissions) {
  var keys = Object.keys(PERMISSION_PRESETS);
  for (var i = 0; i < keys.length; i++) {
    if (permissionsEqualPreset_(permissions, PERMISSION_PRESETS[keys[i]].permissions)) return keys[i];
  }
  return null;
}

function permissionsEqualPreset_(a, b) {
  for (var i = 0; i < PERMISSION_KEYS.length; i++) {
    var k = PERMISSION_KEYS[i];
    if (!!a[k] !== !!b[k]) return false;
  }
  return arraysEqualAsSets_(a.visible_fields, b.visible_fields);
}

function arraysEqualAsSets_(a, b) {
  var av = a || [], bv = b || [];
  if (av.length !== bv.length) return false;
  var sorted = function (arr) { return arr.slice().sort(); };
  var sa = sorted(av), sb = sorted(bv);
  for (var i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return false;
  }
  return true;
}

/**
 * Strips `_row`, parses `permissions` back into an object (readAll_ hands
 * back whatever raw string/boolean the Sheet stored), and adds the two
 * computed flags the client needs but must never compute itself:
 * `isSelf` (are we looking at our own account — gates the self-removal
 * guard's UI) and `isLastAdmin` (would deactivating THIS row alone violate
 * the standing "at least one active admin" invariant — gates the
 * deactivate control's UI). Both mirror the server-side checks in
 * requireNotSelfRemovingAdmin_/requireNotStrippingLastAdmin_ exactly, so
 * the button being disabled and the request being refused never disagree.
 */
function buildUserResponse_(row, actingUser) {
  var permissions = parsePermissions_(row.permissions);
  var email = String(row.email || '').trim().toLowerCase();
  var active = bool_(row.active);

  var isLastAdmin = false;
  if (active && permissions.manage_users) {
    var others = readAll_(SHEETS.USERS).filter(function (r) {
      if (String(r.email || '').trim().toLowerCase() === email) return false;
      return bool_(r.active) && !!parsePermissions_(r.permissions).manage_users;
    });
    isLastAdmin = others.length === 0;
  }

  return {
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    active: active,
    note: row.note || '',
    createdAt: row.createdAt || '',
    permissions: permissions,
    presetKey: matchPresetKey_(permissions),
    isSelf: email === actingUser.email,
    isLastAdmin: isLastAdmin
  };
}

/** Same tryLock+friendly-message shape as Products.gs's withProductLock_/
 *  Orders.gs's withOrderLock_ — see Products.gs's own doc comment on why
 *  each domain file writes its own wrapper rather than reusing
 *  SheetsRepo.gs's generic (and unused elsewhere) withLock_. */
function withUserLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error(MSG.USER_LOCK_BUSY);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
