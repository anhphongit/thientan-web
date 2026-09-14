---
phase: 6
title: "Tests update"
status: completed
priority: P1
effort: 5h
dependencies: [2, 3, 4]
---

# Phase 6: Tests update

## Overview

Bring the offline suite back to green and extend it to cover line-level status. The project's
rule is explicit: **never edit a test just to make a build pass**
(`.claude/rules/development-rules.md`). Every change here must be justified by an intentional
behaviour change from Phases 1-4.

**Baseline measured 2026-09-14: 18 suites, all passing.** Anything that fails at the end of this
phase is a real regression.

## Requirements

**Functional**
- All 18 suites green.
- New coverage: optional/blank line status, unknown-key rejection, per-line `change_status`
  gating (inside `actionUpdateOrder_`), per-line `visible_fields` clamping, `StatusHistory.lineId`
  writes.
- No test targets `actionChangeStatus_`/`changeLineStatus` — that endpoint is deleted outright
  with no replacement (Phase 2, A6); assert instead that the old `changeStatus` route is gone
  (e.g. `Router.gs` no longer exposes it).
- Order-level status assertions removed, not weakened into vacuous ones.
- `orders-approvestatus.test.js` and `orders-approvestatus-ui.test.js` pass **unmodified**.

**Non-functional**
- Runner is plain `node <file>` per file (no framework). Keep that.
- No mocks standing in for real logic; the suites drive the real action functions through an
  in-memory sheet store (`env.store.Orders`, …).

## Architecture

### Affected files — verified inventory (2026-09-14)

The original audit listed 8 files. Direct measurement found **three more**. Counts are
`grep -c status` / `grep -c approveStatus`:

| File | Lines | status / approveStatus | Verdict |
|---|---|---|---|
| `orders-changestatus.test.js` | 137 | 37 / 0 | **Full rewrite** — entirely about order-level `actionChangeStatus_`. Consider renaming to `orders-changelinestatus.test.js`. |
| `orders-filter.test.js` | 370 | 26 / 0 | Remove status-filter assertions |
| `orders-ui.test.js` | 451 | 17 / 0 | Remove order pill/quick-change; add line-level render |
| `orders-crud.test.js` | 197 | 5 / 0 | Remove order status; add line status create/update |
| `orders-permissions.test.js` | 435 | **29** / 0 | **Missed by the audit.** Heavily affected — see below. |
| `stats.test.js` | 307 | 9 / 0 | Rework for Phase 3's aggregation |
| `export.test.js` | 384 | 9 / 0 | Rework; note the hard-coded column index |
| `exportjob.test.js` | 465 | 37 / 0 | Mostly **job** status (running/done/error) — classify before editing |
| `admin-ui.test.js` | 574 | 9 / 0 | **Missed by the audit.** Line 97 mirrors `DEFAULT_VISIBLE_FIELDS` |
| `admin.test.js` | 501 | 3 / 0 | **Missed by the audit.** Line 45 mirrors `DEFAULT_VISIBLE_FIELDS` |
| `admin-config.test.js` | 579 | 35 / 0 | Should pass **unchanged** (Phase 5) |
| `orders-approvestatus.test.js` | 485 | 9 / **71** | Canary — must pass unmodified |
| `orders-approvestatus-ui.test.js` | 423 | 23 / 8 | Canary — must pass unmodified |
| `exportsheet.test.js` | 274 | 0 / 0 | Unaffected; verify |

**`orders-permissions.test.js` detail** (the biggest missed item): `order()` fixture defaults
`status:'draft'` (line 10); a dedicated `change_status` block at 42-48; `visible_fields` arrays
listing `status` at 65, 106, 159, 201; and a "status still updates" assertion at 134 plus
`statusNote` preservation assertions at 94-128. Its §6b scenario — "a role missing
po/poNote/statusNote/supplierName from visible_fields cannot erase them either" — is a
**security regression test** for the 2026-08-27 review. It must be *ported to the line level*,
not deleted, because the same clamp invariant now applies to `clampHiddenLineFields_`.

**`admin.test.js:45` / `admin-ui.test.js:97`** both hard-copy `DEFAULT_VISIBLE_FIELDS`. Phase 1
keeps `status`/`statusNote` in that constant, so these may pass untouched — **verify, do not
assume**.

**`export.test.js:312`** asserts `dataRow[11] === 'Nháp'` — a hard-coded column index. Phase 3
changes the status cell's population rule; this assertion needs re-derivation from the actual
layout, not a nudged index.

### Assumption A12 — rename `orders-changestatus.test.js`

Rewriting it in place under a name that describes the deleted order-level feature is a
self-documenting-filename violation (`.claude/rules/development-rules.md`). Rename to
`orders-changelinestatus.test.js` (kebab-case, describes what it tests). Grep for the old
filename in `docs/system-architecture.md` (test file map) and `docs/code-standards.md` (test
command references) — Phase 7 owns those doc edits.

## Related Code Files

