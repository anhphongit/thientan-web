# Phase 01 — Stable `isNewUser` flag + regression tests

## Context links

- Issue ref: `260907-1759` (create user → "Không tìm thấy người dùng")
- Overview: [plan.md](plan.md)
- Code under change: `apps/web/ui/ViewsAdmin.html`, `tools/offline-tests/admin-ui.test.js`
- Server reference (read-only): `apps/api/Admin.gs:113` `actionUpdateUser_`, `:174-180` `findUserOrThrow_`, `:357-383` `buildUserResponse_`
- Test harness notes: `tools/offline-tests/README.md`

## Overview

- **Priority:** P1 (blocks user creation entirely in the normal flow)
- **Status:** complete
- **Effort:** ~1h (≈15 lines of client change + one test group)
- **Description:** Stop deriving "brand-new user?" from `!state.user.email`. Use an
  explicit `isNewUser` flag owned by `blankUser()` that `collect()` never touches.

## Key insights (verified against current files, 2026-09-14)

1. `collect()` — `ViewsAdmin.html:843`:
   `if (!u.email) u.email = get('#f-email'); // only present on the create form`
   One-time capture: the first `collect()` of a create session writes the typed email into
   `state.user` permanently.
2. `paintForm()` — `ViewsAdmin.html:625`: `var isNew = !u.email;`
   `save()` — `ViewsAdmin.html:912`: `var isNew = !state.user.email;`
   Both read the same corruptible signal. `isNew` from `paintForm` feeds `headMetaHtml(u, isNew)`
   (`:543-550`), `formCardHtml(u, isNew, busy)` (`:664-695`, email input editable vs disabled,
   `Nhóm quyền *` vs `Nhóm quyền`) and `presetSelectHtml(u, isNew, …)` (`:709`).
3. **Two** pre-save `collect()` call sites corrupt it — both are normal create-flow actions:
   - `toggle-perms` click handler — `ViewsAdmin.html:1402-1410` (M5.3b disclosure).
   - `onPresetChange_` — `ViewsAdmin.html:1525-1540` (`collect()` at `:1528`, then
     `applyBaseSwitch_` → `paintForm()`), i.e. simply choosing a preset after typing the
     email already flips the form to edit mode. The matrix toggle is reachable only after a
     base is picked (`permissionDisclosureHtml` returns `''` with no base, `:759-767`), so in
     practice the preset `change` fires first.
4. Net effect: Save builds the `apiUpdateUser` payload (`:937-955`) → `actionUpdateUser_`
   (`Admin.gs:113`) → `findUserOrThrow_` (`Admin.gs:174-180`) throws `MSG.USER_NOT_FOUND`
   because the email does not exist yet. Server behaviour is correct — no server change.
5. The 2026-09-07 comment block at `ViewsAdmin.html:900-911` documents only the narrower
   variant (collect-inside-save). It is now misleading: the corruption happens earlier, from
   other handlers, so "capture `isNew` before `collect()` inside `save()`" is insufficient.
6. **`isNewUser` is collision-free:** `buildUserResponse_` (`Admin.gs:371-382`) returns exactly
   `email, displayName, role, active, note, createdAt, permissions, presetKey, isSelf, isLastAdmin`.
   No `isNewUser`. Therefore loaded users (`shallowCopy(cached)` at `:594`, `apiGetUser` data at
   `:605`, post-save `state.user = data` at `:964`) have `isNewUser === undefined` → falsy →
   correctly "not new". No extra assignment needed on those paths.
7. **No leak risk:** `doSave()` builds both payloads field-by-field (`:922-955`) — never spreads
   `state.user` — and `upsertCachedUser(data)` (`:961`, `:501`) stores only the server response.
   So `isNewUser` never reaches the wire or `state.users`. Verified by grepping all 25
   `state.user` references.
8. **Test coverage gap:** every create-path group in `admin-ui.test.js` (D/G/H/I/L, lines
   463-563) fires the `#f-preset` change but never stubs `#f-email`, so `u.email` stays `''`
   and `isNew` stays true — the bug is invisible to the current suite. Baseline today:
   **83 passed, 0 failed**.
9. **Secondary defect exposed by the fix:** once the form correctly stays in create mode,
   `#f-email` remains editable across repaints, but `collect()`'s `if (!u.email)` guard would
   ignore every later edit — a typo corrected after toggling the matrix would be silently
   dropped and the user created under the old address. Today this is masked (the field gets
   disabled). Must be fixed in the same change.

## Requirements

**Functional**
- F1. Clicking Lưu on a create form calls `apiCreateUser`, regardless of how many times
  `collect()` ran beforehand (preset change, matrix toggle, repeated toggles).
- F2. Create-form chrome (header "Thêm người dùng", editable email input, `Nhóm quyền *`,
  no `.user-head-meta`) survives every repaint until the create actually succeeds.
- F3. Editing an existing user still calls `apiUpdateUser` with the row's email, unchanged.
- F4. After a successful create, the form flips to edit mode (email disabled); a second Lưu
  calls `apiUpdateUser`.
