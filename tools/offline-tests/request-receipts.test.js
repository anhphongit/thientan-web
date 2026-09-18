/**
 * Offline tests for Milestone 7 / Phase 0 (260917-1210) — live burst
 * instrumentation. Two independent surfaces:
 *   1. Router.gs's recordRequestReceipt_ / doPost call site — a minimal
 *      routing-shell sandbox (same construction as
 *      error-message-safety.test.js Section 2), with a REAL in-memory fake
 *      CacheService this time (that file's sandbox uses `null` — this
 *      feature needs a working get/put/remove to assert against).
 *   2. SystemHealth.gs's actionGetRequestReceipts_ — via the shared harness
 *      (harness.js), with CacheService swapped for the same in-memory fake
 *      after load (vm globals resolve dynamically, so this is safe without
 *      touching the shared harness for every other test file).
 */
const fs = require('fs'), vm = require('vm');
const H = require('./harness.js');
const API_ROOT = __dirname + '/../../apps/api/';

// Single shared pass/fail counter (harness.js's H.check), used by both
// sections below, so one H.done() call at the end reports and exits
// correctly for the whole file.
const ok = H.check;

function makeFakeCache() {
  const store = {};
  return {
    store,
    get: (k) => (k in store ? store[k] : null),
    put: (k, v) => { store[k] = v; },
    remove: (k) => { delete store[k]; }
  };
}

/* =======================================================================
   Section 1 — Router.gs: recordRequestReceipt_ / doPost call site
   ======================================================================= */
