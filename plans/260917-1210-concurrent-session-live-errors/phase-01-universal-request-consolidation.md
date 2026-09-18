---
phase: 1
title: "Universal request consolidation"
status: pending
priority: P1
effort: "2.5h"
dependencies: []
---

# Phase 1: Universal request consolidation

**Status note (2026-09-18):** unchanged by the 2026-09-18 re-plan — this
phase's design (cut concurrent demand at the one shared client choke
point) is correct regardless of which theory of Google's exact failure
mechanism is right, and reducing concurrent load is priority 3 of 3 in the
final plan (never duplicate → fail fast → reduce frequency; see `plan.md`'s
"Final root cause & solution strategy"). Proceed as written below.

## Overview

Reduce how many concurrent `apiCall_` executions the whole team can ever
throw at `apps/api`'s shared 30-execution-slot owner identity (see
`plan.md` Root Cause) — fixed at the ONE shared layer every view already
goes through (`App.html`'s `call()` helper), not patched into individual
views one at a time. This supersedes this plan's first draft, which only
touched `ViewsAdmin.html`/`ViewsOrders.html` — per the user's review, the
exposure is systemic (every view uses the same `T.call()` pattern), so the
fix must be too.

## Key Insights

- `App.html`'s `call()` (line 50-66) is the ONE function every
  `T.call('apiXxx', ...)` in every view file goes through — it is already
  the natural choke point for a GLOBAL fix, requiring zero changes to
  individual views for the concurrency-cap half of this phase.
- Two independent levers, both applied here:
  1. **Fewer round trips per view** (reduces total demand). Confirmed
     fan-out today: `ViewsAdmin.html:render()` (line 215) fires 3 calls
     (`listUsers`, `listPermissionPresets`, `listVisibleFieldGroups`);
     `ViewsOrders.html`'s render path (line ~674/~700) fires 2
     (`apiListOrderCreators`, `apiListOrders`). Both already have lazy,
     once-per-session guards (`state.presets !== null`, etc.) — the waste
     is the SIMULTANEOUS first fetch, not redundant refetching.
  2. **A true client-side FIFO queue for one browser tab's own requests**
     (bounds peak demand regardless of which view or how many calls it
     happens to make, including any view added after this plan). This is
     the part that makes the fix apply everywhere automatically, satisfying
     the user's point that this must not be a 2-view patch. Per direct user
     decision (2026-09-17): default the queue to **strict one-at-a-time**
     (max-in-flight = 1), not a "2 at once" cap — a real one-by-one queue,
     not just a looser ceiling. This is the correct, honest client-side
     equivalent of a "request queue": Apps Script has no persistent
     server-side process that could hold such a queue (see `plan.md`'s
     "Considered and Rejected" section for why a server-side version of
     this was ruled out), so the browser tab — which DOES persist for the
     duration of a session — is the only place a literal FIFO queue can
     actually live. Ship with the cap as a named constant so it can be
     raised to 2 later if strict serialization proves too slow in practice;
     start at 1 since correctness/reliability was explicitly prioritized
     over raw speed for this decision.
- None of the fan-out calls depend on each other's results (verified:
  `paintForm()` only reads `state.presets`/`state.fieldGroups` if already
  populated, does not block on them) — sequencing/capping only adds
  latency, never breaks a data dependency.
- Do not block the PRIMARY list the user is looking at
  (`listUsers`/`listOrders`) behind secondary lookups — the global cap
  should let the primary call through first via ordering, not make
  everything wait in strict arrival order regardless of importance.

## Implementation Steps