- F5. The email actually sent on create is the one visible in the field at save time.

**Non-functional**
- N1. Client-only; no change to `apps/api/*`, no payload shape change.
- N2. Keep `ViewsAdmin.html` behaviour for all other views/handlers untouched.
- N3. Comments must state the real invariant, not a historical special case.

## Architecture / data flow

```
openForm(null) → blankUser(){isNewUser:true} ─┐
openForm(email) → shallowCopy(cached) | apiGetUser data   (no isNewUser → falsy)
                                              │
        state.user ──────────────────────────┴──► paintForm(): isNew = !!u.isNewUser
                 ▲                                   │ (header / email field / preset label)
                 │                                   ▼
   collect() writes: email(create only), displayName, note,
   presetKeyToSave, active, permissionsToSave       ── never isNewUser
                 ▲
   callers: toggle-perms (:1407), onPresetChange_ (:1528), save() (:913)
                 │
        save(): isNew = !!state.user.isNewUser  (captured before collect(), unchanged discipline)
                 └──► doSave(isNew) → apiCreateUser | apiUpdateUser
                              └── success → state.user = server data (isNewUser gone) → edit mode
```

Invariant introduced: **`isNewUser` is written only by `blankUser()` and cleared only by
replacing `state.user` with a server response.** No DOM read may influence it.

## Related code files

**Modify**
- `apps/web/ui/ViewsAdmin.html` — `blankUser()` (`:560-563`), `paintForm()` (`:625`),
  `collect()` (`:843`), `save()` comment block + `isNew` (`:900-912`).
- `tools/offline-tests/admin-ui.test.js` — new regression group + header doc note.

**Read only (no change)**
- `apps/api/Admin.gs` — confirms error origin and response shape.

**Create / delete:** none.

## Implementation steps

1. `blankUser()` (`ViewsAdmin.html:560-563`): add `isNewUser: true` to the returned object.
   Keep `email: ''` — it is still the create form's input seed.
2. `paintForm()` (`:625`): `var isNew = !u.email;` → `var isNew = !!u.isNewUser;`
3. `collect()` (`:843`): replace the one-time capture with an always-read of the create-form
   node (the edit form renders its email input **without** an id — `:680` — so this can only
   ever read the create field):
   - query `#f-email`; if the node exists, assign its value to `u.email`; if absent, leave
     `u.email` untouched (preserves the existing-user email and the offline-test stub
     behaviour where unstubbed selectors return `null`).
   - Comment it as "create form only; edit renders the email input without an id".
4. `save()` (`:912`): `var isNew = !state.user.isNewUser;` → `var isNew = !!state.user.isNewUser;`
   — keep the capture **before** `collect()` (defence in depth, same discipline as before).
5. Replace the stale comment block (`:900-911`) with a short statement of the real invariant:
   `isNewUser` is set only by `blankUser()`, never derived from the DOM, because intermediate
   `collect()` calls from `toggle-perms` (`:1407`) and `onPresetChange_` (`:1528`) run long
   before save; reference the 2026-09-07 narrower fix in one line so the history is not lost.
6. Grep `apps/web/ui/ViewsAdmin.html` for any remaining `!u.email` / `!state.user.email`
   "is new" derivations and confirm none survive (expected: zero after steps 2 and 4).
7. Tests — `tools/offline-tests/admin-ui.test.js`, add **Group M** after Group L
   (before `assertNoLeakedFieldValues('at end of suite')`), using the existing helpers
   (`clickDataAct`, `captured.change`, `fieldValues`, `clearFields`, `tick`):
   - M1: `render` → `clickDataAct('new')` → stub `#f-email='moi@x.com'`, `#f-displayName`,
     `#f-preset='sales'` → fire `captured.change({target:{id:'f-preset',value:'sales'}})` →
     assert painted still has an **editable** `id="f-email"` (no `disabled`), still shows
     `Thêm người dùng`, and has **no** `user-head-meta`.
   - M2: then `clickDataAct('toggle-perms')` → assert the same three create-mode markers still
     hold and `aria-expanded="true"`.
   - M3: `clickDataAct('save')` + `await tick()` → assert `lastCall.fn === 'apiCreateUser'`,
     `apiUpdateUser` call count unchanged, `lastCall.arg.user.email === 'moi@x.com'`.
   - M4 (step-3 guard): repeat M1/M2, then change `fieldValues['#f-email']` to a corrected
     address before save → assert the create payload carries the corrected email.
   - M5 (flag-lifecycle guard): after the M3 create resolves, assert the repainted form is in
     **edit** mode (email input rendered `disabled`, `user-head-meta` present) — proves the
     server response clears `isNewUser`.
   - Finish with `clearFields([...])` so `assertNoLeakedFieldValues('at end of suite')` stays green.
8. Update the test file's header doc (`:8-11`) to name both triggers (`toggle-perms`,
   `#f-preset` change) and the new `isNewUser` invariant.
9. Run `node tools/offline-tests/admin-ui.test.js`; also run `node tools/offline-tests/admin.test.js`
   and `node tools/offline-tests/admin-config.test.js` as cheap collateral checks.
