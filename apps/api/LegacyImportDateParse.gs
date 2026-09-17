/**
 * LegacyImportDateParse.gs — Milestone 7 date-parsing fix (2026-09-16
 * incident). A real test-copy write run showed imported order/invoice
 * dates landing in year 2001 instead of 2026, and separately a large batch
 * of orders skipped as "no parseable order date" even though the source
 * rows do carry a date.
 *
 * ROOT CAUSE: `Ngày HĐ` (col K) is frequently stored as bare "d/m" with no
 * year (docs/EXCEL_REFERENCE.md §1: THONGKE_2026 is a single-year workbook
 * — the year lives in the sheet name, not the cell). The shared `parseDate_`
 * (Orders.gs) only recognizes ISO and full "d/m/yyyy"; for anything else it
 * falls back to the native `new Date(text)` constructor. That fallback is
 * silently inconsistent for a bare "d/m": `new Date("6/6")` "succeeds" as
 * US m/d and defaults to year **2001** (V8's legacy-parser default year for
 * a date string with no year), while `new Date("22/9")` (unambiguously
 * day/month, day > 12) returns Invalid Date and is correctly rejected. So
 * some historical dates were silently corrupted to 2001, and others
 * (equally valid) were silently dropped — both wrong, one loudly and one
 * quietly.
 *
 * FIX: never delegate a bare "d/m" (or any unrecognized shape) to the
 * native Date constructor. Parse ISO exactly like `parseDate_` does, and
 * additionally recognize bare "d/m" explicitly, defaulting to
 * `legacyImportYear_()` (LegacyImportReconcile.gs — derived from
 * LEGACY_SHEET_NAME_, "THONGKE_2026" -> 2026, not a second hardcoded
 * constant). Anything else returns null — never a guessed date — same
 * "never trust/guess silently" rule the rest of this migration follows.
 *
 * SECOND INCIDENT (2026-09-16, legacyAuditNgayHdFormats() run against the
 * real file): 5 rows in the THÁNG 4 block read like "4/21/2026" —
 * unvalidated `d/m/yyyy` parsing (day=4, month=21) previously let the
 * native month-index overflow silently roll into a DIFFERENT YEAR
 * (`new Date(2026, 20, 4)` -> September **2027**, not April 2026) — the
 * exact same silent-wrong-date failure class as the year-2001 incident,
 * just a different trigger (an out-of-range month instead of an assumed
 * year). Month 21 has no valid Vietnamese D/M/YYYY reading at all, so these
 * 5 rows are genuinely US M/D/YYYY (confirmed: "4/21" as M/D = April 21,
 * consistent with the THÁNG 4 block they're in). Fix: validate day/month
 * ranges for `d/m/yyyy` same as the bare-`d/m` case already did, and when
 * the primary D/M reading is out of range, try swapping to M/D — the only
 * remaining valid reading, not a guess among several.
 *
 * Used in place of `parseDate_` ONLY within Milestone 7's own code
 * (LegacyImportWriteOrder.gs) — `parseDate_` itself is left untouched,
 * since it's shared by live order entry and changing its behavior there
 * would affect production users typing dates through the app, which this
 * incident has nothing to do with.
 */
function legacyParseHistoricalDate_(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  var text = String(value).trim();
  if (!text) return null;

  var iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  var dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (dmy) {
    var a = Number(dmy[1]), b = Number(dmy[2]), year = Number(dmy[3]);
    // Primary reading: Vietnamese D/M/YYYY (this workbook's convention).
    if (a >= 1 && a <= 31 && b >= 1 && b <= 12) return new Date(year, b - 1, a);
    // Fallback: US M/D/YYYY — only reached when D/M is mathematically
    // invalid (b > 12), so this is the sole remaining valid reading, not a
    // guess among several (see file doc comment, second incident).
    if (b >= 1 && b <= 31 && a >= 1 && a <= 12) return new Date(year, a - 1, b);
    return null;
  }

  var dm = /^(\d{1,2})\/(\d{1,2})$/.exec(text);
  if (dm) {
    var day = Number(dm[1]);
    var month = Number(dm[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return new Date(legacyImportYear_(), month - 1, day);
    }
  }

  return null; // unrecognized shape — never guess via the native Date fallback.
}
