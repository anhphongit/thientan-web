---
phase: 3
title: "ApiClient retry policy redesign"
status: pending
priority: P1
effort: "1.5h"
dependencies: [2]
---

# Phase 3: ApiClient retry policy redesign

## ⚠️ Redesigned 2026-09-18 — this supersedes the phase's original plan entirely

The original plan (increase `apiCall_` from 2 to 3 attempts, add backoff
+jitter, retry an `MSG.SERVER_BUSY` app-level response) is now wrong on
two counts, not just blocked pending a prerequisite:

1. **`MSG.SERVER_BUSY` no longer exists.** It belonged to Phase 2's
   original admission-control-queue design, which was cut — two live
   tests proved `apps/api` never approaches its concurrency ceiling, so
   there is no "server busy" signal to retry on. Phase 2 is now a
   write-action idempotency guard instead.
2. **Increasing the automatic retry count is the wrong direction.** Live
   evidence (`reports/analysis-260918-1134-...md`) proved a 400-500ms
   retry does nothing against the actual failure mode (30-190+ second
   response-delivery stalls) — it just adds another full request to an
   already-struggling shared identity, and (before Phase 2 shipped) caused
   duplicate server-side execution every single time it fired. More
   automatic attempts means more duplicate-execution exposure surface and
   a longer frozen UI, the opposite of this plan's now-explicit priorities
   (never duplicate → fail fast → reduce frequency).

**Do not implement anything below without Phase 2 (idempotency guard)
already shipped and its `payload.__attemptId` plumbing in place** — this
phase's retries must reuse that ID for write actions, not generate their
own.

## Overview

Redesign `apiCall_`'s retry decision around what the live data actually
showed: a fast-failing attempt (a genuine quick blip) is worth one quick
retry; a slow-failing attempt (already evidence of an active edge stall)
is not worth auto-retrying at all — auto-retrying it only adds load and
delays the user from seeing ANY feedback. Let Phase 4's fail-fast UI and
manual retry button (now safe for writes thanks to Phase 2) handle the
slow case at human pace instead of machine pace.

## Key Insights

- **Retry decision must be based on how long the failed attempt actually
  took, not just its error type.** This is new — today's code (and the
  original plan for this phase) only looks at HTTP status. Add an elapsed-
  time check: if attempt 1 failed within a short threshold (e.g. ≤3s —
  tunable, start conservative), it's plausibly a genuine quick blip, retry
  once with a short backoff+jitter. If attempt 1 took longer than that
  threshold before failing, treat it as an active edge stall and do NOT
  auto-retry — surface the failure immediately.
- **Total automatic attempts stay at 2, not 3.** The fix here is making
  the SECOND attempt conditional and smarter, not adding a third blind
  one.
- Current retry-eligible set (`5xx`, bare `3xx`, `404`, fetch-throw) is
  still the right classification — unchanged. Only WHETHER to use the
  second attempt changes, based on elapsed time of the first.
- **Write actions must forward `payload.__attemptId`** (Phase 2) into the
  retry attempt unchanged — this phase must not generate a new ID or
  strip the existing one. Read actions are unaffected (no attempt ID
  involved).
- Add jitter to the one remaining conditional retry's backoff (still
  valid from the original plan) — several clients all retrying at exactly
  the same fixed delay resynchronizes load instead of spreading it.
- `devNote_`'s own fetch stays single-shot, best-effort, unchanged —
  doubling its retries would double the load it adds while reporting on
  the very congestion it's trying to observe. (Unchanged from original
  plan.)
- Keep the existing non-retry rule for other 4xx untouched — no evidence
  they behave the same way; retrying them could multiply load on a
  genuine client error. (Unchanged from original plan.)
- **Coordinate the elapsed-time threshold with Phase 4's client-side
  timeout.** Phase 4 bounds how long the UI waits before showing a
  failure state regardless of what's happening server-side. This phase's
  retry decision must complete (including any retry) well within that
  budget — do not let a "smart" retry here push total wait time past what
  Phase 4 promises the user. Pick concrete numbers together, not in
  isolation (see Implementation Steps).

