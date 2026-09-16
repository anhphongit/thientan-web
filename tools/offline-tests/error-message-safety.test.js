/**
 * Offline tests for Milestone 6 / Phase 2 — error message hardening.
 *
 * Codebase inventory (2026-09-13, re-verified 2026-09-15) confirmed a real
 * leak chain: a caught exception's raw `.message` (which in Apps Script can
 * embed sheet/range names, formula text, or Drive file ids) reached the
 * browser verbatim instead of a generic Vietnamese message, at 5 sites:
 *   1. apps/api/Router.gs:97       — doPost's top-level catch
 *   2. apps/api/ExportJob.gs       — job.error / job.deliveryError
 *   3. apps/api/SheetsRepo.gs:67   — getSpreadsheet_'s unmatched rethrow
 *      (fixed downstream, at Router.gs's catch — see Section 5)
 *   4. apps/web/Main.gs:27         — handle_()'s catch
 *   5. apps/web/ApiClient.gs:133   — { ok:false } pass-through (already
 *      safe by construction once #1 is fixed — see Section 6)
 *
 * Fix is content-based, not a marker: apps/api/Config.gs and
 * apps/web/Config.gs each independently define isKnownMessage_/
 * safeErrorMessage_ (no shared module system between the two Apps Script
 * projects). This file exercises BOTH copies against the same input/output
 * table (Section 1) so they can't silently drift apart, then exercises each
 * of the 5 real call sites with the actual source loaded via vm.
 *
 * apps/web/Main.gs:69 (the scope-missing branch) is explicitly EXCLUDED
 * from this fix — see apiclient-scope.test.js, which pins that contract and
 * must keep passing unchanged.
 */
const fs = require('fs'), vm = require('vm');
const API_ROOT = __dirname + '/../../apps/api/';
const WEB_ROOT = __dirname + '/../../apps/web/';

let pass = 0, fail = 0;
const ok = (name, cond, detail) => cond ? (pass++, console.log('  ok   ' + name))
  : (fail++, console.log('  FAIL ' + name + (detail ? ' → ' + detail : '')));

/* =======================================================================
   Section 1 — isKnownMessage_ / safeErrorMessage_: same input/output table
   run against BOTH apps/api's and apps/web's independent copies.
   ======================================================================= */
function loadConfigSandbox(root, extra) {
  const sandbox = Object.assign({
    console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) }
  }, extra || {});
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(root + 'Config.gs', 'utf8'), sandbox, { filename: 'Config.gs' });
  return sandbox;
}

function testSafeErrorMessage(label, root, knownSpotChecks) {
  console.log('\nisKnownMessage_ / safeErrorMessage_ (' + label + ')');
  const sandbox = loadConfigSandbox(root);

  // --- a raw, unexpected exception must never reach the caller verbatim ---
  let errorLogs = [];
  sandbox.console = { log: console.log, error: (m) => { errorLogs.push(String(m)); } };
  const rawErr = new Error('Range "OrderLines!A2:Z9999" (sheetId 123456789) is out of bounds.');
  const result = sandbox.safeErrorMessage_(rawErr);
  ok(label + ': a raw non-MSG exception is replaced with MSG.GENERIC, never forwarded verbatim',
     result === sandbox.MSG.GENERIC, 'got: ' + result);
  ok(label + ': the real detail is still logged server-side (console.error) for diagnosability',
     errorLogs.some((l) => l.indexOf('OrderLines!A2:Z9999') !== -1), JSON.stringify(errorLogs));
  ok(label + ': isKnownMessage_ itself returns false for that same raw text',
     sandbox.isKnownMessage_(rawErr.message) === false);

  // --- every existing MSG.*-throwing site's message passes through UNCHANGED,
  //     by construction (content-based, not per-site migration) — spot-check
  //     a representative handful ---
  knownSpotChecks.forEach((key) => {
    const msgValue = sandbox.MSG[key];
    ok(label + ': MSG.' + key + ' is recognized as already-known (isKnownMessage_)',
       sandbox.isKnownMessage_(msgValue) === true, 'MSG.' + key + '=' + msgValue);
    const passthrough = sandbox.safeErrorMessage_(new Error(msgValue));
    ok(label + ': safeErrorMessage_ forwards MSG.' + key + ' verbatim, unchanged',
       passthrough === msgValue, 'got: ' + passthrough);
  });

  // --- an error with no .message (e.g. a non-Error throw) still degrades safely ---
  ok(label + ': safeErrorMessage_ never throws on an undefined/non-Error input',
     (() => { try { return sandbox.safeErrorMessage_(undefined) === sandbox.MSG.GENERIC; }
              catch (e) { return false; } })());
}

