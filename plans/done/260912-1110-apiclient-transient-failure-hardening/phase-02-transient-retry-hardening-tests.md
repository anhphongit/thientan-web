---
phase: 2
title: "Transient-retry hardening + tests"
status: done
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Transient-retry hardening + tests

## Overview
Extend `apiCall_`'s retry classification so a bare 3xx response (redirect not
resolved by `followRedirects:true`) is retried the same bounded way a 5xx is
today, instead of being thrown at the user on first occurrence. Cover the
change with an offline test using the existing GAS-sandbox harness pattern,
**including a simulated clock** so the test can assert on both the fast-blip
case (fix helps) and the slow-execution case (fix does not worsen it, and
Phase 1's timing data is present either way) — this is what makes "the test
proves the fixed flow correctly" a checkable fact, not a claim.

## Key Insights
- `ApiClient.gs:81` today: `if (attempt < 2 && code >= 500 && code <= 599)`.
  A 3xx falls through to the hard-fail branch below it, unconditionally.
- The file already documents (`ApiClient.gs:124-135`) that a redirect
  *followed as GET* is retried once via the `text === 'THIENTAN API'` check
  in `postJsonToApi_`. A redirect **not followed at all** (raw 3xx code) is
  the same class of transient Apps-Script-edge behavior, just not handled —
  this phase closes that gap, it does not invent a new retry mechanism.
- `apps/api/appsscript.json` access is `ANYONE_ANONYMOUS` — ruled out as an
  auth/account-chooser redirect.
- **Revised, more honest framing (post re-analysis):** the live symptom
  included a long pending duration before the 302, and lock contention on the
  failing read path is ruled out (see plan.md / Phase 1). That means the
  slowness most likely happens *inside* the attempt itself (cold start /
  Apps Script execution variability that is opaque from this code). **Retry
  cannot shorten an attempt that is inherently slow** — it only pays off when
  attempt 1's 3xx resolves quickly and attempt 2 is fast. This phase's retry
  change is still correct to make (it strictly helps the fast case and never
  makes the slow case worse than today's already-accepted 5xx-retry
  behavior), but it must not be sold as "fixes the slowness" — see plan.md's
  "Expected Behavior After Fix" table for the exact, testable claim.
- Dev-rule constraint already in the file's own comment (`ApiClient.gs:38-39`):
  "Never retry 4xx / 405 / parse errors — those would multiply load under
  congestion without fixing the cause." Keep 3xx out of that comment's scope;
  it's explicitly a different failure class (redirect, not rejection).

## Requirements
- Functional: `code >= 300 && code <= 399` is retried under the same bounded
  attempt budget as 5xx (share the existing `attempt < 2` cap — do not add a
  third attempt; two is the existing budget and this phase's job is
  classification, not raising retry counts).
- Functional: 4xx continues to hard-fail immediately, unchanged.
- Functional: the final thrown error (if retries exhaust) still uses
  `MSG.API_UNREACHABLE` with the `devSuffix_` code/body detail — unchanged
  user-facing message, just fewer users ever see it.
- Non-functional: no change to the `text === 'THIENTAN API'` GET-redirect
  handling in `postJsonToApi_` — that's a separate, already-working path.

## Related Code Files
- Modify: `apps/web/ApiClient.gs`
- Modify: `tools/offline-tests/apiclient-scope.test.js`

## Implementation Steps
1. In `apiCall_` (`ApiClient.gs:81`), change:
   ```javascript
   if (attempt < 2 && code >= 500 && code <= 599) {
   ```
   to:
   ```javascript
   if (attempt < 2 && ((code >= 500 && code <= 599) || (code >= 300 && code <= 399))) {
   ```
   Keep the existing `Utilities.sleep(400); continue;` body unchanged.
2. Add a short code comment (one line, matching the file's existing comment
   density) explaining *why* 3xx is retryable here — reference this plan's
   diagnosis so a future reader doesn't re-litigate it: Apps Script
   `followRedirects:true` occasionally does not resolve a redirect, seen as a
   transient infra blip, not a permanent rejection; `access: ANYONE_ANONYMOUS`
   in `apps/api/appsscript.json` rules out an auth-redirect explanation.
3. In `tools/offline-tests/apiclient-scope.test.js`, add a new section
   (following the existing `(function () { ... })()` block pattern) that
   mocks a **fake, controllable clock** in the sandbox (`sandbox.Date = { now:
   () => fakeClock }`, with `fakeClock` a test-local variable the mock
   `UrlFetchApp.fetch` advances before returning, e.g. `fakeClock += 12000`
   to simulate a slow attempt) so timing behavior is deterministic, not
   wall-clock-dependent. Cases:
   - **Scenario A (fast blip, maps to plan.md's row A):** `fetchBehavior`
     returns 302 fast (clock +50ms) on call 1, 200 fast (clock +50ms) on call
     2. Assert: `apiCall_` returns normally (no throw), `fetchCalls === 2`,
     `sleepCalls === 1`.
   - **Scenario B (slow execution both attempts, maps to plan.md's row B):**
     `fetchBehavior` returns 302 slow (clock +12000ms) on both calls. Assert:
     throws `MSG.API_UNREACHABLE` (same message as before this phase — no
     regression), AND capture the `console.error` calls (stub `console.error`
     to push into an array for this test) to assert **both** attempts' log
     lines contain a `Location` header value and a numeric elapsed-ms ≥ 12000
     — this is the assertion that proves Phase 1's diagnostic data survives
     into the failure path even when retrying doesn't help.
   - **Regression guard (maps to plan.md's row C):** a 404 (4xx) is still NOT
     retried (`fetchCalls === 1`), unchanged from before this phase.
4. Run the full offline suite; all existing + new assertions must pass.

## Success Criteria
- [x] Scenario A assertions pass: 302(fast)-then-200(fast) succeeds via one
      retry, no user-visible error.
- [x] Scenario B assertions pass: 302(slow)-then-302(slow) still throws
      `API_UNREACHABLE` (no worse than before), AND both logged attempts
      carry the `Location` header and an elapsed-ms value proportional to the
      simulated slow clock.
- [x] Regression guard passes: 404 → `fetchCalls === 1`, unchanged.
- [x] Full suite (`for f in tools/offline-tests/*.test.js; do node "$f" || echo FAIL; done`)
      stays green, count ≥ 1100 + new assertions (per the 2026-09-12 tester
      baseline in `plans/reports/tester-260912-1053-cache-invalidation-regression.md`).
- [x] Code diff is confined to the one `if` condition + one comment in
      `ApiClient.gs` (retry logic) plus Phase 1's logging lines; no unrelated
      refactor.

## Risk Assessment
| Risk | L×I | Mitigation |
|---|---|---|
| Retrying 3xx multiplies load if the cause is actually sustained (not transient) | Low × Med | Bounded to the existing 2-attempt cap, same as 5xx — no behavior change in the worst case beyond one extra request; Scenario B's test explicitly locks in that the worst case is "same failure, better logs," not "infinite retry" |
| A genuinely slow execution (cold start) now takes ~2x as long before failing (attempt 1 slow + attempt 2 slow, vs. today's attempt 1 slow only) | Low × Low | Same shape as the existing accepted 5xx-retry risk; Phase 3's live data will show real-world attempt durations, and if 2x turns out to be a real UX problem, that is a new, separately scoped follow-up (see plan.md's "noted, out of scope" section on lock/backend latency) |
| Misreading Scenario B as "the bug is fixed" when it only improves diagnostics | Explicitly documented in Key Insights and plan.md's Expected Behavior table — code comment added in Step 2 also states this directly, so a future reader doesn't over-claim |

## Next Steps
→ Phase 3: live-verify against the real deployment. Use the captured
`Location` header + elapsed-ms data to determine which of plan.md's
hypotheses (fast edge blip vs. slow execution/cold start) actually dominates
in production, and record that conclusion — not just "it recurred."
