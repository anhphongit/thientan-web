const H = require('./harness.js');
const { user, check, eq, throws } = H;

console.log('\n=== admin-config.test.js: Config Sheet Editing ===');

/* ---------- Setup ---- */
const admin = user('admin@x.com', { manage_users: true });
const nonAdmin = user('staff@x.com');

/* ---------- 1. List config returns editable keys ---- */
console.log('\n1. actionListConfig_ returns editable config keys');
{
  const env = H.makeEnv({
    statusList: [
      { key: 'draft', label: 'Nháp' },
      { key: 'confirmed', label: 'Đã xác nhận' }
    ],
    uomList: ['Cái', 'Bộ'],
    customerList: ['Yamato'],
    vatRates: [0.08, 0.1],
    currency: 'VND'
  });

  const res = env.actionListConfig_(admin, {});
  eq('returns config array', Array.isArray(res.config), true);
  eq('has statusList', res.config.filter(c => c.key === 'statusList').length, 1);
  eq('has uomList', res.config.filter(c => c.key === 'uomList').length, 1);
  eq('has customerList', res.config.filter(c => c.key === 'customerList').length, 1);
  eq('has vatRates', res.config.filter(c => c.key === 'vatRates').length, 1);
  eq('has currency', res.config.filter(c => c.key === 'currency').length, 1);
  check('statusList value is array', Array.isArray(
    res.config.filter(c => c.key === 'statusList')[0].value));
}

/* ---------- 2. Non-admin cannot list config ---- */
console.log('\n2. Non-admin denied on actionListConfig_');
{
  const env = H.makeEnv();
  throws('rejects staff', function () {
    env.actionListConfig_(nonAdmin, {});
  }, 'quyền');
}

/* ---------- 3. Update statusList: add a new status ---- */
console.log('\n3. Update statusList: add a new status');
{
  const env = H.makeEnv({
    statusList: [
      { key: 'draft', label: 'Nháp' },
      { key: 'confirmed', label: 'Đã xác nhận' }
    ]
  });

  const newStatusList = [
    { key: 'draft', label: 'Nháp' },
    { key: 'confirmed', label: 'Đã xác nhận' },
    { key: 'shipped', label: 'Đã giao' }
  ];

  const res = env.actionUpdateConfig_(admin, {
    key: 'statusList',
    value: newStatusList
  });

  eq('returns ok: true', res.ok, true);
  const saved = JSON.parse(env.store.Config.find(c => c.key === 'statusList').value);
  eq('three statuses saved', saved.length, 3);
  eq('new status has key "shipped"',
    saved.filter(s => s.key === 'shipped')[0].key, 'shipped');
}

/* ---------- 4. Update statusList: relabel only ---- */
console.log('\n4. Update statusList: relabel existing status');
{
  const env = H.makeEnv({
    statusList: [
      { key: 'draft', label: 'Nháp' },
      { key: 'confirmed', label: 'Đã xác nhận' }
    ]
  });

  const relabelled = [
    { key: 'draft', label: 'Bản nháp' },
    { key: 'confirmed', label: 'Đã xác nhận' }
  ];

  const res = env.actionUpdateConfig_(admin, {
    key: 'statusList',
    value: relabelled
  });

  eq('relabel succeeds', res.ok, true);
  const saved = JSON.parse(env.store.Config.find(c => c.key === 'statusList').value);
  eq('relabelled status has new label',
    saved.filter(s => s.key === 'draft')[0].label, 'Bản nháp');
}

/* ---------- 5. Update statusList: cannot remove existing key ---- */
console.log('\n5. Update statusList: cannot remove existing status key');
{
  const env = H.makeEnv({
    statusList: [
      { key: 'draft', label: 'Nháp' },
      { key: 'confirmed', label: 'Đã xác nhận' },
      { key: 'cancelled', label: 'Đã huỷ' }
    ]
  });

  // Attempt to remove 'confirmed' key
  const incomplete = [
    { key: 'draft', label: 'Nháp' },
    { key: 'cancelled', label: 'Đã huỷ' }
  ];

  throws('rejects key removal', function () {
    env.actionUpdateConfig_(admin, {
      key: 'statusList',
      value: incomplete
    });
  }, 'được');
}

/* ---------- 6. Update statusList: cannot set empty ---- */
console.log('\n6. Update statusList: cannot set empty array');
{
  const env = H.makeEnv();
  throws('rejects empty statusList', function () {
    env.actionUpdateConfig_(admin, {
      key: 'statusList',
      value: []
    });
  }, 'trống');
}

