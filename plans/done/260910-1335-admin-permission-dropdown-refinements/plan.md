---
title: "Admin user detail — Notes styling + role-extension permission dropdown"
description: "Fix unstyled Ghi chú textarea, and replace the checkbox permission matrix with a collapsible 'Nhóm quyền chi tiết' disclosure that extends a base role and auto-labels customisation."
status: completed
priority: P2
effort: 4h20
actual_effort: 4h
branch: main
tags: [ui, admin, permissions, viewsadmin, styles, api]
created: 2026-09-10
completed: 2026-09-10
---

# Admin user detail — UI refinements (M5.3b)

Two refinements on top of the completed linear-form redesign
(`plans/260910-1257-admin-user-detail-linear-form`, 44/44 passing):

1. `Ghi chú` textarea is unstyled (real CSS bug — root cause below).
2. Permission matrix becomes a collapsible **"Nhóm quyền chi tiết"** disclosure
   that starts from the selected base role's permissions, lets the admin add/
   remove on top, and auto-labels the result as customised when it diverges.

## Verified baseline (re-grepped 2026-09-10)

| Fact | Location |
|---|---|
| `Ghi chú` textarea rendered **bare inside `.form-section`**, not via `field()` | `apps/web/ui/ViewsAdmin.html:595-598` |
| `field()` wrapper (the thing that supplies `.field` styling) | `ViewsAdmin.html:455-458` |
| Only textarea styling in the app is `.field textarea` / `.field input,select,textarea` | `apps/web/ui/Styles.html:769-782` |
| No bare `textarea` / `.form-section textarea` rule exists anywhere | `Styles.html` (grep `textarea` → lines 201,203,769,775,776,780 only) |
| `permissionMatrixHtml()` — checkbox matrix, 5 groups | `ViewsAdmin.html:644-698` |
| Matrix **absent on create**: early-returns when `u.permissions` unset | `ViewsAdmin.html:645` + `blankUser()` has no `permissions` key `:477-480` |
| Matrix hidden for self/last-admin | `ViewsAdmin.html:646-647` |
| `presetSelectHtml()` — base role select `#f-preset`, "Giữ nguyên" on edit | `ViewsAdmin.html:603-637` |
| `collect()` — sets `showPermissionMatrix` **from the DOM checkbox** | `ViewsAdmin.html:730-731` |
| `collect()` **hardcodes** `perms.visible_fields = ['*']` | `ViewsAdmin.html:742` |
| `doSave()` 3-way intent: permissions > presetKey > omit | `ViewsAdmin.html:773-806` |
| `onChange` matrix toggle — `collect()` then `paintForm()` | `ViewsAdmin.html:1172-1176` |
| `onClick` delegation on `[data-act],[data-open]` | `ViewsAdmin.html:1027-1035` |
| Targeted (non-repaint) DOM update precedent | `ViewsAdmin.html:1149-1154` `updateSaveButtonState()` |
| `presetLabel()` → `'Tuỳ chỉnh'` when `presetKey` falsy | `ViewsAdmin.html:428-433` |
| `ensurePresetsLoaded()` — lazy once, `[]` on failure | `ViewsAdmin.html:193-207` |
| **Server sends only `{key,label}`** — no permissions payload | `apps/api/Admin.gs:147-155` |
| Preset definitions (4) incl. per-preset `visible_fields` | `apps/api/Config.gs:230-274` |
| `warehouse.visible_fields = DEFAULT_VISIBLE_FIELDS` (18 cols, **not** `['*']`) | `Config.gs:260`, `Config.gs:183-187` |
| Server-side equality used for the `presetKey` label | `Admin.gs:306-331` `matchPresetKey_` / `permissionsEqualPreset_` |
| `cleanPermissionMatrix_` — deny-by-default, validates `visible_fields` | `Admin.gs:194-230` |
| `buildUserResponse_` returns full `permissions` (incl. `visible_fields`) | `Admin.gs:344-370` |
| Custom matrix save writes `role: 'custom'` | `Admin.gs:81`, `Admin.gs:132-133` |
| `role` is display-only (`'admin'` → "Quản trị", else "Nhân viên") | `apps/web/ui/App.html:324`, `App.html:205` |
| Web proxy is transparent (no field stripping) | `apps/web/Main.gs:365-370`, `Router.gs:216` |
| Backend preset test asserts keys+label only (additive field is safe) | `tools/offline-tests/admin.test.js:31-37` |
| UI test baseline | `node tools/offline-tests/admin-ui.test.js` → **44 passed, 0 failed** (run 2026-09-10) |
| **Pre-existing, unrelated failures** — do NOT attempt to fix here | `orders-approvestatus-ui.test.js`, `orders-approvestatus.test.js` |

