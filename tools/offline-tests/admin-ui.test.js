/**
 * Smoke test for ViewsAdmin.html without a browser — same technique and
 * scope as orders-ui.test.js/products-ui.test.js: run the module against a
 * DOM stub that only records what it is asked to draw, then check the HTML
 * it produces is well formed and contains the controls the checklist asks
 * for. querySelector returns null for everything EXCEPT the handful of
 * field ids collect() actually reads (see fieldValues below) — a real
 * 2026-09-06 bug (a brand-new user's typed email flipped isNew to false
 * inside collect(), so "Thêm người dùng" silently called apiUpdateUser and
 * failed with "Không tìm thấy người dùng") lived exactly in that gap, so
 * this harness now stubs just enough DOM to reproduce it.
 */
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(__dirname + '/../../apps/web/ui/ViewsAdmin.html', 'utf8')
  .replace(/^<script>/, '').replace(/<\/script>\s*$/, '');

let painted = '';
const fieldValues = {}; // '#f-email' -> 'typed value', set/cleared per test section
const node = () => ({ addEventListener() {}, set innerHTML(v) { painted = v; },
                      get innerHTML() { return painted; },
                      querySelector: (sel) => (sel in fieldValues)
                        ? { value: fieldValues[sel], checked: !!fieldValues[sel] } : null,
                      querySelectorAll: () => [] });
const root = node();

const session = { permissions: { manage_users: true } };

let lastCall = null;
let lastToast = null;
const callCounts = {};
const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Same load-order discipline as every other *-ui.test.js in this project:
 *  window starts empty and TT is only attached AFTER the module evaluates. */
const sandbox = { console, window: {} };

const TT_BRIDGE = {
  call: (fn, arg) => {
    lastCall = { fn, arg };
    callCounts[fn] = (callCounts[fn] || 0) + 1;
    return Promise.resolve(fixture(fn, arg));
  },
  can: p => session.permissions[p] === true,
  esc: esc,
  formatVnd: n => Math.round(Number(n) || 0).toLocaleString('vi-VN') + ' ₫',
  formatDate: v => v ? '20/08/2026' : '',
  toast(msg) { lastToast = msg; },
  confirm: () => Promise.resolve(true),
  config: () => ({}),
  session: () => session,
  viewGeneration: () => 1,
  isCurrentView: () => true
};

sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'ViewsAdmin.html' });
sandbox.window.TT = TT_BRIDGE;

function fixture(fn, arg) {
  if (fn === 'apiListPermissionPresets') {
    return { presets: [
      { key: 'admin', label: 'Quản trị viên (toàn quyền)' },
      { key: 'sales', label: 'Nhân viên kinh doanh' },
      { key: 'warehouse', label: 'Nhân viên kho' },
      { key: 'accounting', label: 'Kế toán' }
    ] };
  }
  if (fn === 'apiListUsers') {
    return { users: [
      { email: 'admin@x.com', displayName: 'Quản trị viên', role: 'admin', active: true, note: '',
        createdAt: '2026-08-01', permissions: { manage_users: true }, presetKey: 'admin',
        isSelf: true, isLastAdmin: true },
      { email: 'sales & <script>@x.com', displayName: 'Bán hàng <script>', role: 'staff', active: false,
        note: '', createdAt: '2026-08-01', permissions: { manage_users: false }, presetKey: 'sales',
        isSelf: false, isLastAdmin: false }
    ] };
  }
  if (fn === 'apiGetUser') {
    return { email: arg, displayName: 'Người khác', role: 'staff', active: true, note: '',
      createdAt: '2026-08-01', permissions: { manage_users: false }, presetKey: 'warehouse',
      isSelf: false, isLastAdmin: false };
  }
  if (fn === 'apiCreateUser' || fn === 'apiUpdateUser') {
    return { email: 'new@x.com', displayName: 'Người mới', role: 'staff', active: true, note: '',
      createdAt: '2026-09-06', permissions: { manage_users: false }, presetKey: 'sales',
      isSelf: false, isLastAdmin: false };
  }
  return {};
}

