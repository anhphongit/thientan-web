---
title: Fix concurrent-session live errors (HTTP 302/404/non-JSON)
description: >-
  Live-test error burst traced to a hard Google Apps Script quota (30 concurrent
  executions per identity) shared by ALL employees via apps/api's owner-identity
  deployment, amplified by client-side parallel request fan-out in every view
status: pending
priority: P1
branch: main
tags:
  - reliability
  - apps-script
  - live-test
  - concurrency
  - quota
blockedBy: []
blocks: []
created: '2026-09-17T05:13:49.161Z'
createdBy: 'ck:plan'
source: skill
---

# Fix concurrent-session live errors (HTTP 302/404/non-JSON)

## Overview

`plans/dev_error_log.md` shows a burst of `apiCall_` failures on 2026-09-17
between 11:01–11:04 (`getSession`, `listConfig`, `listUsers`,
`listOrderCreators`, `listPermissionPresets`, `listOrders`, `statsRevenue`)
across **two different real accounts** (`ttwadmin170826@gmail.com`,
`anhdung08spkt@gmail.com`) almost simultaneously — new evidence on top of
the prior `plans/done/260912-1110-apiclient-transient-failure-hardening`
investigation, which diagnosed the same symptom class (bare HTTP 302/404/
non-JSON from Google's edge, `Server: ESF`, confirmed via 10–30s attempt
latency that the request never reached `apps/api`'s script code) but only
had single-session cold-start evidence, and shipped a fix sized for that: a
2-attempt/400ms retry and a keep-warm ping.

**Revision (this version):** the first version of this plan under-scoped the
fix to two views and treated the cause as fuzzy "edge congestion." The
user's review correctly pushed back on both counts. Re-reading this
project's OWN prior research
(`plans/reports/researcher-260914-1345-appsscript-coldstart-mitigation.md`,
Finding 4) surfaces a **hard, documented Google quota that both prior
analyses under-weighted**:

| Limit | Value | Who it applies to here |
|---|---|---|
| Concurrent executions per user | **30** | Every `apps/api` execution runs `Execute as: Me` (`docs/IDENTITY.md` §6c) — so this "per user" budget is the **one shared owner identity**, not each employee individually |
| Concurrent executions per script | 1,000 | Not the binding constraint here |

The prior research report's own Finding 4 dismissed quota risk with "three
concurrent users... well under the 30-per-user limit" — that reasoning
silently assumed each employee has their own 30-slot budget. **They don't.**
Every employee's every request counts against the SAME 30 slots, because
they all execute as the owner. This is not a new theory; it is this
project's own already-recorded data, mis-applied twice.

## ✅ Final root cause & solution strategy (2026-09-18, consolidated re-plan)

**Read this section first.** Everything below it (the "Correction" log, the
original "Root Cause" section, "What Will and Won't Actually Fix This") is
the audit trail of HOW this understanding was reached — kept for honesty
and so no one re-derives a wrong theory this plan already ruled out. This
section is the current truth, and what Phases 1-4 below are now built for.

### What's actually happening

`apps/api` must run under one shared owner identity (`Execute as: Me` +
anonymous access) because a consumer-Gmail owner can't share private-Sheet
access with consumer-Gmail employees any other way without a paid
Google Workspace domain (`IDENTITY.md`) — **not in scope to change; budget
doesn't allow it, confirmed by the user 2026-09-18.**

Two live tests, each with exact (not inferred) request-ID correlation
across both projects' logs, proved:

1. **`apps/api` itself is never the bottleneck.** Peak concurrent
   executions observed: 11-12, against a documented ceiling of 30. Average
   request time ~2.15s. Zero failed or slow executions server-side, in
   either test — including during the failures.
2. **The failure is Google's edge failing to deliver an already-successful
   response.** `apps/api` finishes processing in ~2s; `apps/web`'s
   `UrlFetchApp.fetch()` call to it sometimes doesn't get anything back for
   30-190+ seconds, and when it does, it's a generic Google error (bare
   404, a 302 pointing back to the same `/exec` URL rather than the
   documented `googleusercontent.com/macros/echo` redirect target, or an
   outright `Address unavailable` connection failure) — never apps/api's
   own JSON.
