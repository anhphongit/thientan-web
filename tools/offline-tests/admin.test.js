/**
 * Offline tests for Milestone 5 / 5.2 — Admin.gs (user management).
 * Run with: node tools/offline-tests/admin.test.js
 */
const H = require('./harness.js');
const { user, check, eq, throws } = H;

/* ---------- 1. permission enforcement ---------- */
console.log('\n1. every action requires manage_users');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { manage_users: true });
  const noPerm = user('b@x.com', { manage_users: false });

  throws('listUsers refused', () => env.actionListUsers_(noPerm, {}), 'không có quyền');
  throws('listPermissionPresets refused', () => env.actionListPermissionPresets_(noPerm, {}), 'không có quyền');
  throws('createUser refused', () =>
    env.actionCreateUser_(noPerm, { user: { email: 'c@x.com', displayName: 'C' }, presetKey: 'sales' }),
    'không có quyền');

  const created = env.actionCreateUser_(admin, { user: { email: 'c@x.com', displayName: 'C' }, presetKey: 'sales' });
  throws('getUser refused', () => env.actionGetUser_(noPerm, { email: created.email }), 'không có quyền');
  throws('updateUser refused', () =>
    env.actionUpdateUser_(noPerm, { email: created.email, user: { displayName: 'C2' }, active: true }),
    'không có quyền');

  check('admin\'s create succeeded', created.email === 'c@x.com');
}

/* ---------- 2. presets ---------- */
console.log('\n2. actionListPermissionPresets_ returns all four, in display order');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { manage_users: true });
  const out = env.actionListPermissionPresets_(admin, {});
  eq('four presets', out.presets.map(p => p.key), ['admin', 'sales', 'warehouse', 'accounting']);
  check('admin preset has a label', typeof out.presets[0].label === 'string' && out.presets[0].label.length > 0);

  const PERMISSION_KEYS = [
    'view_orders', 'view_all_orders', 'create_order', 'edit_order', 'delete_order',
    'change_status', 'approve_order', 'can_edit_approved_order', 'search_filter', 'export',
    'view_statistics', 'export_statistics', 'manage_inventory', 'manage_users'
  ];
  const DEFAULT_VISIBLE_FIELDS = [
    'orderId', 'po', 'poNote', 'customer', 'orderDate', 'status', 'statusNote',
    'supplierName', 'lineId', 'lineNo', 'productCode', 'description', 'qty', 'uom',
    'invoiceId', 'invoiceNo', 'invoiceDate', 'note',
  ];
  out.presets.forEach(p => {
    check(p.key + ' preset carries a permissions object',
      !!p.permissions && typeof p.permissions === 'object');
    check(p.key + ' preset has all PERMISSION_KEYS as booleans',
      PERMISSION_KEYS.every(k => typeof p.permissions[k] === 'boolean'));
    check(p.key + ' preset has visible_fields array', Array.isArray(p.permissions.visible_fields));
  });

  const sales = out.presets.find(p => p.key === 'sales');
  eq('sales.permissions.visible_fields is [*]', sales.permissions.visible_fields, ['*']);

  const warehouse = out.presets.find(p => p.key === 'warehouse');
  eq('warehouse.permissions.visible_fields is DEFAULT_VISIBLE_FIELDS', warehouse.permissions.visible_fields, DEFAULT_VISIBLE_FIELDS);

  // Clone proof: mutating the returned permissions must not leak into the next call.
  const out1 = env.actionListPermissionPresets_(admin, {});
  out1.presets[0].permissions.manage_users = 'tampered';
  out1.presets[0].permissions.visible_fields.push('tampered');
  const out2 = env.actionListPermissionPresets_(admin, {});
  check('mutating a returned permissions object does not affect subsequent calls',
    out2.presets[0].permissions.manage_users !== 'tampered' &&
    out2.presets[0].permissions.visible_fields.indexOf('tampered') === -1);
}

