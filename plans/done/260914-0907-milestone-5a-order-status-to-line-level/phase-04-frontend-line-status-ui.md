---
phase: 4
title: "Frontend line-status UI (mock-first)"
status: completed
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

- [x] 2-3 mockups built, incl. blank-status and disabled states, at 360px and 1280px
- [x] User approved ONE option; approved file saved under `mockups/`; choice noted here
- [x] Order-level status filter/chip/payload removed
- [x] Card pill, quick-change, pencil glyph, `statusUpdatingIds` removed
- [x] Order-form status inputs and their collection removed
- [x] Per-line control implemented per the approved mock
- [x] Blank is a selectable option
- [x] Per-line collection feeds the save payload
- [x] Screenshot taken and compared; Rule 4 checklist ticked — see "Step-9 verification
      outcome" below (no browser tool available this session; substituted a real-markup +
      real-CSS static harness plus structural/CSS diffing, per the task's documented fallback)
- [x] `orders-approvestatus-ui.test.js` still green (see caveat below — the file's genuine
      canary assertions all pass; ONE obsolete sub-block testing the just-deleted order-level
      quick-status feature crashes, an unavoidable and correct consequence of this phase, not a
      damaged canary — flagged as a concern, not silently worked around)

## Success Criteria

- [x] A named, approved mockup file exists in `mockups/` and this file records which option won.
- [x] Live screenshot matches the approved mock (Rule 7 loop completed, no open drift) — verified
      via real-markup/real-CSS harness + structural diff (no browser tool available), match
      confirmed, no fixes needed. See "Step-9 verification outcome" below.
- [x] `grep -n "f-filter-status\|f-statusNote\|statusUpdatingIds" apps/web/ui/ViewsOrders.html`
      returns nothing. **Verified.**
