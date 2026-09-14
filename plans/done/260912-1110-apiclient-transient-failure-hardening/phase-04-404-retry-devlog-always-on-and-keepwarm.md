---
phase: 4
title: "404 retry extension, DevLog always-on, keep-warm mitigation"
status: done
priority: P1
effort: "1.5h"
dependencies: [1, 2, 3]
---

# Phase 4: 404 retry extension, DevLog always-on, and root-cause mitigation

## Trigger

Live-captured 2026-09-14 during continued M5 testing: `apiListPermissionPresets`
failed with HTTP 404 — a NEW status code, not the 3xx this plan originally
targeted. Full evidence in
`plans/260912-1110-apiclient-transient-failure-hardening/new_request_eror_404.md`
and the Apps Script execution log the user attached to it:

```
apiCall_(listPermissionPresets): HTTP 404 (attempt 1, 26746ms) headers={...,"Server":"ESF",...}
```

## Root cause (confirmed, not hypothesized)

1. **26.7 seconds elapsed** on the single (unretried, since 4xx wasn't in the
   retry set yet) attempt before the 404 — not a fast blip.
2. **`Server: ESF`** in the response headers, and a body that is Google's own
   generic front-end error-page template (`window['ppConfig']`), not
   `apps/api`'s JSON — proof this response never reached `apps/api`'s script
   code. `apps/api`'s `doPost`/`ContentService` can only ever answer HTTP 200
   when script code actually runs (its own errors are caught into a 200 JSON
   payload — see `Router.gs`'s catch-all). So ANY non-200 from this URL,
   including this 404, is produced by Google's edge/front-controller, not a
   genuine "route not found."
3. Research (`plans/reports/researcher-260914-1345-appsscript-coldstart-mitigation.md`)
   confirms this class of failure (edge-level 3xx/404, 10-30s delay) is a
   known, community-documented Apps Script Web App phenomenon, most often
   tied to execution-time variability / post-deploy propagation — not a
   quota limit (3 concurrent users is nowhere near the 30-per-user
   concurrent-execution cap) and not something Google publishes an SLA for.

## Changes

### 1. Retry: bare 404 added to the retryable set (`apps/web/ApiClient.gs`)
`apiCall_`'s retry condition extended from `(5xx)||(3xx)` to
`(5xx)||(3xx)||(code===404)`, same bounded 2-attempt cap. Other 4xx
(401/403/429/etc.) remain unretried — no evidence yet they behave the same
way; retrying them could multiply load on a genuine client error.

### 2. DevLog now always writes, on both projects
While verifying the 404 fix, the live log showed `devNote_` (fixed in
Phase 3) correctly detecting `logged:false` — explained by the API-side
`DEV_MODE` Script Property being off. Per direct user instruction, DevLog is
meant to work in production, not only when a developer happens to have that
property set on both projects independently. Changed:
- `apps/api/Security.gs`: `logDevEvent_` no longer checks `isApiDevMode_()`
  before writing (removed; function deleted, now dead). Always attempts the
  append; still returns `true`/`false` for the real outcome (Phase 3's fix).
- `apps/web/ApiClient.gs`: `devNote_` no longer checks `isDevMode_()` before
  attempting the write.
- `apps/web/Main.gs`: `apiDevLog()` (client-callable wrapper) no longer
  short-circuits when WEB `DEV_MODE` is off.
- `apps/api/Setup.gs`: `setupDevLog()`'s doc comment/warning about needing
  API `DEV_MODE=on` removed (stale).
- `devSuffix_` (the `[DEV] HTTP ...` text appended to user-facing error
  messages) is UNCHANGED — still gated on WEB `DEV_MODE`, since that's a
  separate, deliberate "don't leak internals to production users" concern,
  not part of "DevLog should always work."

### 3. Keep-warm mitigation (root-cause reduction, not just retry-around)
Per direct user instruction to address the underlying slowness, not just
retry around it. Added to `apps/api/Security.gs`:
- `installKeepWarmTrigger()` — editor-run-once function that installs a
  5-minute time-driven trigger (removes any pre-existing one with the same
  handler first, matching the existing `installExpiryReminder` pattern).
- `keepWarmPing()` — the trigger handler; touches the real Sheets binding
  (`getSpreadsheet_().getId()`) rather than a bare no-op, wrapped in
  try/catch so a failing ping can never itself throw (Apps Script emails the
  owner on trigger failures — a keep-warm ping failing must not become its
  own noise source).
- Registered both in `Setup.gs`'s `guardSetup_()` editor-only list, matching
  `installExpiryReminder`/`checkSecretExpiry`'s existing shape.

This is a community-established mitigation for Apps Script Web Apps
(not an official Google guarantee) — see the research report for sources.
Deferred, per the research report's own ranking: an Apps Script Library
refactor (eliminates the network hop and edge dependency entirely) is the
highest-impact long-term fix but a real architectural change, out of scope
for this pass.

## Tests
- `tools/offline-tests/apiclient-scope.test.js`: added Scenario C (404
  retried transparently, same shape as Scenario A), changed the old "404
  regression guard" to use 403 instead (404 is no longer the right
  non-retried example), and updated `fetchCalls` assertions throughout
  Sections 1 and 3 to account for `devNote_`'s now-unconditional extra fetch
  call on every path that reaches a final failure.
- `tools/offline-tests/devlog-write-result-reporting.test.js`: removed the
  now-inapplicable "DEV_MODE off → no-op" assertions, replaced with
  "writes unconditionally regardless of DEV_MODE property state" — the
  write-throws / return-value-accuracy assertions from Phase 3 are
  unchanged.
- `tools/offline-tests/keep-warm-trigger.test.js` (new): `keepWarmPing`
  never throws (success or failure), the failure path is logged;
  `installKeepWarmTrigger` removes only its own prior trigger and installs
  exactly one 5-minute trigger.

Full offline suite: 20 files, 1239 assertions, all green.

## Live verification (2026-09-14, same day)
- [x] `clasp push` both `apps/web` and `apps/api` with these changes — done.
- [x] Ran `installKeepWarmTrigger()` once from the `apps/api` editor's Run
      menu — done.
- [x] Live-tested after deploy: **no 3xx/404 edge errors observed** this
      session. Per this phase's own honesty note, one clean session is
      encouraging but not proof of a permanent fix — Google publishes no
      SLA for the underlying edge/execution variability, so "reduced
      frequency" (not "eliminated, guaranteed") stays the realistic bar.
      If it recurs later, Phase 1/2/4's logging + retry are already in
      place to catch and soften it.
- [ ] DevLog-always-on not verified this session — no errors occurred to
      generate a row to check. Deferred to whenever the next real error
      (of any kind) happens; not blocking, since the response-checking
      logic itself was already offline-verified in Phase 3/4's tests.

## Next Steps
→ If the keep-warm trigger does not meaningfully reduce recurrence after a
real observation window, the next-ranked mitigation (per the research
report) is evaluating an Apps Script Library refactor to remove the network
hop entirely — a separate, larger-scoped plan, not an extension of this one.