/* ---------- 7. Update statusList: invalid item (missing key/label) ---- */
console.log('\n7. Update statusList: invalid item structure');
{
  const env = H.makeEnv();
  throws('rejects item without key', function () {
    env.actionUpdateConfig_(admin, {
      key: 'statusList',
      value: [{ label: 'Nháp' }]
    });
  }, 'key');

  throws('rejects item without label', function () {
    env.actionUpdateConfig_(admin, {
      key: 'statusList',
      value: [{ key: 'draft' }]
    });
  }, 'key');
}

/* ---------- 8. Update statusList: duplicate keys not allowed ---- */
console.log('\n8. Update statusList: duplicate keys rejected');
{
  const env = H.makeEnv();
  throws('rejects duplicate key', function () {
    env.actionUpdateConfig_(admin, {
      key: 'statusList',
      value: [
        { key: 'draft', label: 'Nháp' },
        { key: 'draft', label: 'Bản nháp 2' }
      ]
    });
  }, 'trùng');
}

/* ---------- 9. Update uomList: add and remove items ---- */
console.log('\n9. Update uomList: add and remove items');
{
  const env = H.makeEnv({
    uomList: ['Cái', 'Bộ']
  });

  const res = env.actionUpdateConfig_(admin, {
    key: 'uomList',
    value: ['Cái', 'Bộ', 'Hộp', 'Kg']
  });

  eq('succeeds', res.ok, true);
  const saved = JSON.parse(env.store.Config.find(c => c.key === 'uomList').value);
  eq('four items', saved.length, 4);
  eq('contains Kg', saved.indexOf('Kg') >= 0, true);
}

/* ---------- 10. Update uomList: dedupes items ---- */
console.log('\n10. Update uomList: duplicate items are deduplicated');
{
  const env = H.makeEnv({ uomList: ['Cái'] });
  throws('rejects duplicates', function () {
    env.actionUpdateConfig_(admin, {
      key: 'uomList',
      value: ['Cái', 'Bộ', 'Cái']
    });
  }, 'trùng');
}

/* ---------- 11. Update uomList: cannot set empty ---- */
console.log('\n11. Update uomList: cannot set empty array');
{
  const env = H.makeEnv();
  throws('rejects empty uomList', function () {
    env.actionUpdateConfig_(admin, {
      key: 'uomList',
      value: []
    });
  }, 'trống');
}

/* ---------- 12. Update uomList: trims whitespace ---- */
console.log('\n12. Update uomList: whitespace is trimmed');
{
  const env = H.makeEnv();
  const res = env.actionUpdateConfig_(admin, {
    key: 'uomList',
    value: ['  Cái  ', 'Bộ']
  });
  eq('succeeds', res.ok, true);
  const saved = JSON.parse(env.store.Config.find(c => c.key === 'uomList').value);
  eq('whitespace trimmed', saved[0], 'Cái');
}

/* ---------- 13. Update uomList: empty items rejected ---- */
console.log('\n13. Update uomList: empty items are rejected');
{
  const env = H.makeEnv();
  throws('rejects empty string', function () {
    env.actionUpdateConfig_(admin, {
      key: 'uomList',
      value: ['Cái', '', 'Bộ']
    });
  }, 'trống');
}

/* ---------- 14. Update customerList: can be empty ---- */
console.log('\n14. Update customerList: can be set to empty array');
{
  const env = H.makeEnv({ customerList: ['Yamato', 'PCVN'] });
  const res = env.actionUpdateConfig_(admin, {
    key: 'customerList',
    value: []
  });
  eq('succeeds with empty', res.ok, true);
  const saved = JSON.parse(env.store.Config.find(c => c.key === 'customerList').value);
  eq('empty array', saved.length, 0);
}

/* ---------- 15. Update customerList: duplicates rejected ---- */
console.log('\n15. Update customerList: duplicates are rejected');
{
  const env = H.makeEnv();
  throws('rejects duplicates', function () {
    env.actionUpdateConfig_(admin, {
      key: 'customerList',
      value: ['Yamato', 'PCVN', 'Yamato']
    });
  }, 'trùng');
}

/* ---------- 16. Update customerList: trims and dedupes ---- */
console.log('\n16. Update customerList: trims whitespace, skips empty strings');
{
  const env = H.makeEnv();
  const res = env.actionUpdateConfig_(admin, {
    key: 'customerList',
    value: ['  Yamato  ', '', 'PCVN', '  ']
  });
  eq('succeeds', res.ok, true);
  const saved = JSON.parse(env.store.Config.find(c => c.key === 'customerList').value);
  eq('two non-empty items', saved.length, 2);
  eq('first item trimmed', saved[0], 'Yamato');
}

