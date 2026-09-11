# Phase 02 — CSS foundation for the config screen

**Owns:** `apps/web/ui/Styles.html` (append only, after `:1286`)
**Blocked by:** 01 (needs the chosen option's rule block)
**Effort:** 45m
**Priority:** P2

## Context links

- Chosen design: `phase-01-mockup-options-and-approval.md` → "Decision"
- Insert point: after `Styles.html:1286` (`.perm-body--collapsed`), before `</style>` at `:1287`
- Reused rules: `.card` `:388-396`, `.card h3` `:763`, `.field/.field-label` `:765-783`,
  `.btn-mini` `:103-110`, `.btn-icon` `:497-505`, `.form-actions` `:805-808`,
  `.form-section-label` `:1223-1226`, `.view-head` `:457-462`, `.empty` `:409`
- Theme vars: `:2-17`

## Overview

Add the *minimum* new rules and reuse everything else. `grep -c config
Styles.html` is currently 0, so nothing can regress — this phase is purely
additive and independently shippable.

## Key insights

- **DRY beats the task brief.** The brief says "add CSS for `config-sections`,
  `config-section`, `config-editor`, `config-input`, `config-list-editor`".
  Three of those five are exact duplicates of classes that already exist:
  `config-section` ≡ `.card`, `config-input` ≡ `.field input`,
  `config-sections` ≡ `.form-linear`. Styling them separately would fork the
  theme and guarantee future drift. **Decision: reuse those three, keep only the
  genuinely new structural classes.** Phase 03 renames the markup accordingly.
- `.field input` already supplies 16px font (no iOS zoom), 44px min-height,
  `--c-brand` focus ring and a `:disabled` style — exactly what the locked
  `statusList` code input needs, for free.
- `.btn-mini` is the project's real "small secondary button"; `.btn-sm` was never
  defined. Same for `.btn-secondary` → use bare `.btn`… except bare `.btn` is
  brand-filled. See "btn-secondary decision" below.

## Requirements

Functional:
1. Repeating rows read as rows (input(s) + delete) at ≥480px and stack cleanly below.
2. Muted description line under each section heading.
3. Empty-list state styled.
4. Locked `statusList` code input visibly non-editable.
5. Dirty-state affordance per the chosen mockup option.

Non-functional:
- No existing selector modified. No `!important`. No new CSS variable unless the
  chosen option demands one.
- ≤10 new selectors. Every value comes from an existing var (`--gap`, `--r`,
  `--c-border`, `--c-muted`, `--c-bg`, `--c-brand-soft`).
- One breakpoint only: `min-width: 480px` for the row-inline switch. Do not add
  a 360px media query — mobile is the base state (mobile-first, same as
  `Styles.html:453-455`).

## Architecture — the new rule set

```
/* Milestone 5 / 5.4 (2026-09-10) — system config screen (ViewsAdmin.html).
   Reuses .card / .field / .btn-mini / .btn-icon / .form-actions as-is; only
   the repeating-row shapes below are new. Zero existing selectors touched. */

.config-desc      /* muted 12.5px description under the section heading */
.config-list      /* flex column, gap 8px — wraps the repeating rows */
.config-row       /* flex, align-items:flex-end, gap 8px, wrap — one row */
.config-row-fields/* the input(s) inside a row: grid 1fr, gap 8px */
.config-row .btn-icon  /* keep the delete button off the wrap line on mobile */
.config-empty     /* reuses .empty's palette at a smaller padding */
@media (min-width: 480px) {
  .config-row-fields { grid-template-columns: minmax(0,1fr) minmax(0,2fr); }
  /* statusList = code (narrow) + label (wide); single-input rows get
     .config-row-fields--single { grid-template-columns: 1fr; } */
}
```

Plus, if option B was chosen: `.config-save-bar` (sticky, `bottom:0`,
`padding-bottom: max(12px, env(safe-area-inset-bottom))`, surface background,
top border, `z-index` below `.toast`'s 50 — use 20).

### `btn-secondary` decision

`.btn-secondary` is used at `ViewsAdmin.html:403` and `:1015` and is **undefined**,
so both buttons currently render brand-filled. Two ways out:

- **(chosen) Define `.btn-secondary`** in this phase as the outline sibling of
  `.btn-danger`/`.btn-ok` (`Styles.html:809-814`):
  `background: var(--c-surface); color: var(--c-brand); border-color: var(--c-border);`
  That fixes both call sites, matches the existing `.btn-*` modifier family, and
  costs 1 rule. Phase 03 then keeps the class name.
- (rejected) Rewrite both call sites to `.btn-mini` — `btn-mini` is 13px with no
  44px min-height, wrong for a `.view-head` action.

`.btn-sm` is **not** defined; phase 03 rewrites those two call sites to
`.btn-mini` instead (correct size for an inline "+ Thêm").

## Related code files

- Modify: `apps/web/ui/Styles.html` — append one commented block after `:1286`
- Read: `phase-01-mockup-option-<chosen>.html`
- Create / delete: none

## Implementation steps

1. Confirm phase 01's Decision line exists. If not, stop.
2. Append the block after line 1286 with a dated header comment in the same
   voice as `:1206-1211` and `:1173-1176` (state *why*, not *what*).
3. Add `.btn-secondary` next to the other `.btn-*` modifiers **conceptually** but
   physically inside the new block (appending keeps the diff to one hunk; note in
   the comment that it belongs to the `:809-814` family).
4. Optionally fix `--c-text-dim` → `--c-muted` at `:1195` (Unresolved #4). If
   done, it is a separate one-line commit, not part of the config block.
5. Verify nothing else broke: `node tools/offline-tests/admin-ui.test.js` (CSS is
   not parsed by the tests, so this only proves nothing was mangled) plus a
   browser render of the users tab.

## Todo list

- [ ] Phase 01 Decision confirmed
- [ ] Block appended after `Styles.html:1286` with a dated why-comment
- [ ] `.btn-secondary` defined (outline sibling of `.btn-danger`)
- [ ] ≤10 new selectors, no existing selector touched (`git diff` shows one added hunk only)
- [ ] `grep -c "config-" apps/web/ui/Styles.html` > 0
- [ ] Sticky bar rule added **only if** option B chosen
- [ ] `--c-text-dim` decision recorded

## Success criteria

- `git diff --stat` for this commit: `Styles.html` only, insertions only, zero deletions
  (except the optional `--c-text-dim` line if folded in).
- All 5 config sections in the chosen mockup render identically when its NEW block
  is swapped for the real `Styles.html`.
- Users/Orders/Inventory/Stats screens visually unchanged (spot-check one screen each).

## Risk assessment

| Risk | L×I | Mitigation |
|---|---|---|
| A new `.config-row` rule leaks into another screen | Low × High | Every new selector is prefixed `config-`; only exception is `.btn-secondary`, whose 2 call sites are both known (`ViewsAdmin.html:403,1015`) |
| `.btn-secondary` changes the users-tab header look | **High × Low** | It *is* the intended fix — the button stops being brand-filled. Show Phong the before/after; it is the same change the mockup already shows |
| Sticky bar overlaps the toast | Low × Med | `z-index: 20` < `.toast`'s 50 (`Styles.html:436`) |
| CSS-only phase has no automated guard | High × Low | Phase 05 adds a grep-based assertion that every `config-*` class emitted by ViewsAdmin resolves to a rule |

## Security considerations

None — presentation only. No new class conveys permission state; the
`statusList` code lock is styling on top of the server guard
(`AdminConfig.gs:225-241`), never a replacement for it.

## Next steps

Phase 03 rewrites `ViewsAdmin.html:1010-1102` against these class names.