### Root cause — Issue 1

`ViewsAdmin.html:597` emits `<textarea id="f-note">` as a direct child of
`.form-section`. Every styled control in the app is `.field textarea` /
`.field input` (`Styles.html:769-782`), and there is no bare-element rule. The
textarea therefore renders with UA defaults: monospace font, ~20 chars wide, no
border radius, no focus ring, no `min-height`. Fix = wrap it in the existing
`field()` helper. **No new CSS is required** — this is a markup bug, not a
styling gap.

## Data flow (target)

```
apiListPermissionPresets  →  {presets:[{key,label,permissions}]}   ← NEW: permissions
   → state.presets
apiListUsers / apiGetUser →  buildUserResponse_ (Admin.gs:344)
   → state.user {permissions, presetKey}
      → basePermissions_(u)  = presets[selectedBaseKey].permissions
                             | u.permissions  (edit, no base chosen)
      → paintForm() renders matrix seeded from basePermissions_ overlaid
        with u.permissionsToSave (in-flight edits)
         → collect(): read 14 checkboxes + carry visible_fields from base
            → isCustomised = diff(collected, basePermissions_) ≠ ∅
               ├─ false → payload.presetKey = baseKey   (role = admin|staff)
               └─ true  → payload.permissions = collected (role = 'custom')
```

Server contract is **unchanged** — the same two mutually-exclusive payload
shapes `actionCreateUser_` / `actionUpdateUser_` already accept
(`Admin.gs:69-83`, `:119-133`). Only the *choice between them* becomes
diff-driven instead of checkbox-driven.

## Phases

| # | Phase | Owns | Blocked by | Effort | Status |
|---|-------|------|-----------|--------|--------|
| 01 | [Notes field styling fix](phase-01-notes-field-styling.md) | `apps/web/ui/ViewsAdmin.html` | — | 20m | ✅ completed |
| 02 | [Expose preset permissions to the client](phase-02-expose-preset-permissions.md) | `apps/api/Admin.gs`, `tools/offline-tests/admin.test.js` | — | 45m | ✅ completed |
| 03 | [Disclosure UI "Nhóm quyền chi tiết"](phase-03-permission-disclosure-ui.md) | `apps/web/ui/ViewsAdmin.html`, `apps/web/ui/Styles.html` | 01, 02 | 1h | ✅ completed |
| 04 | [Base-extension + customised auto-detect](phase-04-base-extension-and-autodetect.md) | `apps/web/ui/ViewsAdmin.html` | 03 | 1h | ✅ completed |
| 05 | [Tests + edge cases](phase-05-tests-and-edge-cases.md) | `tools/offline-tests/admin-ui.test.js` | 04 | 1h15 | ✅ completed |

**File ownership:** 01, 03, 04 all own `ViewsAdmin.html` → strictly sequential,
never parallel. 02 owns only server files + `admin.test.js` → **may run in
parallel with 01**. 05 owns only `admin-ui.test.js`.

**Mock-first gate (blocks phase 03).** `development-rules.md` → "UI Design
Process" requires 2-3 static HTML mockups of a new major component, approved by
the user, before implementation. The disclosure is a new component; phase 03
must not start until mockups are approved. Suggested variants: (a) button row +
inline `{base} + tuỳ chỉnh` badge, (b) button row + chevron with the state on a
second line, (c) segmented "Cơ bản / Chi tiết" switch. Phase 01 (markup bug fix)
and 02 (server) are exempt — no new component.

## Design decisions (answers to the open questions)

