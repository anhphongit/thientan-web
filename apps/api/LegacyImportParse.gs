/**
 * LegacyImportParse.gs — row-grouping/parsing helpers for the Milestone 7
 * legacy Excel import (Phase 1: ingestion + dry-run parsing only). Split out
 * of LegacyImport.gs per the repo's 200-line modularization rule:
 * LegacyImport.gs stays orchestration-only (convert, run, report),
 * everything that actually walks `THONGKE_2026` rows lives here.
 *
 * See docs/EXCEL_REFERENCE.md for the source layout this decodes: one
 * sheet, columns A–L (STT, PO, KHÁCH HÀNG, CHI TIẾT, ĐƠN GIÁ, SL, ĐVT,
 * Thành tiền, Trị giá hđ, HÓA ĐƠN, Ngày HĐ, TRẠNG THÁI), repeating
 * `THÁNG n` / order rows / `DOANH SỐ THÁNG n` month blocks. An order is a
 * group of consecutive rows: STT (col A) non-blank starts a new order,
 * blank STT appends a line to the current order.
 *
 * Deliberately NO field mapping here (no orderNo/customerPo/note split off
 * PO, no status/note split off TRẠNG THÁI, no vatRate derivation) — that is
 * Phase 2's job. This phase only needs the raw shape to be reviewable.
 */

/** 0-based column indices for A..L, matching docs/EXCEL_REFERENCE.md §2. */
var LEGACY_COL_ = {
  STT: 0, PO: 1, CUSTOMER: 2, CHI_TIET: 3, DON_GIA: 4, SL: 5, DVT: 6,
  THANH_TIEN: 7, TRI_GIA_HD: 8, HOA_DON: 9, NGAY_HD: 10, TRANG_THAI: 11
};

/**
 * Walks every row of `sheet` (via getDisplayValues() — NOT getValues() — so
 * multi-line PO/TRẠNG THÁI text and Vietnamese formatting come through as
 * typed, per docs/EXCEL_REFERENCE.md §3) and groups it into month blocks
 * and order groups.
 * @param {Sheet} sheet exposes getDataRange() -> { getDisplayValues(): string[][] }.
 * @return {{months: Array, unrecognizedRows: Array}}
 *   months: [{ month, orders: [{ stt, po, customer, lines: [line, ...] }], printedTotal }]
 *   line: { rowNumber, chiTiet, donGia, sl, dvt, thanhTien, triGiaHd, hoaDonRa, ngayHd, trangThai }
 *   unrecognizedRows: [{ rowNumber, reason, raw }]
 */
function parseLegacySheet_(sheet) {
  var rows = sheet.getDataRange().getDisplayValues();
  var months = [];
  var unrecognizedRows = [];
  var currentMonth = null;
  var currentOrder = null;

  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var rowNumber = r + 1; // 1-based, matches the sheet's own row numbering

    if (legacyIsBlankRow_(row)) continue;

    var monthNo = legacyMatchMonthHeader_(row);
    if (monthNo !== null) {
      currentMonth = { month: monthNo, orders: [], printedTotal: null };
      months.push(currentMonth);
      currentOrder = null;
      continue;
    }

    var doanhSo = legacyMatchDoanhSoRow_(row);
    if (doanhSo !== null) {
      if (currentMonth && currentMonth.month === doanhSo.month) {
        currentMonth.printedTotal = doanhSo.total;
      } else {
        unrecognizedRows.push({
          rowNumber: rowNumber,
          reason: 'DOANH SỐ THÁNG ' + doanhSo.month + ' row found without a matching open THÁNG ' + doanhSo.month + ' block',
          raw: row
        });
      }
      currentMonth = null; // close the block either way — never straddle blocks
      currentOrder = null;
      continue;
    }

    if (!currentMonth) continue; // preamble (title/header/year rows) or the gap between blocks

    var stt = String(row[LEGACY_COL_.STT] || '').trim();
    var hasOtherData = legacyRowHasDataAfterCol0_(row);

    if (stt) {
      if (!hasOtherData) {
        unrecognizedRows.push({
          rowNumber: rowNumber,
          reason: 'STT "' + stt + '" set but no other data on the row',
          raw: row
        });
        currentOrder = null;
        continue;
      }
      currentOrder = legacyBuildOrder_(rowNumber, row);
      currentMonth.orders.push(currentOrder);
      continue;
    }

    // Blank STT: either a continuation line of the current order, or —
    // if nothing is open — a row that doesn't fit the expected pattern.
    if (!hasOtherData) continue; // fully blank cell in col A, rest also blank — skip silently
    if (!currentOrder) {
      unrecognizedRows.push({
        rowNumber: rowNumber,
        reason: 'Continuation row (blank STT) with no order group open',
        raw: row
      });
      continue;
    }
    currentOrder.lines.push(legacyBuildLine_(rowNumber, row));
  }

  return { months: months, unrecognizedRows: unrecognizedRows };
}

