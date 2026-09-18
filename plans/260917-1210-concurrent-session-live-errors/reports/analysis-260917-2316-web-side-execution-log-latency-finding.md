---
type: analysis
plan: 260917-1210-concurrent-session-live-errors
created: '2026-09-17T23:16:00+07:00'
supersedes-partially: analysis-260917-2248-error-burst-retest-confidence-check.md
input: error_log_from_17_sep_22_36/web_execution_log.md (apps/web's own GAS Executions
  export, same 22:36-22:46 burst, 126 rows — the CALLING side, not the api side)
---

# Analysis: apps/web's own execution log — the missing half of the picture

**This upgrades confidence in "shared owner identity overload" again — but via
a mechanism neither prior report modeled: multi-minute `UrlFetchApp` latency,
not visible concurrency.** Read together with the first report
(`analysis-260917-2248-...md`), the two datasets stop contradicting each
other once you separate *what apps/api's Executions dashboard can see*
(only dispatched executions) from *what actually happened at the network
hop* (this file).

## The numbers

Parsed all 126 rows (`Version|fn|Web App|date|duration` + status).
112 are `apiXxx` wrapper calls (apps/web's own functions that call apps/api
via `postJsonToApi_`/`apiCall_` in `apps/web/ApiClient.gs`):

```
                              n    avg      max
apiSystemHealth               4   37.7s    95.4s
apiListConfig                 4   98.9s   360.6s  ← hit the wall, see below
apiListUsers                 13   67.8s   192.1s
apiListPermissionPresets     12   58.6s   113.1s
apiListVisibleFieldGroups    12   80.7s   131.3s
apiListOrders                22   47.2s   176.1s
apiGetSession                12    5.9s    29.5s  ← the one that stayed healthy
apiListProducts              11   51.8s    89.7s
apiStatsRevenue              11   61.8s   112.8s
apiListOrderCreators         11  104.0s   176.2s

62/112 (55%) took >30s. 52/112 (46%) took >60s. 15/112 (13%) took >120s.
```

**One execution — `apiListConfig` at 22:38:01 — ran 360.566s, status
`Timed Out`, Cloud log: `Exceeded maximum execution time` at 22:44:02.**
That is not "slow." That is Google forcibly killing an apps/web execution
for hitting the platform's own 6-minute consumer-account ceiling — the
single most unambiguous data point in either dataset.

## Where the time actually went — traced through the code, not inferred

Read `apps/web/ApiClient.gs` (the only file that calls apps/api):

- `postJsonToApi_` (line 170): one `UrlFetchApp.fetch()`, and — only if the
  body is literally `"THIENTAN API"` (apps/api's `doGet` plaintext, per
  `apps/api/Router.gs:187` — meaning the POST got redirected and followed
  as a GET, a known, already-documented failure mode from the prior
  260912-1110 plan) — sleeps **500ms** and fetches once more.
- `apiCall_` (line 15): wraps that in up to 2 attempts, sleeping **400ms**
  between them, retrying only on network-throw / 5xx / 3xx / bare 404.

**Total intentional sleep budget across the whole function: ≤900ms.**
Observed durations run 30–360s. That gap — seconds of code-controlled
sleep versus minutes of actual wall-clock time — means essentially all of
the duration is Apps Script blocked *inside* `UrlFetchApp.fetch()` itself,
waiting for literally any response from Google's edge in front of
apps/api's `/exec` URL. The log lines confirm this directly:
`apiCall_(listOrderCreators): HTTP 404 (attempt 1, 128453ms)` — **that
single fetch call took 128 seconds to get a 404 back.** This is not this
project's code being slow; it's Google's infrastructure sitting on the
connection for two-plus minutes before answering at all.

## Reconciling this with report 1's "peak concurrency was only 11"

