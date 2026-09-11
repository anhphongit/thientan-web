# Phase 04 — Editor state + guard fixes

**Owns:** `apps/web/ui/ViewsAdmin.html` (state / handler functions only)
**Blocked by:** 03 (same file — strictly sequential)
**Effort:** 1h
**Priority:** P2 — three of these are correctness bugs, not polish

## Context links

- `onClick` config branch: `ViewsAdmin.html:1161-1207`
- `onInput` config branch: `ViewsAdmin.html:1248-1279`
- `updateSaveButtonState()`: `:1282-1287`
- `saveConfig()`: `:1104-1145`
- `state` shape: `:56-59`
- Server guard being respected: `apps/api/AdminConfig.gs:194-196, 225-241`
- Validators (what the server will reject): `AdminConfig.gs:38-124`

## Overview

Phase 03 made the screen look right. This phase makes it *behave* right. Four
verified defects plus the row-provenance the statusList lock needs.

## Key insights (all re-verified against the file)

1. **Shallow-copy mutation corrupts the cache.** `:1258-1266`:
   ```js
   var list = state.configEdits[key] || state.config.find(…).value || [];
   list = list.slice();          // copies the ARRAY
   if (!list[idx]) list[idx] = {};
   list[idx].label = e.target.value;   // mutates the ORIGINAL object
   ```
   `slice()` is shallow, so `list[idx]` is the identical object held by
   `state.config`. Typing a label edits the cached server value. Then
   `back-to-users` clears `configEdits` (`:1168`) believing that discards the
   edit — it does not, and because `configCacheIsFresh()` (`:978`) may still be
   true, re-entering the tab shows the phantom edit as if persisted.
   The string-list path (`:1270-1277`) and the delete path (`:1200-1203`) are
   safe (they replace elements, never mutate them); only the object path is broken.
2. **`delete-config-item` is unreachable** — no `data-act` on the button
   (`:1068`, `:1085`); `onClick`'s `closest('[data-act], [data-open]')` (`:1152`)
   finds no ancestor with one and bails at `:1153`. Phase 03 adds the attribute;
   this phase is where the handler is actually exercised.
3. **Dirty tracking is one-way.** `updateSaveButtonState()` (`:1282`) counts keys;
   nothing ever deletes one. Type a char, delete it → still "dirty" → a pointless
   `apiUpdateConfig` round trip on save.
4. **Editor identity flips when a list empties** — `:1034` sniffs `value[0]`.
   Phase 03 fixed the *render*; this phase must make sure `add-status` on an
   empty `statusList` still pushes an object, not a string. It already does
   (`:1181`), because `add-status` is a distinct action — but the empty-array
   fallbacks at `:1178`/`:1188`/`:1199` (`|| []` after a `.find()` that can be
   `undefined`) will **throw** if the key vanished from `state.config`
   (`.find(...)` → `undefined` → `.value` → TypeError). Harden with a helper.
