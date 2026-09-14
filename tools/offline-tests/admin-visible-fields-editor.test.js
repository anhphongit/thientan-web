/**
 * Unit tests for AdminVisibleFields.html's own exported functions, run
 * directly against the module (no ViewsAdmin.html, no full admin form) —
 * same vm-sandbox load technique as admin-ui.test.js (see its lines 40-56,
 * 97-101), trimmed to just this one file plus a minimal window.TT.esc stub.
 *
 * Written for the 2026-09-14 master-toggle UX refinement:
 *   1) rendering fix — a field whose visibility comes from the MASTER
 *      toggle (`visible_fields === ['*']`), not just an explicit key match,
 *      must now render its checkbox CHECKED (previously rendered blank).
 *   2) real two-way sync between the master toggle and individual field
 *      checkboxes (cascadeFieldMaster_ / syncFieldMasterFromIndividuals_),
 *      replacing the old dim-only, one-way behavior.
 *
 * admin-ui.test.js's Group L comment used to claim these edge cases were
 * "covered by Phase 4's own unit tests in AdminVisibleFields.html" — no such
 * file actually existed until now; this file is that promise made real.
 *
 * Approach for cascade/sync coverage: visibleFieldsDisclosureHtml() returns
 * an HTML STRING, not real DOM nodes, so exercising cascadeFieldMaster_ /
 * syncFieldMasterFromIndividuals_ (which both call root.querySelector) needs
 * a fake `root`. Rather than a real HTML parser, we build a tiny Map-backed
 * stub keyed by element id, SEEDED once per test from the exact same
 * checked-computation the production render would have produced (mirrors
 * the real "checked = isLocked || masterChecked || explicit-match" rule at
 * setup time), then mutate/re-read that Map by calling the real exported
 * functions. This tests the real production logic, not a reimplementation
 * of it.
 */
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(__dirname + '/../../apps/web/ui/AdminVisibleFields.html', 'utf8')
  .replace(/^<script>/, '').replace(/<\/script>\s*$/, '');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => cond ? (pass++, console.log('  ok   ' + name))
  : (fail++, console.log('  FAIL ' + name + (detail ? ' -> ' + detail : '')));

const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const sandbox = { console, window: {} };
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'AdminVisibleFields.html' });
sandbox.window.TT = { esc: esc };

const M = sandbox.window.TTAdminVisibleFields;

/**
 * Fixture: 2 groups, ~2 normal fields + 1 alwaysVisible + 1 isMoney field
 * each — small but real, per the plan's requirement.
 */
function makeFieldGroups() {
  return [
    { label: 'Đơn hàng', fields: [
      { key: 'orderId', label: 'Mã đơn', alwaysVisible: true },
      { key: 'customer', label: 'Khách hàng' },
      { key: 'note', label: 'Ghi chú' }
    ] },
    { label: 'Tài chính', fields: [
      { key: 'invoiceId', label: 'Mã hoá đơn', alwaysVisible: true },
      { key: 'unitPrice', label: 'Đơn giá', isMoney: true },
      { key: 'total', label: 'Thành tiền', isMoney: true }
    ] }
  ];
}
// Every field across both groups that is NOT alwaysVisible.
const NON_LOCKED_KEYS = ['customer', 'note', 'unitPrice', 'total'];
const ALWAYS_VISIBLE_KEYS = ['orderId', 'invoiceId'];

/** Builds a fake root whose querySelector('#id') returns a mutable stub
 *  object per id, backed by a shared Map — seeded from `seed` ({id: bool}). */
