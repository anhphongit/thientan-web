# Phase 04 — Base-role extension + customised auto-detect

**Priority:** P1 (highest failure-mode density) · **Status:** ✅ completed · **Effort:** 1h (actual: 50m)
**Owns:** `apps/web/ui/ViewsAdmin.html`
**Blocked by:** 03 · **Must NOT run in parallel with 01 or 03** (same file)

## Context

- Plan: [plan.md](plan.md) — read the Risk register before starting
- Server contract: `Admin.gs:69-83` (create), `:119-133` (update)

## Key insights

1. **`visible_fields` is currently hardcoded to `['*']`**
   (`ViewsAdmin.html:742`). For a `warehouse` user whose base is
   `DEFAULT_VISIBLE_FIELDS` (18 columns, no money — `Config.gs:260`,
   `Config.gs:183-187`), any matrix save today **silently grants every money
   column**. It also makes warehouse read as permanently "customised". Both are
   fixed by carrying `visible_fields` from the base.
2. **Diff must mirror the server.** `permissionsEqualPreset_`
   (`Admin.gs:314-320`) compares the 14 booleans with `!!` coercion and
   `visible_fields` **as a set** (`arraysEqualAsSets_`, `:322-331`). Any
   divergence makes the label flip after save, since `presetKey` is
   re-derived server-side by `matchPresetKey_` (`:306-312`).
3. **Always-rendered DOM makes `permissionsToSave` always truthy** unless the
   diff gates it. Ungated, every save writes `role:'custom'` — and `role` drives
   the header chip (`App.html:324`: `role === 'admin' ? 'Quản trị' : 'Nhân viên'`),
   so a full admin created this way would display as "Nhân viên". Gate on diff.
4. **Locked users have no matrix in the DOM.** If `collect()` reads it anyway,
   `querySelector` → `null` → all 14 booleans false → a plain displayName save
   attempts to strip `manage_users` from the last admin. The server refuses
   (`Admin.gs:257-280`) so nothing is lost, but *every* save of a locked user
   fails with a permission error. `collect()` must return early on
   `lockPermissions`.

## Requirements

**Functional**
- Base resolution order for seeding the matrix:
  1. `state.user.basePresetKey` (chosen in this session via `#f-preset`)
  2. `u.presetKey` (server-derived exact match) on edit
  3. `u.permissions` (edit, `presetKey === null` — unknown base)
  4. none → no disclosure (create with no base picked)
- Auto-expand on load when `presetKey === null` **and** `u.permissions` exists
  (spec 2c).
- Changing `#f-preset` reseeds every checkbox from the new base. If the current
  state is customised, `T.confirm` first; on cancel, restore the select.
- Customised = diff ≠ ∅ vs. the resolved base. Header label becomes
  `{base label} + tuỳ chỉnh`; unknown base stays `Tuỳ chỉnh`.
- Label updates on each checkbox change **without a repaint** (targeted DOM
  write, same pattern as `updateSaveButtonState`, `:1149-1154`).
- Payload decision (the whole point of the phase):

  | Case | `permissionsToSave` | `presetKeyToSave` | Payload sent |
  |---|---|---|---|
  | create, base picked, no diff | unset | `sales` | `{presetKey:'sales'}` |
  | create, base picked, diff | set | — | `{permissions:{…}}` |
  | edit, "Giữ nguyên", untouched | unset | `''` | neither key |
  | edit, base switched, no diff | unset | `warehouse` | `{presetKey:'warehouse'}` |
  | edit, diff from base | set | — | `{permissions:{…}}` |
  | edit, locked (self/last-admin) | unset | `''` | neither key |

**Non-functional**
- No new dependency. No shadow copy of checkbox state.

## Architecture

