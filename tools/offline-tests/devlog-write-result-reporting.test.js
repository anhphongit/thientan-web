/**
 * Offline test for the 2026-09-14 DevLog silent-failure fix (plan
 * 260912-1110, Phases 3-4).
 *
 * Root cause (see plans/reports/debugger-260914-1305-devlog-sheet-silent-failure.md):
 * `logDevEvent_` (apps/api/Security.gs) always swallowed its own write
 * exception into a bare console.error, and `actionLogDev_` reported
 * `{ logged: isApiDevMode_() }` — the DEV_MODE flag, NOT whether the row
 * was actually appended. So even a genuine write-time exception (quota,
 * protected sheet, etc.) was reported back to the caller as `logged: true`.
 * On the web side, `devNote_` (apps/web/ApiClient.gs) never even looked at
 * the response, so neither side could ever tell "no DevLog row" from
 * "DevLog row written" — exactly the symptom the user reported live
 * (several real errors, zero DevLog rows).
 *
 * Phase 4 (2026-09-14, live-confirmed): a real occurrence showed the API
 * responding `{"logged":false}` because the API project's DEV_MODE Script
 * Property was off — DevLog is meant to work in production too, not just
 * when a developer happens to have that property set, so both
 * `logDevEvent_` (API) and `devNote_` (web) no longer gate the write on
 * DEV_MODE at all; logging is unconditional now. Only the return-value
 * accuracy (does the caller learn the REAL outcome) is still in scope here —
 * no lock/concurrency work (deferred).
 */
const fs = require('fs'), vm = require('vm');
const API_ROOT = __dirname + '/../../apps/api/';
const WEB_ROOT = __dirname + '/../../apps/web/';

let pass = 0, fail = 0;
const ok = (name, cond, detail) => cond ? (pass++, console.log('  ok   ' + name))
  : (fail++, console.log('  FAIL ' + name + (detail ? ' → ' + detail : '')));

/* =======================================================================
   Section 1 — apps/api/Security.gs: logDevEvent_ / actionLogDev_
   ======================================================================= */
(function () {
  console.log('\nlogDevEvent_ / actionLogDev_ return the ACTUAL write outcome');

  const configSrc = fs.readFileSync(API_ROOT + 'Config.gs', 'utf8');
  const securitySrc = fs.readFileSync(API_ROOT + 'Security.gs', 'utf8');

  let appendShouldThrow, errorLogs, rows;
  function makeSheet() {
    rows = [];
    return {
      getSheetByName: () => ({
        getLastRow: () => rows.length,
        getRange: () => ({ setValues() {}, setFontWeight() {} }),
        setFrozenRows() {},
        appendRow: (row) => {
          if (appendShouldThrow) throw new Error('Exception: This action would increase the number of cells... quota exceeded');
          rows.push(row);
        },
        deleteRows() {}
      }),
      insertSheet: () => ({
        getRange: () => ({ setValues() {}, setFontWeight() {} }),
        setFrozenRows() {},
        getLastRow: () => rows.length,
        appendRow: (row) => { rows.push(row); },
        deleteRows() {}
      })
    };
  }

  const sandbox = {
    console: { log: console.log, error: (msg) => { errorLogs.push(String(msg)); } },
    // Phase 4: DEV_MODE is no longer read by logDevEvent_ at all — the
    // Script Property mock here is intentionally absent/irrelevant; these
    // tests prove the write happens (or doesn't) based ONLY on whether the
    // sheet append itself throws, never on this property's value.
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: () => null })
    },
    getSpreadsheet_: () => makeSheet()
  };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(configSrc, sandbox, { filename: 'Config.gs' });
  vm.runInContext(securitySrc, sandbox, { filename: 'Security.gs' });

  // --- write succeeds (DEV_MODE property absent/unset): returns true -----
  appendShouldThrow = false; errorLogs = [];
  let result = sandbox.logDevEvent_('error', 'web', 'test', 'detail', 'a@x.com');
  ok('logDevEvent_ writes unconditionally — succeeds even with no DEV_MODE ' +
     'property set at all (Phase 4: logging must work in production, not ' +
     'just when a developer happens to flip a Script Property)',
     result === true, 'result=' + result);
  ok('a row was actually appended', rows.length === 1);

  // --- write throws: returns false (was previously invisible) ------------
  appendShouldThrow = true; errorLogs = [];
  result = sandbox.logDevEvent_('error', 'web', 'test', 'detail', 'a@x.com');
  ok('logDevEvent_ returns false when the write itself throws (the actual ' +
     'bug this fixes — before, actionLogDev_ would have reported ' +
     '{logged:true} even here, since it only checked the DEV_MODE flag)',
     result === false, 'result=' + result);
  ok('the swallowed exception is still logged to Stackdriver',
     errorLogs.some((l) => l.indexOf('logDevEvent_ failed') !== -1));

  // --- actionLogDev_ reports the REAL write outcome -----------------------
  appendShouldThrow = true;
  let response = sandbox.actionLogDev_({ email: 'a@x.com' }, { level: 'error', message: 'm' });
  ok('actionLogDev_: write threw → {logged:false} (previously this ' +
     'incorrectly reported {logged:true} whenever DEV_MODE happened to be on)',
     response.logged === false, JSON.stringify(response));

  appendShouldThrow = false;
  response = sandbox.actionLogDev_({ email: 'a@x.com' }, { level: 'error', message: 'm' });
  ok('actionLogDev_: write succeeds → {logged:true}', response.logged === true);
})();