3. **This is not a publicly documented Google limitation.** Researched
   directly, including a deep-dive into the most authoritative public
   resource on Apps Script Web Apps (`reports/researcher-260918-1219-...md`
   and its extension) — no official quota, doc, or even community report
   describes this exact symptom. The closest official fact: consumer and
   Workspace accounts have an IDENTICAL 30-concurrent-execution quota, so
   that was never the mechanism either.
4. **Retries currently cause duplicate server-side execution.** Every one
   of 8 observed failures in the latest live test shows the SAME action
   executed 2-3 times server-side (proven via the request-ID appearing 2-3
   times in `apps/api`'s receipt log, each a fast, successful execution).
   All 8 were reads (harmless). A write action hitting this same,
   now-proven-real failure mode would silently duplicate — this is a live
   risk with the code as already shipped, not a hypothetical.

### What this plan is now optimizing for, in priority order

Per explicit direction (2026-09-18): **correctness first, then speed of
failure, then frequency of failure** — because this project cannot fix
Google's underlying reliability gap, only work around it.

1. **Never duplicate a write, never leave the user unsure in a way that
   causes them to duplicate it themselves.** Non-negotiable — see the new
   Phase 2.
2. **Fail fast and honestly when a call is going to fail**, instead of
   leaving the UI frozen for up to 3+ minutes — see Phase 4's expanded
   scope.
3. **Reduce how often the failure happens at all**, by cutting concurrent
   load on the shared identity — Phase 1 (unchanged, already correctly
   scoped for this).

### What changed in the phase plan, and why

- **Phase 2 is repurposed** from "server-side admission-control queue" to
  **"write-action idempotency guard."** The admission-control design was
  built on the original 30-slot-ceiling theory; both live tests disprove
  that apps/api ever approaches that ceiling, so an admission gate would
  add real complexity and risk for a problem that doesn't occur at that
  layer. Cut per YAGNI, per explicit "best confidence" direction — do not
  build it. The idempotency guard is what actually addresses the risk this
  plan found: it reuses the SAME `CacheService`/request-ID infrastructure
  Phase 0 already built, just for deduplication instead of admission.
- **Phase 3 is redesigned**, not just "add a blocking prerequisite" as the
  interim note said — see its file for the full retry-policy rethink (stop
  retrying blindly, don't auto-retry after a call already hung a long
  time, coordinate with Phase 2's idempotency key).
- **Phase 4 gains a new, load-bearing requirement**: a client-side (browser)
  timeout around `google.script.run` calls, so the UI stops waiting and
  shows a clear failure state after a bounded time — even though the
  underlying server call may keep running regardless (neither
  `UrlFetchApp` nor `google.script.run` support cancellation). This is the
  literal mechanism for "fail fast."
- **Phase 1 is unchanged** — already correctly scoped (client-side FIFO
  queue, cap=1, universal fan-out consolidation) for reducing concurrent
  load regardless of which theory of the underlying mechanism is correct.
- **Phases 5 (alerting) and 6 (docs)** are unchanged, lower priority,
  unaffected by the mechanism correction.

### The one design detail that took real thought: retries must survive a MANUAL click too

Phase 0's `reqId` is generated fresh inside `apps/web/ApiClient.gs`'s
`apiCall_()` on every invocation. That correctly covers `apiCall_`'s own
internal automatic retries (same ID reused across attempts) — but Phase
4's retry BUTTON calls the whole action again from the browser, which
would go through `apiCall_()` again and get a **new** `reqId`. A write
action that actually succeeded server-side on the first (failed-to-report)
attempt, followed by the user clicking "Thử lại", would NOT be caught by
an idempotency guard keyed only on that fresh ID — defeating the whole
point. **Fix, specified in Phase 2**: the stable ID must be generated at
the true "one user attempt" boundary (the browser, at the moment the user
clicks Save/Submit) and passed DOWN through the whole chain, reused by
BOTH automatic and manual retries of that same attempt; only a genuinely
new user action (editing the form again, clicking Save again) gets a new
ID. This is a real, necessary extension beyond what Phase 0 built, not
something already covered.

### Honest limits — what this does NOT fix

- Google's underlying edge reliability gap itself is outside this
  project's control without a Workspace/architecture change, which is
  explicitly out of scope (budget). Employees will still occasionally see
  a failed action.
- The idempotency guard prevents a write from happening TWICE. It cannot
  always tell the client with certainty that a write DID happen once, if
  the response never arrives at all — the UI's honest fallback in that
  exhausted-retry case is "we're not sure, check before trying again,"
  not a false-confidence "it definitely failed."
- None of this reduces Google's own response latency when the edge issue
  occurs — it bounds how long the USER waits (via the client-side
  timeout), not how long the underlying execution actually takes.

### Confidence

High on the diagnosis (exact request-ID proof, not inference, across two
independent live tests). High on Phase 1/2/4 being the correct priority
order given the stated constraints. Medium on exact tuning values (queue
cap, timeout thresholds) — stated as starting points to observe and adjust
from, not as precisely-derived optimums; Google's own failure rate under
load is not something this project can measure or control directly.

---

## ⚠️ Correction — 2026-09-17 22:48, then 23:16 — the mechanism, revised twice

**22:48** (`reports/analysis-260917-2248-error-burst-retest-confidence-check.md`):
Phase 0's instrumentation was used on a real re-test burst (22:36–22:46, 21
client errors, 195 request receipts, full apps/api Executions export). Peak
concurrent executions on the **apps/api side** was only **11**, never near
the 30-slot ceiling this section blames, including at the exact instant of
each error (1–9). Looked like a disconfirmation of the whole theory.

**23:16** (`reports/analysis-260917-2316-web-side-execution-log-latency-finding.md`):
the *other* side of the same burst — **apps/web's own** Executions log —
changes that reading. 55% of apps/web's 112 `apiXxx` calls to apps/api took
>30s; one (`apiListConfig`) ran 360.6s and was **force-killed by Google for
exceeding the 6-minute execution cap**. Traced through `apps/web/ApiClient.gs`:
the app's own intentional retry sleeps total ≤900ms, so the other
29–360 seconds per call is `UrlFetchApp.fetch()` itself blocked waiting on
Google's edge for a response. **This reconciles both findings**: apps/api's
Executions dashboard only records dispatched executions, so a request stuck
queueing at Google's frontend for 100+ seconds before ever being dispatched
(or bounced) is invisible to it — low observed concurrency there does not
mean low demand, it means most of the demand was stuck at a layer that
dashboard can't see.

**Net: confidence in "shared owner identity is the bottleneck" goes back
up — the specific mechanism is corrected, not the framing.** It is not
"30 concurrent script executions visible in a dashboard"; it is "Google's
frontend holds connections to this shared-identity `/exec` URL open for up
to minutes under load." Do not size Phase 2's admission gate around a
concurrency count of "30" — that metric doesn't capture the actual
bottleneck. Phase 3's retry design also needs rethinking: sub-second
retry delays add load to an endpoint already stalling for tens of
seconds, a plausible (unconfirmed) feedback loop rather than a fix — see
the 23:16 report's "New risk" section before writing that phase.

**2026-09-18 — Phase 0 reopened.** Both reports above only reconcile by
*inference* ("apps/api's log can't see queued requests") — not by direct
proof that a specific client-visible error and a specific apps/api receipt
(or lack of one) are the same request. User asked for higher confidence
before proceeding further, so Phase 0 is reopened to add a `reqId`
threaded through apps/web ↔ apps/api ↔ DevLog (see phase-00's new
"Extension" section) — turning the next burst's correlation from
nearest-timestamp guessing into exact-match/exact-absence. Phases 1-6
stay as scoped; nothing here changes them, it only raises confidence in
which of them matters most before committing further implementation
effort to Phase 2/3's designs.

**2026-09-18, 11:15–11:26 re-test (10 concurrent tabs) — exact proof, and a
new HIGH-severity risk.** `reports/analysis-260918-1134-exact-reqid-proof-duplicate-execution-risk.md`.
First test with exact (not inferred) correlation. Result: **apps/api was
never the problem** — 159 doPost executions, avg 2.15s, peak concurrency
12, zero failures, zero slow executions. Every one of this test's 8
client-visible failures traces via `reqId` to a receipt showing the
request WAS received and processed fast and successfully — the failure is
specifically in Google's edge failing to relay the already-completed
response back to apps/web (33–107+ second waits, or an outright
"Address unavailable" connection failure), not in request admission or
apps/api's own performance.

**HIGH-severity discovery: every one of the 8 failures shows apps/api
executed the SAME action 2-3 times** (traced via `reqId` appearing 2-3
times in `request_receipt.md` — `apiCall_`'s 2-attempt retry plus
`postJsonToApi_`'s own internal redirect-retry, each landing at doPost
independently). All 8 were read actions this test (harmless to re-run),
but `apiCall_`'s retry logic doesn't distinguish action type — a write
action (`createOrder`, `updateOrder`, etc.) hitting this same proven
failure mode would execute 2-3 times server-side while the user sees only
"connection failed." **This is a risk with TODAY's shipped code (2
attempts already), not something Phase 3 introduces — Phase 3's current
draft would make it worse (3 attempts) without addressing it.** Do not
implement Phase 3's retry-count increase before adding a `reqId`-based
idempotency guard for write actions in `apps/api/Router.gs` (same
`CacheService` primitive Phase 0 already uses) — see the report's
"Recommended next steps" for the full write-action list needing this.

