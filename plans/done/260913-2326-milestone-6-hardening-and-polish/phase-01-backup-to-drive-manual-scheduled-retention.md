---
phase: 1
title: "Backup to Drive (manual+scheduled+retention)"
status: complete
priority: P1
effort: "5h"
dependencies: []
---

# Phase 1: Backup to Drive (manual+scheduled+retention)

## Overview

Base scope: `backupNow()` — export every sheet to a timestamped Drive folder, triggered by an
Admin button (`docs/MILESTONES.md` M6, exit criterion "Backup produces a restorable copy of all
six sheets" — note: the live spreadsheet already has 10 tabs per `apps/api/Config.gs`'s `SHEETS`
enum, not six; `makeCopy()` copies every tab regardless of count, so this doesn't change the
approach, but Phase 7's docs-sync should correct the stale "six sheets" wording when signing off).
Stretch (user-selected, expansion scope): a daily scheduled trigger doing the same thing
automatically, plus retention cleanup so old backups don't accumulate forever.

**A "restorable copy" means Sheets' own copy semantics** — `DriveApp...makeCopy()` produces a full,
independent spreadsheet file (formulas, formatting, data validation all intact) that Phong can open
directly or re-share as the live sheet if ever needed. This phase does **not** build an in-app
restore button — see plan.md's "Out of scope".

**Red-team fixes folded into this revision** (2026-09-14 review, see plan.md's Red Team Review
section for the full adjudication): persisted last-backup state (Finding 1), scheduled-trigger
error visibility (Finding 2), a minimum-retained-count retention floor (Finding 5), corrected
`editorOnly` protection claims (Finding 6), a corrected Drive-copy code path (Finding 11), a
corrected folder-collision justification (Finding 12), folder-ID persistence for the parent backup
folder (Finding 13), corrected offline-test-runner instructions (Finding 8), and a corrected
`exportFilename_` citation (was mis-cited as living in `ExportJob.gs`; it's in `Export.gs:436`).

## Key Insights

- Research (`plans/reports/researcher-260913-2326-apps-script-backup-triggers.md`) recommends
  file-level `DriveApp.getFileById(spreadsheetId).makeCopy(name, folder)`, not a manual per-tab
  export — it's the only approach that preserves formulas/validation/formatting, and it's a
  metadata-level operation (near-instant, no risk of the 6-minute execution ceiling at this data
  size: ~1200 rows/tab × 6+ tabs).
- **Corrected (Finding 11): there is no global `SPREADSHEET_ID` constant.** `grep -rn "^var
  SPREADSHEET_ID\|SPREADSHEET_ID ="` returns nothing. The real pattern, confirmed at
  `apps/api/SheetsRepo.gs:51-54`, is `getSpreadsheet_()` — an existing helper that already opens
  and caches the live spreadsheet via `PropertiesService.getScriptProperties().getProperty(PROP.
  SPREADSHEET_ID)`. **Reuse `getSpreadsheet_()` directly** (`var ss = getSpreadsheet_(); DriveApp.
  getFileById(ss.getId()).makeCopy(name, folder);`) rather than re-deriving the ID — this also
  means `backupNow_()` never needs its own Script-Properties read for the source ID.
- Existing code already establishes the exact shape to reuse for everything else, do not invent a
  new style:
  - `apps/api/ExportJob.gs:479-483` `exportsFolder_()` — find-or-create a named Drive folder,
    looked up by name every call (deliberately not cached in `ScriptProperties`, so a manual
    rename/move self-heals instead of 404ing on a stale id). **Do not copy this part of the pattern
    verbatim for the backup parent folder** — see Finding 13 below; exports are ephemeral/replaceable,
    backups are the safety net itself, so the collision cost is asymmetric.
  - `apps/api/Export.gs:436` `exportFilename_(base, ext)` (**corrected citation** — Finding's
    citation-accuracy note: this was previously mis-cited as living in `ExportJob.gs:436-441`,
    which is actually unrelated cleanup code inside `deliverExportJob_`) — timestamp-suffixed
    filename (`orders-20260913-1420.xlsx` shape). `Export.gs` is now in this phase's Related Code
    Files as a read reference.
  - `apps/api/ExportJob.gs:505-511` `installExportJobCleanupReminder()` and `apps/api/Security.gs`'s
    `installExpiryReminder()` — the idempotent trigger-install pattern: delete any existing trigger
    targeting the same function, then create fresh. Never accumulate duplicate triggers across
    repeated `setupXxx()`/re-deploys.
  - `apps/api/ExportJob.gs:544-581` `cleanupExportJobs()` — retention loop shape: read a
    config-driven retention window (`exportRetentionDays_()`, backed by a `Config` sheet row,
    default 14 days), iterate items, `setTrashed(true)` (never permanent delete — 30-day Drive
    recovery window), wrap each item in its own try/catch so one bad record doesn't stop the sweep.
- **Corrected (Finding 6): `editorOnly`/`guardSetup_()` is not a runtime HTTP gate.** Traced calls
  confirm `guardSetup_()` (`apps/api/Setup.gs`, function starts ~line 90, `editorOnly` array ~line
  93) is only invoked from `setupMilestoneN()`/`DevSeed.gs`/`Migrations.gs` functions — a
  self-check those one-time editor-run routines perform on themselves. It is **never** called by
  `ExportJob.gs`'s own trigger-target functions, nor by `Router.gs`. The actual thing that keeps a
  function unreachable over HTTP is simply that it has no entry in `Router.gs`'s `getActions_()`
  action-map literal — omission, not an enforced runtime check. This plan's new trigger-target
  functions (`runScheduledBackup_`, `cleanupOldBackups_`, `installBackupTrigger`) get the same
  protection every existing trigger function gets (omission from the action map), no stronger and
  no weaker — **do not claim otherwise in code comments or docs**, and add a Phase 7 checklist item
  to confirm these three names are absent from `Router.gs`'s action map at signoff (defense via
  review, matching this repo's existing convention, not new runtime machinery — inventing a
  self-defending runtime check for functions that are already unreachable by construction would be
  over-engineering for a single-admin internal tool).
- Folder naming: follow the existing Vietnamese-with-brand-suffix convention seen in
  `EXPORTJOB_FOLDER_NAME = 'Xuất file đơn hàng (THIÊN TÂN)'` — e.g. `'Sao lưu THIÊN TÂN'` for the
  parent folder, with one timestamped subfolder per backup run (`YYYY-MM-DD_HHmmss`) holding that
  run's single spreadsheet copy.
- **Corrected (Finding 13): the backup parent folder needs collision-safe lookup, unlike
  `exportsFolder_()`'s pattern.** `DriveApp.getFoldersByName()` matches by name across the whole
  executing account's Drive; names aren't unique, and `it.next()` returns whichever match Drive's
  API happens to return first. For an ephemeral exports folder this is a low-stakes convenience; for
  the backup safety net, a same-named stray folder (human accident, another script, a manual Drive
  action) could silently redirect new backups — or worse, retention cleanup — into the wrong place.
  Fix: persist the created folder's Drive file ID in `ScriptProperties` (e.g.
  `BACKUP_FOLDER_ID`) the first time it's created; on every subsequent call, look up by that stored
  ID first (`DriveApp.getFolderById`, wrapped in try/catch for the case it was deleted/trashed out
  from under the property), and only fall back to the name-based find-or-create if the stored ID is
  missing or no longer resolves.