| Question | Decision | Why |
|---|---|---|
| What defines "customised"? | Any of the 14 booleans differs **or** `visible_fields` differs as a set, vs. the selected base preset. Mirrors `permissionsEqualPreset_` (`Admin.gs:314-320`) exactly. | Client and server must agree or the label flickers after save. |
| Compare role A vs role B side-by-side? | **No.** Selecting a base repaints the matrix with that base's values; that *is* the comparison. | YAGNI — not in the workflow, doubles the UI surface. |
| Can the user switch back to a preset after customising? | **Yes.** Picking any base resets all checkboxes to it. Guarded by `T.confirm` when the current state is customised. | Destroying edits silently is the only real hazard; `T.confirm` already exists in the TT bridge. |
| Persist which base a custom user came from? | **No new column, no migration.** On edit, if `presetKey === null` the base is unknown: auto-expand, seed from `u.permissions`, offer the base select. | Adding a `basePreset` column means a Users-sheet migration + `cleanPermissionMatrix_` would strip it (deny-by-default, `Admin.gs:199-202`). Spec 2c only requires "pick a different base or keep customising" — satisfied without persistence. |
| Label wording | Base label from `presetLabel()`; when customised append ` + tuỳ chỉnh`, e.g. `Nhân viên kinh doanh + tuỳ chỉnh`. Unknown base stays `Tuỳ chỉnh`. | UI is Vietnamese throughout; "Optimized" has no Vietnamese equivalent users would recognise. |
| Mobile | Disclosure is a full-width `<button data-act="toggle-perms">`, `min-height:44px`. Groups stay 1-col `<640px` (`Styles.html:1255-1257` unchanged). | Reuses the existing `onClick` delegation; `<details>`'s `toggle` event **does not bubble**, so it cannot work with this module's delegated listeners. |

## Cross-cutting implementation rules

1. **Always render the matrix DOM; the disclosure toggles a CSS class only.**
   Collapsed inputs stay queryable, so `collect()` has exactly one source of
   truth. No shadow copy of checkbox state in `state`.
2. **`collect()` must gate on `lockPermissions`, not on DOM presence.** See
   Risk R2 — this is the one change that can strip the last admin.
3. **Never hardcode `visible_fields`.** Carry it from the base preset (or from
   `u.permissions` when no base). `ViewsAdmin.html:742` is a live privilege bug.
4. **Label updates are targeted DOM writes**, not `paintForm()` — follow
   `updateSaveButtonState()` (`ViewsAdmin.html:1149-1154`). A full repaint on
   every checkbox click destroys focus.
5. No new dependency, no build step. `node tools/offline-tests/admin-ui.test.js`
   is the compile check — a syntax error fails it immediately.

## Risk register

| ID | Risk | L×I | Mitigation | Phase |
|---|---|---|---|---|
| R1 | Always-rendered matrix makes `permissionsToSave` always truthy → every create/edit writes `role:'custom'`, breaking the "Quản trị/Nhân viên" chip (`App.html:324`) | H×M | Set `permissionsToSave` **only when the diff is non-empty**; otherwise send `presetKey`. Asserted in 05. | 04 |
| R2 | For a locked user (`isSelf`/`isLastAdmin`) the matrix isn't rendered; if `collect()` still reads it, `querySelector` → `null` → all-false permissions → a plain displayName save tries to strip `manage_users` from the last admin | M×**H** | `collect()` recomputes `lockPermissions` and returns early without touching permissions. Server guards (`Admin.gs:257-280`) are the backstop, not the fix. Asserted in 05. | 04 |
| R3 | `visible_fields` hardcoded `['*']` silently escalates a `warehouse` user to all money columns on any matrix save, and makes warehouse always read as "customised" | H×H | Rule 3 above. Asserted in 05. | 04 |
| R4 | Client diff and server `permissionsEqualPreset_` disagree → label flips after save | M×L | Client mirrors the server algorithm incl. set-comparison of `visible_fields`; 05 asserts round-trip stability for all 4 presets. Duplication is unavoidable (separate Apps Script bundles) — comment both sides pointing at each other. | 04, 05 |
| R5 | `apiListPermissionPresets` fails → `state.presets = []` (`ViewsAdmin.html:202`) → no base permissions to seed from | M×M | Degrade to today's behaviour: hide the disclosure entirely, keep the base select's "Giữ nguyên", never send a permissions payload. Asserted in 05. | 03 |
| R6 | `collect()` still reads `#f-show-matrix` after the checkbox is removed → `showPermissionMatrix` forced false → custom perms silently dropped | M×H | Disclosure state lives in `state.user.showPermissionMatrix`, written by the `onClick` handler only. Delete the DOM read at `:730-731`. | 03 |
| R7 | Larger preset payload leaks permission internals | L×L | Endpoint already `requirePermission_(user,'manage_users')` (`Admin.gs:149`); presets are static code constants, not user data. Deep-clone on the way out (mirror `presetOrThrow_`, `Admin.gs:169-182`) so a caller can't poison the shared constant. | 02 |
| R8 | Test regexes are attribute-order sensitive (see prior plan) | M×L | 05 owns every assertion change; list each edited assertion in the phase file. | 05 |

