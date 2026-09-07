/**
 * Offline test for the 2026-09-06 "scope_missing" hotfix — the first
 * offline coverage for apps/web/ApiClient.gs and apps/web/Main.gs's
 * apiGetSession(), which until now only had their behaviour exercised
 * manually by Phong (they touch Session/PropertiesService/UrlFetchApp,
 * services this project's harness.js does not stand in for).
 *
 * Scope is deliberately narrow: only the two pieces of logic this hotfix
 * actually added.
 *   1. isMissingAuthScopeError_ / apiCall_'s retry-skip (ApiClient.gs) —
 *      loaded for real, with a stub UrlFetchApp/PropertiesService/
 *      Utilities/resolveActiveEmail_/devNote_ dependency set.
 *   2. apiGetSession()'s reason classification (Main.gs) — loaded for
 *      real, with apiCall_ itself stubbed so this section tests ONLY the
 *      indexOf(MSG.SCOPE_NOT_GRANTED) branch, not the fetch layer above.
 *
 * Real bug this guards against: before the fix, ANY fetch failure —
 * including a permanent "you never granted this scope" exception — was
 * retried once (wasting 400ms + a doomed second call) and always surfaced
 * as the generic MSG.API_UNREACHABLE / reason:'denied', which pointed the
 * visitor at the three account-switch rows even though switching account
 * does not fix a missing OAuth grant.
 */
const fs = require('fs'), vm = require('vm');
const ROOT = __dirname + '/../../apps/web/';

let pass = 0, fail = 0;
const ok = (name, cond, detail) => cond ? (pass++, console.log('  ok   ' + name))
  : (fail++, console.log('  FAIL ' + name + (detail ? ' → ' + detail : '')));

/* =======================================================================
   Section 1 — ApiClient.gs: isMissingAuthScopeError_ + apiCall_ retry-skip
   ======================================================================= */
(function () {
  console.log('\napiCall_ / isMissingAuthScopeError_');

  const configSrc = fs.readFileSync(ROOT + 'Config.gs', 'utf8');
  const clientSrc = fs.readFileSync(ROOT + 'ApiClient.gs', 'utf8');

  let fetchCalls, fetchBehavior, sleepCalls;
  const sandbox = {
    console,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k === 'API_URL' ? 'https://fake-api/exec'
          : k === 'SHARED_SECRET' ? 'shh' : null)
      })
    },
    UrlFetchApp: { fetch: (url, opts) => { fetchCalls++; return fetchBehavior(url, opts); } },
    Utilities: { sleep: (ms) => { sleepCalls++; } },
    resolveActiveEmail_: () => 'nhanvien@x.com',
    isDevMode_: () => false
    // devNote_ is deliberately NOT stubbed here — ApiClient.gs defines its
    // own real devNote_ (it would overwrite a stub anyway, since vm loads
    // the real file into this same sandbox), and that real devNote_'s
    // very first line is `if (!isDevMode_()) return;`, so with isDevMode_
    // stubbed false above it correctly no-ops without needing
    // PropertiesService/UrlFetchApp for a devlog POST. Nothing in this
    // hotfix changed devNote_ itself, so it is out of scope here.
  };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(configSrc, sandbox, { filename: 'Config.gs' });
  vm.runInContext(clientSrc, sandbox, { filename: 'ApiClient.gs' });

  const PERMISSION_ERR = 'Exception: You do not have permission to call UrlFetchApp.fetch. ' +
    'Required permissions: https://www.googleapis.com/auth/script.external_request.';

  // --- isMissingAuthScopeError_ unit checks -----------------------------
  ok('matches the exact UrlFetchApp permission message',
     sandbox.isMissingAuthScopeError_(PERMISSION_ERR) === true);
  ok('matches the same class of error for a different restricted service ' +
     '(proves the match is general, not hardcoded to UrlFetchApp/external_request)',
     sandbox.isMissingAuthScopeError_(
       'Exception: You do not have permission to call MailApp.sendEmail. ' +
       'Required permissions: https://www.googleapis.com/auth/script.send_mail.') === true);
  ok('does NOT match a plain network failure',
     sandbox.isMissingAuthScopeError_('Exception: Address unavailable') === false);
  ok('does NOT match an empty/undefined message (no throw)',
     sandbox.isMissingAuthScopeError_(undefined) === false &&
     sandbox.isMissingAuthScopeError_('') === false);

  // --- apiCall_: permission error skips the retry and tags the message -
  fetchCalls = 0; sleepCalls = 0;
  fetchBehavior = () => { throw new Error(PERMISSION_ERR); };
  let threw = null;
  try { sandbox.apiCall_('getSession', {}); } catch (err) { threw = err; }
  ok('throws (does not silently succeed)', threw !== null);
  ok('message starts with MSG.SCOPE_NOT_GRANTED, not MSG.API_UNREACHABLE',
     threw && threw.message.indexOf(sandbox.MSG.SCOPE_NOT_GRANTED) === 0 &&
     threw.message.indexOf(sandbox.MSG.API_UNREACHABLE) !== 0,
     threw && threw.message);
  ok('called UrlFetchApp.fetch exactly ONCE — a missing grant does not ' +
     'appear mid-retry, so retrying only wastes 400ms on a doomed attempt',
     fetchCalls === 1, 'fetchCalls=' + fetchCalls);
  ok('did NOT sleep before a doomed retry (no Utilities.sleep call)',
     sleepCalls === 0, 'sleepCalls=' + sleepCalls);

  // --- control: an ordinary transient network failure is unaffected ----
  fetchCalls = 0; sleepCalls = 0;
  fetchBehavior = () => { throw new Error('Exception: DNS error resolving fake-api'); };
  threw = null;
  try { sandbox.apiCall_('getSession', {}); } catch (err) { threw = err; }
  ok('a genuine network failure still retries and ends up as API_UNREACHABLE ' +
     '(the hotfix must not swallow ordinary connectivity problems into the ' +
     'wrong bucket)',
     threw && threw.message.indexOf(sandbox.MSG.API_UNREACHABLE) === 0,
     threw && threw.message);
  ok('still calls UrlFetchApp.fetch twice (the existing L3 retry, unchanged)',
     fetchCalls === 2, 'fetchCalls=' + fetchCalls);
  ok('still sleeps once between the two attempts', sleepCalls === 1);
})();