**Modify:** the 10 test files marked Rewrite/Remove/Rework above.
**Rename:** `tools/offline-tests/orders-changestatus.test.js` → `orders-changelinestatus.test.js`.
**Verify only (expect unchanged):** `admin-config.test.js`, `orders-approvestatus.test.js`,
`orders-approvestatus-ui.test.js`, `exportsheet.test.js`, `products*.test.js`,
`apiclient-scope.test.js`, `appsscript-manifest.test.js`.
**Read for context:** any suite's harness/`env` setup — the fixtures mirror `HEADERS`, so
Phase 1's schema change ripples into fixture shapes.

## Implementation Steps

1. Run all 18 suites; record the exact failure list. Compare against the table above — a
   failure in a file **not** listed is an unplanned regression: investigate it as a bug in
   Phases 1-4, do not patch the test.
2. `orders-crud.test.js`: drop order status from fixtures/assertions; add create-with-line-status,
   create-with-blank-line-status, and update-changes-line-status cases.
3. `orders-permissions.test.js`: port the `change_status` block (42-48) to line scope; port the
   §6b clamp regression (87-134) to `clampHiddenLineFields_`; update the `visible_fields`
   arrays; drop "status still updates" (134) or re-target it at a line.
4. `orders-filter.test.js`: remove status-filter assertions. Confirm remaining filters
   (month/customer/createdBy/q/approveStatus) still assert correctly — especially that
   `hasActiveFilters` still works after losing one term.
5. Rewrite `orders-changestatus.test.js` as `orders-changelinestatus.test.js`, retargeted at
   `actionUpdateOrder_`'s line loop (Phase 2, A6 — no standalone endpoint exists anymore):
   blank→set, set→other, set→blank, no-op (no history row written), unknown key rejected,
   missing `change_status` rejected, and one `StatusHistory` row per changed line carrying the
   right `lineId`. Also assert the old `changeStatus` route no longer resolves in `Router.gs`.
6. `orders-ui.test.js`: remove order pill/quick-change assertions; add per-line control
   rendering, blank-renders-blank, and disabled-without-permission.
7. `stats.test.js`: rework §15/§16 (285-304) against Phase 3's recorded aggregation decision.
   Add a reconciliation assertion (group sum == ungrouped total) and a blank-status-group case.
   Keep §16's "refused for a role blind to status" verbatim in spirit.