```js
// mirrors Admin.gs:314-331 — keep the two in sync, comment both sides
function permissionsEqual_(a, b) {
  for (i in permissionKeys_())  if (!!a[k] !== !!b[k]) return false;
  return arraysEqualAsSets_(a.visible_fields, b.visible_fields);
}

presetPermissions_(key)   → (state.presets.find(key) || {}).permissions || null
basePermissions_(u)       → presetPermissions_(u.basePresetKey)
                          || presetPermissions_(u.presetKey)
                          || u.permissions
                          || null
isCustomised_(u, collected) → base && !permissionsEqual_(collected, base)
```

`collect()` output shape is unchanged (`permissionsToSave` / `presetKeyToSave`),
so `doSave()` (`:768-825`) needs only the gating change, not a rewrite.

## Related code files

- Modify: `apps/web/ui/ViewsAdmin.html`
  - add `permissionsEqual_`, `arraysEqualAsSets_`, `presetPermissions_`,
    `basePermissions_`, `isCustomised_` near `permissionKeys_()` (`:115-140`)
  - `openForm()` (`:482-518`) — auto-expand rule
  - `permissionDisclosureHtml` (phase 03) — seed from `basePermissions_`, render
    the state label
  - `presetSelectHtml` (`:603-637`) — drop the `customOn` disable; the select is
    now the base picker and must stay enabled
  - `collect()` (`:715-745`) — lock gate, base-carried `visible_fields`,
    diff-gated `permissionsToSave`
  - `onChange` (`:1163-1177`) — `#f-preset` reseed, `#f-perm-*` label refresh
- Read: `apps/api/Admin.gs:306-331` (the algorithm being mirrored)
- Do **not** modify: `apps/api/*`, `Styles.html`

## Implementation steps

1. Add the five helpers. Put a comment on `permissionsEqual_` naming
   `Admin.gs:314-320` as its counterpart, and add the reciprocal comment on the
   server side **only if** phase 02 has landed (it owns that file — if not,
   note it for the reviewer instead of editing `Admin.gs` here).
2. `openForm()`: after `state.user` is set (both the cached path `:498-503` and
   the fetched path `:507-512`), set
   `state.user.showPermissionMatrix = (u.presetKey === null && !!u.permissions)`.
   Do it in one helper called from both paths — do not duplicate the expression.
3. `permissionDisclosureHtml`: seed each checkbox from
   `effectivePermissions_`-style precedence: `u.permissionsToSave` (in-flight)
   → `basePermissions_(u)`. Extend `effectivePermissions_` (`:138-140`) rather
   than writing a second resolver.
4. `presetSelectHtml`: remove the `customOn` argument and the
   `Đang dùng quyền tuỳ chỉnh` note (`:631-634`) — with base-extension the
   select is never contradicted by the matrix. Keep the `locked` disable.
   Keep the `— Giữ nguyên (…) —` option on edit (`:626`): it is how "don't
   touch permissions" is expressed, and case 3 of the payload table needs it.
5. `collect()`:
   ```js
   var lockPermissions = isBusy() || u.isSelf || u.isLastAdmin;  // mirrors formCardHtml:571
   u.permissionsToSave = null;
   if (lockPermissions) return;                       // R2 — never synthesise perms
   var base = basePermissions_(u);
   if (!base) return;                                 // R5 — no base, no matrix rendered
   var perms = {};
   permissionKeys_().forEach(function (key) {
     var el = root.querySelector('#f-perm-' + key);
     perms[key] = el ? !!el.checked : !!base[key];    // absent node → base, NOT false
   });
   perms.visible_fields = (base.visible_fields || ['*']).slice();   // R3
   if (!permissionsEqual_(perms, base)) u.permissionsToSave = perms;
   ```
   Note `el ? … : !!base[key]` — falling back to the base rather than `false`
   means a partially-stubbed DOM (and the offline test harness) can never
   invent a permission revocation.
