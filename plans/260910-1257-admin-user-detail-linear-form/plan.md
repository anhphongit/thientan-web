---
title: "Admin user detail — Option 1 linear form redesign"
description: "Restructure ViewsAdmin.html user detail into a linear form with grouped permission matrix, plus supporting CSS."
status: completed
priority: P2
effort: 4h
branch: main
tags: [ui, admin, permissions, viewsadmin, styles]
created: 2026-09-10
completed: 2026-09-10
test_results: 44/44 passing
---

# Admin user detail — Option 1 (Simple Linear Form)

Redesign the user detail screen in `apps/web/ui/ViewsAdmin.html` (currently a
3-column `.form-grid` with an inline-styled permission grid) into a linear,
single-column form with labelled sections and a 5-group permission matrix.
No backend change. No new dependency.

## Verified baseline (re-grepped 2026-09-10)

| Fact | Location |
|---|---|
| `paintForm()` — head + guard note + card + actions | `apps/web/ui/ViewsAdmin.html:435-449` |
| `formCardHtml()` — the `.form-grid` being replaced | `ViewsAdmin.html:475-506` |
| `presetSelectHtml()` — "Giữ nguyên" default on edit | `ViewsAdmin.html:508-533` |
| `permissionMatrixHtml()` — inline styles, flat 14 keys | `ViewsAdmin.html:540-599` |
| `actionsHtml()` — Lưu + Huỷ | `ViewsAdmin.html:601-611` |
| `collect()` — DOM → `state.user` | `ViewsAdmin.html:616-646` |
| `doSave()` — 3-way preset/permissions intent | `ViewsAdmin.html:669-726` |
| `onChange` matrix toggle (repaints WITHOUT collect) | `ViewsAdmin.html:1064-1075` |
| `field()` helper | `ViewsAdmin.html:381-384` |
| `.form-grid` 1→2 (≥640px) →3 (≥960px) cols | `Styles.html:764, 845-851` |
| `.field / .field-label / .field-wide / .field-check` | `Styles.html:765-783, 1167-1171` |
| Styles insert point (end of file) | `Styles.html:1204` before `</style>:1205` |
| Server response fields (NO `updatedAt`; has `createdAt`) | `apps/api/Admin.gs:344-370` |
| Tests asserting on this markup — 36 pass today | `tools/offline-tests/admin-ui.test.js:162-225` |

## Data flow (unchanged contract)

```
apiListUsers / apiGetUser  →  buildUserResponse_ (Admin.gs:358)
   → state.users[] → state.user (shallowCopy, ViewsAdmin.html:406-412)
      → paintForm() → DOM
         → collect() → state.user.{displayName,note,active,
                                   presetKeyToSave,permissionsToSave}
            → doSave() payload → apiCreateUser | apiUpdateUser
```
The redesign changes only the middle arrow (paintForm → DOM → collect). The
payload shape sent to the API must be byte-identical to today's.

## Phases

| # | Phase | Owns | Blocked by | Effort | Status |
|---|-------|------|-----------|--------|--------|
| 01 | [CSS foundation](phase-01-styles-linear-form-and-permission-groups.md) | `apps/web/ui/Styles.html` | — | 45m | ✅ completed |
| 02 | [Form restructure + status select](phase-02-viewsadmin-linear-form-structure.md) | `apps/web/ui/ViewsAdmin.html` | 01 | 1h15 | ✅ completed |
| 03 | [Grouped permission matrix + toggle fixes](phase-03-permission-matrix-groups-and-toggle.md) | `apps/web/ui/ViewsAdmin.html` | 02 | 1h15 | ✅ completed |
| 04 | [Tests + viewport verification](phase-04-tests-and-viewport-verification.md) | `tools/offline-tests/admin-ui.test.js` | 03 | 45m | ✅ completed |

Phases 02 and 03 both own `ViewsAdmin.html` — they MUST run sequentially, never
in parallel. 01 can start immediately and is independently shippable (pure
additive CSS, nothing references the new classes yet).

## Key dependencies / constraints

- **No build step.** These are Apps Script HTML includes; the offline tests
  strip `<script>` tags and `vm.runInContext` the file. Any syntax error breaks
  `node tools/offline-tests/admin-ui.test.js` immediately — that is the compile check.
- **Test regexes are attribute-order sensitive** (`/id="f-active" checked disabled/`).
  Any attribute reorder in the touched markup is a test change, listed in phase 04.
- **`balanced()` HTML checker** in the test rejects unclosed/self-closed non-void
  tags. Void list is `input, br, hr, img` only — do not self-close `<div/>`.
- **Server-side guards are authoritative.** `isSelf` / `isLastAdmin` locking is
  UI advisory only (`PERMISSIONS.md` §4.5); do not weaken or "improve" it.

## Definition of done

1. `node tools/offline-tests/admin-ui.test.js` → 0 failed (count ≥ 36).
2. `for f in tools/offline-tests/*.test.js; do node "$f" || echo "FAIL $f"; done` → no FAIL.
3. Save payloads for the 4 intent cases (create+preset, create+custom,
   edit+keep, edit+custom) unchanged vs. today — asserted in phase 04.
4. Detail form renders single-column at 375px and at 1280px with no horizontal scroll.

## Rollback

Each phase is one commit touching one file. `git revert <sha>` restores the
previous screen with no data migration — nothing is persisted by this change.
Reverting 02 or 03 alone leaves phase 01's unused CSS in place (harmless).

## Unresolved questions

1. **"Updated timestamp" in the header has no data source.** `buildUserResponse_`
   (`Admin.gs:358-369`) returns `createdAt` but no `updatedAt`/`updatedBy`.
   Plan assumes: render `createdAt` as "Tạo lúc {date}" via `T.formatDate`.
   Adding a real `updatedAt` means a Users sheet column + write path in
   `actionUpdateUser_` — out of scope, separate task.
2. **Status as a dropdown** (per spec) replaces the `#f-active` checkbox. This
   is a deliberate break of 3 existing assertions. Confirm the dropdown is
   wanted over keeping the checkbox — the checkbox is fewer moving parts.
3. Group label for `search_filter` + `export`: they are not "approval"
   permissions. Plan names group 2 "Duyệt đơn & Xuất dữ liệu" (still 4 items).
