# Phase 02 — Linear form structure + status select (ViewsAdmin.html)

**Priority:** P2 · **Status:** pending · **Effort:** 1h15 · **Blocked by:** Phase 01
**File ownership:** `apps/web/ui/ViewsAdmin.html` (exclusive — phase 03 waits)

## Context

- `paintForm()` — `ViewsAdmin.html:435-449`
- `guardNoteHtml()` — `ViewsAdmin.html:458-473` (unchanged, keep call order)
- `formCardHtml()` — `ViewsAdmin.html:475-506` (rewritten here)
- `presetSelectHtml()` — `ViewsAdmin.html:508-533` (markup unchanged; two test
  regexes depend on its exact option strings — see phase 04)
- `field()` helper — `ViewsAdmin.html:381-384`
- `collect()` — `ViewsAdmin.html:616-646`
- Server response has `createdAt`, NOT `updatedAt` — `apps/api/Admin.gs:358-369`

## Key insights

1. The permission matrix is currently emitted **inside** `.form-grid`
   (`ViewsAdmin.html:495`) as a bare `<div>` sibling of `<label class="field">`
   elements — it becomes an implicit grid item. Moving to `.form-linear` +
   a dedicated `.form-section` removes that whole class of layout bug.
2. `collect()` defaults `active` to `true` when `#f-active` is missing
   (`ViewsAdmin.html:625-626`). Swapping the checkbox for a `<select>` must
   preserve a safe default — a naive `get('#f-active')` returns `''` on a
   missing node and would silently **deactivate the user on save**. This is
   the single highest-impact failure mode in this phase.
3. The offline test harness's `querySelector` returns `null` for every selector
   not in its `fieldValues` map (`admin-ui.test.js:21-22`) — so "node missing"
   is a real, exercised code path, not a theoretical one.

## Requirements

Functional
- Header: user display name (`<h2>`), sub-line with email + created timestamp,
  back button — all inside the existing `.view-head` shell.
- Section "THÔNG TIN NGƯỜI DÙNG": Email (disabled on edit / editable on create),
  Tên hiển thị, Nhóm quyền (select), Trạng thái (select).
- Section "GHI CHÚ": textarea.
- Actions: Lưu + Huỷ (unchanged `actionsHtml`, `ViewsAdmin.html:601-611`).
- `collect()` reads the new status select; payload shape unchanged.

Non-functional
- Single column at every width. No icons.
- Keep every `id="f-*"` unchanged except the status control (see below).
- Keep `guardNoteHtml()` output and the `lockPermissions` / `lockActive`
  computation exactly as-is (`ViewsAdmin.html:479-482`) — these mirror
  server-side guards.

## Architecture / new markup shape

```
.view-head            → h2 (name | "Thêm người dùng") + .user-head-meta + back link-btn
guardNoteHtml(u)      → unchanged .ro-note
section.card
  .form-linear
    .form-section  → .form-section-label "THÔNG TIN NGƯỜI DÙNG"
                     field(Email) field(Tên hiển thị)
                     field(Nhóm quyền) field(Trạng thái)
    [phase 03 inserts the permission section here]
    .form-section  → .form-section-label "GHI CHÚ" + textarea
.form-actions         → unchanged
```

## Related code files

Modify: `apps/web/ui/ViewsAdmin.html` — `paintForm`, `formCardHtml`, `collect`,
plus two new small helpers (`headMetaHtml`, `statusSelectHtml`).
Create: none. Delete: none.

## Implementation steps

1. **`headMetaHtml(u, isNew)`** — new helper near `field()` (`:381`). Returns
   `''` when `isNew`. Otherwise
   `'<div class="user-head-meta"><span>' + T.esc(u.email) + '</span>' +
    (u.createdAt ? '<span>· Tạo lúc ' + T.esc(T.formatDate(u.createdAt)) + '</span>' : '') + '</div>'`.
   `T.formatDate` is exported at `apps/web/ui/App.html:112` and stubbed in the
   test bridge (`admin-ui.test.js:47`). **Do not invent an `updatedAt` field** —
   see plan.md unresolved question 1.
2. **`paintForm()` (`:435-449`)** — insert `headMetaHtml(u, isNew)` between the
   `<h2>` and the back button inside `.view-head`. Keep the `busy` disabled
   logic on the back button byte-identical.
