---
phase: 3
title: "Live verification and docs sync"
status: done
priority: P2
effort: "1h + live monitoring window"
dependencies: [1, 2]
---

# Phase 3: Live verification and docs sync

## Completion note (2026-09-14)

Deployed (`clasp push` to `apps/web`) and live-tested during M5 Phase 6
(read + write actions, 3 concurrent accounts). **No 3xx recurred** across the
session — checked both the DevLog sheet and, more importantly, Apps Script's
own Executions log directly for ERROR-severity lines (not just top-level
"Completed" status, which does not by itself rule out a caught 3xx). Since
the issue did not recur, the fast-blip vs slow-cold-start hypothesis is
**not conclusively confirmed either way** — recorded in `docs/TASKS.md` as
"did not recur during this window," per this phase's own risk-mitigation
note, not overclaimed as "root cause confirmed."

A genuinely distinct bug was found while checking the DevLog sheet for
evidence (it had zero rows despite real past errors) — investigated and
fixed; see `docs/TASKS.md`'s "DevLog silent-write" entry and
`plans/reports/debugger-260914-1305-devlog-sheet-silent-failure.md`. Per this
phase's own rule ("any code change found necessary here is logged in
TASKS.md, fixed, covered by an assertion, and the full suite re-run"), that
fix is now in place and tested (`tools/offline-tests/devlog-write-result-reporting.test.js`,
12 assertions), not folded into this plan's original 3xx scope.

The M5 plan (`plans/done/260907-1759-milestone-4-5-completion/`) is already
fully archived/signed-off independently — no update needed there.

Deferred as separate, not-yet-scoped follow-ups: a lock around
`logDevEvent_`'s sheet write (race-condition risk, no evidence it caused this
symptom), and surfacing a WEB-vs-API `DEV_MODE` mismatch to callers.

## Overview
Deploy the hardened `ApiClient.gs`, confirm the fix under real live-test
traffic (the same M5 Phase 6 session that surfaced this bug), and record the
confirmed root cause in docs — replacing inference with evidence if the issue
recurs and gets logged with a real `Location` header.

## Requirements
- Functional: `clasp push` to `apps/web` only (Phase 1+2 touch no `apps/api`
  file, no new deployment access change) — new version, note the `BUILD`
  string per existing deploy convention (`docs/SETUP.md:206`).
- Functional: during the live M5 Phase 6 pass, watch Stackdriver logs (or the
  DevLog sheet, if `devNote_`'s write succeeds) for any `HTTP 3xx` line from
  Phase 1's instrumentation.
- Non-functional: this phase produces no code changes beyond doc/log entries
  unless a NEW distinct bug is found — per this repo's rule, any code change
  found necessary here is logged in `TASKS.md`, fixed, covered by an
  assertion, and the full suite re-run (same rule Phase 6 of the M5 plan uses).

## Related Code Files
- Modify: `docs/system-architecture.md` (append a dated note under
  "Performance Characteristics" or a new "Known Issues" subsection —
  whichever exists closer to the deploy/testing section)
- Modify: `docs/TASKS.md` (log entry: symptom, root cause, fix, verification)
- Read only: `plans/260907-1759-milestone-4-5-completion/phase-06-*.md` (this
  phase's live pass can piggyback on that phase's already-scheduled live
  session rather than requiring a separate one)

## Implementation Steps
1. Deploy `apps/web` (new version) with Phase 1+2 changes.
2. During the next live-test session (ideally combined with M5 Phase 6, since
   that's the session already blocked on live deployment + phone testing),
   deliberately exercise several list/search actions (`apiListProducts`,
   `apiListOrders`, etc.) under realistic conditions, **including the
   multi-account concurrency M5 Phase 6 already requires** (admin + sales +
   warehouse simultaneously) — that concurrency is also the scenario most
   likely to exercise the write-path `waitLock(15000)` calls this plan
   deliberately left unchanged (see plan.md), so it doubles as a check on
   whether write actions show a *different* slow-pending pattern than the
   read action that first surfaced this bug. The failure was reported as
   intermittent, so a single clean pass does not prove absence; note how many
   calls were made and whether any 3xx was retried transparently (succeeded
   on attempt 2 with no user-visible error).
3. For every `console.error` line Phase 1 produces (whether or not the call
   ultimately succeeded), record in `docs/TASKS.md`: action name, HTTP code,
   `Location` header value, and elapsed-ms for each attempt. Then draw an
   explicit conclusion, not just a data dump:
   - **Elapsed-ms small (fast blip) on the failing attempt(s):** confirms the
     "transient Apps Script edge redirect" hypothesis; the retry fix is
     sufficient on its own.
   - **Elapsed-ms large (multiple seconds+) on the failing attempt(s):**
     confirms the "slow execution / cold start" hypothesis; note this
     explicitly as **not fully resolved by this plan** (per plan.md's honesty
     note) and open a new, separately scoped follow-up plan for latency
     reduction (candidates to list, not implement here: a keep-warm
     trigger, reducing `Products`/`Orders` full-sheet reads, auditing
     `waitLock(15000)` hold times under concurrency) — do not silently
     expand this plan's scope to cover it.
   - **`Location` points at an actual Google auth/consent page:** contradicts
     the `ANYONE_ANONYMOUS` config-based ruling-out; treat as a new,
     higher-priority bug (something is forcing an auth challenge despite
     anonymous access) rather than filing it under "transient."
4. Update `docs/system-architecture.md` with a short, dated note: symptom,
   root cause as actually confirmed by step 3's data (not the pre-live
   hypothesis), fix (bounded retry + header/timing logging in
   `ApiClient.gs`), and where to look if it recurs (Stackdriver
   `console.error` line from Phase 1).
5. Add one `docs/TASKS.md` entry per this repo's convention (date, symptom,
   fix, files touched, verification method, and the step-3 conclusion).
