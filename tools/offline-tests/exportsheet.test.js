/**
 * Offline tests for Milestone 4 / 4.3's testable slice of ExportSheet.gs —
 * writeExportRowsToSheet_ / padRow_. The rest of that file (buildExportXlsx_,
 * fetchSpreadsheetExportBase64_) calls real Google APIs (SpreadsheetApp.create,
 * DriveApp, UrlFetchApp, ScriptApp.getOAuthToken) that have no meaningful
 * offline stand-in — those are verified by live testing instead, same as
 * every other SpreadsheetApp/Drive-touching code path in this project.
 *
 * Run with: node tools/offline-tests/exportsheet.test.js
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path').join(__dirname, '../../apps/api/Export.gs');
const sheetPath = require('path').join(__dirname, '../../apps/api/ExportSheet.gs');

let pass = 0, fail = 0;
function check(name, condition) {
  if (condition) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}

/** Records every getRange(...).setValues/setFontWeight call against a fake
 *  sheet, standing in for the real Sheet object writeExportRowsToSheet_
 *  drives — enough to assert on the grid it built and which rows it bolded,
 *  without touching a real spreadsheet. */
function fakeSheet() {
  const calls = { setValues: [], setFontWeight: [], merge: [], setVerticalAlignment: [],
                   setNumberFormat: [], setBorder: [], setBackground: [],
                   frozenRows: null, autoResized: null };
  const sheet = {
    getRange(row, col, numRows, numCols) {
      return {
        setValues(grid) { calls.setValues.push({ row, col, numRows, numCols, grid }); },
        setFontWeight(w) { calls.setFontWeight.push({ row, col, numRows, numCols, weight: w }); },
        merge() { calls.merge.push({ row, col, numRows, numCols }); },
        setVerticalAlignment(v) { calls.setVerticalAlignment.push({ row, col, numRows, numCols, align: v }); },
        setNumberFormat(fmt) { calls.setNumberFormat.push({ row, col, numRows, numCols, fmt }); },
        setBorder(t, l, b, r, v, h, color, style) {
          calls.setBorder.push({ row, col, numRows, numCols, top: t, left: l, bottom: b, right: r, vertical: v, horizontal: h, color, style });
        },
        setBackground(color) { calls.setBackground.push({ row, col, numRows, numCols, color }); }
      };
    },
    setFrozenRows(n) { calls.frozenRows = n; },
    autoResizeColumns(col, count) { calls.autoResized = { col, count }; }
  };
  return { sheet, calls };
}

const sandbox = { console: { log(){}, warn(){}, error(){} },
  SpreadsheetApp: { BorderStyle: { SOLID: 'SOLID' } } };
sandbox.global = sandbox;
vm.createContext(sandbox);
// EXPORT_CSV_HEADER lives in Export.gs; writeExportRowsToSheet_/padRow_ in
// ExportSheet.gs — load both, same as the real Apps Script project (one
// shared global scope across all .gs files).
vm.runInContext(fs.readFileSync(path, 'utf8'), sandbox, { filename: 'Export.gs' });
// ExportSheet.gs's buildExportXlsx_ references SpreadsheetApp/DriveApp at
// call time only (not at load time), so it's safe to load without stubbing
// those — this test never calls buildExportXlsx_ itself.
vm.runInContext(fs.readFileSync(sheetPath, 'utf8'), sandbox, { filename: 'ExportSheet.gs' });

/* ---------- 1. header row + group/data/total rows all land in the grid ---------- */
console.log('\n1. writeExportRowsToSheet_ builds one grid row per input row, header first');
{
  const { sheet, calls } = fakeSheet();
  const rows = [
    { kind: 'group', cells: ['THÁNG 8'] },
    { kind: 'data', cells: ['1', 'PO1', 'KH A', 'Mô tả', 100, 2, 'Cái', 200, 216, '', '', 'draft'] },
    { kind: 'total', cells: ['', '', '', '', '', '', '', 'DOANH SỐ THÁNG 8', '200 / 216', '', '', ''] }
  ];
  sandbox.writeExportRowsToSheet_(sheet, rows);

  check('exactly one setValues call (batched, not per-row)', calls.setValues.length === 1);
  const grid = calls.setValues[0].grid;
  check('grid has header + 3 rows = 4 rows total', grid.length === 4);
  check('header row matches EXPORT_CSV_HEADER', grid[0][0] === 'STT' && grid[0][2] === 'KHÁCH HÀNG');
  check('group row: label in col 1, rest blank', grid[1][0] === 'THÁNG 8' && grid[1][1] === '' && grid[1][11] === '');
  check('data row passed through unchanged (padded to header width)', grid[2][1] === 'PO1' && grid[2][4] === 100);
  check('total row label in col 8 (DOANH SỐ)', grid[3][7] === 'DOANH SỐ THÁNG 8');
  check('every row is exactly EXPORT_CSV_HEADER.length wide', grid.every(r => r.length === 12));
}