6. `onChange`:
   - `#f-preset` → `collect()`; if `u.permissionsToSave` (i.e. customised),
     `T.confirm('Đổi nhóm quyền sẽ đặt lại các quyền đã tuỳ chỉnh. Tiếp tục?')`;
     on confirm set `u.basePresetKey = e.target.value`, clear
     `u.permissionsToSave`, `paintForm()`; on cancel restore
     `e.target.value = u.basePresetKey || ''`.
   - `#f-perm-*` → recompute the diff and write the label text into
     `#perm-base-label` directly. No `paintForm()`.
7. `doSave()` (`:773-806`): no structural change — it already prefers
   `permissionsToSave` then `presetKeyToSave`. Verify `presetKeyToSave` is read
   from `u.basePresetKey` when the select was changed. Confirm the create branch
   still errors sensibly when neither is present (server: `Admin.gs:83`).
8. Run `node tools/offline-tests/admin-ui.test.js`; hand the failure list to
   phase 05.

## Todo list

- [ ] 5 helpers added, `permissionsEqual_` cross-referenced to `Admin.gs:314`
- [ ] Auto-expand rule in one helper, called from both `openForm` paths
- [ ] `effectivePermissions_` extended (not duplicated) to fall back to base
- [ ] `presetSelectHtml` no longer disabled by custom mode; `customOn` removed
- [ ] `collect()`: lock gate → base gate → base-fallback reads → `visible_fields` from base → diff gate
- [ ] `#f-preset` reseed with `T.confirm` and cancel-restore
- [ ] `#f-perm-*` label refresh is a targeted write, no repaint
- [ ] All 6 payload cases verified by hand before handing to phase 05

## Success criteria

1. Warehouse base + one toggle → payload `visible_fields` deep-equals
   `DEFAULT_VISIBLE_FIELDS`; `['*']` appears nowhere in the payload.
2. Picking a base and saving with nothing toggled → `{presetKey:…}`, **no**
   `permissions` key.
3. Locked user save → payload has neither `permissions` nor `presetKey`.
4. Edit of a `presetKey === null` user → disclosure open on first paint,
   checkboxes reflect `u.permissions`, label reads `Tuỳ chỉnh`.
5. Toggling one box flips the label to `{base} + tuỳ chỉnh`; toggling it back
   restores the plain base label (diff is symmetric).
6. `grep -c "visible_fields = \['\*'\]" ViewsAdmin.html` → 0.

## Risk assessment

| Risk | L×I | Mitigation |
|---|---|---|
| R1 every save becomes `role:'custom'` | H×M | Diff gate, step 5. Success criterion 2. |
| R2 locked user save strips last admin | M×H | Early return, step 5 line 3. Success criterion 3. |
| R3 `visible_fields` escalation | H×H | `base.visible_fields`, step 5. Success criteria 1 & 6. |
| R4 client/server diff disagree → label flips after save | M×L | Same algorithm incl. set comparison; phase 05 round-trips all 4 presets. |
| Cancelling `T.confirm` leaves the select showing the rejected base | M×M | Explicit restore in step 6; `T.confirm` is async (returns a Promise) — restore inside `.then`, not after the call. |
| `basePresetKey` leaks between users via the cached list | M×M | `openForm` does `shallowCopy(cached)` (`:499`, `:520-524`) so `state.user` is a fresh object each open — but the **cached row is the same object identity in `state.users`**. Write `basePresetKey` only on `state.user`, never on the cached row, and never inside `upsertCachedUser` (`:415-426`). |

## Security considerations

- The diff decides only *which valid payload shape* is sent. Both shapes are
  re-validated server-side: `cleanPermissionMatrix_` (`Admin.gs:194-230`) is
  deny-by-default and validates `visible_fields` against real column headers;
  `presetOrThrow_` (`:169-182`) rejects unknown keys.
- Self-removal and last-admin invariants remain enforced at
  `Admin.gs:257-280`. The client gate is convenience, never the control.
- `visible_fields` is a money-visibility control (`Config.gs:205-209`
  `MONEY_FIELDS`). Treat R3 as a security fix, not a cosmetic one.

## Next steps

Phase 05 converts every success criterion here into an assertion.