- **Corrected (Finding 12): drop the "this app has 1 admin" justification for skipping
  concurrent-click handling.** `docs/PERMISSIONS.md:118-119` ("the last active admin cannot be
  deactivated") implies the system is designed to support more than one admin account, even if only
  one is provisioned today — this plan should not rely on a deployment fact that isn't an
  architectural guarantee. The actual, sufficient mitigation is unchanged: Drive permits duplicate
  folder names harmlessly (no crash, no data loss), and `HHmmss` granularity makes a true
  same-second collision from two independent clicks practically negligible regardless of how many
  admins exist.
- **New (Finding 1): persist "last backup" state — Phase 3 (if built) and any future signoff check
  need to read it back after the triggering request/execution has long ended.** `backupNow_()`'s
  return value only reaches the single HTTP caller that invoked it (the admin-button click); a
  time-based trigger's return value is discarded entirely by Apps Script — nothing reads it. Every
  successful run (manual or scheduled) must write `lastBackupAt` (ISO timestamp) and
  `lastBackupFolderUrl` to `PropertiesService.getScriptProperties()` — simple key-value operational
  state, not user-editable config, so `ScriptProperties` fits better than a new `Config` sheet row
  (consistent with how `PROP.SPREADSHEET_ID` itself is already stored there).
- **New (Finding 2): the scheduled trigger path has no error visibility at all today.**
  `runScheduledBackup_()` runs outside any HTTP request — it never passes through `Router.gs`'s
  `doPost` catch or `Main.gs`'s `handle_()`, so Phase 2's error-safety helper (built to sit inside
  those two call chains) never sees a trigger-context failure. `runScheduledBackup_()` must wrap
  its own body in a try/catch that independently logs the failure (via `console.error` at minimum,
  matching this repo's existing trigger-function convention — see `cleanupExportJobs()`'s own
  per-item try/catch/console.error shape) so a silently-broken nightly backup is at least visible
  in Apps Script execution logs, without depending on Phase 2's HTTP-scoped helper existing or
  being wired up.
- **New (Finding 5): retention cleanup needs a minimum-retained-count floor, not pure age-based
  pruning.** Pure "trash anything older than N days" means: if the nightly trigger silently stops
  succeeding (quota, permission drift, transient Drive error) for longer than the retention window,
  the next time it *does* run, every existing backup is now "too old" and gets trashed in the same
  pass that (maybe) creates one new one — a single bad run can wipe the entire safety net at
  exactly the moment something has already gone wrong upstream. Fix: `cleanupOldBackups_()` must
  always keep the most recent **N** backups (e.g. `MIN_BACKUPS_KEPT = 3`) regardless of age, and
  only apply the age-based cutoff to backups beyond that floor.
- **New (Finding 8): there is no unified test runner in this repo.** `tools/offline-tests/` has 20
  `*.test.js` files and a `README.md` documenting **individual** `node
  tools/offline-tests/<file>.test.js` invocations — no `package.json`, no CI, no existing "run
  everything" script. This phase creates `tools/offline-tests/run-all.js` (a small plain-`node`
  script that `require()`s and runs every `*.test.js` file in the directory, exiting non-zero on
  any failure) so this phase and every later phase (2, 3, 5) that needs to "run the full suite" has
  something real to run and reference, instead of an assumed command that doesn't exist.

