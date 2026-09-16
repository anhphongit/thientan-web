# Phase 3 System Health Panel: Restored After Architectural Assumption Failure

**Date**: 2026-09-16 14:00  
**Severity**: Medium  
**Component**: Admin UI, System Health Monitoring, DevLog Integration  
**Status**: Shipped (Phase 7 pending live validation)

## What Happened

Milestone 6, Phase 3 (admin system-health panel) was cancelled 2026-09-14 per user request to keep scope tight. Today user asked to implement it anyway. Before coding, Step 1 required re-reading the actual codebase. That re-read surfaced a critical finding: the original Phase 3 design's core architectural claim was now **stale**.

## The Brutal Truth

Phase 3's "Finding 7" explicitly assumed: _"apps/web can never write to DevLog sheet — permanent architectural blind spot."_ This assumption justified labeling errors as "server-side only" in the health UI. The problem: between Phase 3's writing and today, an unrelated plan (260912-1110, transient-failure hardening) had already landed `devNote_()` in apps/web/ApiClient.gs. That function writes client-side failures into DevLog via the existing `logDev` action. The "permanent" blind spot was closed by work we didn't know would affect Phase 3. Shipping the original design would have published false information to admins — "server errors only" while silently ignoring logged web-side failures sitting right there in the same sheet.

## Technical Details

**The stale assumption in original design:**
```
Plan/phase-03.md Finding 7:
"apps/web has no write access to DevLog... this is a permanent architectural blind spot"
```

**What actually exists in codebase now:**
- `apps/web/ApiClient.gs:devNote_()` → calls `apiDev({action: 'logDev', message, level})` ✓ writes to DevLog
- `Security.gs:logDevEvent_()` already had try/catch wrapper + always-logs behavior Phase 3 was planning to add
- Router.gs's error handler now logs to DevLog when safeErrorMessage_ returns MSG.GENERIC (added by this Phase 3 implementation)

**Implementation adapted:**
- `devLogErrorCounts_()` counts DevLog rows by `level==='error'` WITHOUT source filtering (honest count, web+api combined)
- UI label changed: "Lỗi phía máy chủ" (server-side errors) → "Lỗi hệ thống" (system errors)
- Dropped two planned implementation steps (logDevEvent_ extension, isolating try/catch at call site) — both already satisfied by existing code

**Code shipped:**
- `apps/api/SystemHealth.gs`: actionSystemHealth_(), devLogErrorCounts_()
- `apps/api/Router.gs`: logs unexpected errors to DevLog; registered systemHealth action
- `apps/web/Main.gs`: apiSystemHealth() pass-through
- `apps/web/ui/ViewsAdmin.html`: new "Tình trạng hệ thống" section (compact key-value table, layout approved via 3-option mockup per mock-first UI rule)
- `tools/offline-tests/system-health.test.js`: 10 assertions, all green
- Stub fix: `error-message-safety.test.js` needed logDevEvent_ mock

**Test results:** 26/26 offline test files passing.

## What We Tried

1. Implement Phase 3 as originally written
2. **Realized**: re-reading codebase (Step 1) caught the stale assumption
3. **Adapted**: updated devLogErrorCounts_ to count honestly (web+api), changed UI label, confirmed existing code already handles logging safety
4. Submitted to code-reviewer — approved with no blockers (two low-priority observations: latent MSG.GENERIC-equality edge case now commented in Router.gs; Phase 6 docs not yet mentioning health panel)

## Root Cause Analysis

**Why the assumption became stale:** Plans written at a point-in-time don't auto-update when parallel work lands. Phase 3 was written and cancelled before 260912-1110 (transient-failure hardening) shipped. No mechanism existed to sync Phase 3's architecture section with the new reality. When Phase 3 was revived today, the only way to catch this was to follow Step 1's instruction: _re-read actual codebase before implementing_.

**Why it didn't cause a break during landing:** Phase 3 implementation checks assumptions against actual code (Step 1). The honest count (web+api combined) is technically *more* correct than the original design's "server-only" claim.

## Lessons Learned

1. **Timestamp assumptions in architectural docs.** When a plan makes a "permanent" claim about architectural constraints, note the date the claim was verified. If >2 weeks pass before execution, re-verify before coding.

2. **Re-reading codebase before big implementation is non-negotiable.** Phase 3 Step 1 saved us from shipping incorrect admin telemetry. The "busy developer" skip-Step-1 path would have resulted in false health metrics in the UI.

3. **Parallel work compounds stale assumptions.** When multiple teams/plans are active, expect architectural decisions to shift. A plan written during execution A may be wrong by execution C.

4. **Honest aggregation > filtered views when you're unsure of sources.** Counting "all errors in DevLog" is safer than "only server errors" when client-side error writing was previously assumed impossible.

## Next Steps

- **Phase 7** (live push via clasp + real device testing + PERMISSIONS.md checklist walkthrough): explicitly handed to user — requires real devices and human judgment
- **docs/MILESTONES.md**: M6 section deliberately NOT flipped to done — still shows unchecked exit criteria pending Phase 7 live validation
- **docs/codebase-summary.md, docs/project-changelog.md**: updated to reflect code-level changes only
- **Git commit**: deferred per user ("commit later, not now") — Phase 1/2/4/5/6 + Phase 3 changes sit uncommitted in working tree

**Ownership:** Phase 7 validation is user's responsibility (devices, manual testing). Code-level Phase 3 is shipped.