/* ---------- 2. bold applied to header, group, and total rows only ---------- */
console.log('\n2. header/group/total rows are bolded; plain data rows are not');
{
  const { sheet, calls } = fakeSheet();
  const rows = [
    { kind: 'group', cells: ['THÁNG 8'] },
    { kind: 'data', cells: ['1', '', '', '', '', '', '', '', '', '', '', ''] },
    { kind: 'data', cells: ['', '', '', '', '', '', '', '', '', '', '', ''] },
    { kind: 'total', cells: ['', '', '', '', '', '', '', 'DOANH SỐ THÁNG 8', '', '', '', ''] }
  ];
  sandbox.writeExportRowsToSheet_(sheet, rows);

  // Sheet rows are 1-indexed: 1=header, 2=group(THÁNG 8), 3-4=data, 5=total
  const boldedRows = calls.setFontWeight.map(c => c.row);
  check('header (row 1) bolded', boldedRows.includes(1));
  check('group label (row 2) bolded', boldedRows.includes(2));
  check('total row (row 5) bolded', boldedRows.includes(5));
  check('the 2 plain data rows (3, 4) are NOT bolded', !boldedRows.includes(3) && !boldedRows.includes(4));
  check('exactly 3 bold calls total', calls.setFontWeight.length === 3);
}

/* ---------- 3. header row is frozen and columns autosized ---------- */
console.log('\n3. header frozen, columns autosized to header width');
{
  const { sheet, calls } = fakeSheet();
  sandbox.writeExportRowsToSheet_(sheet, [{ kind: 'group', cells: ['THÁNG 8'] }]);
  check('setFrozenRows(1) called', calls.frozenRows === 1);
  check('autoResizeColumns spans all 12 columns from col 1', calls.autoResized.col === 1 && calls.autoResized.count === 12);
}

/* ---------- 4. padRow_ pads short rows, truncates long ones ---------- */
console.log('\n4. padRow_ pads/truncates to exact width');
{
  check('short row padded with blanks', JSON.stringify(sandbox.padRow_(['a', 'b'], 4)) === JSON.stringify(['a', 'b', '', '']));
  check('exact-width row unchanged', JSON.stringify(sandbox.padRow_(['a', 'b', 'c'], 3)) === JSON.stringify(['a', 'b', 'c']));
  check('over-width row truncated', JSON.stringify(sandbox.padRow_(['a', 'b', 'c', 'd'], 2)) === JSON.stringify(['a', 'b']));
}

/* ---------- 5. an empty bucket list still writes just the header ---------- */
console.log('\n5. no rows -> only the header is written, no data/total noise');
{
  const { sheet, calls } = fakeSheet();
  sandbox.writeExportRowsToSheet_(sheet, []);
  check('setValues still called once (header only)', calls.setValues.length === 1);
  check('grid is exactly 1 row (header)', calls.setValues[0].grid.length === 1);
  check('only the header is bolded', calls.setFontWeight.length === 1 && calls.setFontWeight[0].row === 1);
}

/* ---------- 6. group/total banner rows are merged across the full row ---------- */
console.log('\n6. THÁNG/DOANH SỐ rows are merged (banner look), not left as scattered blank cells');
{
  const { sheet, calls } = fakeSheet();
  const rows = [
    { kind: 'group', cells: ['THÁNG 8'] },
    { kind: 'data', cells: ['1', 'PO1', 'KH A', 'Mô tả', 100, 2, 'Cái', 200, 216, '', '', 'Nháp'] },
    { kind: 'total', cells: ['', '', '', '', '', '', '', 'DOANH SỐ THÁNG 8', '200 / 216', '', '', ''] }
  ];
  sandbox.writeExportRowsToSheet_(sheet, rows);

  // Sheet rows: 1=header, 2=group, 3=data, 4=total
  const groupMerge = calls.merge.find(m => m.row === 2);
  const totalMerge = calls.merge.find(m => m.row === 4);
  check('THÁNG row merged across all 12 columns (A:L)', groupMerge && groupMerge.col === 1 && groupMerge.numCols === 12);
  check('DOANH SỐ row merges only the blank lead-in (A:G), leaving H for the label', totalMerge && totalMerge.col === 1 && totalMerge.numCols === 7);
}

