---
type: analysis
plan: 260917-1210-concurrent-session-live-errors
created: '2026-09-18T11:45:00+07:00'
input: error_log_from_17_sep_22_36/{dev_log,request_receipt,execution_log,web_execution_log}.md
  — 10-concurrent-tab live re-test, 11:15–11:26, first test run since the
  reqId extension (phase-00) shipped
severity: HIGH — likely-active duplicate-write risk, not just a confidence question
---

# Analysis: exact reqId proof — server-side work completes fine; the RESPONSE never reliably reaches the caller, and every observed failure was executed 2-3 times

**This is the first EXACT-MATCH (not inferred) evidence in this plan.**
Every prior report reconciled apps/api's and apps/web's logs by timestamp
proximity or architectural inference. With `reqId` now threaded through
both projects, this test's 8 client-visible failures are each traced to
their EXACT server-side receipt(s) — not "a receipt for the same action
nearby," the SAME UUID.

## Headline finding: apps/api was never the problem

```
apps/api-side, this whole 11-minute test:
  doPost count: 159, avg duration 2.15s, max 5.05s
  Status breakdown: 114 Completed, 45 Running (still in-flight at export) — 0 Failed
  Peak concurrent executions: 12 (never near 30)
```

Every single one of the 8 `dev_log.md` client-visible failures has its
`reqId` present in `request_receipt.md`, and the matching `doPost`
execution(s) at that exact timestamp are fast (1.3–5s) and `Completed`.
**apps/api received, processed, and completed every one of these requests
successfully and quickly.** There is no slow lock, no stuck execution, no
admission refusal, nothing wrong on the server side in this test.

## The actual failure: response delivery, not request admission or processing

Traced two of the eight through `web_execution_log.md`'s Cloud Logs
(reqId-tagged, from the phase-00 extension):

```
apiCall_(listUsers) start reqId=a3d0342f... @ 11:17:28
  → attempt 1: HTTP 404 after 33006ms (!) @ 11:18:01
  → attempt 2: THROWS "Exception: Address unavailable: https://script.google.com/.../exec"
    after 60865ms (!) @ 11:19:02
  → apiListUsers failed: "Không kết nối được máy chủ dữ liệu..."

apiCall_(listOrders) start reqId=1971530d... @ 11:16:58
  → attempt 1: HTTP 404 after 107037ms (nearly 2 minutes!) @ 11:18:45
  → attempt 2: THROWS "Address unavailable" after 19260ms @ 11:19:04
  → devNote_'s own diagnostic-logging fetch ALSO failed (non-JSON response)
  → apiListOrders failed: "Không kết nối được máy chủ dữ liệu..."
```

