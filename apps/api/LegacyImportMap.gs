/**
 * LegacyImportMap.gs — Milestone 7 / Phase 2: field mapping and extraction
 * rules for the legacy Excel import. Pure data-transformation functions only
 * — NO writes to Orders/OrderLines/Invoices/StatusHistory anywhere in this
 * file (grep it: no appendRecord_/updateRecord_ calls). Consumes Phase 1's
 * parsed order groups (LegacyImportParse.gs's `parseLegacySheet_` output —
 * one group per order: `{ stt, po, customer, lines: [...] }`) and turns each
 * into the `{orderFields, lineFields[], invoiceRefs[]}` shape Phase 3 will
 * write, plus a per-order `reviewFlags[]` list of every heuristic decision
 * made along the way (nothing here is silently guessed — see
 * plans/260914-1115-milestone-7-legacy-excel-import/phase-02-field-mapping-
 * and-extraction-rules.md's Key Insights / Risk Assessment).
 *
 * Deposit/supplier-payment extraction and the free-text-note keyword filter
 * live in LegacyImportMapDeposit.gs (split out per the repo's 200-line
 * modularization rule — see that file's doc comment).
 *
 * See docs/EXCEL_REFERENCE.md for every source example these rules were
 * pinned against (§3 PO splitting, §4 VAT ratios, §5 CHI TIẾT/ĐVT variants,
 * §6 status values), and docs/OPEN_QUESTIONS.md Q1/Q3/Q4/Q6 for the settled
 * schema decisions this mapping targets (no orderNo/customerPo split; po is
 * one joined string with poNote for a genuine remark).
 */

/**
 * PO cell → `{po, poNote}`. The cell is often several newline-stacked
 * values (business's own number, customer's PO, an optional free-text
 * remark) — see EXCEL_REFERENCE.md §3. Q3 settled: no orderNo/customerPo
 * split, the whole PO stays one joined string; only a genuinely separate
 * trailing parenthetical remark (e.g. `( chTh)`) is pulled into `poNote`
 * (DATA_MODEL.md: "remark *about the PO*", e.g. "PO tạm").
 */
function mapPoCell_(rawPoText) {
  var lines = String(rawPoText || '')
    .split('\n')
    .map(function (l) { return l.trim(); })
    .filter(function (l) { return l.length > 0; });

  if (!lines.length) return { po: '', poNote: '' };

  var last = lines[lines.length - 1];
  var noteMatch = /^\(([\s\S]*)\)$/.exec(last);
  var poNote = '';
  if (noteMatch && lines.length > 1) {
    poNote = noteMatch[1].trim();
    lines = lines.slice(0, -1);
  }
  return { po: lines.join('; '), poNote: poNote };
}

/**
 * CHI TIẾT cell → `{productCode, description}`. Split on the FIRST `:`;
 * everything after it is the description, with internal newlines preserved
 * (EXCEL_REFERENCE.md §5: descriptions are long and multi-line) — only the
 * cell's own leading/trailing whitespace is stripped. No `:` at all → the
 * whole cell is the description, productCode blank (schema allows this, no
 * FK enforcement on productCode).
 */
function mapChiTietCell_(rawText) {
  var text = String(rawText || '');
  var idx = text.indexOf(':');
  if (idx === -1) return { productCode: '', description: text.trim() };

  var productCode = text.slice(0, idx).trim();
  var description = text.slice(idx + 1).replace(/^\s+/, '').replace(/\s+$/, '');
  return { productCode: productCode, description: description };
}

/**
 * Per-line VAT rate detection → `{vatRate, wasFallback}`. EXCEL_REFERENCE.md
 * §4: `Trị giá hđ / Thành tiền chưa VAT` (I / H) is 1.08 or 1.10, never a
 * global constant. If H (Thành tiền) is blank/zero, first try recomputing it
 * from the documented formula H = E × F (unitPrice × qty, EXCEL_REFERENCE.md
 * §2) — a reconstruction, not a guess. Only when even that (or I) is
 * unavailable, or the ratio doesn't land on a known rate, does this fall
 * back: `vatRate: null, wasFallback: true`. No Config access here (this
 * function takes raw cell values only) — the caller (`mapLegacyOrderGroup_`)
 * substitutes `Config.vatRates[0]` when `wasFallback` is true and logs a
 * review flag, per the "do not guess silently" rule in the phase plan.
 */