/* ---------- 3. create: validation ---------- */
console.log('\n3. create validates email/name/preset');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { manage_users: true });

  throws('no email', () => env.actionCreateUser_(admin, { user: { displayName: 'X' }, presetKey: 'sales' }), 'email');
  throws('bad email (no @)', () =>
    env.actionCreateUser_(admin, { user: { email: 'nope', displayName: 'X' }, presetKey: 'sales' }), 'email');
  throws('no displayName', () =>
    env.actionCreateUser_(admin, { user: { email: 'd@x.com' }, presetKey: 'sales' }), 'tên hiển thị');
  throws('unknown preset', () =>
    env.actionCreateUser_(admin, { user: { email: 'e@x.com', displayName: 'E' }, presetKey: 'nope' }), 'nhóm quyền');

  const ok = env.actionCreateUser_(admin, { user: { email: '  F@X.com  ', displayName: 'F' }, presetKey: 'sales' });
  eq('email normalized (trim + lowercase)', ok.email, 'f@x.com');
  eq('active defaults to true when omitted', ok.active, true);
}

/* ---------- 4. create: duplicate email refused (case/space-insensitive) ---------- */
console.log('\n4. duplicate email refused');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { manage_users: true });
  env.actionCreateUser_(admin, { user: { email: 'g@x.com', displayName: 'G' }, presetKey: 'sales' });
  throws('exact duplicate refused', () =>
    env.actionCreateUser_(admin, { user: { email: 'g@x.com', displayName: 'G2' }, presetKey: 'sales' }), 'đã có');
  throws('duplicate (case/space-insensitive) refused', () =>
    env.actionCreateUser_(admin, { user: { email: '  G@X.com  ', displayName: 'G3' }, presetKey: 'sales' }), 'đã có');
}

/* ---------- 5. create: preset applied wholesale (role + full permissions) ---------- */
console.log('\n5. preset sets role and every permission, not just a couple of flags');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { manage_users: true });

  const wh = env.actionCreateUser_(admin, { user: { email: 'h@x.com', displayName: 'H' }, presetKey: 'warehouse' });
  eq('warehouse role', wh.role, 'staff');
  eq('warehouse manage_inventory true', wh.permissions.manage_inventory, true);
  eq('warehouse manage_users false', wh.permissions.manage_users, false);
  eq('warehouse view_all_orders true', wh.permissions.view_all_orders, true);
  eq('warehouse create_order false', wh.permissions.create_order, false);
  check('warehouse visible_fields has no money columns',
    !wh.permissions.visible_fields.some(f => ['unitPrice', 'totalExVat', 'totalIncVat'].includes(f)));
  eq('warehouse presetKey reported back', wh.presetKey, 'warehouse');

  const acc = env.actionCreateUser_(admin, { user: { email: 'i@x.com', displayName: 'I' }, presetKey: 'accounting' });
  eq('accounting view_statistics true', acc.permissions.view_statistics, true);
  eq('accounting visible_fields is everything', acc.permissions.visible_fields, ['*']);
  eq('accounting presetKey reported back', acc.presetKey, 'accounting');

  const adminUser = env.actionCreateUser_(admin, { user: { email: 'j@x.com', displayName: 'J' }, presetKey: 'admin' });
  eq('admin preset role', adminUser.role, 'admin');
  eq('admin preset has manage_users', adminUser.permissions.manage_users, true);
}

/* ---------- 6. update: displayName/note/active without a presetKey never touches permissions ---------- */
console.log('\n6. update without presetKey leaves role/permissions untouched');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { manage_users: true });
  // The acting admin must exist as a real Users row for the last-admin
  // headcount to see them — exactly like production, where loadUser_
  // always resolves the actor from that same sheet (see Auth.gs). Without
  // this, "how many OTHER active admins are there" would undercount by one
  // for every test in this file that isn't itself about multi-admin setup.
  env.actionCreateUser_(admin, { user: { email: 'a@x.com', displayName: 'Admin' }, presetKey: 'admin' });
  const created = env.actionCreateUser_(admin, { user: { email: 'k@x.com', displayName: 'K' }, presetKey: 'sales' });

  const updated = env.actionUpdateUser_(admin, {
    email: 'k@x.com', user: { displayName: 'K, sửa tên', note: 'ghi chú mới' }, active: true
  });
  eq('displayName changed', updated.displayName, 'K, sửa tên');
  eq('note changed', updated.note, 'ghi chú mới');
  eq('role unchanged (no presetKey sent)', updated.role, created.role);
  eq('permissions unchanged (no presetKey sent)', updated.permissions, created.permissions);

  throws('update on unknown email', () =>
    env.actionUpdateUser_(admin, { email: 'nope@x.com', user: { displayName: 'X' }, active: true }),
    'Không tìm thấy người dùng');
}

