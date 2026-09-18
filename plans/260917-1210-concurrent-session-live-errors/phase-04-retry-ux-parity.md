---
phase: 4
title: "Fail-fast UX + retry parity"
status: pending
priority: P1
effort: "2h"
dependencies: [2, 3]
---

# Phase 4: Fail-fast UX + retry parity

## ⚠️ Expanded scope 2026-09-18 — this is now where "fail fast" actually lives

Original scope (the retry button, preserved below) only addressed what
happens AFTER a call has already failed. It said nothing about HOW LONG
the user waits before that — and live evidence shows that can be 30-190+
seconds, because the failure is Google's edge failing to deliver an
already-successful response, not a fast rejection (`plan.md`'s "Final root
cause & solution strategy"). Neither `UrlFetchApp` (apps/api side) nor
`google.script.run` (browser↔apps/web side) support cancelling an
in-flight call — so a slow call cannot be stopped, only stopped from
being WAITED ON. This phase now owns that: a client-side (browser)
timeout that gives up showing a spinner and shows a clear failure state
after a bounded time, regardless of whether the underlying call eventually
completes on its own.

**Priority raised to P1** (was P2) — per the user's explicit 2026-09-18
priority order (never duplicate → fail fast → reduce frequency), this is
the literal mechanism for the middle priority, not a nice-to-have.

**Depends on Phase 2 and 3** (new): the retry button is only safe to
promote to a prominent, easy, "just click it" experience once Phase 2's
idempotency guard makes a write-action retry harmless; Phase 3 determines
what "already retried automatically" means before this phase's manual
retry is offered as the next step.

## Overview

Two things ship together, because neither is complete without the other:

1. **Client-side call timeout** (new): wrap `google.script.run` calls from
   the browser in a timer. If neither the success nor failure handler has
   fired within a bounded window (start at ~8-10s — tunable, coordinate
   with Phase 3's retry-elapsed-time threshold so the numbers make sense
   together: a call that's going to auto-retry once needs enough budget to
   do so before this timeout fires prematurely), stop showing a loading
   state and show the same failure UI as a real error — **worded
   honestly**: this does not mean the action definitely failed (the
   server-side call may still be running or may have already succeeded;
   Apps Script gives no way to cancel or definitively check from the
   browser side within this timeframe), it means the app stopped waiting.
   For a write action, retrying from this state is now safe (Phase 2). For
   a read action, retrying just re-fetches, always safe.
2. **Retry button** (original scope, unchanged below): `ViewsStats.html`
   already has one; extend the same pattern to `ViewsAdmin.html` and
   `ViewsOrders.html`'s primary list loads, and ensure any WRITE-action
   retry button reuses the same `payload.__attemptId` as the attempt it's
   retrying (Phase 2's requirement) rather than starting a fresh one.

## Original scope (retry button) — unchanged, still correct

`ViewsStats.html` (line ~292) already shows a `Thử lại` (retry) button when
its `apiCall_` fails. `ViewsAdmin.html`'s `showList()` catch (line 314-318)
and the equivalent error path in `ViewsOrders.html` only render a bare error
message with no way to recover except switching tabs or reloading the whole
app. Once Phases 1–3 reduce *frequency*, this phase makes the failures that
still happen (Google's edge reliability gap is outside this project's
control — see `plan.md`'s "Final root cause & solution strategy" honest-
limits section) cheap for a real user to recover from during a live
session, instead of looking broken.

## Implementation Steps — Part A: client-side fail-fast timeout (new)

1. Read `apps/web/ui/App.html`'s `call()`/`T.call()` in full — this is the
   ONE place every `google.script.run` invocation already passes through
   (same choke point Phase 1 uses), so the timeout wraps in exactly once,
   not per-view.
2. Wrap the existing `google.script.run.withSuccessHandler(...)
   .withFailureHandler(...)` dispatch with a `setTimeout` (named constant,
   coordinate the exact value with Phase 3's retry-elapsed-time threshold
   so a call that's mid-auto-retry doesn't get prematurely timed out from
   the UI's perspective — the client-side timeout budget must be longer
   than Phase 3's worst-case fast-fail-then-retry duration). If the timer
   fires before either handler runs, resolve the caller's promise/callback
   with a distinct "timed out, unknown outcome" state (NOT the same as a
   definite failure — see wording note above) and stop showing the loading
   UI. If a real handler DOES fire later (the underlying call was just
   slow, not actually lost), decide and document what happens: the
   simplest correct behavior is to ignore the late response for THIS
   already-abandoned UI state (don't silently un-fail a screen the user
   has already moved on from) but still let it update any shared client
   state that's safe to update quietly (e.g., Phase 1's queue accounting).
3. Surface the "timed out" state through the SAME error-display path Part
   B builds (one error UI, two possible causes: a real failure, or a
   timeout) — do not build a second, visually-different error state.
4. This is infrastructure inside `App.html`, not per-view — every
   `T.call()` site gets it automatically, same reasoning as Phase 1's
   queue.

## Implementation Steps — Part B: retry button (original scope)

5. Extract the Stats view's existing retry-button markup/wiring
   (`data-act="stats-retry"` pattern) into a shape both views can reuse —
   check whether a shared helper already exists in `App.html` before adding
   a new one (per `development-rules.md`'s "check existing modules before
   creating new").
6. **`ViewsAdmin.html` `showList()` catch (line 314-318):** replace the bare
   `<p class="empty err-text">` with the same message + a retry button that
   re-invokes `fetchUsers()` (clearing `loadingPromise` first so it actually
   re-fetches, not just re-returns the failed promise).
7. **`ViewsOrders.html`'s equivalent list-load error path:** same treatment
   for its primary `apiListOrders` failure.
8. Leave `ensurePresetsLoaded`/`ensureFieldGroupsLoaded`'s existing
   toast-and-fallback-to-`[]` behavior alone — those are secondary,
   non-blocking lookups (per Phase 1's Key Insights), a toast is
   proportionate; only the PRIMARY list load (the one that leaves the user
   with an empty broken-looking tab) needs a retry button.
9. **For any WRITE-action retry button** (not just the read-only list
   retries above): confirm it resubmits with the SAME `payload.__attemptId`
   as the attempt being retried (Phase 2's requirement) — this is the
   detail that makes the retry safe from duplication, not just convenient.

## Related Code Files

- Modify: `apps/web/ui/App.html` (the client-side timeout — this is the
  actual new mechanism; everything else is UI wiring)
- Modify: `apps/web/ui/ViewsAdmin.html`
- Modify: `apps/web/ui/ViewsOrders.html`
- Modify: any write-action view with its own retry affordance (scope
  during implementation — confirm which write flows currently have no
  recovery path at all, per this plan's priority on write-safety)
- Read (reference pattern, do not need to modify unless extracting a shared
  helper): `apps/web/ui/ViewsStats.html`
- Modify (tests): offline test coverage for `App.html`'s timeout wrapper
  (mocked `google.script.run`, fake timers) — new, this is now load-bearing
  shared infrastructure, same standard Phase 1's queue was held to.

## Success Criteria

- [ ] A `google.script.run` call that never resolves within the timeout
      window stops showing a loading state and shows the failure UI within
      that bounded time — offline test with fake timers and a
      never-resolving mock, asserting the UI reaches failure state at
      (and not significantly before/after) the configured timeout.
- [ ] A call that resolves normally, faster than the timeout, is
      completely unaffected — no behavior change for the common case.
- [ ] A call that resolves LATE (after the timeout already fired) does not
      silently "un-fail" an already-abandoned UI state — offline test
      covers this race explicitly, per the documented decision in Step 2.
- [ ] The timeout value and Phase 3's retry-elapsed-time threshold are
      documented together in one place, with the timeout value confirmed
      larger than Phase 3's worst-case duration — not picked independently.
- [ ] A forced failure (mock/stub the API call in a dev/test build) on the
      Admin users list shows a retry button that successfully reloads the
      list on click.
- [ ] Same for the Orders list.
- [ ] A write-action retry button is confirmed (offline test) to reuse the
      exact same `payload.__attemptId` as the attempt it's retrying.
- [ ] Visual style matches the existing Stats retry button (no new ad-hoc
      CSS class — reuse what exists, per `ui-implementation-guidelines.md`
      Rule 3/6 on class reuse only after verification).
- [ ] Offline tests updated/added for the retry-click handler in both views.

## Risk Assessment

Medium risk (raised from the original "low") — Part A is new shared
infrastructure every `T.call()` now depends on (same risk class as Phase
1's queue: a bug here affects the whole app, not one view). The main new
risk is the "late response after timeout" race in Part A Step 2 — get this
wrong and either a user sees a confusing state flip after already being
told it failed, or a background update silently corrupts what they're
currently looking at. Mitigate with the explicit offline test for that
race as a hard gate, same standard as Phase 1's "does it recover from a
rejected call" test. Part B (retry button UI) remains low risk in
isolation, unchanged from the original assessment. Skip mockup-first UI
process (`development-rules.md` "UI Design Process") for Part B — small
style-refinement matching an existing approved pattern; Part A is
non-visual infrastructure, also exempt.
