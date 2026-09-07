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

H.done();
