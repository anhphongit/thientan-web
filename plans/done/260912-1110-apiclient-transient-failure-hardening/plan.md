---
title: "Harden ApiClient.gs against intermittent non-200/3xx Apps Script responses"
description: "Live M5 testing hit intermittent 'Không kết nối được máy chủ dữ liệu ... HTTP 302' failures on apiListProducts (and, per user report, potentially any apiCall_ action). Root cause found in code: ApiClient.gs's retry logic only retries 5xx/thrown errors, never 3xx, and never captures response headers — so a transient Apps Script edge redirect is thrown straight at the user with zero diagnosis and zero retry."
status: done
priority: P1
branch: "main"
tags: [reliability, apps-script, apiclient, m5-live-test]
blockedBy: []
blocks: ["260907-1759-milestone-4-5-completion", "260913-2326-milestone-6-hardening-and-polish"]
created: "2026-09-12T04:13:17.491Z"
createdBy: "ck:plan"
source: skill
---

# Harden ApiClient.gs against intermittent non-200/3xx Apps Script responses

## Overview

Live-testing M5 (`plans/260907-1759-milestone-4-5-completion` Phase 6) surfaced an
intermittent failure: `apiListProducts` (and, by the user's report, potentially
**any** `apiCall_` action, since they all share one code path) sometimes fails
with `Không kết nối được máy chủ dữ liệu ... [DEV] HTTP 302 ·` even though the
`google.script.run` transport layer (the `/callback?...` request the browser's
Network tab shows) always returns HTTP 200 — that 200 is Google's internal RPC
envelope, not the actual API result. The real failure happens one hop server-side:
`apps/web/ApiClient.gs:postJsonToApi_()` calls `apps/api`'s `/exec` URL via
`UrlFetchApp`, and that call occasionally comes back HTTP 302 instead of 200.

**New evidence (2026-09-12), re-analyzed:** the failing request shows as
**pending for a long time** in the browser Network inspector before the 302
error finally surfaces. A fixed 400ms retry sleep cannot produce a long pending
state, so the original "brief edge redirect blip" framing was incomplete — this
revision re-examines the code with that constraint in mind.

**What's confirmed, not speculated:**
1. `apps/web/ApiClient.gs:75-88` only retries when `UrlFetchApp.fetch` throws
   or the response code is `5xx`. A bare 3xx falls outside both cases and is
   thrown straight at the user as `MSG.API_UNREACHABLE` — no retry, and
   critically **no response header or timing capture**, so nobody has ever
   seen the redirect's `Location` target or how long the failing attempt
   actually took. This part of the diagnosis is unchanged and is still the
   direct, fixable code gap.
2. **Lock contention on the failing read path is ruled out.** The action that
   failed live, `apiListProducts` → `apps/api/Products.gs:54 actionListProducts_`,
   is a pure read (`readAll_(SHEETS.PRODUCTS)`, no `LockService` call).
   `SheetsRepo.gs:184 withLock_` (`waitLock(15000)`) is reserved, by the
   codebase's own convention, for "anything that appends or allocates IDs" —
   grepped call sites confirm it's used only by create/update/export actions
   (`Admin.gs:390`, `AdminConfig.gs:339`, `Products.gs:376`, `Orders.gs:1537`,
   `ExportJob.gs:264`), never by list/read actions. So this specific failure
   cannot be explained by this request queuing behind another request's lock.
3. `apps/api/appsscript.json` access is `ANYONE_ANONYMOUS` — still rules out a
   Workspace account-chooser / re-auth redirect as the cause.

**Revised root-cause hypothesis:** with lock contention ruled out for the
observed case, a request that is slow *and then* comes back 3xx is most
consistent with Google Apps Script's own well-documented execution-time
variability (cold start after an idle period, or Google's internal
Sheets/Drive-quota backoff retrying silently inside the execution) — the
request genuinely takes a long time to run, and Google's edge or
`UrlFetchApp`'s own redirect-following either times out or surfaces a
redirect once that variability crosses some threshold. **This cannot be
proven from application code alone** — Google's edge/runtime internals are
opaque to us. What the code CAN and must do is (a) stop throwing away the one
signal we do get (the 3xx + its headers) without retrying it, and (b) start
recording exactly how long each attempt took, so the next live occurrence
gives real timing evidence instead of another unexplained data point.

**Important consequence for the fix's honesty:** if an attempt is slow
because the underlying execution is genuinely slow (not a fast redirect
blip), retrying it will not make it fast — retry only helps the case where
attempt 1's 3xx resolves quickly and attempt 2 succeeds. The fix does not
claim to eliminate slow executions; see "Expected Behavior After Fix" below
for the precise, testable claim it does make.

