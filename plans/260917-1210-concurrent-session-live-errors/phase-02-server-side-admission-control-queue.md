---
phase: 2
title: "Write-action idempotency guard"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 2: Write-action idempotency guard

## ⚠️ This phase was originally "server-side admission-control queue" — repurposed 2026-09-18

The original design (fully preserved below this notice, for the record —
do not delete, do not build it) assumed `apps/api` needed protection from
approaching its 30-concurrent-execution ceiling. Two independent live
tests, each with exact request-ID correlation, proved `apps/api` never
approaches that ceiling (peak observed: 11-12, avg 2.15s, zero server-side
failures) — the real failure is Google's edge failing to deliver an
already-successful response back to the caller. An admission gate cannot
fix a problem that occurs entirely downstream of apps/api's own
processing. **Do not implement the original design below.** It is kept
only as a documented, deliberately-rejected alternative — see
`plan.md`'s "Final root cause & solution strategy" section for the
reasoning.

This phase's ACTUAL scope now: the exact same live tests proved something
more urgent — every observed failure caused `apps/api` to execute the SAME
action 2-3 times (client retries reach a server that already succeeded and
just never reported back). All 8 observed instances were reads (harmless
to re-run). A write action (`createOrder`, `updateOrder`, `deleteOrder`,
`createProduct`, `updateProduct`, `deleteProduct`, `createUser`,
`updateUser`, `updateConfig`, `approveOrder`, `rejectOrder`,
`requestApprove`, `setDraftOrder`, `backupNow`) hitting the same proven
failure mode would silently duplicate. This phase makes that impossible,
regardless of how many times a write is retried — automatically or by the
user clicking "Thử lại" (Phase 4).

## Overview

A short-TTL `CacheService`-backed dedup check, keyed by a stable
per-user-attempt ID, in front of every write action's handler in
`apps/api/Router.gs`: if the SAME attempt was already processed, return
the cached prior result instead of re-running the handler. Read actions
are explicitly out of scope — re-running a read is harmless, and adding
this overhead there would be pure YAGNI.

## Key Insight — the ID must survive a MANUAL retry, not just automatic ones

Phase 0's `reqId` (`apps/web/ApiClient.gs`'s `apiCall_()`) is generated
fresh on every invocation of `apiCall_`. That's correct for `apiCall_`'s
OWN internal retry loop (same ID reused across those attempts) — but
Phase 4's retry button calls the whole action again from the browser,
which invokes `apiCall_()` again and would get a **new** `reqId` under
today's design. A write that actually succeeded on attempt 1 (just failed
to report back), followed by the user clicking "Thử lại", would NOT be
caught by a guard keyed only on that fresh ID.

**Design requirement:** the ID used for the idempotency guard must be
generated once per **user attempt** (the moment the user clicks Save/
Submit in the browser), not once per `apiCall_` invocation. It must be
threaded through and reused by BOTH `apiCall_`'s automatic retries AND a
manual "Thử lại" click on that SAME attempt. Only a genuinely new user
action (editing the form again, clicking Save again) gets a new ID.