/* ---------- 7. update: presetKey replaces role + permissions wholesale ---------- */
console.log('\n7. update WITH presetKey replaces role/permissions wholesale');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { manage_users: true });
  // Same bootstrap as section 6 — the acting admin needs a real row so
  // demoting 'l@x.com' away from any admin-adjacent preset isn't mistaken
  // for removing the sheet's only admin.
  env.actionCreateUser_(admin, { user: { email: 'a@x.com', displayName: 'Admin' }, presetKey: 'admin' });
  env.actionCreateUser_(admin, { user: { email: 'l@x.com', displayName: 'L' }, presetKey: 'sales' });

  const promoted = env.actionUpdateUser_(admin, {
    email: 'l@x.com', user: { displayName: 'L' }, active: true, presetKey: 'warehouse'
  });
  eq('role switched to staff (still staff, but via warehouse now)', promoted.role, 'staff');
  eq('manage_inventory now true', promoted.permissions.manage_inventory, true);
  eq('presetKey now warehouse', promoted.presetKey, 'warehouse');
}

/* ---------- 8. self-protection: cannot remove own manage_users ---------- */
console.log('\n8. a user cannot strip their own manage_users, even with other admins active');
{
  const env = H.makeEnv();
  const admin1 = user('m1@x.com', { manage_users: true });
  env.actionCreateUser_(admin1, { user: { email: 'm1@x.com', displayName: 'M1' }, presetKey: 'admin' });
  env.actionCreateUser_(admin1, { user: { email: 'm2@x.com', displayName: 'M2' }, presetKey: 'admin' });

  // A second active admin exists, so this is NOT a last-admin situation —
  // proves rule 1 (self-removal) is unconditional, not just a special case
  // of rule 2 (last admin).
  throws('self cannot demote self to sales even with another admin active', () =>
    env.actionUpdateUser_(admin1, { email: 'm1@x.com', user: { displayName: 'M1' }, active: true, presetKey: 'sales' }),
    'không thể tự gỡ');

  const stillAdmin = env.actionGetUser_(admin1, { email: 'm1@x.com' });
  eq('self is still an admin after the refused attempt', stillAdmin.permissions.manage_users, true);

  // Self CAN still re-save their own account without touching manage_users —
  // e.g. switching to a different preset that still has it (admin -> admin
  // is a no-op here, but proves the guard checks the RESULT, not "any preset
  // change to self at all").
  const resaved = env.actionUpdateUser_(admin1, {
    email: 'm1@x.com', user: { displayName: 'M1, không đổi quyền' }, active: true
  });
  eq('self can edit their own displayName freely', resaved.displayName, 'M1, không đổi quyền');

  // A DIFFERENT admin CAN demote m1 — self-protection only blocks self-service.
  const admin2 = user('m2@x.com', { manage_users: true });
  const demoted = env.actionUpdateUser_(admin2, {
    email: 'm1@x.com', user: { displayName: 'M1' }, active: true, presetKey: 'sales'
  });
  eq('a different admin can demote', demoted.permissions.manage_users, false);
}

