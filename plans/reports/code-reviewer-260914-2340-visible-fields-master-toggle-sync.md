# Code Review: visible_fields master-toggle two-way sync UX follow-up

## Scope
- `apps/web/ui/AdminVisibleFields.html` (new file, untracked — full content reviewed)
- `apps/web/ui/ViewsAdmin.html` (diff: PERMISSION_GROUPS extraction unrelated noise + real `onChange`/`onInput`/`collect()`/`refreshCustomisedBadge_()` wiring to the new module)
- `apps/web/ui/Styles.html` (new `.field-*` classes, `.field-groups--dimmed` removed)
- `tools/offline-tests/admin-ui.test.js` (Group L added, integration-level)
- `tools/offline-tests/admin-visible-fields-editor.test.js` (new, unit-level against real exported functions)
- Everything else on the branch (backend, PermissionLabels.html, App.html homepage, phase 1-3 work) explicitly out of scope per instructions.

## Overall Assessment
Change is correct and well-guarded. Ran both test files directly (no npm/CI harness exists in this repo — tests are invoked as plain `node <file>.test.js`): `admin-visible-fields-editor.test.js` 39/39 pass, `admin-ui.test.js` 105/105 pass.

## Critical Focus — R3 escalation-history verification

1. **`['*']` only when `#f-field-all` present AND `.checked === true` at read time** — confirmed. `collectVisibleFields_` (AdminVisibleFields.html:192-198): `if (!allEl) return (base.visible_fields || ['*']).slice();` then `if (allEl.checked) return ['*'];`. No inferred/defaulted path returns `['*']` from a checked state guess.

2. **Falls back to `base.visible_fields` when master node absent** — confirmed, same line as above. Note the fallback itself is `(base.visible_fields || ['*']).slice())` — the bare `['*']` there only fires when `base.visible_fields` is itself nullish (base resolved but carries no restriction), which mirrors the exact pattern the prior R3 fix established in `collect()`/`refreshCustomisedBadge_()` before this change (verified via `basePermissions_`/`collect()`'s own `if (!base) return` guard at ViewsAdmin.html:866-868 — `collectVisibleFields_` is never invoked with a null `base`). Not a regression, consistent with previously-reviewed behavior.

3. **`alwaysVisible` fields excluded from explicit-list branch** — confirmed, `collectVisibleFields_` line 214: `if (f.alwaysVisible) return;` inside the `groups.forEach` that builds `out`. Verified by test Group E2 (`admin-visible-fields-editor.test.js`) with a real fixture.

4. **`syncFieldMasterFromIndividuals_` treats a MISSING individual node as "not checked"** — confirmed. Line 287: `if (!(el && el.checked)) allChecked = false;` — `el` falsy short-circuits to "not checked," conservative. Verified by test Group D.
   - Minor edge case (not a bug, informational): if a field group set contains only `alwaysVisible` fields (`sawAny` stays `false`), `result = sawAny && allChecked` evaluates to `false`, forcing the master checkbox unchecked even though every visible field actually is visible. Not currently reachable (every group has at least one non-locked field per the real field catalog) but worth a code comment if the catalog ever changes.

5. **Cascade/sync never touch `alwaysVisible` fields' checked/disabled state** — confirmed. `cascadeFieldMaster_` line 262 `if (f.alwaysVisible) return;` before any DOM write. `syncFieldMasterFromIndividuals_` line 284 same guard, and it only *reads* those nodes' checked state when not skipped — never writes to alwaysVisible checkboxes in either function. `disabled` attribute is only ever set at render time (`visibleFieldsDisclosureHtml`), never touched by either function.

## Normal Quality Pass

**`onChange` wiring (ViewsAdmin.html:1523-1549)** — correct id-prefix disambiguation:
- `f-perm-` handled first (existing code, unaffected).
- `f-field-` block explicitly excludes `f-field-filter` via `e.target.id !== 'f-field-filter'`, so even if a browser fires a stray `change` event on the `type="search"` filter input (e.g., native clear-button or blur-after-edit in some browsers), it cannot misfire cascade/sync — it falls through to no-op in `onChange`. The actual filter behavior is correctly routed through `onInput` (ViewsAdmin.html:1427-1430) which checks `id === 'f-field-filter'` exactly, not by prefix. No id collision risk since container ids (`field-groups-wrap`, `field-body`) use a `field-` prefix, not `f-field-`.
- Master vs. individual dispatch (`e.target.id === 'f-field-all'` → cascade; else → sync) is exhaustive and correctly ordered before the exclusion check would matter.

**Test file `admin-visible-fields-editor.test.js`** — genuinely exercises production code: `vm.runInContext` loads the real `AdminVisibleFields.html` source and calls the real exported functions (`M.cascadeFieldMaster_`, `M.syncFieldMasterFromIndividuals_`, `M.collectVisibleFields_`, `M.visibleFieldsDisclosureHtml`) against a real (small but non-trivial) fixture with 2 groups, alwaysVisible fields, and isMoney fields. Not a reimplementation — this is real coverage. Good.

**`admin-ui.test.js` Group L** — mostly a real integration regression guard (L1, L3, L4, L5 all assert against actual rendered/collected output). **Finding (informational):** L2's two assertions are vacuous —
```js
ok('L2: alwaysVisible fields are always included server-side (not client choice)', true);
ok('L2: money fields can be excluded per role (warehouse excludes them)', true);
```
These are hardcoded `true` literals, not real checks — they pass regardless of whether the described behavior holds. The comment above them is honest about this ("a behavioral note rather than a direct test"), so it's not misleading, but it inflates the pass count without adding coverage. Recommend either removing these two assertions or replacing with a real check (e.g., asserting the warehouse preset's `visible_fields` array excludes known money keys) — flagging as a finding rather than rewriting test intent myself, per instructions.

**CSS removal (`.field-groups--dimmed`)** — confirmed no dangling references anywhere in `apps/web/ui/*.html` or `tools/offline-tests/*.js` (grepped both). The new `.hidden` usage in `applyFieldFilter_` reuses the pre-existing global `.hidden { display: none !important; }` rule (Styles.html:30), not a new/orphaned class.

## Findings Summary

| Severity | Item | Status |
|---|---|---|
| — | All 5 critical-focus R3 invariants | Verified intact, no regression |
| — | `onChange` id disambiguation | Correct |
| Informational | `admin-ui.test.js` Group L2 assertions are hardcoded `true` (no real check) | Not fixed (test file, per instructions — flagging only) |
| Informational | `syncFieldMasterFromIndividuals_` returns `false` for an all-`alwaysVisible` group (theoretical, unreachable with current field catalog) | Noted, no action needed |

No production code changes were made — no bug was found that warranted a fix.

## Unresolved Questions
- None.