testSafeErrorMessage('apps/api', API_ROOT,
  ['ORDER_LOCK_BUSY', 'APPROVE_STATUS_EDIT_DENIED', 'NO_PERMISSION']);
testSafeErrorMessage('apps/web', WEB_ROOT,
  ['NOT_CONFIGURED', 'API_UNREACHABLE', 'LOCKED']);

/* =======================================================================
   Section 2 — apps/api/Router.gs:97 — doPost's top-level catch
   ======================================================================= */
(function () {
  console.log('\napps/api Router.gs doPost() top-level catch');

  const configSrc = fs.readFileSync(API_ROOT + 'Config.gs', 'utf8');
  const routerSrc = fs.readFileSync(API_ROOT + 'Router.gs', 'utf8');

  // getActions_() builds an object literal referencing every action*_
  // function by name — none of those files are loaded here (this section
  // tests only the routing/catch shell), so every OTHER action name besides
  // the one this test controls (actionListOrders_) needs a harmless stub or
  // the object-literal evaluation itself throws a ReferenceError. Derived
  // from the source so it stays correct if actions are added/removed later.
  // NOTE: actionGetSession_ is deliberately excluded from BOTH the stub list
  // and the controllable action below — Router.gs itself declares a real
  // `function actionGetSession_(user) {...}` (the only action implemented
  // inline in this file), which would silently overwrite any stub of the
  // same name in this shared sandbox once Router.gs's source runs.
  const actionNames = Array.from(new Set(routerSrc.match(/\baction[A-Za-z]+_\b/g) || []))
    .filter((n) => n !== 'actionGetSession_' && n !== 'actionListOrders_');
  const actionStubs = {};
  actionNames.forEach((n) => { actionStubs[n] = function () { throw new Error('unused stub: ' + n); }; });

  let actionListOrdersBehavior;
  // secretMatches_ is a REAL function declared inside Router.gs itself (not
  // stubbable — a stub of the same name here would just be overwritten when
  // Router.gs's own hoisted `function secretMatches_() {...}` runs in this
  // same sandbox), so the request below must carry the real matching secret
  // via PropertiesService instead of trying to override the function.
  const props = { SHARED_SECRET: 'test-shared-secret' };
  const sandbox = Object.assign({
    console: { log: console.log, error: () => {} },
    ContentService: {
      createTextOutput: (text) => ({
        setMimeType: () => ({ getContent: () => text, __text: text })
      }),
      MimeType: { JSON: 'JSON', TEXT: 'TEXT' }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null)
      })
    },
    CacheService: { getScriptCache: () => null },
    logSecurityEvent_: () => {},
    securityGate_: () => ({ ok: true, state: 'active' }),
    loadUser_: () => ({ email: 'nhanvien@x.com', permissions: {} }),
    hasPermission_: () => false,
    actionListOrders_: (user, payload) => actionListOrdersBehavior(user, payload),
    // Milestone 6 / Phase 3 — Router.gs's catch now also calls
    // logDevEvent_ (Security.gs, not loaded in this minimal routing-shell
    // sandbox) on the unexpected-error branch; stubbed here the same way
    // every other apps/api dependency Router.gs doesn't itself define is.
    logDevEvent_: () => true
  }, actionStubs);
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(configSrc, sandbox, { filename: 'Config.gs' });
  vm.runInContext(routerSrc, sandbox, { filename: 'Router.gs' });

  function doPostWith(actorBehavior) {
    actionListOrdersBehavior = actorBehavior;
    const e = { postData: { contents: JSON.stringify({ secret: props.SHARED_SECRET, actor: 'a@x.com', action: 'listOrders', payload: {} }) } };
    const out = sandbox.doPost(e);
    return JSON.parse(out.__text);
  }

  let res = doPostWith(() => { throw new Error('Range "Orders!A2:Z500" not found (sheetId 987654321).'); });
  ok('a raw internal exception never reaches the JSON response verbatim',
     res.ok === false && res.error === sandbox.MSG.GENERIC, JSON.stringify(res));

  res = doPostWith(() => { throw new Error(sandbox.MSG.NO_PERMISSION); });
  ok('an existing MSG.*-throwing validation still reaches the client unchanged',
     res.ok === false && res.error === sandbox.MSG.NO_PERMISSION, JSON.stringify(res));

  res = doPostWith(() => ({ ok: 'fine' }));
  ok('the success path is unaffected (still { ok: true, data })',
     res.ok === true && res.data && res.data.ok === 'fine', JSON.stringify(res));
})();