/** True if every cell in the row is blank (after trimming). */
function legacyIsBlankRow_(row) {
  for (var i = 0; i < row.length; i++) {
    if (String(row[i] || '').trim() !== '') return false;
  }
  return true;
}

/** True if any cell AFTER column A (STT) carries non-blank data. */
function legacyRowHasDataAfterCol0_(row) {
  for (var i = 1; i < row.length; i++) {
    if (String(row[i] || '').trim() !== '') return true;
  }
  return false;
}

/** Collapses runs of whitespace and trims — cheap defensive normalization
 *  before matching a label cell against a fixed Vietnamese pattern. */
function legacyNormalizeSpace_(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

/** @return {?number} the month number if `row`'s first non-blank cell reads
 *  "THÁNG n", else null. */
function legacyMatchMonthHeader_(row) {
  var idx = legacyFirstNonEmptyIndex_(row);
  if (idx === null) return null;
  var m = /^THÁNG\s+(\d+)$/i.exec(legacyNormalizeSpace_(row[idx]));
  return m ? parseInt(m[1], 10) : null;
}

/** @return {?{month:number, total:?number}} if `row`'s first non-blank cell
 *  reads "DOANH SỐ THÁNG n"; `total` is the first cell elsewhere on the row
 *  that parses as a number (the printed revenue figure), or null if none
 *  parses — else returns null entirely (row isn't a DOANH SỐ row at all). */
function legacyMatchDoanhSoRow_(row) {
  var idx = legacyFirstNonEmptyIndex_(row);
  if (idx === null) return null;
  var m = /^DOANH\s+S[ỐO]\s+THÁNG\s+(\d+)/i.exec(legacyNormalizeSpace_(row[idx]));
  if (!m) return null;

  var total = null;
  for (var i = 0; i < row.length; i++) {
    if (i === idx) continue;
    var n = legacyParseNumber_(row[i]);
    if (n !== null) { total = n; break; }
  }
  return { month: parseInt(m[1], 10), total: total };
}

/** @return {?number} the index of the first non-blank cell, or null. */
function legacyFirstNonEmptyIndex_(row) {
  for (var i = 0; i < row.length; i++) {
    if (String(row[i] || '').trim() !== '') return i;
  }
  return null;
}

/**
 * Best-effort text->number parse for a Vietnamese-formatted money cell
 * (thousand separators as "." or ","), used only for the dry-run report's
 * printed-total figure — never for anything written to a live sheet.
 * @return {?number} null if the cell isn't a recognizable number.
 */
function legacyParseNumber_(text) {
  var t = String(text || '').trim();
  if (!t) return null;
  var cleaned = t.replace(/(?<=\d)[.,](?=\d{3}(\D|$))/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  var n = Number(cleaned);
  return isNaN(n) ? null : n;
}

/** First row of a new order group: carries STT/PO/customer and is itself
 *  also the order's first line (see docs/EXCEL_REFERENCE.md §3). */
function legacyBuildOrder_(rowNumber, row) {
  return {
    stt: String(row[LEGACY_COL_.STT] || '').trim(),
    po: row[LEGACY_COL_.PO],
    customer: row[LEGACY_COL_.CUSTOMER],
    lines: [legacyBuildLine_(rowNumber, row)]
  };
}

/** One line of an order — either the STT row itself or a blank-STT
 *  continuation row. Raw column values only, no field mapping (Phase 2). */
function legacyBuildLine_(rowNumber, row) {
  return {
    rowNumber: rowNumber,
    chiTiet: row[LEGACY_COL_.CHI_TIET],
    donGia: row[LEGACY_COL_.DON_GIA],
    sl: row[LEGACY_COL_.SL],
    dvt: row[LEGACY_COL_.DVT],
    thanhTien: row[LEGACY_COL_.THANH_TIEN],
    triGiaHd: row[LEGACY_COL_.TRI_GIA_HD],
    hoaDonRa: row[LEGACY_COL_.HOA_DON],
    ngayHd: row[LEGACY_COL_.NGAY_HD],
    trangThai: row[LEGACY_COL_.TRANG_THAI]
  };
}