3. **`statusSelectHtml(u, lockActive)`** — new helper. Two options only:
   ```
   <select id="f-active" ...>
     <option value="active"   [selected]>Đang hoạt động</option>
     <option value="inactive" [selected]>Đã khoá</option>
   </select>
   ```
   Selected state from `u.active`. Emit ` disabled` when `lockActive`.
   Keep the id `f-active` so no other reference has to move; confirmed the only
   readers are `collect()` (`:625`) and the tests.
4. **`formCardHtml()` (`:475-506`)** — replace `.form-grid` with `.form-linear`
   and wrap fields in `.form-section` blocks per the shape above. Keep:
   - the `isNew` ternary for email (`:488-490`) verbatim, including
     `'<input value="' + T.esc(u.email) + '" disabled>'` — `admin-ui.test.js:200`
     matches `/value="admin@x.com" disabled/`;
   - the `presetSelectHtml(u, isNew, lockPermissions)` call (`:493-494`);
   - the `permissionMatrixHtml(u, lockPermissions)` call — leave it where the
     permission section will go; phase 03 rewrites the callee, not the call.
   Replace the `field-check` active label (`:496-499`) with
   `field('Trạng thái', statusSelectHtml(u, lockActive))`.
   Replace the `field-wide` note label (`:500-503`) with a `.form-section`
   containing a `.form-section-label` and the same `<textarea id="f-note">`.
5. **`collect()` (`:625-626`)** — replace
   ```js
   var activeEl = root.querySelector('#f-active');
   u.active = activeEl ? !!activeEl.checked : true;
   ```
   with a node-missing-safe read:
   ```js
   var activeEl = root.querySelector('#f-active');
   // Missing node must NOT mean "deactivate": keep whatever the record
   // already says (new users default active:true via blankUser()).
   u.active = activeEl ? (activeEl.value !== 'inactive') : (u.active !== false);
   ```
   Note `!== 'inactive'` rather than `=== 'active'`: a stubbed/odd value then
   fails safe toward "active", never toward locking someone out.
6. Sanity-compile: `node tools/offline-tests/admin-ui.test.js`. Expect the 3
   `#f-active` assertions (`:165, :208, :224-225`) to FAIL here — that is
   expected and fixed in phase 04. Every other assertion, especially
   `balanced()` (`:161, :196`), must still pass. If `balanced()` fails, the new
   markup has an unclosed tag — fix before proceeding.

## Todo

- [ ] Add `headMetaHtml()` helper
- [ ] Wire header meta into `paintForm()`
- [ ] Add `statusSelectHtml()` helper
- [ ] Rewrite `formCardHtml()` to `.form-linear` + `.form-section`
- [ ] Update `collect()` active read (fail-safe default)
- [ ] Run `node tools/offline-tests/admin-ui.test.js`; confirm ONLY the 3 known
      `#f-active` assertions fail and `balanced()` passes
- [ ] File stays under review-sized diff; ViewsAdmin.html total line count noted

## Success criteria

- `balanced()` passes for list, blank form, and both detail renders.
- Create flow still calls `apiCreateUser` with the typed email
  (`admin-ui.test.js:182-186` — the 2026-09-06 regression guard) — must stay green.
- Exactly 3 failing assertions, all `#f-active`, nothing else.
- Detail form is one column at 1280px (no `.form-grid` on this screen).

## Risks

| Risk | L×I | Mitigation |
|---|---|---|
| Status select silently deactivates a user when node missing | Med×**High** | Step 5's `u.active !== false` fallback + a dedicated phase-04 assertion for the missing-node path |
| Last-admin lock lost in the rewrite | Low×**High** | `lockActive` computation copied verbatim from `:480-482`; phase 04 re-asserts `disabled` on the select |
| Attribute reorder breaks an unrelated regex | **High**×Low | Steps 4 keeps the email input string verbatim; phase 04 enumerates every regex touched |
| `T.formatDate(createdAt)` throws on an empty string | Low×Med | Guarded by `u.createdAt ?` in step 1 |
| `.view-head` flex layout squashes the meta line on mobile | Med×Low | `.user-head-meta` wraps (phase 01); verify at 375px in phase 04 |

## Security considerations

- The status select is UI convenience only. `requireNotStrippingLastAdmin_` /
  `requireNotSelfRemovingAdmin_` (`apps/api/Admin.gs`, referenced at `:341`)
  still reject a forged request. Do not remove the server call's guard reliance.
- All interpolated user data keeps `T.esc()`. `admin-ui.test.js:135` asserts a
  hostile display name never reaches the DOM raw — every new interpolation
  (`u.email`, `u.createdAt`) must go through `T.esc`.

## Next steps

Commit, then start phase 03 (same file — strictly sequential).
