/**
 * AdminConfig.gs — config editing for admins (Milestone 5 / 5.4).
 *
 * Gated entirely on the single `manage_users` permission — same shape as
 * Admin.gs and Products.gs. No separate "view" permission. Allows editing an
 * allowlisted subset of Config keys from ViewsAdmin.html without sheet access.
 *
 * Two cache layers (both critical):
 *   1. SheetsRepo._readMemo[SHEETS.CONFIG] — per-request sheet read cache,
 *      auto-invalidated by updateRecord_ (SheetsRepo.gs:167)
 *   2. CacheService script-cache CONFIG_KEY — 120s TTL cross-request cache
 *      (CACHE.TTL_SECONDS). MUST be manually invalidated (Router.gs:274) or
 *      an admin edits config, sees no effect for 2 minutes, and assumes the
 *      feature is broken. This is the exact bug that bit user caching
 *      (Config.gs cache note: "caching them made `active` = FALSE take up to
 *      two minutes to bite").
 *
 * Config sheet mixes display vocabulary (safe) with behaviour flags (dangerous):
 *   - Safe: statusList, uomList, customerList, vatRates, currency
 *   - Dangerous: approvalFlowEnabled (flips state machine), approveStatusList
 *     (consumed by state machine), exportLargeThreshold, exportRetentionDays
 *   - Out of scope: Security sheet (secrets, do not hand-edit)
 *
 * statusList values are referenced by existing Orders.status rows. Renaming
 * or deleting a status KEY (not label) orphans existing orders, so this phase
 * allows add/relabel only, never key deletion.
 */

/* =======================================================================
   EDITABLE_CONFIG_KEYS: allowlist + validators
   ======================================================================= */

/**
 * Allowlist of config keys this UI can edit. Allowlist wins; a denylist
 * would make every future key editable by default (dangerous).
 * { type: 'array'|'string'|'number', validate(value): validated_value or throw }
 */
var EDITABLE_CONFIG_KEYS = {
  statusList: {
    type: 'array',
    validate: function (val) {
      if (!Array.isArray(val)) throw new Error(MSG.CONFIG_STATUS_NOT_ARRAY);
      if (val.length === 0) throw new Error(MSG.CONFIG_STATUS_EMPTY);

      var seenKeys = {};
      val.forEach(function (item, i) {
        if (typeof item !== 'object' || !item.key || !item.label) {
          throw new Error(MSG.CONFIG_STATUS_INVALID_ITEM);
        }
        var key = String(item.key).trim();
        var label = String(item.label).trim();
        if (!key || !label) throw new Error(MSG.CONFIG_STATUS_EMPTY_FIELD);
        if (seenKeys[key]) throw new Error(MSG.CONFIG_STATUS_DUPLICATE_KEY);
        seenKeys[key] = true;
      });
      return val;
    }
  },

  uomList: {
    type: 'array',
    validate: function (val) {
      if (!Array.isArray(val)) throw new Error(MSG.CONFIG_UOM_NOT_ARRAY);
      if (val.length === 0) throw new Error(MSG.CONFIG_UOM_EMPTY);

      var clean = [];
      var seen = {};
      val.forEach(function (item) {
        var s = String(item || '').trim();
        if (!s) throw new Error(MSG.CONFIG_UOM_EMPTY_ITEM);
        if (seen[s]) throw new Error(MSG.CONFIG_UOM_DUPLICATE);
        clean.push(s);
        seen[s] = true;
      });
      return clean;
    }
  },

  customerList: {
    type: 'array',
    validate: function (val) {
      if (!Array.isArray(val)) throw new Error(MSG.CONFIG_CUSTOMER_NOT_ARRAY);
      // customerList MAY be empty (auto-filled from orders anyway)

      var clean = [];
      var seen = {};
      val.forEach(function (item) {
        var s = String(item || '').trim();
        if (!s) return; // skip empty strings (don't throw)
        if (seen[s]) throw new Error(MSG.CONFIG_CUSTOMER_DUPLICATE);
        clean.push(s);
        seen[s] = true;
      });
      return clean;
    }
  },

  vatRates: {
    type: 'array',
    validate: function (val) {
      if (!Array.isArray(val)) throw new Error(MSG.CONFIG_VAT_NOT_ARRAY);
      if (val.length === 0) throw new Error(MSG.CONFIG_VAT_EMPTY);

      var clean = [];
      val.forEach(function (item) {
        var n = Number(item);
        if (isNaN(n)) throw new Error(MSG.CONFIG_VAT_INVALID_NUMBER);
        if (n < 0 || n > 1) throw new Error(MSG.CONFIG_VAT_OUT_OF_RANGE);
        clean.push(n);
      });
      return clean;
    }
  },

  currency: {
    type: 'string',
    validate: function (val) {
      var s = String(val || '').trim();
      if (!s) throw new Error(MSG.CONFIG_CURRENCY_EMPTY);
      if (s.length > 10) throw new Error(MSG.CONFIG_CURRENCY_TOO_LONG);
      return s;
    }
  }
};