## Requirements

- Functional:
  - `apiBackupNow` action (web-exposed, `apps/api/Router.gs` action map) — admin-only
    (`requirePermission_(user, 'manage_users')`), calls `backupNow_()`, returns `{ folderUrl,
    fileUrl, createdAt }` on success.
  - `backupNow_()` (in new `apps/api/BackupJob.gs`) — resolves the backups parent folder
    (collision-safe, per Finding 13 above), creates a timestamped subfolder, copies the live
    spreadsheet via `getSpreadsheet_()` + `DriveApp.getFileById(ss.getId()).makeCopy(name, folder)`,
    **writes `lastBackupAt`/`lastBackupFolderUrl` to `ScriptProperties` on success**, returns the
    result.
  - Admin button "Sao lưu ngay" in `apps/web/ui/ViewsAdmin.html`, calling `apiBackupNow` the same
    `google.script.run` + `T.confirm()` pattern already used elsewhere in that view — show the
    resulting Drive folder link on success.
  - **Stretch:** `installBackupTrigger()` (editor-only, in `BackupJob.gs`) — idempotent daily
    trigger (`ScriptApp.newTrigger('runScheduledBackup_').timeBased().everyDays(1).atHour(2)...`),
    following `installExportJobCleanupReminder()`'s delete-then-recreate shape exactly.
    `runScheduledBackup_()` calls `backupNow_()` **inside its own try/catch** (Finding 2), logging
    any failure via `console.error` before letting `cleanupOldBackups_()` run.
  - **Stretch:** `cleanupOldBackups_()` — reads a `Config` retention-days row (add
    `backupRetentionDays`, default 14, same convention as `exportRetentionDays_()`), iterates the
    parent backup folder's subfolders sorted by creation date **descending**, unconditionally
    exempts the newest `MIN_BACKUPS_KEPT` (3) from cleanup regardless of age (Finding 5), then
    `setTrashed(true)` on any remaining subfolder older than the retention window. Called at the
    end of `runScheduledBackup_()`, after a successful backup.
- Non-functional: no change to any existing action's contract; new action follows the existing
  `handle_`/`json_` response envelope exactly (`apps/web/Main.gs`, `apps/api/Router.gs`).

## Architecture