6. Cross-reference: update
   `plans/260907-1759-milestone-4-5-completion/plan.md` and its Phase 6 file
   to note this plan is resolved (fast-blip case) and/or link the new
   follow-up plan (slow-execution case) — never leave it silently ambiguous
   which one applies.

## Success Criteria
- [x] `apps/web` deployed with new `BUILD`, confirmed via the dev footer.
- [x] At least one live session run with the instrumentation active, covering
      both a read action and a write action, and including 3-account
      concurrency (piggybacking on M5 Phase 6's existing requirement).
- [x] No 3xx observed this session — `docs/TASKS.md` records this explicitly
      as "did not recur," not silently omitted; root cause (fast-blip vs
      slow-cold-start) stays unconfirmed pending a future recurrence, per
      this phase's own risk-mitigation note (not overclaimed as resolved).
- [x] `docs/system-architecture.md` carries the dated note.
- [x] M5 plan already fully archived/signed-off independently
      (`plans/done/260907-1759-milestone-4-5-completion/`) — no update
      needed; issue did not recur across a realistic test session, so
      re-scoping with a follow-up plan does not apply.
      follow-up plan (slow-execution/cold-start confirmed) — not left
      silently unresolved either way.

## Risk Assessment
| Risk | Mitigation |
|---|---|
| Issue doesn't recur during the live window → can't fully confirm hypothesis with real `Location`/timing evidence | Acceptable: the fix (bounded retry on 3xx + always-on logging) is defensive regardless of exact cause, and Phase 1's logging stays in place permanently for the next occurrence — this phase's success doesn't require reproducing the bug on demand, but the M5 sign-off note (Step 6) must say explicitly "did not recur during N calls across accounts X/Y/Z," not just "seems fine" |
| A recurred 3xx turns out to be a genuine auth/config issue, not transient infra | Re-scope as new, higher-priority bug per Step 3's third bullet; do not force-fit into this plan's "transient" framing |
| A recurred 3xx turns out to be dominated by slow execution, and the team is tempted to consider this plan's fix as "done" anyway | Explicitly blocked by the success criteria above — a slow-execution conclusion requires opening a follow-up plan before Phase 6 can be unblocked on this issue |

## Next Steps
→ None — this closes the plan. If a new distinct cause is found, open a new
plan rather than extending this one (this plan's scope is intentionally
narrow: instrument + bounded-retry the transport layer, not any specific
future auth/deployment issue).