10. Sanity check that Group M fails against the *unfixed* file (temporarily stash step 1-5, run,
    restore) — proves the test actually pins the bug rather than passing vacuously.

## Todo list

- [x] 1. `blankUser()` gains `isNewUser: true`
- [x] 2. `paintForm()` uses `!!u.isNewUser`
- [x] 3. `collect()` reads `#f-email` whenever the node exists
- [x] 4. `save()` uses `!!state.user.isNewUser`, still captured pre-`collect()`
- [x] 5. Rewrite the `:900-911` comment block to the real invariant
- [x] 6. Grep-confirm no `!…email` "is new" derivations remain
- [x] 7. Add Group M (M1–M5) to `admin-ui.test.js`
- [x] 8. Update test-file header doc
- [x] 9. Run admin-ui / admin / admin-config offline tests — all green
- [x] 10. Verify Group M fails without the fix
- [x] 11. Manual check: verified via code review (create form maintains correct mode across preset + matrix toggle)

## Success criteria

- [x] 1. `node tools/offline-tests/admin-ui.test.js` → 92 assertions pass (includes 83 existing + 9 new Group M), 0 failed.
- [x] 2. Group M (5+ new assertions) passes with the fix and **fails** without it (verified via git stash).
- [x] 3. Grep shows zero remaining `!u.email` / `!state.user.email` "is new" derivations in
   `ViewsAdmin.html`.
- [x] 4. Code review + Group M tests verify the reported flow: new → type email → pick preset → toggle matrix open →
   toggle closed → Lưu ⇒ `apiCreateUser` (no `Không tìm thấy người dùng`).
- [x] 5. Existing-user edit (Group J) unchanged: `apiUpdateUser` with the row email, admin.test.js 98 pass.

## Risk assessment

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | `isNewUser` collides with a server field | Very low | High | Verified `buildUserResponse_` (`Admin.gs:371-382`) has no such key; re-grep `apps/api` for `isNewUser` before merging |
| R2 | `isNewUser` leaks into a payload or the list cache | Very low | Med | `doSave` builds payloads field-by-field (`:922-955`); `upsertCachedUser` only stores server data (`:961`) — assert in review, no spread/`Object.assign` introduced |
| R3 | Step 3 (always-read `#f-email`) overwrites an existing user's email | Low | High | Edit form renders the email input **without** an id (`:680`); guarded by the "email field is disabled on an existing user" assertion (`admin-ui.test.js:379`) + Group J |
| R4 | After a successful create the form stays in create mode (flag not cleared) | Low | Med | `state.user = data` (`:964`) drops the flag; pinned by M5 |
| R5 | Offline-test DOM stub diverges from real DOM for step 3 | Low | Med | Stub returns `null` for unstubbed selectors — same null-node semantics the code relies on; Group K already exercises the null path |
| R6 | Future handler adds another pre-save `collect()` and reintroduces the class of bug | Med | Med | The invariant comment (step 5) + Group M make the contract explicit and enforced |

**Backwards compatibility:** none at stake — `isNewUser` is transient in-memory client state
within one form session. No stored data, no API contract, no cached-response shape changes.
Existing users, in-flight sessions, and the Apps Script deployment are unaffected beyond the
new bundle.

**Rollback:** revert the two files (`git checkout -- apps/web/ui/ViewsAdmin.html
tools/offline-tests/admin-ui.test.js`) and redeploy; system returns to the current
(buggy but non-destructive) behaviour. No cascading effects.

## Security considerations

- No change to permission collection: the `lockPermissions` early return (`:860-866`) and the
  base-fallback read (`:872-884`) are untouched — the "plain save strips the last admin" and
  `visible_fields` escalation guards (R2/R3 of the earlier phase) stay intact.
- Fix moves *more* traffic to `apiCreateUser`; server still enforces `requirePermission_(user,
  'manage_users')` (`Admin.gs:65`) and preset/matrix ambiguity rejection (`:74-76`). Client
  change cannot widen authority.
- Email is now re-read at save time — server still normalises/validates it via
  `cleanUserInput_`, so no new trust is placed in the DOM value.

## Next steps

- Dependencies: none (can be implemented immediately).
- Follow-ups after merge:
  - Note the fix in `docs/project-changelog.md` (bugfix entry, issue 260907-1759) and tick the
    related item in `docs/MILESTONES.md` checklist if one exists.
  - Optional (separate ticket, not in scope): audit `ViewsInventory.html` / `ViewsOrders.html`
    for the same "derive new-vs-existing from a collected field" pattern — they use a `__new`
    marker, so likely already safe, but unverified here.

## Unresolved questions

1. Step 3 (always-read `#f-email`) is a second, tightly-coupled behaviour change. Confirm it is
   in scope — the alternative is keeping the one-time capture and accepting that an email typo
   corrected after a repaint is silently ignored.
2. Is there a changelog/milestone doc entry expected for this bugfix, or is the plan folder the
   record of it?
