---
phase: 5
title: "Vietnamese sweep + regression guard script"
status: complete
priority: P2
effort: "2h"
dependencies: [1]
---

# Phase 5: Vietnamese sweep + regression guard script

## Overview

Base scope: "Vietnamese completeness sweep — zero English strings left" (`docs/MILESTONES.md` M6).
Stretch (user-selected): a regression-guard offline script so future changes don't quietly
reintroduce English strings after this sweep closes the milestone.

**A full audit (codebase inventory, 2026-09-13) already found ~0 real violations** — this repo is
already Vietnamese-disciplined. This phase is mostly confirmation + the guard script, not a
rewrite. Do not manufacture work to justify the phase; if the audit confirms clean, say so and move
on.

## Key Insights

- Inventory's borderline findings (not clear violations):
  - `apps/web/ui/ViewsAdmin.html:678-679` — form label `'Email'` / `'Email *'`
  - `apps/web/ui/App.html:204` — diagnostics `<dt>Email</dt>`
  - `apps/web/ui/App.html:392-401` — browser proper nouns (`'Chrome'`, `'Firefox'`, `'Edge'`,
    `'Opera'`, `'Safari'`) inside `browserInfo()`'s account-switch helper sentences
  - `apps/web/ui/ViewsOrders.html:1255` — `'PDF'`/`'Excel'` format/brand names
  - **Corrected (red-team Finding 14): `docs/GLOSSARY_VI.md` has zero entries for any of these 4
    strings** (`grep -n "Email" docs/GLOSSARY_VI.md` → no hits; same for the others) — the original
    plan's "resolve against the glossary" instruction has no source of truth to actually consult.
    These are **genuinely ungoverned** by any existing doc, not a lookup this phase can perform.
    Make an explicit, one-time decision for each (loanword/proper-noun kept as-is vs. translated)
    and **add them to `docs/GLOSSARY_VI.md` as newly-decided entries with a one-line rationale**,
    rather than pretending to defer to a document that says nothing about them. Likely outcome:
    all 4 are fine as-is (Email/PDF/Excel are common loanwords in Vietnamese business software;
    browser names are proper nouns) — but the decision must be recorded, not assumed.
- Regression-guard script approach (`plans/reports/researcher-260913-2326-mobile-responsive-error-
  handling.md`): a plain-`node` heuristic script matching the existing `tools/offline-tests/*.test.js`
  convention (no framework, no dependency added) — regex-based detection of likely-English quoted
  strings in user-visible contexts (button labels, `T.confirm()` calls, alert/toast text, headings,
  placeholders), with explicit exclusions for CSS class names, `data-*` attribute values, code
  comments, `console.log`/debug strings, and known-fine loanwords/proper nouns (build an allowlist
  seeded from this phase's own findings above, e.g. `Email`, `PDF`, `Excel`, browser names).
  Research estimates ~80-90% detection rate for a regex heuristic — good enough as a *regression
  guard* (catches new violations going forward) even though it's not a perfect one-shot auditor;
  this phase's manual audit already did the precise one-shot pass.
- Keep the allowlist file small and explicit (a JS array/JSON in the test file or a sibling
  `.json`) so it's obvious what's been deliberately exempted and why, rather than a loose regex
  that silently swallows real violations.

## Requirements

- Functional:
  - Confirm/resolve the 4 borderline findings against `docs/GLOSSARY_VI.md`; fix any that the
    glossary says should be Vietnamese, leave the rest with a one-line rationale.
  - `tools/offline-tests/lint-english-strings.test.js` (or similar name matching repo convention):
    scans `apps/web/ui/*.html` (and `apps/web/*.gs`/`apps/api/*.gs` string literals returned to the
    client, if feasible) for new likely-English UI strings, fails loudly with file:line when it
    finds an unallowlisted one, passes clean today after the 4 borderline items are resolved.
- Non-functional: the lint script must have zero false positives against the **current** codebase
  once the allowlist is seeded — a script that cries wolf on day one won't get used. Run it and
  tune the allowlist/regex until today's codebase passes clean before considering this phase done.

## Related Code Files

- Modify: `apps/web/ui/ViewsAdmin.html`, `apps/web/ui/App.html`, `apps/web/ui/ViewsOrders.html`
  (only if `docs/GLOSSARY_VI.md` review says a change is needed — may end up as zero-diff)
- Create: `tools/offline-tests/lint-english-strings.test.js`, a small allowlist data file if the
  lint script warrants separating data from logic (only if it meaningfully improves readability —
  don't split a 10-line array into its own file, YAGNI)

## Implementation Steps

1. Decide each of the 4 borderline findings on its own merits (no glossary to check against —
   see Key Insights) and **add each as a new entry to `docs/GLOSSARY_VI.md`** with a one-line
   rationale (e.g. "Email — loanword, kept as-is, standard in Vietnamese business software"),
   rather than a code comment — the glossary is the durable record other phases/future work should
   consult, a code comment would only be visible to whoever opens that one file.
2. Apply any resulting fixes (likely zero, possibly one, based on step 1's decisions).
3. Write `tools/offline-tests/lint-english-strings.test.js`: regex heuristic for quoted English-
   looking strings in user-visible contexts, explicit exclusions (CSS classes, `data-*` attrs,
   comments, debug/console strings), small seeded allowlist for the 4 confirmed-fine loanwords/
   proper nouns from step 1.
4. Run it against the current codebase; tune regex/allowlist until it passes clean with zero false
   positives on the real, current files.
5. Add it to `tools/offline-tests/run-all.js` (created in Phase 1 — red-team Finding 8 confirmed no
   `package.json`/CI/runner existed before that; do not assume one exists independently of Phase 1).
6. Run `node tools/offline-tests/run-all.js` — confirm the new lint file is included and passes.

## Success Criteria

- [ ] All 4 borderline findings explicitly resolved against `docs/GLOSSARY_VI.md`, with rationale
      where a loanword/proper-noun is deliberately kept
- [ ] `tools/offline-tests/lint-english-strings.test.js` passes clean against the current codebase
- [ ] The lint script is wired into the same run path as the rest of the offline suite, not a
      standalone script nobody remembers to run
- [ ] Re-running the lint script against a deliberately-introduced English string (manual smoke
      test, revert after) correctly fails with a file:line pointer

## Risk Assessment

- **False positives could make the lint script noise, not signal** — mitigate by tuning against
  the real current codebase (step 4) before calling this phase done, and keeping the allowlist
  explicit/small rather than a loose catch-all regex that hides real future violations.
- **~80-90% detection rate (research estimate)** — this is a regression guard, not a guarantee;
  don't oversell it in `docs/codebase-summary.md`'s eventual write-up (Phase 7) as "impossible to
  reintroduce English strings," it's a net that catches most, not all, cases.
