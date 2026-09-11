# Phase 04 — Test matrix update + viewport verification

**Priority:** P2 · **Status:** pending · **Effort:** 45m · **Blocked by:** Phase 03
**File ownership:** `tools/offline-tests/admin-ui.test.js` (exclusive)

## Context

- Test file: `tools/offline-tests/admin-ui.test.js` (232 lines, 36 assertions,
  all passing on `main` as of 2026-09-10 — verified by running it).
- DOM stub: `admin-ui.test.js:19-24`. `querySelector` returns
  `{value, checked}` only for selectors present in `fieldValues`, `null`
  otherwise (`:21-22`).
- Fixtures: `admin-ui.test.js:61-91`. No fixture carries `updatedAt`.
- Test runner: plain `node <file>`; exit code 1 on any failure (`:228`).

## Assertions that MUST change (enumerated, not "update the tests")

| Line | Current assertion | Change |
|---|---|---|
| `:165` | `/id="f-active" checked/` — "active defaults to checked on a brand-new user" | → assert the select renders with `Đang hoạt động` selected. Match on the option, e.g. `/id="f-active"[\s\S]*?<option value="active" selected>/` |
| `:178` | `fieldValues['#f-active'] = true` | → `= 'active'` (stub returns `{value:'active'}`; `collect()` now reads `.value`) |
| `:188` | `delete fieldValues['#f-active']` | unchanged, but see new test 3 below |
| `:208` | `/id="f-active" checked disabled/` — last-admin lock | → `/id="f-active" disabled/` (attribute order per `statusSelectHtml`; adjust to whatever phase 02 emits, verified by reading the emitted string, not guessed) |
| `:224-225` | `!/id="f-active"[^>]*checked disabled/` && `/id="f-active"[^>]*>/` | → `!/id="f-active"[^>]*disabled/` && `/id="f-active"[^>]*>/` |

Assertions that MUST stay green untouched (regression guards — do not edit):
`:161` and `:196` (`balanced()`), `:135` (XSS escape), `:162` (editable email
on create), `:163` (`<option value="" disabled selected>`), `:182-186` (the
2026-09-06 create-vs-update bug), `:199-200` (`value="admin@x.com" disabled`),
`:201-202` (`— Giữ nguyên`), `:205-207` (guard banner + locked preset),
`:222-223` (no locks for an ordinary user).

## New assertions to add

1. **Linear layout, not grid** — form HTML contains `class="form-linear"` and
   does NOT contain `class="form-grid"` on this screen.
2. **Header meta** — an existing user's detail contains the email in
   `.user-head-meta`; a brand-new form does not render the meta line.
3. **Missing status node fails safe** — with `#f-active` absent from
   `fieldValues` (the stub's default), saving an existing active user still
   sends `active: true`. This is the phase-02 high-impact failure mode; assert
   on `lastCall.arg.active === true`.
4. **Locked user has no matrix** — the self/last-admin detail contains no
   `id="f-show-matrix"` (mirrors `permissionMatrixHtml`'s `if (locked) return ''`).
5. **All 14 permission keys reach the payload** — open an ordinary user, drive
   the toggle via `captured.change({target:{id:'f-show-matrix', checked:true}})`,
   then save with `fieldValues` seeded, and assert
   `Object.keys(lastCall.arg.permissions).length === 15`
   (14 booleans + `visible_fields`). Enumerate the 14 keys explicitly in the
   assertion so a dropped key names itself.
6. **Grouped matrix renders 5 group titles** — expanded matrix HTML contains
   each of the 5 `.perm-group-title` labels and stays `balanced()`.
7. **Toggle preserves typed input** — set `fieldValues['#f-displayName']` to a
   new value, fire the `f-show-matrix` change, assert the repainted HTML
   contains that value (guards the phase-03 `collect()`-before-repaint fix).

To drive test 5/7 the stub needs `#f-perm-*` entries in `fieldValues`; add them
in a small loop over the 14 keys and delete them after the section, following
the existing set/delete discipline at `:174-188`.

## Implementation steps

1. Record the pre-change baseline: `node tools/offline-tests/admin-ui.test.js`
   → note the pass count (36 on `main`).
2. Apply the 5 table edits above. Re-run; expect green.
3. Add the 7 new assertions in the sections where the relevant HTML is already
   painted (reuse existing `setTimeout` nesting — do not add another level).
4. Full sweep:
   `for f in tools/offline-tests/*.test.js; do node "$f" >/dev/null || echo "FAIL $f"; done`
5. Manual viewport check (no headless browser in this repo — deploy or open the
   Apps Script web app): 375px and 1280px. Checklist:
   - single column at both widths, no horizontal scroll;
   - permission groups: 1 column at 375px, 2 at ≥640px;
   - section labels legible, no icons;
   - status select and preset select are ≥44px tall (touch target,
     `Styles.html:773`);
   - back/Lưu/Huỷ reachable without zoom.
6. If `docs/` mentions the old grid layout for this screen, hand to
   `docs-manager`; otherwise state `Docs impact: none`.

## Todo

- [ ] Baseline run, record pass count
- [ ] Edit the 5 enumerated assertions
- [ ] Add the 7 new assertions (+ `#f-perm-*` stub seeding)
- [ ] Full offline sweep, no FAIL
- [ ] Manual 375px / 1280px checklist
- [ ] State docs impact

## Success criteria

- `node tools/offline-tests/admin-ui.test.js` → `0 failed`, pass count ≥ 43.
- No other test file regresses.
- The 4 save-intent cases produce today's payload shapes:
  create+preset → `{user, active, presetKey}`;
  create+custom → `{user, active, permissions}`;
  edit+keep → `{email, user, active}` with neither key;
  edit+custom → `{email, user, active, permissions}`.
  (Cases 1 and 3 are already covered at `:182-186` / `:201-202`; add 2 and 4.)

## Risks

| Risk | L×I | Mitigation |
|---|---|---|
| Regex loosened to "make it pass", hiding a real break | Med×**High** | Table above fixes the intent of each edited assertion; loosening `balanced()` or the XSS check is forbidden |
| Stub's `{value, checked}` shape misleads on the select | Med×Med | Test 3 covers the null-node path explicitly |
| Manual viewport step skipped because there's no automation | **High**×Med | Checklist is a required todo; capture the two widths as a note in the completion message |

## Security considerations

Keep `:135`'s hostile-display-name assertion exactly as-is; it is the only
automated XSS guard on this screen and every new interpolation added in
phases 02-03 flows through the same render path.

## Next steps

- `code-reviewer` on the 3 changed files.
- Then `git-manager`: one commit per phase, conventional format,
  `feat(admin): linear user detail form` / `feat(admin): grouped permission matrix` /
  `test(admin): cover status select and permission groups`.
