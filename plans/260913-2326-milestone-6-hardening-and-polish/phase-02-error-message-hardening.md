---
phase: 2
title: "Error message hardening"
status: pending
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 2: Error message hardening

## Overview

Base scope: "Error message review; no stack traces reach users" (`docs/MILESTONES.md` M6). Not
speculative — a codebase inventory (2026-09-13) confirmed a real leak chain where a caught
exception's raw `.message` reaches the browser verbatim instead of a generic Vietnamese message.
This phase closes that chain and adds a regression test so it can't silently reopen.

**Blocked by `260912-1110-apiclient-transient-failure-hardening`** (project scope, see plan.md) —
that plan changes `apps/web/ApiClient.gs`'s retry classification in the same function neighborhood
(~lines 75-135) as this phase's line-109 fix. **Do not start this phase's `ApiClient.gs` edit until
that plan has landed**; re-read the file fresh at that point since line numbers will have shifted.

**Red-team fix folded into this revision** (2026-09-14 review, see plan.md's Red Team Review
section): the original design (a `.isUserFacing` marker set only by a new `userError_()` wrapper)
was rejected during red team because it silently requires migrating **~88 existing
`throw new Error(MSG.X)` sites** (grep-verified: `grep -rn "throw new Error(MSG\." apps/api/*.gs
apps/web/*.gs | wc -l` → 88), across 10 files this phase never listed as touched — leaving every
un-migrated site's already-correct message quietly replaced with `MSG.GENERIC` the moment the
top-level catch switched over. **Replaced with a content-based check** (see Architecture) that
needs zero changes to any existing throw site.

## Key Insights

- **Confirmed leak chain** (codebase inventory, 2026-09-13 — re-verify line numbers before editing,
  the apiclient plan will have shifted some of them; red team confirmed `SheetsRepo.gs`'s rethrow
  is actually at line 67, not 61 as originally cited):
  - `apps/api/Router.gs:97` — `doPost`'s top-level catch returns `(err && err.message) ||
    MSG.GENERIC` directly in the JSON response.
  - `apps/api/ExportJob.gs:240` / `:441` — `job.error`/`job.deliveryError` set from raw
    `err.message`, then surfaced verbatim by `actionExportJobStatus_` (`ExportJob.gs:101,103`) in
    its API response.
  - `apps/web/ApiClient.gs:109` — `if (!body.ok) throw new Error(body.error || MSG.GENERIC);` is
    the pass-through point: whatever raw text the two bullets above sent gets re-thrown as-is.
  - `apps/web/Main.gs:27` — `handle_()`'s catch (used by all ~34 `api*` functions in this file,
    grep-confirmed) returns `(err && err.message) ? err.message : MSG.GENERIC` to the browser.
  - `apps/web/Main.gs:69` — inside `apiGetSession()`, the scope-missing/denied branch sets
    `message: err.message` directly into the denied-screen response. **Handle with care** — see
    the dedicated Key Insight below; this site is NOT a plain candidate for blanket genericization.
  - `apps/api/SheetsRepo.gs:67` (`getSpreadsheet_`) — rethrows the *original* `err` unchanged when
    its own permission-error regex doesn't match, meaning that raw error still flows into
    `Router.gs`'s generic catch above and leaks the same way.
- **Not leaks, leave alone:** `apps/web/ApiClient.gs`'s `devSuffix_()`/`devNote_()` append raw
  detail but no-op unless `isDevMode_()` is true — intentionally dev-gated. Confirm `DEV_MODE` is
  off in the production deployment as part of this phase's checklist. Every other `catch (err)`
  across `Orders.gs`/`Products.gs`/`AdminConfig.gs`/`Setup.gs`/`Security.gs` only logs via
  `console.error(...)` and never returns the raw detail — no change needed there.
- **Why `err.message` is a real leak in Apps Script specifically**
  (`plans/reports/researcher-260913-2326-mobile-responsive-error-handling.md`): GAS runtime
  exceptions can include sheet/range names, formula text, or Drive file IDs in `.message` — more
  identifying than a typical stack-trace-scrubbed web framework.
- **Corrected design (red team Finding 3): content-based safety check, not a marker requiring
  migration.** Every one of the ~88 existing `MSG.*`-throwing sites already throws
  `new Error(MSG.SOME_KEY)`, whose `.message` is *exactly* one of the ~85 known string values
  already enumerated in `apps/api/Config.gs`'s and `apps/web/Config.gs`'s `MSG` objects. So instead
  of requiring every throw site to opt in via a new wrapper, build a **Set of all known `MSG.*`
  values** once (`Object.keys(MSG).map(function (k) { return MSG[k]; })` for each app's own `MSG`
  object) and check membership: if `err.message` is exactly one of those known values, it's safe to
  show verbatim (it was always an intentional, already-reviewed message); if not, it's an
  *unexpected* runtime exception — log the real detail server-side only, return `MSG.GENERIC`
  instead. **Zero existing throw sites need to change** — this is purely a change to the small
  number of top-level catches that currently forward raw text.
- **`apps/web/Main.gs:69` needs special handling, not blanket genericization (red team Finding 9).**
  `Main.gs:65` computes `scopeMissing = String(err.message || '').indexOf(MSG.SCOPE_NOT_GRANTED)
  === 0` — the message can be `MSG.SCOPE_NOT_GRANTED` *plus appended detail* (a prefix match, not
  exact-value match), because this is a deliberately-constructed message from `apps/web`'s own
  controlled code (the security gate refusing a non-`getSession` action for missing OAuth scope,
  per the 2026-09-06 comment at `Main.gs:56-63`), not a raw pass-through of an arbitrary internal
  GAS exception. This specific branch is **excluded** from the generic content-based check above —
  it keeps its current behavior unchanged, because it was never the leak; the risk here is a *new*
  fix accidentally flattening it to `MSG.GENERIC` since a prefix-matched string with appended detail
  won't pass an *exact*-value Set-membership test. `tools/offline-tests/apiclient-scope.test.js`
  (grep-confirmed: asserts `threw.message.indexOf(sandbox.MSG.SCOPE_NOT_GRANTED) === 0` at line 90)
  is the test that already pins this contract — it was never mentioned in this phase's original
  draft and must be run and diffed against, not just `orders-permissions.test.js`/
  `orders-approvestatus.test.js` (which, grep-confirmed, contain zero assertions on `.message`/
  `error` content and would not have caught a regression here).
- **No unified test runner exists** (red team Finding 8) — use `tools/offline-tests/run-all.js`
  (created in Phase 1) to run everything, not an assumed "full offline suite" command.

## Requirements

- Functional:
  - Every one of the 5 confirmed leak sites (excluding `Main.gs:69`, handled separately) stops
    forwarding raw `err.message`/`err.stack`/`String(err)` to the browser unless the message is an
    exact match against a known `MSG.*` value. Full technical detail continues to reach
    `console.error`/`Logger.log` exactly as today.
  - `Main.gs:69`'s scope-missing branch is explicitly left unchanged by this phase (see Key
    Insights) — confirmed via a passing `apiclient-scope.test.js`, not modified.
  - `apps/api/SheetsRepo.gs:67`'s rethrow path is updated so an unmatched permission-error case
    also degrades to a safe generic message at the point it's caught upstream (via the same
    content-based check), not just passed through as "someone else's problem".
- Non-functional: zero behavior change to any already-correct `MSG.*` error path (verified by
  construction, since the check is content-based against the actual `MSG` values, not a marker that
  could be missed at an un-migrated site) — this is strictly narrowing what can leak, not changing
  the response envelope shape (`{ ok, data }` / `{ ok, error }` stays exactly as-is).

## Architecture

One small shared helper per app (check `apps/api/Config.gs`/`apps/web/Config.gs` for the right
home, since that's where each app's own `MSG` object already lives — natural place for a helper
that reads `MSG`'s own values):

```js
// apps/api/Config.gs (or wherever MSG is defined) — built once, reused by every catch site
var KNOWN_MSG_VALUES_ = null;
function isKnownMessage_(text) {
  if (!KNOWN_MSG_VALUES_) {
    KNOWN_MSG_VALUES_ = {};
    Object.keys(MSG).forEach(function (k) { KNOWN_MSG_VALUES_[MSG[k]] = true; });
  }
  return !!KNOWN_MSG_VALUES_[text];
}

