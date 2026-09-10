# Phase 01 — Notes (Ghi chú) field styling

**Priority:** P2 · **Status:** ✅ completed · **Effort:** 20m (actual: 15m)
**Owns:** `apps/web/ui/ViewsAdmin.html`
**Blocked by:** — (can run in parallel with phase 02)

## Context

- Plan: [plan.md](plan.md)
- Prior redesign: `plans/260910-1257-admin-user-detail-linear-form/`

## Key insight — this is a markup bug, not a missing style

`ViewsAdmin.html:595-598` renders:

```js
'<div class="form-section">' +
  '<span class="form-section-label">Ghi chú</span>' +
  '<textarea id="f-note"' + d + '>' + T.esc(u.note) + '</textarea>' +
'</div>'
```

The textarea is a **direct child of `.form-section`**. Every styled control in
the app is reached through `.field` (`Styles.html:769-782`):

```css
.field input, .field select, .field textarea { font: inherit; font-size: 16px; ... }
.field textarea { min-height: 66px; resize: vertical; }
```

Grep for `textarea` in `Styles.html` returns only lines 201, 203 (confirm-dialog
scoped) and 769-780 (`.field`-scoped). There is **no** bare-element rule, so
`#f-note` falls back to UA defaults: monospace, ~20 columns, square corners, no
focus ring. Every sibling control on this form is styled because it goes through
`field()` (`ViewsAdmin.html:455-458`).

Fix: route it through `field()`. Zero new CSS.

## Requirements

- Functional: textarea keeps `id="f-note"`, the `disabled` attribute when busy,
  and its escaped value — `collect()` reads `#f-note` at `ViewsAdmin.html:722`.
- Non-functional: no new CSS class, no change to any other screen.

## Related code files

- Modify: `apps/web/ui/ViewsAdmin.html` (`formCardHtml`, `:595-598`)
- Read: `apps/web/ui/Styles.html:769-782` (why `.field` is required)
- Do **not** modify: `apps/web/ui/Styles.html`

## Implementation steps

1. In `formCardHtml()` (`ViewsAdmin.html:567-601`), replace the Ghi chú block's
   bare textarea with the `field()` helper, keeping the section wrapper:

   ```js
   '<div class="form-section">' +
     '<span class="form-section-label">Ghi chú</span>' +
     field('Nội dung ghi chú',
       '<textarea id="f-note" rows="3"' + d + '>' + T.esc(u.note) + '</textarea>') +
   '</div>'
   ```

   `field()` emits `<label class="field"><span class="field-label">…</span>…</label>`.
2. Decide the inner label text with the reviewer. If a second visible label
   below "Ghi chú" is redundant, use `<label class="field">` directly without
   `.field-label` rather than inventing a new CSS class:

   ```js
   '<label class="field"><textarea id="f-note" rows="3"' + d + '>' +
     T.esc(u.note) + '</textarea></label>'
   ```

   **Prefer this variant** — `.form-section-label` already labels the section,
   and it keeps the DOM flatter. `.field` alone supplies all the styling.
3. Run `node tools/offline-tests/admin-ui.test.js` — must still be 44/44
   (no current assertion touches `#f-note`'s wrapper; verify, don't assume).

## Todo list

- [ ] Wrap `#f-note` in `<label class="field">` inside its `.form-section`
- [ ] Keep `id`, `disabled`, escaped value, add `rows="3"`
- [ ] `node tools/offline-tests/admin-ui.test.js` → 44/44
- [ ] Visually confirm at 375px and 1280px: full width, rounded border, focus ring

## Success criteria

1. `#f-note` has an ancestor with class `field` in the rendered HTML.
2. Textarea renders at `width:100%`, `min-height:66px`, `font-size:16px`,
   brand focus ring — identical to `#f-displayName`.
3. `collect()` still reads the value (`ViewsAdmin.html:722`) — asserted by the
   existing save tests.
4. 44/44 tests still pass; no `Styles.html` diff.

## Risk assessment

| Risk | L×I | Mitigation |
|---|---|---|
| `balanced()` HTML checker rejects the nesting | L×L | `<label>` and `<textarea>` are both non-void and properly closed; `field()` output is already used ~5× on this form. |
| A test regex matches on the old flat markup | L×L | Grep `f-note` in `admin-ui.test.js` before editing — currently only used as a `fieldValues` key (`:177`, `:284`), never asserted in markup. |

## Security considerations

`T.esc(u.note)` must stay — it is the only XSS guard on this field. Do not swap
to template interpolation without it.

## Next steps

Unblocks phase 03 (which re-renders the same `formCardHtml`). Land this first so
phase 03 does not have to re-touch the Ghi chú block.
