/**
 * Offline test for apps/api/appsscript.json — the OAuth scope list that
 * caused a real, silent bug (2026-09-04): `drive.file` looked sufficient
 * for DriveApp.getFileById(...).setTrashed(true) (the temp export
 * spreadsheet cleanup, ExportSheet.gs) but Apps Script actually requires
 * the broader `drive` (or `drive.readonly`) scope for that call,
 * regardless of who created the file. Every XLSX/PDF export silently
 * failed to clean up its temp Sheet from 4.3 onward — caught only by
 * manually running the export against real Drive and reading the
 * Executions log, since the regular offline suite stubs DriveApp
 * entirely (correctly, for fast unit tests) and can't see a live scope
 * mismatch.
 *
 * This test can't catch THAT class of bug in general (it has no way to
 * know what scope some Apps Script call actually needs without running
 * it live) — but it CAN stop this exact scope from silently regressing
 * back to `drive.file` (or being removed entirely) in a future edit, by
 * asserting the manifest still declares what DriveApp.getFileById/
 * setTrashed/searchFiles are known (from the live error message above)
 * to require.
 *
 * Run with: node tools/offline-tests/appsscript-manifest.test.js
 */
const fs = require('fs');
const path = require('path').join(__dirname, '../../apps/api/appsscript.json');

let pass = 0, fail = 0;
function check(name, condition) {
  if (condition) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}

console.log('\n1. appsscript.json declares a Drive scope broad enough for DriveApp.getFileById/setTrashed');
{
  const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
  const scopes = manifest.oauthScopes || [];

  const hasSufficientDriveScope = scopes.includes('https://www.googleapis.com/auth/drive') ||
    scopes.includes('https://www.googleapis.com/auth/drive.readonly');
  check('has "drive" or "drive.readonly" (either satisfies DriveApp.getFileById per the live error message)',
    hasSufficientDriveScope);

  check('does NOT rely on "drive.file" alone — confirmed insufficient for DriveApp.getFileById/searchFiles ' +
    '(live error, 2026-09-04): "Specified permissions are not sufficient to call DriveApp.getFileById"',
    !(scopes.includes('https://www.googleapis.com/auth/drive.file') && !hasSufficientDriveScope));

  // Since the temp-export-Sheet cleanup path (ExportSheet.gs) also WRITES
  // (setTrashed is a mutation, not a read), drive.readonly alone would
  // still fail live even though it satisfies the OR-check above loosely —
  // pin to the actual scope this project uses today so a well-meaning
  // "let's narrow this to readonly" edit doesn't reintroduce the same
  // class of live-only failure.
  check('uses the write-capable "drive" scope specifically (setTrashed is a write, not a read)',
    scopes.includes('https://www.googleapis.com/auth/drive'));

  // Sanity: the other scopes this project is known to need are still present.
  check('still has spreadsheets scope', scopes.includes('https://www.googleapis.com/auth/spreadsheets'));
  check('still has script.external_request scope (UrlFetchApp, ExportSheet.gs export-URL fetch)',
    scopes.includes('https://www.googleapis.com/auth/script.external_request'));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