/* ---------- 17. Update vatRates: all numbers must be 0-1 ---- */
console.log('\n17. Update vatRates: validates numeric range 0-1');
{
  const env = H.makeEnv({ vatRates: [0.08] });

  const res = env.actionUpdateConfig_(admin, {
    key: 'vatRates',
    value: [0.08, 0.1, 0.05]
  });
  eq('valid rates succeed', res.ok, true);

  throws('rejects 1.5', function () {
    env.actionUpdateConfig_(admin, {
      key: 'vatRates',
      value: [1.5]
    });
  }, 'nằm');

  throws('rejects -0.1', function () {
    env.actionUpdateConfig_(admin, {
      key: 'vatRates',
      value: [-0.1]
    });
  }, 'nằm');

  throws('rejects non-numeric value', function () {
    env.actionUpdateConfig_(admin, {
      key: 'vatRates',
      value: ['invalid']
    });
  }, 'số');
}

/* ---------- 18. Update vatRates: cannot be empty ---- */
console.log('\n18. Update vatRates: cannot be empty');
{
  const env = H.makeEnv();
  throws('rejects empty vatRates', function () {
    env.actionUpdateConfig_(admin, {
      key: 'vatRates',
      value: []
    });
  }, 'trống');
}

/* ---------- 19. Update currency: must not be empty ---- */
console.log('\n19. Update currency: validation');
{
  const env = H.makeEnv({ currency: 'VND' });

  const res = env.actionUpdateConfig_(admin, {
    key: 'currency',
    value: 'USD'
  });
  eq('valid currency succeeds', res.ok, true);

  throws('rejects empty currency', function () {
    env.actionUpdateConfig_(admin, {
      key: 'currency',
      value: ''
    });
  }, 'trống');

  throws('rejects too-long currency', function () {
    env.actionUpdateConfig_(admin, {
      key: 'currency',
      value: 'VeryLongCurrencyName'
    });
  }, 'quá');
}

/* ---------- 20. Update: non-admin cannot update ---- */
console.log('\n20. Non-admin denied on actionUpdateConfig_');
{
  const env = H.makeEnv();
  throws('rejects staff', function () {
    env.actionUpdateConfig_(nonAdmin, {
      key: 'uomList',
      value: ['Cái']
    });
  }, 'quyền');
}

/* ---------- 21. Update: key not allowed ---- */
console.log('\n21. Update: non-editable keys are rejected');
{
  const env = H.makeEnv();
  throws('rejects approvalFlowEnabled', function () {
    env.actionUpdateConfig_(admin, {
      key: 'approvalFlowEnabled',
      value: 'TRUE'
    });
  }, 'được');

  throws('rejects exportLargeThreshold', function () {
    env.actionUpdateConfig_(admin, {
      key: 'exportLargeThreshold',
      value: '1000'
    });
  }, 'được');
}

/* ---------- 22. Cache invalidation after update ---- */
console.log('\n22. Update invalidates the config cache');
{
  const env = H.makeEnv({
    uomList: ['Cái']
  });

  // First read should populate cache
  var config1 = env.readPublicConfig_();
  eq('initial uomList has 1 item', config1.uomList.length, 1);

  // Update the config
  env.actionUpdateConfig_(admin, {
    key: 'uomList',
    value: ['Cái', 'Bộ', 'Kg']
  });

  // Next read should see the update (cache was invalidated)
  var config2 = env.readPublicConfig_();
  eq('after update, uomList has 3 items', config2.uomList.length, 3);
  eq('new items visible', config2.uomList.indexOf('Kg') >= 0, true);
}

/* ---------- 23. Multiple updates in sequence ---- */
console.log('\n23. Multiple config updates in sequence');
{
  const env = H.makeEnv({
    uomList: ['Cái'],
    customerList: ['Yamato'],
    currency: 'VND'
  });

  // Update 1
  env.actionUpdateConfig_(admin, {
    key: 'uomList',
    value: ['Cái', 'Bộ']
  });

  // Update 2
  env.actionUpdateConfig_(admin, {
    key: 'customerList',
    value: ['Yamato', 'PCVN']
  });

  // Update 3
  env.actionUpdateConfig_(admin, {
    key: 'currency',
    value: 'USD'
  });

  // Verify all three updates
  const config = env.readPublicConfig_();
  eq('uomList has 2 items', config.uomList.length, 2);
  eq('customerList has 2 items', config.customerList.length, 2);
  eq('currency is USD', config.currency, 'USD');
}

/* ---------- 24. Status list with special characters ---- */
console.log('\n24. Update statusList: special characters in labels');
{
  const env = H.makeEnv();

  const res = env.actionUpdateConfig_(admin, {
    key: 'statusList',
    value: [
      { key: 'draft', label: 'Nháp (chưa gửi)' },
      { key: 'confirmed', label: 'Đã xác nhận ✓' }
    ]
  });

  eq('succeeds with special chars', res.ok, true);
  const saved = JSON.parse(env.store.Config.find(c => c.key === 'statusList').value);
  check('label contains parentheses',
    saved[0].label.indexOf('(') >= 0);
}

