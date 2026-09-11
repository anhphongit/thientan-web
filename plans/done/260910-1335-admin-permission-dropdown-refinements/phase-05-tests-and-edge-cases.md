# Phase 05 — Tests + edge cases

**Priority:** P1 · **Status:** ✅ completed · **Effort:** 1h15 (actual: 1h25)
**Owns:** `tools/offline-tests/admin-ui.test.js`
**Blocked by:** 04

## Context

- Plan: [plan.md](plan.md)
- Baseline: `node tools/offline-tests/admin-ui.test.js` → **44 passed, 0 failed**
- Harness shape: DOM stub, `querySelector` returns a node **only** for keys
  present in `fieldValues` (`admin-ui.test.js:19-24`); everything else is
  `null`. Delegated handlers are captured at `:113-123`.

## Key insights

1. The stub's `querySelector` returning `null` for un-stubbed selectors is
   exactly the condition phase 04's `el ? … : !!base[key]` fallback protects
   against. Tests must stub `#f-perm-*` explicitly when they mean "checked".
2. `fieldValues` is a **shared mutable map** — every existing block deletes its
   keys afterwards (`:188-189`, `:280-286`). New blocks must do the same or
   they poison later assertions.
3. The `apiListPermissionPresets` fixture (`:62-69`) returns `{key,label}` only.
   It **must** grow `permissions` to match phase 02, or the whole disclosure
   silently disappears (R5 path) and every new assertion fails for the wrong
   reason.
4. `balanced()` (`:99-111`) treats only `input,br,hr,img` as void. The new
   `<button>` and `<div id="perm-body">` must be explicitly closed.

## Requirements

- Repair assertions broken by phases 03/04 (list them from the phase 03/04 runs
  — do not guess).
- Add coverage for every success criterion in phases 01, 03, 04.
- Final count ≥ 56 passing, 0 failing.

## Related code files

- Modify: `tools/offline-tests/admin-ui.test.js`
- Do **not** modify: `apps/**` (if a test cannot pass without a source change,
  stop and report — that is a phase 03/04 defect, not a test defect)

## Implementation steps

1. **Fixture first.** Extend `apiListPermissionPresets` (`:62-69`) with a
   `permissions` object per preset, copied from `Config.gs:230-274`. Critically:
   `warehouse.permissions.visible_fields` must be the real
   `DEFAULT_VISIBLE_FIELDS` list (`Config.gs:183-187`), not `['*']` — the
   escalation assertion depends on it being different.
2. **Extend the user fixtures** (`:70-89`). Today `permissions` is a one-key
   stub (`{manage_users:false}`), which cannot exercise a diff. Add:
   - `warehouse@x.com` — full warehouse permissions, `presetKey:'warehouse'`,
     not self, not last-admin;
   - `custom@x.com` — sales permissions with `delete_order:true`,
     `presetKey: null` (drives the auto-expand case).
3. **Replace** the old matrix block (`:239-286`). Its two structural assertions
   (`perm-group-title` ×5, `balanced`) survive; the `f-show-matrix` toggle
   (`:249`, `:260`) becomes a `clickDataAct('toggle-perms')`.
4. Add these assertion groups:

   | # | Group | Asserts |
   |---|---|---|
   | A | Notes field (ph.01) | `#f-note` is inside an element with `class="field"`; markup balanced |
   | B | Disclosure render | `data-act="toggle-perms"` present; `perm-body--collapsed` on first paint; all 14 `#f-perm-*` inputs present **while collapsed**; `aria-expanded="false"` |
   | C | Toggle | after `clickDataAct('toggle-perms')`: no `--collapsed`, `aria-expanded="true"`, typed `displayName` preserved |
   | D | Create form has a matrix | pick a base via `fieldValues['#f-preset']='sales'`, repaint → 5 `perm-group-title` (regression vs. old `:645` guard) |
   | E | Auto-expand | open `custom@x.com` → first paint already expanded, label contains `Tuỳ chỉnh` |
   | F | Locked user | open `admin@x.com` (self+last-admin) → no `perm-disclosure`; save → payload has **neither** `permissions` nor `presetKey` (R2) |
   | G | No diff → presetKey | base `sales`, all `#f-perm-*` stubbed to the sales values → save sends `{presetKey:'sales'}`, `'permissions' in payload === false` (R1) |
   | H | Diff → permissions | flip `delete_order` on the sales base → save sends `permissions`, no `presetKey` |
   | I | `visible_fields` (R3) | base `warehouse`, one box flipped → `payload.permissions.visible_fields` deep-equals `DEFAULT_VISIBLE_FIELDS`; **not** `['*']` |
   | J | Untouched edit | open `warehouse@x.com`, change only `#f-displayName`, save → payload has neither key (byte-identical to today) |
   | K | Presets failed (R5) | force `state.presets = []` by making the fixture throw for `apiListPermissionPresets` in a fresh render → no `perm-disclosure`, save still works via `#f-preset` |
   | L | Round-trip (R4) | for each of the 4 presets: stub every `#f-perm-*` to that preset's values with its `visible_fields` → save sends `presetKey`, never `permissions` |

