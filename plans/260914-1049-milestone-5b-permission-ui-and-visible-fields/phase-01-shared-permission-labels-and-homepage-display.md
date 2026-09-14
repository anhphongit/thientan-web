---
phase: 1
title: "Shared Permission Labels and Homepage Display"
status: pending
priority: P2
effort: "3h"
dependencies: []
---

# Phase 1: Shared Permission Labels and Homepage Display

## Overview

Replace the homepage's raw permission-key display with Vietnamese labels, and
gate the list so non-admins only see permissions they were actually granted.
Requires extracting `ViewsAdmin.html`'s existing `PERMISSION_GROUPS` label map
into a shared partial, since it currently lives inside `ViewsAdmin.html`'s own
IIFE and is invisible to `App.html`'s IIFE.

## Context Links

- `apps/web/ui/App.html:186-213` — `homeHtml()`, the function being changed
- `apps/web/ui/App.html:75-77` — `can(name)` helper, reused for the admin gate
- `apps/web/ui/ViewsAdmin.html:69-114` — existing `PERMISSION_GROUPS` (source of
  truth for labels, currently module-private)
- `apps/web/ui/Index.html:6,153-157` — `include_()` composition order
- `apps/api/Auth.gs` — `parsePermissions_` (confirms `session.permissions`
  always contains all `PERMISSION_KEYS`, defaulting missing ones to `false`,
  so `Object.keys`/iterating `PERMISSION_GROUPS` both see the full universe)
- `docs/PERMISSIONS.md` §1 — canonical permission list/meaning, for label wording sanity-check

## Key Insights

- `ViewsAdmin.html` and `App.html` are each wrapped in their own
  `(function () { 'use strict'; ... })()` — a `var` inside one is invisible to
  the other. The only way two `ui/*.html` partials share state today is
  through a value attached to `window` before both load (Index.html's
  `include_()` order: `Styles` → `ViewsOrders` → `ViewsStats` →
  `ViewsInventory` → `ViewsAdmin` → `App`).
- `session.permissions` is guaranteed to have all 14 boolean keys present
  (missing → `false`) — no defensive "key might be absent" handling is needed
  when iterating `PERMISSION_GROUPS` instead of `Object.keys(session.permissions)`.
- "Admin" for this gate = `can('manage_users')`, per user decision — not a
  separate role flag. This matches `docs/PERMISSIONS.md`'s own framing of
  `manage_users` ("edit the permission matrix") and needs no new session field.
- The `visible_fields` line ("Cột được xem") is **removed from the homepage
  entirely** per user decision — it only needs to exist in the new admin
  editor (Phase 4). Do not add a labeled version of it here.
- `.perm` / `.perm.on` / `.perm-list` CSS classes already exist and already
  encode the granted/denied visual distinction — no new CSS needed, only the
  text content and which items get emitted change.

## Requirements