```
Admin button (ViewsAdmin.html)
  → google.script.run.apiBackupNow (apps/web/Main.gs, thin pass-through like other admin actions)
    → apiCall_('backupNow', {}) (apps/web/ApiClient.gs, existing transport)
      → apps/api/Router.gs doPost → actionBackupNow_ (apps/api/BackupJob.gs)
        → requirePermission_(user, 'manage_users')
        → backupNow_()
            → backupsParentFolder_()     [ScriptProperties folder-ID lookup, fallback to
                                           find-or-create-by-name — mirrors exportsFolder_() only
                                           for the fallback path, see Finding 13]
            → timestamped subfolder      [mirrors exportFilename_()'s timestamp shape]
            → var ss = getSpreadsheet_(); DriveApp.getFileById(ss.getId()).makeCopy(name, subfolder)
            → ScriptProperties.setProperty('lastBackupAt', ...) /
              setProperty('lastBackupFolderUrl', ...)   [Finding 1]

Daily trigger (editor-installed, never in Router.gs's getActions_() — Finding 6)
  → runScheduledBackup_()
      try { backupNow_() } catch (err) { console.error(...) }   [Finding 2]
      cleanupOldBackups_()
        → keep newest MIN_BACKUPS_KEPT unconditionally, trash the rest if older than
          backupRetentionDays_()   [Finding 5]
```

## Related Code Files

- Create: `apps/api/BackupJob.gs`, `tools/offline-tests/run-all.js` (Finding 8 — shared by Phases
  2/3/5 too, created once here since Phase 1 is first)
- Modify: `apps/api/Router.gs` (register `backupNow` action), `apps/api/Setup.gs` (add
  `installBackupTrigger`/`runScheduledBackup_`/`cleanupOldBackups_` to `editorOnly`, and confirm at
  Phase 7 signoff none of the three ever get added to `getActions_()`), `apps/api/Config.gs` (add
  `backupRetentionDays` default + any new `MSG.*` keys needed), `apps/web/Main.gs` (thin
  `apiBackupNow` pass-through, same pattern as other admin actions), `apps/web/ui/ViewsAdmin.html`
  (button + result display)
- Reference (read-only): `apps/api/Export.gs` (`exportFilename_`, corrected citation — Finding
  above), `apps/api/SheetsRepo.gs` (`getSpreadsheet_()`)
- Create tests: `tools/offline-tests/backup-job.test.js` (following the existing
  `tools/offline-tests/*.test.js` plain-`node`-no-framework convention)

## Implementation Steps

1. Read `apps/api/ExportJob.gs`, `apps/api/Export.gs` (for `exportFilename_`), `apps/api/
   SheetsRepo.gs` (for `getSpreadsheet_()`), and `apps/api/Setup.gs`'s `editorOnly` array in full
   before writing anything — match style exactly, and re-verify all line numbers cited above since
   they may have shifted.
2. Add `backupRetentionDays` (default 14) to `apps/api/Config.gs`'s Config defaults, alongside
   `exportRetentionDays_()`'s existing convention (readable helper, e.g. `backupRetentionDays_()`).
3. Create `apps/api/BackupJob.gs`:
   - `backupsParentFolder_()` — try `ScriptProperties`-stored `BACKUP_FOLDER_ID` first
     (`DriveApp.getFolderById`, try/catch for deleted/invalid), fall back to find-or-create-by-name
     only if the stored ID is absent or fails to resolve, storing the resulting ID afterward.
   - `backupFolderName_()` — timestamp subfolder naming.
   - `backupNow_()` — the core copy operation + `ScriptProperties` write of `lastBackupAt`/
     `lastBackupFolderUrl` on success.
   - `actionBackupNow_(user)` — permission check + call `backupNow_()`.
   - `runScheduledBackup_()` — try/catch around `backupNow_()`, then `cleanupOldBackups_()`.
   - `cleanupOldBackups_()` — newest-N floor + age-based cutoff for the rest.
   - `installBackupTrigger()` — idempotent trigger install.
4. Register `backupNow` in `apps/api/Router.gs`'s action map, pointing at `actionBackupNow_`.
5. Add `apiBackupNow` in `apps/web/Main.gs` (thin `handle_('apiBackupNow', function () { return
   apiCall_('backupNow', {}); })` pass-through, matching existing admin actions).
6. Add "Sao lưu ngay" button + result UI to `apps/web/ui/ViewsAdmin.html`, gated so it only renders
   when the current user has `manage_users`.