/* =======================================================================
   Section 2 — Main.gs: apiGetSession()'s reason classification
   ======================================================================= */
(function () {
  console.log('\napiGetSession() reason classification');

  const configSrc = fs.readFileSync(ROOT + 'Config.gs', 'utf8');
  const mainSrc = fs.readFileSync(ROOT + 'Main.gs', 'utf8')
    // Main.gs is a mix of browser-facing api* functions and HtmlService
    // calls (doGet, include_) this test never invokes — vm.runInContext
    // still needs HtmlService to exist as *something* so the definitions
    // parse/evaluate; a stub object that is simply never called is enough.
    ;

  let apiCallBehavior;
  const sandbox = {
    console,
    HtmlService: { createTemplateFromFile: () => ({}) },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://fake-exec-url/exec' }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
    resolveActiveEmail_: () => 'nhanvien@x.com',
    collectDiagnostics_: () => ({}),
    apiCall_: (action, payload) => apiCallBehavior(action, payload),
    lastApiBuild_: ''
  };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(configSrc, sandbox, { filename: 'Config.gs' });
  vm.runInContext(mainSrc, sandbox, { filename: 'Main.gs' });

  apiCallBehavior = () => { throw new Error(sandbox.MSG.SCOPE_NOT_GRANTED + ' [DEV] fetch threw: ...'); };
  let result = sandbox.apiGetSession();
  ok('a SCOPE_NOT_GRANTED-prefixed error classifies as reason:"scope_missing"',
     result.ok === true && result.data.reason === 'scope_missing',
     JSON.stringify(result));
  ok('still surfaces the real message (for the denied-message line)',
     result.data.message.indexOf(sandbox.MSG.SCOPE_NOT_GRANTED) === 0);

  apiCallBehavior = () => { throw new Error(sandbox.MSG.API_UNREACHABLE + ' [DEV] fetch threw: ...'); };
  result = sandbox.apiGetSession();
  ok('an ordinary connectivity error still classifies as the generic reason:"denied" ' +
     '(so the account-switch options keep showing for every OTHER kind of failure)',
     result.ok === true && result.data.reason === 'denied',
     JSON.stringify(result));

  apiCallBehavior = () => { throw new Error('Không có quyền truy cập tính năng này.'); };
  result = sandbox.apiGetSession();
  ok('an unrelated API-side refusal (e.g. the security gate) is also reason:"denied", ' +
     'not accidentally matched as scope_missing',
     result.ok === true && result.data.reason === 'denied');
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