- Functional:
  - A new shared file exposes the permission-group→label structure as
    `window.PERMISSION_GROUPS` (same shape as today's array-of-groups).
  - `ViewsAdmin.html` reads from that shared global instead of declaring its
    own local array; its own behavior (matrix editor, presets, disclosure)
    is otherwise unchanged.
  - `homeHtml()`:
    - Non-admin (`!can('manage_users')`): renders ONLY granted permissions,
      each with its Vietnamese label, styled `perm on`. No denied items in
      the DOM at all (not just visually hidden).
    - Admin (`can('manage_users')`): renders all permissions with labels,
      granted styled `perm on`, denied styled plain `perm` — same visual
      shape as today, minus raw keys.
    - "Cột được xem" row and its computation are deleted from the account
      card.
- Non-functional: no new network calls (labels are static, bundled with the
  page); no change to what the server returns for `getSession`.

## Architecture

```
Index.html
  include_('ui/Styles')
  include_('ui/PermissionLabels')   <-- NEW, defines window.PERMISSION_GROUPS
  include_('ui/ViewsOrders')
  include_('ui/ViewsStats')
  include_('ui/ViewsInventory')
  include_('ui/ViewsAdmin')         <-- reads window.PERMISSION_GROUPS
  include_('ui/App')                <-- reads window.PERMISSION_GROUPS
```

## Related Code Files

- Create: `apps/web/ui/PermissionLabels.html` — new shared partial, one
  `<script>` block, no IIFE (must assign to `window` so sibling IIFEs can read it)
- Modify: `apps/web/ui/Index.html` — add one `include_('ui/PermissionLabels');`
  line before `ViewsAdmin` (and before `App`)
- Modify: `apps/web/ui/ViewsAdmin.html:69-114` — delete the literal array,
  replace with `var PERMISSION_GROUPS = window.PERMISSION_GROUPS;` (keeps
  every other reference to the bare identifier in the file working unchanged)
- Modify: `apps/web/ui/App.html:186-213` — rewrite `homeHtml()`

## Implementation Steps

1. Create `apps/web/ui/PermissionLabels.html`:
   ```html
   <script>
   /**
    * PermissionLabels.html — shared Vietnamese labels for the 14 boolean
    * permission keys (Milestone 5b). Single source of truth for both the
    * admin matrix editor (ViewsAdmin.html) and the homepage "Quyền hạn"
    * card (App.html) — two sibling IIFEs, neither able to see the other's
    * module-private state, so this lives on `window` instead.
    * Keep in sync with apps/api/Config.gs's PERMISSION_KEYS (14 keys).
    */
   window.PERMISSION_GROUPS = [
     { label: 'Quản lý đơn hàng', keys: [
       ['view_orders', 'Xem đơn hàng của tôi'],
       ['view_all_orders', 'Xem tất cả đơn hàng'],
       ['create_order', 'Tạo đơn hàng'],
       ['edit_order', 'Sửa đơn hàng'],
       ['delete_order', 'Xoá đơn hàng'],
       ['change_status', 'Đổi trạng thái']
     ]},
     { label: 'Duyệt đơn & Xuất dữ liệu', keys: [
       ['approve_order', 'Duyệt đơn hàng'],
       ['can_edit_approved_order', 'Sửa đơn đã duyệt'],
       ['search_filter', 'Tìm kiếm & Lọc'],
       ['export', 'Xuất dữ liệu']
     ]},
     { label: 'Thống kê', keys: [
       ['view_statistics', 'Xem thống kê'],
       ['export_statistics', 'Xuất thống kê']
     ]},
     { label: 'Kho hàng', keys: [
       ['manage_inventory', 'Quản lý kho hàng']
     ]},
     { label: 'Quản trị', keys: [
       ['manage_users', 'Quản lý người dùng']
     ]}
   ];
   </script>
   ```
   (Content copied verbatim from today's `ViewsAdmin.html:74-114` — no label
   wording changes in this phase.)
2. `apps/web/ui/Index.html`: add `<?!= include_('ui/PermissionLabels'); ?>`
   immediately after the `Styles` include (line 6), so it is defined before
   every view module that might reference it.
3. `apps/web/ui/ViewsAdmin.html`: delete lines 74-114 (the literal array) and
   its doc comment block (lines 69-73), replace with:
   ```js
   var PERMISSION_GROUPS = window.PERMISSION_GROUPS;
   ```
   placed at the same location. Everything else in the file (`permissionKeys_()`,
   `permissionDisclosureHtml()`, etc.) references the bare `PERMISSION_GROUPS`
   identifier and needs no further change.
4. `apps/web/ui/App.html`: rewrite `homeHtml()` (lines 186-213):
   ```js
   function homeHtml() {
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
   ```
5. **Fix `tools/offline-tests/admin-ui.test.js` immediately — this change WILL
   break it otherwise.** The harness loads `ViewsAdmin.html`'s raw script into
   a bare `vm` sandbox (`sandbox.window = {}`, `admin-ui.test.js:34-36,57,78-79`)
   and runs it directly with `vm.runInContext(src, sandbox, ...)`. Once
   `ViewsAdmin.html` reads `window.PERMISSION_GROUPS` instead of declaring its
   own literal, that global must exist in the sandbox BEFORE `src` runs, or
   `permissionKeys_()`'s `.forEach` throws on `undefined` and every test in the
   file fails. Fix: read and run `PermissionLabels.html` into each sandbox
   first, mirroring exactly how `src` itself is loaded:
   ```js
   const labelsSrc = fs.readFileSync(__dirname + '/../../apps/web/ui/PermissionLabels.html', 'utf8')
     .replace(/^<script>/, '').replace(/<\/script>\s*$/, '');
   ```
   then, immediately before **both** `vm.runInContext(src, sandbox, ...)` calls
   in the file (the main sandbox at line ~78-79, and the independent `sandboxK`
   built for Group K at line ~271-272), add
   `vm.runInContext(labelsSrc, sandbox /* or sandboxK */, { filename: 'PermissionLabels.html' });`.
   Do this as part of this phase, not deferred to Phase 5 — the suite must
   stay green at every commit.
6. Run the full offline test suite (`node tools/offline-tests/admin-ui.test.js`
   and the rest) to confirm the fix above works and nothing else regressed.

## Todo List

- [ ] Create `apps/web/ui/PermissionLabels.html`
- [ ] Wire it into `Index.html`'s include order
- [ ] Point `ViewsAdmin.html` at the shared global, remove the duplicate literal
- [ ] Rewrite `homeHtml()` in `App.html`
- [ ] Manually verify (or delegate to Phase 5) both an admin account and a
      restricted account's homepage render correctly

## Success Criteria

- [ ] A non-admin's homepage "Quyền hạn" card shows only their granted
      permissions, each as a Vietnamese label, zero denied items in the DOM
- [ ] An admin's homepage "Quyền hạn" card shows all 14 permissions, labeled,
      granted styled `perm on` and denied styled plain `perm`
- [ ] No raw snake_case permission key is ever rendered as visible text
- [ ] "Cột được xem" row no longer appears anywhere on the homepage
- [ ] `ViewsAdmin.html`'s existing matrix editor behavior is bit-for-bit
      unchanged (labels, checkboxes, presets, disclosure toggle)
- [ ] Offline test suite green

## Risk Assessment

- **Include-order regression**: if `PermissionLabels.html` is included AFTER
  `ViewsAdmin.html` or `App.html`, both would read `undefined` and throw on
  `.forEach`. Mitigation: place it right after `Styles.html`, first of all
  view-module includes, and add an explicit assertion/comment in the new file
  noting it must load first.
- **Confirmed test breakage, not hypothetical**: `admin-ui.test.js` evaluates
  `ViewsAdmin.html`'s source directly in a `vm` sandbox with no prior
  `window.PERMISSION_GROUPS` — every one of its ~50+ assertions depends on
  `TTAdmin.render()` not throwing, so this MUST be fixed in this same phase
  (step 5 above), verified before moving on, not left for Phase 5 to discover.
- **Divergent copies**: if a future change edits labels in one place and
  forgets this is now shared, only one file needs editing going forward —
  this phase *removes* the duplication risk rather than introducing it.

## Security Considerations

None — this is a pure display change. `session.permissions` already flows to
the client in full (M1 design: "the permissions received here are a UI HINT
ONLY", `App.html:5`); this phase only changes which of those already-visible
values get rendered as text, never what data reaches the browser.

## Next Steps

Phase 5 adds/updates offline test coverage for `homeHtml()` (none exists
today) and for the `ViewsAdmin.html`/`PermissionLabels.html` split.