## Implementation Steps

1. Read `apps/web/ApiClient.gs` in full (Read-before-Write), and Phase 2's
   final `payload.__attemptId` plumbing (must exist first).
2. Read Phase 4's chosen client-side timeout value before picking numbers
   here (circular dependency by design — implement Phase 4's timeout
   constant first if sequencing allows, or agree on both numbers in the
   same sitting).
3. `apps/web/ApiClient.gs` `apiCall_`: keep `MAX_ATTEMPTS = 2` (no
   increase). After attempt 1 fails (transport-level: fetch-throw, 5xx,
   bare 3xx, 404), check elapsed time for that attempt:
   - If ≤ threshold (start at 3s): retry once, with backoff+jitter (e.g.
     500ms ± 200ms — short, since this branch is specifically for
     "genuine quick blip," not congestion).
   - If > threshold: do not retry — throw immediately with the existing
     `MSG.API_UNREACHABLE`-style error, same as today's final-attempt
     path, just reached one attempt sooner.
4. Remove any reference to `MSG.SERVER_BUSY` retry handling — it does not
   exist; do not add speculative handling for a signal Phase 2 doesn't
   produce.
5. Confirm `payload.__attemptId` (when present, i.e. write actions) is
   read once before the retry loop and reused unchanged on the one
   possible retry — do not regenerate it here under any circumstance.
6. Measure and document the actual worst-case added latency for a call
   that fails fast (attempt 1 ≤ threshold, retries, still fails): should
   be threshold + backoff + attempt 2's own duration — state the real
   number, not an estimate, in this phase's completion notes.

## Related Code Files

- Modify: `apps/web/ApiClient.gs`
- Modify: `tools/offline-tests/apiclient-scope.test.js` — existing
  GAS-sandbox pattern mocking `UrlFetchApp`/`Utilities.sleep`/`Date.now`;
  rewrite the retry-count assertions (2, conditionally, not 3
  unconditionally) and add the new elapsed-time-based branch as explicit
  scenarios: fast-fail-then-retry, slow-fail-then-no-retry.

## Success Criteria

- [ ] `apiCall_` retries at most once (2 total attempts), and ONLY when
      attempt 1 failed within the elapsed-time threshold — offline test
      covers both branches explicitly (fast fail → retries; slow fail →
      does not retry, fails immediately).
- [ ] The one retry uses backoff + jitter, not a fixed delay — offline
      test asserts non-determinism within a bounded range (mocked RNG or
      a tolerance check).
- [ ] No `MSG.SERVER_BUSY` handling exists anywhere in this file — offline
      test/grep confirms it, since that signal no longer exists.
- [ ] `payload.__attemptId`, when present, is identical across attempt 1
      and the conditional attempt 2 — offline test asserts the exact same
      ID is used both times, never regenerated.
- [ ] `devNote_`'s own request behavior is unchanged (still single-shot,
      best-effort) — regression assertion so a future edit doesn't widen
      it.
- [ ] Full offline suite green.
- [ ] Worst-case added latency for a fully-failing (fast-then-retry-then-
      fail) call is measured and documented, and confirmed to fit inside
      Phase 4's client-side timeout budget — not just assumed compatible.

## Risk Assessment

Low-medium risk — single file, same already-isolated retry helper Phase 0
and the original Phase 3 plan already touched safely. The new risk
specific to this redesign: picking the elapsed-time threshold wrong in
either direction — too low, and genuine quick blips stop getting their
one helpful retry; too high, and slow-failing calls still eat a pointless
second wait before the user sees anything, undermining Phase 4's fail-fast
promise. Mitigate by keeping the threshold a named, easily-tunable
constant (not scattered magic numbers) and stating it explicitly wherever
Phase 4's timeout budget is documented, so the two numbers are reviewed
together, not independently.