function detectVatRate_(unitPrice, qty, thanhTien, triGiaHd) {
  var h = legacyParseNumber_(thanhTien);
  if (h === null || h === 0) {
    var u = legacyParseNumber_(unitPrice);
    var q = legacyParseNumber_(qty);
    if (u !== null && q !== null) h = u * q;
  }
  var i = legacyParseNumber_(triGiaHd);
  if (!h || i === null) return { vatRate: null, wasFallback: true };

  var ratio = i / h;
  var TOLERANCE = 0.01; // absorbs VND integer-rounding drift; 1.08 vs 1.10 differ by 0.02
  if (Math.abs(ratio - 1.08) < TOLERANCE) return { vatRate: 0.08, wasFallback: false };
  if (Math.abs(ratio - 1.10) < TOLERANCE) return { vatRate: 0.10, wasFallback: false };
  return { vatRate: null, wasFallback: true };
}

/**
 * ĐVT (unit of measure) cell → `{uom, wasExactMatch}`. Case-insensitive
 * match against `Config.uomList` (EXCEL_REFERENCE.md §5: casing is
 * inconsistent, e.g. `Cái`/`cái`); a match normalizes to the list's own
 * canonical casing. `wasExactMatch` here means "a match was found at all"
 * (case-insensitively) — `false` only for values with NO match in the list,
 * which are kept as raw text and are what the caller should flag for review
 * (a pure casing difference is silently normalized, not flagged — the phase
 * plan only asks to flag the no-match case). A blank cell is not a mismatch
 * (nothing to flag).
 */
function mapUom_(rawUom, uomList) {
  var raw = String(rawUom || '').trim();
  if (!raw) return { uom: '', wasExactMatch: true };

  var list = Array.isArray(uomList) ? uomList : [];
  for (var i = 0; i < list.length; i++) {
    var candidate = String(list[i] || '');
    if (candidate.toLowerCase() === raw.toLowerCase()) {
      return { uom: candidate, wasExactMatch: true };
    }
  }
  return { uom: raw, wasExactMatch: false };
}

/** Collapses commas/periods (which carry no meaning in a status label) and
 *  whitespace, lowercases — cheap normalization so "Đã xuất, chưa TT" and
 *  "đã xuất chưa tt" compare equal. */
function legacyNormalizeStatusText_(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * TRẠNG THÁI cell → `{status, statusNote, matched}`. Since M5a moved status
 * to the line level, this maps straight to `OrderLines.status`/`statusNote`:
 * match `rawText` (case/punctuation-insensitively) against every
 * `statusList` entry's `key` or `label`. A match → controlled `status`, no
 * note. No match → blank `status`, full raw text preserved verbatim in
 * `statusNote` (schema explicitly allows a line with no status) — the
 * caller decides from there whether that raw text is a legitimate business
 * note or an unrelated one-off (see LegacyImportMapDeposit.gs).
 */
function mapStatusCell_(rawText, statusList) {
  var trimmed = String(rawText || '').trim();
  if (!trimmed) return { status: '', statusNote: '', matched: false };

  var normalized = legacyNormalizeStatusText_(trimmed);
  var list = Array.isArray(statusList) ? statusList : [];
  for (var i = 0; i < list.length; i++) {
    var item = list[i] || {};
    var key = String(item.key || '');
    var label = String(item.label || '');
    if ((key && legacyNormalizeStatusText_(key) === normalized) ||
        (label && legacyNormalizeStatusText_(label) === normalized)) {
      return { status: key, statusNote: '', matched: true };
    }
  }
  return { status: '', statusNote: trimmed, matched: false };
}

// mapLegacyOrderGroup_() — the composer that ties every function above (plus
// LegacyImportMapDeposit.gs's extraction/filter) into one order group's
// final shape — lives in LegacyImportMapCompose.gs, split out to keep this
// file under the repo's ~200-line modularization guideline.
