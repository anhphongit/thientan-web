---
phase: 3
title: "Admin system-health panel"
status: complete
priority: P3
effort: "3h"
dependencies: [1, 2]
---

> **Un-cancelled 2026-09-16.** Originally cancelled during plan validation (2026-09-14) to keep
> milestone scope tight. User has since decided to implement it after all, confirming the design
> below as-is (no changes) plus one UI decision: the health section in `ViewsAdmin.html` uses a
> compact key-value table layout (last backup timestamp, backup folder link, server-side error
> counts for 24h/7d). Phase 7 re-depends on this phase — see that phase's frontmatter.

# Phase 3: Admin system-health panel (stretch)

## Overview

**Stretch item** (user-selected during scope expansion, 2026-09-13). Not in `docs/MILESTONES.md`'s
base M6 scope — droppable without affecting the milestone's exit criteria (see Risk Assessment: if
cut, Phase 7 must record it as a deliberate, documented cut). A small admin-only view showing
last-backup status/time (Phase 1) and a recent-error count (Phase 2's newly-narrowed error
handling), so Phong doesn't need to dig through Drive or Apps Script logs manually.

**Red-team fixes folded into this revision** (2026-09-14 review, see plan.md's Red Team Review
section): this phase no longer creates a new `ErrorLog` sheet (it duplicated an existing mechanism
— Finding 4); it's explicitly rescoped to `apps/api`-side visibility only, since `apps/web` cannot
reach any sheet at all (Finding 7); its log-write is now isolated with its own try/catch so it can
never crash the shared error-safety funnel it hooks into (Finding 10); and it now reads Phase 1's
actually-persisted `ScriptProperties` state rather than an assumed return value (Finding 1).

## Key Insights

- **Corrected (Finding 4): do not create a new `ErrorLog` sheet — this repo already has one.**
  `apps/api/Security.gs`'s `logDevEvent_(level, source, message, detail, actor)` already appends
  rows to a `DevLog` sheet (headers defined in `apps/api/Config.gs:65`, sheet created by
  `setupDevLog()` in `apps/api/Setup.gs:59-83`). Its only relevant gap: `logDevEvent_` currently
  no-ops unless `PROP.DEV_MODE === 'on'` (`apps/api/Security.gs:273`) — and Phase 2 explicitly
  requires `DEV_MODE` be **off** in production, which would make `DevLog` permanently empty in
  prod if reused unmodified. Fix: extend `logDevEvent_` with a way to log **regardless of
  `DEV_MODE`** for a specific category (e.g. an explicit `alwaysLog` boolean parameter, or a
  distinct `level` value like `'health'` that the function checks before the `DEV_MODE` gate) —
  reusing the same sheet/columns/rotation semantics that already exist, rather than standing up a
  parallel sheet + file + setup step for what is functionally the same thing.
