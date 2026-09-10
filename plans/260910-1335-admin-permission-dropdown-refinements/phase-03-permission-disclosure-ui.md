# Phase 03 — "Nhóm quyền chi tiết" disclosure UI

**Priority:** P2 · **Status:** ✅ completed · **Effort:** 1h (actual: 55m)
**Owns:** `apps/web/ui/ViewsAdmin.html`, `apps/web/ui/Styles.html`
**Blocked by:** 01, 02 · **Must NOT run in parallel with 01 or 04** (same file)

## Context

- Plan: [plan.md](plan.md)
- Depends on phase 02's `presets[].permissions`

## Key insights

1. **`<details>`/`<summary>` cannot be used.** This module binds delegated
   listeners on one wrapper (`ViewsAdmin.html:163-176`) and the DOM `toggle`
   event **does not bubble**, so the open state would never reach `onChange`.
   Use a `<button data-act="toggle-perms">` — `onClick`'s delegation at
   `:1027-1035` already handles it.
2. **Render the matrix DOM always; collapse with a CSS class.** Collapsed
   `<input>`s stay reachable via `querySelector`, so `collect()` keeps one
   source of truth and no shadow state is needed. This deletes an entire class
   of "which is authoritative, state or DOM" bugs.
3. **`collect()` currently derives the open state from the DOM**
   (`:730-731`, reading `#f-show-matrix`). Once that checkbox is gone, that read
   returns `null` → `showPermissionMatrix = false` → custom permissions silently
   dropped (Risk R6). It **must** be deleted, not adapted.
4. **Matrix is absent on the create form today** — `permissionMatrixHtml`
   early-returns at `:645` when `u.permissions` is unset, and `blankUser()`
   (`:477-480`) has no `permissions` key. Spec 2b requires it on create, so the
   guard changes to "do we have a base to seed from?".

## Requirements

**Functional**
- Section label: `Nhóm quyền chi tiết`.
- Collapsed by default; expanded when `state.user.showPermissionMatrix`.
- Header row shows the effective label: base preset label, or
  `{base} + tuỳ chỉnh`, or `Tuỳ chỉnh` (unknown base). Phase 04 computes the
  customised part; phase 03 renders the base label only.
- Toggling preserves everything typed (existing `collect()`-before-repaint
  discipline at `:1172-1176`).
- Hidden entirely when `lockPermissions` (self / last-admin) — unchanged from
  `:646-647`.
- Hidden entirely when `state.presets` is `null` (loading) or `[]` (fetch
  failed) **and** no base is derivable → degrade to today's behaviour (R5).

**Non-functional**
- Disclosure button `min-height: 44px`, full width, keyboard focusable.
- Groups stay 1-col below 640px (`Styles.html:1255-1257` untouched).

## Architecture

```
formCardHtml(u, isNew, busy)                       ViewsAdmin.html:567
 ├ .form-section  Thông tin người dùng             (base role select #f-preset)
 ├ permissionDisclosureHtml(u, lockPermissions)    ← replaces permissionMatrixHtml
 │   ├ <button data-act="toggle-perms" aria-expanded="…" aria-controls="perm-body">
 │   │     Nhóm quyền chi tiết  ·  <span id="perm-base-label">…</span>  ·  chevron
 │   └ <div id="perm-body" class="perm-body perm-body--collapsed?">
 │         .perm-groups → 5 × .perm-group → 14 × input#f-perm-{key}
 └ .form-section  Ghi chú                          (phase 01)
```

`onClick` `case 'toggle-perms'` → `collect()` → flip
`state.user.showPermissionMatrix` → `paintForm()`. Same shape as the checkbox
handler it replaces (`:1172-1176`), moved from `onChange` to `onClick`.

## Related code files

- Modify: `apps/web/ui/ViewsAdmin.html`
  - `permissionMatrixHtml` → `permissionDisclosureHtml` (`:644-698`)
  - `formCardHtml` call site (`:594`)
  - `collect()` — delete the `#f-show-matrix` read (`:730-731`)
  - `onClick` — add `toggle-perms` (`:1086-1105`)
  - `onChange` — delete the `f-show-matrix` branch (`:1172-1176`)
  - `blankUser()` — no change needed (base comes from `state.presets`)
- Modify: `apps/web/ui/Styles.html` — append after `:1257`, before `</style>`
- Read: `Styles.html:1213-1257` (existing `.form-section`/`.perm-*` block)

## Implementation steps

