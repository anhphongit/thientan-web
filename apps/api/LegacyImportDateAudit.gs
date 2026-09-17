/**
 * LegacyImportDateAudit.gs — Milestone 7 diagnostic: audits every line's raw
 * "Ngày HĐ" (col K) text against the assumption driving the date-parsing
 * fix (2026-09-16 incident: a mid-batch test-copy write on the real file
 * showed some invoice/order dates landing in year 2001) — that this
 * single-year (THONGKE_2026) workbook always stores the date as bare "d/m"
 * with no year. docs/EXCEL_REFERENCE.md §2 calls it a "real date value",
 * but getDisplayValues() renders whatever the cell's number format shows,
 * which may or may not include a year — this audit is the only way to know
 * for certain, across every row, without guessing.
 *
 * Read-only, no writes to any live sheet. Reuses LegacyImport.gs's
 * convert+parse+cleanup path.
 *
 * HOW TO RUN: same as dryRunImportLegacyOrders() — Run dropdown, requires
 * LEGACY_IMPORT_FILE_ID set. Read the report before deciding how the date
 * fix should handle any "d/m/yyyy" or "other" rows it lists.
 */

/**
 * @return {string} the human-readable audit report (also logged).
 */
function legacyAuditNgayHdFormats() {
  guardSetup_();

  var fileId = String(
    PropertiesService.getScriptProperties().getProperty('LEGACY_IMPORT_FILE_ID') || ''
  ).trim();
  if (!fileId) {
    throw new Error('legacyAuditNgayHdFormats: LEGACY_IMPORT_FILE_ID is not set in Script ' +
      'Properties — set it to the Drive file id of FILE THEO DOI DON HANG.xlsx.');
  }

  var tempSheetId = null;
  var parsed;
  try {
    tempSheetId = convertLegacyXlsxToSheet_(fileId);
    var ss = SpreadsheetApp.openById(tempSheetId);
    var sheet = ss.getSheetByName(LEGACY_SHEET_NAME_);
    if (!sheet) {
      throw new Error('legacyAuditNgayHdFormats: sheet "' + LEGACY_SHEET_NAME_ +
        '" not found in the converted spreadsheet.');
    }
    parsed = parseLegacySheet_(sheet);
  } finally {
    legacyCleanupTempFile_(tempSheetId);
  }

  var report = legacyBuildDateAuditReport_(parsed);
  console.log(report);
  return report;
}

/**
 * Classifies every line's ngayHd against 4 buckets: bare "d/m" (the expected
 * case), "d/m/yyyy" (already has a year — a real exception to "always
 * dd/mm", even though the year is very likely still 2026), blank (no date
 * at all — legacyResolveOrderDate_ already handles this by scanning other
 * lines of the same order), and "other" (doesn't parse as a date shape at
 * all — stray text, a formula error string, etc.). Every "d/m/yyyy" and
 * "other" row is listed individually (row number + raw text) so it can be
 * looked up directly in the source Excel — never just a count, since these
 * are exactly the cases that need a human decision, not a guess.
 */
function legacyBuildDateAuditReport_(parsed) {
  var bareDm = /^(\d{1,2})\/(\d{1,2})$/;
  var dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  var counts = { bareDm: 0, dmy: 0, blank: 0, other: 0 };
  var dmySamples = [];
  var otherSamples = [];

  parsed.months.forEach(function (m) {
    m.orders.forEach(function (order) {
      order.lines.forEach(function (line) {
        var raw = String(line.ngayHd || '').trim();
        if (!raw) { counts.blank++; return; }

        var bm = bareDm.exec(raw);
        if (bm) {
          var d = Number(bm[1]), mo = Number(bm[2]);
          if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) { counts.bareDm++; return; }
        }

        if (dmy.test(raw)) {
          counts.dmy++;
          if (dmySamples.length < 50) {
            dmySamples.push('THÁNG ' + m.month + ' row ' + line.rowNumber + ': "' + raw + '"');
          }
          return;
        }

        counts.other++;
        if (otherSamples.length < 50) {
          otherSamples.push('THÁNG ' + m.month + ' row ' + line.rowNumber + ': "' + raw + '"');
        }
      });
    });
  });

  var lines = ['Ngày HĐ (col K) format audit — read-only, no writes performed.'];
  lines.push('  bare "d/m" (expected): ' + counts.bareDm);
  lines.push('  "d/m/yyyy" (has a year — exception): ' + counts.dmy);
  lines.push('  blank: ' + counts.blank);
  lines.push('  other / unrecognized shape (exception): ' + counts.other);

  if (dmySamples.length) {
    lines.push('"d/m/yyyy" rows (first ' + dmySamples.length + '):');
    dmySamples.forEach(function (s) { lines.push('  - ' + s); });
  }
  if (otherSamples.length) {
    lines.push('"other" rows (first ' + otherSamples.length + '):');
    otherSamples.forEach(function (s) { lines.push('  - ' + s); });
  }

  return lines.join('\n');
}
