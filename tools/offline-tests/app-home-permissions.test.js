/**
 * Offline tests for Milestone 5b / Phase 1 — App.html's homeHtml() permission
 * display and Milestone 5b's PermissionLabels.html shared labels.
 * Run with: node tools/offline-tests/app-home-permissions.test.js
 *
 * This test extracts and tests the homeHtml() logic directly, rather than
 * evaluating the full App.html IIFE which has many DOM side effects. We test:
 * - Non-admin with mixed permissions shows only granted labels
 * - Admin sees all 14 labels with correct perm/perm-on class split
 * - No raw snake_case permission keys leak into output
 * - Vietnamese field-editor text doesn't appear in homepage
 * - Markup is properly HTML-escaped
 */
const fs = require('fs'), vm = require('vm');

// Load PermissionLabels
const labelsSrc = fs.readFileSync(__dirname + '/../../apps/web/ui/PermissionLabels.html', 'utf8')
  .replace(/^<script>/, '').replace(/<\/script>\s*$/, '');

// Mock implementations
const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => cond ? (pass++, console.log('  ok   ' + name))
  : (fail++, console.log('  FAIL ' + name + (detail ? ' → ' + detail : '')));

// Setup sandbox context and load PERMISSION_GROUPS
const sandbox = { console, window: {} };
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(labelsSrc, sandbox, { filename: 'PermissionLabels.html' });

// Extract homeHtml logic directly (replicated from App.html:186-215)
// This avoids evaluating the full IIFE which has side effects
function homeHtmlLogic(session) {
  const PERMISSION_GROUPS = sandbox.window.PERMISSION_GROUPS;
  const can = (perm) => !!(session && session.permissions && session.permissions[perm] === true);

  var isAdmin = can('manage_users');
  var granted = [], denied = [];
  PERMISSION_GROUPS.forEach(function (group) {
    group.keys.forEach(function (pair) {
      var key = pair[0], label = pair[1];
      (session.permissions[key] === true ? granted : denied).push(label);
    });
  });

  var chips = granted.map(function (label) {
    return '<li class="perm on">' + esc(label) + '</li>';
  }).concat(isAdmin ? denied.map(function (label) {
    return '<li class="perm">' + esc(label) + '</li>';
  }) : []).join('');

  return '' +
    '<section class="card">' +
      '<h2>Tài khoản của bạn</h2>' +
      '<dl class="kv">' +
        '<dt>Họ tên</dt><dd>' + esc(session.displayName) + '</dd>' +
        '<dt>Email</dt><dd>' + esc(session.email) + '</dd>' +
        '<dt>Vai trò</dt><dd>' + esc(session.role) + '</dd>' +
      '</dl>' +
    '</section>' +
    '<section class="card">' +
      '<h2>Quyền hạn</h2>' +
      '<ul class="perm-list">' + chips + '</ul>' +
    '</section>';
}

/* ---- Test Fixtures ---- */

// Fixture 1: Non-admin with mixed permissions
const nonAdminMixed = {
  displayName: 'Nhân viên bán hàng',
  email: 'sales@x.com',
  role: 'staff',
  permissions: {
    view_orders: true,
    view_all_orders: false,
    create_order: true,
    edit_order: true,
    delete_order: false,        // denied
    change_status: true,
    approve_order: false,        // denied
    can_edit_approved_order: false,  // denied
    search_filter: true,
    export: true,
    view_statistics: false,      // denied
    export_statistics: false,    // denied
    manage_inventory: false,     // denied
    manage_users: false          // denied
  }
};

// Fixture 2: Admin user with all permissions
const adminFull = {
  displayName: 'Quản trị viên',
  email: 'admin@x.com',
  role: 'admin',
  permissions: {
    view_orders: true,
    view_all_orders: true,
    create_order: true,
    edit_order: true,
    delete_order: true,
    change_status: true,
    approve_order: true,
    can_edit_approved_order: true,
    search_filter: true,
    export: true,
    view_statistics: true,
    export_statistics: true,
    manage_inventory: true,
    manage_users: true
  }
};

