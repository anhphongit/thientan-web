# Live Error Burst: Concurrent-Session Quota Contention Root Cause Replaces Prior Hypothesis

**Date:** 2026-09-17 12:10
**Severity:** High (affects multi-user reliability, affects live testing)
**Component:** ApiClient.gs, ViewsAdmin.html, ViewsOrders.html, apps/api Execute-as-Me architecture
**Status:** PLANNED — root cause identified, 5-phase mitigation plan created

---

## What Happened

Live testing on 2026-09-17 captured an HTTP 302/404/non-JSON error burst (11:01–11:04 UTC) across `getSession`, `listConfig`, `listUsers`, `listOrderCreators`, `listPermissionPresets`, `listOrders`, `statsRevenue`. Unlike the prior incident (2026-09-12) which affected a single account's cold start, this burst hit **two different real user accounts** (`ttwadmin170826@gmail.com`, `anhdung08spkt@gmail.com`) nearly simultaneously. New data point, same symptom class.

---

## The Brutal Truth

The prior plan (`plans/done/260912-1110-apiclient-transient-failure-hardening`) diagnosed the symptom correctly (Google ESF edge returning generic error pages instead of reaching script code, confirmed via `Server: ESF` headers and 10–30s latency) but its root cause reasoning was **fundamentally flawed.**

**The flaw:** It reasoned "not a quota issue… 3 concurrent users nowhere near 30-per-user limit." This reasoning assumes per-user execution quotas. But `apps/api` is deployed `Execute as: Me` (`IDENTITY.md` §6c), so **all employees' requests share a single owner identity's execution context.** The relevant quota is not "30 per user", it's the shared identity's actual ceiling — and 2 users + 2-3 concurrent calls per user easily reaches that ceiling in seconds.

That prior plan shipped a fix sized for occasional cold-start blips (2-attempt retry, 400ms gap, 5-minute keep-warm ping). The burst on 2026-09-17 shows that's insufficient when the shared identity is under real concurrent pressure from multiple real users.

---

## Technical Details

**Confirmed via code inspection (no subagents):**

1. **Client-side parallel fan-out multiplies concurrent hits on the shared identity:**
   - `ViewsAdmin.html:render()` (line 215) fires 3 concurrent `apiCall_` round trips instantly: `listPermissionPresets`, `listVisibleFieldGroups`, `listUsers`.
   - `ViewsOrders.html` (lines 674, 700) fires 2 concurrent calls: `apiListOrderCreators`, `apiListOrders`.
   - Each is a full `UrlFetchApp` round trip from `apps/web` to `apps/api`, each doing real Sheet I/O (seconds-scale, not instant).

2. **The shared identity becomes the bottleneck:**
   - One user opening Admin tab = 3 simultaneous executions in the shared owner context.
   - Two users active in the same 3 minutes = 6–10 concurrent executions queued on Google's infrastructure.
   - Once enough executions back up, Google's ESF edge (per the prior plan's own confirmed finding) drops subsequent requests without reaching script code, returning 302/404 errors instead.

3. **The existing 400ms/2-attempt retry cannot recover:**
   - Sized for a single fast blip (cold start, ~200ms delay).
   - Under multi-user pressure, the failure zone persists for several seconds across multiple retries.
   - No retry logic can outrun shared infrastructure saturation.

**Evidence from logs:** `plans/dev_error_log.md` shows 7 different API endpoints failing across both accounts in a tight 3-minute window — consistent with multiple concurrent executions from multiple users exceeding the shared context's capacity, not isolated cold-start delays.

---

## What We Tried

Code inspection only — this is a planning session, no implementation. Traced the exact call sites in `ViewsAdmin.html` and `ViewsOrders.html` where parallel fan-out happens (confirmed the lines and method names).

---

## Root Cause Analysis

**Why the prior plan's reasoning failed:**

1. **Architectural misdirection.** The two-deployment architecture (`apps/web` Execute-as-User, `apps/api` Execute-as-Me) was documented as a necessary trade-off to hold the private Sheet (`IDENTITY.md` §6c). Its execution-quota cost was named as "version drift" risk (§8.3) but shared-quota contention was not explicitly named — this session surfaced it as a second, equally real risk of the same architectural choice.

