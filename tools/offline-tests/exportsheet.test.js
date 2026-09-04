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
                   frozenRows: null, autoResized: null };
  const sheet = {
    getRange(row, col, numRows, numCols) {
      return {
        setValues(grid) { calls.setValues.push({ row, col, numRows, numCols, grid }); },
        setFontWeight(w) { calls.setFontWeight.push({ row, col, numRows, numCols, weight: w }); },
        merge() { calls.merge.push({ row, col, numRows, numCols }); },
        setVerticalAlignment(v) { calls.setVerticalAlignment.push({ row, col, numRows, numCols, align: v }); }
      };
    },
    setFrozenRows(n) { calls.frozenRows = n; },
    autoResizeColumns(col, count) { calls.autoResized = { col, count }; }
  };
  return { sheet, calls };
}

const sandbox = { console: { log(){}, warn(){}, error(){} } };
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

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