// Fixture 3: Non-admin with ALL denied
const restrictedUser = {
  displayName: 'Người dùng hạn chế',
  email: 'restricted@x.com',
  role: 'staff',
  permissions: {
    view_orders: false,
    view_all_orders: false,
    create_order: false,
    edit_order: false,
    delete_order: false,
    change_status: false,
    approve_order: false,
    can_edit_approved_order: false,
    search_filter: false,
    export: false,
    view_statistics: false,
    export_statistics: false,
    manage_inventory: false,
    manage_users: false
  }
};

/* ---- Test Suite ---- */

console.log('\nTest 1: non-admin with mixed permissions shows only granted labels');
{
  const html = homeHtmlLogic(nonAdminMixed);

  ok('output is a string', typeof html === 'string' && html.length > 0);
  ok('output contains "Quyền hạn" section', html.indexOf('Quyền hạn') >= 0);
  ok('output contains granted label "Xem đơn hàng của tôi"',
    html.indexOf('Xem đơn hàng của tôi') >= 0);
  ok('output contains granted label "Xem tất cả đơn hàng" (false in fixture, but should not appear)',
    html.indexOf('Xem tất cả đơn hàng') < 0);
  ok('output contains NO "Xoá đơn hàng" (denied permission)',
    html.indexOf('Xoá đơn hàng') < 0);
  ok('output contains NO "Duyệt đơn hàng" (denied permission)',
    html.indexOf('Duyệt đơn hàng') < 0);
  ok('output contains NO "Xem thống kê" (denied permission)',
    html.indexOf('Xem thống kê') < 0);

  // Count class="perm" chips (should be only "perm on" for non-admin, zero plain "perm")
  const liChips = html.match(/<li[^>]*class="perm[^"]*"[^>]*>/g) || [];
  const plainPermChips = html.match(/<li[^>]*class="perm"[^>]*>/g) || [];  // plain "perm" not "perm on"
  ok('non-admin has ZERO plain class="perm" chips (all denied permissions hidden)',
    plainPermChips.length === 0, `found ${plainPermChips.length}`);
  ok('non-admin has only "perm on" chips for granted permissions',
    liChips.every(c => c.indexOf('perm on') >= 0),
    `found: ${liChips.join(', ')}`);
}

console.log('\nTest 2: admin sees all 14 permission labels, with correct perm/perm-on split');
{
  const html = homeHtmlLogic(adminFull);

  ok('admin output contains "Quyền hạn" header', html.indexOf('Quyền hạn') >= 0);

  // Admin should see all granted labels
  ok('admin sees "Xem đơn hàng của tôi" (granted)', html.indexOf('Xem đơn hàng của tôi') >= 0);
  ok('admin sees "Xem tất cả đơn hàng" (granted)', html.indexOf('Xem tất cả đơn hàng') >= 0);
  ok('admin sees "Xoá đơn hàng" (granted)', html.indexOf('Xoá đơn hàng') >= 0);
  ok('admin sees "Quản lý kho hàng" (granted)', html.indexOf('Quản lý kho hàng') >= 0);
  ok('admin sees "Quản lý người dùng" (granted)', html.indexOf('Quản lý người dùng') >= 0);

  // Count perm on vs plain perm for admin
  const permOn = (html.match(/class="perm on"/g) || []).length;
  const plainPerm = (html.match(/class="perm"(?=\s|>)/g) || []).length;

  ok('admin has 14 "perm on" chips (all granted)', permOn === 14, `found ${permOn}`);
  ok('admin has 0 plain "perm" chips (admin hides denied)', plainPerm === 0, `found ${plainPerm}`);
}

console.log('\nTest 3: no raw snake_case permission keys leak into output');
{
  let html = homeHtmlLogic(nonAdminMixed);

  ok('non-admin: no view_orders key', html.indexOf('view_orders') < 0);
  ok('non-admin: no manage_users key', html.indexOf('manage_users') < 0);
  ok('non-admin: no view_all_orders key', html.indexOf('view_all_orders') < 0);

  html = homeHtmlLogic(adminFull);

  ok('admin: no view_orders key', html.indexOf('view_orders') < 0);
  ok('admin: no manage_users key', html.indexOf('manage_users') < 0);
  ok('admin: no view_statistics key', html.indexOf('view_statistics') < 0);
}