// call at every top-level catch that currently forwards err.message
function safeErrorMessage_(err) {
  var text = (err && err.message) ? err.message : String(err);
  if (isKnownMessage_(text)) return text;
  console.error('unexpected error: ' + (err && err.stack ? err.stack : err));
  return MSG.GENERIC;
}
```

`apps/web`'s equivalent (its own `MSG` object is smaller — `NOT_CONFIGURED`, `NO_IDENTITY`,
`API_UNREACHABLE`, `LOCKED`, `API_BAD_RESPONSE`, `GENERIC`, `SCOPE_NOT_GRANTED`) gets the identical
`isKnownMessage_`/`safeErrorMessage_` pair independently (separate Apps Script project, no shared
module system — confirmed via each project's distinct `.clasp.json` `scriptId`), applied at
`Main.gs:27`'s `handle_()` catch. **`Main.gs:69` is explicitly NOT routed through this helper** —
see Key Insights.

Since both apps independently implement the same logic shape, `tools/offline-tests/
error-message-safety.test.js` (see Implementation Steps) must exercise **both** copies against the
same table of inputs/expected-outputs, not just one, so they can't silently drift apart later.

## Related Code Files

- Modify: `apps/api/Router.gs:97`, `apps/api/ExportJob.gs` (the `job.error`/`job.deliveryError`
  assignment sites and their surfacing in `actionExportJobStatus_`), `apps/api/SheetsRepo.gs:67`,
  `apps/web/Main.gs:27` (**not** `:69` — see Key Insights), `apps/web/ApiClient.gs:109` (**only
  after** the apiclient-hardening plan lands — re-read the file first)
- Modify (helper): `apps/api/Config.gs` and `apps/web/Config.gs` (each app's own `MSG`-adjacent
  helper — confirm exact placement fits before adding)
- Create tests: `tools/offline-tests/error-message-safety.test.js`

## Implementation Steps

1. Confirm the apiclient-transient-failure-hardening plan (260912-1110) has landed and re-read
   current line numbers in `apps/web/ApiClient.gs` before touching it.
2. Re-grep `apps/api` and `apps/web` for every `.message`/`.stack`/`String(err)` occurrence to
   confirm the leak-site list above is still accurate (files may have shifted since the 2026-09-13
   inventory) and to catch anything new introduced by Phase 1's `BackupJob.gs`.
3. Add `isKnownMessage_`/`safeErrorMessage_` to `apps/api/Config.gs`, and the equivalent pair to
   `apps/web/Config.gs`.
4. Update each of the 5 non-`Main.gs:69` leak sites to use the app-appropriate helper instead of
   forwarding raw error text.
5. Update `apps/api/SheetsRepo.gs:67`'s rethrow so the eventual top-level catch treats it through
   the same content-based check, while keeping the existing regex-matched permission-error case's
   already-correct specific message untouched.
6. Leave `apps/web/Main.gs:69` untouched. Add a one-line comment there noting it's deliberately
   excluded from this phase's genericization and why (prefix-matched, self-constructed message, not
   a raw internal-exception pass-through) — this is exactly the kind of non-obvious constraint
   worth a comment per this repo's own comment-sparingly convention.
7. Write `tools/offline-tests/error-message-safety.test.js`: simulate a raw non-`MSG` exception at
   each of the 5 modified sites (both `apps/api` and `apps/web` copies of the helper) and assert
   the client-visible response is `MSG.GENERIC`, never the raw message; simulate an existing
   `MSG.*`-throwing validation and assert it still passes through unchanged (content-based, so this
   should hold for every one of the ~88 existing sites without listing them individually — spot
   check a representative handful, e.g. `MSG.ORDER_LOCK_BUSY`, `MSG.APPROVE_STATUS_EDIT_DENIED`,
   `MSG.NO_PERMISSION`).
8. Run `tools/offline-tests/apiclient-scope.test.js` specifically and confirm it's unaffected
   (`Main.gs:69` wasn't touched, so this should be a no-op change, but confirm rather than assume).
9. Run `node tools/offline-tests/run-all.js` (created in Phase 1) — zero regressions across the
   full suite, especially in suites that assert on specific error message content.
10. Manually confirm `DEV_MODE` is off in the current production Script Properties (can't be
    verified from code) — note the result in this phase's completion notes for Phase 7's checklist.

## Success Criteria

- [ ] All 5 modified leak sites verified fixed by a passing offline test that simulates a raw
      (non-`MSG`) exception at each site, for both the `apps/api` and `apps/web` helper copies
- [ ] Every existing `MSG.*`-based error message still reaches the user unchanged, by construction
      (content-based check, no per-site migration needed) — spot-checked against a representative
      sample plus a full run of `orders-permissions.test.js`/`orders-approvestatus.test.js`
- [ ] `tools/offline-tests/apiclient-scope.test.js` passes unchanged — confirms `Main.gs:69`'s
      scope-missing message is untouched
- [ ] `SheetsRepo.gs:67`'s rethrow no longer produces a raw-detail leak downstream
- [ ] `DEV_MODE` confirmed off in production (documented, not just assumed)
- [ ] `node tools/offline-tests/run-all.js` passes with zero regressions

## Risk Assessment

- **Content-based check false-negative risk**: if any existing `MSG.*` throw site ever appends
  extra detail to the message (like `Main.gs:69`'s prefix-match case), the exact-match check would
  incorrectly genericize it. Mitigated by this phase's grep pass (step 2) explicitly checking for
  any such append-pattern beyond the one already identified and excluded (`Main.gs:69`); if another
  is found, exclude it the same documented way rather than forcing it through the generic check.
- **Sequencing risk**: if this phase's `ApiClient.gs` edit starts before the apiclient-hardening
  plan lands, both will conflict on the same function. Explicitly gated in Overview/Implementation
  Steps above.
- **Two independently-maintained copies of the same logic** (`apps/api` vs `apps/web`, no shared
  module system possible in GAS) — mitigated by testing both against the same input/output table
  (Architecture section), so a future edit to one side that isn't mirrored to the other is at least
  caught by the shared test, not silently drifting.

## Security Considerations

- This phase is itself a security-hardening change (information disclosure reduction) — no new
  attack surface introduced. Server-side logging (`console.error`) is unchanged/unreduced, so
  admin diagnosability via Apps Script execution logs / Cloud Logging is preserved.
- Confirm current editor-access count on the `apps/api` Apps Script project as part of Phase 7's
  signoff — this phase moves previously-browser-visible detail exclusively into execution logs, and
  that's only as private as the current editor list (a fact worth re-confirming at signoff, not a
  code change here).
