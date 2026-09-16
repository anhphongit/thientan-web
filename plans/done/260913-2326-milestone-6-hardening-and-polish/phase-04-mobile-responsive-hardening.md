---
phase: 4
title: "Mobile responsive hardening"
status: complete
priority: P1
effort: "3h"
dependencies: []
---

# Phase 4: Mobile responsive hardening

## Overview

Base scope: "Full responsive pass on real devices" (`docs/MILESTONES.md` M6, exit criterion "Every
screen usable on iOS Safari and Android Chrome"). A full CSS scan (codebase inventory, 2026-09-13)
found **no fixed-pixel-width mobile hazards** — every large dimension in `Styles.html` is already
`max-width`/`min-width` correctly. This phase is therefore narrower than "redesign the responsive
layout": it targets known **iOS-Safari-inside-Apps-Script-iframe** quirks that a generic desktop-eye
CSS review wouldn't catch, plus produces the real-device verification checklist for Phase 6/7 (per
2026-09-13 scope decision: audit+fix here, real-device walkthrough happens live via checklist, not
claimed as "verified" by this phase alone).

## Key Insights

From `plans/reports/researcher-260913-2326-mobile-responsive-error-handling.md` — this app is
served via `HtmlService.createTemplateFromFile(...).evaluate()` inside Google's sandboxed iframe
(`XFrameOptionsMode.ALLOWALL`, `apps/web/Main.gs:doGet`), which behaves differently from a normal
top-level mobile page:

- **Viewport height (`100vh`) unreliable inside the iframe on iOS Safari** — the iframe's own
  height can lag the visual viewport during Safari's chrome show/hide-on-scroll behavior. Use
  `100dvh` with a JS `window.innerHeight`-based fallback/recalc on `resize`, not a bare `100vh`.
- **`visualViewport` API is blocked inside this sandbox** — do not build any fix that depends on
  it; use `window.innerHeight` polling/resize-listening instead.
- **Virtual keyboard resize behavior**: add `interactive-widget=resizes-content` to the viewport
  meta tag (currently set via `apps/web/Main.gs:doGet`'s `.addMetaTag('viewport', 'width=
  device-width, initial-scale=1, viewport-fit=cover')` — extend that string, do not add a second,
  conflicting `<meta>` tag) plus CSS safe-area padding (`env(safe-area-inset-*)`) so a focused input
  isn't hidden behind the keyboard or notch.
- **Touch targets**: 44×44px minimum (Apple HIG) — spot-check the codebase inventory's noted
  ≤44px control elements (checkboxes, chevrons, spinners, avatar badges in `Styles.html`) against
  this floor; these were flagged as "icon/control-sized, not layout-breaking" by the inventory, but
  weren't specifically checked against the 44px tap-target floor (a control can be visually small
  while its **tappable hit area** is still 44px via padding — verify each).
