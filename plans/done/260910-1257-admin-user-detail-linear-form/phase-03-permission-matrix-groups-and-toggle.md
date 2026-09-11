# Phase 03 — Grouped permission matrix + toggle correctness (ViewsAdmin.html)

**Priority:** P2 · **Status:** pending · **Effort:** 1h15 · **Blocked by:** Phase 02
**File ownership:** `apps/web/ui/ViewsAdmin.html` (exclusive)

## Context

- `permissionMatrixHtml()` — `ViewsAdmin.html:540-599` (rewritten)
- Inline styles to delete: `:550` (`style="margin-top: 1rem;"`), `:558`
  (`padding/background/border-radius`), `:563` (`display:grid; grid-template-columns:1fr 1fr`)
- Duplicated 14-key array — `:583-585` (render) and `:635-637` (collect)
- Toggle handler — `ViewsAdmin.html:1071-1074`
- Save-time repaint — `ViewsAdmin.html:709-710` (`paintForm()` while saving)
- Canonical permission list — `docs/PERMISSIONS.md:12-28` (14 booleans + `visible_fields` array)

## Key insights (traced, not assumed)

1. **The toggle discards typed input.** `onChange` (`:1071-1074`) sets
   `state.user.showPermissionMatrix` then calls `paintForm()` — with **no
   `collect()` first**. `paintForm` re-renders from `state.user`, so anything
   typed into Tên hiển thị / Ghi chú since the last collect is lost the moment
   the admin ticks "Tuỳ chỉnh". Reproducible today. Deliverable 3 ("toggle works
   correctly") is exactly this.
2. **Checked boxes revert on any repaint.** The matrix renders from
   `u.permissions` (`:545, :588`), but `collect()` writes the edited set to
   `u.permissionsToSave` (`:644`). So the save-time repaint at `:709-710`
   redraws the ORIGINAL permissions while the request carrying the edited ones
   is in flight. Cosmetic today (the response overwrites `state.user`), but it
   misleads on a slow save and becomes a real data bug the moment anything else
   repaints mid-edit.
3. **Preset + custom conflict is silent.** With the matrix open, `collect()`
   sets both `permissionsToSave` and `presetKeyToSave`; `doSave()` (`:684-688`,
   `:700-704`) prefers `permissionsToSave` and drops the preset without telling
   anyone.
4. **The 14-key array exists twice** (`:583-585`, `:635-637`). Any group
   restructuring that edits one and not the other silently drops permissions
   from the save payload → a user loses access. DRY here is a correctness
   requirement, not style.

## Requirements

Functional
- Matrix rendered as 5 labelled groups, 14 checkboxes total:

  | Group label (VI) | Keys | n |
  |---|---|---|
  | QUẢN LÝ ĐƠN HÀNG | `view_orders`, `view_all_orders`, `create_order`, `edit_order`, `delete_order`, `change_status` | 6 |
  | DUYỆT ĐƠN & XUẤT DỮ LIỆU | `approve_order`, `can_edit_approved_order`, `search_filter`, `export` | 4 |
  | THỐNG KÊ | `view_statistics`, `export_statistics` | 2 |
  | KHO HÀNG | `manage_inventory` | 1 |
  | QUẢN TRỊ | `manage_users` | 1 |

- Toggle preserves everything already typed in the form.
- Checkbox state survives a repaint while the matrix is open.
- All inline `style="..."` removed; phase 01 classes used instead.

Non-functional
- One source of truth for keys/labels/groups.
- Matrix still suppressed entirely when `locked` (self / last-admin) — keep
  `if (locked) return '';` (`:543`), it mirrors `PERMISSIONS.md` §4.
- `visible_fields: ['*']` still appended in `collect()` (`:643`) — do not touch.

## Architecture

Single module-level constant replaces both key arrays:

```js
// Group order and labels are the only place the matrix layout is defined.
// collect() derives its key list from this same constant — a permission
// missing here is a permission dropped from the save payload, so the
// offline test asserts the flattened count is exactly 14.
var PERMISSION_GROUPS = [
  { label: 'Quản lý đơn hàng', keys: [
      ['view_orders', 'Xem đơn hàng của tôi'], ... ] },
  ...
];
function permissionKeys_() { /* flatten, memoised */ }
```

Data flow after this phase:

```
u.permissions (server truth)
   └─ effectivePermissions_(u) = u.permissionsToSave || u.permissions
        └─ render checkboxes  ──(user ticks)──▶ DOM
              └─ collect() over permissionKeys_() ─▶ u.permissionsToSave
                    └─ doSave(): payload.permissions
```

## Implementation steps

1. Add `PERMISSION_GROUPS` near the top of the IIFE (beside `LIST_CACHE_TTL_MS`,
   `:66`) with the 5 groups above and the Vietnamese labels currently at
   `:566-581` — reuse those exact strings, they are already reviewed copy.
2. Add `permissionKeys_()` returning the flattened key list (compute once into
   a module var). Verify `permissionKeys_().length === 14` against
   `docs/PERMISSIONS.md:14-27`.
3. Rewrite `permissionMatrixHtml(u, locked)` (`:540-599`):
   - keep the `if (!u.permissions) return '';` and `if (locked) return '';`
     early returns verbatim;
   - collapsed state: one `.field-check` label with `#f-show-matrix` +
     `<strong>Tuỳ chỉnh: Chỉnh sửa từng quyền riêng lẻ</strong>` — same text,
     inline `style` attribute dropped;
   - expanded state: `.form-section` > `.form-section-label` + the toggle +
     `.perm-groups` > per-group `.perm-group` > `.perm-group-title` +
     `.perm-group-items` > `.field-check` rows;
   - read checked state from `effectivePermissions_(u)`, not `u.permissions`;
   - keep checkbox ids `f-perm-<key>` (collect() and any future test depend on them).
4. Add `effectivePermissions_(u)` returning `u.permissionsToSave || u.permissions || {}`.
5. Rewrite `collect()`'s matrix block (`:632-645`) to iterate
   `permissionKeys_()` instead of its own literal array. Delete the duplicate
   array at `:635-637`. Keep `perms.visible_fields = ['*'];` (`:643`) and the
   surrounding comment.
6. Fix the toggle handler (`:1071-1074`):
   ```js
   if (e.target && e.target.id === 'f-show-matrix') {
     // collect() FIRST: paintForm() re-renders from state.user, so anything
     // typed since the last collect (displayName, note, preset, status) is
     // lost otherwise.
     collect();
     state.user.showPermissionMatrix = !!e.target.checked;
     paintForm();
   }
   ```
   Note ordering: `collect()` reads `#f-show-matrix` itself (`:629-630`), so it
   must run before the assignment or the assignment is overwritten. Trace
   `collect()` at `:629-630` before editing to confirm this still holds.
7. Surface the preset/custom conflict (insight 3) with the smallest honest fix:
   when the matrix is open, render the preset select disabled and emit a
   `.perm-note` reading `Đang dùng quyền tuỳ chỉnh — nhóm quyền không áp dụng.`
   Implement by passing a `customOn` flag into `presetSelectHtml` from
   `formCardHtml`; do NOT change `doSave()`'s precedence logic (`:684-688`,
   `:700-704`) — the server contract stays as-is.
   Guard: `admin-ui.test.js:223` asserts `!/id="f-preset" disabled/` for an
   ordinary user — that user has the matrix collapsed, so it stays green.
   Confirm by running the test, not by reasoning alone.
