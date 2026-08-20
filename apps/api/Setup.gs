/**
 * Setup.gs — one-time bootstrap, run manually from the API editor.
 *
 * `setupMilestone1()` creates Users / Config / Security and seeds the first admin.
 * `setupMilestone2()` creates Orders / OrderLines / Invoices / StatusHistory,
 * whose columns were settled on 2026-08-20 (Q1, Q3, Q4, Q6 in
 * docs/OPEN_QUESTIONS.md). Both are idempotent: re-running them never overwrites
 * data that already exists.
 *
 * HOW TO RUN
 *   1. Set SPREADSHEET_ID, SHARED_SECRET and ADMIN_EMAIL in Script Properties.
 *   2. Select `setupMilestone1` in the editor and press Run.
 *   3. Authorize when prompted, then read the execution log.
 *
 * Note the absence of Session.getEffectiveUser(): this project has no
 * `userinfo.email` scope on purpose (see Config.gs), so the admin address comes
 * from the ADMIN_EMAIL property instead.
 */
function setupMilestone1() {
  guardSetup_();

  var ss = getSpreadsheet_();
  var log = [];

  log.push(ensureSheetWithHeaders_(ss, SHEETS.USERS, HEADERS.Users));
  log.push(ensureSheetWithHeaders_(ss, SHEETS.CONFIG, HEADERS.Config));
  log.push(ensureSheetWithHeaders_(ss, SHEETS.SECURITY, HEADERS.Security));
  log.push(seedConfigDefaults_(ss));
  log.push(seedSecurityDefaults_(ss));
  log.push(seedFirstAdmin_());
  log.push(checkSecret_());
  log.push(blessSecretIfNeeded_());
  log.push(checkNoSessionUse_());

  var summary = log.join('\n');
  console.log(summary);
  return summary;
}

/**
 * `setupMilestone1` has no trailing underscore so it appears in the editor's Run
 * dropdown. That does not expose it: this project serves no HTML, so there is no
 * `google.script.run` surface at all, and its only external entry points are
 * doGet (plain text) and doPost (which dispatches through getActions_(), where
 * setup is deliberately absent).
 *
 * Safety for setupMilestone1/2 comes from idempotency: every step below
 * refuses to overwrite data that already exists. `seedTestOrders` and
 * `deleteSeedTestOrders` (DevSeed.gs) are deliberately NOT idempotent — one
 * adds rows, the other deletes them — so for those two, safety comes from
 * this same guard instead: neither may ever be reachable over HTTP, only run
 * by hand from the editor.
 */
function guardSetup_() {
  // Editor-only maintenance functions lack a trailing underscore so they appear
  // in the Run dropdown. None may ever become reachable over HTTP.
  var editorOnly = ['setupMilestone1', 'setupMilestone2', 'rotateSecret', 'revokeSecret',
                    'securityStatus', 'installExpiryReminder', 'checkSecretExpiry',
                    'seedTestOrders', 'deleteSeedTestOrders'];
  var registry = getActions_();
  for (var i = 0; i < editorOnly.length; i++) {
    if (registry[editorOnly[i]]) {
      throw new Error(editorOnly[i] + ' must never be added to the action registry.');
    }
  }
}

function ensureSheetWithHeaders_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return 'Sheet "' + name + '": created with ' + headers.length + ' columns.';
  }
  return 'Sheet "' + name + '": already has data, left untouched.';
}

function seedConfigDefaults_(ss) {
  var sheet = ss.getSheetByName(SHEETS.CONFIG);
  var existing = {};
  readAll_(SHEETS.CONFIG).forEach(function (r) { existing[String(r.key).trim()] = true; });

  var added = 0;
  for (var i = 0; i < CONFIG_DEFAULTS.length; i++) {
    if (!existing[CONFIG_DEFAULTS[i][0]]) {
      sheet.appendRow(CONFIG_DEFAULTS[i]);
      added++;
    }
  }
  return 'Config: added ' + added + ' default row(s).';
}

function seedSecurityDefaults_(ss) {
  var sheet = ss.getSheetByName(SHEETS.SECURITY);
  var existing = {};
  readAll_(SHEETS.SECURITY).forEach(function (r) { existing[String(r.key).trim()] = true; });

  var added = 0;
  for (var i = 0; i < SECURITY_DEFAULTS.length; i++) {
    if (!existing[SECURITY_DEFAULTS[i][0]]) {
      sheet.appendRow(SECURITY_DEFAULTS[i]);
      added++;
    }
  }
  return 'Security: added ' + added + ' default row(s).';
}

/** Register the configured secret on first setup, so nothing starts out locked. */
function blessSecretIfNeeded_() {
  var gate = securityGate_();
  if (gate.ok) {
    return 'Security gate: ' + gate.state + ', ' + gate.daysLeft + ' day(s) left.';
  }
  if (!getConfiguredSecret_()) {
    return '⚠️  Security gate: cannot register a key — SHARED_SECRET is not set.';
  }
  rotateSecret();
  var after = securityGate_();
  return 'Security gate: key registered, valid ' + after.daysLeft + ' more day(s).';
}