5. Group K needs a fixture switch — add a module-level
   `let presetsFail = false;` and branch in `fixture()`; reset it afterwards.
   Re-`render()` to reset `state.presets`… **verify this works**: `state.presets`
   is module-level and `ensurePresetsLoaded` short-circuits when it is non-null
   (`ViewsAdmin.html:194`). Once loaded successfully it never refetches within
   the VM. If so, run group K **first**, before any successful preset load, or
   re-evaluate the module in a second VM context. Prefer the second VM — the
   test file already builds one at `:56-58` and copying that is cheaper than
   ordering constraints between blocks.
6. Delete every `fieldValues` key each block adds.
7. Update the header doc comment (`:1-12`) to mention the new stubbed selectors.

## Todo list

- [ ] Fixture: `permissions` on all 4 presets, with the real warehouse `visible_fields`
- [ ] Fixtures: `warehouse@x.com`, `custom@x.com`
- [ ] Old matrix block converted to `toggle-perms`
- [ ] Groups A–L added
- [ ] Group K isolated in its own VM context
- [ ] Every block cleans up its `fieldValues` keys
- [ ] `node tools/offline-tests/admin-ui.test.js` → ≥56 passed, 0 failed
- [ ] `node tools/offline-tests/admin.test.js` → 0 failed
- [ ] Sweep: only the two pre-existing `orders-approvestatus*` failures remain

## Success criteria

1. `node tools/offline-tests/admin-ui.test.js` → 0 failed, count ≥ 56.
2. Every risk R1–R6 has at least one named assertion (F, G, I, L, K, B).
3. `for f in tools/offline-tests/*.test.js; do node "$f" >/dev/null || echo "FAIL $f"; done`
   prints exactly `FAIL …orders-approvestatus-ui.test.js` and
   `FAIL …orders-approvestatus.test.js` — both pre-existing on clean `main`
   (verified 2026-09-10), out of scope here.
4. Manual viewport check recorded: 375px and 1280px, disclosure tap target
   ≥44px, no horizontal scroll, Notes textarea full-width.

## Risk assessment

| Risk | L×I | Mitigation |
|---|---|---|
| Fixture `permissions` drifts from `Config.gs` | M×M | Phase 02 pins the same values in `admin.test.js` against the real constant; if they ever disagree, `admin.test.js` fails first. Comment the copy with `Config.gs:230-274`. |
| Test asserts the bug instead of the fix (esp. group I) | M×H | Group I asserts the **absence** of `['*']` as well as the presence of the expected list — a hardcoded `['*']` cannot pass both. |
| Shared `fieldValues` leaks between blocks | M×M | Cleanup step in every block; assert `Object.keys(fieldValues).length === 0` between top-level sections. |
| Group K's module-level `state.presets` cannot be reset | M×M | Second VM context (step 5). |
| Attribute-order-sensitive regexes | M×L | Prefer two independent `.test()` calls (`/id="f-preset"/` and `/disabled/` within a captured tag) over one brittle ordered regex, for any assertion being newly written. |

## Security considerations

Groups F and I are the security regression tests (last-admin stripping and
money-column escalation). They must be non-skippable and must not be weakened
if they are inconvenient — if one fails, the source is wrong, not the test.

## Next steps

- `/ck:code-review` on the full diff.
- `docs-manager`: `docs/` impact is **minor** — `actionListPermissionPresets_`
  now returns `permissions`; update the API surface note if one exists.
- Update `docs/project-changelog.md` with the `visible_fields` escalation fix,
  flagged as a security fix, not a UI change.