- **Momentum scrolling**: prefer `overscroll-behavior: contain` over the deprecated
  `-webkit-overflow-scrolling: touch` for any internally-scrolling container (modals, the export
  dialog mentioned in `Styles.html:224`'s comment).
- **No fixed-width hazard found** in the full scan — do not spend time re-auditing this; the
  existing 10 `@media` breakpoints in `Styles.html` (441/845/848/997/1036/1111/1255/1330, plus the
  two `prefers-reduced-motion` rules) are sound. This phase adds/adjusts rules for the iframe-
  specific quirks above, it does not rewrite the existing breakpoint structure.

## Requirements

- Functional:
  - Any full-height container relying on `100vh` (grep `Styles.html` for `vh` units) updated to
    `100dvh` + JS fallback.
  - Viewport meta tag (`apps/web/Main.gs:doGet`) extended with `interactive-widget=resizes-content`.
  - Safe-area padding added to any fixed top/bottom bar or modal that could sit under a notch/home
    indicator.
  - Every interactive control's **tap target** (not necessarily its visual size) verified ≥44×44px
    via computed padding — fix any that fall short.
  - Scrolling containers use `overscroll-behavior: contain`.
- Non-functional: no visual regression on desktop/tablet breakpoints — this is additive/targeted,
  not a rewrite of `Styles.html`'s existing structure.

## Related Code Files

- Modify: `apps/web/ui/Styles.html` (viewport-unit fixes, safe-area padding, tap-target sizing,
  `overscroll-behavior`), `apps/web/Main.gs` (`doGet`'s viewport meta string), any view file with
  an inline style using `vh`/small tap targets found during the grep pass
- Create: `docs/CHECKLIST_M6_VI.md` section A ("Responsive / thiết bị di động") — real-device
  verification steps for Phong to run on an actual iPhone (Safari) and Android phone (Chrome),
  matching the `CHECKLIST_M2..M5_VI.md` convention. This section is **written** in this phase but
  **executed** in Phase 7.

## Implementation Steps

1. Grep `apps/web/ui/Styles.html` for `vh` (and `100%` used for full-bleed height contexts) — list
   every hit before changing anything.
2. Apply the `100dvh` + `window.innerHeight` resize-fallback pattern to each full-height container
   found. Keep the fallback minimal (a small inline `<script>` or existing shared JS module — check
   `App.html`/`ui` JS structure for where small cross-view helpers already live before adding a new
   file).
3. Extend the viewport meta string in `apps/web/Main.gs:doGet`.
4. Add `env(safe-area-inset-*)` padding to any fixed-position bar/modal.
5. Walk every interactive control in `Styles.html` (buttons, checkboxes, the status-pill quick-edit
   control from Milestone 3, chevrons) and verify computed tap-target size ≥44×44px including
   padding — not just the visible glyph. Fix any shortfall with padding, not by growing the visible
   icon (preserve existing visual design).
6. Replace any `-webkit-overflow-scrolling: touch` with `overscroll-behavior: contain` on scrolling
   containers (modals, the export dialog).
7. Draft `docs/CHECKLIST_M6_VI.md` section A: concrete steps ("mở màn hình đơn hàng trên iPhone,
   xoay ngang/dọc, kiểm tra bàn phím không che ô nhập...", etc.) covering iOS Safari + Android
   Chrome, portrait + landscape, at minimum: order list, order form (keyboard focus), admin
   permission matrix (already phone-card-verified in M5, spot-recheck only), stats charts.
8. No new offline test needed here (CSS/layout isn't unit-testable in this stack) — verification is
   the Phase 7 live checklist walkthrough, by design (2026-09-13 scope decision).

## Success Criteria

- [ ] No `100vh` usage remains for any container that must fill the iframe's visible height;
      `100dvh` + fallback in place
- [ ] Viewport meta includes `interactive-widget=resizes-content`
- [ ] Every interactive control's tap target verified ≥44×44px (padding-inclusive)
- [ ] `docs/CHECKLIST_M6_VI.md` section A drafted, ready for Phase 7's live walkthrough
- [ ] No visual regression at existing breakpoints (spot-check 480/640/960px against pre-change
      screenshots or side-by-side diff)

## Risk Assessment

- **Can't verify iframe-specific behavior without a live Apps Script deployment** — the `100dvh`/
  `visualViewport`-blocked findings are research-sourced, not locally reproducible in a plain
  browser preview of the HTML files alone. Flag any assumption that turns out wrong during Phase
  7's real-device pass and patch then rather than over-engineering speculative fixes now.
- **Tap-target padding changes could shift visual rhythm** slightly (e.g. a chevron button growing
  its hit-area) — keep changes to padding/hit-area only, not visible icon size, to minimize visual
  drift risk per this repo's UI guidelines (`.claude/rules/ui-implementation-guidelines.md` on CSS
  class reuse/isolation) — these are style-only edits to existing classes, not new components, so
  the mockup-first rule doesn't apply, but a visual diff check before/after is still warranted.
