/**
 * SheetsRepo.gs — the ONLY file allowed to call SpreadsheetApp.
 *
 * No business logic, no permission logic. Everything is addressed by HEADER NAME,
 * never by column index, so reordering columns cannot silently corrupt data.
 *
 * Helper names are appendRecord_ / updateRecord_ / deleteRecord_ — deliberately
 * NOT appendRow_ / deleteRow_, which collide with native Sheet methods.
 * See docs/CONVENTIONS.md.
 *
 * ---------------------------------------------------------------------------
 * Milestone 2.5 / P6 — per-execution memoization
 *
 * Goals:
 *   1. openById happens at most once per request.
 *   2. getSheetByName happens at most once per sheet name per request.
 *   3. A full-sheet getValues (readAll_) happens at most once per sheet name
 *      per request, unless a write to that sheet has invalidated the cache.
 *
 * Safety rules (non-negotiable):
 *   - These caches are strictly request-scoped. Apps Script starts a fresh
 *     global scope for every doPost / doGet, so they never leak across users.
 *   - Every write (append / update / delete) must call invalidateReadCache_
 *     for the affected sheet. A cache that outlives a write is a correctness bug.
 *   - readAll_ returns a shallow copy of the cached array so a caller that
 *     mutates the array itself (sort in place, splice, …) cannot poison the
 *     cache for the rest of the request. Row objects are shared; callers must
 *     not mutate them.
 *
 * What this does NOT do:
 *   - Cross-request caching (that is P7 / CacheService).
 *   - Caching of individual rows or filtered views.
 */

/* =======================================================================
   Per-execution memo (request-scoped)
   ======================================================================= */

var _ssMemo = null;       // Spreadsheet
var _sheetMemo = {};      // sheetName → Sheet
var _readMemo = {};       // sheetName → array of row objects (with _row)

function invalidateReadCache_(sheetName) {
  delete _readMemo[sheetName];
}

/* =======================================================================
   Spreadsheet / Sheet access
   ======================================================================= */

function getSpreadsheet_() {
  if (_ssMemo) return _ssMemo;

  var id = PropertiesService.getScriptProperties().getProperty(PROP.SPREADSHEET_ID);
  if (!id) throw new Error(MSG.NOT_CONFIGURED);

  try {
    _ssMemo = SpreadsheetApp.openById(id);
    return _ssMemo;
  } catch (err) {
    var text = String((err && err.message) || err);
    if (/permission|not have access|không có quyền/i.test(text)) {
      console.error('getSpreadsheet_: Drive denied access — check the API deployment ' +
                    '"Execute as" setting. Raw: ' + text);
      throw new Error(MSG.DEPLOY_MISCONFIGURED);
    }
    throw err;
  }
}

function getSheet_(name) {
  if (_sheetMemo[name]) return _sheetMemo[name];

  var sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error(MSG.SHEET_MISSING + name);
  _sheetMemo[name] = sheet;
  return sheet;
}

/* =======================================================================
   Reads
   ======================================================================= */

/**
 * Read a whole sheet as objects keyed by header name. Each carries `_row`
 * (1-based sheet row); strip it before anything leaves the API.
 *
 * Results are memoized for the rest of the current request. Any subsequent
 * append / update / delete on the same sheet clears the memo for that sheet.
 */
function readAll_(sheetName) {
  if (_readMemo[sheetName]) {
    // Shallow copy of the array — protects against callers that mutate the
    // array itself. Row objects remain shared (callers must not mutate them).
    return _readMemo[sheetName].slice();
  }

  var values = getSheet_(sheetName).getDataRange().getValues();
  if (values.length < 2) {
    _readMemo[sheetName] = [];
    return [];
  }

  var headers = values[0].map(function (h) { return String(h).trim(); });
  var rows = [];

  for (var i = 1; i < values.length; i++) {
    var raw = values[i];
    var blank = raw.every(function (c) { return c === '' || c === null; });
    if (blank) continue;

    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      if (headers[j]) obj[headers[j]] = raw[j];
    }
    obj._row = i + 1;
    rows.push(obj);
  }

  _readMemo[sheetName] = rows;
  return rows.slice();
}

/** First row where `field` equals `value` (case-insensitive for strings), or null. */
function findBy_(sheetName, field, value) {
  var needle = (typeof value === 'string') ? value.trim().toLowerCase() : value;
  var rows = readAll_(sheetName);

  for (var i = 0; i < rows.length; i++) {
    var actual = rows[i][field];
    if (typeof actual === 'string') {
      if (actual.trim().toLowerCase() === needle) return rows[i];
    } else if (actual === needle) {
      return rows[i];
    }
  }
  return null;
}

/* =======================================================================
   Writes — always invalidate the read cache for the affected sheet
   ======================================================================= */

/** Append one object as a row, mapping keys onto the sheet's headers. */
function appendRecord_(sheetName, obj) {
  var sheet = getSheet_(sheetName);
  var headers = readHeaders_(sheet);
  var row = headers.map(function (h) {
    return obj[h] === undefined || obj[h] === null ? '' : obj[h];
  });
  sheet.appendRow(row);
  invalidateReadCache_(sheetName);
  return sheet.getLastRow();
}

/** Overwrite the given 1-based sheet row, leaving absent keys untouched. */
function updateRecord_(sheetName, rowNumber, obj) {
  var sheet = getSheet_(sheetName);
  var headers = readHeaders_(sheet);
  var range = sheet.getRange(rowNumber, 1, 1, headers.length);
  var current = range.getValues()[0];

  var next = headers.map(function (h, i) {
    return Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : current[i];
  });
  range.setValues([next]);
  invalidateReadCache_(sheetName);
}

function deleteRecord_(sheetName, rowNumber) {
  getSheet_(sheetName).deleteRow(rowNumber);
  invalidateReadCache_(sheetName);
}

function readHeaders_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h).trim();
  });
}

/** Run `fn` holding the script lock. Use for anything that appends or allocates IDs. */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
