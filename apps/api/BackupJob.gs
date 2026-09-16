/**
 * BackupJob.gs — Milestone 6 / Phase 1: backup the live spreadsheet to
 * Drive, manually (admin button) or on a daily schedule, with retention
 * cleanup so old backups don't accumulate forever.
 *
 * "Restorable copy" here means Sheets' own copy semantics: DriveApp's
 * file-level makeCopy() produces a full, independent spreadsheet file
 * (formulas/formatting/data validation all intact), not a per-tab manual
 * export. That's also why this is a metadata-level Drive operation —
 * near-instant regardless of row count, nothing close to the 6-minute
 * execution ceiling ExportJob.gs exists to work around.
 *
 * There is no global SPREADSHEET_ID constant in this project — the source
 * spreadsheet is always resolved through SheetsRepo.gs's getSpreadsheet_(),
 * reused here exactly as every other file does.
 *
 * Folder-ID persistence (backupsParentFolder_): unlike ExportJob.gs's
 * exportsFolder_() (deliberately name-lookup-only, since a stray same-named
 * exports folder is low-stakes), the backup parent folder is the safety net
 * itself — a same-named stray folder redirecting new backups (or worse,
 * retention cleanup) into the wrong place is a real risk. The created
 * folder's id is persisted in ScriptProperties and read back first on every
 * call; only a missing/unresolvable stored id falls back to name-based
 * find-or-create.
 *
 * Retention (cleanupOldBackups_): always keeps the newest MIN_BACKUPS_KEPT
 * backups regardless of age — pure age-based pruning would let a silently
 * broken nightly trigger (quota, permission drift) wipe the entire safety
 * net the moment it eventually runs again with everything "too old" at
 * once. Only backups beyond that floor are subject to the age cutoff, and
 * only ever setTrashed(true) — never permanently deleted, same as
 * ExportJob.gs's cleanupExportJobs — so Drive's own 30-day recovery window
 * still applies to a mistaken trash.
 *
 * `runScheduledBackup_`/`cleanupOldBackups_`/`installBackupTrigger` are
 * protected the same way every other trigger-target function in this
 * codebase is: by never being added to Router.gs's getActions_() action
 * map. That omission — not guardSetup_()/the editorOnly array in Setup.gs
 * — is the actual thing that keeps them unreachable over HTTP; the
 * editorOnly array entry added for these three is documentation/
 * consistency only, not a stronger guarantee. Do not describe it more
 * strongly than that anywhere in this file.
 */

/** Drive folder that holds one timestamped subfolder per backup run. */
var BACKUP_FOLDER_NAME = 'Sao lưu THIÊN TÂN';

/** ScriptProperties key holding the backups parent folder's Drive file id,
 *  persisted the first time it's created/resolved so every later call is a
 *  direct getFolderById lookup instead of a name search (see file doc
 *  comment on why the backup folder needs this and exportsFolder_() doesn't). */
var BACKUP_FOLDER_ID_PROP_ = 'BACKUP_FOLDER_ID';

/** ScriptProperties keys for the last-run state, read back by any later,
 *  unrelated execution (Phase 3's signoff, a future status check) — a
 *  scheduled trigger's return value is discarded by Apps Script, and a
 *  manual run's return value only ever reaches the one HTTP caller that
 *  triggered it, so this is the only place either path can leave a durable
 *  trace of "did the last backup actually happen". */
var BACKUP_LAST_AT_PROP_ = 'lastBackupAt';
var BACKUP_LAST_FOLDER_URL_PROP_ = 'lastBackupFolderUrl';

/** Newest N backups are kept unconditionally by cleanupOldBackups_,
 *  regardless of age — see file doc comment for why a pure age cutoff is
 *  not safe on its own. */
var MIN_BACKUPS_KEPT = 3;

/**
 * Admin-only action: run a backup right now, on the calling admin's
 * request. Permission is re-checked here even though the client button is
 * already hidden for anyone without manage_users — the server never trusts
 * a hidden button, same standard as every other admin action.
 *
 * @return {{folderUrl:string, fileUrl:string, createdAt:string}}
 */
function actionBackupNow_(user) {
  requirePermission_(user, 'manage_users');
  return backupNow_();
}

/**
 * Core backup operation, shared by the manual action above and the
 * scheduled trigger below: resolves the backups parent folder, creates a
 * timestamped subfolder, copies the live spreadsheet into it, and persists
 * "last backup" state on success.
 *
 * @return {{folderUrl:string, fileUrl:string, createdAt:string}}
 */
function backupNow_() {
  var parent = backupsParentFolder_();
  var stamp = backupFolderName_();
  var subfolder = parent.createFolder(stamp);

  var ss = getSpreadsheet_();
  var copyName = ss.getName() + ' (' + stamp + ')';
  var copy = DriveApp.getFileById(ss.getId()).makeCopy(copyName, subfolder);

  var result = {
    folderUrl: subfolder.getUrl(),
    fileUrl: copy.getUrl(),
    createdAt: new Date().toISOString()
  };

  var props = PropertiesService.getScriptProperties();
  props.setProperty(BACKUP_LAST_AT_PROP_, result.createdAt);
  props.setProperty(BACKUP_LAST_FOLDER_URL_PROP_, result.folderUrl);

  return result;
}