**Noted but explicitly out of scope for this plan:** the write-path
`waitLock(15000)` call sites above remain a real, separate risk for **write**
actions under concurrent multi-account load (M5 sign-off requires 3
simultaneous test accounts) — a write queued behind another user's held lock
for up to 15s would also show as "long pending." Because the observed failure
was on a read with no lock, this plan does not change lock behavior. Phase 3's
live pass will show, via the same instrumentation, whether a *write* action's
slowness pattern differs from the read case; if so, that is a new, separately
scoped follow-up (per this plan's existing "don't force-fit" rule), not a
reason to expand this plan now.

Because every UI action funnels through the one `apiCall_`/`postJsonToApi_`
choke point, both the diagnostics and the retry fix apply everywhere at once
— matching the user's "not just that feature" report — regardless of which
of the above hypotheses turns out to be the dominant one.

## Approach

1. **Instrument first, change behavior second.** Before touching retry logic,
   capture full diagnostics on every non-200/non-JSON response: status,
   headers (incl. `Location`), body snippet, **and elapsed milliseconds for
   that specific attempt** (the missing piece that would have told us whether
   this was a fast blip or a slow execution). Logged via `console.error`
   (Stackdriver, always-on, no network round-trip) — not only via `devNote_`,
   since `devNote_` makes its own `postJsonToApi_` call and could itself be
   hit by the same intermittent failure it's trying to report.
2. **Extend the retry classification** to treat 3xx the same as 5xx (bounded,
   backed-off retry, same 2-attempt cap — not raised), while explicitly
   continuing to never retry 4xx (matches the existing documented rule
   against multiplying load). This is explicitly framed as "helps the fast-
   blip case, does not worsen the slow-execution case beyond today's already-
   accepted 5xx-retry risk" — see Expected Behavior below.
3. **Cover it with an offline test** using the existing GAS-sandbox pattern in
   `tools/offline-tests/apiclient-scope.test.js` (mocks `UrlFetchApp` and
   `Date.now` in a `vm` sandbox) — this bug class, including the timing
   dimension, is otherwise untestable without a live Apps Script deployment.
4. **Live-verify** during the (already-scheduled, currently blocked) M5 Phase 6
   pass, capture real `Location` header + elapsed-ms data if the issue
   recurs, and use that data to confirm or rule out each hypothesis above in
   docs — replacing inference with evidence.

## Expected Behavior After Fix

Three scenarios this fix must produce, each mapped to a specific offline-test
assertion (see Phase 2) so "fixed" is verified mechanically, not just claimed:

| Scenario | Before fix | After fix | Proven by |
|---|---|---|---|
| **A. Fast transient 3xx** — attempt 1 gets a 3xx quickly, attempt 2 (after 400ms) succeeds | User sees `API_UNREACHABLE` immediately, no retry | Call succeeds silently, no user-visible error at all | Phase 2 test: 302-then-200, asserts `apiCall_` returns normally and `fetchCalls === 2` |
| **B. Slow execution, both attempts 3xx** (cold start / backend variability — cannot be fixed from this layer) | User sees `API_UNREACHABLE` with no header/timing data — "unclear reason" | User still sees `API_UNREACHABLE` (same message, no regression) — but Stackdriver now has the `Location` header AND per-attempt elapsed ms for both attempts | Phase 2 test: 302-then-302 (with a simulated slow clock) still throws `API_UNREACHABLE`, AND the captured log payload contains both attempts' elapsed-ms values |
| **C. Permanent 4xx** (bad secret, wrong URL, real rejection) | Fails immediately, no retry | Unchanged — still fails immediately, no retry | Phase 2 regression test: 404 → `fetchCalls === 1` |

**What this fix does NOT claim:** it does not make Apps Script executions
faster, and it does not guarantee the error disappears — only that (1) a fast
transient case is now invisible to the user instead of a hard failure, and
(2) every remaining failure carries the diagnostic data needed to act on
next time, instead of none.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Diagnostics-first instrumentation](./phase-01-diagnostics-first-instrumentation.md) | Done |
| 2 | [Transient-retry hardening + tests](./phase-02-transient-retry-hardening-tests.md) | Done |
| 3 | [Live verification and docs sync](./phase-03-live-verification-and-docs-sync.md) | Done |
| 4 | [404 retry extension, DevLog always-on, keep-warm mitigation](./phase-04-404-retry-devlog-always-on-and-keepwarm.md) | Done |

## Dependencies

- **Blocks** `plans/260907-1759-milestone-4-5-completion` Phase 6 (M5 live
  verification + sign-off) — that phase is the one where this bug was found;
  signing off M5 without this fix means every live-test action (not just
  Inventory) carries this risk. That plan's Phase 6 file has been annotated
  to point back here.
- No other plan touches `apps/web/ApiClient.gs`, so no file-ownership conflict.

## File ownership

Only this plan touches: `apps/web/ApiClient.gs`, `tools/offline-tests/apiclient-scope.test.js`,
`docs/system-architecture.md` (Known Issues note), `docs/TASKS.md` (log entry).

## Rollback

Single file (`ApiClient.gs`) + one test file. Revert by `git revert`. No schema
or Config-sheet changes, no new deployment access changes — same `appsscript.json`.
Requires a `clasp push` + new version of `apps/web` only (not `apps/api`).
