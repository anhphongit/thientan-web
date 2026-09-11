# Phase 04 — Edge cases, regression sweep, docs

**Priority:** P2 · **Status:** pending · **Effort:** 40m · **Blocked by:** 02, 03
**Owns:** `tools/offline-tests/uom-autoadd.test.js`, `tools/offline-tests/README.md`

## Context links

- Phase 01 unit tests live in the same file (sections 1-8)
- Admin config round-trip: `apps/api/AdminConfig.gs:178-215`, tests
  `tools/offline-tests/admin-config.test.js:169-231`
- Harness stubs / store shape: `tools/offline-tests/harness.js:216-260`

## Key insights

1. Phases 01-03 each test their own slice. What is left is the **cross-cutting**
   behaviour: interaction with the admin config editor, the cache layers, and the
   "never break the save" contract under real failure.
2. `admin-config.test.js:169-231` already proves an admin can add/remove/dedupe
   `uomList` items. Phase 04 must prove auto-added items are *ordinary* items —
   removable, editable, and not special-cased.
3. `readPublicConfig_` in the harness reads straight from `store.Config`
   (`harness.js:244-259`) with no caching, so the fast path is exercised but the
   120s CacheService layer is not. That layer is only reachable in a real
   deployment → covered by the manual checklist, not by a test.

## Test matrix

| # | Case | Type | Where |
|---|---|---|---|
| 9 | Auto-added UOM is then deleted by admin via `actionUpdateConfig_` → stays deleted | integration | `uom-autoadd.test.js` |
| 10 | Auto-added UOM is then relabelled by admin → no resurrection unless re-typed | integration | `uom-autoadd.test.js` |
| 11 | `invalidateConfigCache_` called exactly once per successful append, zero times on a no-op | unit (spy) | `uom-autoadd.test.js` |
| 12 | `invalidateReadCache_(SHEETS.CONFIG)` called before the authoritative read | unit (spy) | `uom-autoadd.test.js` |
| 13 | `updateRecord_` throwing on the Config sheet → product create still returns a `productId`; order create still returns an `orderId` | integration | `uom-autoadd.test.js` |
| 14 | `uomList` at `MAX_LIST` (200) → new UOM skipped, list untouched, no throw | unit | `uom-autoadd.test.js` |
| 15 | Unicode / Vietnamese diacritics: `'Xấp'` vs `'xấp'` dedupe; `'Bộ'` preserved byte-exact | unit | `uom-autoadd.test.js` |
| 16 | Value with an inner newline / tab → trimmed at the ends only, stored as-is otherwise (documents actual behaviour) | unit | `uom-autoadd.test.js` |
| 17 | 50-line order, 3 distinct new UOMs → exactly 1 Config write | perf (spy) | `uom-autoadd.test.js` |
| 18 | Order + product saved in the same test run → both UOMs present, append order = save order | integration | `uom-autoadd.test.js` |
| — | Full suite regression | sweep | all `*.test.js` |
| — | 120s CacheService staleness after an append | manual | checklist below |
| — | New UOM visible in the dropdown only after reload (session snapshot) | manual | checklist below |

Note on case 15: `String.prototype.toLowerCase()` handles Vietnamese diacritics
correctly for case folding; `'Xấp'`/`'xấp'` dedupe, while `'Xap'` is a genuinely
different unit and must be added. Do **not** add accent-stripping —
`normalizeFilter_` exists for search, not for identity.

## Manual checklist (real deployment, not offline)

1. Create a product with UOM `Kg` → reload the app → `Kg` appears in the inventory
   form's datalist and (after 03b) in the order line input.
2. Admin → System config → `uomList` shows `Kg` **last**; delete it; save; reload →
   gone.
3. Confirm the order line default UOM is still the first configured unit (`Cái`),
   i.e. nothing got reordered.
4. Two browsers saving different new UOMs within a second of each other → both
   present (no lost update).

## Implementation steps

1. Append sections 9-18 to `uom-autoadd.test.js`.
2. Spy helper: wrap `env.updateRecord_` / `env.invalidateConfigCache_` /
   `env.invalidateReadCache_` with counters before the call, restore after.
3. Run every test file; record the new totals.
4. Update `tools/offline-tests/README.md`: add `uom-autoadd.test.js` to the
   example command block with a one-line description.
5. Evaluate docs impact: state `Docs impact: minor` and add a line to
   `docs/project-changelog.md` (delegate to `docs-manager`) — no architecture
   change, no schema change.

## Todo list

- [ ] sections 9-18 in `uom-autoadd.test.js`
- [ ] spy helper for write/cache counters
- [ ] `for f in tools/offline-tests/*.test.js; do node "$f" >/dev/null || echo "FAIL $f"; done` → no FAIL
- [ ] `README.md` in `tools/offline-tests/` mentions the new file
- [ ] Manual checklist run on the deployed script
- [ ] Changelog line via `docs-manager`

## Success criteria

- `node tools/offline-tests/uom-autoadd.test.js` → `0 failed`, ≥ 30 assertions total
- Full suite: no FAIL, and every pre-existing file's pass count is unchanged
  except `products.test.js` (+6) and `orders-crud.test.js` (+6)
- Case 13 proves the "never fails the save" contract for both domains
- Case 17 proves the batching claim (1 write for a 50-line order)
- Manual checklist items 1-3 verified on the deployed script

## Risk assessment

| Risk | L×I | Mitigation |
|---|---|---|
| Spies left installed leak into later sections → phantom failures | M×M | Install/restore inside each section's block scope |
| 120s config cache makes the manual check look broken | M×M | `invalidateConfigCache_()` is part of phase 01; manual step 1 includes a reload |
| Session snapshot confusion reported as a bug ("UOM not in the list") | H×L | Documented as decision #3 in `plan.md`; note it in the changelog line |
| Accent-stripping added "for convenience" → `Bộ` and `Bo` collapse | L×H | Explicitly out of scope in case 15's note |

## Security considerations

Nothing new. Confirms that the auto-added value is inert display vocabulary and
that the admin allowlist path (`AdminConfig.gs:38-124`) remains the only way to
edit any other config key.

## Next steps

Hand off to `code-reviewer`, then `git-manager` (one commit per phase).
If decision #1 was "yes", phase 03b lands after this phase and repeats the
suite + screenshot check.