function makeRoot(seed) {
  const store = new Map();
  Object.keys(seed).forEach(function (id) { store.set(id, { checked: !!seed[id] }); });
  return {
    querySelector: function (sel) {
      const id = String(sel).replace(/^#/, '');
      return store.has(id) ? store.get(id) : null;
    },
    _store: store
  };
}

/** Mirrors the production checked-computation once, to seed a fake root
 *  that matches what a real render would have produced for this base. */
function computeSeed(fieldGroups, base, opts) {
  opts = opts || {};
  const visibleFields = base.visible_fields || ['*'];
  const masterChecked = visibleFields.indexOf('*') >= 0;
  const seed = {};
  if (opts.includeMaster !== false) seed['f-field-all'] = masterChecked;
  fieldGroups.forEach(function (g) {
    (g.fields || []).forEach(function (f) {
      const isLocked = !!f.alwaysVisible;
      seed['f-field-' + f.key] = isLocked || masterChecked || visibleFields.indexOf(f.key) >= 0;
    });
  });
  return seed;
}

/* ---- Group A: rendering — master checked renders every non-locked field
   checkbox as checked (point 1 of the requested UX fix) ---- */
console.log('Group A — master checked ([\'*\']) renders every field checkbox checked');
{
  const fieldGroups = makeFieldGroups();
  const base = { visible_fields: ['*'] };
  const html = M.visibleFieldsDisclosureHtml({}, base, false, fieldGroups);
  ok('A1: master toggle itself renders checked', /id="f-field-all" checked/.test(html));
  NON_LOCKED_KEYS.forEach(function (key) {
    ok('A2: non-locked field "' + key + '" renders checked',
       new RegExp('id="f-field-' + key + '" checked>').test(html));
  });
  ALWAYS_VISIBLE_KEYS.forEach(function (key) {
    ok('A3: alwaysVisible field "' + key + '" renders checked+disabled',
       new RegExp('id="f-field-' + key + '" checked disabled>').test(html));
  });
}

/* ---- Group B: rendering — explicit partial list checks only listed +
   alwaysVisible fields ---- */
console.log('Group B — explicit partial visible_fields list checks only listed + alwaysVisible fields');
{
  const fieldGroups = makeFieldGroups();
  const base = { visible_fields: ['customer', 'unitPrice'] };
  const html = M.visibleFieldsDisclosureHtml({}, base, false, fieldGroups);
  ok('B1: master toggle NOT checked', /id="f-field-all">/.test(html) && !/id="f-field-all" checked/.test(html));
  ok('B2: "customer" (explicit) checked', /id="f-field-customer" checked>/.test(html));
  ok('B3: "unitPrice" (explicit) checked', /id="f-field-unitPrice" checked>/.test(html));
  ok('B4: "note" (not listed) NOT checked', /id="f-field-note">/.test(html));
  ok('B5: "total" (not listed) NOT checked', /id="f-field-total">/.test(html));
  ALWAYS_VISIBLE_KEYS.forEach(function (key) {
    ok('B6: alwaysVisible field "' + key + '" still renders checked+disabled regardless of list',
       new RegExp('id="f-field-' + key + '" checked disabled>').test(html));
  });
}

/* ---- Group C: cascadeFieldMaster_ — master -> individuals ---- */
console.log('Group C — cascadeFieldMaster_ writes every non-locked checkbox, skips alwaysVisible');
{
  const fieldGroups = makeFieldGroups();
  // Seed the module's render-time cache (_ttFieldGroupsRendered) via a real
  // paint, then build our own fake root/store to mutate independently.
  M.visibleFieldsDisclosureHtml({}, { visible_fields: [] }, false, fieldGroups);
  const seed = computeSeed(fieldGroups, { visible_fields: [] });
  const root = makeRoot(seed);

  // alwaysVisible fields always render/seed checked=true (isLocked wins
  // regardless of the master) — capture that as the "untouched" baseline to
  // assert cascade never writes to them, in either direction.
  ALWAYS_VISIBLE_KEYS.forEach(function (key) {
    ok('C0: alwaysVisible "' + key + '" seeded checked=true (baseline)',
       root._store.get('f-field-' + key).checked === true);
  });

  M.cascadeFieldMaster_(root, true);
  NON_LOCKED_KEYS.forEach(function (key) {
    ok('C1: cascade(true) checks "' + key + '"', root._store.get('f-field-' + key).checked === true);
  });
  ALWAYS_VISIBLE_KEYS.forEach(function (key) {
    ok('C2: cascade(true) leaves alwaysVisible "' + key + '" untouched (stays true, as seeded)',
       root._store.get('f-field-' + key).checked === true);
  });

  M.cascadeFieldMaster_(root, false);
  NON_LOCKED_KEYS.forEach(function (key) {
    ok('C3: cascade(false) unchecks "' + key + '"', root._store.get('f-field-' + key).checked === false);
  });
  ALWAYS_VISIBLE_KEYS.forEach(function (key) {
    ok('C4: cascade(false) still leaves alwaysVisible "' + key + '" untouched (stays true)',
       root._store.get('f-field-' + key).checked === true);
  });
}

/* ---- Group D: syncFieldMasterFromIndividuals_ — individuals -> master ---- */
console.log('Group D — syncFieldMasterFromIndividuals_ recomputes master from live individual state');
{
  const fieldGroups = makeFieldGroups();
  M.visibleFieldsDisclosureHtml({}, { visible_fields: ['*'] }, false, fieldGroups);
  // All non-locked fields start checked (master was ['*']); alwaysVisible
  // fields are forced to false here on purpose — sync must ignore them
  // entirely, so an unchecked alwaysVisible field must NOT drag the master
  // to false.
  const seed = computeSeed(fieldGroups, { visible_fields: ['*'] });
  ALWAYS_VISIBLE_KEYS.forEach(function (key) { seed['f-field-' + key] = false; });
  const root = makeRoot(seed);

  let result = M.syncFieldMasterFromIndividuals_(root);
  ok('D1: all non-locked checked -> sync returns true', result === true);
  ok('D1: all non-locked checked -> master checkbox set true', root._store.get('f-field-all').checked === true);

  root._store.get('f-field-note').checked = false;
  result = M.syncFieldMasterFromIndividuals_(root);
  ok('D2: unchecking one non-locked field -> sync returns false', result === false);
  ok('D2: unchecking one non-locked field -> master checkbox set false', root._store.get('f-field-all').checked === false);

  root._store.get('f-field-note').checked = true;
  result = M.syncFieldMasterFromIndividuals_(root);
  ok('D3: re-checking it -> sync returns true again', result === true);
  ok('D3: re-checking it -> master checkbox set true again', root._store.get('f-field-all').checked === true);
}

/* ---- Group E: collectVisibleFields_ end-to-end ---- */
console.log('Group E — collectVisibleFields_ end-to-end (master + fallback contracts)');
{
  const fieldGroups = makeFieldGroups();

  // E1: master checked -> ['*']
  M.visibleFieldsDisclosureHtml({}, { visible_fields: ['*'] }, false, fieldGroups);
  {
    const root = makeRoot({ 'f-field-all': true });
    const result = M.collectVisibleFields_(root, { visible_fields: ['*'] });
    ok('E1: master checked -> returns [\'*\']', JSON.stringify(result) === JSON.stringify(['*']));
  }

  // E2: master unchecked, specific subset checked -> returns exactly that
  // subset; alwaysVisible fields never appear (existing bug-fix behavior).
  {
    const seed = {
      'f-field-all': false,
      'f-field-orderId': true,   // alwaysVisible — must be excluded from output
      'f-field-invoiceId': true, // alwaysVisible — must be excluded from output
      'f-field-customer': true,
      'f-field-note': false,
      'f-field-unitPrice': true,
      'f-field-total': false
    };
    const root = makeRoot(seed);
    const result = M.collectVisibleFields_(root, { visible_fields: [] });
    ok('E2: unchecked master + subset -> returns exactly the checked non-locked keys',
       JSON.stringify(result.slice().sort()) === JSON.stringify(['customer', 'unitPrice']));
    ok('E2: alwaysVisible keys never appear in the explicit list',
       result.indexOf('orderId') < 0 && result.indexOf('invoiceId') < 0);
  }

  // E3: master node absent entirely -> falls back to base.visible_fields
  // (mirrors collectVisibleFields_'s own `if (!allEl) return
  // (base.visible_fields || ['*']).slice();` fallback contract exactly).
  {
    const root = makeRoot({}); // no 'f-field-all' key at all -> querySelector returns null
    const explicitBase = { visible_fields: ['customer', 'note'] };
    const result = M.collectVisibleFields_(root, explicitBase);
    ok('E3: master node absent -> falls back to base.visible_fields',
       JSON.stringify(result) === JSON.stringify(['customer', 'note']));

    const emptyBase = {};
    const fallbackResult = M.collectVisibleFields_(root, emptyBase);
    ok('E3: master node absent + base has no visible_fields -> falls back to [\'*\']',
       JSON.stringify(fallbackResult) === JSON.stringify(['*']));
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