/* ---------- 9. last-admin protection ---------- */
console.log('\n9. the last active admin can be neither deactivated nor stripped of manage_users');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { manage_users: true });
  const solo = env.actionCreateUser_(admin, { user: { email: 'solo@x.com', displayName: 'Solo' }, presetKey: 'admin' });
  check('solo is flagged isLastAdmin on read', env.actionGetUser_(admin, { email: 'solo@x.com' }).isLastAdmin === true);

  throws('cannot deactivate the sole active admin', () =>
    env.actionUpdateUser_(admin, { email: 'solo@x.com', user: { displayName: 'Solo' }, active: false }),
    'quản trị viên đang hoạt động cuối cùng');
  throws('cannot strip the sole active admin\'s manage_users via preset', () =>
    env.actionUpdateUser_(admin, { email: 'solo@x.com', user: { displayName: 'Solo' }, active: true, presetKey: 'sales' }),
    'quản trị viên đang hoạt động cuối cùng');

  // Add a second active admin — now solo is no longer "last", both
  // operations that were refused above should succeed.
  env.actionCreateUser_(admin, { user: { email: 'second@x.com', displayName: 'Second' }, presetKey: 'admin' });
  check('solo no longer flagged isLastAdmin once a second admin exists',
    env.actionGetUser_(admin, { email: 'solo@x.com' }).isLastAdmin === false);
  const deactivated = env.actionUpdateUser_(admin, { email: 'solo@x.com', user: { displayName: 'Solo' }, active: false });
  eq('solo can now be deactivated', deactivated.active, false);
}

/* ---------- 10. list: sort order, isSelf/isLastAdmin flags, custom-permissions presetKey ---------- */
console.log('\n10. actionListUsers_ sort order and computed flags');
{
  const env = H.makeEnv();
  const admin = user('z@x.com', { manage_users: true });
  env.actionCreateUser_(admin, { user: { email: 'z@x.com', displayName: 'Zoe' }, presetKey: 'admin' });
  env.actionCreateUser_(admin, { user: { email: 'a2@x.com', displayName: 'Anh' }, presetKey: 'sales' });

  const list = env.actionListUsers_(admin, {}).users;
  eq('sorted by displayName ascending (Anh before Zoe)', list.map(u => u.displayName), ['Anh', 'Zoe']);

  const zoeRow = list.filter(u => u.email === 'z@x.com')[0];
  const anhRow = list.filter(u => u.email === 'a2@x.com')[0];
  eq('isSelf true for the acting admin\'s own row', zoeRow.isSelf, true);
  eq('isSelf false for someone else\'s row', anhRow.isSelf, false);
  eq('the sole admin is flagged isLastAdmin', zoeRow.isLastAdmin, true);
  eq('a non-admin row is never flagged isLastAdmin', anhRow.isLastAdmin, false);

  // Hand-edit the sheet row directly (bypassing presets) to prove
  // presetKey correctly reports null for permissions that match no preset.
  const raw = env.findBy_('Users', 'email', 'a2@x.com');
  const custom = JSON.parse(raw.permissions);
  custom.export = !custom.export; // flip exactly one flag away from the sales preset
  env.updateRecord_('Users', raw._row, { permissions: JSON.stringify(custom) });
  const customized = env.actionGetUser_(admin, { email: 'a2@x.com' });
  eq('presetKey is null once permissions no longer match any preset exactly', customized.presetKey, null);
}

/* ---------- 11. getUser not found ---------- */
console.log('\n11. getUser on an unknown email throws USER_NOT_FOUND');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { manage_users: true });
  throws('unknown email', () => env.actionGetUser_(admin, { email: 'nope@x.com' }), 'Không tìm thấy người dùng');
  throws('blank email', () => env.actionGetUser_(admin, {}), 'Không tìm thấy người dùng');
}

/* ---------- 12. create: matrix-based permissions (M5.3) ---------- */
console.log('\n12. createUser with custom permission matrix');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { manage_users: true });

  const custom = env.actionCreateUser_(admin, {
    user: { email: 'm@x.com', displayName: 'Matrix User' },
    permissions: { view_orders: true, create_order: true, manage_inventory: false, manage_users: false, visible_fields: ['*'] }
  });
  eq('matrix user created with custom permissions', custom.email, 'm@x.com');
  eq('role set to "custom" for matrix-based', custom.role, 'custom');
  eq('view_orders true', custom.permissions.view_orders, true);
  eq('create_order true', custom.permissions.create_order, true);
  eq('manage_inventory false', custom.permissions.manage_inventory, false);
  eq('manage_users false', custom.permissions.manage_users, false);
  eq('presetKey null for matrix (no exact preset match)', custom.presetKey, null);
}