(function () {
  console.log('\napps/api Router.gs recordRequestReceipt_ / doPost call site');

  const configSrc = fs.readFileSync(API_ROOT + 'Config.gs', 'utf8');
  const routerSrc = fs.readFileSync(API_ROOT + 'Router.gs', 'utf8');

  // Same derive-from-source stub technique as error-message-safety.test.js
  // Section 2 — every action*_ referenced by getActions_() needs a harmless
  // stub except the one this test controls and actionGetSession_ (Router.gs
  // declares that one for real, inline).
  const actionNames = Array.from(new Set(routerSrc.match(/\baction[A-Za-z]+_\b/g) || []))
    .filter((n) => n !== 'actionGetSession_' && n !== 'actionListOrders_');
  const actionStubs = {};
  actionNames.forEach((n) => { actionStubs[n] = function () { throw new Error('unused stub: ' + n); }; });

  let actionListOrdersBehavior = () => ({ ok: 'fine' });
  let fakeCache = makeFakeCache();
  const props = { SHARED_SECRET: 'test-shared-secret' };
  const sandbox = Object.assign({
    // Extension (260918) added unconditional console.log start/completion
    // lines to doPost — silenced here (no test asserts on them) so the
    // 500-request burst assertion below doesn't flood this file's output.
    console: { log: () => {}, error: () => {} },
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
    CacheService: { getScriptCache: () => fakeCache },
    logSecurityEvent_: () => {},
    securityGate_: () => ({ ok: true, state: 'active' }),
    loadUser_: () => ({ email: 'nhanvien@x.com', permissions: {} }),
    hasPermission_: () => false,
    actionListOrders_: (user, payload) => actionListOrdersBehavior(user, payload),
    logDevEvent_: () => true
  }, actionStubs);
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(configSrc, sandbox, { filename: 'Config.gs' });
  vm.runInContext(routerSrc, sandbox, { filename: 'Router.gs' });

  function post(action, reqId) {
    const body = { secret: props.SHARED_SECRET, actor: 'a@x.com', action: action, payload: {} };
    if (reqId !== undefined) body.reqId = reqId;
    const e = { postData: { contents: JSON.stringify(body) } };
    const out = sandbox.doPost(e);
    return JSON.parse(out.__text);
  }
  function receipts() {
    return JSON.parse(fakeCache.get(sandbox.CACHE.REQUEST_RECEIPTS_KEY) || '[]');
  }

  // --- a normal successful request gets a receipt recorded -----------------
  fakeCache = makeFakeCache();
  sandbox.CacheService = { getScriptCache: () => fakeCache };
  let res = post('listOrders');
  ok('a successful request still returns normally', res.ok === true, JSON.stringify(res));
  ok('the request is recorded with the right action name',
     receipts().length === 1 && receipts()[0].action === 'listOrders', JSON.stringify(receipts()));
  ok('the recorded receipt carries a numeric timestamp', typeof receipts()[0].t === 'number');

  // --- Extension (260918) — reqId correlation --------------------------
  // two logical calls fired within the same tick get distinct reqIds
  // recorded, one per receipt, in order.
  fakeCache = makeFakeCache();
  sandbox.CacheService = { getScriptCache: () => fakeCache };
  post('listOrders', 'reqid-aaa');
  post('listOrders', 'reqid-bbb');
  ok('two receipts recorded in the same tick get distinct reqIds',
     receipts().length === 2 && receipts()[0].reqId === 'reqid-aaa' &&
     receipts()[1].reqId === 'reqid-bbb', JSON.stringify(receipts()));

  // an oversized/malicious reqId is truncated to 40 chars, same untrusted-
  // input treatment as `action`.
  fakeCache = makeFakeCache();
  sandbox.CacheService = { getScriptCache: () => fakeCache };
  const oversized = 'x'.repeat(200);
  post('listOrders', oversized);
  ok('an oversized reqId is truncated to 40 chars',
     receipts()[0].reqId === oversized.substring(0, 40), receipts()[0].reqId);

  // a legacy/reqId-less request still records a receipt (backward compat) —
  // no hard dependency on the new field.
  fakeCache = makeFakeCache();
  sandbox.CacheService = { getScriptCache: () => fakeCache };
  res = post('listOrders');
  ok('a reqId-less (legacy) request still returns normally', res.ok === true, JSON.stringify(res));
  ok('...and still records a receipt, with an empty reqId rather than throwing',
     receipts().length === 1 && receipts()[0].reqId === '', JSON.stringify(receipts()));

  // --- a request rejected by our own security gate is STILL recorded -------
  fakeCache = makeFakeCache();
  sandbox.CacheService = { getScriptCache: () => fakeCache };
  sandbox.securityGate_ = () => ({ ok: false, state: 'locked', adminMessage: 'locked' });
  res = post('listOrders');
  ok('a request rejected by the security gate still comes back rejected',
     res.ok === false, JSON.stringify(res));
  ok('...but a receipt was still recorded for it (proves the instrument sits ahead of that guard)',
     receipts().length === 1 && receipts()[0].action === 'listOrders', JSON.stringify(receipts()));
  sandbox.securityGate_ = () => ({ ok: true, state: 'active' });

  // --- a request rejected by the shared-secret check is ALSO recorded ------
  fakeCache = makeFakeCache();
  sandbox.CacheService = { getScriptCache: () => fakeCache };
  const badSecretE = { postData: { contents: JSON.stringify({ secret: 'wrong', actor: 'a@x.com', action: 'listOrders', payload: {} }) } };
  res = JSON.parse(sandbox.doPost(badSecretE).__text);
  ok('a bad-secret request is rejected', res.ok === false, JSON.stringify(res));
  ok('...but a receipt was still recorded for it (reached script code, just failed our own guard)',
     receipts().length === 1 && receipts()[0].action === 'listOrders', JSON.stringify(receipts()));

  // --- a forced cache-write exception never changes doPost's response ------
  fakeCache = makeFakeCache();
  fakeCache.put = () => { throw new Error('CacheService: quota exceeded'); };
  sandbox.CacheService = { getScriptCache: () => fakeCache };
  res = post('listOrders');
  ok('a cache-write failure does not change doPost\'s response for that request',
     res.ok === true && res.data && res.data.ok === 'fine', JSON.stringify(res));

  // --- a missing/unavailable cache degrades silently, never throws ---------
  sandbox.CacheService = { getScriptCache: () => null };
  res = post('listOrders');
  ok('an unavailable CacheService (getScriptCache() -> null) never breaks the request',
     res.ok === true, JSON.stringify(res));

  // --- capped at REQUEST_RECEIPTS_MAX entries, oldest dropped first --------
  fakeCache = makeFakeCache();
  sandbox.CacheService = { getScriptCache: () => fakeCache };
  for (let i = 0; i < 500; i++) {
    const e = { postData: { contents: JSON.stringify({ secret: props.SHARED_SECRET, actor: 'a@x.com', action: 'listOrders' + i, payload: {} }) } };
    sandbox.doPost(e);
  }
  const capped = receipts();
  ok('a 500-request burst caps the cached array at REQUEST_RECEIPTS_MAX (200) entries',
     capped.length === sandbox.CACHE.REQUEST_RECEIPTS_MAX, 'got length ' + capped.length);
  ok('the oldest entries are dropped, not the newest — first surviving entry is #300',
     capped[0].action === 'listOrders300', 'got: ' + capped[0].action);
  ok('...and the most recent entry (#499) is still present, last in the array',
     capped[capped.length - 1].action === 'listOrders499', 'got: ' + capped[capped.length - 1].action);
})();

/* =======================================================================
   Section 2 — SystemHealth.gs: actionGetRequestReceipts_
   ======================================================================= */