## Test matrix

| Level | What | Where |
|---|---|---|
| Unit (server) | `actionListPermissionPresets_` returns 4 presets, each with a 15-key `permissions` object; result is a deep clone (mutating it doesn't affect `PERMISSION_PRESETS`) | `admin.test.js` |
| Unit (server) | Existing key/label assertions still pass unchanged | `admin.test.js:31-37` |
| Component (UI) | Notes field renders inside `.field` with `.field-label` | `admin-ui.test.js` |
| Component (UI) | Disclosure renders collapsed by default on create; label reads "Nhóm quyền chi tiết" | `admin-ui.test.js` |
| Component (UI) | Matrix now renders on the **create** form once a base is picked (regression vs. `:645`) | `admin-ui.test.js` |
| Component (UI) | Auto-expand on edit when `presetKey === null` | `admin-ui.test.js` |
| Component (UI) | Locked user (self+last-admin) → no disclosure, no permissions in payload | `admin-ui.test.js` |
| Component (UI) | Presets-fetch-failed → no disclosure, payload identical to today | `admin-ui.test.js` |
| Integration (payload) | 6 intent cases → exact payload shape (table in phase 05) | `admin-ui.test.js` |
| Integration (payload) | `visible_fields` for a warehouse base is `DEFAULT_VISIBLE_FIELDS`, not `['*']` | `admin-ui.test.js` |
| Markup | `balanced()` clean for every new render path | `admin-ui.test.js` |
| Manual | 375px and 1280px: disclosure tap target ≥44px, no horizontal scroll, textarea full width | `docs/MILESTONES.md` checklist |

## Definition of done

1. `node tools/offline-tests/admin-ui.test.js` → 0 failed, count ≥ 56.
2. `node tools/offline-tests/admin.test.js` → 0 failed.
3. Full sweep shows **only** the two pre-existing `orders-approvestatus*` failures.
4. Saving a user without touching permissions produces a payload byte-identical
   to today's (no `permissions`, no `presetKey`).
5. Editing a `warehouse` user and toggling one box sends
   `visible_fields === DEFAULT_VISIBLE_FIELDS`, never `['*']`.
6. Notes textarea renders full-width with the same border/focus ring as every
   other control, at 375px and 1280px.

## Rollback

One commit per phase, each touching one file (02 touches server + its own test).
`git revert <sha>` — nothing is persisted by any phase, no data migration, no
schema change. Reverting 04 alone leaves an expand/collapse UI that still saves
via the pre-existing checkbox semantics; reverting 03 and 04 together restores
today's screen exactly. Phase 02's extra response field is inert once the client
stops reading it.

## Unresolved questions

1. **Should an exact-match custom save be rewritten to `presetKey`?** Phase 04
   says yes (so `role` stays `admin`/`staff` and `App.html:324` shows the right
   chip). This *changes* today's behaviour: today, ticking the matrix and saving
   an unmodified sales profile writes `role:'custom'`. Confirm this is wanted —
   it is strictly an improvement but it is a behaviour change.
2. **Create form with no base selected:** disclosure hidden, or shown with an
   all-denied matrix? Plan assumes hidden (server rejects create with neither
   `presetKey` nor `permissions`, `Admin.gs:83`). An all-denied start would be a
   second, undocumented way to create a user.
3. **`T.confirm` on base switch — edit only, or create too?** Plan applies it
   whenever the current state is customised, regardless of create/edit. Simpler
   rule, one extra tap on create in a rare path.