/* ---------- 13. create: unknown keys dropped (deny-by-default) ---------- */
console.log('\n13. unknown permission keys in matrix are silently dropped');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { manage_users: true });

  const custom = env.actionCreateUser_(admin, {
    user: { email: 'n@x.com', displayName: 'Unknown Keys' },
    permissions: { view_orders: true, unknown_key: true, another_bad_key: false, manage_users: false, visible_fields: [] }
  });
  eq('unknown_key not in response', custom.permissions.unknown_key, undefined);
  eq('another_bad_key not in response', custom.permissions.another_bad_key, undefined);
  eq('view_orders still there', custom.permissions.view_orders, true);
  eq('all 14 PERMISSION_KEYS present', Object.keys(custom.permissions).filter(k => k !== 'visible_fields').length, 14);
}

/* ---------- 14. create: ambiguous payload (both presetKey and permissions) ---------- */
console.log('\n14. supplying both presetKey and permissions is an error');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { manage_users: true });

  throws('ambiguous payload', () =>
    env.actionCreateUser_(admin, {
      user: { email: 'o@x.com', displayName: 'Ambiguous' },
      presetKey: 'sales',
      permissions: { view_orders: true, manage_users: false, visible_fields: [] }
    }),
    'không thể chỉ định cả');
}

/* ---------- 15. update: matrix-based permissions without changing displayName ---------- */
console.log('\n15. updateUser can apply a custom permission matrix');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { manage_users: true });

  // Create admin as a user in the sheet first (so there's at least one admin)
  env.actionCreateUser_(admin, {
    user: { email: 'a@x.com', displayName: 'Admin' },
    presetKey: 'admin'
  });

  const created = env.actionCreateUser_(admin, {
    user: { email: 'p@x.com', displayName: 'P' },
    presetKey: 'sales'
  });
  eq('initial preset is sales', created.presetKey, 'sales');

  const updated = env.actionUpdateUser_(admin, {
    email: 'p@x.com',
    user: { displayName: 'P' },
    active: true,
    permissions: { view_orders: true, export: false, create_order: false, manage_users: false, visible_fields: ['orderId', 'customer'] }
  });
  eq('updated to custom matrix', updated.role, 'custom');
  eq('view_orders true', updated.permissions.view_orders, true);
  eq('export false (not in visible preset list)', updated.permissions.export, false);
  eq('presetKey now null (no exact match)', updated.presetKey, null);
}

/* ---------- 16. update: empty visible_fields defaults to DEFAULT_VISIBLE_FIELDS at read time ---------- */
console.log('\n16. visible_fields can be empty array; defaults to DEFAULT_VISIBLE_FIELDS on read');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { manage_users: true });

  // Create admin in the sheet
  env.actionCreateUser_(admin, {
    user: { email: 'a@x.com', displayName: 'Admin' },
    presetKey: 'admin'
  });

  const sales = env.actionCreateUser_(admin, {
    user: { email: 'q@x.com', displayName: 'Q' },
    presetKey: 'sales'
  });

  // Update with same permissions but empty visible_fields array
  // Per Permissions.gs line 74-76, empty visible_fields defaults to DEFAULT_VISIBLE_FIELDS
  const updated = env.actionUpdateUser_(admin, {
    email: 'q@x.com',
    user: { displayName: 'Q' },
    active: true,
    permissions: {
      view_orders: true, view_all_orders: false, create_order: true, edit_order: true,
      delete_order: false, change_status: true, approve_order: false,
      can_edit_approved_order: false, search_filter: true, export: true,
      view_statistics: false, export_statistics: false, manage_inventory: false,
      manage_users: false, visible_fields: []
    }
  });
  // Empty visible_fields in storage defaults to DEFAULT_VISIBLE_FIELDS on read
  eq('empty visible_fields defaults to DEFAULT_VISIBLE_FIELDS', updated.permissions.visible_fields.length > 0, true);
  // But presetKey is still null because the permissions don't match the sales preset exactly
  // (sales preset has view_all_orders=true, but we set it to false)
  eq('presetKey null (permissions dont match sales preset)', updated.presetKey, null);
}