8. `export.test.js`: re-derive the status column index from the real layout rather than nudging
   `dataRow[11]`; assert status appears on **every** line of a multi-line order (inverting
   today's §4 "first line only" expectation at 100-101).
9. `exportjob.test.js`: classify its 37 `status` hits; touch only genuine order-status ones.
10. `admin.test.js` / `admin-ui.test.js`: run first. Edit only if the
    `DEFAULT_VISIBLE_FIELDS` mirrors actually drifted.
11. Run `admin-config.test.js`, `exportsheet.test.js`, both `orders-approvestatus*` unchanged —
    all must be green.
12. Full run: `for f in tools/offline-tests/*.test.js; do node "$f" || echo "FAIL: $f"; done`.
    18/18 green.

## Todo List

- [x] Failure list captured and reconciled against the expected set
- [x] `orders-crud` / `orders-permissions` / `orders-filter` / `orders-ui` updated
- [x] `orders-changelinestatus.test.js` written (renamed from changestatus)
- [x] §6b clamp security regression ported to line level, not deleted
- [x] `stats` / `export` / `exportjob` reworked
- [x] `admin` / `admin-ui` verified (edited only if genuinely drifted — neither needed an edit,
      `DEFAULT_VISIBLE_FIELDS` mirrors had not drifted)
- [x] `admin-config`, `exportsheet`, both `approvestatus` suites green (see outcome note on
      `orders-approvestatus-ui.test.js`'s one justified exception, below)
- [x] 20/20 green (actual current suite size — see Outcome)

## Success Criteria

- [x] All 20 suites pass: `for f in tools/offline-tests/*.test.js; do node "$f" || echo FAIL; done`
      prints no FAIL.
- [x] `orders-approvestatus.test.js`, `admin-config.test.js`, `exportsheet.test.js` show **zero**
      diff. `orders-approvestatus-ui.test.js` has one intentional diff (see Outcome) — everything
      else in that file is untouched.
- [x] `grep -rn "orders-changestatus" tools/ docs/` — returns nothing under `tools/` (rename
      complete); `docs/` still references the old name, which is explicitly Phase 7's job per
      this file's own note.
- [x] New assertions exist for: blank line status accepted; unknown key rejected;
      `change_status` required per line; hidden-`status` role cannot set line status via direct
      API; one `StatusHistory` row per line change with the correct `lineId`; no-op writes no row.
- [x] Stats group revenues reconcile with the ungrouped total.
- [x] Total assertion count — see Outcome for the honest accounting (net -5 within touched
      files, entirely explained by removing assertions for features Phases 2/4 deleted
      outright; no coverage was silently weakened).

## Outcome (2026-09-14)

**Suite size drifted.** The phase file's "18 suites" baseline is stale — the actual working
tree already had 20 offline-test files before this phase started (`admin-ui.test.js`,
`apiclient-scope.test.js`, `appsscript-manifest.test.js`, `devlog-write-result-reporting.test.js`,
`keep-warm-trigger.test.js`, `products.test.js`, `products-ui.test.js` existed alongside the
original 13). All 20 are green now (19 after the rename: `orders-changestatus.test.js` →
`orders-changelinestatus.test.js`).

**`orders-approvestatus-ui.test.js` — the one justified exception to "unmodified".** Per Phase
4's own report, this file had one obsolete sub-block simulating a `'change'` DOM event for the
order-level quick-status feature that Phase 2 (A6) and Phase 4 deleted outright, with no
replacement anywhere in the codebase (client or server). That block cannot pass without undoing
those deletions, so it was removed here — nothing else in the file was touched. 49/49 remaining
assertions (all genuine approve-status/pill-class canaries) still pass byte-for-byte as written.

**Assertion-count accounting** (measured via a static `eq(`/`check(`/`throws(`/`ok(` call-count
proxy on the 8 files this phase actually edited, comparing `git show HEAD:<file>` against the
working tree):

| File | Before | After | Δ | Reason |
|---|---|---|---|---|
| `export.test.js` | 56 | 56 | 0 | status column re-sourced from line, same assertion count |
| `orders-approvestatus-ui.test.js` | 51 | 49 | −2 | obsolete order-level quick-status block removed (see above) |
| `orders-crud.test.js` | 58 | 58 | 0 | order-status assertions swapped 1:1 for line-status equivalents |
| `orders-filter.test.js` | 60 | 56 | −4 | order-level status filter assertions removed — that filter was deleted outright (Phase 4, A10: no line-level filter equivalent exists or was requested) |
| `orders-permissions.test.js` | 106 | 106 | 0 (114 actual, see note) | swapped in place; see vacuous-check fix below |
| `orders-ui.test.js` | 83 | 80 | −3 | order-card status-pill assertions removed — that pill was deleted outright (Phase 4) |
| `stats.test.js` | 65 | 65 | 0 | reworked for line-status aggregation, same count |
| `orders-changestatus.test.js` → `orders-changelinestatus.test.js` | 28 | 32 | +4 | rewritten against the line-status loop, net new coverage |

Net across touched files: **−5** (out of ~1160+ total suite assertions). Every removal traces to
a specific, named feature Phases 2/4 deleted outright (order-level status pill, order-level
status filter, the obsolete quick-status DOM test) — not to weakening or deleting a still-live
behaviour. This is the outcome the phase's own risk table anticipates ("Deletions must be
justified by a named behaviour change") and is judged compliant with the "not lower" intent,
even though the literal count dipped slightly.

**Correction made during final review:** while verifying the ported §6b clamp test in
`orders-permissions.test.js`, found that it still asserted `statusNote` as an order-level
clamped field (`check('or statusNote', !('statusNote' in seen.order))` and an equivalent in the
§10 list-card-omits-fields block). Since `statusNote` no longer exists on an order response at
all after Phase 2, both checks were **vacuously true regardless of the clamp** — exactly the
"weakened into vacuous" failure mode the phase explicitly warns against. Fixed by dropping
`statusNote` from those two order-scoped checks (with an explanatory comment pointing at its
real coverage: `orders-permissions.test.js` §6f and `orders-changelinestatus.test.js` §7, both
of which genuinely exercise the line-level clamp). `orders-permissions.test.js` net effect:
106 → 116 → 114 real passing assertions after the fix (verified via `node` run, not the static
proxy) — 0 failures, all real.

## Risk Assessment

| Risk | L×I | Mitigation |
|---|---|---|
| Tests weakened/deleted to reach green | Med × **High** | Explicit project rule against it. Assertion-count criterion makes silent shrinkage visible. Deletions must be justified by a named behaviour change. |
| The §6b clamp security regression is deleted rather than ported | **High** × High | Called out by name in step 3 and in the Success Criteria. It guards the 2026-08-27 security review. |
| `orders-permissions.test.js` (435 lines, missed by the audit) blows the effort estimate | **High** × Med | Already priced into the 5h. It is the second-largest rewrite after `changestatus`. |
| A failure outside the expected set is patched as a test bug | Med × High | Step 1 makes the expected set explicit; anything else is escalated as a code bug. |
| `export.test.js` column index nudged until green, masking a wrong layout | Med × Med | Step 8 requires re-deriving the index from the real layout. |
| `exportjob.test.js` job-status assertions broken by mistake | Med × Med | Step 9 classification gate. |
| Live sheet data | Low × Low | Offline suites use an in-memory store; they never touch the live sheet. |

## Security Considerations

The suite carries two security regressions that must survive this phase in line-scoped form:
- **2026-08-27 clamp review** — a hidden field must be *unsettable*, on new orders and on newly
  added lines (`orders-permissions.test.js` §6b).
- **Ownership** — `requireOwnershipOrAll_` must still refuse a `lineId` belonging to another
  user's order (new coverage, step 5).

## Next Steps

Phase 7 (docs sync) — should not start until the suite is green, so the docs describe shipped
behaviour rather than intended behaviour.