2. **Single-account blindness.** The 2026-09-12 incident happened during solo testing; the burst pattern naturally looked like a single-user cold start. Multi-user live testing on 2026-09-17 revealed that concurrency from parallel view-opens + parallel users compounds the problem into a different severity tier.

3. **Client-side behavior invisible to server-side investigation.** The prior plan examined `apps/api` code and Google's failure surface (ESF headers). It had no visibility into how many concurrent `UrlFetchApp` calls the client fires, or in what order.

---

## Lessons Learned

1. **Shared execution identity + parallel client calls = unexpected saturation.** A shared owner context cannot sustain the concurrency load of parallel per-view fan-out × multiple simultaneous users, even at small user counts. The fix is to sequence client-side calls (zero API surface change) before attempting to harden the retry layer further.

2. **Single-user evidence does not predict multi-user behavior.** A cold-start blip in isolation testing looked like a timing issue fixable with retry backoff. Two users active simultaneously changed the problem from "occasional slow execution" to "shared infrastructure saturation" — a different failure mode requiring a different fix.

3. **Naming the cost of architectural choices matters.** `Execute as: Me` was chosen for a valid reason (accessing the private Sheet). Naming only "version drift" as its cost missed "shared quota contention" — both are real, both should be documented upfront. Future architectural decisions should enumerate all known costs, not just the obvious ones.

---

## Next Steps

**Plan created:** `plans/260917-1210-concurrent-session-live-errors/` (5 phases, P1):

1. **Phase 1 — Client fan-out sequencing:** Stagger `ViewsAdmin.html` and `ViewsOrders.html` calls instead of firing them in parallel. Zero API surface change, zero backend dependency — pure client-side wiring refactor.

2. **Phase 2 — ApiClient retry backoff hardening:** Extend from 2→3 attempts, replace fixed 400ms gap with exponential backoff + jitter (following Apps Script patterns used elsewhere like DevSeed.gs). Gives transient failures better odds to self-heal once client-side pressure is reduced.

3. **Phase 3 — Retry UX parity:** Add retry button to Admin and Orders error states (Stats view already has one). Make failed operations user-recoverable without page reload.

4. **Phase 4 — Live error-burst alerting:** New trigger (reusing the `installExpiryReminder`/`installKeepWarmTrigger` pattern in `apps/api/Security.gs`) that emails the admin when burst patterns re-occur. Next burst is not discovered days later from a manually-exported log; it emails immediately.

5. **Phase 5 — Documentation sync:** Update `system-architecture.md` Known Issues, `IDENTITY.md` §8.3 risk table, `TASKS.md` to reflect shared-quota contention as a named cost of the Execute-as-Me architecture.

