---
phase: 1
title: "Diagnostics-first instrumentation"
status: done
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Diagnostics-first instrumentation

## Overview
Capture the diagnostic data that has never been logged for a non-200 response
from `apps/api`: response headers (especially `Location`) **and per-attempt
elapsed milliseconds** — before changing any retry behavior. Elapsed time is
the piece that turns "unclear reason" into an actual answer: a live report
showed the request **pending for a long time** before the 302 surfaced, which
a header alone cannot explain (a fast blip and a slow-then-redirect both look
identical in the headers; only timing tells them apart).

## Key Insights
- Lock contention was checked and ruled out for the failing read path
  (`actionListProducts_` has no `LockService` call — see plan.md). So "why
  was this slow" is not explained by this request queuing behind another
  request's lock. Whatever made it slow happened inside the single
  `UrlFetchApp.fetch` call itself (or Google's edge in front of it) — which is
  exactly why per-attempt timing, not just headers, is needed here.

## Requirements
- Functional: on any non-200 response from `postJsonToApi_`, log status code,
  all response headers, a body snippet, **and elapsed ms for that specific
  attempt** — via `console.error` (Stackdriver), unconditionally (not gated
  on `isDevMode_()`).
- Functional: also log elapsed ms when `UrlFetchApp.fetch` **throws** (the
  `catch` branch at `ApiClient.gs:49-73`) — a hung/slow attempt can fail by
  throwing just as easily as by returning a bad status code, and today's
  catch block logs nothing about duration either.
- Functional: `devNote_`'s own diagnostic write must not be the only place this
  is captured, since `devNote_` makes its own `postJsonToApi_` call and can be
  silently dropped by the exact failure it's meant to report.
- Non-functional: zero behavior change to success paths or retry decisions;
  this phase only adds logging, no new retries yet (that's Phase 2, kept
  separate so a live recurrence between phases still yields evidence even if
  Phase 2 isn't deployed yet).

## Architecture
`apiCall_` (`apps/web/ApiClient.gs:75-88`) already logs `response.getContentText()`
on non-200. Add header capture at the same point, wrapped in try/catch (Apps
Script's `HTTPResponse.getAllHeaders()` can itself throw on some malformed
responses — never let diagnostics logging break the error path it's attached to).
For timing, wrap the existing `postJsonToApi_(url, bodyJson)` call (inside the
`while (attempt < 2)` loop, `ApiClient.gs:47`) with a `Date.now()` pair scoped
to that one attempt — this is separate from the pre-existing `tFetch`/`msFetch`
variables, which measure the whole call including all retries; a per-attempt
figure is what actually answers "was THIS attempt slow."

## Related Code Files
- Modify: `apps/web/ApiClient.gs`

## Implementation Steps
1. Inside the `while (attempt < 2)` loop, wrap the fetch call:
   ```javascript
   var tAttempt = Date.now();
   try {
     response = postJsonToApi_(url, bodyJson);
     lastErr = null;
   } catch (err) {
     var msAttemptErr = Date.now() - tAttempt;
     lastErr = err;
     console.error('apiCall_(' + action + '): fetch failed (attempt ' + attempt +
       ', ' + msAttemptErr + 'ms): ' + err);
     ...
   }
   var msAttempt = Date.now() - tAttempt;
   ```
   (Replace the existing `console.error('apiCall_(...): fetch failed (attempt ...)')`
   line at `ApiClient.gs:51` with the timed version above — same message, one
   extra field, not a new log line.)
2. At the `code !== 200` branch (`ApiClient.gs:77-88`), add header capture and
   include `msAttempt`:
   ```javascript
   var headers = {};
   try { headers = response.getAllHeaders(); } catch (e) { /* best-effort only */ }
   console.error('apiCall_(' + action + '): HTTP ' + code + ' (attempt ' + attempt +
     ', ' + msAttempt + 'ms) headers=' + JSON.stringify(headers));
   ```
   placed **before** the existing `console.error(... response.getContentText() ...)`
   line so header/timing capture never depends on body-read succeeding.
3. Extend `devNote_`'s `detail` payload (called at `ApiClient.gs:85-86`) to
   include the same `headers` object and `msAttempt`, JSON-stringified and
   truncated — but only as a secondary channel; the `console.error` calls
   above are the source of truth since they can't be lost to network flakiness.
4. Do **not** change the retry/threshold logic in this phase — that's Phase 2.
   Keep this phase a pure, low-risk logging addition so it can ship
   independently if Phase 2 needs more design time.

## Success Criteria
- [x] A forced 302 in the offline sandbox (Phase 2's test harness, written
      after this phase, can double as a Phase 1 smoke test) results in a
      `console.error` call containing the mocked `Location` header value
      AND a numeric elapsed-ms field reflecting the sandbox's simulated clock.
- [x] A forced `UrlFetchApp.fetch` throw also produces an elapsed-ms field in
      its log line (not just the header-capture branch).
- [x] No change to any currently-passing offline test (943+ assertions still
      green).
- [x] No behavior change on 200 responses (verified by existing
      `apiclient-scope.test.js` still passing unmodified).

## Risk Assessment
| Risk | Mitigation |
|---|---|
| `getAllHeaders()` throws on an unusual response object | Wrapped in try/catch, defaults to `{}` |
| Logging PII/secrets in headers | Headers from `apps/api`'s own response, not request headers — no `secret`/`actor` leakage; still keep body snippet truncated as today |
| `Date.now()` calls add negligible but nonzero overhead per attempt | Two calls per attempt max (bounded by the existing 2-attempt cap) — not a measurable cost |

## Next Steps
→ Phase 2 uses this instrumentation's shape (including a simulated clock in
the test sandbox) to write the retry-behavior test, then adds the actual
retry classification change.
