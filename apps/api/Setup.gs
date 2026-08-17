/**
 * Setup.gs — one-time bootstrap, run manually from the API editor.
 *
 * Creates the sheets whose schema is settled and seeds you as first admin.
 * Orders / OrderLines / Products / StatusHistory are NOT created: their columns
 * depend on open questions Q1, Q3, Q4, Q6 in docs/OPEN_QUESTIONS.md.
 *
 * HOW TO RUN
 *   1. Set SPREADSHEET_ID and SHARED_SECRET in Script Properties first.
 *   2. Select `setupMilestone1` in the editor and press Run.
 *   3. Authorize when prompted, then read the execution log.
 */
function setupMilestone1() {
  guardSetup_();

  var ss = getSpreadsheet_();
  var log = [];

  log.push(ensureSheetWithHeaders_(ss, SHEETS.USERS, HEADERS.Users));
  log.push(ensureSheetWithHeaders_(ss, SHEETS.CONFIG, HEADERS.Config));
  log.push(seedConfigDefaults_(ss));
  log.push(seedFirstAdmin_());
  log.push(checkSecret_());

  var summary = log.join('\n');
  console.log(summary);
  return summary;
}

/**
 * This function has no trailing underscore, so the editor can run it. It is NOT
 * reachable from a browser — this project exposes only doGet/doPost, and doPost
 * dispatches through getActions_(), which does not include setup.
 * The guard is belt-and-braces for anyone who later adds it to the registry.
 */
function guardSetup_() {
  var sheet;
  try {
    sheet = getSpreadsheet_().getSheetByName(SHEETS.USERS);
  } catch (err) {
    return; // getSpreadsheet_ will raise the real error
  }
  if (!sheet || sheet.getLastRow() < 2) return; // virgin system: first run

  var email = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  requirePermission_(loadUser_(email), 'manage_users');
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

function seedFirstAdmin_() {
  var email = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) return 'Admin seed: could not determine your email — add the row by hand.';

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