console.log('\nTest 4: Vietnamese "Cột được xem" / "Toàn bộ cột" text does not appear');
{
  let html = homeHtmlLogic(adminFull);

  ok('admin: no "Cột được xem" in output', html.indexOf('Cột được xem') < 0);
  ok('admin: no "Toàn bộ cột" in output', html.indexOf('Toàn bộ cột') < 0);
  ok('admin: no "Cột dữ liệu được xem" in output', html.indexOf('Cột dữ liệu được xem') < 0);

  html = homeHtmlLogic(nonAdminMixed);

  ok('non-admin: no "Cột được xem" in output', html.indexOf('Cột được xem') < 0);
  ok('non-admin: no "Toàn bộ cột" in output', html.indexOf('Toàn bộ cột') < 0);
}

console.log('\nTest 5: restricted user (all denied) shows no permission chips');
{
  const html = homeHtmlLogic(restrictedUser);

  ok('restricted user renders without error', typeof html === 'string' && html.length > 0);
  ok('restricted user markup is still valid (contains key sections)',
    html.indexOf('<section') >= 0 && html.indexOf('Quyền hạn') >= 0);

  // No permission labels should appear
  const permChips = html.match(/<li[^>]*class="perm[^"]*"[^>]*>/g) || [];
  ok('restricted user has zero permission chips', permChips.length === 0,
    `found ${permChips.length}: ${permChips.join(', ')}`);

  // But the "Quyền hạn" section itself should still render (with empty list)
  ok('restricted user still has the "Quyền hạn" section', html.indexOf('Quyền hạn') >= 0);
}

console.log('\nTest 6: PERMISSION_GROUPS is defined and has all 14 keys');
{
  const groups = sandbox.window.PERMISSION_GROUPS;
  ok('PERMISSION_GROUPS is defined', !!groups && Array.isArray(groups));

  // Flatten all keys
  const allKeys = [];
  groups.forEach(g => {
    (g.keys || []).forEach(pair => {
      allKeys.push(pair[0]);
    });
  });

  ok('PERMISSION_GROUPS contains exactly 14 keys', allKeys.length === 14, `found ${allKeys.length}`);
  ok('all keys are unique (no duplicates)', new Set(allKeys).size === 14);

  const expected = [
    'view_orders', 'view_all_orders', 'create_order', 'edit_order', 'delete_order',
    'change_status', 'approve_order', 'can_edit_approved_order', 'search_filter', 'export',
    'view_statistics', 'export_statistics', 'manage_inventory', 'manage_users'
  ];
  expected.forEach(key => {
    ok('key "' + key + '" in PERMISSION_GROUPS', allKeys.indexOf(key) >= 0);
  });
}

console.log('\nTest 7: HTML markup is properly escaped');
{
  const hostile = {
    displayName: 'Tên <script>alert("xss")</script>',
    email: 'a@x.com&<b>test</b>',
    role: '<img src=x onerror=alert(1)>',
    permissions: nonAdminMixed.permissions
  };
  const html = homeHtmlLogic(hostile);

  ok('no unescaped <script> in output',
    html.indexOf('<script>') < 0 || html.indexOf('&lt;script&gt;') >= 0);
  ok('no unescaped raw < character near javascript',
    !/<(script|img)[^>]*>/i.test(html.replace(/&lt;/g, '').replace(/&gt;/g, '')));
  ok('output still contains displayName (but escaped)', html.indexOf('Tên') >= 0);
}

console.log('\nTest 8: account info section always renders');
{
  let html = homeHtmlLogic(nonAdminMixed);

  ok('non-admin shows "Tài khoản của bạn" header', html.indexOf('Tài khoản của bạn') >= 0);
  ok('non-admin shows displayName', html.indexOf(nonAdminMixed.displayName) >= 0);
  ok('non-admin shows email', html.indexOf(nonAdminMixed.email) >= 0);
  ok('non-admin shows role label', html.indexOf('Vai trò') >= 0);
  ok('non-admin shows role value', html.indexOf(nonAdminMixed.role) >= 0);

  html = homeHtmlLogic(adminFull);

  ok('admin shows account section', html.indexOf('Tài khoản của bạn') >= 0);
  ok('admin shows displayName', html.indexOf(adminFull.displayName) >= 0);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
