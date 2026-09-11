# Phase 03 — Config markup rebuild

**Owns:** `apps/web/ui/ViewsAdmin.html` (config render functions only)
**Blocked by:** 02
**Effort:** 1h15
**Priority:** P2

## Context links

- Functions being rewritten: `ViewsAdmin.html:1010-1026` (`configTabHtml`),
  `:1028-1055` (`configSectionHtml`), `:1057-1076` (`configStatusListEditorHtml`),
  `:1078-1093` (`configArrayEditorHtml`), `:1095-1102` (`configSkeletonHtml`)
- Class contract from phase 02
- Server-side key list + types: `apps/api/AdminConfig.gs:38-124`
- Convention to copy: `actionsHtml()` busy label `ViewsAdmin.html:798-802`;
  linear-form section markup `:1213-1226` classes as used by the user detail form
- HTML rules: `balanced()` in `tools/offline-tests/admin-ui.test.js:184-191`

## Overview

Render-only rewrite. Event handling (`onClick` `:1161-1207`, `onInput`
`:1248-1279`) is phase 04 — but this phase must **not break** the selectors those
handlers depend on. Contract to preserve exactly:

| Handler hook | Where read | Must keep |
|---|---|---|
| `.config-input` + `data-key` | `:1249-1251` | class + `data-key` on the string/number single inputs |
| `.config-status-key` / `.config-status-label` + `data-key` + `data-index` | `:1254-1267` | both classes + both attrs |
| `.config-array-item` + `data-key` + `data-index` | `:1270-1277` | class + both attrs |
| `data-act="add-status"` / `"add-array-item"` + `data-key` | `:1176-1195` | attrs (class may change to `btn-mini`) |
| `.config-delete-item` + `data-act="delete-config-item"` + `data-key` + `data-index` | `:1196-1207` | **`data-act` is currently MISSING on the delete button** (`:1068`, `:1085`) — see step 6 |
| `data-act="save-config"` | `:1172`, `:1283` | attr |
| `data-act="back-to-users"` | `:1166` | attr |

## Key insights

1. **The delete button is dead code today.** `onClick` matches
   `e.target.closest('[data-act], [data-open]')` (`:1152`) and then reads
   `data-act` (`:1159`); the delete buttons at `:1068` and `:1085` carry only
   `class="btn-icon config-delete-item"` + `data-key` + `data-index` — **no
   `data-act`**. So `closest()` walks past them to… nothing (`.config-list-item`
   has no `data-act` either), returns null, and `onClick` returns at `:1153`.
   `delete-config-item` (`:1196`) is unreachable. Verified by reading both.
   Fix: add `data-act="delete-config-item"`.
2. **`<h3>` shows the raw key** (`:1051`) — "statusList", "uomList". The UI is
   Vietnamese (`README.md`). Add a `CONFIG_LABELS` lookup with a **raw-key
   fallback**, so a future allowlist entry renders (ugly but functional) instead
   of blank.