1. **CSS** (`Styles.html`, append inside the M5.3 block before `</style>:1258`):
   ```css
   /* M5.3b — permission disclosure. */
   .perm-disclosure {
     display: flex; align-items: center; justify-content: space-between; gap: 10px;
     width: 100%; min-height: 44px; padding: 10px 12px;
     font: inherit; font-size: 14px; text-align: left; color: var(--c-text);
     background: var(--c-surface); border: 1px solid var(--c-border);
     border-radius: 8px; cursor: pointer;
   }
   .perm-disclosure:focus-visible {
     outline: none; border-color: var(--c-brand);
     box-shadow: 0 0 0 3px var(--c-brand-soft);
   }
   .perm-disclosure[disabled] { background: var(--c-bg); color: var(--c-muted); cursor: default; }
   .perm-disclosure-state { font-size: 12.5px; color: var(--c-muted); }
   .perm-body { margin-top: 12px; }
   .perm-body--collapsed { display: none; }
   ```
   Reuse existing tokens only (`--c-surface`, `--c-border`, `--c-brand`,
   `--c-brand-soft`, `--c-muted`, `--c-bg`) — all already used at
   `Styles.html:769-782`.
2. **Rename + restructure** `permissionMatrixHtml` → `permissionDisclosureHtml(u, locked)`:
   - `if (locked) return '';` — keep.
   - Replace the `!u.permissions` guard with
     `if (!basePermissions_(u)) return '';` (phase 04 supplies
     `basePermissions_`; for phase 03 stub it as
     `u.permissions || presetPermissions_(u.presetKey)` and return `''` when
     both are absent — this alone makes the create form render once a base is
     picked, and covers R5).
   - Emit the button + `#perm-body` wrapper around the **existing** 5-group
     loop (`:671-692`) verbatim — the group markup is already reviewed and
     tested; do not rewrite it.
   - Add `aria-expanded` and `aria-controls="perm-body"` on the button,
     `id="perm-body"` on the body.
3. **`collect()`** — delete lines `730-731`. Replace with a computed flag:
   ```js
   var lockPermissions = isBusy() || u.isSelf || u.isLastAdmin;  // mirrors formCardHtml:571
   ```
   and read the checkboxes only when `!lockPermissions` (phase 04 finishes this;
   phase 03 must at minimum stop reading `#f-show-matrix`). **Do not** let
   `showPermissionMatrix` be written by `collect()` any more — it is owned by
   `onClick` alone.
4. **`onClick`** — add to the users-tab `switch` (`:1086`):
   ```js
   case 'toggle-perms':
     collect();
     state.user.showPermissionMatrix = !state.user.showPermissionMatrix;
     paintForm();
     break;
   ```
5. **`onChange`** — delete the `f-show-matrix` branch (`:1172-1176`).
6. Run `node tools/offline-tests/admin-ui.test.js`. Expect the two matrix
   assertions at `:249-268` to fail (they drive the old checkbox) — phase 05
   rewrites them. Record the exact failures; do not patch tests in this phase.

## Todo list

- [ ] Append the 6 CSS rules to `Styles.html` (no existing selector edited)
- [ ] `permissionMatrixHtml` → `permissionDisclosureHtml` with button + `#perm-body`
- [ ] Keep the 5-group loop byte-identical
- [ ] Delete the `#f-show-matrix` read in `collect()`
- [ ] Add `toggle-perms` to `onClick`; delete the `onChange` branch
- [ ] `aria-expanded` / `aria-controls` present and correct in both states
- [ ] Run the UI test; record which assertions now fail (hand to phase 05)

## Success criteria

1. Zero occurrences of `f-show-matrix` remain in `ViewsAdmin.html`.
2. Rendered HTML contains `data-act="toggle-perms"` and exactly one `#perm-body`.
3. Collapsed state renders `perm-body--collapsed` **and still emits all 14
   `#f-perm-*` inputs** (grep the painted output — this is what makes
   `collect()` single-source).
4. Locked user renders no `perm-disclosure` at all.
5. `state.presets === []` (fetch failed) on a create form renders no disclosure.
6. `balanced()` returns null for: collapsed create, expanded create, collapsed
   edit, expanded edit, locked edit.

## Risk assessment

| Risk | L×I | Mitigation |
|---|---|---|
| R6 — `collect()` still reads the removed checkbox → custom perms dropped | M×H | Step 3 deletes the read; success criterion 1 greps for the id. |
| Toggle loses typed input | M×M | `collect()` before flipping, exactly as the old handler did (`:1173`). |
| `<button>` inside the form submits something | L×L | No `<form>` element exists on this screen; every button already carries `type="button"` — keep that. |
| CSS collides with Orders/Inventory | L×M | All new selectors are `.perm-*`-prefixed and new; no existing selector is edited. |
| Rewriting the group loop introduces an escaping regression | M×M | Copy `:671-692` verbatim, including `T.esc(group.label)` / `T.esc(label)`. |

## Security considerations

- `lockPermissions` gating is UI advisory only (`PERMISSIONS.md` §4.5). Server
  re-checks on every save (`Admin.gs:257-280`). Do not weaken either side.
- All group and permission labels stay `T.esc`-wrapped.

## Next steps

Phase 04 adds base seeding, diff detection and the payload decision. Phase 05
repairs and extends the tests.