8. Run `node tools/offline-tests/admin-ui.test.js` and
   `node tools/offline-tests/admin.test.js` (server-side permission
   round-trip). Only the 3 known `#f-active` failures from phase 02 may remain.

## Todo

- [ ] Add `PERMISSION_GROUPS` + `permissionKeys_()`; assert length 14
- [ ] Add `effectivePermissions_()`
- [ ] Rewrite `permissionMatrixHtml()` with grouped markup, no inline styles
- [ ] Rewrite `collect()` matrix loop off the shared constant; delete duplicate array
- [ ] Fix toggle handler to `collect()` before repaint
- [ ] Disable preset select + `.perm-note` while custom mode is on
- [ ] Run admin-ui + admin offline tests

## Success criteria

- `grep -c "view_all_orders" apps/web/ui/ViewsAdmin.html` → 1 (single source of truth).
- `grep -c "style=\"" apps/web/ui/ViewsAdmin.html` → no occurrences inside
  `permissionMatrixHtml`.
- Manual: type a name → tick "Tuỳ chỉnh" → name still present.
- Manual: tick 3 permissions → hit Lưu → boxes stay ticked during the saving repaint.
- Save payload for edit+custom contains all 14 boolean keys + `visible_fields`.

## Risks

| Risk | L×I | Mitigation |
|---|---|---|
| A key dropped from `PERMISSION_GROUPS` silently revokes access on save | Med×**High** | Step 2 length assertion + phase-04 test asserting the 14 keys against `docs/PERMISSIONS.md` |
| `collect()` before assignment ordering inverted → toggle never opens | Med×Med | Step 6 spells out the ordering and why; verify by manual toggle, not by reading |
| Disabling `#f-preset` in custom mode trips `admin-ui.test.js:223` | Low×Med | That path has the matrix collapsed; step 7 requires running the test to confirm |
| Two-column `.perm-groups` at ≥640px makes 1-item groups look empty | Med×Low | Accepted — groups are ordered largest-first so ragged edges land at the bottom |
| `effectivePermissions_` masks a stale `permissionsToSave` after a failed save | Low×Med | `doSave`'s catch (`:720-725`) repaints without clearing it — intended: the admin's edits survive an error and can be retried |

## Security considerations

- Client-side matrix is a request builder, not an authority. `actionUpdateUser_`
  re-validates via `requireNotSelfRemovingAdmin_` / `requireNotStrippingLastAdmin_`
  (`apps/api/Admin.gs`). Never gate on the UI lock alone.
- `visible_fields` stays `['*']` — narrowing it from this screen would silently
  strip order fields on save (`docs/PERMISSIONS.md:42-46`). Out of scope.
- Labels go through `T.esc(labels[key] || key)` as today (`:593`).

## Next steps

Commit, then phase 04.
