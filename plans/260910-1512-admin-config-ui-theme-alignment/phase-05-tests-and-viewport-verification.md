# Phase 05 — Tests + viewport verification

**Owns:** `tools/offline-tests/admin-ui.test.js`
**Blocked by:** 04
**Effort:** 45m
**Priority:** P2

## Context links

- Harness + DOM stub: `tools/offline-tests/admin-ui.test.js:34-42`
- `balanced()` HTML checker + VOID list: `:184-191`
- Existing helper style (`clickDataAct`, `clickOpen`, `tick`, `ok`): same file
- `wrapper = root` fallback that makes the config tab reachable in the stub:
  `apps/web/ui/ViewsAdmin.html:219-234`
- Server contract under test: `apps/api/AdminConfig.gs:38-124`; API-side unit
  tests already exist and stay untouched: `tools/offline-tests/admin-config.test.js` (473 lines)

## Overview

**The config tab has zero UI test coverage today** (`grep switch-to-config`
`apiListConfig` `configTab` in `admin-ui.test.js` → 0 hits). Every bug in this
plan survived because nothing exercised the screen. Add one new assertion group
per behaviour, in the existing file, in the existing style.

## Key insights

- The DOM stub's `querySelector` returns `null` for anything not in
  `fieldValues`, and `querySelectorAll` returns `[]`. `updateSaveButtonState()`
  (`ViewsAdmin.html:1282`) therefore no-ops in tests — assert on the **repainted
  HTML** (`painted`), not on the live button object.
- `fixture(fn, arg)` must learn `apiListConfig` (returns the 5-key fixture) and
  `apiUpdateConfig` (returns `{ok:true}`). `callCounts` already exists for
  "how many saves fired".
- Config edits arrive through `onInput`, which the harness reaches via the
  captured listeners (same mechanism as the existing
  `captured.change({target:{...}})` calls, e.g. `admin-ui.test.js:548`). The
  event target stub needs `classList.contains`, `getAttribute`, and `value`.
- `state` is module-private. Assert the mutation bug through *observable*
  behaviour: edit label → click `back-to-users` → re-enter config → the painted
  HTML must contain the **original** label. That is exactly the user-visible
  symptom and needs no state access.

## Requirements