/* =======================================================================
   Section 3 — apps/api/ExportJob.gs — job.error / job.deliveryError
   ======================================================================= */
(function () {
  console.log('\napps/api ExportJob.gs job.error / job.deliveryError');

  const configSrc = fs.readFileSync(API_ROOT + 'Config.gs', 'utf8');
  const exportJobSrc = fs.readFileSync(API_ROOT + 'ExportJob.gs', 'utf8');

  const props = {};
  let exportBucketsBehavior, fetchExportBase64Behavior;
  const sandbox = {
    console: { log: console.log, error: () => {} },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = v; },
        deleteProperty: (k) => { delete props[k]; }
      })
    },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger: () => {} },
    // Only what resumeExportJob_ needs before it would reach the (unstubbed)
    // Sheets-writing pipeline — exportBucketsForRequest_ throws first in
    // every scenario below, so buildExportRows_/buildExportGrid_/
    // SpreadsheetApp/runExportJobWork_ are never actually reached.
    exportBucketsForRequest_: (user, payload) => exportBucketsBehavior(user, payload),
    buildExportRows_: () => { throw new Error('unused in this test'); },
    buildExportGrid_: () => { throw new Error('unused in this test'); },
    SpreadsheetApp: { openById: () => { throw new Error('unused in this test'); } },
    // deliverExportJob_'s dependencies — fetchSpreadsheetExportBase64_ throws
    // first in every scenario below, so exportsFolder_/emailExportDelivery_/
    // DriveApp/Utilities are never actually reached either.
    fetchSpreadsheetExportBase64_: (...args) => fetchExportBase64Behavior(...args),
    exportsFolder_: () => { throw new Error('unused in this test'); },
    emailExportDelivery_: () => { throw new Error('unused in this test'); },
    Utilities: { newBlob: () => { throw new Error('unused in this test'); }, base64Decode: () => [] }
  };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(configSrc, sandbox, { filename: 'Config.gs' });
  vm.runInContext(exportJobSrc, sandbox, { filename: 'ExportJob.gs' });

  function freshJob(jobId) {
    const job = { jobId: jobId, status: 'running', rowsWritten: 0, totalRows: 10,
                  format: 'xlsx', error: null, deliveryUrl: null, deliveryError: null,
                  user: { email: 'nhanvien@x.com' }, payload: {} };
    sandbox.saveExportJob_(job);
    return job;
  }

  // --- resumeExportJob_: a raw exception must not leak into job.error -----
  let job = freshJob('job-raw');
  props.EXPORTJOB_PENDING_RESUME = 'job-raw';
  exportBucketsBehavior = () => { throw new Error('Formula parse error in cell R45C3: =VLOOKUP(...)'); };
  sandbox.resumeExportJob_({});
  let saved = sandbox.loadExportJob_('job-raw');
  ok('resumeExportJob_: a raw internal exception never leaks into job.error',
     saved.status === 'error' && saved.error === sandbox.MSG.GENERIC, JSON.stringify(saved));

  // --- resumeExportJob_: an existing MSG.*-throwing case passes through ---
  job = freshJob('job-known');
  props.EXPORTJOB_PENDING_RESUME = 'job-known';
  exportBucketsBehavior = () => { throw new Error(sandbox.MSG.EXPORTJOB_BAD_FORMAT); };
  sandbox.resumeExportJob_({});
  saved = sandbox.loadExportJob_('job-known');
  ok('resumeExportJob_: an existing MSG.* error still reaches job.error unchanged',
     saved.status === 'error' && saved.error === sandbox.MSG.EXPORTJOB_BAD_FORMAT, JSON.stringify(saved));

  // --- deliverExportJob_: a raw exception must not leak into deliveryError
  job = freshJob('job-delivery-raw');
  job.status = 'done';
  fetchExportBase64Behavior = () => { throw new Error('Drive file 1AbCDeFGhijKLmnOP quota exceeded.'); };
  sandbox.deliverExportJob_(job);
  ok('deliverExportJob_: a raw internal exception never leaks into job.deliveryError',
     job.deliveryError === sandbox.MSG.GENERIC, JSON.stringify(job));

  // --- deliverExportJob_: an existing MSG.*-throwing case passes through --
  job = freshJob('job-delivery-known');
  job.status = 'done';
  fetchExportBase64Behavior = () => { throw new Error(sandbox.MSG.NOT_CONFIGURED); };
  sandbox.deliverExportJob_(job);
  ok('deliverExportJob_: an existing MSG.* error still reaches job.deliveryError unchanged',
     job.deliveryError === sandbox.MSG.NOT_CONFIGURED, JSON.stringify(job));

  // --- actionExportJobStatus_ surfaces whatever job.error/deliveryError
  //     already holds verbatim — unchanged behavior, still safe because the
  //     values above are now guaranteed sanitized at assignment time ------
  saved = sandbox.loadExportJob_('job-raw');
  sandbox.saveExportJob_(Object.assign(saved, { user: { email: 'nhanvien@x.com' } }));
  const status = sandbox.actionExportJobStatus_({ email: 'nhanvien@x.com' }, { jobId: 'job-raw' });
  ok('actionExportJobStatus_ surfaces the already-sanitized job.error (MSG.GENERIC), not raw text',
     status.error === sandbox.MSG.GENERIC, JSON.stringify(status));
})();