/* ---------- 17. matrix: self-protection rule still enforced ---------- */
console.log('\n17. matrix path enforces: cannot remove own manage_users');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { manage_users: true });

  // Create admin in the sheet with admin permissions
  env.actionCreateUser_(admin, {
    user: { email: 'a@x.com', displayName: 'Admin' },
    presetKey: 'admin'
  });

  throws('self cannot remove own manage_users via matrix', () =>
    env.actionUpdateUser_(admin, {
      email: 'a@x.com',
      user: { displayName: 'Admin' },
      active: true,
      permissions: { manage_users: false, view_orders: true, visible_fields: ['*'] }
    }),
    'không thể tự gỡ');
}

/* ---------- 18. matrix: last-admin protection still enforced ---------- */
console.log('\n18. matrix path enforces: cannot strip manage_users from last active admin');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { manage_users: true });

  // Create first admin in the sheet
  env.actionCreateUser_(admin, {
    user: { email: 'a@x.com', displayName: 'Admin A' },
    presetKey: 'admin'
  });

  const secondAdmin = env.actionCreateUser_(admin, {
    user: { email: 's@x.com', displayName: 'S' },
    presetKey: 'admin'
  });

  // Deactivate the second admin
  env.actionUpdateUser_(admin, { email: 's@x.com', user: { displayName: 'S' }, active: false });

  // Now try to strip manage_users from the last remaining admin via matrix
  throws('cannot strip manage_users from last admin via matrix', () =>
    env.actionUpdateUser_(admin, {
      email: 'a@x.com',
      user: { displayName: 'Admin A' },
      active: true,
      permissions: { manage_users: false, view_orders: true, visible_fields: ['*'] }
    }),
    'quản trị viên');
}

/* ---------- 19. preset path still works unchanged (regression test) ---------- */
console.log('\n19. updateUser with presetKey still applies preset (regression)');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { manage_users: true });

  // Create admin in the sheet
  env.actionCreateUser_(admin, {
    user: { email: 'a@x.com', displayName: 'Admin' },
    presetKey: 'admin'
  });

  const user1 = env.actionCreateUser_(admin, {
    user: { email: 't@x.com', displayName: 'T' },
    presetKey: 'sales'
  });
  eq('initial preset sales', user1.presetKey, 'sales');

  const user2 = env.actionUpdateUser_(admin, {
    email: 't@x.com',
    user: { displayName: 'T' },
    active: true,
    presetKey: 'warehouse'
  });
  eq('updated to warehouse preset', user2.presetKey, 'warehouse');
  eq('warehouse permissions applied', user2.permissions.manage_inventory, true);
  eq('warehouse view_all_orders true', user2.permissions.view_all_orders, true);
  eq('warehouse manage_users false', user2.permissions.manage_users, false);
}

/* ---------- 20. omitting both presetKey and permissions leaves permissions untouched ---------- */
console.log('\n20. updateUser without presetKey or permissions leaves role/permissions untouched');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { manage_users: true });

  // Create admin in the sheet
  env.actionCreateUser_(admin, {
    user: { email: 'a@x.com', displayName: 'Admin' },
    presetKey: 'admin'
  });

  const user1 = env.actionCreateUser_(admin, {
    user: { email: 'u@x.com', displayName: 'U' },
    presetKey: 'warehouse'
  });
  eq('initial role warehouse', user1.role, 'staff');

  const user2 = env.actionUpdateUser_(admin, {
    email: 'u@x.com',
    user: { displayName: 'U Updated' },
    active: true
    // no presetKey, no permissions
  });
  eq('role unchanged (still warehouse)', user2.role, 'staff');
  eq('manage_inventory still true', user2.permissions.manage_inventory, true);
  eq('presetKey still warehouse', user2.presetKey, 'warehouse');
}

H.done();