1. **Add a small global concurrency-limiting queue inside `App.html`'s
   `call()` (line 50), wrapping the existing `google.script.run` dispatch:**
   - Maintain a module-level in-flight counter and a FIFO array of pending
     `{fnName, args, resolve, reject}` entries — genuinely first-in,
     first-out: a call only starts once every call queued before it has
     started (not necessarily finished, given the cap below).
   - Cap simultaneous in-flight `google.script.run` calls from this ONE
     browser tab to a named constant, default **1** (strict one-at-a-time —
     literally the "queue processed one-by-one" behavior asked for). Even
     an employee with 3 tabs open then contributes at most ~3 concurrent
     slots from their own usage, not an unbounded burst from one page load.
   - When a call resolves/rejects, decrement the counter and dequeue the
     next pending entry (if any) to start it.
   - This changes ZERO calling code in any view — every existing
     `T.call('apiXxx', ...)` call site is automatically capped, including
     `ViewsStats.html`, `ViewsInventory.html`, and any view added later.
2. **`ViewsAdmin.html` `render()` (line 215-246):** still worth trimming
   demand at the source, not just relying on the global cap — keep
   `showList()`'s `fetchUsers()` as the first call queued (so it's first in
   FIFO order and gets a slot immediately), let `ensurePresetsLoaded()`/
   `ensureFieldGroupsLoaded()` queue behind it via the SAME global queue
   (no per-view stagger timers needed anymore — the queue in step 1 already
   serializes all three, one at a time, in the order they were queued).
3. **`ViewsOrders.html`:** same — no per-view timer, rely on the global
   queue from step 1; just confirm call ORDER puts `apiListOrders` first.
4. **Do not touch `App.html`'s `apiGetSession` bootstrap's relationship to
   the queue** other than confirming it also goes through `call()` (so it's
   correctly counted against the same cap) — its existing gating of first
   render is unchanged.

## Related Code Files

- Modify: `apps/web/ui/App.html` (the `call()` helper — this is the actual
  fix; everything else in this phase is ordering only)
- Modify: `apps/web/ui/ViewsAdmin.html` (call-order only, no new timers)
- Modify: `apps/web/ui/ViewsOrders.html` (call-order only, no new timers)
- Modify (tests): whichever existing offline test(s) cover `App.html`'s
  `call()`/client bridge; add a new test file if none exists — this is now
  the single most load-bearing piece of client code for this whole
  incident class, it needs direct coverage, not just indirect coverage via
  view tests.

## Success Criteria

- [ ] No more than 1 `google.script.run` call (the default cap) is ever in
      flight simultaneously from one browser tab, regardless of how many
      views or how many `T.call()` sites fire at once — proven with an
      offline test that fires 10 simultaneous `T.call()`s through a mocked
      `google.script.run` and asserts the mock is never invoked a second
      time before the first resolves, AND that all 10 eventually run, in
      the order they were queued.
- [ ] Opening Admin/Orders tabs still populates all lists/dropdowns
      correctly, just queued instead of simultaneous; no functional
      regression.
- [ ] The PRIMARY list call (`listUsers`/`listOrders`) is not starved by
      secondary lookups queued after it.
- [ ] Existing offline test suite still green.
- [ ] Manual/live check, best-effort: two people opening tabs within the
      same minute no longer reproduces the error burst (cannot be
      guaranteed — Google's edge and the 30-slot ceiling are outside this
      app's control, per `plan.md`'s honesty section).

## Risk Assessment

Low-medium risk. The queue is new shared infrastructure every view now
depends on — a bug here (e.g. a stuck in-flight counter that never
decrements) would freeze ALL API calls app-wide, worse than today's
per-view failures. Mitigate: wrap the queue's resolve/reject/decrement in a
`finally`-equivalent (both success and failure paths must decrement),
cover this specific "does it recover from a rejected call" case directly in
the offline test, and keep the queue's own logic small enough to read in
one sitting (KISS — this is not the place for a generic scheduling library).

**Known, accepted tradeoff of cap=1:** strictly serializing means a view
with 3 fan-out calls now takes roughly the SUM of their individual
latencies to fully populate, instead of the max — e.g. Admin tab's 3 calls
at ~1-2s each becomes ~3-6s total instead of ~1-2s. This is a deliberate,
user-directed choice: reliability over raw load speed for now. If this
proves noticeably slow in live use, raising the cap constant to 2 is a
one-line change (still far below the fan-out width of any single view
today), not a redesign.
