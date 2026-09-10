# Phase 02 — Expose preset permissions to the client

**Priority:** P1 (blocks 03/04) · **Status:** ✅ completed · **Effort:** 45m (actual: 40m)
**Owns:** `apps/api/Admin.gs`, `tools/offline-tests/admin.test.js`
**Blocked by:** — (parallel-safe with phase 01; different files)

## Context

- Plan: [plan.md](plan.md)

## Key insight

The base-role-extension UX is impossible client-side today: the client only ever
receives `{key, label}` (`Admin.gs:147-155`). To render "here is what Sales
grants, now add/remove on top" and to compute "does this differ from the base",
the client needs each preset's full `permissions` object.

The only alternative — duplicating `PERMISSION_PRESETS` inside
`ViewsAdmin.html` — is a DRY violation with a guaranteed drift failure mode
(the server would enforce one set, the UI would display another). Rejected.

## Requirements

**Functional**
- `actionListPermissionPresets_` returns `{presets:[{key,label,permissions}]}`.
- `permissions` is the full object: the 14 `PERMISSION_KEYS` booleans plus
  `visible_fields` (`Config.gs:230-274`).
- Order unchanged: `admin, sales, warehouse, accounting`.

**Non-functional**
- Additive only. Existing consumers reading `key`/`label` are unaffected.
- Deep clone on the way out — `PERMISSION_PRESETS` is a module-level constant
  shared across every request in an execution (same reasoning already written
  out in `presetOrThrow_`, `Admin.gs:173-177`).

## Architecture / data flow

```
PERMISSION_PRESETS (Config.gs:230)
  → actionListPermissionPresets_ (Admin.gs:148)   [requirePermission_ manage_users, :149]
    → Router.gs:216 listPermissionPresets
      → Main.gs:365-370 apiListPermissionPresets   (transparent proxy, no filtering)
        → ViewsAdmin.html:197 T.call → state.presets
```

Verified: `Main.gs:365-370` and `Router.gs:216` pass the object through
untouched — no allowlist to update.

## Related code files

- Modify: `apps/api/Admin.gs` (`actionListPermissionPresets_`, `:147-155`)
- Modify: `tools/offline-tests/admin.test.js` (add assertions after `:37`)
- Read: `apps/api/Config.gs:173-177`, `:230-274`
- Read: `apps/api/Admin.gs:169-182` (clone pattern to mirror)
- Do **not** modify: `Router.gs`, `Main.gs` (nothing to change)

## Implementation steps

1. Rewrite `actionListPermissionPresets_` (`Admin.gs:147-155`):

   ```js
   /**
    * @return {{presets:{key:string, label:string, permissions:Object}[]}}
    *
    * `permissions` (M5.3b) is what lets the client's "Nhóm quyền chi tiết"
    * disclosure seed its checkboxes from a base role and detect divergence
    * from it. Deep-cloned for the same reason presetOrThrow_ clones: the
    * constant is shared by every request in this execution.
    */
   function actionListPermissionPresets_(user, payload) {
     requirePermission_(user, 'manage_users');
     return {
       presets: Object.keys(PERMISSION_PRESETS).map(function (key) {
         return {
           key: key,
           label: PERMISSION_PRESETS[key].label,
           permissions: JSON.parse(JSON.stringify(PERMISSION_PRESETS[key].permissions))
         };
       })
     };
   }
   ```
2. Add assertions to `admin.test.js` section 2 (after `:37`):
   - every preset carries a `permissions` object with all 14 `PERMISSION_KEYS`
     plus `visible_fields`;
   - `sales.permissions.visible_fields` is `['*']` and
     `warehouse.permissions.visible_fields` deep-equals `DEFAULT_VISIBLE_FIELDS`
     (this is the value phase 04 depends on — pin it here);
   - mutating a returned `permissions` object then re-calling the action returns
     the unmutated value (clone proof).
3. Run `node tools/offline-tests/admin.test.js` and
   `node tools/offline-tests/admin-config.test.js`.

## Todo list

- [ ] Add `permissions` (deep clone) to each preset entry
- [ ] Update the JSDoc return type on `actionListPermissionPresets_`
- [ ] Add the 3 assertions to `admin.test.js`
- [ ] `node tools/offline-tests/admin.test.js` → 0 failed
- [ ] `node tools/offline-tests/admin-config.test.js` → 0 failed
- [ ] `node tools/offline-tests/admin-ui.test.js` → still 44/44 (UI ignores the new field until phase 03)

## Success criteria

1. `actionListPermissionPresets_(admin,{}).presets[1].permissions.create_order === true`.
2. Mutation of the returned object cannot reach `PERMISSION_PRESETS`.
3. Existing assertions at `admin.test.js:36-37` pass untouched.
4. `admin-ui.test.js` unchanged and still 44/44 — proves the field is inert
   until the client opts in.

## Risk assessment

| Risk | L×I | Mitigation |
|---|---|---|
| Shared-constant mutation poisons later requests in the same execution | L×H | Deep clone, mirroring `presetOrThrow_` (`Admin.gs:169-182`); clone-proof assertion in step 2. |
| Response size growth | L×L | 4 presets × ~15 keys; `warehouse` also carries 18 `visible_fields` strings. Low hundreds of bytes, fetched once per session (`ensurePresetsLoaded`, `ViewsAdmin.html:193-207`). |
| Some other consumer breaks on the extra key | L×M | Enumerated all consumers: `Router.gs:216`, `Main.gs:365-370`, `ViewsAdmin.html:197`, `admin.test.js:16,31-37`. That is the complete list (grep `ListPermissionPresets`/`listPermissionPresets`). None enumerate keys. |

## Security considerations

- Endpoint is already gated: `requirePermission_(user, 'manage_users')`
  (`Admin.gs:149`) — unchanged, and `admin.test.js:16` asserts the refusal.
- Presets are static source constants, not user or tenant data. Exposing them to
  a user who can already *assign* them leaks nothing new.
- This is display data only. Authorization still reads the Users sheet
  (`Permissions.gs:8-10`); nothing here becomes a trust input.

## Next steps

Unblocks phase 03. Independently shippable — the client ignores the new field
until then.