- **Corrected (Finding 7): `apps/web` cannot write to any sheet — this panel's error-count is
  `apps/api`-side only, by construction.** `apps/api` and `apps/web` are separate Apps Script
  projects (confirmed distinct `.clasp.json` `scriptId`s); `grep -rn "SpreadsheetApp"
  apps/web/*.gs` returns zero hits — only `apps/api/SheetsRepo.gs` may touch the spreadsheet. This
  phase's `recentErrorCount` therefore only ever reflects unexpected errors caught inside
  `apps/api`'s own `Router.gs`/action-handler catches, **not** any purely client-side failure in
  `apps/web/Main.gs`'s `handle_()` (e.g. a network failure that never reaches `apps/api` at all).
  This is a **documented scope boundary**, not a bug to fix in this stretch phase — adding a
  dedicated `apiLogClientError` action so `apps/web` could report its own failures across the HTTP
  boundary is explicitly **out of scope** here (YAGNI; this stretch item is already the most
  disposable item in the plan, don't grow it).
- This phase **depends on Phase 2's `safeErrorMessage_()` existing first** — extend that function's
  unexpected-error branch (the one that already calls `console.error` and returns `MSG.GENERIC`) to
  also call the `DevLog`-based logger, **wrapped in its own try/catch** (Finding 10 — see
  Architecture) so a transient Sheets-write failure inside the logger can never propagate out of
  `safeErrorMessage_` and crash the very call chain (34+ call sites fan into it via `handle_()`
  alone) that exists specifically to fail safely.
- This phase **depends on Phase 1's `ScriptProperties`-persisted `lastBackupAt`/
  `lastBackupFolderUrl`** (added to Phase 1 during this same red-team pass) — read those two keys
  directly; do not re-derive backup status any other way.
- Keep this deliberately small — a few rows in one Admin view section, not a new nav item or
  dashboard.

## Requirements

- Functional:
  - Extend `logDevEvent_`/`DevLog` (not a new sheet) so a "system health" category of event is
    recorded **regardless of `DEV_MODE`** — timestamp, action name, and a short non-sensitive
    category only (never the raw message itself; that would defeat Phase 2's whole point — the raw
    detail stays in `console.error`/Apps Script execution logs, the actual detailed-diagnosis
    channel).
  - Phase 2's `safeErrorMessage_()` calls this extended logger on its unexpected-error branch, the
    call wrapped in its own try/catch that only `console.error`s on failure, never re-throws.
  - Admin view section (`apps/web/ui/ViewsAdmin.html`) showing, as a compact key-value table (2
    columns: label, value — user-approved layout, 2026-09-16): last backup timestamp row, backup
    folder link row (read from Phase 1's `ScriptProperties` keys), and two rows for count of
    unexpected `apps/api`-side errors in the last 24h and 7d (read from `DevLog`, filtered to the
    health category), gated behind `manage_users` like every other admin control. Label the error
    rows "Lỗi phía máy chủ (24h)" / "Lỗi phía máy chủ (7 ngày)" (server-side errors) — not an
    unqualified "errors" — so the `apps/web`-blind-spot boundary is honest to whoever reads the
    panel, not just documented in this plan file.
- Non-functional: this panel is read-only display — no new write actions beyond the log-append
  itself (which already existed via `logDevEvent_`, just extended), no new permission key (reuses
  `manage_users`), no new Sheet tab.

## Architecture

```
Phase 2's safeErrorMessage_() (unexpected-error branch)
  → try { logDevEvent_('health', actionName, category, null, null, /*alwaysLog*/ true) }
    catch (logErr) { console.error('health logging failed: ' + logErr); }
       ^ isolated — a failure here never propagates past safeErrorMessage_ (Finding 10)

Admin view load
  → apiSystemHealth (new thin action, apps/api-side only)
    → { lastBackup: {folderUrl, createdAt}    [from Phase 1's ScriptProperties keys — Finding 1]
        recentErrorCount: {last24h, last7d} } [from DevLog, filtered to 'health' category]
```

## Related Code Files

- Create: `apps/api/SystemHealth.gs` (small — health-panel data assembly/read logic only; does not
  create or own any new sheet, reads `DevLog` and `ScriptProperties`)
- Modify: `apps/api/Security.gs` (extend `logDevEvent_` with an always-log path for the health
  category), `apps/api/Router.gs` (register `systemHealth` action), `apps/web/Main.gs` (thin
  pass-through), `apps/web/ui/ViewsAdmin.html` (panel section, with the `apps/api`-scoped label
  above), Phase 2's `safeErrorMessage_()` (isolated log-append call)
- Create tests: `tools/offline-tests/system-health.test.js`

## Implementation Steps

1. Read Phase 1's `BackupJob.gs` and Phase 2's `Config.gs`/`safeErrorMessage_` helper as actually
   implemented (not just as planned) before starting — this phase adapts to what those phases
   actually produced, including the exact `ScriptProperties` key names Phase 1 wrote.
2. Extend `apps/api/Security.gs`'s `logDevEvent_` (or add a small sibling function that wraps it)
   with an always-log path for a `'health'`-category event, independent of `DEV_MODE`.
3. In Phase 2's `safeErrorMessage_()`, add the isolated (own try/catch) call to the health-logging
   path on the unexpected-error branch only.
4. Create `apps/api/SystemHealth.gs`: `actionSystemHealth_(user)` — `requirePermission_(user,
   'manage_users')`, reads Phase 1's `ScriptProperties` keys for last-backup info, reads/filters
   `DevLog` rows for the health category's 24h/7d counts, returns a small JSON shape.
5. Register `systemHealth` in `Router.gs`; add `apiSystemHealth` pass-through in `apps/web/Main.gs`.
6. Add the panel section to `ViewsAdmin.html`, gated on `manage_users`, with the `apps/api`-scoped
   label for the error count.
7. Write `tools/offline-tests/system-health.test.js`: error-count windowing math, permission gate,
   that the health-log call is correctly isolated (a thrown error inside the logging path must not
   propagate out of `safeErrorMessage_` in the test harness).
8. Run `node tools/offline-tests/run-all.js` — no regressions.

## Implementation Notes (as actually shipped, 2026-09-16)

Step 1 (re-reading the actually-implemented Phase 1/2 code before starting, per this phase's own
instruction) surfaced two facts that changed the design from what's written above, both because a
different plan (`260912-1110`, apiclient transient-failure hardening) landed in between this phase
being written and being implemented:

- **`logDevEvent_` already always writes, regardless of `DEV_MODE`** (changed 2026-09-14, i.e.
  before this phase was un-cancelled) and **already never throws to its caller** (its own internal
  try/catch returns a boolean). Step 2 (extend it with an "always-log" path) and the isolated-
  try/catch requirement (Finding 10 / Success Criterion 4) were therefore already satisfied by the
  existing function — nothing to add there. No changes were made to `Security.gs`.
- **The `apps/web`-blind-spot Finding 7 no longer holds.** `apps/web/ApiClient.gs`'s `devNote_()`
  (added by the apiclient-hardening plan) already reports client-side failures — missing OAuth
  scope, fetch failures, non-2xx/non-JSON responses — into the same `DevLog` sheet via the existing
  `logDev` action, unconditionally. `DevLog` is therefore already a combined web+api error log, not
  an apps/api-only one. The one piece still missing was apps/api's own unexpected errors (Router.gs's
  top-level catch) never being logged anywhere but `console.error`/Stackdriver — that's the only
  logging gap this phase actually closes.

**What was actually implemented** (see `apps/api/SystemHealth.gs`'s file doc comment for the full
reasoning): `Router.gs`'s catch block now calls `logDevEvent_('error', req.action, 'unexpected error',
'', req.actor)` when `safeErrorMessage_(err) === MSG.GENERIC` (i.e. the same unexpected-error
classification `safeErrorMessage_` already makes internally, reused rather than re-derived — no
signature change to `safeErrorMessage_` itself, so `ExportJob.gs`'s two unrelated call sites are
untouched). `SystemHealth.gs`'s `devLogErrorCounts_()` counts `DevLog` rows at `level: 'error'`
within 24h/7d **without filtering by source** — combining both origins honestly, rather than
mislabeling the count as server-side-only. The Admin UI section's Vietnamese labels were adjusted
from "Lỗi phía máy chủ" (server-side errors) to "Lỗi hệ thống" (system errors) to match.

## Success Criteria

- [x] Admin panel shows last backup time + Drive link (from Phase 1's persisted state), and a
      combined web+api unexpected-error count (24h/7d), labeled "Lỗi hệ thống" (system errors) —
      relabeled from "server-side-only" per the Implementation Notes above
- [x] A non-admin cannot call `systemHealth` directly (test-verified)
- [x] No raw error text is ever written to `DevLog`'s health rows — only action name/actor/timestamp
      (via the existing `logDevEvent_`'s own field truncation, unchanged)
- [x] `logDevEvent_` cannot propagate a failure out of Router.gs's catch — verified true by
      `logDevEvent_`'s own pre-existing try/catch (Implementation Notes above), not by a new isolating
      wrapper; no separate test needed since this is unchanged, pre-existing behavior
- [x] `tools/offline-tests/system-health.test.js` passes; `node tools/offline-tests/run-all.js`
      still green (26/26 test files)

## Risk Assessment

- **Scope creep risk** (this phase specifically): being a stretch item nested inside an
  already-expanded milestone, this was the first phase considered for cutting — cancelled once
  (2026-09-14), then un-cancelled and implemented (2026-09-16) once the design was re-confirmed
  against the actual codebase state. Phase 7 now has a real (not soft/optional) dependency on this
  phase — see that phase's frontmatter.
- **`apps/web`-side blind spot** (Finding 7) — **resolved**, not permanent as originally assessed.
  See Implementation Notes above: a different plan's `devNote_()` mechanism already closed it before
  this phase was implemented.

## Addendum: trigger-installed status (2026-09-16, during Phase 7 live testing)

While walking `docs/CHECKLIST_M6_VI.md`'s B.2 (scheduled backup), the user asked how to verify
whether `installBackupTrigger()` had actually been run, since there's no web UI for it (deliberately
editor-only, see Key Insights above). That's a real gap this health panel already existed to fill,
so it was extended rather than opened as a new phase:

- `apps/api/SystemHealth.gs` gained `TRACKED_TRIGGERS_` (the 4 persistent daily/periodic triggers
  this codebase installs — `runScheduledBackup_`, `cleanupExportJobs`, `checkSecretExpiry`,
  `keepWarmPing`; `ExportJob.gs`'s per-job `resumeExportJob_` trigger is excluded — it's created and
  deleted per job, not a standing installation) and `triggerStatus_()` (reads
  `ScriptApp.getProjectTriggers()`, returns each tracked trigger's installed/missing state).
  `actionSystemHealth_`'s return shape gained a `triggers` array.
- `apps/web/ui/ViewsAdmin.html`'s health table gained one row per tracked trigger: "✅ Đã cài đặt"
  or "⚠️ Chưa cài đặt — chạy `install...()` trong Apps Script" (names the exact function to run).
- `docs/CHECKLIST_M6_VI.md`'s B.2 rewritten to point at this panel as the fastest verification path,
  replacing its original (never-accurate) wording about configuring the schedule "in tab 'Cài đặt'".
- Tests added to `tools/offline-tests/system-health.test.js`: no-triggers-installed baseline, mixed
  installed/missing state. Full suite still 26/26 green after this addition.

This stays within the phase's original spirit (a small, read-only admin visibility panel) — no new
permission, no new sheet, `ScriptApp.getProjectTriggers()` is read-only so this doesn't reopen the
"exposing trigger control over HTTP" risk that keeps installation itself editor-only.