/* =======================================================================
   Actions
   ======================================================================= */

/**
 * List the current config, filtered to only editable keys with their
 * current values and descriptions from the Config sheet.
 *
 * @return {{config:Object[]}}
 */
function actionListConfig_(user, payload) {
  requirePermission_(user, 'manage_users');
  var rows = readAll_(SHEETS.CONFIG);
  var config = [];

  Object.keys(EDITABLE_CONFIG_KEYS).forEach(function (key) {
    var row = findBy_(SHEETS.CONFIG, 'key', key);
    if (!row) return; // not seeded yet; skip

    var value = row.value;
    try {
      // Try to parse JSON arrays/objects, same as readPublicConfig_
      if (typeof value === 'string' && (value.charAt(0) === '[' || value.charAt(0) === '{')) {
        value = JSON.parse(value);
      }
    } catch (err) {
      // Fall back to raw string if parse fails (same as readPublicConfig_)
      value = row.value;
    }

    config.push({
      key: row.key,
      value: value,
      description: row.description || '',
      type: EDITABLE_CONFIG_KEYS[key].type
    });
  });

  return { config: config };
}

/**
 * Update a single config key. Validates shape, checks guard conditions
 * (e.g., statusList key removal), acquires lock, writes, and invalidates
 * both cache layers.
 *
 * @param {Object} payload {key, value}
 *   key: one of EDITABLE_CONFIG_KEYS
 *   value: new value (array or string, per key's schema)
 *
 * @return {{ok:boolean}}
 */
function actionUpdateConfig_(user, payload) {
  requirePermission_(user, 'manage_users');

  var key = payload && payload.key;
  var newValue = payload && payload.value;

  // Allowlist guard
  if (!EDITABLE_CONFIG_KEYS[key]) {
    throw new Error(MSG.CONFIG_KEY_NOT_ALLOWED);
  }

  // Validate shape
  var validator = EDITABLE_CONFIG_KEYS[key];
  var validated = validator.validate(newValue);

  // Guard: statusList keys can only be added/relabelled, never removed
  if (key === 'statusList') {
    assertNoStatusKeyRemoval_(validated);
  }

  // Acquire lock, write, invalidate caches
  return withConfigLock_(function () {
    var row = findBy_(SHEETS.CONFIG, 'key', key);
    if (!row) throw new Error(MSG.CONFIG_KEY_NOT_FOUND);

    // Serialize arrays back to JSON
    var rawValue = (typeof validated === 'object')
      ? JSON.stringify(validated)
      : String(validated);

    updateRecord_(SHEETS.CONFIG, row._row, { value: rawValue });

    // Invalidate both cache layers
    invalidateConfigCache_();

    return { ok: true };
  });
}

/* =======================================================================
   Guards & Helpers
   ======================================================================= */

/**
 * Ensures no existing statusList keys were removed (only add/relabel allowed).
 * Keys are the `key` field in each status object; labels can change freely.
 */
function assertNoStatusKeyRemoval_(newStatusList) {
  var current = readPublicConfig_().statusList || [];
  var currentKeys = {};
  current.forEach(function (item) {
    if (item.key) currentKeys[item.key] = true;
  });

  var newKeys = {};
  newStatusList.forEach(function (item) {
    if (item.key) newKeys[item.key] = true;
  });

  // Every current key must exist in the new list (superset check)
  Object.keys(currentKeys).forEach(function (key) {
    if (!newKeys[key]) throw new Error(MSG.CONFIG_STATUS_KEY_REMOVAL_NOT_ALLOWED);
  });
}

/**
 * Locking function for config writes, same shape as withProductLock_ /
 * withUserLock_ — acquire lock, call fn(), release lock on exception or
 * completion. Do not invent a new locking style.
 */
function withConfigLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error(MSG.CONFIG_LOCK_BUSY);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
