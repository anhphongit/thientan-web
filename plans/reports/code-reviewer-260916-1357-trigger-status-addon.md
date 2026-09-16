# Code Review: Trigger-status addon to admin system-health panel

## Scope
- Files: apps/api/SystemHealth.gs (TRACKED_TRIGGERS_, triggerStatus_, actionSystemHealth_ return shape), apps/web/ui/ViewsAdmin.html (healthSectionHtml trigger rows), tools/offline-tests/system-health.test.js (new section), docs/CHECKLIST_M6_VI.md (B.2 rewrite)
- LOC: ~85 new/changed lines total, small addon on top of already-reviewed Phase 3 panel
- Focus: the 5 verification points requested, not a full re-review

## Overall Assessment
Correct, low-risk, read-only addition. No issues found across correctness, security, injection, or test realism. Ready to ship as-is.

## Verify: excluded trigger reasoning
Confirmed by reading `apps/api/ExportJob.gs:311-329`. `scheduleExportJobResume_` creates a one-off `resumeExportJob_` trigger via `.after(10*1000)` and `deleteExportJobTriggers_` removes it both before scheduling a new one and at the top of `resumeExportJob_` itself — genuinely per-job, not a standing installation. Excluding it from TRACKED_TRIGGERS_ is correct.

Grepped `apps/api/*.gs` for all `ScriptApp.newTrigger` calls — exactly 5 total:
- `BackupJob.gs:245` `runScheduledBackup_` (tracked)
- `ExportJob.gs:319` `resumeExportJob_` (correctly excluded, per-job)
- `ExportJob.gs:518` `cleanupExportJobs` (tracked)
- `Security.gs:239` `checkSecretExpiry` (tracked)
- `Security.gs:288` `keepWarmPing` (tracked)

All 4 persistent installers are tracked; nothing missed.

## Verify: security
`triggerStatus_()` only calls `ScriptApp.getProjectTriggers()` (read-only, no create/delete/modify) and extracts `getHandlerFunction()` into a plain object keyed by handler name. The returned shape per trigger is `{handler, label, installFn, installed}` — all four hardcoded string constants from `TRACKED_TRIGGERS_` plus a boolean; no trigger ID, no schedule/frequency metadata, no unrelated (non-tracked) trigger is ever surfaced. `actionSystemHealth_` still gates on `requirePermission_(user, 'manage_users')` before returning anything, unchanged from the already-reviewed version.

## Verify: UI correctness (escaping)
Confirmed `installFn` values in `TRACKED_TRIGGERS_` are hardcoded literals (`'installBackupTrigger'`, `'installExportJobCleanupReminder'`, `'installExpiryReminder'`, `'installKeepWarmTrigger'`) — not derived from request/user input at any point in the chain (SystemHealth.gs → Router.gs → ApiClient → ViewsAdmin.html). Despite being safe-by-construction, `healthSectionHtml()` still runs `T.esc(t.installFn)` and `T.esc(t.label)` in the missing-trigger branch — defense in depth, consistent with the rest of the file's escaping discipline.

## Verify: test quality
The new `triggerStatus_` / `actionSystemHealth_` section in `system-health.test.js` exercises the real code path, not a trivial always-true check: it asserts baseline `installed:false` for all 4 handlers, exact handler-name list, then calls `env.ScriptApp.newTrigger(...).timeBased()...create()` directly (harness fake, not the install*() wrapper functions) to install 2 of 4, and re-asserts a genuinely mixed installed/missing result across all 4. This exercises `triggerStatus_`'s actual mapping logic (installedHandlers lookup) rather than asserting a hardcoded array.

Harness fidelity: `harness.js`'s `ScriptApp.getProjectTriggers()` returns objects with `getHandlerFunction()` (harness.js:314-317), matching the real Apps Script `Trigger` API shape that `triggerStatus_` depends on (`t.getHandlerFunction()`). This fake predates this addon (already used by ExportJob's trigger-cleanup tests) and is exercised the same way here — no divergence found.

## Test run
`node tools/offline-tests/run-all.js` — 26/26 test files pass. `system-health.test.js` reports 16 passed, 0 failed, matching the expected count. (One unrelated file, `apiclient-scope.test.js`, prints an expected simulated DNS-error message as part of its own test — not a failure, and untouched by this addon.)

## Critical Issues
None.

## High Priority
None.

## Medium Priority
None.

## Low Priority
None — addon is minimal and consistent with the existing file's conventions (same card/table styling, same `T.esc` discipline, same best-effort-fetch error handling pattern as the rest of the health panel).

## Positive Observations
- Doc comments in both SystemHealth.gs and ViewsAdmin.html clearly explain the "why exclude resumeExportJob_" and "why editor-only, no web UI" design reasoning inline — future readers won't need to re-derive it.
- Test explicitly documents that it installs via the harness's raw `ScriptApp.newTrigger` rather than the real `install*()` wrapper, and why (wrapper is a trivial one-liner not worth re-testing here).

## Recommended Actions
None required.

## Unresolved Questions
None.