3. Type dispatch must move off "sniff `value[0]`" (`:1034`, bug #3) and onto the
   *key*, because the server already defines the shape per key
   (`AdminConfig.gs:38-124`). A `CONFIG_EDITORS` map keyed by config key, with
   `item.type` as the fallback, is both correct and shorter.
4. `configSkeletonHtml` uses `class="card skeleton"` — `.skeleton` is undefined
   (grep → 0). Drop it; `.card` + `.sk-line`/`.sk-w40`/`.sk-w70` (`:740-751`) is
   the real convention.

## Requirements

Functional:
1. `configTabHtml()` — `.view-head` + `← Quay lại` (`btn btn-secondary`) +
   `.form-linear` wrapper + save bar with a busy label.
2. Save button: `disabled` when clean **or** busy; text `'Đang lưu...'` when
   `state.busyAction === 'saving-config'` (mirrors `:798-802`).
3. `configSectionHtml(item)` — `<section class="card">` + `<h3>` Vietnamese label
   + `<p class="config-desc">` server description + editor.
4. Status-list rows: `.config-row` > `.config-row-fields` with two `.field`s
   (labelled "Mã" / "Tên hiển thị") + delete `.btn-icon`.
   Existing rows: code input `disabled`, delete button **omitted**; new (unsaved)
   rows: both editable + deletable. See phase 04 for how "existing" is tracked.
5. String-list rows: one `.field` (`.config-row-fields--single`) + delete button.
6. `vatRates`: `type="number" step="0.01" min="0" max="1"`, `inputmode="decimal"`.
7. `currency`: single `.field`, `maxlength="10"` (matches `AdminConfig.gs:120`).
8. Empty list → `<p class="config-empty">Chưa có mục nào.</p>` + the `+ Thêm` button.
9. `+ Thêm` uses `class="btn-mini"` (not the undefined `btn-sm`).

Non-functional / a11y:
- Every input gets a unique `id="f-cfg-<key>-<index>-<field>"` and a
  `<label class="field-label" for=...>`; the per-row labels may be
  visually hidden on repeat rows only if `aria-label` is supplied instead.
- Delete buttons keep `aria-label="Xoá"` (already present at `:1069`, `:1086`).
- Locked code inputs get `aria-describedby` pointing at the section's
  "không thể xoá hoặc đổi mã trạng thái" note.
- Every value still goes through `T.esc()` — **no exceptions**, including labels
  from `CONFIG_LABELS` (they are literals, but keep the habit) and `data-key`.
- No self-closed non-void tags (`balanced()` will fail the build).
- Keep the whole config render block under ~110 lines; if it grows past that,
  the file (1376 lines) is due for a split — note it, do not do it here.

## Architecture

```
paintConfigTab()                       (:1006, unchanged)
 └─ configTabHtml()                    rewritten
     ├─ view-head + back button
     ├─ <div class="form-linear">
     │   └─ state.config.map(configSectionHtml)
     │        └─ <section class="card">
     │            ├─ <h3>{CONFIG_LABELS[key] || key}</h3>
     │            ├─ <p class="config-desc">{item.description}</p>
     │            └─ configEditorHtml(item, value)      NEW dispatcher
     │                 ├─ configStatusListEditorHtml    rewritten
     │                 ├─ configArrayEditorHtml         rewritten (+ numeric variant)
     │                 └─ configScalarEditorHtml        NEW (string|number)
     └─ configSaveBarHtml()             NEW (busy label + disabled logic)
```

`CONFIG_LABELS` (module constant, next to `PERMISSION_GROUPS` near `:69`):

```
statusList   → 'Danh sách trạng thái'
uomList      → 'Đơn vị tính'
customerList → 'Danh sách khách hàng'
vatRates     → 'Thuế suất VAT'
currency     → 'Đơn vị tiền tệ'
```

`CONFIG_EDITORS` → `{ statusList: 'statusList', uomList: 'strings',
customerList: 'strings', vatRates: 'numbers', currency: 'scalar' }`, falling back
to `item.type === 'array' ? 'strings' : 'scalar'` for unknown keys.

## Related code files

- Modify: `apps/web/ui/ViewsAdmin.html` — `:1010-1102` replaced; `CONFIG_LABELS`/
  `CONFIG_EDITORS` added near `:69`; `:403` left alone (class now defined by phase 02)
- Read: `apps/api/AdminConfig.gs:38-124`, `phase-01-mockup-option-<chosen>.html`
- Create / delete: none

## Implementation steps

1. Add `CONFIG_LABELS` + `CONFIG_EDITORS` constants after the
   `PERMISSION_GROUPS` block (~`:69-110`), with a one-line comment saying the
   server allowlist (`AdminConfig.gs:38`) is the source of truth and these are
   display-only with a raw-key fallback.
2. Rewrite `configTabHtml()` (`:1010-1026`): `.view-head`, `.form-linear`,
   `configSaveBarHtml()`.
3. Add `configSaveBarHtml()`: `.form-actions` (or `.config-save-bar` if option B),
   `btn btn-primary`, `disabled` when `!Object.keys(state.configEdits).length || isBusy()`,
   label `'Đang lưu...'` when `state.busyAction === 'saving-config'`.
4. Rewrite `configSectionHtml()` (`:1028-1055`) to use the label lookup and
   delegate to a new `configEditorHtml(item, value)` dispatcher driven by
   `CONFIG_EDITORS[item.key]`, never by `typeof value[0]`.
5. Rewrite `configStatusListEditorHtml()` (`:1057-1076`) to the `.config-row`
   shape. Code input `disabled` + no delete button when the row is a *saved*
   status; both enabled for rows the admin just added. Add the
   "Chỉ có thể thêm mới hoặc đổi tên hiển thị — không thể xoá trạng thái đã dùng."
   note (`.config-desc`), because that is exactly what
   `assertNoStatusKeyRemoval_` enforces (`AdminConfig.gs:225-241`).
6. Rewrite `configArrayEditorHtml()` (`:1078-1093`); add `data-act="delete-config-item"`
   to the delete button (insight #1) and a `numeric` variant for `vatRates`.
7. Add `configScalarEditorHtml()` for `currency` (and any future
   `string`/`number` key), keeping the `.config-input` class + `data-key`.
8. Fix `configSkeletonHtml()` (`:1095-1102`): drop `skeleton`, keep `.card` +
   3 `.sk-line`s so the skeleton height roughly matches a real section.
9. Run `node tools/offline-tests/admin-ui.test.js` — this is the syntax/compile
   check. Then run the whole suite.
10. Manual render: users tab → "Cài đặt hệ thống" → all 5 sections at 360px.

## Todo list

- [ ] `CONFIG_LABELS` + `CONFIG_EDITORS` added with raw-key fallback
- [ ] `configTabHtml` rebuilt (`.view-head` + `.form-linear` + save bar)
- [ ] Save bar has busy label + disabled-when-clean/busy
- [ ] `configSectionHtml` uses Vietnamese label + `.config-desc`
- [ ] Editor dispatch is key-driven, not `typeof value[0]`
- [ ] statusList rows: locked code, no delete on saved rows, guard note shown
- [ ] `data-act="delete-config-item"` present on every delete button
- [ ] `vatRates` uses `type="number"` + step/min/max/inputmode
- [ ] `currency` has `maxlength="10"`
- [ ] `btn-sm` → `btn-mini` at both call sites (grep `btn-sm` → 0)
- [ ] Empty-list state rendered
- [ ] Every input has `id` + `<label for>` or `aria-label`
- [ ] Skeleton no longer references undefined `.skeleton`
- [ ] `node tools/offline-tests/admin-ui.test.js` → 0 failed
- [ ] Full suite → no FAIL

## Success criteria

1. All five sections render with theme chrome (card, shadow, 44px inputs, focus ring).
2. `grep -n "btn-sm\|btn-secondary" apps/web/ui/ViewsAdmin.html` → only
   `btn-secondary` at `:403` and the back button, both now backed by a real rule.
3. Every `config-*` class in the emitted HTML exists in `Styles.html` (phase 05 asserts).
4. `balanced()` passes on the config-tab HTML.
5. No horizontal scroll at 360px; delete buttons still ≥40px.
6. Handler contract table above holds — clicking `+ Thêm` and delete both work
   (delete works for the *first time* after this phase).

## Risk assessment

| Risk | L×I | Mitigation |
|---|---|---|
| Renaming a class/attr silently breaks a handler | **High × High** | The contract table is the checklist; phase 05 adds a click-through test per action before this phase is considered done |
| Hiding delete on saved statuses reads as a bug to Phong | Med × Low | The guard note explains it in Vietnamese, and it replaces a save that *always* failed |
| `disabled` on the code input drops it from the payload | Low × High | Payload is built from `state.configEdits`/`state.config`, never from DOM reads (`saveConfig` `:1110-1118`) — traced, safe. Disabled inputs also fire no `input` events, which is the desired lock |
| Config render block pushes the file further past 200 lines | High × Low | File is already 1376 lines; project rule flags it, splitting `ViewsAdmin.html` into `ViewsAdminUsers`/`ViewsAdminConfig` includes is a separate task — note in the report, do not attempt here |
| `id` collisions with the users form's `#f-*` ids | Low × Med | Prefix all config ids `f-cfg-`; the two screens never coexist in the DOM anyway (`wrapper.innerHTML` replaces everything) |

## Security considerations

- Config values are admin-authored and re-rendered as HTML → **every**
  interpolation goes through `T.esc()`, including `data-key` and `value`.
  A malicious/mistyped customer name like `"><img onerror=…>` must not escape
  the attribute.
- The UI must not become the authorization boundary: rendering is gated by the
  nav (`App.html:139` requires `manage_users`), but the server re-checks on both
  actions (`AdminConfig.gs:137,179`). Do not add a client-side "trust me" path.
- Do not widen the rendered key set beyond what `apiListConfig` returns.

## Next steps

Phase 04 fixes the state handling behind this markup (mutation bug, dirty
tracking, row provenance for the statusList lock).