/* ---------- 7. an order's line rows merge STT/PO/KHÁCH HÀNG/TRẠNG THÁI ---------- */
console.log('\n7. a multi-line order merges STT/PO/KHÁCH HÀNG/TRẠNG THÁI down its rows, single-line order does not merge at all');
{
  const { sheet, calls } = fakeSheet();
  const rows = [
    { kind: 'group', cells: ['THÁNG 8'] },
    // 3-line order: groupSize on the first line only, per buildExportRows_'s contract
    { kind: 'data', groupSize: 3, cells: ['1', 'PO1', 'KH A', 'Dòng 1', 100, 1, 'Cái', 100, 108, '', '', 'Nháp'] },
    { kind: 'data', cells: ['', '', 'KH A', 'Dòng 2', 100, 1, 'Cái', 100, 108, '', '', ''] },
    { kind: 'data', cells: ['', '', 'KH A', 'Dòng 3', 100, 1, 'Cái', 100, 108, '', '', ''] },
    // single-line order: groupSize 1 -> no merge needed at all
    { kind: 'data', groupSize: 1, cells: ['2', 'PO2', 'KH B', 'Dòng 1', 50, 1, 'Cái', 50, 54, '', '', 'Nháp'] }
  ];
  sandbox.writeExportRowsToSheet_(sheet, rows);

  // Sheet rows: 1=header, 2=group, 3-5=order 1's 3 lines, 6=order 2's 1 line
  const merged3Row = calls.merge.filter(m => m.row === 3);
  check('order 1 (3 lines) merges exactly 4 ranges: STT, PO, KHÁCH HÀNG, TRẠNG THÁI', merged3Row.length === 4);
  check('STT merge spans rows 3-5 (span 3), starting at the first line', 
    !!merged3Row.find(m => m.col === 1 && m.numRows === 3));
  check('PO merge spans rows 3-5 (span 3)', !!merged3Row.find(m => m.col === 2 && m.numRows === 3));
  check('KHÁCH HÀNG merge spans rows 3-5 (span 3)', !!merged3Row.find(m => m.col === 3 && m.numRows === 3));
  check('TRẠNG THÁI merge spans rows 3-5 (span 3)', !!merged3Row.find(m => m.col === 12 && m.numRows === 3));
  check('CHI TIẾT (col 4) is NOT merged — every line keeps its own description', !merged3Row.find(m => m.col === 4));

  const merged6Row = calls.merge.filter(m => m.row === 6);
  check('order 2 (1 line, groupSize 1) has no merge at all — nothing to span', merged6Row.length === 0);

  const topAligned = calls.setVerticalAlignment.filter(c => c.row === 3);
  check('merged cells are top-aligned so labels sit with the first line, not centered', 
    topAligned.length === 4 && topAligned.every(c => c.align === 'top'));
}

/* ---------- 8. fetchSpreadsheetExportBase64_ builds the export URL with all given params ---------- */
console.log('\n8. fetchSpreadsheetExportBase64_ (4.4 addition) encodes format + extra params into the URL');
{
  // fetchSpreadsheetExportBase64_ calls real UrlFetchApp/ScriptApp/Utilities
  // at call time — stub the minimum needed to capture the URL it builds,
  // same reasoning as fakeSheet() above: verify the pure "what URL/params
  // did this construct" logic without a real Google API behind it.
  let fetchedUrl = null;
  sandbox.UrlFetchApp = {
    fetch(url) {
      fetchedUrl = url;
      return { getResponseCode: () => 200, getBlob: () => ({ getBytes: () => [1, 2, 3] }) };
    }
  };
  sandbox.ScriptApp = { getOAuthToken: () => 'fake-token' };
  sandbox.Utilities = { base64Encode: (bytes) => 'base64:' + bytes.join(',') };

  sandbox.fetchSpreadsheetExportBase64_('SHEET_ID', 'xlsx', {});
  check('xlsx (no extra params): format=xlsx only', fetchedUrl === 'https://docs.google.com/spreadsheets/d/SHEET_ID/export?format=xlsx');

  sandbox.fetchSpreadsheetExportBase64_('SHEET_ID', 'pdf', { gid: 0, size: 'A4', range: 'A1:L20' });
  check('pdf (4.4 params): all params present in the query string',
    fetchedUrl.startsWith('https://docs.google.com/spreadsheets/d/SHEET_ID/export?format=pdf&') &&
    fetchedUrl.includes('gid=0') && fetchedUrl.includes('size=A4') && fetchedUrl.includes('range=A1%3AL20'));

  let threw = false;
  sandbox.UrlFetchApp.fetch = () => ({ getResponseCode: () => 403 });
  try { sandbox.fetchSpreadsheetExportBase64_('SHEET_ID', 'pdf', {}); } catch (e) { threw = true; }
  check('non-200 response throws instead of silently returning garbage', threw);
}

