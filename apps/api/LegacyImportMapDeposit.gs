/**
 * LegacyImportMapDeposit.gs — Milestone 7 / Phase 2: deposit/supplier-payment
 * extraction and the unrelated-free-text-note filter, split out of
 * LegacyImportMap.gs per the repo's 200-line modularization rule (the regex
 * heuristics here are a distinct, self-contained concern from the six plain
 * field-mapping functions in that file).
 *
 * Pure data transformation only — NO writes to Orders/OrderLines/Invoices/
 * StatusHistory anywhere in this file.
 *
 * Background (docs/OPEN_QUESTIONS.md Q1, docs/EXCEL_REFERENCE.md §6):
 * deposit/supplier-payment text is squeezed into the TRẠNG THÁI cell on
 * today's legacy sheet, e.g. "Khách đã cọc 47,466,000đ" (customer deposit),
 * "đã cọc 18,765,000 cho Tâm Thịnh Phát" (deposit paid TO a supplier),
 * "đã tt đủ NCC Regas" (supplier paid in full, no figure given), "đã đặt
 * TVP, không cọc" (ordered from a supplier, no deposit). These are
 * order-level facts (`Orders.customerDeposit`/`supplierName`/`supplierPaid`)
 * that happen to live on a line row — extraction is attempted only on an
 * order's first line (see `mapLegacyOrderGroup_`'s Key Insight), and is
 * always logged for manual review regardless of confidence (Risk
 * Assessment: "Silent wrong deposit/supplier extraction").
 */

/**
 * Finds a Vietnamese-formatted money figure appearing AFTER the first match
 * of `keywordRegex` in `text` (not anywhere in the string — avoids picking
 * up unrelated digits earlier in the cell, e.g. a "22/09/2026" delivery
 * date preceding a "cọc" clause). Reuses `legacyParseNumber_`
 * (LegacyImportParse.gs) for the actual thousand-separator parse.
 * @return {?number} null if no number follows the keyword.
 */
function legacyMoneyNear_(text, keywordRegex) {
  var m = keywordRegex.exec(text);
  if (!m) return null;
  var after = text.slice(m.index + m[0].length);
  var numMatch = /(\d{1,3}(?:[.,]\d{3})+|\d{4,})/.exec(after);
  return numMatch ? legacyParseNumber_(numMatch[1]) : null;
}

/**
 * Best-effort supplier name extraction: tries, in order, a "cho <name>"
 * clause (deposit paid TO a supplier), an "NCC <name>" clause (supplier
 * abbreviation), then a "đặt <name>" clause (ordered from a supplier).
 * Capture stops at the next newline/comma/period/semicolon. First pattern
 * to match wins — this is a heuristic, always flagged by the caller
 * regardless of match, never trusted silently.
 */
function legacyExtractSupplierName_(text) {
  var patterns = [/cho\s+([^\n,.;]+)/i, /ncc\.?\s+([^\n,.;]+)/i, /đặt\s+([^\n,.;]+)/i];
  for (var i = 0; i < patterns.length; i++) {
    var m = patterns[i].exec(text);
    if (m && m[1]) {
      var name = m[1].replace(/\s+$/, '').trim();
      if (name) return name;
    }
  }
  return '';
}

/**
 * Regex extraction of deposit/supplier-payment facts from one line's raw
 * status text → `{customerDeposit, supplierName, supplierPaid, matched}`.
 * A "cọc" (deposit) figure followed by a "cho <supplier>" clause is money
 * WE paid a supplier (`supplierPaid`); a bare "cọc" figure with no "cho"
 * clause is the base case, a customer deposit (`customerDeposit`) — see
 * docs/OPEN_QUESTIONS.md Q1's two money-flow examples. A "tt"/"thanh toán"
 * (payment) mention with no "cọc" is also treated as `supplierPaid` (may
 * have no figure, e.g. "đã tt đủ" = paid in full, nothing to parse — still
 * extracts `supplierName` alone). `matched` is true if ANY of the three
 * fields was populated.
 */
function extractDepositSupplier_(rawText) {
  var text = String(rawText || '');
  var result = { customerDeposit: null, supplierName: '', supplierPaid: null, matched: false };
  if (!text.trim()) return result;

  var hasChoClause = /cho\s+\S/i.test(text);
  var cocMoney = /cọc/i.test(text) ? legacyMoneyNear_(text, /cọc/i) : null;

  if (cocMoney !== null) {
    if (hasChoClause) result.supplierPaid = cocMoney;
    else result.customerDeposit = cocMoney;
  } else {
    var ttMoney = /\btt\b|thanh\s*toán/i.test(text)
      ? legacyMoneyNear_(text, /\btt\b|thanh\s*toán/i) : null;
    if (ttMoney !== null) result.supplierPaid = ttMoney;
  }

  var supplierName = legacyExtractSupplierName_(text);
  if (supplierName) result.supplierName = supplierName;

  result.matched = (result.customerDeposit !== null) || (result.supplierPaid !== null) ||
    !!result.supplierName;
  return result;
}