/**
 * Resolves the Drive folder every backup subfolder is created inside.
 * Collision-safe lookup (Finding 13 of the phase plan): try the stored
 * folder id first, since DriveApp.getFoldersByName() matches by name across
 * the whole executing account's Drive and a same-named stray folder could
 * otherwise silently redirect backups (or retention cleanup) into the
 * wrong place. Only falls back to name-based find-or-create when the
 * stored id is missing or no longer resolves (folder deleted/trashed out
 * from under the property), and persists whatever id is resolved so the
 * next call takes the direct path again.
 */
function backupsParentFolder_() {
  var props = PropertiesService.getScriptProperties();
  var storedId = props.getProperty(BACKUP_FOLDER_ID_PROP_);

  if (storedId) {
    try {
      return DriveApp.getFolderById(storedId);
    } catch (err) {
      console.error('backupsParentFolder_: stored BACKUP_FOLDER_ID ' + storedId +
        ' no longer resolves (' + ((err && err.message) || err) + '); falling back to name lookup.');
    }
  }

  var it = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_FOLDER_NAME);
  props.setProperty(BACKUP_FOLDER_ID_PROP_, folder.getId());
  return folder;
}

/** One subfolder name per backup run: YYYY-MM-DD_HHmmss, second-granularity
 *  so two independent clicks in the same minute still get distinct
 *  subfolders. Drive tolerates duplicate folder names harmlessly either
 *  way (no crash, no data loss) — this is about readability, not
 *  uniqueness enforcement. */
function backupFolderName_() {
  var now = new Date();
  return now.getFullYear() + '-' + pad_(now.getMonth() + 1, 2) + '-' + pad_(now.getDate(), 2) +
    '_' + pad_(now.getHours(), 2) + pad_(now.getMinutes(), 2) + pad_(now.getSeconds(), 2);
}

/**
 * Trigger entry point (installed by installBackupTrigger). Runs outside any
 * HTTP request — it never passes through Router.gs's doPost catch or
 * Main.gs's handle_(), so nothing else in this codebase will ever see a
 * failure here unless this function surfaces it itself. backupNow_() is
 * therefore wrapped in its own try/catch, logging via console.error before
 * letting cleanupOldBackups_() run regardless of whether the backup itself
 * succeeded — a failed backup should not also block that day's retention
 * pass.
 */
function runScheduledBackup_() {
  try {
    backupNow_();
  } catch (err) {
    console.error('runScheduledBackup_: backupNow_ failed: ' +
      (err && err.stack ? err.stack : err));
  }
  cleanupOldBackups_();
}

/**
 * Retention cleanup: keeps the newest MIN_BACKUPS_KEPT backup subfolders
 * unconditionally, then trashes (never permanently deletes) any remaining
 * subfolder older than backupRetentionDays_(). See file doc comment for why
 * the newest-N floor exists — pure age-based pruning risks wiping the
 * entire safety net in one pass if the trigger silently stops succeeding
 * for longer than the retention window.
 *
 * Each subfolder is trashed inside its own try/catch so one bad/locked
 * record can't stop the rest of the sweep — same per-item discipline
 * ExportJob.gs's cleanupExportJobs uses.
 *
 * @return {string} one-line summary, logged and returned (mirrors
 *   cleanupExportJobs's own return shape).
 */
function cleanupOldBackups_() {
  var config = readPublicConfig_();
  var retentionMs = backupRetentionDays_(config) * 24 * 60 * 60 * 1000;
  var cutoff = Date.now() - retentionMs;

  var parent = backupsParentFolder_();
  var subfolders = [];
  var it = parent.getFolders();
  while (it.hasNext()) subfolders.push(it.next());

  // Newest first, so the first MIN_BACKUPS_KEPT entries are unconditionally
  // exempt regardless of how the cutoff below would otherwise treat them.
  subfolders.sort(function (a, b) {
    return b.getDateCreated().getTime() - a.getDateCreated().getTime();
  });

  var kept = 0, trashed = 0, failed = 0;
  subfolders.forEach(function (folder, i) {
    if (i < MIN_BACKUPS_KEPT) { kept++; return; }
    if (folder.getDateCreated().getTime() > cutoff) { kept++; return; }

    try {
      folder.setTrashed(true);
      trashed++;
    } catch (err) {
      failed++;
      console.error('cleanupOldBackups_: could not trash backup folder ' +
        folder.getName() + ': ' + ((err && err.message) || err));
    }
  });

  var summary = 'cleanupOldBackups_: kept ' + kept + ', trashed ' + trashed +
    ', ' + failed + ' failure(s).';
  console.log(summary);
  return summary;
}

/** Days a backup subfolder is kept (beyond the MIN_BACKUPS_KEPT floor)
 *  before cleanupOldBackups_ trashes it, read from the Config sheet the
 *  same way exportRetentionDays_ reads its own value — falls back to 14
 *  days for a missing/invalid config row rather than refusing to clean up
 *  at all. */
function backupRetentionDays_(config) {
  var n = parseInt(config && config.backupRetentionDays, 10);
  return (n > 0) ? n : 14;
}

/**
 * Run once from the editor to install the daily backup trigger. Same
 * idempotent delete-then-recreate pattern as
 * installExportJobCleanupReminder()/installExpiryReminder(): deletes any
 * existing runScheduledBackup_ trigger first, so re-running this never
 * stacks up duplicate daily triggers.
 */
function installBackupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runScheduledBackup_') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runScheduledBackup_').timeBased().everyDays(1).atHour(2).create();
  return 'Daily backup installed (02:00 Asia/Ho_Chi_Minh).';
}