**Deliberately out of scope** (documented in plan.md, not forgotten):
- Combining each view's parallel calls into one server-side bootstrap API action (bigger blast radius, revisit if Phase 1 insufficient).
- Splitting the shared `LockService.getScriptLock()` used by all write paths (real latent risk, not evidenced as this burst's cause).
- Apps Script Library refactor (still the highest-impact long-term fix, still larger-scoped).

---

## Unresolved Questions

None at planning stage. All phases are blocked on approval to proceed with implementation.

---

## Revision (2026-09-17, same day) — user review corrected the plan's scope and root cause

The user read this journal and pushed back on two points, both valid:

1. **The fix was scoped to 2 views.** The fan-out pattern (`T.call()` used
   identically everywhere) is systemic, not local to Admin/Orders — a
   per-view patch would need re-applying by hand to every current and
   future view.
2. **"2 users failed today; at 30 users this could approach 100% failure."**
   Client-side staggering alone doesn't put a hard ceiling on total
   concurrent demand — it only reshapes one employee's own burst.

Re-reading this project's OWN prior research
(`plans/reports/researcher-260914-1345-appsscript-coldstart-mitigation.md`,
Finding 4) surfaced the real number underneath both points: Google caps
concurrent executions at **30 per identity**. `apps/api` runs
`Execute as: Me`, so that 30-slot budget is shared by every employee, not
per-employee. The 2026-09-14 research report itself dismissed quota risk
("3 users... well under 30-per-user") by silently assuming per-user
budgets — the SAME mistake this session's own first draft repeated one day
later. Two independent analyses mis-applied the same already-documented
quota table.

**Plan restructured** (now 6 phases, `plans/260917-1210-concurrent-session-live-errors/`):
- Phase 1 moved from "stagger 2 views" to a **global concurrency cap inside
  `App.html`'s shared `call()` helper** — every view gets the protection
  automatically, including ones added later, plus trimming the worst
  per-view fan-out at the source.
- **New Phase 2**: a **fail-fast admission-control queue in `apps/api`'s
  `doPost`** (`CacheService`-backed counter, not a spin-wait — spin-waiting
  inside an execution would hold a scarce concurrent-execution slot longer,
  making the 30-slot ceiling worse, not better). This is the literal
  "sequence queue" the user asked for.
- Documented explicitly, so it isn't oversold: the admission queue only
  governs executions that already got dispatched by Google's edge — a
  request refused before reaching script code (the actual observed failure
  mode once 30 slots are full) can't be rescued by code inside `doPost`.
  Reducing total demand (Phase 1) is the only lever for that.
- **Escape Hatch section added to plan.md**: the only way to remove the
  shared-30-slot ceiling entirely is to stop having every request execute
  as one identity (Workspace / Option C, or a verified Option A) —
  documented as a real, larger, deliberately-deferred option, not silently
  dropped. Also corrected a claim in the 2026-09-14 research report: an
  Apps Script Library refactor's benefit is removing the network hop
  (latency/edge-reliability), NOT verified to escape the shared quota —
  that needs its own research spike before being relied on for scaling.

**Lesson added:** a hard vendor quota, once found, should be checked against
every prior "not a quota issue" conclusion in the same codebase, not just
the current incident — the same wrong assumption (per-user budgets under a
shared-identity architecture) was made twice, one day apart, by two
different analysis passes over the same numbers.

---

## Revision 2 (2026-09-17, same day) — clarified the queue design and evaluated a per-employee-spreadsheet idea

Two more rounds of user review, both purely analytical (no plan changes
requested until the end):

**Q: "your admission queue is just a different error message, not a real
queue."** Correct, and worth stating precisely why: Apps Script has no
persistent server process, so a true "hold requests and process them
one-by-one, push the answer back later" queue cannot exist on this
platform at all — not impractical, structurally impossible (no daemon, no
push/webhook back into an already-finished HTTP response). The only place
a literal FIFO queue can live is the browser tab, which does persist for a
session. Landed on: Phase 1's client-side queue set to strict
one-at-a-time (not "2 at once"), Phase 2 stays fail-fast (never
spin-wait, since waiting would hold a scarce execution slot even longer),
and `apps/api/ExportJob.gs`'s existing submit/poll pattern is named as the
one legitimate "come back later" mechanism this platform supports, for if
a specific slow/write-locked action ever needs it.

**Q: "how do we give each employee their own quota, free, no Workspace?"**
The user's own proposed answer — clone a filtered spreadsheet into each
employee's Drive, sync it two-way with the master, stop the owner from
using the web app — has one genuinely good idea (filtering once at
clone-time is safer than raw Sheet-sharing) but doesn't achieve its goal:
quota is billed to whoever EXECUTES the script, not to which spreadsheet
file is touched, and the proposal keeps `apps/api` as `Execute as: Me` — so
none of the sync machinery changes whose 30-slot budget gets consumed.
Writes also can't be safely deferred to periodic sync without real
data-corruption risk (the existing locked sequential order-ID allocator
exists for exactly this reason). Recorded as "considered and rejected" in
plan.md with full reasoning, so it isn't silently dropped or re-proposed
without context later — the only two real candidates for actual
per-employee quota isolation remain Option A (partial: halves executions
per action, doesn't remove the ceiling) and Option C/Workspace (the only
path that could remove it, still needing its own dedicated design pass).

**Plan updated** (`plans/260917-1210-concurrent-session-live-errors/`):
Phase 1's queue cap changed from 2 to 1; Phase 2 gained an explicit
"why not a real queue" explanation citing this exact conversation; plan.md
gained a full "Considered and Rejected" section for the spreadsheet-clone
idea.