function seedFirstAdmin_() {
  var email = String(
    PropertiesService.getScriptProperties().getProperty(PROP.ADMIN_EMAIL) || ''
  ).trim().toLowerCase();

  if (!email) return '⚠️  Admin seed skipped: ' + MSG.NO_ADMIN_EMAIL;
  if (email.indexOf('@') < 1) return '⚠️  Admin seed skipped: ADMIN_EMAIL "' + email + '" is not an email address.';

  if (findBy_(SHEETS.USERS, 'email', email)) {
    return 'Admin seed: ' + email + ' is already in the Users sheet.';
  }

  var permissions = {};
  PERMISSION_KEYS.forEach(function (k) { permissions[k] = true; });
  permissions.visible_fields = ['*'];

  appendRecord_(SHEETS.USERS, {
    email: email,
    displayName: 'Quản trị viên',
    role: 'admin',
    active: true,
    permissions: JSON.stringify(permissions),
    createdAt: new Date(),
    createdBy: email,
    note: 'Tài khoản quản trị đầu tiên (tạo tự động).'
  });
  return 'Admin seed: added ' + email + ' with all permissions.';
}

/** The web app cannot talk to this project without a matching secret. */
function checkSecret_() {
  var secret = PropertiesService.getScriptProperties().getProperty(PROP.SHARED_SECRET);
  if (!secret) return '⚠️  SHARED_SECRET is NOT set — THIENTAN-WEB will be rejected.';
  if (secret.length < 24) return '⚠️  SHARED_SECRET is short (' + secret.length + ' chars). Use `openssl rand -base64 32`.';
  return 'SHARED_SECRET: present (' + secret.length + ' chars).';
}

/**
 * Guards the rule that keeps the escalation bug dead: this project must never
 * read a Session identity. Without the userinfo.email scope the call throws, and
 * this reports that clearly instead of leaving someone to rediscover it.
 */
function checkNoSessionUse_() {
  try {
    Session.getEffectiveUser().getEmail();
    return '⚠️  This project can read Session identity — the userinfo.email scope ' +
           'has crept back into appsscript.json. Remove it (see Config.gs).';
  } catch (err) {
    return 'Session identity: correctly unavailable in the API project.';
  }
}

/**
 * setupMilestone2 — create the order sheets.
 *
 * Run once, from the API editor, after setupMilestone1. Safe to re-run: a sheet
 * that already has data is left exactly as it is.
 *
 * Products is deliberately absent — it belongs to Milestone 5, and an empty tab
 * invites someone to start typing into a schema nobody has reviewed yet.
 */
function setupMilestone2() {
  guardSetup_();

  var ss = getSpreadsheet_();
  var log = [];

  log.push(ensureSheetWithHeaders_(ss, SHEETS.ORDERS, HEADERS.Orders));
  log.push(ensureSheetWithHeaders_(ss, SHEETS.ORDER_LINES, HEADERS.OrderLines));
  log.push(ensureSheetWithHeaders_(ss, SHEETS.INVOICES, HEADERS.Invoices));
  log.push(ensureSheetWithHeaders_(ss, SHEETS.STATUS_HISTORY, HEADERS.StatusHistory));
  log.push(seedConfigDefaults_(ss));
  log.push(seedCustomerListIfEmpty_());
  log.push(checkOrderHeaders_());

  var summary = log.join('\n');
  console.log(summary);
  return summary;
}

/**
 * Milestone 1 seeded `customerList` as an empty array, so the defaults in
 * CONFIG_DEFAULTS would never be applied — seedConfigDefaults_ only adds keys
 * that are missing. Fill it here if it is still empty.
 */
function seedCustomerListIfEmpty_() {
  var rows = readAll_(SHEETS.CONFIG);
  var row = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].key).trim() === 'customerList') { row = rows[i]; break; }
  }
  if (!row) return 'Config.customerList: key missing, nothing seeded.';

  var current = [];
  try { current = JSON.parse(row.value) || []; } catch (err) { current = []; }
  if (Array.isArray(current) && current.length) {
    return 'Config.customerList: already has ' + current.length + ' name(s), left untouched.';
  }

  updateRecord_(SHEETS.CONFIG, row._row, { value: JSON.stringify(CUSTOMER_SEED) });
  invalidateConfigCache_();
  return 'Config.customerList: seeded with ' + CUSTOMER_SEED.length + ' name(s).';
}

/**
 * A column renamed by hand in the Sheet breaks every read silently — code
 * resolves columns by header name. Report any drift rather than discovering it
 * when an order saves half its fields.
 */
function checkOrderHeaders_() {
  var problems = [];
  [[SHEETS.ORDERS, HEADERS.Orders],
   [SHEETS.ORDER_LINES, HEADERS.OrderLines],
   [SHEETS.INVOICES, HEADERS.Invoices],
   [SHEETS.STATUS_HISTORY, HEADERS.StatusHistory]].forEach(function (pair) {
    var actual = readHeaders_(getSheet_(pair[0]));
    var missing = pair[1].filter(function (h) { return actual.indexOf(h) < 0; });
    if (missing.length) problems.push(pair[0] + ' thiếu cột: ' + missing.join(', '));
  });

  return problems.length
    ? '\u26a0\ufe0f  Header check: ' + problems.join(' | ')
    : 'Header check: all order sheets match HEADERS in Config.gs.';
}