/**
 * Narrow keyword classifier deciding whether an unmatched TRẠNG THÁI
 * free-text cell is a legitimate business note (deposit/supplier-payment/
 * delivery-date/invoicing) worth keeping in `statusNote`, or an unrelated
 * personal/cash note (EXCEL_REFERENCE.md §6's last example, "Ngày 06/06:
 * mua đt iphone") to filter out with a review flag instead of importing.
 * Decided 2026-09-16 (see plan's Unresolved Question #9): keep the ~15-19
 * legitimate free-text one-offs, drop only the genuinely unrelated ones.
 *
 * `depositResult.matched` short-circuits to true: a concrete extraction
 * (amount and/or supplier name) is unambiguously business-related
 * regardless of keyword presence.
 *
 * 'done' is included beyond the literal keyword list this classifier was
 * specified with: it is explicitly one of the 5 controlled-ish legacy
 * status values (highest frequency — 443 of ~534 lines, EXCEL_REFERENCE.md
 * §6) but shares no Vietnamese business keyword with the other four
 * legitimate examples. `Config.statusList`'s `CONFIG_DEFAULTS` now includes
 * a matching `done` entry (Config.gs, code review 2026-09-16 / Fix 4) — a
 * NEW default, seeded only into a Config sheet that does not already exist
 * (see runbook.md's pre-flight step for a deployment whose Config sheet
 * predates this change). This keyword guard stays regardless, as defense
 * for that case: without it, a "done"/"Done" line whose Config sheet still
 * lacks the entry would be wrongly classified as an unrelated note and
 * dropped instead of surfacing as a `status-unmatched` review flag — a
 * deliberate, documented judgment call (flagged in the phase completion
 * report), not part of the literal instruction.
 */
var LEGACY_STATUS_NOTE_KEYWORDS_ = [
  'cọc', 'thanh toán', 'ncc', 'giao', 'xuất', 'hàng', 'đặt', 'hóa đơn', 'hđ', 'done'
];

function legacyStatusNoteLooksBusinessRelated_(rawText, depositResult) {
  if (depositResult && depositResult.matched) return true;

  var text = String(rawText || '');
  var lower = text.toLowerCase();
  if (/\btt\b/i.test(text)) return true;           // "tt" as a whole word (thanh toán abbrev.)
  if (/^\s*gh\b/i.test(text) || /\bgh\s/i.test(lower)) return true; // "GH ..." (giao hàng / delivery)

  for (var i = 0; i < LEGACY_STATUS_NOTE_KEYWORDS_.length; i++) {
    if (lower.indexOf(LEGACY_STATUS_NOTE_KEYWORDS_[i]) >= 0) return true;
  }
  return false;
}

/**
 * Resolves one line's unmatched status text: attempts order-level
 * deposit/supplier extraction on the first line only (writing straight
 * into `ctx.orderFields`, always logging a `deposit-extraction-attempted`
 * flag), then classifies the raw text as a legitimate business note (kept,
 * `status-unmatched` flag) or an unrelated one-off (dropped,
 * `filtered-unrelated-note` flag). Returns the statusNote to store (raw
 * text, or '' if filtered).
 */
function legacyResolveUnmatchedStatusNote_(statusNote, idx, line, ctx) {
  var depositResult = null;
  if (idx === 0) {
    depositResult = extractDepositSupplier_(statusNote);
    ctx.reviewFlags.push({
      type: 'deposit-extraction-attempted', lineIndex: idx, rowNumber: line.rowNumber,
      rawText: statusNote, matched: depositResult.matched,
      extracted: {
        customerDeposit: depositResult.customerDeposit,
        supplierName: depositResult.supplierName,
        supplierPaid: depositResult.supplierPaid
      }
    });
    if (depositResult.customerDeposit !== null) ctx.orderFields.customerDeposit = depositResult.customerDeposit;
    if (depositResult.supplierName) ctx.orderFields.supplierName = depositResult.supplierName;
    if (depositResult.supplierPaid !== null) ctx.orderFields.supplierPaid = depositResult.supplierPaid;
  }

  if (!legacyStatusNoteLooksBusinessRelated_(statusNote, depositResult)) {
    ctx.reviewFlags.push({
      type: 'filtered-unrelated-note', rawText: statusNote, orderIndex: null, lineIndex: idx
    });
    return '';
  }

  ctx.reviewFlags.push({
    type: 'status-unmatched', lineIndex: idx, rowNumber: line.rowNumber, rawText: statusNote
  });
  return statusNote;
}
