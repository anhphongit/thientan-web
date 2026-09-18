---
type: analysis
plan: 260917-1210-concurrent-session-live-errors
created: '2026-09-17T22:48:00+07:00'
inputs:
  - error_log_from_17_sep_22_36/dev_log.md (client-side ApiClient errors, ttwadmin170826@gmail.com)
  - error_log_from_17_sep_22_36/request_receipt.md (Phase 0's getRequestReceipts output, 195 entries)
  - error_log_from_17_sep_22_36/execution_log.md (GAS Executions dashboard export, 312 rows)
---

# Analysis: does the 22:36–22:41 re-test burst confirm the 30-slot quota theory?

**Short answer: no — this specific evidence weakens it.** Phase 0 did exactly
what it was built for ("this instrument can disprove the theory just as
easily as confirm it"). Don't proceed to Phase 2 on the current design
assumption without accounting for this.

## What was computed

All three files cover the same window (22:36:12–22:41:23 local,
Asia/Ho_Chi_Minh — confirmed via `apps/api/appsscript.json`/`apps/web/appsscript.json`
`timeZone`, and `Date.now()` is UTC-epoch regardless of that setting, so no
offset math was needed).

1. Parsed `execution_log.md` (312 rows: `Version|fn|type|date|duration` +
   status line) into `{fn, start, end, status}` events.
2. Swept a concurrency timeline (start=+1, end=-1) to get concurrent-execution
   count at every instant.
3. Parsed the 21 `dev_log.md` error rows into `{time, action}`.
4. For each error, looked up concurrency **at that exact moment**, and
   cross-referenced `request_receipt.md` for same-action receipts nearby.

## Finding 1 — peak concurrency during the burst: 11, not 30

```
Total executions parsed: 312
Peak concurrent executions: 11 (at 22:39:07)
Time spent at concurrency >= 15: 0.0s
Time spent at concurrency >= 20: 0.0s
Time spent at concurrency >= 30: 0.0s
```

More importantly, concurrency **at the exact moment of each client-visible
error**:

| Error time | Action | Concurrency at that instant |
|---|---|---|
| 22:38:48 | listVisibleFieldGroups | 5 |
| 22:38:55 | listOrders | 7 |
| 22:39:16 | listUsers | 5 |
| 22:39:19 | listOrderCreators | 4 |
| 22:39:28 | listOrders | 6 |
| 22:39:29 | listUsers | 8 |
| 22:39:32 | listVisibleFieldGroups | 2 |
| 22:39:38 | listOrderCreators | 9 |
| 22:39:39 | listProducts | 8 |
| 22:39:39 | statsRevenue | 8 |
| 22:39:40 | statsRevenue | 4 |
| 22:39:41 | listProducts | 5 |
| 22:39:41 | listOrders | 5 |
| 22:39:47 | listOrders | 6 |
| 22:39:48 | statsRevenue | 6 |
| 22:39:51 | listVisibleFieldGroups | 3 |
| **22:39:57** | listUsers | **1** |
| **22:40:05** | listUsers | **2** |
| 22:40:08 | statsRevenue | 3 |
| **22:40:10** | listOrderCreators | **2** |
| **22:40:54** | listUsers | **2** |

Four of the twenty-one errors fired while **1–2** executions were in flight —
essentially no concurrency at all. If the failure mechanism were "Google's
edge refuses to dispatch because 30 owner-identity execution slots are
already busy," the concurrency reading *at the moment of refusal* should be
at or near 30 (that's what would be blocking the new request). It is instead
1–9 across the board, peaking at 11 even in the densest 2m20s window. **This
is the direct disconfirmation Phase 0 was built to be capable of
producing** (see phase-00's own Key Insights: "this instrument can disprove
the theory just as easily as confirm it").

Caveat: `execution_log.md` only contains executions Google's runtime
actually scheduled — a genuinely refused request never creates an execution
row, so it's invisible to this log by construction. That's fine for this
specific test, though, because the theory under test doesn't need the
refused request itself to be visible — it needs the *cause* (≈30 concurrent
executions already in flight) to be visible, and it isn't.

## Finding 2 — a doPost execution stuck running 369s+ (6m9s) at export time

```
Version 75  doPost  Web App  Sep 17, 2026, 10:38:53 PM  369.346 s  Running
```

- Started 22:38:53 — inside the densest error cluster (22:38:48–22:40:54).
- 369s already **exceeds the documented 6-minute (360s) execution cap for
  consumer Google accounts** (`docs/IDENTITY.md` confirms this project's
  owner is a **consumer Gmail** account, not Workspace — consumer accounts
  get the 6-minute cap, Workspace gets 30 minutes) and was still shown
  `Running` in this export. Either it was seconds from being force-killed,
  or something is letting it run past the documented ceiling — worth
  re-checking the Executions dashboard live, right now, for whether it has
  since terminated and how.
- Nearby `request_receipt.md` entries at that second: `statsRevenue`
  (22:38:53.459) and `logDev` (22:38:53.573) are the only two candidates for
  which action this is — receipts alone can't disambiguate further (see
  "Gap in the instrument" below). `statsRevenue` is the more plausible
  candidate to hang (aggregation over the Orders sheet) versus `logDev` (a
  simple append), but this is a guess, not a finding — confirm via
  Stackdriver/Cloud Logging execution transcript for this exact execution
  ID, not by inference.
- Separately: one `doGet` at 22:39:42 completed in **0s** with status
  `Failed`. `doGet` serves the page shell (not API actions), so this is a
  distinct symptom — a full page-load failure, not an `apiCall_` error — and
  isn't in scope for the `dev_log`/`request_receipt` correlation above.

This is a real, independent bug regardless of which quota theory is right,
and it's the single highest-value lead in this data: a hung execution that
already broke past the account's own execution-time ceiling.

## Finding 3 — request-rate density near errors is inconsistent, not a clean signal either

Requests-in-prior-5s at each error ranged from 1 to 9 against a session
average of ~3/5s. Some errors (22:39:38–22:39:48) do cluster with elevated
local call density; others (22:39:57, 22:40:05, 22:40:08, 22:40:10, 22:40:54)
fire during periods **at or below the session average** rate. So a pure
"too many requests per second trips Google Frontend's rate protection"
theory doesn't cleanly explain all 21 errors either — it fits roughly half.

## What this does and doesn't change in the plan

**Does not change:** the edge-level signature itself. `Server: ESF`,
`msAttempt=81646`-style latency, bare 302/404/non-JSON-HTML bodies — this is
still clearly Google's frontend responding, not `apps/api` script code (no
matching JSON error shape, no app headers). That diagnosis stands.

**Does change:** *why* the edge is refusing/misbehaving. The plan's current
Root Cause section attributes it specifically to the documented
30-concurrent-execution-per-owner-identity quota. This burst's own
instrumentation — captured specifically to test that claim — shows errors
occurring from concurrency=1 up to 9, never near 30. Two explanations remain
live, unconfirmed either way by this data:

1. **The effective ceiling for a consumer Gmail owner identity is lower than
   the documented 30**, and/or fluctuates with account-level factors this
   plan hasn't isolated. `IDENTITY.md` already establishes this is a
   consumer account, not Workspace — the "30" figure in the plan's own Root
   Cause table was never verified as applying identically to consumer
   accounts; it was carried over from general Apps Script quota
   documentation.
2. **The hung 369s+ execution (Finding 2) is itself a contributing or
   coincidental factor** — e.g. holding a Sheets API session/lock resource
   in a way that doesn't show up as "concurrency" in the Executions log but
   degrades the platform's responsiveness to other requests during that
   window. Unconfirmed — needs the execution's actual transcript.

Either way: **Phase 2 as currently scoped ("admission gate sized to leave
headroom under 30") is now built on an unverified number.** Sizing an
admission-control queue around 30 when the real ceiling might be ~10–15 (or
might not be a concurrency ceiling at all) would under- or over-throttle.
Phase 1 (fewer round trips, hard client-side in-flight cap) is unaffected —
it reduces exposure to *any* rate- or slot-based throttle regardless of the
exact number, so it's still correct to do first.

## Gap in the instrument, worth fixing before the next repro

`request_receipt.md` records `{t, action}` only — no per-request ID. During
a burst, several browser tabs/views fire the *same* action within
milliseconds of each other, so a receipt near an error's timestamp cannot be
proven to be *that specific* failed request versus a concurrent sibling call
that succeeded. Today's correlation is time-proximity only. If Phase 0 is
extended, adding a client-generated nonce (already have `crypto.randomUUID()`
available client-side) echoed into the receipt would make future analysis
exact instead of approximate — small, additive, same spirit as the existing
instrument, not scope creep to build now unless another repro is planned.

## Recommended next steps, in order

1. **Check the GAS Executions dashboard right now** for the 22:38:53 doPost —
   has it terminated, and what does Stackdriver/Cloud Logging show for its
   execution ID (stack trace, last log line before it stalled)? This is the
   most concrete, independently-actionable bug in this dataset.
2. **Do not size Phase 2's admission gate around "30"** until the real
   ceiling (if concurrency-based at all) is established — either from a
   repro that pushes concurrency higher while capturing receipts, or from
   direct confirmation of the consumer-account quota figure.
3. Proceed with **Phase 1** (request consolidation + hard client-side
   in-flight cap) as-is — it's a net improvement independent of which theory
   is correct, and reduces the surface area for the next test.
4. If another repro is run, consider the request-ID addition above so the
   correlation isn't approximate.

## Unresolved questions

- Is the stuck 22:38:53 execution `statsRevenue` or `logDev` (or something
  else the receipt cache silently failed to record)? Needs Stackdriver, not
  guessable from receipts alone.
- Did that execution ever complete, and if so with what outcome?
- Is there a *documented* (not assumed) concurrent-execution quota figure
  for consumer (non-Workspace) Google accounts specifically, distinct from
  the Workspace-oriented "30" this plan cited?
- Does the 0s-duration `Failed` `doGet` at 22:39:42 recur, and is it
  correlated with anything in this data or only visible via a fuller
  Stackdriver export?
