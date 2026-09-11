# Phase 03b — Order line UOM: `<select>` → input + datalist (OPTIONAL)

**Priority:** P3 · **Status:** blocked (needs user decision) · **Effort:** 40m
**Blocked by:** 03 + decision #1 in `plan.md`
**Owns:** `apps/web/ui/ViewsOrders.html`, `tools/offline-tests/orders-ui.test.js`

## Why this phase exists

Requirement #2 of the brief — "order line created/updated with a new UOM →
auto-add" — **cannot happen from the web UI today**:

- `.l-uom` is a `<select>` whose options come only from `uomList()`
  (`ViewsOrders.html:2193-2200`). There is no way to type a value that is not
  already in the config.
- Worse, the product picker *does* try to autofill an off-list UOM
  (`ViewsOrders.html:2313`: `if (uom) line.uom = uom;`), but the repaint renders a
  `<select>` with no matching `<option>`, and `collect()` reads the DOM back
  (`ViewsOrders.html:2815`: `line.uom = pick('.l-uom')`) → the value silently
  becomes `''`. A product whose UOM is not in `uomList` therefore loses its unit
  on every order line, today, independent of this feature.

The product form already solves this with an input + datalist
(`ViewsInventory.html:613-617`, asserted by `products-ui.test.js:187-188`).
This phase mirrors that control on the order line.

## Scope / non-scope

- In: the `.l-uom` control, one shared `<datalist>` per form, the `collect()` read.
- Not in: server validation (a free-text `uom` is already accepted —
  `Orders.gs:1342`), the config screen, the product form.
- Mock-first rule: this is a single control swap on an existing form (a "minor
  tweak" per `.claude/rules/development-rules.md` → UI Design Process), so no
  mockup round is required — but Rule 2 of `ui-implementation-guidelines.md`
  (screenshot after implementation) **does** apply.

## Requirements

- Line UOM becomes `<input class="l-uom" list="uom-options">` plus one
  `<datalist id="uom-options">` rendered once per order form (not per line — one
  id must not be duplicated).
- Existing value renders as the input's `value`, escaped with `T.esc`.
- Disabled state (`d`) still applied.
- `has(line, 'uom')` gating unchanged — a role without `uom` visibility still
  renders nothing (`orders-ui.test.js:263,425` assert `l-uom` is absent).
- Default for a new line stays `uomList()[0]` (`ViewsOrders.html:1822`).
- Product-picker autofill now survives the repaint and the `collect()` round trip.

## Related code files

- Modify: `apps/web/ui/ViewsOrders.html` — the uom `field(...)` block (`:2193-2200`),
  plus a `uomDatalistHtml()` helper (copy the shape from
  `ViewsInventory.html:613-617`) emitted once in the form wrapper.
- Modify: `tools/offline-tests/orders-ui.test.js` — add datalist assertions.

## Implementation steps

1. Add `uomDatalistHtml()` next to `uomList()` (`ViewsOrders.html:445`).
2. Emit it once in the order form container (not inside the per-line loop).
3. Replace the `<select class="l-uom">` block with
   `<input class="l-uom" list="uom-options" value="..."' + d + '>`.
4. Verify `collect()` (`:2815`) needs no change — `pick('.l-uom')` reads `.value`
   from an input identically.
5. Add tests: datalist present exactly once; `l-uom` is an `input` with
   `list="uom-options"`; off-list stored value still renders in the input;
   restricted role still has no `l-uom` (the two existing assertions must stay green).
6. `node tools/offline-tests/orders-ui.test.js` → 0 failed; full suite green.
7. **Screenshot the order form** at 360px / 768px / 1280px and compare against the
   inventory form's UOM field (same control, same look). Per
   `.claude/rules/ui-implementation-guidelines.md` Rule 2/4.

## Todo list

- [ ] `uomDatalistHtml()` helper
- [ ] datalist emitted once per form
- [ ] `<select>` → `<input list="uom-options">`
- [ ] `orders-ui.test.js` assertions (4 new, 2 existing must stay green)
- [ ] `node tools/offline-tests/orders-ui.test.js` → 0 failed
- [ ] Screenshots at 360 / 768 / 1280 compared to inventory form
- [ ] End-to-end: pick a product whose UOM is off-list → save → UOM persisted →
      UOM appears in `Config.uomList` → visible in the form after reload

## Success criteria

- `grep -c 'id="uom-options"' apps/web/ui/ViewsOrders.html` → `1`
- `orders-ui.test.js` `balanced()` check passes (`<input>` is in the VOID list —
  `orders-ui.test.js` mirrors `admin-ui.test.js:184-191`)
- Restricted-role assertions at `orders-ui.test.js:263,425` unchanged and green
- Manual: off-list product UOM survives a save (the pre-existing data-loss bug is gone)
- No horizontal scroll at 360px

## Risk assessment

| Risk | L×I | Mitigation |
|---|---|---|
| Duplicate `id="uom-options"` if rendered per line | M×M | Emit in the form wrapper; `grep -c` = 1 in DoD |
| Free text lets users invent near-duplicates (`Kg` / `KG` / `kgs`) | H×M | `rememberUoms_` dedupes case-insensitively; admin can delete strays |
| Width/height drift vs the old select on mobile | M×L | Reuse the same `field(...)` wrapper; screenshot check at 360px |
| `balanced()` HTML test trips on `<datalist>` | L×M | Non-void, properly closed — same markup the inventory view already ships |

## Security considerations

None new: the server already accepts arbitrary `uom` text and caps it
(`text_()`, plus `UOM_LIMITS` from phase 01). This only stops the client from
throwing the value away.

## Next steps

If declined: close this phase as `cancelled` and note in `plan.md` that order-side
auto-add is API-only, and that the product-picker UOM-drop bug remains open —
it should then be logged as a separate bug.