/* =======================================================================
   Section 2 — apps/web/ApiClient.gs: devNote_ checks the response
   ======================================================================= */
(function () {
  console.log('\ndevNote_ checks the API response instead of discarding it');

  const configSrc = fs.readFileSync(WEB_ROOT + 'Config.gs', 'utf8');
  const clientSrc = fs.readFileSync(WEB_ROOT + 'ApiClient.gs', 'utf8');

  let fetchResponseBody, errorLogs;
  const sandbox = {
    console: { log: console.log, error: (msg) => { errorLogs.push(String(msg)); } },
    // Phase 4: devNote_ no longer gates on isDevMode_/DEV_MODE at all, so
    // this mock deliberately omits that property — these tests prove the
    // response-checking behavior fires unconditionally.
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k === 'API_URL' ? 'https://fake-api/exec'
          : k === 'SHARED_SECRET' ? 'shh' : null)
      })
    },
    UrlFetchApp: {
      fetch: () => ({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify(fetchResponseBody),
        getAllHeaders: () => ({})
      })
    },
    Utilities: { sleep: () => {} },
    resolveActiveEmail_: () => 'nhanvien@x.com'
  };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(configSrc, sandbox, { filename: 'Config.gs' });
  vm.runInContext(clientSrc, sandbox, { filename: 'ApiClient.gs' });

  // --- API confirms the row was written: no extra error ------------------
  fetchResponseBody = { ok: true, data: { logged: true }, build: 'x' };
  errorLogs = [];
  sandbox.devNote_('error', 'ApiClient', 'HTTP 302 on apiListProducts', 'detail');
  ok('logged:true → devNote_ does NOT complain (real write confirmed)',
     errorLogs.every((l) => l.indexOf('NOT written') === -1), JSON.stringify(errorLogs));

  // --- API reports the row was NOT written (DEV_MODE off / write threw) --
  fetchResponseBody = { ok: true, data: { logged: false }, build: 'x' };
  errorLogs = [];
  sandbox.devNote_('error', 'ApiClient', 'HTTP 302 on apiListProducts', 'detail');
  ok('logged:false → devNote_ logs a distinguishing "NOT written" console.error ' +
     '(this is the fix: previously this case was completely silent)',
     errorLogs.some((l) => l.indexOf('NOT written') !== -1), JSON.stringify(errorLogs));

  // --- Router-level failure (ok:false) is also caught, not silently trusted -
  fetchResponseBody = { ok: false, error: 'internal' };
  errorLogs = [];
  sandbox.devNote_('error', 'ApiClient', 'HTTP 302 on apiListProducts', 'detail');
  ok('ok:false → devNote_ also logs "NOT written" (does not assume success on any 200)',
     errorLogs.some((l) => l.indexOf('NOT written') !== -1), JSON.stringify(errorLogs));
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
