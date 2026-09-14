---
phase: 4
title: "Frontend line-status UI (mock-first)"
status: pending
priority: P1
effort: 6h
dependencies: [2]
---

# Phase 4: Frontend line-status UI (mock-first)

## Overview

Remove business status from the order list/card/filter/edit-form in
`apps/web/ui/ViewsOrders.html` (3163 lines, GAS server-templated HTML with inline JS — no
framework), and add a per-line status control inside the order-detail lines table.

**This phase is gated by the project's mock-first rule.** The per-line status control is a new
interactive UI component, so `.claude/rules/ui-implementation-guidelines.md` Rule 1 applies:
2-3 mockup options → explicit user approval → only then real code. Rule 2 (screenshot
comparison against the approved mock) applies before the phase can be called done. These are
**non-negotiable** and are baked in as step 1 and step 9 below.

## Requirements

**Functional**
- Order list card: no status pill, no inline quick-change select, no status filter, no status
  filter chip. `approveStatus` display is untouched.
- Order edit form: no order-level status/statusNote inputs.
- Lines table: each row gets a status control (select) + a status note, both optional, both
  hidden when the user's `visible_fields` excludes `status`.
- Per-row control disabled when that line's `canChangeStatus` is false (Phase 2 step 14 puts
  the flag on the line object).
- `.status-pill` styles (Styles.html:590-643) are **reused**, not duplicated.

**Non-functional**
- Mobile responsive at 360 / 768 / 1280 px. Tap targets ≥ 40px (Rule 4).
- The lines table already carries description/qty/uom/price/VAT/invoice/note per row. Adding
  two more fields is a real density problem at 360px — the mockups must solve it, not defer it.

## Architecture

### Verified reference points in `ViewsOrders.html` (all confirmed 2026-09-14)

| Line(s) | What | Action |
|---|---|---|
| 68-74 | `state.statusUpdatingIds` — in-flight optimistic-update map for the order-level quick change | **Remove** (missed by the original audit) |
| 194-203 | `statusList()` / `statusLabel()` | **Keep** — now serve line status |
| 205-225 | `STATUS_STYLE` + `statusPillClass()` | **Keep** — reused per line |
| 259-260, 281, 302-330 | comments contrasting business status vs approve status | Update wording |
| 430 | comment listing `statusNote` among order-level optional fields | Update |
| 608 | `if (state.filters.status) payload.status = …` | Remove |
| 617 | `hasActiveFilters` includes `f.status` | Remove that term only — keep `f.approveStatus` |
| 642-644 | pencil glyph for the quick-status pill (E1 option, chosen 2026-08-31) | Remove |
| 860 | filter-field docstring | Update |
| 1367 | status filter `<select id="f-filter-status">` | Remove |
| 1408-1409 | active-filter chip for status | Remove |
| 1435-1437 | `statusOptionsHtml()` | **Keep + reuse** for the per-line select |
| 1693-1708 | card status pill + inline quick-change `<option>` loop | Remove |
| 1738, 1743 | new-order defaults `status: statusList()[0].key`, `statusNote: ''` | Remove; new **lines** start blank (Phase 2 A3) |
| 2006-2013 | order-level status `<select>` + `#f-statusNote` input | Remove from the order form; add per-line equivalents in the lines table |
| 2548-2549 | `statusLabel(o.status)` / `statusPillClass(o.status)` for card render | Remove |
| 2721-2748 | client-side `actionChangeStatus_` call + optimistic update | **Delete outright** — no replacement endpoint exists (Phase 2, A6) |
| 2800, 2810 | `o.status = get('#f-status')`, `o.statusNote = get('#f-statusNote')` | Remove from order-level collection; add per-line collection |

`fieldAllowed_('status')` is the existing client-side visibility helper (used at 1367, 1743);
reuse it verbatim for the per-line control — the field key did not change, only its scope.

### Assumption A9 — the per-line control saves with the form, not per keystroke (confirmed by project owner 2026-09-14)

The lines table lives inside the order edit form, which already submits as a whole through
`actionUpdateOrder_`. The per-line status rides along with the normal save (Phase 2 handles it
in the line loop). Confirmed: **no separate quick-change affordance anywhere** — not on the
list, not on the read-only detail view. There is no `changeLineStatus` endpoint to wire (Phase
2, A6, deleted `actionChangeStatus_` with no replacement) — mockups only need to show the
in-form control, not a standalone quick-change interaction.

### Assumption A10 — no status column on the order card, at all

Per the confirmed decision, the list view drops status entirely — not even a "3 lines in 2
statuses" summary. YAGNI: no requirement asked for it, and it would need a per-card line fetch
the list endpoint deliberately does not do (`LIST_CARD_FIELDS`, Config.gs:137-148, exists
precisely to keep list pages narrow).

## Related Code Files

**Modify**
- `apps/web/ui/ViewsOrders.html` — every line in the table above.
- `apps/web/ui/Styles.html` — `.status-pill` block at 590-643: **keep**; add only what the
  approved mock requires, under a new namespaced class per Rule 6 (e.g. `.line-status-*`),
  never by repurposing `.field`, `.card`, or `.form-linear` (Rule 3 / Rule 5).

