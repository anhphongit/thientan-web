# Code Review: ApiClient.gs Phases 1-2 (transient-retry hardening)

**Scope:** `apps/web/ApiClient.gs` (retry loop + logging), `tools/offline-tests/apiclient-scope.test.js` (new Section 3)
**Plan:** `plans/260912-1110-apiclient-transient-failure-hardening/` phases 1-2
**Verdict:** Correct, matches plan intent, low risk. One doc-drift nit, no blockers.

## Correctness vs plan.md's stated intent

- **3xx retry condition** (`ApiClient.gs:97`): `attempt < 2 && ((code>=500&&<=599)||(code>=300&&<=399))` — exact match to Phase 2 Step 1's spec, same `attempt<2` cap (not raised), `Utilities.sleep(400); continue;` body unchanged. Verified.
- **Fast-blip case helped, slow case not worsened**: confirmed by trace — a 3xx used to hard-fail on attempt 1; now it retries once more before failing. This is the plan's own accepted tradeoff ("~2x as long before failing" in Phase 2's Risk Assessment), correctly bounded to the pre-existing 2-attempt cap, not a new risk.
- **4xx stays unretried**: falls through to `devNote_` + throw unconditionally — no code path retries 3xx/5xx logic touches 4xx. Confirmed by reading the `if` condition and the regression test (404 → `fetchCalls === 1`, `sleepCalls === 0`).
- **Header logging is non-throwing even if `getAllHeaders()` misbehaves**: `try { headers = response.getAllHeaders(); } catch (e) { /* best-effort only */ }` at line 86, defaults to `{}`, placed before the pre-existing body-snippet log line as Phase 1 required. Confirmed correct and matches the "never let diagnostics break the error path" requirement.
  - Note: the adjacent `response.getContentText()` call at line 90 (and 102) is *not* similarly guarded, but that's pre-existing, unchanged behavior — out of scope for this diff, not a regression.
- **Per-attempt timing** (`tAttempt`/`msAttempt`, `msAttemptErr`): scoped inside the loop body, computed after every fetch (success or catch), distinct from the pre-existing whole-call `tFetch`/`msFetch`. Correct per Phase 1's architecture note (per-attempt vs whole-call figures serve different purposes).
- **`devNote_` extension**: final throw's `devNote_` call now includes `headers=` and `msAttempt=` in its detail string (lines 101-104) as Phase 1 Step 3 specified, truncated consistently with existing body-snippet truncation.

## Minor doc-drift (non-blocking, worth a follow-up one-liner)

`ApiClient.gs:37-39`'s top-of-function comment still reads: *"at most one retry, and only for transient failures (network throw or HTTP 5xx). Never retry 4xx..."* — this is now stale since 3xx is also retried (the new, accurate explanation lives at lines 91-96 next to the `if`). Not incorrect enough to mislead about behavior (the local comment at 91-96 is correct and closer to the code), but a future reader skimming the function-level comment only would get the old picture. Suggest a one-word edit ("HTTP 5xx/3xx") next time the file is touched — not worth a separate diff for this alone.

## Test fidelity — mock `HTTPResponse` shape

`makeResponse(code, text, headers)` implements exactly the three methods the real code path calls: `getResponseCode()`, `getContentText()`, `getAllHeaders()`. That's a faithful, minimal stand-in for Apps Script's `HTTPResponse` *for this code's usage* — no unused/missing methods that would mask a bug in what's actually exercised. `getAllHeaders()` in production can return arrays for multi-valued headers; the mock returns plain string values, but since `ApiClient.gs` only ever `JSON.stringify`s the header object opaquely (never inspects individual header shapes), this simplification cannot hide a functional bug.

Traced the timing math: `fakeClock` is advanced *inside* `fetchBehavior`, called via the sandboxed `UrlFetchApp.fetch` from within `postJsonToApi_`; `Date.now` is stubbed to read `fakeClock`. `tAttempt` is captured before `postJsonToApi_()` and `msAttempt` after — so Scenario A correctly measures ~50ms and Scenario B correctly measures ~12000ms per attempt. Regex `/,\s*(\d+)ms\)/` against the log format `'(attempt ' + attempt + ', ' + msAttempt + 'ms)'` is correct.

Verified test assertions are non-trivial (not tautological): Scenario A checks `fetchCalls===2` and `sleepCalls===1` (proves the retry actually happened, not just "no throw"); Scenario B checks both header logs contain the `Location` value AND elapsed-ms ≥ 12000 (would catch a bug where only one attempt's headers were logged, or where msAttempt was computed against the wrong `tAttempt`); regression guard checks `fetchCalls===1` and `sleepCalls===0` for 404 (would catch an off-by-range error like `<=399` accidentally swallowing 4xx).

## Security / PII in header logging

Headers logged are the **response** headers from `apps/api`'s own `/exec` endpoint (not request headers, not the shared secret, not the `actor` field) — consistent with Phase 1's own risk-assessment note. `apps/api/appsscript.json` access is `ANYONE_ANONYMOUS`, so a Google auth/account-chooser redirect (which could carry session cookies) is already ruled out per the plan's diagnosis. No secret/credential fields are read from `bodyJson` into the log line. Logged via `console.error` → Stackdriver, which is internal-only (not returned to the browser) — same trust boundary as the pre-existing body-snippet log. No new PII surface introduced beyond what Phase 1 already accepted.

## Scope check

Diff is confined to: the one retry `if` condition, the timing/header logging additions inside the existing retry loop, and the `devNote_` detail-string extension in `ApiClient.gs`; plus one new, additive test section in `apiclient-scope.test.js`. No unrelated refactor, no changes to `postJsonToApi_`'s own GET-redirect retry path, no changes to success-path behavior. Matches Phase 2's own success criterion ("code diff is confined to the one `if` condition + one comment... plus Phase 1's logging lines").

## Unresolved Questions

- None blocking. Confirm with the plan owner whether the stale top-of-function comment (`ApiClient.gs:37-39`) should be fixed now or deferred to Phase 3's docs-sync pass — cosmetic either way.