/* ---- assertions ---- */
let pass = 0, fail = 0;
const ok = (name, cond, detail) => cond ? (pass++, console.log('  ok   ' + name))
  : (fail++, console.log('  FAIL ' + name + (detail ? ' → ' + detail : '')));

const VOID = ['input', 'br', 'hr', 'img'];
function balanced(html) {
  const stack = [];
  const re = /<(\/?)([a-z][a-z0-9]*)\b[^>]*?(\/?)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const [, closing, tag, selfClose] = m;
    if (VOID.indexOf(tag.toLowerCase()) >= 0 || selfClose) continue;
    if (closing) {
      if (stack.pop() !== tag.toLowerCase()) return 'mismatched </' + tag + '>';
    } else stack.push(tag.toLowerCase());
  }
  return stack.length ? 'unclosed <' + stack.join('>, <') + '>' : null;
}

const captured = {};
root.addEventListener = (type, fn) => { captured[type] = fn; };

function clickDataAct(act) {
  captured.click({ target: { closest: sel => sel.indexOf('data-act') >= 0
    ? { getAttribute: a => (a === 'data-act' ? act : null) } : null } });
}
function clickOpen(email) {
  captured.click({ target: { closest: sel => sel.indexOf('data-open') >= 0
    ? { getAttribute: a => (a === 'data-open' ? email : null) } : null } });
}

console.log('\nUI smoke — list');
ok('module registered itself', typeof sandbox.window.TTAdmin === 'object');
ok('render is a function', typeof sandbox.window.TTAdmin.render === 'function');
sandbox.window.TTAdmin.render(root);
ok('render survived TT arriving after load', painted.indexOf('skeleton') >= 0);