/* =======================================================================
   Section 4 — apps/web/Main.gs:27 — handle_()'s catch
   ======================================================================= */
(function () {
  console.log('\napps/web Main.gs handle_() catch');

  const configSrc = fs.readFileSync(WEB_ROOT + 'Config.gs', 'utf8');
  const mainSrc = fs.readFileSync(WEB_ROOT + 'Main.gs', 'utf8');

  const sandbox = {
    console: { log: console.log, error: () => {} },
    HtmlService: { createTemplateFromFile: () => ({}) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) }
  };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(configSrc, sandbox, { filename: 'Config.gs' });
  vm.runInContext(mainSrc, sandbox, { filename: 'Main.gs' });

  let result = sandbox.handle_('test', () => { throw new Error('Exception: Service Spreadsheets failed while accessing document 1A2b3C.'); });
  ok('handle_(): a raw internal exception never reaches the browser verbatim',
     result.ok === false && result.error === sandbox.MSG.GENERIC, JSON.stringify(result));

  result = sandbox.handle_('test', () => { throw new Error(sandbox.MSG.NOT_CONFIGURED); });
  ok('handle_(): an existing MSG.* error still reaches the browser unchanged',
     result.ok === false && result.error === sandbox.MSG.NOT_CONFIGURED, JSON.stringify(result));

  result = sandbox.handle_('test', () => 42);
  ok('handle_(): the success path is unaffected', result.ok === true && result.data === 42);
})();

/* =======================================================================
   Section 5 — apps/api/SheetsRepo.gs:67 — getSpreadsheet_'s unmatched
   rethrow degrades safely once it reaches the (fixed) top-level catch.
   ======================================================================= */