**Create (temporary, for approval only)**
- `plans/260914-0907-milestone-5a-order-status-to-line-level/mockups/` — 2-3 standalone HTML files.
  Not shipped; retained as the reference artifact Rule 1 requires ("document the chosen
  mockup clearly").

**Delete:** none.

## Implementation Steps

1. **MOCK-FIRST (mandatory gate).** Build 2-3 standalone HTML mockups of the lines table with
   a per-line status control. Suggested directions:
   - **Option A — inline select + note icon**: mirrors today's order-level control; most
     familiar, widest row.
   - **Option B — compact pill, expand on click**: pill shows the label, clicking reveals the
     select + note; best at 360px.
   - **Option C — dedicated status column**: explicit table column, note as a tooltip/second
     line; most scannable, worst density.
   Each mockup must show: a line with a status, a line with **blank** status, and a disabled
   control (no `change_status`). Render at 360px and 1280px.
2. **Present to the user and wait for explicit approval of ONE option.** Do not write any
   `ViewsOrders.html` change before this. Save the approved file under `mockups/` and note the
   choice at the bottom of this phase file.
3. Remove order-level status from the filter path: 608, 617 (the `f.status` term only), 1367,
   1408-1409.
4. Remove order-level status from the card: 1693-1708, 2548-2549, 642-644, and the
   `state.statusUpdatingIds` machinery at 68-74 plus every reference to it.
5. Remove order-level status from the edit form: 1738, 1743, 2006-2013, 2800, 2810.
6. Delete the client `actionChangeStatus_` call (2721-2748) outright, per A9 — no replacement
   endpoint exists.
7. Build the per-line control in the lines table, following the approved mock exactly. Reuse
   `statusOptionsHtml()` (1435-1437), `statusPillClass()` (224), `fieldAllowed_('status')`.
   Blank must be a real, selectable option — not a placeholder that coerces to the first key.
8. Extend the per-line form collection (near 2800) to read each row's status/note into the
   line objects the save payload carries.
9. **SCREENSHOT VERIFICATION (mandatory gate, Rule 2 / Rule 7).** Screenshot the live UI, open
   it side-by-side with the approved mock, and walk Rule 4's checklist: layout structure,
   spacing, typography, colour, 360/768/1280 responsive, labels/focus/tap-targets. Fix and
   re-shoot until it matches. The phase is **not** done with any visual drift outstanding.
10. Run `orders-ui.test.js`, `orders-filter.test.js`, `orders-approvestatus-ui.test.js`.
    Expect failures in the first two (Phase 6); the third must stay green.

## Todo List

- [ ] 2-3 mockups built, incl. blank-status and disabled states, at 360px and 1280px
- [ ] User approved ONE option; approved file saved under `mockups/`; choice noted here
- [ ] Order-level status filter/chip/payload removed
- [ ] Card pill, quick-change, pencil glyph, `statusUpdatingIds` removed
- [ ] Order-form status inputs and their collection removed
- [ ] Per-line control implemented per the approved mock
- [ ] Blank is a selectable option
- [ ] Per-line collection feeds the save payload
- [ ] Screenshot taken and compared; Rule 4 checklist ticked
- [ ] `orders-approvestatus-ui.test.js` still green

## Success Criteria

- [ ] A named, approved mockup file exists in `mockups/` and this file records which option won.
- [ ] Live screenshot matches the approved mock (Rule 7 loop completed, no open drift).
- [ ] `grep -n "f-filter-status\|f-statusNote\|statusUpdatingIds" apps/web/ui/ViewsOrders.html`
      returns nothing.
- [ ] The order list shows no business-status pill and offers no status filter; `approveStatus`
      display is byte-for-byte unchanged.
- [ ] Each line row shows a status control; a blank-status line renders as blank, not as
      `draft`.
- [ ] A user without `change_status` sees the control disabled, not absent-but-submittable.
- [ ] A user whose `visible_fields` omits `status` sees no line status control at all.
- [ ] Usable at 360px with no overflow or awkward wrapping (Rule 8).
- [ ] No reuse of `.field` / `.card` / `.form-linear` for the new control (Rule 3 / Rule 5).

## Risk Assessment

| Risk | L×I | Mitigation |
|---|---|---|
| Implementation skips the mock gate and lands the wrong layout | Med × **High** | Documented project failure mode (form-linear vs stacked sections). Steps 1-2 are a hard gate; step 9 is the second. Consequence per the rules doc: restart from the mockup phase. |
| Lines table becomes unusable at 360px with two more fields per row | **High** × High | Density is an explicit mockup requirement (step 1); Option B exists specifically for this. 360px is in the Success Criteria. |
| Reusing `.field`/`.card` drags in unwanted styling | Med × Med | Rule 6 namespacing (`.line-status-*`) mandated in Related Code Files. |
| Blank status coerces to the first key via a placeholder `<option>` | **High** × Med | Explicit criterion. This is the exact bug the removed `statusList()[0].key` default (1738) would reintroduce. |
| `approveStatus` UI damaged as collateral — the two share `STATUS_STYLE`/pill classes | Med × High | Comments at 259-281 already warn that mixing the two classes drags in unwanted rules (e.g. `status-pill--cancelled`'s strikethrough). Keep `orders-approvestatus-ui.test.js` green as the canary. |
| `state.statusUpdatingIds` partially removed, leaving dangling references | Med × Med | Grep for it in Success Criteria; it is referenced in several places, not just 68-74. |
| Tests pass but the UI is visually wrong | Med × High | Documented failure mode: tests check syntax, not layout. Step 9 is the only thing that catches it. |
| Live sheet data | Low × Low | No schema or data writes from this phase. |

## Security Considerations

- Client-side hiding is cosmetic only — the server-side clamp (Phase 2, `clampHiddenLineFields_`)
  is the real control. Do not let the UI work become the justification for weakening it.
- `canChangeStatus` arriving per line is a **UI hint**. The server re-checks
  `requirePermission_` + `requireOwnershipOrAll_` on every write (Phase 2 A6).
- Keep using `T.esc()` on any status label/note rendered into HTML — status keys and notes are
  admin/user-supplied text (`statusNote` is free text).

## Next Steps

Phase 6 (tests). Phase 5 may run in parallel — it touches only `AdminConfig.gs`.