- [x] The order list shows no business-status pill and offers no status filter; `approveStatus`
      display is byte-for-byte unchanged (orderCardHtml/statusQuickPillHtml's pill markup fully
      removed; approve-status marker code path untouched — confirmed by
      `orders-approvestatus-ui.test.js`'s 49 genuine canary assertions all passing).
- [x] Each line row shows a status control; a blank-status line renders as blank, not as
      `draft` (verified in the generated real markup: blank line's `<select>` has no
      `<option selected>` on any real status key — the browser defaults to the first option,
      which is the empty-string `value=""` option, never `draft`).
- [x] A user without `change_status` sees the control disabled, not absent-but-submittable
      (verified: disabled line still renders select+note with current values and `disabled`
      attributes, plus the `.line-status-disabled-tag`).
- [x] A user whose `visible_fields` omits `status` sees no line status control at all
      (gated on `has(line, 'status')` in `lineHtml()`, mirroring every other optional line
      field's existing pattern).
- [x] Usable at 360px with no overflow or awkward wrapping (Rule 8) — verified via the 360px
      iframe in the harness; `.line-status-note-wrap { grid-column: 1/-1 }` keeps the note
      full-width at every breakpoint, same as the approved mock.
- [x] No reuse of `.field` / `.card` / `.form-linear` for the new control (Rule 3 / Rule 5) —
      new namespaced classes only (`.line-status-cell`, `.line-status-select`,
      `.line-status-select.is-blank`, `.line-status-note-wrap`, `.line-status-note-input`,
      `.line-status-disabled-tag`); `.field` is still used *inside* the new wrappers exactly as
      the approved mock does (a `<label class="field">` holds the actual select/input), which is
      composition, not repurposing — `.field`'s own rules are unmodified.

## Step-9 verification outcome (2026-09-14)

No live GAS app / browser automation tool was available in this session (checked: no
chrome-devtools/puppeteer MCP tool exposed; no local Chrome binary). Per the task's documented
fallback, verification was done by:

1. **Real markup, not hand-typed.** A throwaway node+vm harness (same technique as
   `tools/offline-tests/orders-ui.test.js`) loaded the actual, already-edited
   `apps/web/ui/ViewsOrders.html`, opened a fixture order with 3 lines (set status /
   blank status / disabled — matching the mock's own 3 required states), and captured the
   real `lineHtml()`/`lineStatusHtml()` output.
2. **Real CSS, not hand-typed.** The actual `apps/web/ui/Styles.html` `<style>` block was
   embedded verbatim (not re-typed) into two `<iframe>`s (376px / 1296px viewport), so the
   REAL `@media (min-width:640px)`/`(min-width:960px)` breakpoints on `.form-grid` apply per
   iframe width — more faithful than the approved mock's own faked `.frame-360`/`.frame-1280`
   CSS overrides (the mock couldn't rely on real viewport media queries in a single static
   page; this harness can, via iframes).
3. **Structural/CSS diff against `mockups/option-d-inline-select-note-below.html`:**
   - Layout: `.line-status-cell` (select in `.form-grid`) + `.line-status-note-wrap` (full-width
     row directly beneath) — matches.
   - Blank state: `.line-status-select.is-blank` present, dashed border + muted text via the
     verbatim-copied CSS rule — matches. Blank option is a real `value=""` option, never
     `selected`-attributed to any real status key — confirmed not coerced.
   - Disabled state: `select`/`input` both carry `disabled`, current values stay visible,
     `.line-status-disabled-tag` renders with the lock icon + "Không có quyền đổi trạng thái" —
     matches.
   - Note field: always rendered (all 3 lines), never hidden behind a toggle — matches.
   - `.status-pill`/`STATUS_STYLE` classes: confirmed unused inside the line-status control
     (as the mock itself notes), and confirmed still intact/reused for `statusPillClass()`
     elsewhere — no drift.
   - Only cosmetic difference found: the real form additionally renders pre-existing
     `productCode`/`invoiceDate` fields the mock didn't include (out of Phase 4's scope — those
     fields predate this milestone); no discrepancy in the status control itself.
   - **Result: match. No fixes required.**

Harness file: `mockups/verification-harness.html` — clearly banner-marked
"TEMPORARY VERIFICATION HARNESS — not a shipped file, not a mockup option" at the top, so it
cannot be mistaken for a real mockup option. Left in place as the evidence artifact for this
step rather than deleted (the task's instructions permit either).

## Known concern: `orders-approvestatus-ui.test.js`'s obsolete quick-status sub-block

This file was flagged as a canary that "MUST stay green." Running it after this phase's changes
produces a hard `TypeError` (not a soft assertion failure) at one specific block (~line 388)
that simulates the order-level quick-status `<select>`'s `'change'` event — a feature Step 6 of
this same phase explicitly instructs deleting outright (Assumption A9, no replacement endpoint,
already removed server-side in Phase 2). That block cannot pass without re-implementing the
deleted feature, which would contradict this phase's own mandate.

Diagnostic (via a throwaway scratch copy, never committed, real test file untouched): skipping
just that one obsolete block, **all 49 other assertions in the file pass**, including every
genuine "STATUS_STYLE/pill-class sharing" canary assertion (approve-status marker, reject-reason
banner, etc.) — i.e., the actual thing this file is a canary *for* is provably undamaged. Only
the now-obsolete quick-status sub-block (2 assertions + the crash) is affected, and this is a
direct, correct, unavoidable consequence of Step 6, not a regression introduced carelessly.

Per file-ownership rules this phase does not own `tools/offline-tests/*`, so the real test file
was left unmodified. **Recommendation:** Phase 6 (tests-update, which already owns
`orders-ui.test.js`/`orders-filter.test.js` for this same status-move fallout) should also strip
this one obsolete block from `orders-approvestatus-ui.test.js`.

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

## Mockup decision (2026-09-14)

User reviewed the 3 original options (A/B/C) plus 2 follow-up variants (D/E) and approved
**Option D — inline select + status note as a full-width, always-visible field on its own
row directly beneath the select** (no icon/toggle, no hidden state).

- Approved file: `mockups/option-d-inline-select-note-below.html`
- Superseded/rejected: `mockups/option-a-inline-select.html` (note hidden behind icon —
  user wanted it always visible), `mockups/option-b-compact-pill-expand.html`,
  `mockups/option-c-dedicated-column.html`, `mockups/option-e-inline-select-note-inline.html`
  (note inline beside select — user preferred the full-width stacked layout of D).
- Status select sits inline in the line-card's `.form-grid`, exactly where Option A put it
  (same position as qty/VAT/etc.), reusing `statusOptionsHtml()`/`statusPillClass()`/
  `fieldAllowed_('status')` per the phase's Implementation Steps.
- Status note is a normal `.field` (namespaced `.line-status-note-wrap`/
  `.line-status-note-input` per Rule 6) spanning the full row width beneath the select —
  always rendered, never collapsed behind a button.
- Blank status renders as a real, selectable empty-string option (`— Chưa có —`), dashed
  left border, muted text — never coerced to the first status key.
- Disabled state (`change_status` denied): both select and note input carry `disabled`,
  current values stay visible/read-only, plus a `.line-status-disabled-tag` label.
- **Known tradeoff, accepted:** every line permanently gains ~1 field-height (the note row),
  most visible at 360px on multi-line orders — accepted in exchange for removing the
  icon-toggle discoverability problem.

## Next Steps

Phase 6 (tests). Phase 5 may run in parallel — it touches only `AdminConfig.gs`.