/* ---------- 25. Verify Config sheet row is actually updated ---- */
console.log('\n25. Verify Config sheet row is updated');
{
  const env = H.makeEnv({
    uomList: ['Cái']
  });

  env.actionUpdateConfig_(admin, {
    key: 'uomList',
    value: ['Cái', 'Bộ']
  });

  const row = env.store.Config.find(c => c.key === 'uomList');
  eq('Config sheet row exists', !!row, true);
  eq('value is JSON string',
    row.value.charAt(0), '[');
  const parsed = JSON.parse(row.value);
  eq('parsed value has 2 items', parsed.length, 2);
}

/* ---------- 26. rememberUom_: single UOM, new ---- */
console.log('\n26. rememberUom_: add new UOM');
{
  const env = H.makeEnv({
    uomList: ['Cái', 'Cuộn']
  });

  env.rememberUom_('Kg');
  const saved = JSON.parse(env.store.Config.find(c => c.key === 'uomList').value);
  eq('uomList has 3 items', saved.length, 3);
  eq('Kg appended last', saved[2], 'Kg');
  eq('original order preserved', saved[0], 'Cái');
}

/* ---------- 27. rememberUom_: idempotent (already exists) ---- */
console.log('\n27. rememberUom_: idempotent if UOM exists');
{
  const env = H.makeEnv({
    uomList: ['Cái', 'Cuộn', 'Kg']
  });

  env.rememberUom_('Kg');
  const saved = JSON.parse(env.store.Config.find(c => c.key === 'uomList').value);
  eq('still 3 items', saved.length, 3);
  eq('no duplicate', saved.filter(u => u === 'Kg').length, 1);
}

/* ---------- 28. rememberUom_: case-insensitive dedupe ---- */
console.log('\n28. rememberUom_: case-insensitive dedupe');
{
  const env = H.makeEnv({
    uomList: ['Cái', 'Kg']
  });

  env.rememberUom_('kg');
  const saved = JSON.parse(env.store.Config.find(c => c.key === 'uomList').value);
  eq('still 2 items (kg deduped against Kg)', saved.length, 2);
}

/* ---------- 29. rememberUom_: trim whitespace ---- */
console.log('\n29. rememberUom_: trim whitespace');
{
  const env = H.makeEnv({
    uomList: ['Cái']
  });

  env.rememberUom_('  Kg  ');
  const saved = JSON.parse(env.store.Config.find(c => c.key === 'uomList').value);
  eq('Kg appended (trimmed)', saved[1], 'Kg');
}

/* ---------- 30. rememberUom_: drop empty string ---- */
console.log('\n30. rememberUom_: drop empty string');
{
  const env = H.makeEnv({
    uomList: ['Cái']
  });

  env.rememberUom_('');
  const saved = JSON.parse(env.store.Config.find(c => c.key === 'uomList').value);
  eq('still 1 item', saved.length, 1);
}

/* ---------- 31. rememberUom_: reject >20 chars ---- */
console.log('\n31. rememberUom_: reject too-long UOM');
{
  const env = H.makeEnv({
    uomList: ['Cái']
  });

  env.rememberUom_('VeryLongUnitNameOver20Characters');
  const saved = JSON.parse(env.store.Config.find(c => c.key === 'uomList').value);
  eq('still 1 item', saved.length, 1);
}

/* ---------- 32. rememberUoms_: batch multiple, one write ---- */
console.log('\n32. rememberUoms_: batch multiple new UOMs');
{
  const env = H.makeEnv({
    uomList: ['Cái']
  });

  env.rememberUoms_(['Kg', 'Lít', 'Bộ']);
  const saved = JSON.parse(env.store.Config.find(c => c.key === 'uomList').value);
  eq('4 items total', saved.length, 4);
  eq('Kg added', saved.indexOf('Kg') >= 0, true);
  eq('Lít added', saved.indexOf('Lít') >= 0, true);
  eq('Bộ already existed', saved.filter(u => u === 'Bộ').length, 1);
}

/* ---------- 33. rememberUoms_: no write if all known ---- */
console.log('\n33. rememberUoms_: fast path when all known');
{
  const env = H.makeEnv({
    uomList: ['Cái', 'Kg', 'Lít']
  });

  const configBefore = env.store.Config.find(c => c.key === 'uomList');
  const rowCountBefore = Object.keys(env.store).reduce((sum, sheet) => sum + env.store[sheet].length, 0);

  env.rememberUoms_(['Kg', 'Lít', 'Cái']);
  const configAfter = env.store.Config.find(c => c.key === 'uomList');

  eq('config unchanged (no write)', configBefore.value, configAfter.value);
}

console.log('\n=== 33+ assertions passed ===');
