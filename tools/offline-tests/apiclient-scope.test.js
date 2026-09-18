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
    Utilities: { sleep: (ms) => { sleepCalls++; }, getUuid: () => 'test-uuid-' + Math.random() },
    resolveActiveEmail_: () => 'nhanvien@x.com',
    isDevMode_: () => false
    // devNote_ is deliberately NOT stubbed here — ApiClient.gs defines its
    // own real devNote_ (it would overwrite a stub anyway, since vm loads
    // the real file into this same sandbox). 2026-09-14 (plan 260912-1110
    // Phase 4): devNote_ no longer gates on isDevMode_ — it now ALWAYS
    // attempts a DevLog write on every final failure, using the same
    // fetchBehavior/UrlFetchApp mock as the main call. So every assertion
    // below that counts fetchCalls on a path that reaches a final throw
    // must include devNote_'s one extra attempt (it never retries itself).
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
  ok('called UrlFetchApp.fetch exactly TWICE — once for the doomed API call ' +
     '(a missing grant does not appear mid-retry, so retrying it would only ' +
     'waste 400ms) plus once for devNote_\'s own DevLog write attempt',
     fetchCalls === 2, 'fetchCalls=' + fetchCalls);
  ok('did NOT sleep before a doomed retry (no Utilities.sleep call — ' +
     'devNote_ does not sleep either)',
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
  ok('still calls UrlFetchApp.fetch three times: the existing L3 retry ' +
     '(2 attempts, unchanged) plus one for devNote_\'s DevLog write on ' +
     'final failure',
     fetchCalls === 3, 'fetchCalls=' + fetchCalls);
  ok('still sleeps once between the two main attempts (devNote_ never sleeps)',
     sleepCalls === 1, 'sleepCalls=' + sleepCalls);
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

/* =======================================================================
   Section 3 — plan 260912-1110: 3xx bounded retry + header/timing logging
   ======================================================================= */
(function () {
  console.log('\napiCall_ 3xx retry hardening + diagnostics (plan 260912-1110)');

  const configSrc = fs.readFileSync(ROOT + 'Config.gs', 'utf8');
  const clientSrc = fs.readFileSync(ROOT + 'ApiClient.gs', 'utf8');

  // Fake, controllable clock: fetchBehavior advances `fakeClock` before
  // returning, so "how long did this attempt take" is deterministic instead
  // of wall-clock-dependent (plan.md Phase 2, Implementation Step 3).
  let fetchCalls, fetchBehavior, sleepCalls, fakeClock, errorLogs;
  const sandbox = {
    console: {
      log: console.log,
      error: (msg) => { errorLogs.push(String(msg)); }
    },
    Date: { now: () => fakeClock },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k === 'API_URL' ? 'https://fake-api/exec'
          : k === 'SHARED_SECRET' ? 'shh' : null)
      })
    },
    UrlFetchApp: { fetch: (url, opts) => { fetchCalls++; return fetchBehavior(url, opts); } },
    Utilities: { sleep: (ms) => { sleepCalls++; }, getUuid: () => 'test-uuid-' + Math.random() },
    resolveActiveEmail_: () => 'nhanvien@x.com',
    isDevMode_: () => false
  };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(configSrc, sandbox, { filename: 'Config.gs' });
  vm.runInContext(clientSrc, sandbox, { filename: 'ApiClient.gs' });

  function makeResponse(code, text, headers) {
    return {
      getResponseCode: () => code,
      getContentText: () => text,
      getAllHeaders: () => headers
    };
  }

  // --- Scenario A: fast 302 then fast 200 → transparent retry, no throw ---
  fetchCalls = 0; sleepCalls = 0; errorLogs = []; fakeClock = 0;
  let call = 0;
  fetchBehavior = () => {
    call++;
    fakeClock += 50; // fast blip
    if (call === 1) return makeResponse(302, 'Redirecting', { Location: 'https://fake-api/exec?x=1' });
    return makeResponse(200, JSON.stringify({ ok: true, data: {} }), {});
  };
  let threw = null, result;
  try { result = sandbox.apiCall_('apiListProducts', {}); } catch (err) { threw = err; }
  ok('Scenario A: no throw — fast 302-then-200 succeeds transparently',
     threw === null, threw && threw.message);
  ok('Scenario A: UrlFetchApp.fetch called exactly twice', fetchCalls === 2, 'fetchCalls=' + fetchCalls);
  ok('Scenario A: slept exactly once between attempts', sleepCalls === 1, 'sleepCalls=' + sleepCalls);

  // --- Scenario B: slow 302 on both attempts → still throws, but logs carry
  //     Location + elapsed-ms for BOTH attempts (no regression, better data) --
  fetchCalls = 0; sleepCalls = 0; errorLogs = []; fakeClock = 0; call = 0;
  fetchBehavior = () => {
    call++;
    fakeClock += 12000; // slow execution, not a fast blip
    return makeResponse(302, 'Redirecting', { Location: 'https://fake-api/exec?slow=1' });
  };
  threw = null;
  try { sandbox.apiCall_('apiListProducts', {}); } catch (err) { threw = err; }
  ok('Scenario B: still throws MSG.API_UNREACHABLE (no worse than before this phase)',
     threw && threw.message.indexOf(sandbox.MSG.API_UNREACHABLE) === 0,
     threw && threw.message);
  ok('Scenario B: fetched exactly THREE times: the 2 bounded retry attempts ' +
     '(not raised) plus one for devNote_\'s DevLog write on final failure',
     fetchCalls === 3, 'fetchCalls=' + fetchCalls);
  const headerLogs = errorLogs.filter((l) => l.indexOf('headers=') !== -1);
  ok('Scenario B: exactly two header/timing log lines (one per attempt)',
     headerLogs.length === 2, 'headerLogs.length=' + headerLogs.length);
  ok('Scenario B: both attempt logs contain the Location header value',
     headerLogs.every((l) => l.indexOf('fake-api/exec?slow=1') !== -1),
     JSON.stringify(headerLogs));
  ok('Scenario B: both attempt logs carry an elapsed-ms value >= 12000',
     headerLogs.every((l) => {
       const m = /,\s*(\d+)ms\)/.exec(l);
       return m && Number(m[1]) >= 12000;
     }),
     JSON.stringify(headerLogs));

  // --- Scenario C (Phase 4): bare 404 is retried the same bounded way ------
  // Live-captured 2026-09-14: a real apiListPermissionPresets call got HTTP
  // 404 with `Server: ESF` (Google's edge, not apps/api) after a 26.7s-slow
  // attempt — apps/api's own doPost/ContentService can only ever answer 200
  // when script code runs, so a 404 from this URL can only come from
  // Google's front controller, same class as the already-retried 3xx/5xx.
  fetchCalls = 0; sleepCalls = 0; errorLogs = []; fakeClock = 0; call = 0;
  fetchBehavior = () => {
    call++;
    fakeClock += 50;
    if (call === 1) return makeResponse(404, 'Not Found (edge)', {});
    return makeResponse(200, JSON.stringify({ ok: true, data: {} }), {});
  };
  threw = null;
  try { result = sandbox.apiCall_('apiListProducts', {}); } catch (err) { threw = err; }
  ok('Scenario C: no throw — 404-then-200 succeeds transparently, same as a 3xx blip',
     threw === null, threw && threw.message);
  ok('Scenario C: UrlFetchApp.fetch called exactly twice', fetchCalls === 2, 'fetchCalls=' + fetchCalls);
  ok('Scenario C: slept exactly once between attempts', sleepCalls === 1, 'sleepCalls=' + sleepCalls);

  // --- Regression guard: an OTHER 4xx (no evidence it's edge-level) is
  //     still never retried — only 404 was added to the retryable set -----
  fetchCalls = 0; sleepCalls = 0; errorLogs = []; fakeClock = 0;
  fetchBehavior = () => { fakeClock += 30; return makeResponse(403, 'Forbidden', {}); };
  threw = null;
  try { sandbox.apiCall_('apiListProducts', {}); } catch (err) { threw = err; }
  ok('Regression guard: 403 still throws MSG.API_UNREACHABLE',
     threw && threw.message.indexOf(sandbox.MSG.API_UNREACHABLE) === 0);
  ok('Regression guard: 403 is fetched exactly once by apiCall_ plus once ' +
     'for devNote_\'s DevLog write — never retried by apiCall_ itself',
     fetchCalls === 2, 'fetchCalls=' + fetchCalls);
  ok('Regression guard: no sleep on a non-retryable 4xx', sleepCalls === 0, 'sleepCalls=' + sleepCalls);

  // --- Fetch-throw path also carries elapsed-ms (Phase 1 requirement) ----
  fetchCalls = 0; sleepCalls = 0; errorLogs = []; fakeClock = 0;
  fetchBehavior = () => { fakeClock += 200; throw new Error('Exception: DNS error'); };
  threw = null;
  try { sandbox.apiCall_('apiListProducts', {}); } catch (err) { threw = err; }
  const throwLogs = errorLogs.filter((l) => l.indexOf('fetch failed') !== -1);
  ok('Fetch-throw path: at least one log line carries a numeric elapsed-ms',
     throwLogs.some((l) => /,\s*\d+ms\):/.test(l)),
     JSON.stringify(throwLogs));
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