console.log('\nactionGetRequestReceipts_ — permission gate + cache read');
(function () {
  const env = H.makeEnv();
  const admin = H.user('admin@x.com', { manage_users: true });
  const employee = H.user('nhanvien@x.com', { manage_users: false });
  const fakeCache = makeFakeCache();
  env.CacheService = { getScriptCache: () => fakeCache };

  H.throws('a non-admin cannot call getRequestReceipts',
    () => env.actionGetRequestReceipts_(employee),
    env.MSG.NO_PERMISSION);

  H.eq('with nothing recorded yet, an admin gets back an empty array',
    env.actionGetRequestReceipts_(admin), []);

  fakeCache.put(env.CACHE.REQUEST_RECEIPTS_KEY, JSON.stringify([
    { t: 1000, action: 'getSession' },
    { t: 1001, action: 'listOrders' }
  ]));
  H.eq('an admin reads back exactly what recordRequestReceipt_ (Router.gs) would have written',
    env.actionGetRequestReceipts_(admin),
    [{ t: 1000, action: 'getSession' }, { t: 1001, action: 'listOrders' }]);
})();

/* =======================================================================
   Section 2b — SystemHealth.gs: actionClearRequestReceipts_ (2026-09-18)
   ======================================================================= */
console.log('\nactionClearRequestReceipts_ — permission gate + actually clears');
(function () {
  const env = H.makeEnv();
  const admin = H.user('admin@x.com', { manage_users: true });
  const employee = H.user('nhanvien@x.com', { manage_users: false });
  const fakeCache = makeFakeCache();
  env.CacheService = { getScriptCache: () => fakeCache };
  fakeCache.put(env.CACHE.REQUEST_RECEIPTS_KEY, JSON.stringify([{ t: 1, action: 'x' }]));

  H.throws('a non-admin cannot call clearRequestReceipts',
    () => env.actionClearRequestReceipts_(employee),
    env.MSG.NO_PERMISSION);
  ok('...and the cache is untouched by the rejected attempt',
    fakeCache.get(env.CACHE.REQUEST_RECEIPTS_KEY) !== null);

  H.eq('an admin clearing gets back {cleared: true}',
    env.actionClearRequestReceipts_(admin), { cleared: true });
  ok('...and the cache entry is actually gone',
    fakeCache.get(env.CACHE.REQUEST_RECEIPTS_KEY) === null);

  H.eq('a subsequent read comes back empty, proving the reset took effect',
    env.actionGetRequestReceipts_(admin), []);

  // --- defensive: an unavailable cache or a throwing remove() never throws ---
  env.CacheService = { getScriptCache: () => null };
  H.eq('an unavailable CacheService still returns {cleared: true}, no throw',
    env.actionClearRequestReceipts_(admin), { cleared: true });

  env.CacheService = { getScriptCache: () => ({ remove: () => { throw new Error('boom'); } }) };
  let threw = null;
  try { env.actionClearRequestReceipts_(admin); } catch (err) { threw = err; }
  ok('a throwing cache.remove() is caught, not surfaced to the caller', threw === null, threw && threw.message);
})();

console.log('\nactionGetRequestReceipts_ — defensive degradation, never throws on bad state');
(function () {
  const env = H.makeEnv();
  const admin = H.user('admin@x.com', { manage_users: true });

  // --- unavailable cache (getScriptCache() -> null) -------------------------
  env.CacheService = { getScriptCache: () => null };
  H.eq('an unavailable CacheService degrades to []', env.actionGetRequestReceipts_(admin), []);

  // --- unparseable cached value ----------------------------------------------
  const fakeCache = makeFakeCache();
  env.CacheService = { getScriptCache: () => fakeCache };
  fakeCache.store[env.CACHE.REQUEST_RECEIPTS_KEY] = 'not json';
  H.eq('an unparseable cached value degrades to [], not a thrown error',
    env.actionGetRequestReceipts_(admin), []);

  // --- cached value that parses but isn't an array ---------------------------
  fakeCache.store[env.CACHE.REQUEST_RECEIPTS_KEY] = JSON.stringify({ not: 'an array' });
  H.eq('a non-array cached value degrades to []', env.actionGetRequestReceipts_(admin), []);

  // --- a throwing cache.get() itself -----------------------------------------
  env.CacheService = { getScriptCache: () => ({ get: () => { throw new Error('boom'); } }) };
  let threw = null;
  try { env.actionGetRequestReceipts_(admin); } catch (err) { threw = err; }
  ok('a throwing cache.get() is caught, not surfaced to the caller', threw === null, threw && threw.message);
})();

H.done();