Both `reqId`s' receipts show the underlying `listUsers`/`listOrders` action
completed in ~2 seconds on apps/api. The client waited 33–107 **seconds**
per attempt before getting anything back, and what came back was either a
bare 404 (Google's generic edge error page) or a total connection failure
("Address unavailable" — a lower-level failure than an HTTP error; the
client couldn't even establish/complete the connection). **The work was
done. The answer was lost or never delivered.** This is a Google Frontend/
edge response-delivery reliability problem specific to this anonymous,
cross-project Web App call pattern, not a compute-capacity problem on
either end.

## The finding that matters most: every failure = 2-3 server-side executions of the SAME action

```
reqId       receipts (all same action, same reqId)
45709892 →  2   (11:16:05, 11:16:34)
a7bb4e57 →  2   (11:16:08, 11:16:53)
a3d0342f →  2   (11:17:29, 11:18:02)
1971530d →  2   (11:16:59, 11:18:46)
67152450 →  2   (11:20:35, 11:21:07)
671899e5 →  2   (11:21:46, 11:22:57)
0e9641ad →  2   (11:21:37, 11:23:23)
09922abb →  3   (11:22:43, 11:23:18, 11:24:15)
```

**8 for 8.** Every single client-visible failure this test corresponds to
apps/api executing the SAME logical action 2 or 3 times — traced exactly
through `apps/web/ApiClient.gs`'s own retry structure: `apiCall_`'s outer
2-attempt loop (line 45), each of which can ALSO trigger
`postJsonToApi_`'s own internal one-shot retry (line 182, when a redirect
gets followed as GET) — up to 4 physical POSTs possible per logical call,
and this test shows 2-3 of them actually landing at doPost, every time.

**All 8 of this test's failures happened to be read actions**
(`listOrders`×6, `listUsers`×1, `statsRevenue`×1) — so no data was
duplicated THIS time. But `apiCall_`'s retry logic does not distinguish
action type. If a `createOrder`, `updateOrder`, `deleteProduct`, or any
other write action hits this exact same failure mode — proven here to be
a real, live, repeatable pattern, not a hypothetical — **the write would
execute 2-3 times server-side while the user sees only a generic
connection-failed message and has no way to know their action already
succeeded.** This is a plausible active data-integrity risk with today's
shipped code (which already retries up to 2 attempts), not something
Phase 3 would introduce — Phase 3's current draft (`phase-03-apiclient-
retry-backoff-hardening.md`) would make it WORSE by adding a 3rd attempt
without addressing this.

## Secondary signal: `devNote_`'s own diagnostic call also failed silently

`1971530d`'s trace shows `devNote_: DevLog row NOT written ... (logDevEvent_
likely threw)` — the very mechanism meant to record this failure for later
analysis also hit the same response-delivery unreliability. Confirms the
problem is systemic to ALL calls hitting the shared `/exec` URL during
congestion, not specific to the main action calls.

## Severity comparison to the two prior live tests

| Metric | 22:36 test (report 2248/2316) | This test (11:15, 10 tabs) |
|---|---|---|
| apps/web `apiXxx` calls | 112 | 170 |
| >30s | 62 (55%) | 8 (5%) |
| >60s | 52 (46%) | 2 (1%) |
| Client-visible failures | 21 | 8 |
| apps/api peak concurrency | 11 | 12 |

This test was measurably LESS severe by volume, but produced the most
important finding yet because `reqId` finally made EXACT correlation
possible — severity in raw numbers isn't the point of this test; precision
of diagnosis is.

## Root cause, revised again (4th correction in this plan)

Not primarily a concurrent-execution-count or admission-control problem —
apps/api's own throughput was healthy throughout (peak 12, avg 2.15s, zero
failures). The mechanism is: **Google's edge, for this project's
`ANYONE_ANONYMOUS` cross-project Web App call, sometimes fails to relay an
already-successful backend response back to the calling script within any
reasonable time (33–107+ seconds observed), or fails the connection
outright ("Address unavailable")** — decoupled from how loaded apps/api
itself is. `apiCall_`'s existing retry-on-404/3xx/5xx logic, reasonable
under the old "maybe it just needs a moment" assumption, is now proven to
re-execute the already-completed action rather than recover a lost
response — adding server load (worsening the very congestion causing the
edge's own delivery problems) without fixing anything, and creating a real
duplicate-write risk for any action beyond a read.

## Recommended next steps, in order

1. **Do not increase `apiCall_`'s retry count (Phase 3's current draft:
   2→3 attempts) until write actions have an idempotency guard.** Making
   this worse before making it safe is the wrong order.
2. **Add a reqId-based idempotency check for write actions** in
   `apps/api/Router.gs` — a short-TTL `CacheService` entry keyed by
   `reqId` (same primitive Phase 0 already uses for receipts): if a write
   action's `reqId` was already processed, return the cached prior result
   instead of re-running the handler. Read actions don't need this
   (harmless to re-run), so scope it to actions that mutate data
   (`createOrder`, `updateOrder`, `deleteOrder`, `createProduct`,
   `updateProduct`, `deleteProduct`, `createUser`, `updateUser`,
   `updateConfig`, `approveOrder`, `rejectOrder`, `requestApprove`,
   `setDraftOrder`, `backupNow` — the full write-action list in
   `getActions_()`).
3. **Audit whether this has already happened in production** — search
   existing DevLog history (before this test) for repeated `reqId`-less
   (pre-phase-0) failures on write actions around the SAME actor/timestamp
   pattern (can't use `reqId` retroactively, but a burst of identical
   `HTTP 404`/`fetch failed` on the same write action within the same
   ~1-2 minute window from the same actor is the same signature). Out of
   scope for this analysis (no Sheet access here) — flagged as a follow-up
   for whoever has DevLog/Orders sheet access.
4. Phase 1 (request consolidation) and the response-delivery-reliability
   framing both still argue for reducing how many calls hit the shared
   `/exec` URL concurrently — unchanged recommendation.
5. Phase 2's admission-control queue is now even less clearly useful than
   the 22:48 report already suggested: apps/api's OWN throughput was never
   the bottleneck in either live test. An admission gate inside apps/api
   cannot fix a problem that occurs AFTER apps/api has already finished
   successfully.

## Unresolved questions

- Is "Address unavailable" a distinct Google-side failure mode from the
  bare-404/302 pattern, or the same underlying cause manifesting
  differently under different load? Only 2 instances this test — not
  enough to characterize independently.
- Has a write action ever hit this failure mode in production? Needs
  DevLog/Orders sheet access to check historical records.
- Does Google's response-delivery reliability for `ANYONE_ANONYMOUS` Web
  Apps improve, degrade, or stay flat as concurrent CALLING scripts (not
  concurrent apps/api executions) increase? This test had 10 browser tabs
  → 10 concurrent apps/web executions → all calling the same apps/api URL;
  worth testing whether the caller count or the apps/api execution count
  correlates better with failure rate, since this test shows apps/api's
  own execution count was never stressed.