New assertion groups (naming follows the file's existing `Group X — …`):

| Group | Asserts |
|---|---|
| M — config tab renders | `apiListConfig` called once; all 5 Vietnamese headings present; `balanced()` passes; every `config-*` class emitted appears in `Styles.html`; no `btn-sm`/undefined class; save button `disabled` on a clean screen |
| N — no cache mutation | edit a status label → `back-to-users` → re-enter → painted HTML has the ORIGINAL label, and `apiListConfig` was **not** re-called (cache still fresh) |
| O — dirty tracking | edit → save button not disabled; edit back to original → save button `disabled` again |
| P — add / delete | `add-status` appends an EMPTY row (no `new_status` literal in the HTML); `add-array-item` appends a blank row; `delete-config-item` on a `uomList` row removes that row; on a saved `statusList` row it removes nothing and toasts |
| Q — save payload | one `apiUpdateConfig` per edited key, `{key, value}` only; `value` for `statusList` contains no `__new`; untouched items byte-identical to the fixture; `vatRates` values are `typeof 'number'` |
| R — statusList lock | saved status rows render the code input with `disabled` and no delete button; a row added this session renders both editable and deletable |
| S — busy state | while a save is in flight the button reads `Đang lưu...`; a second `save-config` click fires no extra `apiUpdateConfig` (`isBusy()` gate) |
| T — a11y / mobile invariants | every `<input` in the config HTML has an `id`, and each `id` has a matching `for=` or the input has `aria-label`; every `.btn-icon` has `aria-label`; no inline `style=` attributes |

Non-functional:
- Zero changes to the 44 existing assertions. If one breaks, the implementation
  is wrong, not the test.
- Keep the fixture literal in the test file (same discipline as
  `PRESET_PERMISSIONS`, `:96-120`) and add a comment pointing at
  `AdminConfig.gs:38-124` as the source of truth.

## Architecture

```
fixture('apiListConfig')  → { config: [
   {key:'statusList',  type:'array',  description:'…', value:[{key:'new',label:'Mới'}, …6]},
   {key:'uomList',     type:'array',  …, value:['cái','hộp','thùng','kg','m']},
   {key:'customerList',type:'array',  …, value:[… 12 names …]},
   {key:'vatRates',    type:'array',  …, value:[0, 0.08, 0.1]},
   {key:'currency',    type:'string', …, value:'VND'} ]}
fixture('apiUpdateConfig') → { ok: true }
```

New helpers (mirroring `clickDataAct`):
```js
inputOn(className, key, index, value)   // synthesise the onInput event stub
enterConfigTab()                        // render + clickDataAct('switch-to-config') + tick
cssHas(cls)                             // Styles.html read once, indexOf('.'+cls)
```

`cssHas` needs `Styles.html` read at the top of the file — one extra
`fs.readFileSync`, and it is what turns phase 02 from "untested CSS" into a
guarded contract.

## Related code files

- Modify: `tools/offline-tests/admin-ui.test.js` (append groups M–T + fixture + 3 helpers)
- Read: `apps/web/ui/Styles.html` (at runtime, for `cssHas`)
- Do **not** modify: `tools/offline-tests/admin-config.test.js` — server-side, already green

## Implementation steps

1. Extend `fixture()` with the two new endpoints and the literal config fixture.
2. Add `enterConfigTab`, `inputOn`, `cssHas` next to the existing helpers.
3. Add groups M–T after group L (`:545-563`), before `assertNoLeakedFieldValues`.
4. Update the file's doc comment (`:1-33`) with a paragraph on the config-tab
   coverage and why group N asserts through re-entry rather than state access.
5. `node tools/offline-tests/admin-ui.test.js` → 0 failed.
6. Full suite: `for f in tools/offline-tests/*.test.js; do node "$f" >/dev/null || echo "FAIL $f"; done`
7. Viewport pass in a real browser against the deployed web app:
   **360px**, 375px, 768px, 1280px. For each: no horizontal scroll, delete
   buttons reachable, `+ Thêm` reachable, save bar reachable, focus ring visible
   on tab-through.
8. Phone check per `docs/CHECKLIST_M5_VI.md:277-283` (section K) on a real device
   if available; otherwise device emulation, and say which was used in the report.

## Todo list

- [ ] Fixture + 2 endpoints added
- [ ] 3 helpers added
- [ ] Groups M–T added
- [ ] Doc comment updated
- [ ] `admin-ui.test.js` → 0 failed, count ≥ 44 + new
- [ ] Full offline suite → no FAIL
- [ ] 360 / 375 / 768 / 1280 all clean, screenshots attached to the report
- [ ] Keyboard tab-through of one list editor: focus visible, order sane
- [ ] Checklist G (`CHECKLIST_M5_VI.md:186-206`) walked; result recorded —
      expected to FAIL the "immediately, no reload" items unless phase 06 ships

## Success criteria

1. `node tools/offline-tests/admin-ui.test.js` → `N passed, 0 failed`, N ≥ 60.
2. No other offline test regresses.
3. `cssHas` assertion proves every emitted `config-*` class has a rule.
4. Payload assertions prove the `apiUpdateConfig` contract is unchanged.
5. Four viewports verified with evidence.
6. Checklist G result stated explicitly (pass/fail per line), not summarised.

## Risk assessment

| Risk | L×I | Mitigation |
|---|---|---|
| Regex assertions are attribute-order sensitive (already bit this project — `plan.md` of the 5.3 plan, note on `/id="f-active" checked disabled/`) | **High × Med** | Assert on `indexOf` of short distinctive substrings, or on the presence of both attributes independently — never on a long ordered run |
| `onInput` stub diverges from a real event | Med × Med | Stub exactly the three members the handler reads (`classList.contains`, `getAttribute`, `value`), and verify by making group P fail first (delete the fix, see red) |
| `cssHas` false-positives on a substring (`.config-row` matching `.config-row-fields`) | Med × Low | Match `'.'+cls+'{'` and `'.'+cls+' '` and `'.'+cls+','` after whitespace-normalising the CSS |
| Manual viewport pass is skipped under time pressure | Med × High | It is a checklist item with required screenshot evidence; the mobile requirement is a milestone exit criterion (`CHECKLIST_M5_VI.md:277`) |
| Test file grows past a comfortable size (574 → ~800 lines) | High × Low | Tests are exempt from the 200-line rule in practice here (every `*-ui.test.js` is long); if it passes ~900, split config groups into `admin-config-ui.test.js` |

## Security considerations

- Fixture data must use invented customer names, never real ones from the sheet
  (the test file is committed).
- Add one assertion that a hostile config value is escaped: put
  `'<img src=x onerror=alert(1)>'` in the `customerList` fixture and assert the
  painted HTML contains `&lt;img` and **not** `<img src=x`. This is the cheapest
  possible XSS regression guard on an admin-authored, HTML-rendered field.

## Next steps

Report to the controller with: test counts, viewport evidence, checklist G
result, and a recommendation on phase 06. Then `/ck:code-review`, then docs
(`docs/project-changelog.md`, `docs/CHECKLIST_M5_VI.md` section G ticks).