/* ---------- 9. money columns get a real number format, not a formatted string ---------- */
console.log('\n9. ĐƠN GIÁ/THÀNH TIỀN/TRỊ GIÁ HĐ columns get "#,##0" number format applied');
{
  const { sheet, calls } = fakeSheet();
  const rows = [
    { kind: 'group', cells: ['THÁNG 8'] },
    { kind: 'data', groupSize: 1, cells: ['1', 'PO1', 'KH A', 'Dòng 1', 100000, 2, 'Cái', 200000, 216000, '', '', 'Nháp'] },
    { kind: 'data', groupSize: 1, cells: ['2', 'PO2', 'KH B', 'Dòng 2', 50000, 1, 'Cái', 50000, 54000, '', '', 'Nháp'] },
    { kind: 'total', cells: ['', '', '', '', '', '', '', 'DOANH SỐ THÁNG 8', '250.000 / 270.000', '', '', ''] }
  ];
  sandbox.writeExportRowsToSheet_(sheet, rows);

  const moneyCols = calls.setNumberFormat.map(c => c.col).sort();
  check('exactly 3 columns get a number format (ĐƠN GIÁ=5, THÀNH TIỀN=8, TRỊ GIÁ HĐ=9)',
    JSON.stringify(moneyCols) === JSON.stringify([5, 8, 9]));
  check('every format call uses "#,##0" (thousand separators, no decimals, no currency symbol)',
    calls.setNumberFormat.every(c => c.fmt === '#,##0'));

  // Sheet rows: 1=header, 2=group, 3-4=data, 5=total — the format range
  // should span from the first data row through the last (3..4), not
  // reach into the group/total rows even though it's harmless if it did.
  const col5 = calls.setNumberFormat.find(c => c.col === 5);
  check('format range starts at the first data row (3)', col5.row === 3);
  check('format range covers both data rows (span 2)', col5.numRows === 2);
}

/* ---------- 10. a zero-data-row export applies no money format at all ---------- */
console.log('\n10. no data rows -> no setNumberFormat calls (nothing to format)');
{
  const { sheet, calls } = fakeSheet();
  sandbox.writeExportRowsToSheet_(sheet, [{ kind: 'group', cells: ['THÁNG 8'] }]);
  check('setNumberFormat never called when there are no data rows', calls.setNumberFormat.length === 0);
}

/* ---------- 11. Option A style: thin grid border + light header/group/total fills ---------- */
console.log('\n11. Option A styling: full-grid border once, background fills on header/THÁNG/DOANH SỐ rows');
{
  const { sheet, calls } = fakeSheet();
  const rows = [
    { kind: 'group', cells: ['THÁNG 8'] },
    { kind: 'data', groupSize: 1, cells: ['1', 'PO1', 'KH A', 'Dòng 1', 100000, 2, 'Cái', 200000, 216000, '', '', 'Nháp'] },
    { kind: 'total', cells: ['', '', '', '', '', '', '', 'DOANH SỐ THÁNG 8', '200.000 / 216.000', '', '', ''] }
  ];
  sandbox.writeExportRowsToSheet_(sheet, rows);

  check('setBorder called exactly once, over the whole written grid',
    calls.setBorder.length === 1 && calls.setBorder[0].row === 1 && calls.setBorder[0].numRows === 4);
  check('border uses the light grey border color, solid style',
    calls.setBorder[0].color === '#d0d5dd' && calls.setBorder[0].style === 'SOLID');

  const headerBg = calls.setBackground.find(c => c.row === 1);
  const groupBg = calls.setBackground.find(c => c.row === 2);
  const totalBg = calls.setBackground.find(c => c.row === 4);
  check('header row (1) gets the light grey header fill', headerBg && headerBg.color === '#f2f3f5');
  check('THÁNG group row (2) gets its own light fill', groupBg && groupBg.color === '#eef2f6');
  check('DOANH SỐ total row (4) gets its own light fill', totalBg && totalBg.color === '#f7f7f7');
  check('no other background calls beyond header/group/total rows', calls.setBackground.length === 3);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