This means write-action call sites need a client-generated, stable ID
that survives across the whole `T.call()` → `google.script.run` →
`Main.gs` → `apiCall_()` chain, distinct from (but reusing the same
format/spirit as) Phase 0's existing `reqId`. Simplest correct approach:
rename nothing, extend what exists — let the BROWSER optionally supply
the ID (`crypto.randomUUID()`, already used elsewhere in this codebase's
era — verify availability in the target browser support matrix before
relying on it, fall back to a Math.random-based UUID-v4-shaped string if
not guaranteed), passed through `T.call()`'s payload as a reserved key
(e.g. `payload.__attemptId`), which `Main.gs`'s write wrappers forward to
`apiCall_()`, which uses it INSTEAD OF generating a fresh
`Utilities.getUuid()` when present (falls back to today's behavior for
every call site that doesn't supply one — reads never need to). The retry
button re-submits with the SAME `__attemptId`; a genuinely new Save click
generates a new one.

## Requirements

- Functional: for the write-action list above only, `apps/api/Router.gs`
  checks a `CacheService` entry keyed by the attempt ID BEFORE running the
  handler; if found, returns the cached `{ok, data/error}` result
  unchanged (same shape the client already expects) instead of executing
  the handler again; if not found, runs the handler normally and caches
  its result (bounded TTL — long enough to cover realistic retry windows,
  short enough to not become unbounded storage; start at 10 minutes,
  matching the outer bound of how long a user might plausibly keep
  retrying the same failed action before giving up or reloading).
- Non-functional: never throws on its own account (same risk class as
  Phase 0's other `CacheService` usage — wrap in try/catch, degrade to
  "run the handler normally" if the cache read/write itself fails, never
  let this guard become a NEW failure mode); adds negligible latency to
  the common (no-retry) case (one cache read).
- An attempt ID is REQUIRED for write actions once this ships (not
  optional) — a write action reaching `doPost` with no `__attemptId`
  should either be rejected with a clear internal error (surfaced in
  DevLog, not to the end user) or, if a hard requirement is judged too
  risky to enable before every write call site is updated, log a
  visible warning and proceeed unprotected for that one call — decide
  during implementation which is safer given the current state of call
  sites; document the choice in this phase's completion notes. Read
  actions never require it.

## Architecture

```
Browser (Views*.html, write actions only)
   │  __attemptId generated ONCE per user attempt (Save/Submit click),
   │  held in view-local state, reused by any retry of THIS attempt
   ▼
App.html T.call() → passes payload.__attemptId through unchanged
   ▼
Main.gs api*() write wrappers → forward payload as-is (no change needed
   here if __attemptId simply rides inside payload; confirm during
   implementation whether Main.gs inspects/strips payload keys anywhere
   that would need to allow-list this one)
   ▼
apps/web ApiClient.gs apiCall_(action, payload)
   │  reqId = payload.__attemptId || Utilities.getUuid()  (fallback keeps
   │           read actions and any caller that doesn't supply one working
   │           exactly as today)
   ▼
apps/api Router.gs doPost(e)
   │  for write actions in the guarded list:
   │    cached = idempotencyCache_.get(req.attemptId)
   │    if (cached) return cached response, do NOT run handler
   │    else: run handler, cache its response keyed by req.attemptId, return it
```

## Related Code Files

- Modify: `apps/api/Router.gs` (the idempotency check, wrapping the
  write-action dispatch specifically — read actions bypass it entirely)
- Modify: `apps/api/Config.gs` (new cache key/TTL constants, following the
  exact convention `CACHE.REQUEST_RECEIPTS_*` already established in
  Phase 0 — match it, don't invent a new style)
- Modify: `apps/web/ApiClient.gs` (`apiCall_` uses `payload.__attemptId`
  when present instead of always generating fresh)
- Modify: `apps/web/ui/App.html` (`call()`/`T.call()` — confirm
  `payload.__attemptId` rides through untouched; this may already work
  with zero changes if payload is passed through opaquely, verify before
  assuming a change is needed)
- Modify: relevant `apps/web/ui/Views*.html` write-action call sites
  (generate `__attemptId` once per user attempt, reuse on manual retry —
  scope to the actual write-triggering UI flows, do not touch read-only
  views)
- Modify (tests): new `tools/offline-tests/write-action-idempotency.test.js`
  — a repeated call with the same attempt ID must invoke the underlying
  handler only once and return the identical cached result both times; a
  different attempt ID must always run the handler fresh; a read action
  must be completely unaffected (no attempt-ID handling at all).

## Implementation Steps

1. Read `apps/api/Router.gs`, `apps/api/Config.gs`, `apps/web/ApiClient.gs`,
   and `apps/web/ui/App.html`'s `call()` in full before editing (Read-
   before-Write) — confirm current payload-passing behavior rather than
   assuming it.
2. Define the write-action list as a named constant (single source of
   truth, not duplicated across files) — reuse `getActions_()`'s existing
   registry structure if it can be tagged/grouped there rather than
   maintaining a second parallel list that can drift out of sync.
3. Implement the `CacheService`-backed idempotency check in `Router.gs`,
   wired in only for actions in that list.
4. Update `apiCall_` to accept/forward `payload.__attemptId`.
5. Update write-triggering UI call sites to generate and hold a stable
   `__attemptId` per user attempt, reused by both the automatic retry
   (already inside `apiCall_`) and Phase 4's manual retry button.
6. Write the offline tests above.
7. `clasp push` both projects, full offline suite, then a live smoke test:
   force a write action to fail after the server-side write actually
   succeeded (e.g., temporarily break the response path in a test
   deploy, or reuse Phase 0's proven-reliable burst-reproduction method),
   click "Thử lại", and confirm via the Sheet/receipts that the write
   happened exactly once.

## Success Criteria

- [ ] Two calls with the SAME `__attemptId` for a write action result in
      the handler running exactly once (offline test) — the second call
      gets the cached result, not a fresh execution.
- [ ] Two calls with DIFFERENT `__attemptId`s always both run fresh
      (offline test) — this guard must never suppress a genuinely new
      write.
- [ ] A read action is completely unaffected — no attempt-ID handling,
      no behavior change (offline test, explicit negative case).
- [ ] The idempotency cache itself failing (mocked throw) does not break
      the underlying write — degrades to "run normally," never a new
      failure mode (offline test, same pattern as Phase 0's own
      risk-mitigation tests).
- [ ] A manual "Thử lại" click (Phase 4) on a write action reuses the
      SAME `__attemptId` as the attempt it's retrying — verified in the
      UI code, not just assumed.
- [ ] Full offline suite green.
- [ ] Live: the forced-duplicate scenario in Implementation Step 7 shows
      exactly one write, not two, in the underlying Sheet.

## Risk Assessment

Medium risk — this sits in front of every write action, so a bug here
could either (a) fail to prevent a real duplicate (defeats the whole
point — mitigate with the offline tests above being genuinely
adversarial, not just happy-path) or (b) incorrectly suppress a
legitimate second write that a user intentionally meant to be separate
(e.g., creating two similar orders in a row) — mitigate by scoping the ID
strictly to "reused only on a retry of the exact same attempt," never
reused across two distinct user actions, and testing that distinction
explicitly. Medium effort, not large — the pattern directly reuses Phase
0's already-proven `CacheService` approach rather than inventing a new
mechanism.

---
---

## ORIGINAL DESIGN (2026-09-17) — preserved for the record, DO NOT BUILD

*(Everything below this line is the plan as it stood before the 2026-09-18
re-plan. It is superseded by the section above. Kept only so the reasoning
that led here isn't lost — see `plan.md`'s "Final root cause & solution
strategy" for why it was cut.)*

## Overview

The request queue the user asked for, on the server side of the hop:
`apps/api`'s single request-dispatch entry point (`doPost` / `Router.gs`)
gains a fast, fail-fast admission check that bounds how many executions are
doing real Sheet I/O at any one moment, and turns "too many requests right
now" into a clean, always-valid `{ok:false}` JSON response the client
already knows how to retry (Phase 3/4) — instead of leaving the outcome to
Google's edge, which (per the prior plan's confirmed evidence) sometimes
answers overload with a raw 302/404/non-JSON page instead of real JSON.

**Read `plan.md`'s "What Will and Won't Actually Fix This" section before
implementing** — this phase has a specific, honest scope. It does NOT
reduce how many requests Google's edge has to dispatch to script execution
in the first place (that's Phase 1's job); it only governs what an
execution that DID get dispatched does once running. A request Google's
edge refuses to dispatch at all (because the 30-slot ceiling is already
exceeded) never reaches this code and cannot be rescued by it.

**Why this is fail-fast-and-return, not a real hold-and-process queue**
(direct answer to a user question raised 2026-09-17, recorded here so it
isn't re-litigated): Apps Script has no persistent server process — nothing
can sit and watch a queue continuously the way a Node/Redis worker would.
Every unit of work here IS a script execution, invoked either by an
incoming request or by a trigger (minimum interval ~1 minute). A design
where the server "holds" a request and pushes the real answer back later
(e.g. to a "broadcast listener") is not buildable at all: once `doPost`
returns, that HTTP request is finished — Apps Script Web Apps have no
WebSocket/SSE/webhook mechanism to reach back into an already-completed
response. The only way a client can ever learn "is it done yet" is to ask
again (poll), and each poll is itself a full execution competing for the
same 30 slots — so a naive "queue everything and poll" design applied to
EVERY action would likely increase total concurrent load, not reduce it.
This codebase already has the one legitimate Apps-Script-native version of
"submit now, check back later": `apps/api/ExportJob.gs`
(`apiStartExportJob` / `apiExportJobStatus`, polled from
`ViewsOrders.html`). If a specific, genuinely slow or lock-contended action
(not just "everything") is later shown by Phase 5's alerting to need this
treatment, extend that existing pattern to it — do not build a second,
different async mechanism from scratch, and do not apply it universally
without evidence it's needed (YAGNI).

## Key Insights — read before writing any lock code

- **Do not spin-wait inside `doPost`.** Every incoming request that gets
  dispatched to script execution already occupies one of the 30 shared
  concurrent-execution slots (`plan.md` Root Cause) for as long as that
  execution runs — including time spent waiting in a retry/sleep loop for a
  turn. A "wait inside the same execution" design would hold slots LONGER
  under exactly the load this phase is meant to relieve, making the
  ceiling problem worse, not better. **Fail fast**: check admission, and if
  denied, return the busy response within milliseconds, freeing the slot
  immediately so the CLIENT's retry (Phase 3) can try again once real
  capacity exists.
- **Do not reuse `LockService.getScriptLock()` for the admission counter
  itself in a way that nests with the existing write-path locks**
  (`withOrderLock_`, `withUserLock_`, `withConfigLock_`, `withProductLock_`
  — `Orders.gs:1587`, `Admin.gs:402`, `AdminConfig.gs:340`,
  `Products.gs:376`, all calling `LockService.getScriptLock()`). Apps
  Script's script lock is not documented as safely re-entrant; acquiring it
  a second time from the SAME execution while already holding it risks a
  self-deadlock. Structure the admission check so its own brief lock
  (guarding only the counter read-modify-write) is fully acquired AND
  released BEFORE the actual action code runs — never held while the
  action's own (separate, longer) write-lock is acquired. These two lock
  acquisitions must be sequential in time, never nested.
- **Threshold must leave headroom under 30, not target it.** `apps/api`
  ALSO runs its own trigger-driven executions (the keep-warm ping, the
  expiry reminder, and Phase 5's new error-burst check) — each is a real
  execution that (per Google's docs) also counts against the same
  per-script/per-identity accounting. Start conservative (e.g. cap at
  **15–18** concurrent admitted executions), leaving real headroom, and
  record this as a tunable Script Property (matching the existing
  `rotationDays`/`warnDays` pattern in `SECURITY.md`) rather than a
  hardcoded constant — it will need tuning after a real observation window,
  the same honesty framing the prior plan used for its keep-warm trigger.
- `CacheService.getScriptCache()` is the right shared-state primitive here
  (not `PropertiesService`, which is slower and meant for
  config/durable-not-ephemeral state) — values expire on their own via TTL,
  which also acts as a safety net if a release ever fails to run.

## Implementation Steps

1. **`apps/api/Router.gs` (or wherever `doPost` currently dispatches
   actions) — add `admitRequest_()`/`releaseRequest_()`:**
   ```
   function admitRequest_(maxConcurrent) {
     var lock = LockService.getScriptLock();
     lock.waitLock(2000); // brief — guards only the counter update
     try {
       var cache = CacheService.getScriptCache();
       var current = Number(cache.get(INFLIGHT_KEY) || 0);
       if (current >= maxConcurrent) return false;
       cache.put(INFLIGHT_KEY, String(current + 1), 30); // TTL safety net
       return true;
     } finally {
       lock.releaseLock();
     }
   }

   function releaseRequest_() {
     var lock = LockService.getScriptLock();
     lock.waitLock(2000);
     try {
       var cache = CacheService.getScriptCache();
       var current = Number(cache.get(INFLIGHT_KEY) || 0);
       cache.put(INFLIGHT_KEY, String(Math.max(0, current - 1)), 30);
     } finally {
       lock.releaseLock();
     }
   }
   ```
   (Names/placement adjust to match this file's actual current structure —
   read `Router.gs`'s real `doPost` before writing this, per the Read-before-
   Write rule.)
2. **Wire into `doPost`:** immediately after parsing the request (secret
   check can happen either before or after — decide based on whether an
   unauthenticated caller should be able to consume/probe a slot; prefer
   checking the secret FIRST so admission capacity is never spent on
   requests that would be rejected anyway) and before dispatching to the
   action handler:
   - `if (!admitRequest_(maxConcurrent)) return jsonResponse_({ ok: false, error: MSG.SERVER_BUSY });`
   - Wrap the actual action dispatch in `try { ... } finally { releaseRequest_(); }`
     so a thrown action error still releases the slot.
3. **New message:** `MSG.SERVER_BUSY` (Vietnamese, matching this project's
   existing message style — e.g. alongside `MSG.ORDER_LOCK_BUSY`) —
   something like *"Hệ thống đang bận, vui lòng thử lại sau vài giây."*
4. **`maxConcurrent` as a Script Property** (e.g. `MAX_CONCURRENT_REQUESTS`,
   default 15), read once per execution, not per-request-recomputed from
   scratch beyond the property read itself.
5. **`apps/web/ApiClient.gs`:** confirm `MSG.SERVER_BUSY` (or however the
   API signals it in `body.error`) is retried the same way genuine
   transient failures are (this becomes an input to Phase 3's retry
   classification — coordinate so Phase 3 explicitly includes this
   application-level busy signal in its retryable set, not just transport-
   level 3xx/5xx/404).

## Related Code Files (original design — not being built)

- Modify: `apps/api/Router.gs` (or the actual `doPost` file — verify exact
  filename/location before writing)
- Modify: `apps/api/Config.gs` (new `MSG.SERVER_BUSY`, new
  `MAX_CONCURRENT_REQUESTS` property key constant if one doesn't already
  exist for property names)
- Modify (tests): new `tools/offline-tests/admission-control-queue.test.js`
  — mock `CacheService`/`LockService` (check if the existing offline harness
  already has these mocks from other lock-related tests, e.g. around
  `withOrderLock_`, before writing new ones).

## Success Criteria (original design — not being built)

- [ ] A simulated burst of N concurrent `doPost` calls (offline test, N well
      above the configured `maxConcurrent`) results in exactly
      `maxConcurrent` "successful" dispatches and the rest receiving
      `MSG.SERVER_BUSY` — never a thrown exception, always valid JSON.
- [ ] `releaseRequest_()` is proven to run even when the action handler
      throws (offline test: inject a throwing action, assert the in-flight
      counter returns to its pre-call value afterward).
- [ ] No self-deadlock when an admitted request also acquires one of the
      existing write-path locks (`withOrderLock_` etc.) — offline test
      exercises this exact combination (an admitted request that also does
      a locked write) end-to-end.
- [ ] `MAX_CONCURRENT_REQUESTS` is read from Script Properties with a
      sensible default if unset.
- [ ] Full offline suite green.
- [ ] Live: confirm a forced-busy response (temporarily set
      `MAX_CONCURRENT_REQUESTS` very low, e.g. 1, in a test deploy) actually
      surfaces as the new Vietnamese busy message end-to-end through the UI,
      not a generic error.

## Risk Assessment (original design — not being built)

Medium risk — this sits directly in `doPost`'s critical path for EVERY
action (reads and writes alike); a bug here breaks the entire app, not one
feature. Mitigate with the nesting/deadlock test above as a hard gate before
this phase is considered done, and keep the admission check itself trivially
simple (a counter, not a priority queue or fairness scheme — YAGNI at this
team's scale). Roll out by raising `MAX_CONCURRENT_REQUESTS` from a very
conservative value upward after live observation, not the reverse.