5. **`statusList` needs row provenance.** The lock in phase 03 ("existing rows
   are read-only") requires knowing which rows came from the server. The clean
   way with no schema change: compare against
   `state.config.find(k).value` (the pristine list) by index — rows at an index
   `< originalLength` whose `key` matches the original are "saved". Simpler and
   robust: mark rows added in this session with a non-persisted `__new: true`
   flag, and **strip it in `saveConfig()`** before sending. Chosen: the
   `__new` flag, because the index comparison breaks as soon as a delete shifts
   indices.

## Requirements

Functional:
1. Editing a status label/code never mutates `state.config`.
2. Undoing an edit back to the original value removes the key from
   `state.configEdits` and disables the save button.
3. `back-to-users` genuinely discards all unsaved edits.
4. Delete works on string/number list rows and on `__new` status rows only.
5. `add-status` pushes `{key:'', label:'', __new:true}` — **empty**, not the
   current `{key:'new_status', label:'Trạng thái mới'}` placeholder (`:1181`),
   which is a real value that will be saved verbatim if the admin forgets to
   type. Empty + client-side "required" feedback is safer given the server
   rejects empty (`CONFIG_STATUS_EMPTY_FIELD`, `AdminConfig.gs:52`).
6. `__new` never reaches the wire.
7. `vatRates` inputs write **numbers** into `configEdits`, not strings.
8. `saveConfig()` shows `'Đang lưu...'` and repaints on completion.
9. All three `.find()` fallbacks hardened against a missing key.

Non-functional:
- No change to the `{key, value}` payload shape.
- No new state fields beyond what is listed; `state.configEdits` stays a
  `key → value` map.
- Client-side validation stays *advisory* — the server validators
  (`AdminConfig.gs:38-124`) remain the authority. Do not duplicate their rules
  beyond the cheap ones (empty / duplicate) needed for good feedback.

## Architecture

Three small helpers, added next to the config block:

```js
configItem_(key)        // state.config lookup, returns null (never throws)
configValue_(key)       // configEdits[key] ?? deep copy of pristine value
configDeepCopy_(value)  // array of objects → map to fresh objects; else slice()
markEdit_(key, value)   // set configEdits[key], or DELETE it when the value
                        // deep-equals the pristine one; then updateSaveButtonState()
```

`markEdit_` replaces the 4 hand-rolled `state.configEdits[key] = …;
updateSaveButtonState();` pairs at `:1251`, `:1267`, `:1277` and the `onClick`
assignments at `:1182`, `:1192`, `:1203` (those repaint, so they call
`markEdit_` then `paintConfigTab()`).

Deep-equality via `JSON.stringify` — the values are small (≤ dozens of
strings/2-key objects), the app already leans on `JSON.stringify` comparison in
`admin-ui.test.js`, and property order is stable because both sides are built by
the same code path.

`saveConfig()` (`:1104-1145`) additionally:
- strips `__new` from `statusList` items before `T.call` (`:1134`);
- calls `paintConfigTab()` after `busyAction = null` on the success path
  (currently only `silentRefreshConfig` repaints, and it early-returns when
  `configRefreshing` is already true — `:995`);
- keeps the sequential-save loop as is (5 keys max, YAGNI on batching).

## Related code files

- Modify: `apps/web/ui/ViewsAdmin.html` — `:1104-1145`, `:1161-1207`, `:1248-1287`,
  plus the 4 new helpers
- Read: `apps/api/AdminConfig.gs:38-124` (what the server rejects)
- Create / delete: none

## Implementation steps

1. Add `configItem_`, `configValue_`, `configDeepCopy_`, `markEdit_` immediately
   above `saveConfig()`.
2. Replace the `state.configEdits[key] || state.config.find(…).value || []`
   pattern at `:1178`, `:1188`, `:1199`, `:1258`, `:1273` with `configValue_(key)`.
3. Route every write through `markEdit_(key, value)`; delete the manual
   `updateSaveButtonState()` calls it now owns.
4. `add-status` (`:1176-1185`): push `{ key: '', label: '', __new: true }`.
5. `delete-config-item` (`:1196-1207`): for `statusList`, refuse when the row
   lacks `__new` (defence in depth — phase 03 also omits the button) and
   `T.toast('Không thể xoá trạng thái đã lưu.', true)`.
6. `onInput` numeric path: for `vatRates`, store `Number(e.target.value)`; store
   the raw string when the field is mid-typing and unparseable (`''`, `'0.'`) so
   the input does not fight the user — the server coerces anyway
   (`AdminConfig.gs:106`). Note this explicitly in a code comment.
7. `saveConfig()`: strip `__new`; repaint after success.
8. Run `node tools/offline-tests/admin-ui.test.js`, then the full suite.
9. Manual: edit a label → back → re-enter → **edit is gone**. Type + undo →
   save disabled. Delete a UoM → save → reload → gone.

## Todo list

- [ ] 4 helpers added
- [ ] All 5 `.find(...).value` fallbacks replaced with `configValue_`
- [ ] Deep copy verified: editing a status label leaves `state.config` untouched
- [ ] `markEdit_` deletes the key on undo-to-original
- [ ] `back-to-users` discards edits for real
- [ ] `add-status` pushes empty `{key:'',label:'',__new:true}`
- [ ] `__new` stripped in `saveConfig`
- [ ] Delete refused (with toast) for saved status rows
- [ ] `vatRates` stores numbers
- [ ] Busy label + post-save repaint
- [ ] `node tools/offline-tests/admin-ui.test.js` → 0 failed
- [ ] Full suite → no FAIL

## Success criteria

1. **Mutation test (phase 05, group N):** render config → fire an `input` on a
   `.config-status-label` → assert `state.config`'s value is byte-identical to
   the fixture (compared via a second `apiListConfig` fixture snapshot).
2. **Undo test:** input original value → `configEdits` has no keys → save button
   `disabled` attribute present in the repainted HTML.
3. **Payload test:** save after adding a status → `lastCall.arg` is
   `{key:'statusList', value:[…]}` with **no `__new`** on any item, and
   `JSON.stringify` of the untouched items equals the fixture's.
4. **Delete test:** `delete-config-item` on a `uomList` row removes exactly that
   index; on a saved `statusList` row it does nothing but toast.
5. Zero regressions in the 44 existing assertions.

## Risk assessment

| Risk | L×I | Mitigation |
|---|---|---|
| `JSON.stringify` deep-equality gives a false "dirty" on key reorder | Low × Low | Both sides are produced by the same render/collect path; values are flat |
| Stripping `__new` misses a nested path | Low × High | Strip in exactly one place (`saveConfig`, immediately before `T.call`) and assert the payload in phase 05 |
| Refusing delete on saved statuses blocks a legitimate need (a typo'd status) | Med × Med | It already fails server-side (`AdminConfig.gs:239`). Out of scope to change; if Phong needs it, that is an API change (soft-delete/archive flag) — log it |
| `vatRates` storing a raw mid-typing string reaches the server | Med × Low | Server coerces with `Number()` and range-checks 0–1 (`AdminConfig.gs:106-108`); the error message is already Vietnamese |
| Sequential save leaves config half-written on a mid-loop failure | Med × Med | Pre-existing (`:1136-1141` aborts the loop). Keys are independent, and the aborted ones stay in `configEdits` so a retry finishes the job. Document; do not add a transaction |
| Two phases editing `ViewsAdmin.html` back to back → merge pain | Low × Med | Strictly sequential, one commit each, no parallel agent on this file |

## Security considerations

- `__new` is a client-invented field. It must never be trusted server-side and
  never persisted — hence the single strip point. The server's allowlist
  (`AdminConfig.gs:185`) and validators already ignore unknown properties on
  `statusList` items, but leaving `__new` in the sheet JSON would be a slow leak
  into `readPublicConfig_` and thence into every session payload.
- Client-side "cannot delete a saved status" is a hint, not a control. The real
  control stays at `AdminConfig.gs:194-196`. Do not remove it, do not add a
  bypass flag.
- Deep-copying with `JSON` parse/stringify anywhere near user input: fine here
  (no prototype-polluting keys reach `Object.assign`/spread targets), but keep
  `configDeepCopy_` explicit-field, not `JSON.parse(JSON.stringify(x))`, for
  arrays of `{key,label}`.

## Next steps

Phase 05 encodes every success criterion above as an assertion group and does
the viewport pass.
