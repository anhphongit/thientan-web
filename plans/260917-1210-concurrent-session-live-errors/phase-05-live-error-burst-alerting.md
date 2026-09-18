---
phase: 5
title: "Live error-burst alerting"
status: pending
priority: P2
effort: "1.5h"
dependencies: []
---

# Phase 5: Live error-burst alerting

## Overview

This incident was discovered because the user manually pasted a log into
`dev_error_log.md` — DevLog (always-on since the prior plan's Phase 4)
already captured every failure with headers/timing, but nothing surfaces it
proactively. For a live app with real users, the admin should learn about a
concurrent-load error burst within minutes, not whenever someone happens to
export the log. Reuse the existing trigger-based patterns already in this
codebase (`installExpiryReminder`/`checkSecretExpiry` in `Security.gs`,
`installKeepWarmTrigger`/`keepWarmPing` from the prior plan) rather than
inventing a new mechanism.

## Key Insights

- `SecurityLog` writes are already throttled to "one per event type per
  minute" and trimmed to 500 rows (`docs/SECURITY.md` §6) specifically to
  prevent the anonymous endpoint being turned into a write-quota DoS lever —
  DevLog should follow the same discipline; this phase reads DevLog, it does
  not change its write path.
- Keep the check cheap and infrequent (e.g. every 10–15 minutes, matching
  the keep-warm trigger's spirit) — this is a small internal tool for 5–6
  users, not a system needing sub-minute alerting (YAGNI).
- Stay silent when healthy — mirrors the existing security-expiry banner
  rule ("stays silent otherwise", `SECURITY.md` §4) so the admin is not
  trained to ignore a noisy channel.

## Implementation Steps

1. **`apps/api/Security.gs` (or a new small module if this file would cross
   the 200-line modularization threshold — check current line count first):**
   add `checkErrorBurst_()` — reads recent DevLog rows (reuse whatever
   read helper DevLog already has), counts `level: 'error'` rows within a
   rolling window (e.g. last 10 minutes), and if the count crosses a
   threshold (start conservative, e.g. ≥5), sends one email to `ADMIN_EMAIL`
   (same property `installExpiryReminder` already uses) summarizing: count,
   distinct actors involved, distinct actions/messages involved (this is
   exactly what would have flagged the 2026-09-17 11:01–11:04 burst as
   "2 actors, 7 actions, in 3 minutes" instead of requiring manual export).
   **Updated 2026-09-18:** Phase 2 no longer produces `MSG.SERVER_BUSY`
   (that belonged to the cut admission-control-queue design — see `plan.md`'s
   "Final root cause & solution strategy"). Instead, count DevLog rows
   matching the proven edge-delivery-failure signature (bare
   404/302/non-JSON, or `Address unavailable`) separately from genuine
   application errors — a rising rate of THAT specific signature is the
   actionable signal that Google's edge reliability issue is currently
   active, distinct from a real bug in this codebase, which a mixed error
   count would obscure.
2. Throttle the alert itself (e.g. do not re-send more than once per rolling
   window) — reuse or mirror the existing `SecurityLog` per-event-type
   throttle pattern rather than inventing a new one.
3. **`installErrorBurstTrigger()`** — editor-run-once installer, same shape
   as `installKeepWarmTrigger()`/`installExpiryReminder()` (remove any
   pre-existing trigger with the same handler first).
4. Register in `Setup.gs`'s `guardSetup_()` editor-only list, matching the
   existing `installExpiryReminder`/`installKeepWarmTrigger` entries (per
   `SECURITY.md` §7 rule 4: never expose a maintenance function through
   `getActions_()`).
5. Wrap the whole check in try/catch, matching `keepWarmPing`'s own
   discipline — a failing alert check must not itself become a trigger-
   failure email to the owner.

## Related Code Files

- Modify: `apps/api/Security.gs` (or new module if line-count threshold is
  crossed — check first per `development-rules.md` modularization rule)
- Modify: `apps/api/Setup.gs` (`guardSetup_()` registration)
- Modify (tests): new `tools/offline-tests/error-burst-alert.test.js`
  following the existing `keep-warm-trigger.test.js` pattern.

## Success Criteria

- [ ] `checkErrorBurst_()` correctly counts errors within the rolling window
      from a mocked DevLog dataset and does NOT alert below threshold.
- [ ] Alert fires exactly once per burst (not once per qualifying error) —
      covered by an offline test simulating repeated rapid calls.
- [ ] `checkErrorBurst_()` never throws, even if DevLog read fails.
- [ ] `installErrorBurstTrigger()` installs exactly one trigger, removing
      any prior one with the same handler (matches existing installer
      pattern's own test coverage shape).
- [ ] Live: run the installer once from the API editor; confirmed present in
      Apps Script's Triggers page.
- [ ] Full offline suite still green.

## Risk Assessment

Low-medium risk — additive, read-only against DevLog, isolated trigger
function. Main risk is threshold tuning (too sensitive → alert fatigue, too
loose → misses a real burst); start conservative and note in the plan's
journal entry that the threshold is a first guess, adjustable after the
first real observation window (same honesty framing the prior plan used for
the keep-warm trigger).
