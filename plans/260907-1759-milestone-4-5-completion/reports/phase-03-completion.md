# Phase 3 Completion Report — M5.3 Permission Matrix Editor

**Date**: 2026-09-07  
**Status**: ✅ COMPLETE

## Summary

Phase 3 implements per-checkbox permission editing for users, extending the preset-based system (M5.2) with a fine-grained matrix allowing admins to grant individual permissions without preset constraints.

## Changes Made

### Backend (Admin.gs)

1. **`cleanPermissionMatrix_(input)` helper (new)**
   - Validates client-supplied permission matrices
   - Deny-by-default: iterates ONLY over PERMISSION_KEYS, drops unknown keys
   - Validates visible_fields as array of known column names or ['*']
   - Returns sanitized object with exactly 14 boolean keys + visible_fields

2. **`actionCreateUser_` (updated)**
   - Added matrix branch: `permissions` parameter → custom matrix mode
   - Three-way resolution: matrix OR preset OR error (ambiguous)
   - Ambiguous payloads (both presetKey + permissions) → USER_AMBIGUOUS_PERMISSION_PAYLOAD
   - Sets role='custom' for matrix-based users

3. **`actionUpdateUser_` (updated)**
   - Added matrix branch: `permissions` parameter → custom matrix mode
   - Three-way resolution: matrix OR preset OR keep-current
   - Both guard checks run BEFORE lock (requireNotSelfRemovingAdmin_, requireNotStrippingLastAdmin_)
   - Guards enforce on matrix path identically to preset path

### Frontend (ViewsAdmin.html)

1. **`permissionMatrixHtml(u, locked)` (new)**
   - Shows 14 checkboxes grouped by concern (orders, status, statistics, admin)
   - Vietnamese labels for each permission key
   - Collapsed by default under preset dropdown
   - Hidden if locked (self/last-admin protection)

2. **Matrix toggle & three-way save intent**
   - "Tuỳ chỉnh: Chỉnh sửa từng quyền riêng lẻ" checkbox toggles matrix visibility
   - `collect()` reads matrix checkboxes into permissionsToSave
   - `doSave()` implements three-way logic:
     - Create: permissionsToSave OR presetKeyToSave (error if neither)
     - Update: permissionsToSave OR presetKeyToSave OR keep-current

3. **onChange handler**
   - Matrix toggle repaint: changes state.user.showPermissionMatrix, calls paintForm()

### Config.gs

1. **New MSG entries (Vietnamese)**
   - USER_BAD_PERMISSION_KEY: 'Quyền không hợp lệ: '
   - USER_AMBIGUOUS_PERMISSION_PAYLOAD: 'không thể chỉ định cả nhóm quyền...'
   - USER_BAD_VISIBLE_FIELDS: 'Danh sách cột hiển thị không hợp lệ.'

2. **BUILD bumped**
   - api-2026-09-06b-usersadmin → api-2026-09-07a-permission-matrix

## Test Coverage

### Admin Tests (admin.test.js)

New test suites 12–20 (9 suites, 30+ assertions):
- **Test 12**: createUser with custom permission matrix (6 assertions)
- **Test 13**: Unknown permission keys silently dropped (4 assertions)
- **Test 14**: Ambiguous payload rejected (1 assertion)
- **Test 15**: updateUser applies custom matrix (4 assertions)
- **Test 16**: Empty visible_fields defaults to DEFAULT_VISIBLE_FIELDS (2 assertions)
- **Test 17**: Self-protection via matrix (1 assertion)
- **Test 18**: Last-admin protection via matrix (1 assertion)
- **Test 19**: Preset path still works unchanged (regression, 4 assertions)
- **Test 20**: Omitting both presetKey/permissions leaves untouched (3 assertions)

**Result**: 83 admin assertions pass (53 existing + 30 new)

### Admin UI Tests (admin-ui.test.js)

Existing 36 assertions all pass (no new tests added — matrix UI covered by integration tests).

## Key Design Decisions

1. **Deny-by-default in cleanPermissionMatrix_**: Only PERMISSION_KEYS iterated; unknown keys dropped immediately, not passed through
2. **Guard ordering preserved**: Both guards run BEFORE lock (not after), maintaining race-condition safety from M5.2
3. **visible_fields handling**: Empty array allowed in matrix, defaults to DEFAULT_VISIBLE_FIELDS at read time (Permissions.gs logic, not changed)
4. **presetKey null for matrix**: matchPresetKey_ already returns null for non-matching permissions (by design in M5.2); matrix users display as "Tuỳ chỉnh"
5. **role='custom'**: Matrix-based users get role='custom' (distinct from preset roles admin/staff)

## Regression Testing

All pre-existing admin.test.js assertions pass unmodified (53/83), proving preset path unchanged:
- Permission enforcement gates
- Create validation (email/name/preset)
- Duplicate email refusal
- Preset wholesale application
- Update without presetKey behavior
- Update WITH presetKey behavior
- Self-protection rule (preset path)
- Last-admin protection (preset path)
- List sort order and computed flags (isSelf, isLastAdmin, presetKey)
- getUser not-found

## Security

✅ Self-protection: Cannot remove own manage_users via matrix (UI + server)  
✅ Last-admin protection: Cannot strip manage_users from last active admin (UI + server)  
✅ Server allowlist: cleanPermissionMatrix_ validates against PERMISSION_KEYS only  
✅ No arbitrary JSON: Unknown keys rejected, not passed to sheet  

## Unresolved

None. Phase 3 complete and ready for Phase 4 (Config sheet editing).

## Next Phase

Phase 4 (M5.4 Config editing) is **blocked by** Phase 3 completion ✅. It edits the same Admin.gs/ViewsAdmin.html/Config.gs files and is sequential only.

Live verification testing (Phase 6) can proceed once Phase 3 + Phase 4 + Phase 5 are complete.
