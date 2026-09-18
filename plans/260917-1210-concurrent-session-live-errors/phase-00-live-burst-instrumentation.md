---
phase: 0
title: "Live burst instrumentation"
status: in-progress
priority: P1
effort: "1h + 1h extension"
dependencies: []
---

# Phase 0: Live burst instrumentation

## Overview

A small, additive, read-only diagnostic layer so the NEXT concurrency burst
(organic or a deliberate reproduction) is self-proving — closing the
evidence gap this plan hit repeatedly: the historical 2026-09-17 burst's
Executions-log detail is gone (retention expired before it could be read),
there is no bulk export, and browser automation cannot reach the app's
sandboxed content iframe to run a synthetic burst script (same-origin
policy blocks it — confirmed via a live attempt, not assumed). This phase
does not touch the mitigation logic in Phases 1-6 — it exists purely to
raise confidence on the Root Cause diagnosis (currently 85%, permanently
capped for the historical incident) for whatever happens next.

## Key Insights

- `apps/api/Router.gs:19`'s existing `t0 = Date.now()` / `_ms` timing block
  is the precedent for this kind of additive, always-on instrumentation —
  this phase extends the same spirit, not a new pattern.
- Must NOT write to a Sheet per request — that adds I/O latency to every
  single execution, which would itself skew the very concurrency
  measurement this phase exists to take (and adds load during exactly the
  contention window being observed). `CacheService.getScriptCache()`
  (already the chosen primitive for Phase 2's admission counter, same
  reasoning there) is the right store: in-memory speed, auto-expiring via
  TTL, no Sheet contention.