Report 1 measured concurrency from **apps/api's own Executions log** —
which by construction only contains executions Google's runtime actually
started. A request stuck for 100+ seconds inside `UrlFetchApp.fetch()`,
waiting on Google's frontend before it's ever dispatched to script code
(or before it's bounced with a 404/302/redirected-GET), **does not appear
in that log at all during the wait** — it would only show up, if ever, once
dispatched. So report 1's low observed concurrency (peak 11) and this
report's extreme latency (up to 360s) are **not in conflict** — they
describe two different vantage points on what may be the same underlying
congestion: apps/api's execution dashboard undercounts total demand,
because most of the demand in this burst was stuck queueing at the edge,
invisible to that dashboard, not competing for a countable "slot."

**Net effect on the plan's Root Cause confidence: revised upward again,
with a corrected mechanism.** The "shared owner identity is overloaded"
framing is now more strongly evidenced than either individual report
suggested alone — just not via "30 concurrent executions visible in a
dashboard." The actual symptom is Google's frontend holding open
connections to this specific shared-identity `/exec` URL for up to minutes
under load, occasionally long enough to blow through the caller's own
6-minute execution ceiling.

## New risk this surfaces: retries may be adding fuel, not putting out the fire

`postJsonToApi_`'s 500ms retry-on-redirect and `apiCall_`'s 400ms
attempt-retry were sized for **transient, fast-resolving** hiccups (the
original 260912-1110 plan's cold-start/redirect scenario). Under this
burst's actual failure mode — a shared endpoint already stalling for
30–190s — a 400–500ms gap before firing another full request at the same
congested identity does nothing to relieve congestion and adds one more
concurrent demand to it. This is a plausible (unconfirmed, but consistent
with the data) **self-reinforcing feedback loop**: more retries under
congestion → more concurrent demand on the one shared identity → longer
stalls → more timeouts/retries. Phase 3 ("ApiClient retry backoff
hardening") should not be scoped as "add more retries" — it needs a
backoff long enough to actually be different from doing nothing (seconds,
not hundreds of milliseconds), and probably a cap on how many *automatic*
retries fire once a stall is already detected, rather than assuming retries
are free.

## The one action that stayed healthy: `apiGetSession`

avg 5.9s / max 29.5s, versus 40–100s+ averages everywhere else. Worth a
follow-up question (not answered by this data): is `getSession` on a
lighter code path, cached, or simply called earlier in each page-load
before congestion built up that session? If it's structurally lighter, no
finding. If it's early-in-sequence, that's a hint the congestion *builds up
over the session* rather than being uniformly bad from the first call —
which would matter for how Phase 1's request consolidation is sequenced.

## Updated recommendation

1. **Phase 1 (consolidation + hard client-side in-flight cap) is now more
   strongly justified**, not less — cutting how many calls one page-load
   fires directly cuts how many of these expensive multi-round-trip,
   multi-minute stalls can happen at once.
2. **Re-scope Phase 3 before writing it**: don't add retries assuming
   quick resolution. Consider: much longer backoff with jitter (seconds,
   scaled up per attempt), a hard cap on automatic retries once a stall is
   already observed (e.g. if attempt 1 itself took >10s, don't
   auto-retry — surface the Vietnamese error immediately instead of
   doubling load on a demonstrably-congested endpoint), and treating
   `apiListConfig`'s 360s kill as a concrete case a future design must
   prevent (a caller-side "give up and fail fast" threshold well under
   360s, even though `UrlFetchApp` itself has no configurable timeout —
   the deadline has to be enforced by not retrying, not by cutting off the
   fetch mid-flight, which Apps Script doesn't support).
3. Still unresolved: the exact Google-side mechanism causing multi-minute
   response latency to a shared-identity `/exec` URL under load. This data
   proves the symptom conclusively; it does not identify which Google quota
   or internal queueing behavior produces it. Not worth chasing further
   with available tools — Google doesn't expose that internals.

## Unresolved questions

- Does `apiGetSession` staying fast reflect a lighter code path, or just
  being called earliest in each page load before congestion accumulated?
- Was the 22:38:01 `apiListConfig` kill (360.6s) correlated with the
  apps/api-side 369s-stuck `doPost` from report 1 (started 22:38:53, ~52s
  later)? Time-adjacent but not simultaneous — plausibly related, not
  provably the same chain without a shared request ID (see report 1's
  "Gap in the instrument" section).
- Would a circuit-breaker-style client (stop auto-retrying once congestion
  is detected) measurably reduce total load on apps/api during a burst, or
  is the dominant driver purely the number of distinct human page-loads
  regardless of retry policy? Not answerable from static logs — would need
  a controlled re-test with retry policy as the only changed variable.