**2026-09-18, 10:27–10:31 re-test — the correlation tool works.** `reqId`
confirmed flowing end-to-end: same UUIDs appear in apps/web's own Cloud
Logs (with real `msFetch`/`attempts` numbers) and in `getRequestReceipts`'
array, unconditionally. This is the primary thing Phase 0's reopening was
for, and it's proven. One bonus item (apps/api's OWN Cloud Logs showing the
`doPost reqId=...` line) turned out not to be viewable through the Apps
Script IDE at all for this deployment — most likely because `apps/api`'s
Web App is `access: ANYONE_ANONYMOUS` (required by `IDENTITY.md` Option B),
and Google's IDE has a known gap showing Cloud Logs for anonymous-access
Web App executions specifically (`keepWarmPing` and everything on apps/web
expand fine; only apps/api's `doPost` rows don't, at all — not a "forgot to
click expand" issue, confirmed live). Not blocking: `request_receipt.md`
already carries `reqId` unconditionally and doesn't depend on this UI.
Filed as a fifth entry in this plan's now-established "real, unfixable
tooling wall" pattern (see phase-00's Overview for the first four) — not
worth further time. Next real gap to close: verify `reqId` also lands in a
DevLog row on an actual **failing** call (not yet observed — this re-test
had no failures).

## Root Cause (confirmed, not re-guessed)

1. **The shared identity turns a per-user quota into a whole-team quota**
   (architectural, required by `IDENTITY.md` Option B for private-Sheet
   access — not something this plan can remove without a different identity
   architecture; see "Escape Hatch" below).
2. **Every view's client code multiplies how many slots one employee's own
   page-load consumes at once — and this is NOT confined to Admin/Orders.**
   Confirmed by direct code read across the whole `apps/web/ui/` fan-out
   pattern:
   - `ViewsAdmin.html:render()` (line 215) — 3 concurrent calls
     (`listUsers`, `listPermissionPresets`, `listVisibleFieldGroups`).
   - `ViewsOrders.html`'s render path (line ~674/~700) — 2 concurrent calls
     (`apiListOrderCreators`, `apiListOrders`).
   - Every OTHER view (`ViewsStats.html`, `ViewsInventory.html`, and any
     future view) that follows the same `T.call()`-per-need pattern is
     equally exposed — the risk is in the SHARED CLIENT PATTERN
     (`App.html`'s `call()` helper, used identically everywhere), not in any
     one view's code. Phase 1 below fixes it at that shared layer for
     exactly this reason: a per-view patch (the first version's mistake)
     would need to be re-applied by hand to every current and future view.
3. **The arithmetic the user asked about, made concrete:** with k≈2–3
   parallel calls per employee per tab-open, the whole team hits the shared
   30-slot ceiling once roughly `floor(30/k)` ≈ **10–15 employees are mid
   page-load at the same moment** — not 30. Scaling the user base toward 30
   concurrent employees, at today's fan-out shape, means the ceiling is
   probably already being brushed with far fewer real people than 30, and
   gets worse, not linearly but combinatorially, as more tabs/views each add
   their own k. This matches the user's "closer to 100%" worry and is why a
   client-side stagger alone (this plan's first draft) is not a sufficient
   fix at that scale — it reduces k's peak burst shape but does not put a
   hard ceiling on total concurrent demand.

## What Will and Won't Actually Fix This

Being honest about what each layer can and cannot do, because two different
technical mechanisms are in play and conflating them was this plan's own
first-draft mistake:

- **Reducing how many requests are ever sent concurrently** (Phase 1: fewer
  round trips per view + a hard global cap on one browser's own in-flight
  requests) is the ONLY lever that reduces how many executions compete for
  the 30 shared slots in the first place. This is the primary fix.
- **A server-side admission gate inside `apps/api`** (Phase 2 — the "queue"
  the user asked for) helps a DIFFERENT part of the problem: once a request
  IS dispatched to script execution, it bounds how many of those executions
  do real, slow Sheet I/O at once, which (per the prior plan's own
  "execution-time variability" hypothesis) is plausibly what makes an
  individual execution slow enough to trip Google's edge into serving a
  generic error page instead of waiting for it. **What it cannot do:** a
  request that Google's edge refuses to dispatch to script code at all,
  once 30 executions are already in flight, never reaches this gate — the
  gate only helps the requests that get a slot, it cannot manufacture slots
  that don't exist. So Phase 2 is a real, worthwhile second layer, not a
  substitute for Phase 1.
- **Retry/backoff (Phase 3)** is the safety net underneath both — it is what
  turns "this request got refused" into "the user never notices," but only
  when a slot frees up before the client's retry budget runs out. It cannot
  create capacity either.

**The honest ceiling:** even with all three layers, 30 concurrent executions
per owner identity is a hard Google-side number this plan cannot raise. If
this business's real growth plan is "30 people actively using the app at
the same literal moment, routinely," that is at or past the wall this
architecture can absorb no matter how well client and server code behave —
see "Escape Hatch" below for what actually removes the ceiling versus what
only pushes it further out.

## Escape Hatch (documented, not built here)

The only way to stop ALL employees sharing one 30-slot budget is to stop
having their requests all execute as one identity. From `docs/IDENTITY.md`:

- **Option C (Google Workspace)** — each employee's `Execute as: Me` request
  would run as themselves once the private-Sheet-access problem that forced
  Option B onto this project (§2 of `IDENTITY.md`) no longer exists. Each
  employee gets their OWN 30-slot budget. `IDENTITY.md` §8.5 already
  recommends pricing this first; this plan adds a second, concurrency-based
  reason to revisit that recommendation, not just the identity-token
  awkwardness.
- **Option A (verified Google Sign-In token)** — same effect: one deployment,
  `Execute as: Me`, but the SERVER verifies each visitor's own token rather
  than needing a second deployment — this still runs as the OWNER for Sheet
  access, so it does **not** remove the shared-30-slot ceiling. Correction
  to the earlier researcher report's Option-3 framing: an Apps Script
  Library import of `apps/api` into `apps/web` does **not** verifiably
  escape this ceiling either — Apps Script's documented behavior is that
  code still needs to run under an identity authorized to open the private
  Sheet, and nothing in Google's library documentation was found (in this
  session's investigation) confirming a library call is billed against the
  CALLING script's execution quota rather than the owner's. **This needs a
  dedicated verification spike before being relied on as a scaling fix** —
  it is listed in `plans/done/260912-1110-…` as "highest-impact long-term
  fix" on the strength of removing the network hop (real, and worth
  revisiting for latency/edge-reliability reasons), not on a verified claim
  about quota attribution. Do not repeat that conflation in future planning.
- **Not pursued in this plan**: both require real setup work (Cloud OAuth
  client + verification review, or a paid Workspace migration with an
  organizational email-address change — `IDENTITY.md` §8.4) disproportionate
  to fixing today's live-test errors. Named here so the next time someone
  asks "can we just fully remove this risk," the answer and its cost are
  already written down instead of re-derived.

## Phases

Phase 0 has no dependency on Phases 1-6 (or vice versa) — it's a
diagnostic instrument, not a mitigation. Ship it independently, ideally
first: added 2026-09-17 after four separate attempts (Executions-log
export, Executions-log detail read, multi-tab browser burst, sandboxed-
iframe JS injection) all confirmed real, un-fixable tooling/retention
walls rather than producing evidence — see journal for the full trail.
Historical confidence on the 2026-09-17 burst stays at 85%, permanently;
Phase 0 exists so the next occurrence doesn't hit the same dead end.

| Phase | Name | Status |
|-------|------|--------|
| 0 | [Live burst instrumentation](./phase-00-live-burst-instrumentation.md) | Extension coded, tested (36/36 offline), reviewed — live push/smoke-test pending (user) |
| 1 | [Universal request consolidation](./phase-01-universal-request-consolidation.md) | Pending |
| 2 | [Write-action idempotency guard](./phase-02-server-side-admission-control-queue.md) | Pending — repurposed 2026-09-18, see plan.md's consolidated section |
| 3 | [ApiClient retry policy redesign](./phase-03-apiclient-retry-backoff-hardening.md) | Pending — redesigned 2026-09-18 |
| 4 | [Fail-fast UX + retry parity](./phase-04-retry-ux-parity.md) | Pending — expanded 2026-09-18 |
| 5 | [Live error-burst alerting](./phase-05-live-error-burst-alerting.md) | Pending |
| 6 | [Documentation sync](./phase-06-documentation-sync.md) | Pending |

## Dependencies

- Builds on `plans/done/260912-1110-apiclient-transient-failure-hardening`
  (retry classification, DevLog always-on, keep-warm trigger) — does not
  revert or duplicate it, corrects its quota reasoning with evidence already
  in this repo (`plans/reports/researcher-260914-1345-…`) and extends its
  mitigations with a systemic, whole-app scope instead of a per-feature one.
- No other active plan touches `apps/web/ApiClient.gs`, `apps/web/ui/App.html`,
  any `apps/web/ui/Views*.html`, or `apps/api/Security.gs`/`Router.gs` — no
  file-ownership conflict.

## Deliberately Out of Scope (documented, not forgotten)

- **Splitting the shared `LockService.getScriptLock()` used identically by
  `withOrderLock_`, `withUserLock_`, `withConfigLock_`, `withProductLock_`**
  (`Orders.gs:1587`, `Admin.gs:402`, `AdminConfig.gs:340`, `Products.gs:376`)
  into independent per-resource locks. Confirmed real (an admin saving
  Config can make an employee's order-create wait up to 15s, and vice
  versa) but **not evidenced as the cause of the observed failures** — every
  failing request in the log is a read-only action that failed before any
  script code (hence before any lock) ran. Phase 5's alerting will surface
  this if `ORDER_LOCK_BUSY`/`USER_LOCK_BUSY`/etc. messages start appearing
  in DevLog; treat that as the trigger for a dedicated follow-up plan, not a
  reason to add it here speculatively.
- **Option A / Option C identity changes** — see "Escape Hatch" above.
- **Verifying Apps Script Library quota attribution** — a real, bounded
  research question (does a library call count against the caller's quota
  or the library owner's?) worth answering before the business scales much
  past today's team, but a research spike, not an implementation phase; not
  started here.
