---
title: "System config UI — theme alignment (M5.4)"
description: "Style the unstyled config tab in ViewsAdmin.html to match the Orders/Inventory theme, fix its list-editor state bugs, and make it usable at 360px."
status: pending
priority: P2
effort: 4h30
branch: main
tags: [ui, admin, config, viewsadmin, styles, m5.4]
created: 2026-09-10
---

# System config UI — theme alignment (Milestone 5 / 5.4)

The config tab (`ViewsAdmin.html:1010-1102`) renders with **zero CSS**: `grep -c
config apps/web/ui/Styles.html` = **0**. Every `config-*` class is undefined, and
two of the buttons it uses (`btn-secondary`, `btn-sm`) are undefined too. Result:
unstyled stacked inputs, primary-blue "back" buttons, no spacing, no focus ring,
no mobile layout.

No backend change. No new dependency.

## Verified baseline (re-grepped 2026-09-10)

| Fact | Location |
|---|---|
| `showConfigTab()` — entry, cache-first | `apps/web/ui/ViewsAdmin.html:955-976` |
| `configTabHtml()` — head + sections + actions | `ViewsAdmin.html:1010-1026` |
| `configSectionHtml()` — type dispatch, `<h3>` = raw key | `ViewsAdmin.html:1028-1055` |
| `configStatusListEditorHtml()` | `ViewsAdmin.html:1057-1076` |
| `configArrayEditorHtml()` | `ViewsAdmin.html:1078-1093` |
| `configSkeletonHtml()` — uses undefined `.skeleton` | `ViewsAdmin.html:1095-1102` |
| `saveConfig()` — sequential per-key saves, no busy label | `ViewsAdmin.html:1104-1145` |
| `onClick` config branch (add-status / add-array-item / delete) | `ViewsAdmin.html:1161-1207` |
| `onInput` config branch (shallow-`slice()` mutation bug) | `ViewsAdmin.html:1248-1279` |
| `updateSaveButtonState()` — never *removes* an edit key | `ViewsAdmin.html:1282-1287` |
| `wrapper = root` fallback when `document` undefined (makes config tab test-reachable) | `ViewsAdmin.html:219-234` |
| **Zero** `config` occurrences in Styles.html | `apps/web/ui/Styles.html` (grep count 0) |
| **`.btn-secondary` undefined** — used at `ViewsAdmin.html:403,1015` | grep `secondary` Styles.html → 0 hits |
| **`.btn-sm` undefined** — used at `ViewsAdmin.html:1073,1090` | grep `\.btn-sm` Styles.html → 0 hits |
| Reusable: `.form-linear/.form-section/.form-section-label` | `Styles.html:1213-1226` |
| Reusable: `.field/.field-label` (44px, 16px font, focus ring) | `Styles.html:765-783` |
| Reusable: `.btn-mini` (the real small-secondary button) | `Styles.html:103-110` |
| Reusable: `.btn-icon` (40px square, already used) | `Styles.html:497-505` |
| Reusable: `.card`, `.card h3`, `.view-head`, `.form-actions` | `Styles.html:388-396, 763, 457-462, 805-808` |
| Theme vars `--gap 16px`, `--r 10px`, `--shadow` | `Styles.html:14-16` |
| Styles insert point (end of file) | after `Styles.html:1286`, before `</style>:1287` |
| Busy-label convention `'Đang lưu...'` | `ViewsAdmin.html:798-802` |
| 5 editable keys + types (fixed allowlist) | `apps/api/AdminConfig.gs:38-124` |
| `statusList` **key removal server-rejected** | `AdminConfig.gs:194-196, 225-241` |
| Server invalidates both cache layers on write | `AdminConfig.gs:211` → `Router.gs:285` |
| `T.config()` = page-load snapshot of `session.config` | `App.html:113`, `apps/web/Main.gs:95` |
| Orders/Inventory read config via that snapshot | `ViewsOrders.html:192-195,445-447`; `ViewsInventory.html:89-90` |
| Test harness: vm + DOM stub, `balanced()` HTML check, VOID = input/br/hr/img | `tools/offline-tests/admin-ui.test.js:34-42,184-191` |
| **Zero** existing tests touch the config tab | grep `switch-to-config|apiListConfig` in `admin-ui.test.js` → 0 hits |

## The 5 keys this screen must render (fixed, allowlisted server-side)

| Key | Type | Shape | Editor |
|---|---|---|---|
| `statusList` | array | `[{key,label}]` | key+label pair rows; **key locked for existing rows** |
| `uomList` | array | `string[]` | one text input per row |
| `customerList` | array | `string[]` | one text input per row (can be long — auto-grown from orders) |
| `vatRates` | array | `number[]` | one **number** input per row (`0`–`1`) |
| `currency` | string | `string` | single text input (≤10 chars) |

## Data flow (contract unchanged)

```
apiListConfig → actionListConfig_ (AdminConfig.gs:136)
  → state.config[] = [{key,value,description,type}]         (ViewsAdmin.html:986)
     → configTabHtml() → DOM
        → onInput/onClick → state.configEdits[key]          (ViewsAdmin.html:1248-1279)
           → saveConfig() → apiUpdateConfig {key,value} × N  (ViewsAdmin.html:1134)
              → validate → lock → write → invalidateConfigCache_()
```
This plan changes only the middle arrows (render → DOM → `configEdits`). The
`{key, value}` payload per save call must stay byte-identical.