7. Add `installBackupTrigger`/`runScheduledBackup_`/`cleanupOldBackups_` to `apps/api/Setup.gs`'s
   `editorOnly` array (documentation/consistency with existing convention — this is not itself the
   HTTP-unreachability guarantee, see Finding 6's Key Insight above; the real guarantee is never
   adding these names to `Router.gs`'s `getActions_()`).
8. Create `tools/offline-tests/run-all.js`: a small plain-`node` script that discovers and
   `require()`s every `*.test.js` file in `tools/offline-tests/`, running each and exiting non-zero
   if any fail, with a one-line pass/fail summary per file.
9. Write `tools/offline-tests/backup-job.test.js`: cover folder-name/ID-persistence logic (stored
   ID missing/invalid/valid paths), retention-cutoff math (which folders get trashed vs kept given
   the newest-N floor, using a fixed/injectable "now"), the idempotent trigger-install logic
   (delete-before-create), and that `actionBackupNow_` refuses a non-admin user before touching
   Drive.
10. Run `node tools/offline-tests/run-all.js` — no regressions across any existing test file plus
    the new one.
11. Compile-check: push to a dev Apps Script deployment (or at minimum static review) to catch any
    GAS syntax errors before handing off to live verification (Phase 7).

## Success Criteria

- [ ] "Sao lưu ngay" button on the admin screen, visible only to `manage_users`, produces a new
      timestamped Drive folder containing a full copy of the live spreadsheet
- [ ] The copy opens independently in Sheets with all formulas/formatting/validation intact (spot
      check at least one formula-bearing column plus data validation on a dropdown column)
- [ ] A non-admin calling `backupNow` directly (bypassing the UI) is refused server-side
- [ ] `lastBackupAt`/`lastBackupFolderUrl` are written to `ScriptProperties` after every successful
      run (manual and scheduled), readable back in a later, unrelated execution
- [ ] Daily trigger installs without duplicating itself on repeated `installBackupTrigger()` calls
- [ ] A `backupNow_()` failure inside `runScheduledBackup_()` is caught and logged, never left as an
      uncaught trigger exception
- [ ] Retention cleanup always keeps the newest 3 backups regardless of age, and only trashes
      (never permanently deletes) backups beyond that floor once past `backupRetentionDays_()`
- [ ] `backupsParentFolder_()` resolves via the stored folder ID on the common path, and falls back
      to name-based lookup only when that ID is missing/invalid
- [ ] `tools/offline-tests/run-all.js` exists and runs every test file including
      `backup-job.test.js`; full run is green
- [ ] No new Vietnamese strings introduced in English (button label, success/error text) — see
      Phase 5 for the sweep, but write it right the first time

## Risk Assessment

- **Drive quota**: backup copies count against the deploying account's own Drive storage
  (`docs/IDENTITY.md`'s "Execute as: Me" account) — same account already used for exports, so no
  new party is exposed, but storage does grow. Retention cleanup (this phase's stretch item)
  directly mitigates this; if retention is somehow dropped from scope, flag unbounded growth as a
  known follow-up.
- **`makeCopy()` on a large spreadsheet**: confirmed fine at this data size per research (metadata-
  level copy, not cell-by-cell), but if `Orders`/`OrderLines` ever grow far beyond current volume
  (~100 orders/month), re-check execution time before assuming this scales forever.
- **Folder-ID property loss**: if `ScriptProperties`'s `BACKUP_FOLDER_ID` is ever cleared (e.g.
  manual Script Properties edit), `backupsParentFolder_()`'s fallback path recreates via name-lookup
  — acceptable degradation, not a hard failure, and self-heals on the next successful run.

## Security Considerations

- `manage_users` gate enforced server-side in `actionBackupNow_`, not just UI-hidden — same
  standard as every other admin action in this codebase.
- `runScheduledBackup_`/`cleanupOldBackups_`/`installBackupTrigger` are protected the same way every
  existing trigger-target function in this codebase is protected: never registered in `Router.gs`'s
  `getActions_()` action map. This is checked by code review now and reconfirmed at Phase 7
  signoff — it is not enforced by `guardSetup_()`/the `editorOnly` array, which are editor-run
  self-checks for a different class of function (see Key Insights, Finding 6). Do not describe this
  protection more strongly than that in any code comment or doc written during this phase.
- Backup folder link (`folderUrl`) returned to the client is a Drive URL scoped to whatever
  sharing permissions the backup account already has — no new sharing/exposure introduced by this
  feature.
