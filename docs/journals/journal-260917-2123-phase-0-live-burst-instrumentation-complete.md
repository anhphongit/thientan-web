# Phase 0: Live Burst Instrumentation Complete

**Date**: 2026-09-17 21:23
**Severity**: Medium
**Component**: Request receipt logging / live diagnostics (apps/api, apps/web)
**Status**: Implemented, awaiting live deployment + commit review

## What Happened

Completed Phase 0 ("Live burst instrumentation") of plan `260917-1210-concurrent-session-live-errors`. Added best-effort request receipt capture to apps/api to diagnose high-concurrency quota contention scenarios without code modification or DevTools console access.

## Implementation Summary

**Backend (apps/api):**
- `Config.gs`: New cache keys `CACHE.REQUEST_RECEIPTS_KEY`, `TTL`, `MAX` constants (200 max receipts, drop-oldest on overflow).
- `Router.gs`: New `recordRequestReceipt_(action)` function (never-throws, best-effort) called at top of `doPost` before auth gates. New `getRequestReceipts` action registered.
- `SystemHealth.gs`: New `actionGetRequestReceipts_(user)` (admin-gated, manage_users permission, degrades gracefully).
- `request-receipts.test.js`: 19 assertions, all green. Full offline suite: 36/36 files passing.

**Code Review Finding (Fixed):** Medium severity — untrusted pre-auth `action` field stored unbounded (unlike three sibling log sites that truncate to 60 chars). Fixed immediately; re-verified 36/36 green.

**Frontend (apps/web):**
- `Main.gs`: New `apiGetRequestReceipts()` wrapper (standard pattern, same as existing `apiSystemHealth()`).
- `ViewsAdmin.html`: New `receiptsSectionHtml()` card in Admin > Config > System Health area. Raw JSON display (not tabular). Busy-guard against double-click. Correct HTML escaping of untrusted `action` strings before innerHTML.
- User approved design beforehand: separate card below health card (not merged), raw JSON (simple over fancy), read-only (no confirm dialog).

## Mid-Session Decision Pivot

Initially: User asked about testing Phase 0 without UI (answer: direct curl against `/exec` endpoint).
Revision: User decided to add in-app UI button + response viewer for convenience. Approved design, implemented, tested. No rework required.

## Current Status

- **Code**: All tests green, code review passed.
- **Docs impact**: None (follows existing CacheService/permission/error-handling patterns; nothing new to document).
- **Live deployment**: Not yet triggered (awaiting explicit user approval).
- **Git commit**: Not yet staged (user wants to review diff first).
- **Success criteria**: 5/6 met; live smoke-check now verified via new UI button rather than DevTools console call.

## Why This Matters

Phase 0 provides a low-overhead, zero-privacy-risk way to capture request traffic patterns during production quota issues. The receipt log helps answer: "How many requests hit doPost in the last 60s? What actions? Which users?" — critical diagnostics for concurrency bugs without code re-deploy or manual inspection.

## Next Steps

1. User reviews full git diff
2. Live clasp push + smoke test via new UI button
3. Move to Phase 1 (trace quota consumption across shared-identity scenarios)

---

**Related**: See plan `/plans/260917-1210-concurrent-session-live-errors/` for root-cause analysis and full phase breakdown.
