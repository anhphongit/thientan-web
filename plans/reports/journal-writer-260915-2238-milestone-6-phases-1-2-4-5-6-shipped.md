# Milestone 6 Hardening & Polish: 5 Phases Shipped, Phase 7 Blocked on User

**Date**: 2026-09-15 22:38
**Severity**: Medium
**Component**: Apps Script + Web UI, backup, error handling, mobile responsiveness, docs
**Status**: Completed (phases 1, 2, 4, 5, 6); Phase 7 awaiting user action; changes uncommitted

## What Happened

Executed the 260913-2326-milestone-6-hardening-and-polish plan across 5 of 7 planned phases using sequential subagent deployment. Each phase was implemented by an independent fullstack-developer or docs-manager agent receiving only their phase file as context. All 25 offline tests passed throughout. Code review post-implementation caught and we fixed 2 critical issues before tests re-confirmed passing. User declined to commit ("Not yet") — changes remain in the working tree.

**Phases shipped:**
- **Phase 1** (Drive Backup): Manual button + daily scheduled trigger + retention logic with both age-based and count-floor safety (apps/api/BackupJob.gs + tools/offline-tests/run-all.js test runner)
- **Phase 2** (Error Leak Fix): safeErrorMessage_ helper blocking content-based leaks (apps/api/Config.gs + apps/web/Config.gs; deliberately excluded apps/web/Main.gs's scope-missing branch per design)
- **Phase 4** (Mobile Hardening): 100dvh fallback, safe-area padding, 48px tap targets, overscroll-behavior for iOS-Safari-in-iframe quirks
- **Phase 5** (VI String Lint): tools/offline-tests/lint-english-strings.test.js regex guards + 4 borderline loanword findings resolved in docs/GLOSSARY_VI.md
- **Phase 6** (VI Docs): Sections B–F of USER_GUIDE_VI.md + CHECKLIST_M6_VI.md

**Phase 3** (stays cancelled per 2026-09-14 decision). **Phase 7** (live device walkthrough + production push) blocked — requires user directly, out of scope.

## The Brutal Truth

We shipped 5/7 phases cleanly and hit zero functional regressions, which is the good news. The frustrating part: we caught two non-trivial bugs in code review that should have been caught earlier, both old-school oversights that are embarrassing in "hardening" work specifically designed to prevent exactly this kind of gap.

The user's "Not yet" on commit is the right call — we're not done with phase 7, and committing mid-milestone looks unfinished. But it also means changes are floating in the working tree, which adds context-switching risk if the user context-switches.

## Technical Details

**Bug 1: Stale BUILD version stamps**
Both Config.gs files (apps/api and apps/web) had unchanged BUILD version integers despite substantial meaningful changes in phases 1, 2, 4. Version stamps weren't bumped — a correctness issue if version is used for cache-busting or client-server protocol negotiation.

**Bug 2: CSS safe-area padding with no fallback**
`.modal` and `.toast` rules added safe-area padding via `calc(20px + env(safe-area-inset-bottom))`. Per CSS spec, if a browser cannot parse `env()` or `calc()` within that declaration, the **entire declaration is invalid and discarded**. Fallback: Add a plain `20px` declaration before the calc()-based one. Without it, unsupported browsers lose all bottom padding and get zero instead of the graceful 20px default.

## What We Tried

**Phase-based modular deployment**: Each subagent received only its phase file, with zero cross-phase context. This worked exceptionally well because:
- Phase files were designed to be self-contained (each includes re-verify-line-numbers, exact code shapes, explicit exclusions)
- No inter-phase communication overhead
- Parallel execution would have been trivial (we did it sequentially for simplicity, but the structure supports parallel)

**Prior red-team review** (2026-09-14) had already caught and designed around three subtle failure modes before any implementation: marker-based error safety (replaced with content Set-check), pure-age backup retention (added count floor), and false HTTP-unreachability claims (documented as "omitted from Router action map").

## Root Cause Analysis

**Why we caught bugs in review, not before ship:** Code review was the only phase with full-codebase context. Subagents optimizing for their own phase (correctly) don't see cross-cutting concerns like version-stamp consistency or CSS spec edge cases. This isn't a failure of the modular approach — it's a success of having code review at all. But it suggests: version stamps should be automated (git-based or build-time), and CSS utilities should have a linter rule for calc()/env() requiring explicit fallbacks.

**Why phase files worked so well:** Thoroughness. Re-verify-line-number instructions, explicit exclusions (apps/web/Main.gs's scope-missing branch), and exact code shapes meant agents didn't have to guess or approximate.

## Lessons Learned

1. **Modular phase + code review beats monolithic implementation.** Each subagent did one thing well; review caught cross-cutting issues.
2. **Version stamps need automation.** Manual bumping in a phase-based workflow is error-prone.
3. **CSS spec edge cases require explicit fallbacks in linting.** env() and calc() invalidate entire declarations if unsupported — add plain-value fallback first.
4. **Red-team review before implementation pays dividends.** The three design questions caught in 2026-09-14's review prevented avoidable rework.
5. **"Not committing yet" is the right call mid-milestone.** Phase 7 is user-facing (live device test + production push). Commit after that closes the milestone cleanly.

## Next Steps

1. **Phase 7** requires user involvement (live device walkthrough on employee instance + production push decision). Out of scope for autonomous work.
2. **Before Phase 7**: User must decide on commit timing (likely after Phase 7 passes live test).
3. **Future milestones**: Implement version-stamp automation (git describe or build-time inject) and add CSS fallback linter rule.
4. **Working tree state**: Changes are staged/ready but not committed. User will need to re-enter context if context-switching; consider a branch if work pauses.