## Bugs found while verifying (fixed in phase 04, not "nice to have")

1. **Shallow-copy mutation** — `ViewsAdmin.html:1260-1266`: `list.slice()` copies
   the array but `list[idx]` is the *same object* as in `state.config`. Editing a
   status label mutates the cached original, so "Quay lại" (which clears
   `configEdits` at `:1168`) does **not** discard the edit — it reappears as if saved.
2. **Delete button on `statusList` rows the server refuses to delete** —
   UI offers `×` on every status (`:1068`); `assertNoStatusKeyRemoval_`
   (`AdminConfig.gs:225`) rejects the save. Editing an existing status *key* is
   also an effective removal → same rejection.
3. **Editor type flips when a list empties** — `:1034` picks the object editor
   only if `typeof value[0] === 'object'`. Delete every `statusList` row → next
   repaint renders it as a *string* list, producing invalid items.
4. **Save stays enabled after an edit is undone** — `updateSaveButtonState()`
   (`:1282`) only counts keys; it never deletes one, so a no-op save is sent.
5. **No busy feedback while saving** — `saveConfig()` sets
   `busyAction='saving-config'` (`:1121`) but `configTabHtml()` ignores it, and
   `isBusy()` (`:61`) silently swallows every click meanwhile.
6. **`vatRates` edited as free text** — falls into the string editor; server
   coerces with `Number()`, so `"abc"` → NaN → `CONFIG_VAT_INVALID_NUMBER`
   only *after* a round trip.

## Phases

| # | Phase | Owns | Blocked by | Effort | Status |
|---|-------|------|-----------|--------|--------|
| 01 | [Mockup options + approval gate](phase-01-mockup-options-and-approval.md) | `plans/260910-1512-*/phase-01-final-design.html` | — | 45m | ✅ APPROVED |
| 02 | [CSS foundation](phase-02-styles-config-sections.md) | `apps/web/ui/Styles.html` | 01 | 45m | in-progress |
| 03 | [Config markup rebuild](phase-03-viewsadmin-config-markup.md) | `apps/web/ui/ViewsAdmin.html` | 02 | 1h15 | pending |
| 04 | [Editor state + guard fixes](phase-04-config-editor-state-fixes.md) | `apps/web/ui/ViewsAdmin.html` | 03 | 1h | pending |
| 05 | [Tests + viewport verification](phase-05-tests-and-viewport-verification.md) | `tools/offline-tests/admin-ui.test.js` | 04 | 45m | pending |

**File ownership:** 03 and 04 both own `ViewsAdmin.html` — they MUST run
sequentially, never in parallel. 02 is pure-additive CSS and independently
shippable (nothing references the new classes until 03).

## Key dependencies / constraints

- **No build step.** These are Apps Script HTML includes. The offline test
  strips `<script>` tags and `vm.runInContext`s the file — that run *is* the
  compile check: `node tools/offline-tests/admin-ui.test.js`.
- **`balanced()` rejects self-closed non-void tags** (`admin-ui.test.js:184-191`).
  VOID = `input, br, hr, img` only. Never emit `<div/>`.
- **Additive CSS only.** Do not edit an existing selector in `Styles.html` —
  Orders/Inventory/Stats share nearly all of them. New rules go after `:1286`.
- **Server allowlist is authoritative** (`AdminConfig.gs:38-124`). The UI renders
  whatever `apiListConfig` returns; it must not hardcode the 5 keys as a
  *gate*, only as a label/hint lookup with a raw-key fallback.
- **Server guards are authoritative.** UI locking of `statusList` keys is
  advisory-first-line only; do not remove the server check.
- **Vietnamese UI** (`README.md`). All new copy in Vietnamese.

## Definition of done

1. `grep -c "config-" apps/web/ui/Styles.html` > 0 and every `config-*` class
   emitted by `ViewsAdmin.html` resolves to a rule (verified by the phase-05 script).
2. Zero references to undefined `btn-secondary` / `btn-sm` remain in
   `ViewsAdmin.html` (grep → 0).
3. `node tools/offline-tests/admin-ui.test.js` → 0 failed, count ≥ 44 + new config group.
4. `for f in tools/offline-tests/*.test.js; do node "$f" >/dev/null || echo "FAIL $f"; done`
   → no FAIL.
5. `apiUpdateConfig` payloads for all 5 keys unchanged vs. today (asserted in 05).
6. Config screen renders with no horizontal scroll at **360px**, 375px, 768px, 1280px.
7. Every input has an associated `<label for>` or `aria-label`; all tap targets ≥ 40px.
8. Undo-to-original disables the save button; "Quay lại" truly discards edits.

## Rollback

One commit per phase, each touching one file. `git revert <sha>` restores the
previous screen — nothing here is persisted, no migration. Reverting 03/04 leaves
phase 02's unused CSS behind (harmless, additive). Phase 06 is separately
revertable and is the only one with cross-view blast radius.

## Decisions (user input 2026-09-10)

1. ✅ **Phase 06 as separate task** — Don't ship config cache refresh now. Log it separately.
2. ✅ **`manage_config` permission is a mistake** — It doesn't exist; checklist was from another conversation. Code correctly gates on `manage_users`.
3. ✅ **Plain bottom bar** — Use the same `.form-actions` bar as Orders/Inventory forms. No sticky behavior.
4. ✅ **Fold `--c-text-dim` fix into phase 02** — Fix the undefined variable alongside new config CSS.