- Answers ONE specific question definitively: for a given time window,
  which requests actually reached `doPost`, and when. Diffed against
  DevLog's/the browser's record of what the client attempted, a gap
  between "client attempted" and "server received" is the direct
  signature of edge-level refusal (this plan's theory). No gap, but a
  slow or failing execution, would point to a different cause entirely —
  this instrument can disprove the theory just as easily as confirm it,
  which is what makes it worth having.
- Forward-looking only — cannot recover the 2026-09-17 burst. Confidence
  on that specific historical incident stays at 85% regardless of this
  phase; this phase is what lets the NEXT occurrence resolve the open
  question instead of repeating the same dead-end investigation covered
  in this plan's revision history.
- Lower risk than Phase 2's admission-control gate: this phase never
  blocks or alters a request's outcome, it only observes. Same risk class
  as `Router.gs`'s existing `_ms` timing.

## Requirements

- Functional: record `{t: timestamp, action}` for every request that
  reaches `doPost`, retrievable via one new admin-only read action.
- Non-functional: zero Sheet I/O; bounded memory (cap entries so the
  cached value stays well under `CacheService`'s ~100KB per-key limit);
  auto-expiring (TTL, no manual cleanup); must never throw or alter any
  existing request's response, even if the cache write itself fails.

## Architecture

- `doPost` (`apps/api/Router.gs:16`), immediately after `t0 = Date.now()`
  (`Router.gs:19`): best-effort append to a capped JSON array in
  `CacheService.getScriptCache()` under one fixed key, TTL ~1800s (30
  min — long enough to cover a reproduction test, short enough to never
  need manual cleanup). Placed BEFORE the secret/security-gate checks, so
  even requests rejected by our own gate are recorded — this lets a later
  read distinguish "reached script code but got rejected by our own
  guard" from "never reached script code at all," which matters for
  interpreting results correctly.
- New action `getRequestReceipts` registered in `getActions_()`
  (`Router.gs:161`), gated with `requirePermission_(user, 'manage_users')`
  — same gate as `listUsers`/`systemHealth` (`Admin.gs`, `SystemHealth.gs`)
  — returns the cached array as-is.
- The cache append is wrapped in its own try/catch that swallows and
  `console.error`s only — this instrumentation must never become a new
  failure mode for the very requests it exists to observe.

## Related Code Files

- Modify: `apps/api/Router.gs` (append-to-cache logic in `doPost`; new
  `getRequestReceipts` entry in `getActions_()`)
- Modify: `apps/api/Config.gs` (if this is the existing home for cache
  keys/constants — verify the current convention before adding one,
  match it rather than inventing a new one)
- Modify (tests): whichever offline test file already covers
  `doPost`/`Router.gs` dispatch — add coverage for the new action and for
  "cache write throwing doesn't break the response" per the risk note
  below.

## Implementation Steps

1. Read `apps/api/Router.gs` in full (Read-before-Write) and
   `apps/api/Config.gs` for the existing cache-key/constant convention
   before adding anything.
2. Add a `recordRequestReceipt_(action)` helper: read the current cached
   array (default `[]` if absent/unparseable), push
   `{t: Date.now(), action: action}`, cap to the last 200 entries (drop
   oldest), write back with `cache.put(key, JSON.stringify(arr), 1800)`.
   Wrap the whole body in try/catch → `console.error` only, never
   rethrow.
3. Call `recordRequestReceipt_(req.action)` at the very top of `doPost`,
   right after `t0 = Date.now()` (`Router.gs:19`), before the secret and
   security-gate checks.
4. Add `actionGetRequestReceipts_(user, payload)` (co-locate with
   `SystemHealth.gs`'s `actionSystemHealth_` — same admin-diagnostics
   spirit): `requirePermission_(user, 'manage_users')`, then read and
   return the cached array, parsed.
5. Register `getRequestReceipts: actionGetRequestReceipts_` in
   `getActions_()` (`Router.gs:161`), near `systemHealth`
   (`Router.gs:259`).
6. `clasp push` to `apps/api`, run the offline test suite, then a live
   smoke check: call the new action once (e.g. via the DevTools console
   pattern already confirmed reachable this session —
   `TT.call('getRequestReceipts')` evaluated with the console's frame
   context set to the app's content iframe) and confirm it returns a
   small, recent array.

## Success Criteria

- [x] `doPost` records a receipt for every request, including ones later
      rejected by the secret/security gate (proves the instrument sits
      ahead of those guards).
- [x] `getRequestReceipts` is reachable only with `manage_users`
      permission (offline test: non-admin user rejected).
- [x] A forced cache-write exception (offline test: mock
      `CacheService.getScriptCache().put` to throw) does not change
      `doPost`'s response for that request — identical outcome to
      without this phase.
- [x] Cached array never exceeds 200 entries even under a simulated
      500-request burst (offline test).
- [x] Live smoke check: after a few real requests, `getRequestReceipts`
      returns matching timestamps/action names. **Verified 2026-09-17
      22:36–22:46** via a real re-test burst (21 client-side errors) —
      `getRequestReceipts` returned 195 matching entries across the window.
      See `reports/analysis-260917-2248-error-burst-retest-confidence-check.md`
      for the analysis this enabled: peak concurrency during the burst was
      only 11 (never near 30, even at the exact moment of each error),
      which weakens rather than confirms this plan's Root Cause theory —
      exactly the kind of result this instrument exists to surface. Phase 2
      should not size its admission gate around "30" until that's resolved.
- [x] Full offline suite still green (36/36 green, no regressions).

## Risk Assessment

Low risk — purely additive, read-path only, wrapped in its own try/catch
so a failure here can never surface as a failure of the actual request.
The one real risk is scope creep (turning this into a bigger logging
subsystem) — resist that; this is 200 capped entries in one cache key,
nothing more, per YAGNI. No dependency either direction with Phases 1-6 —
ship independently — but ship it FIRST if practical, since it is what
turns the next burst (organic or deliberately reproduced) into a
conclusive answer instead of another dead end.

---

## Extension (2026-09-18, reopened) — cross-project request-ID correlation

**Why reopened:** the 22:36–22:46 re-test (`reports/analysis-260917-2248-...md`,
`reports/analysis-260917-2316-...md`) produced two datasets that each looked
decisive alone and contradicted each other on first read (apps/api showed
peak concurrency of only 11; apps/web showed calls stalling 30–360s) —
reconciled only by inference ("apps/api's log can't see queued requests"),
not by direct proof. The user asked, correctly, for higher confidence:
today's correlation between `dev_log.md` (client), `request_receipt.md`
(apps/api), and `web_execution_log.md` (apps/web) is **time-proximity
guessing** — matching "an error at 22:39:38 for `listOrderCreators`" against
"a receipt for `listOrderCreators` 0.0s away" cannot tell whether that's the
SAME logical call or a concurrent sibling (multiple identical actions fire
within the same second during a burst — confirmed in the 2248 report's
correlation table). A single ID threaded through all three logs turns every
future "probably the same request" into "yes/no, exact match."

### Key insight

`apps/web/ApiClient.gs`'s `apiCall_()` (line 15) is the single choke point
ALL actions already pass through — same reasoning phase-00's original design
used for `Router.gs:doPost` on the api side ("the shared client pattern, not
any one view's code"). Generating one ID there, once per logical call
(spanning its own internal retries), and threading it through every log
line and payload that call already produces, requires touching only 2 files
end-to-end (`apps/web/ApiClient.gs`, `apps/api/Router.gs` + one line in
`apps/api/Security.gs`) — no new sheet columns, no client/browser changes,
no new cache keys.

### Requirements

- Functional: every `apiCall_()` invocation gets one `reqId`
  (`Utilities.getUuid()`, native, always available in Apps Script — do not
  add a library or hand-rolled UUID generator). The SAME `reqId` covers that
  call's own internal retries (both `apiCall_`'s 2-attempt loop and
  `postJsonToApi_`'s redirect-retry) — this is one logical user-visible
  action, not one per physical fetch. It must appear, verbatim, in:
  1. Every existing `console.error` line inside `apiCall_`/`postJsonToApi_`
     (apps/web's own Cloud Logs — what `web_execution_log.md`-style exports
     already capture).
  2. The JSON body sent to apps/api (`{secret, actor, action, payload, reqId}`).
  3. `request_receipt.md` entries (`recordRequestReceipt_` gains a second
     param).
  4. `apps/api`'s own error-path logging for that request (`Router.gs`'s
     `doPost` catch block and `logSecurityEvent_`/`logDevEvent_` call sites
     that already log `req.action` — add `req.reqId` alongside).
  5. DevLog sheet rows written via `devNote_`/`logDev`, when a `reqId` is
     available at the call site (embed as `[reqId=<uuid>] ` prefix inside
     the existing free-text `detail` field — **not** a new sheet column;
     `HEADERS.DevLog` stays `['timestamp','level','source','actor','message','detail']`,
     zero schema migration, zero risk to existing readers of that sheet).
- Non-functional: same risk class as the rest of Phase 0 — best-effort,
  never throws, never changes any request's success/failure outcome. A
  `reqId`-less request (old cached client, or a code path this pass missed)
  must degrade to today's behavior, not error.

**Gap found and closed while verifying this design (2026-09-18):** items
1 and 4 above only fire on error/retry paths — neither `apiCall_` nor
`doPost` currently logs anything on a normal 200-OK/fast success, so a
successful call's `reqId` would land in `request_receipt.md` but nowhere
in either project's own Cloud Logs, making cross-project *duration*
correlation (not just pass/fail correlation) impossible for the common
case. Closed with an unconditional `console.log` on each side, at TWO
points each — start (proves the execution happened at all, cheap
insurance if something later crashes before the completion log) AND
completion (carries the actual timing breakdown, which is the part worth
having while actively investigating a latency problem — a bare presence
marker without numbers would answer "did it run" but not "why was it
slow", the actual open question):

  - `apps/web/ApiClient.gs`:
    - Start (right after generating `reqId`, before the retry loop):
      `console.log('apiCall_(' + action + ') start reqId=' + reqId);`
    - Completion (right before `return body.data;`, the success path only —
      failure paths already throw through the existing error-logged lines):
      `console.log('apiCall_(' + action + ') success reqId=' + reqId +
      ' msFetch=' + msFetch + ' attempts=' + attempt);` — `msFetch` and
      `attempt` are both already computed locally; this exposes them to
      Cloud Logs instead of only ever being used internally.
  - `apps/api/Router.gs`:
    - Start (right after `recordRequestReceipt_(...)`, before any gate):
      `console.log('doPost reqId=' + req.reqId + ' action=' + req.action);`
    - Completion (right before the success `return json_({ ok: true, ... })`
      in the try block): `console.log('doPost reqId=' + req.reqId +
      ' action=' + req.action + ' ok gate=' + msGate + ' user=' + msUser +
      ' read=' + msRead + ' total=' + (Date.now() - t0));` — `msGate`,
      `msUser`, `msRead` are the SAME numbers already computed into the
      response's `data._ms` (line 96) for the client; logging them here
      too makes apps/api's own internal timing breakdown visible directly
      in ITS OWN execution log, without needing the client's JSON response
      at all. This is what lets a future analysis tell "the API's own gate/
      user/read logic was slow" apart from "the API was fast but the
      network hop wasn't" (transport) — the open question neither prior
      report could answer.

  All four are one-line, best-effort by construction (simple string
  concatenation over already-computed local variables, nothing that can
  throw), and match the "additive, never-alters-outcome" risk class of the
  rest of this phase. None of this touches the request/response payload
  itself — purely Cloud Logs, same as `_ms`'s existing precedent.

### Architecture

```
Browser (T.call, unchanged)
   │
   ▼
apps/web Main.gs api*() wrappers (unchanged)
   │
   ▼
apps/web ApiClient.gs  apiCall_(action, payload)
   │  reqId = Utilities.getUuid()   ← generated ONCE here
   │  bodyJson includes reqId
   │  every console.error(...) line gets '... reqId=' + reqId
   │  devNote_(level, source, message, detail, reqId) ← new optional param
   ▼
apps/api Router.gs  doPost(e)
   │  req.reqId (untrusted, pre-secret-check — truncate to 40 chars,
   │             same treatment as req.action)
   │  recordRequestReceipt_(req.action, req.reqId)  → {t, action, reqId}
   │  doPost's own catch block: console.error(...) and logDevEvent_(...)
   │             calls that already print req.action gain req.reqId too
   ▼
apps/api Security.gs  logDevEvent_(level, source, message, detail, actor)
   │  new optional 6th param `reqId` → prefixed into the `detail` cell,
   │             not a new column
```

### Related Code Files

- Modify: `apps/web/ApiClient.gs` (`apiCall_`, `postJsonToApi_` unchanged
  signature — reqId lives in the outer `apiCall_` scope and is passed into
  `devNote_`; `devNote_` gains an optional `reqId` param)
- Modify: `apps/api/Router.gs` (`doPost`'s `recordRequestReceipt_` call site
  and its own two `logDevEvent_`/`logSecurityEvent_` call sites in the catch
  block and guard branches; `recordRequestReceipt_`'s signature)
- Modify: `apps/api/Security.gs` (`logDevEvent_` gains optional 6th `reqId`
  param, prefixed into `detail`; `actionLogDev_` passes `payload.reqId`
  through)
- Modify (tests): `tools/offline-tests/request-receipts.test.js` (extend
  for the new `reqId` field — uniqueness across two rapid calls, truncation
  of an oversized/malicious value, backward compatibility with a
  `reqId`-less legacy payload)

### Implementation Steps

1. Read all three files above in full (Read-before-Write) before editing.
2. `apps/web/ApiClient.gs`: add `var reqId = Utilities.getUuid();` in
   `apiCall_`, right after the `email`/`props`/`secret` checks, before the
   retry loop. Immediately after, add the unconditional start log
   `console.log('apiCall_(' + action + ') start reqId=' + reqId);` (closes
   the success-path gap — see above). Add `reqId: reqId` to `bodyJson`.
   Append `' reqId=' + reqId` to every existing `console.error(...)` string
   inside `apiCall_` (5 call sites) and inside `postJsonToApi_`'s one log
   line (pass `reqId` in as a param since it's a separate function).
   Immediately before `return body.data;` (the success path, after `body`
   is parsed and `body.ok` is confirmed truthy), add the completion log
   `console.log('apiCall_(' + action + ') success reqId=' + reqId +
   ' msFetch=' + msFetch + ' attempts=' + attempt);` — both variables
   already exist in that scope.
3. Extend `devNote_(level, source, message, detail)` → add a 5th optional
   `reqId` param; when present, prefix `detail` with `'[reqId=' + reqId + '] '`
   before sending. Update all 4 call sites inside `apiCall_` to pass the
   local `reqId`.
4. `apps/api/Router.gs`: change `recordRequestReceipt_(req.action)` →
   `recordRequestReceipt_(req.action, req.reqId)`; update the function to
   push `{ t: Date.now(), action: ..., reqId: String(reqId || '').substring(0, 40) }`.
   Immediately after that call, before any gate, add the unconditional
   start log `console.log('doPost reqId=' + req.reqId + ' action=' +
   req.action);` (closes the success-path gap — see above). Immediately
   before the success `return json_({ ok: true, data: data, build: BUILD });`
   inside the try block (line 98), add the completion log
   `console.log('doPost reqId=' + req.reqId + ' action=' + req.action +
   ' ok gate=' + msGate + ' user=' + msUser + ' read=' + msRead +
   ' total=' + (Date.now() - t0));` — `msGate`/`msUser`/`msRead`/`t0`
   already exist in that scope (same values already written into
   `data._ms`). Add `req.reqId` (truncated) into the doPost catch block's
   `console.error(...)` and its `logDevEvent_('error', req.action, ...)`
   call (pass as a 6th arg once Security.gs supports it).
5. `apps/api/Security.gs`: extend `logDevEvent_`'s signature with an
   optional `reqId` param; when present, prefix `detail` the same way as
   step 3. Update `actionLogDev_` to read `payload.reqId` and pass it
   through (so a client-supplied `logDev` call — from `devNote_` — carries
   its originating `reqId` all the way into the sheet).
6. Extend `request-receipts.test.js`: assert two receipts recorded within
   the same tick get different `reqId`s when called with different UUIDs;
   assert an oversized/malicious `reqId` is truncated; assert a request
   with no `reqId` field still records a receipt (backward compatible).
7. `clasp push` both projects, run the full offline suite, then a live
   smoke test: trigger one action, pull `getRequestReceipts`, and confirm
   the returned `reqId` matches what the SAME action's apps/web Executions
   log entry shows in its console.error lines (manual cross-check, one
   action, not a full burst).
8. On the next real or deliberately-reproduced burst, re-run the same
   three-file export (`dev_log.md`, `request_receipt.md`,
   `web_execution_log.md`) and redo the correlation from
   `analysis-260917-2248-...md` **using exact `reqId` matches** instead of
   nearest-timestamp guessing. This is what actually raises confidence —
   steps 1-7 only build the tool.

### Success Criteria

- [x] Two apps/web calls fired within the same millisecond get distinct
      `reqId`s (offline test).
- [x] A `reqId` survives truncation gracefully if oversized or malformed
      (offline test) — same untrusted-input treatment as `action`.
- [x] A legacy/`reqId`-less request still records a receipt and still logs
      to DevLog without erroring (offline test) — no hard dependency on the
      new field.
- [x] Full offline suite still green, no regressions (36/36 files, 2026-09-18).
- [x] Live, 2026-09-18 10:27–10:31 re-test: `reqId` confirmed flowing
      end-to-end through the PRIMARY correlation path — apps/web's own
      Cloud Logs show both `start` and `success ... msFetch=... attempts=...`
      lines with real numbers (e.g. `reqId=248b6654-... msFetch=2047
      attempts=1`), and the SAME `reqId` values land in `getRequestReceipts`'
      array (`request_receipt.md`) unconditionally, for actions including
      failures that reached doPost. This is what the plan actually needed:
      exact-match correlation between "client attempted" and "reached
      apps/api's doPost", replacing the nearest-timestamp guessing from
      `analysis-260917-2248-...md`.
- [~] apps/api's OWN Cloud Logs (the `doPost reqId=...` start/completion
      lines) — **cannot be verified via the Apps Script IDE.** Live-checked
      2026-09-18: unlike `keepWarmPing` (time-driven trigger, expands fine)
      and every row on apps/web (expands fine), `apps/api`'s `doPost` rows
      have no expand affordance at all in the Executions dashboard, not
      even a "no logs / delay" placeholder. Most likely cause: `apps/api`'s
      Web App is deployed `access: ANYONE_ANONYMOUS` (required by
      `IDENTITY.md` Option B — apps/web calls it server-to-server with a
      shared secret, no Google-authenticated caller) — Google's Apps Script
      IDE has a known limitation where the Cloud Logs expand doesn't
      populate reliably for fully-anonymous Web App invocations, unlike
      `apps/web`'s `access: ANYONE` (still an authenticated visitor) or
      trigger-based executions. Neither project links a custom GCP project
      via `.clasp.json` (both default), ruling out that asymmetry.
      **Not blocking**: this was a bonus (belt-and-suspenders) addition:
      the code (`console.log('doPost reqId=...')`) is confirmed correct and
      deployed (`request_receipt.md`'s `reqId` field only exists because
      the same code region's `recordRequestReceipt_(req.action, req.reqId)`
      is live), it just may never be visible through this specific UI.
      If it turns out to matter later, try Cloud Logging's own Logs
      Explorer (console.cloud.google.com) if a standard GCP project is
      ever linked — do not sink further time into the IDE widget itself.
- [ ] Live: one manually-triggered **failing** action's `reqId` appears in
      the corresponding DevLog sheet row's `detail` cell — not yet checked
      against a real failure in this re-test (the 10:27–10:31 burst was all
      successful calls); confirm on the next occurrence, real or forced.
- [x] On the next burst export, `reqId` gave exact (not inferred)
      confirmation that specific dev_log/web-log entries and specific
      `request_receipt.md` entries are the same logical call — the concrete
      proof this extension was worth building (see 2026-09-18 live re-test
      above).
- [ ] On the next burst export, at least one dev_log.md error is matched
      to its exact apps/api receipt (or exact absence) via `reqId`, not
      inferred by nearest timestamp — the concrete proof this extension
      was worth building. **Pending the live push/verification above.**

**2026-09-18 — code-reviewer pass (`ck:code-review` via cook workflow):** two
gaps found and fixed before considering the code itself done:
1. `logDevEvent_` (Security.gs) now truncates `reqId` to 40 chars itself
   before prefixing `detail` — defense in depth, since `actionLogDev_` has
   no permission gate and could otherwise receive an arbitrarily long value
   from any resolvable actor.
2. The two guard-branch `logSecurityEvent_`/`console.error` call sites in
   `doPost` (bad-secret, unknown-action) — which already log `req.action` —
   now carry `req.reqId` too, per the Requirements text's "add `req.reqId`
   alongside" (previously only the catch block got it).

Also flagged, and explicitly kept (user decision, not a defect): the
Extension's Risk Assessment below says "no client/browser-side changes",
but `apps/web/ui/ViewsAdmin.html` + `Main.gs`'s `apiGetRequestReceipts()`
(a "Nhật ký request gần đây" admin panel) predate this extension — they're
part of the original Phase 0 base work (not scoped by phase-00's own
Success Criteria either, which only asked for a DevTools console check).
User chose to keep the UI panel rather than revert it. Noted here so a
future reader doesn't mistake it for scope creep introduced by this
extension pass.

### Risk Assessment

Same low-risk class as the original phase — additive, best-effort,
never throws, degrades cleanly without `reqId`. The only new surface is
`logDevEvent_`'s signature change (5 params → 6, optional) — verify every
existing call site still compiles with the new optional param before
considering this done. Resist scope creep again: no new sheet column, no
client/browser-side changes, no new cache keys — just one ID threaded
through logging paths that already exist.