(function () {
  console.log('\napps/api SheetsRepo.gs getSpreadsheet_ rethrow (safety net = Router.gs\'s catch)');

  const configSrc = fs.readFileSync(API_ROOT + 'Config.gs', 'utf8');
  const repoSrc = fs.readFileSync(API_ROOT + 'SheetsRepo.gs', 'utf8');

  let openByIdBehavior;
  const props = { SPREADSHEET_ID: 'ss-id' };
  const sandbox = {
    console: { log: console.log, error: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null) }) },
    SpreadsheetApp: { openById: (id) => openByIdBehavior(id) }
  };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(configSrc, sandbox, { filename: 'Config.gs' });
  vm.runInContext(repoSrc, sandbox, { filename: 'SheetsRepo.gs' });

  // --- unmatched case (no "permission"/"not have access"/"không có quyền")
  //     is rethrown UNCHANGED, not sanitized here ---------------------------
  sandbox._ssMemo = null;
  const rawDriveErr = new Error('Exception: Document 1AbCDeFGhijKLmnOPqrsTUv is locked for editing.');
  openByIdBehavior = () => { throw rawDriveErr; };
  let threw = null;
  try { sandbox.getSpreadsheet_(); } catch (err) { threw = err; }
  ok('getSpreadsheet_ rethrows an unmatched error UNCHANGED (same object, same message)',
     threw === rawDriveErr, threw && threw.message);
  // Prove the safety net: feeding that SAME rethrown error into apps/api's
  // own safeErrorMessage_ (as Router.gs's doPost catch now does) degrades it
  // to MSG.GENERIC — i.e. this rethrow no longer produces a raw-detail leak
  // downstream, even though SheetsRepo.gs itself never sanitizes it.
  ok('...but the eventual top-level catch (safeErrorMessage_) degrades it to MSG.GENERIC',
     sandbox.safeErrorMessage_(threw) === sandbox.MSG.GENERIC);

  // --- matched permission-error case is unchanged: already-specific,
  //     already-safe MSG.DEPLOY_MISCONFIGURED, not routed through the
  //     generic check at all --------------------------------------------
  sandbox._ssMemo = null;
  openByIdBehavior = () => { throw new Error('Exception: You do not have permission to access this spreadsheet.'); };
  threw = null;
  try { sandbox.getSpreadsheet_(); } catch (err) { threw = err; }
  ok('a matched permission error still throws the specific MSG.DEPLOY_MISCONFIGURED, unchanged',
     threw && threw.message === sandbox.MSG.DEPLOY_MISCONFIGURED, threw && threw.message);
})();

/* =======================================================================
   Section 6 — apps/web/ApiClient.gs:133 — { ok:false } pass-through.
   No functional change (safe by construction once Router.gs is fixed —
   this project only knows its OWN small MSG vocabulary, not apps/api's ~85
   values, so it must NOT run body.error through its own isKnownMessage_).
   This section is a regression guard confirming that pass-through behavior
   is unchanged.
   ======================================================================= */
(function () {
  console.log('\napps/web ApiClient.gs body.error pass-through (regression guard, no logic change)');

  const configSrc = fs.readFileSync(WEB_ROOT + 'Config.gs', 'utf8');
  const clientSrc = fs.readFileSync(WEB_ROOT + 'ApiClient.gs', 'utf8');

  let fetchBehavior;
  const sandbox = {
    console: { log: console.log, error: () => {} },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k === 'API_URL' ? 'https://fake-api/exec' : k === 'SHARED_SECRET' ? 'shh' : null)
      })
    },
    UrlFetchApp: { fetch: (url, opts) => fetchBehavior(url, opts) },
    Utilities: { sleep: () => {} },
    resolveActiveEmail_: () => 'nhanvien@x.com',
    isDevMode_: () => false
  };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(configSrc, sandbox, { filename: 'Config.gs' });
  vm.runInContext(clientSrc, sandbox, { filename: 'ApiClient.gs' });

  function makeResponse(code, text) {
    return { getResponseCode: () => code, getContentText: () => text, getAllHeaders: () => ({}) };
  }

  // An apps/api MSG.* value the web project's own (smaller) MSG set does
  // NOT contain — proves ApiClient.gs does not (and must not) filter it
  // through its own isKnownMessage_.
  const apiOnlyMessage = 'Bạn không có quyền thực hiện thao tác này.'; // apps/api MSG.NO_PERMISSION
  fetchBehavior = () => makeResponse(200, JSON.stringify({ ok: false, error: apiOnlyMessage, build: 'api-test' }));
  let threw = null;
  try { sandbox.apiCall_('deleteOrder', {}); } catch (err) { threw = err; }
  ok('a legitimate apps/api business message (not in apps/web\'s own MSG set) still passes through unchanged',
     threw && threw.message === apiOnlyMessage, threw && threw.message);

  fetchBehavior = () => makeResponse(200, JSON.stringify({ ok: false, error: '', build: 'api-test' }));
  threw = null;
  try { sandbox.apiCall_('deleteOrder', {}); } catch (err) { threw = err; }
  ok('a missing/falsy body.error still falls back to this project\'s own MSG.GENERIC',
     threw && threw.message === sandbox.MSG.GENERIC, threw && threw.message);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
