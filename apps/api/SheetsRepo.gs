/**
 * SheetsRepo.gs — the ONLY file allowed to call SpreadsheetApp.
 *
 * No business logic, no permission logic. Everything is addressed by HEADER NAME,
 * never by column index, so reordering columns cannot silently corrupt data.
 *
 * Helper names are appendRecord_ / updateRecord_ / deleteRecord_ — deliberately
 * NOT appendRow_ / deleteRow_, which collide with native Sheet methods.
 * See docs/CONVENTIONS.md.
 */

function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP.SPREADSHEET_ID);
  if (!id) throw new Error(MSG.NOT_CONFIGURED);

  try {
    return SpreadsheetApp.openById(id);
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
  var sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error(MSG.SHEET_MISSING + name);
  return sheet;
}

/**
 * Read a whole sheet as objects keyed by header name. Each carries `_row`
 * (1-based sheet row); strip it before anything leaves the API.
 */
function readAll_(sheetName) {
  var values = getSheet_(sheetName).getDataRange().getValues();
  if (values.length < 2) return [];

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
  return rows;
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

/** Append one object as a row, mapping keys onto the sheet's headers. */
function appendRecord_(sheetName, obj) {
  var sheet = getSheet_(sheetName);
  var headers = readHeaders_(sheet);
  var row = headers.map(function (h) {
    return obj[h] === undefined || obj[h] === null ? '' : obj[h];
  });
  sheet.appendRow(row);
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
}

function deleteRecord_(sheetName, rowNumber) {
  getSheet_(sheetName).deleteRow(rowNumber);
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
