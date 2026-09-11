# Phase 01 — CSS foundation (Styles.html)

**Priority:** P2 · **Status:** pending · **Effort:** 45m · **Blocked by:** —
**File ownership:** `apps/web/ui/Styles.html` (this phase only)

## Context

- Insert point: end of file, before `</style>` at `apps/web/ui/Styles.html:1205`,
  after the Milestone 5/5.2 user-list block (`Styles.html:1173-1204`).
- Existing classes to reuse, NOT duplicate (DRY):
  `.card` (388), `.card h3` (763), `.field` (765), `.field-label` (767),
  `.field input/select/textarea` (769-783), `.field-check` (1167-1171),
  `.form-actions` (805), `.ro-note` (538), `.updated-note` (841),
  `.view-head` (457-462).
- Responsive baseline: `.form-grid` is 1 col by default, 2 cols ≥640px
  (`Styles.html:845-847`), 3 cols ≥960px (`848-851`). The linear form must NOT
  inherit the 3-col rule.

## Requirements

Functional
- Provide a single-column form layout class the user detail can use instead of
  `.form-grid`, without changing `.form-grid` (used by Orders/Inventory forms —
  do not touch it).
- Provide section-label + permission-group styling.
- Provide a header meta line (email + created timestamp) style.

Non-functional
- Additive only. Zero edits to existing selectors → zero blast radius on
  Orders/Inventory/Stats screens.
- Use existing CSS custom properties (`--c-border`, `--c-muted`, `--c-bg`,
  `--c-surface`, `--c-text`, `--r`). No new colour literals unless a var is absent.
- No icons, no decorative pseudo-elements (design constraint: typography only).

## Classes to add

| Class | Purpose |
|---|---|
| `.form-linear` | `display:grid; gap:14px; grid-template-columns:1fr;` — never widens. Replaces `.form-grid` on this screen. |
| `.form-section` | Vertical block inside `.card`; top border + padding-top for separation, `:first-child` no border. |
| `.form-section-label` | Uppercase, 11.5px, letter-spacing .04em, `--c-muted`, `font-weight:600`, margin-bottom 10px. |
| `.user-head-meta` | Header sub-line: 12.5px `--c-muted`, flex row, gap 8px, wraps on narrow. |
| `.perm-groups` | `display:grid; gap:14px; grid-template-columns:1fr;` → `repeat(2,minmax(0,1fr))` at ≥640px. |
| `.perm-group` | Border 1px `--c-border`, radius 10px, padding 10px 12px, background `--c-bg`. |
| `.perm-group-title` | Same uppercase treatment as `.form-section-label`, margin 0 0 8px. |
| `.perm-group-items` | `display:flex; flex-direction:column; gap:6px;` (checkbox rows stack — never side-by-side, avoids mis-taps on mobile). |
| `.perm-note` | 12.5px `--c-muted` hint line under the toggle. |

Reuse `.field-check` for each checkbox row — do not write a new checkbox rule.

## Implementation steps

1. Append a commented block at `Styles.html:1204` headed
   `/* Milestone 5 / 5.3 — user detail linear form + grouped permission matrix ... */`
   explaining WHY a separate `.form-linear` exists rather than reusing
   `.form-grid` (the 3-col rule at ≥960px makes a 4-field form read as a
   scattered row; this screen is a short linear read).
2. Add the 9 classes above, base (mobile-first) rules first.
3. Add ONE `@media (min-width: 640px)` block at the end of the new section for
   `.perm-groups` only. Do not add a ≥960px rule.
4. Verify nothing else in the repo already claims these names:
   `grep -n "form-linear\|form-section\|perm-group\|user-head-meta\|perm-note" apps/web/ui/*.html`
   (today only `.perm-list` at `Styles.html:402` and the inline `perm-matrix`
   class string at `ViewsAdmin.html:563` exist — neither collides).

## Todo

- [ ] Grep-confirm no class-name collisions
- [ ] Append commented CSS block before `</style>`
- [ ] Add `@media (min-width:640px)` rule for `.perm-groups`
- [ ] `grep -c "{" ` sanity / visually confirm braces balanced
- [ ] Run full offline test sweep (should still be all-pass; CSS is inert)

## Success criteria

- `for f in tools/offline-tests/*.test.js; do node "$f" || echo FAIL; done` → no FAIL.
- No existing selector modified: `git diff --stat` shows only additions in
  `Styles.html` (`git diff -U0 apps/web/ui/Styles.html | grep '^-'` returns nothing).

## Risks

| Risk | L×I | Mitigation |
|---|---|---|
| New rule leaks into Orders/Inventory forms | Low×High | Names are new and unused; verified by the grep in step 4 and by the "no `-` lines in diff" check |
| Unbalanced brace breaks the whole stylesheet | Low×High | `</style>` is the last line; a stray brace shows immediately as an unstyled app on first manual load |
| Duplicate of an existing utility (DRY) | Med×Low | Step 4 grep + explicit reuse of `.field-check`, `.card`, `.form-actions` |

## Security considerations

None — no markup, no data. CSS cannot reveal server-withheld fields.

## Next steps

Unblocks phase 02. Do not start 02 until this is committed (both would
otherwise be reviewed as one large diff across two files).