setTimeout(() => {
  const list = painted;
  ok('list markup is balanced', balanced(list) === null, balanced(list));
  ok('shows the active admin\'s name', /Quản trị viên/.test(list));
  ok('escapes a hostile display name', !/<script>/.test(list.replace(/&lt;script&gt;/g, '')),
     'raw <script> reached the DOM');
  ok('the deactivated user is HIDDEN by default (includeInactive defaults false)',
     !/Bán hàng/.test(list));
  ok('the "Bạn" (self) badge shows on the acting admin\'s own card', /user-self-badge">Bạn/.test(list));
  ok('shows the preset label on each card', /Quản trị viên \(toàn quyền\)/.test(list));
  ok('shows the create button', /Thêm người dùng/.test(list));
  ok('shows the includeInactive checkbox and the search box', /id="f-filter-includeInactive"/.test(list) &&
     /id="f-filter-q"/.test(list));
  ok('asked the server for the user list', lastCall.fn === 'apiListUsers');
  ok('also asked for the permission presets (lazy, once)', callCounts.apiListPermissionPresets === 1);
  ok('no inline onclick attributes', !/onclick=/i.test(list));

  console.log('\nUI smoke — includeInactive reveals the deactivated user');
  captured.change({ target: { id: 'f-filter-includeInactive', checked: true } });
  const withInactive = painted;
  ok('deactivated user now shown', /Bán hàng/.test(withInactive));
  ok('deactivated user carries the "Đã khoá" badge', /status-pill--cancelled">Đã khoá/.test(withInactive));
  ok('toggling the checkbox did NOT call the server again (client-side filter only)',
     callCounts.apiListUsers === 1);

  console.log('\nUI smoke — blank form (new user)');
  sandbox.window.TTAdmin.render(root);
  setTimeout(() => {
    clickDataAct('new');
    const form = painted;
    ok('form markup is balanced', balanced(form) === null, balanced(form));
    ok('has an editable email field', /id="f-email"/.test(form) && !/id="f-email"[^>]*disabled/.test(form));
    ok('preset dropdown forces an explicit choice (no default selected option value)',
       /<option value="" disabled selected>/.test(form));
    ok('active defaults to checked on a brand-new user', /id="f-active" checked/.test(form));
    ok('no inline onclick attributes', !/onclick=/i.test(form));

    console.log('\nUI smoke — regression: saving a brand-new user with a typed email');
    // 2026-09-06 bug: collect() copies the typed #f-email value into
    // state.user.email BEFORE doSave() ran its `!state.user.email` isNew
    // check, so a create with a real email typed in always looked like an
    // edit of an (nonexistent) existing user — apiUpdateUser instead of
    // apiCreateUser, refused server-side with "Không tìm thấy người dùng".
    fieldValues['#f-email'] = 'moi@x.com';
    fieldValues['#f-displayName'] = 'Người mới';
    fieldValues['#f-note'] = '';
    fieldValues['#f-preset'] = 'sales';
    fieldValues['#f-active'] = true;
    const createCallsBefore = callCounts.apiCreateUser || 0;
    const updateCallsBefore = callCounts.apiUpdateUser || 0;
    clickDataAct('save');
    ok('typing an email on the create form calls apiCreateUser, not apiUpdateUser',
       (callCounts.apiCreateUser || 0) === createCallsBefore + 1 &&
       (callCounts.apiUpdateUser || 0) === updateCallsBefore);
    ok('the create call carries the typed email', lastCall.fn === 'apiCreateUser' &&
       lastCall.arg && lastCall.arg.user && lastCall.arg.user.email === 'moi@x.com');
    delete fieldValues['#f-email']; delete fieldValues['#f-displayName'];
    delete fieldValues['#f-note']; delete fieldValues['#f-preset']; delete fieldValues['#f-active'];

    console.log('\nUI smoke — existing user opened from the loaded list cache');
    sandbox.window.TTAdmin.render(root);
    setTimeout(() => {
      const before = callCounts.apiGetUser || 0;
      clickOpen('admin@x.com');
      const detail = painted;
      ok('detail markup is balanced', balanced(detail) === null, balanced(detail));
      ok('opening a user already in the list cache does NOT call apiGetUser',
         (callCounts.apiGetUser || 0) === before);
      ok('email field is disabled on an existing user (primary key, never changes)',
         /value="admin@x.com" disabled/.test(detail));
      ok('preset dropdown defaults to "keep current", not a specific preset',
         /<option value="">— Giữ nguyên/.test(detail));

      console.log('\nUI smoke — self + last-admin guard banner and locked controls');
      ok('shows the combined self+last-admin banner', /ro-note/.test(detail) &&
         /quản trị viên đang.*hoạt động cuối cùng/.test(detail));
      ok('preset dropdown is disabled for self/last-admin', /id="f-preset" disabled/.test(detail));
      ok('active checkbox is disabled (last-admin lock)', /id="f-active" checked disabled/.test(detail));

      console.log('\nUI smoke — a non-self, non-last-admin user has no locks');
      const before2 = callCounts.apiGetUser || 0;
      // 'other@x.com' was never returned by apiListUsers, so it is genuinely
      // absent from state.users — this exercises the cold-open (cache-miss)
      // path deliberately, unlike the two users above which are both already
      // in the loaded list (openForm matches on state.users, not on what's
      // currently visible after filtering).
      clickOpen('other@x.com');
      ok('cold open shows the skeleton while apiGetUser is in flight', /skeleton/.test(painted));
      setTimeout(() => {
        ok('fell back to apiGetUser for that id', (callCounts.apiGetUser || 0) === before2 + 1);
        const otherDetail = painted;
        ok('no self/last-admin banner for an ordinary user', !/ro-note/.test(otherDetail));
        ok('preset dropdown is enabled', !/id="f-preset" disabled/.test(otherDetail));
        ok('active checkbox is enabled', !/id="f-active"[^>]*checked disabled/.test(otherDetail) &&
           /id="f-active"[^>]*>/.test(otherDetail));

        console.log('\n' + pass + ' passed, ' + fail + ' failed');
        process.exit(fail ? 1 : 0);
      }, 0);
    }, 0);
  }, 0);
}, 0);
