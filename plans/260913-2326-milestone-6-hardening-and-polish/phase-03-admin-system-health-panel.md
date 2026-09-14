---
phase: 3
title: "Admin system-health panel"
status: cancelled
priority: P3
effort: "3h"
dependencies: [1, 2]
---

> **Cancelled during plan validation (2026-09-14).** User decision: even after the red-team
> redesign resolved the real risks (DevLog duplication, cross-project impossibility, unguarded
> Sheet-append), this stretch item was cut to keep the milestone's actual scope to the 5 base
> `docs/MILESTONES.md` items plus the other 2 stretch items (scheduled backup+retention in Phase 1,
> the regression-guard lint script in Phase 5). The design below is kept as a fully-worked
> reference in case this is picked back up later, but **no implementation work happens here** —
> `/ck:cook` should skip this file. Phase 7 no longer depends on it (see that phase's frontmatter).

# Phase 3: Admin system-health panel (stretch) — CANCELLED, not implemented

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
  - Admin view section (`apps/web/ui/ViewsAdmin.html`) showing: last backup timestamp + link (read
    from Phase 1's `ScriptProperties` keys), count of unexpected `apps/api`-side errors in the last
    24h/7d (read from `DevLog`, filtered to the health category), gated behind `manage_users` like
    every other admin control. Label the error count in the UI as "lỗi phía máy chủ" (server-side
    errors) or similar — not an unqualified "errors" — so the `apps/web`-blind-spot boundary is
    honest to whoever reads the panel, not just documented in this plan file.
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

## Success Criteria

- [ ] Admin panel shows last backup time + Drive link (from Phase 1's persisted state), and
      `apps/api`-side unexpected-error counts (24h/7d), clearly labeled as server-side-only
- [ ] A non-admin cannot call `systemHealth` directly
- [ ] No raw error text is ever written to `DevLog`'s health rows — only category/action/timestamp
- [ ] A failure inside the health-logging call cannot propagate out of `safeErrorMessage_`
      (test-verified, not just asserted in prose)
- [ ] `tools/offline-tests/system-health.test.js` passes; `node tools/offline-tests/run-all.js`
      still green

## Risk Assessment

- **Scope creep risk** (this phase specifically): being a stretch item nested inside an
  already-expanded milestone, this is the first phase to cut if time runs short — it has no code
  dependents (Phases 4-6 don't need it), only a *documentation* dependent (Phase 7's soft
  reference, see that phase's frontmatter). Flag this explicitly in Phase 7's live-verification
  pass so it's a documented, deliberate cut if dropped, not a silent one.
- **`apps/web`-side blind spot** (Finding 7) is permanent by architecture, not a temporary gap — do
  not attempt to "complete" it later inside this stretch item's budget; if ever wanted, it's a
  separate, explicitly-scoped follow-up (a dedicated client-error-reporting action), not an
  extension of this phase.
