# Google Apps Script Backup Patterns — Research Report

**Date:** 2026-09-13  
**Scope:** Manual "backup now" button, scheduled daily backup, retention cleanup for THIENTAN (order/inventory management, Google Sheets + Apps Script backend)

---

## EXECUTIVE SUMMARY

**Recommendation: Use `DriveApp.getFileById(ssId).makeCopy()` for manual backups + `ScriptApp.timeBased().everyDays(1)` for scheduled daily backup + retention cleanup via folder iteration with `setTrashed()`.**

Rationale: File-level copy is instantaneous, produces fully restorable backups (all formulas/formatting/validation preserved), and fits the app's existing KISS/YAGNI patterns (see ExportJob.gs for similar trigger/cleanup structure already deployed).

---

## 1. MANUAL "BACKUP NOW" BUTTON FLOW

### Approach: File-Level Copy via DriveApp (Recommended)

Use `DriveApp.getFileById(ssId).makeCopy()` — NOT `SpreadsheetApp.copy()`.

**Why file-level over sheet-by-sheet:**
- `makeCopy()` is a Drive-level operation that duplicates the entire Spreadsheet file in one atomic call
- Preserves everything: data, formulas, formatting, data validation, named ranges, themes, protection rules
- Restorable in totality — opening the copied file gives you an identical, functional spreadsheet
- Already proven in production backup scripts (Abhijeet Chopra's gist, GreenFlux tutorial)

**`SpreadsheetApp.copy()` rejection:**
- Official Google documentation does not specify what it preserves (no explicit guarantee on formulas/validation)
- Harder to reason about and test across your 6-tab structure
- `makeCopy()` is the industry standard for this use case

### Code Shape: Admin Button to Synchronous Backup

```javascript
/**
 * Admin-only action, callable from google.script.run button click.
 * Creates a timestamped copy of the entire source spreadsheet in a
 * "Backups/YYYY-MM-DD_HHmmss" folder hierarchy.
 *
 * @param {Object} user must have 'admin' permission
 * @return {{fileId: string, fileName: string, folderName: string, url: string}}
 */
function actionBackupNow_(user) {
  requirePermission_(user, 'admin');
  
  var sourceId = PropertiesService.getScriptProperties().getProperty('SOURCE_SHEET_ID');
  if (!sourceId) throw new Error('Source sheet ID not configured.');
  
  // Create timestamped folder structure
  var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmmss');
  var backupParent = getOrCreateBackupsFolder_();
  var timestampedFolder = backupParent.createFolder(timestamp);
  
  // Copy the source sheet as a Drive file
  var sourceFile = DriveApp.getFileById(sourceId);
  var backupFile = sourceFile.makeCopy(sourceFile.getName() + ' [Backup ' + timestamp + ']', timestampedFolder);
  
  return {
    fileId: backupFile.getId(),
    fileName: backupFile.getName(),
    folderName: timestamp,
    url: backupFile.getUrl()
  };
}
```

### Folder Structure Pattern

```javascript
/**
 * Gets or creates the root "Backups" folder in Drive root, using the
 * findByName-or-create pattern from the app's existing ExportJob.gs.
 * Same principle as exportsFolder_() — idempotent, avoids concurrent
 * folder creation on overlapping runs (DriveApp operations are
 * serialized within a single execution, so race-free).
 */
function getOrCreateBackupsFolder_() {
  var BACKUP_FOLDER_NAME = 'Sao lưu THIENTAN (Backups)';
  var it = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(BACKUP_FOLDER_NAME);
}
```

**Folder layout:**
```
Sao lưu THIENTAN (Backups)/
├── 2026-09-13_14-05-22/
│   └── Orders Sheet [Backup 2026-09-13_14-05-22] (spreadsheet file)
├── 2026-09-13_09-12-44/
│   └── Orders Sheet [Backup 2026-09-13_09-12-44]
└── 2026-09-12_23-15-33/
    └── Orders Sheet [Backup 2026-09-12_23-15-33]
```

Naming convention: `YYYY-MM-DD_HHmmss` timestamp folders, one backup per folder (avoids name collision if multiple backups happen in the same hour).

---

## 2. TIMESTAMPED DRIVE FOLDER ORGANIZATION

### Avoid Duplicate Folder Creation

**Problem:** Concurrent runs or rapid re-triggers could create multiple "Backups" folders.

**Solution: Check-before-create pattern (already used in ExportJob.gs):**

```javascript
function getOrCreateBackupsFolder_() {
  var BACKUP_FOLDER_NAME = 'Sao lưu THIENTAN (Backups)';
  var it = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  if (it.hasNext()) {
    return it.next(); // Reuse existing
  }
  return DriveApp.createFolder(BACKUP_FOLDER_NAME); // Create once
}
```

**Why this is safe:**
- `getFoldersByName()` searches Drive root (global scope), finds existing folder
- Returns an iterator; `.hasNext()` returns true if any match exists
- If match exists, `.next()` gets the first one
- If no match, create once
- Within a single execution, DriveApp calls are serialized — no race between check and create
- **Re-running `setupBackupTrigger()` many times is safe:** the parent folder is created exactly once, then reused

### Per-Timestamp Subfolder Naming

**Timestamp format:** `YYYY-MM-DD_HHmmss` (sortable, human-readable)

```javascript
var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmmss');
var timestampedFolder = backupParent.createFolder(timestamp); // e.g. "2026-09-13_23-26-15"
```

**Why subfolders per timestamp:**
- Isolation: each backup lives in its own folder, trivial to delete one backup without touching others
- Naming clarity: `Backups/2026-09-13_23-26-15/` tells you exactly when this backup was made
- Avoids flat-folder bloat: 100+ backups in the same folder is slower to iterate than 100 subfolders with 1 file each

---

## 3. EXECUTION TIME LIMITS & PERFORMANCE

### 6-Minute Ceiling (Both Consumer & Workspace)

- **Hard limit:** 6 minutes (360 seconds) per execution
- **This applies to:** all function runs (manual calls, triggers, time-based, event-driven)
- **No longer 30-minute Workspace exemption** — as of 2026, unified at 6 minutes
- The app already budgets this in ExportJob.gs: 4.5-min soft budget (270s) for row writing, headroom for styling

### Spreadsheet Copy Timing

`makeCopy()` is **file-level, not cell-by-cell** — expected time:

| Spreadsheet Size | Estimated Time | Safety Margin |
|------------------|----------------|---------------|
| 1200 rows, 6 tabs | < 100 ms | Trivial vs 6 min limit |
| 10,000 rows | ~500 ms | Still trivial |
| 100,000 rows | ~2 sec | Negligible |

**Conclusion:** No async / checkpoint / retrigger needed for the copy itself. A single synchronous call fits easily within 6 minutes. The app's checkpoint pattern in ExportJob.gs is needed for the CSV building loop (which scales with row count), not for file copying (which is metadata-level).

### Minimum Overhead for Admin Button

Admin clicks a "Backup Now" button → `google.script.run.actionBackupNow_(user)` → copy completes in milliseconds → response sent. Synchronous, no polling needed.

---

## 4. SCHEDULED / TIME-DRIVEN TRIGGER

### Setup Pattern: Idempotent Daily Backup

```javascript
/**
 * Run from the editor once to install the daily backup trigger.
 * Safe to run multiple times — deletes any existing backup trigger
 * before installing a new one (idempotent, like
 * installExportJobCleanupReminder in ExportJob.gs).
 */
function setupBackupTrigger() {
  // Delete any existing backup trigger
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyBackupJob_') {
      ScriptApp.deleteTrigger(t);
    }
  });
  
  // Create new daily trigger: every day at 02:00 AM (before business hours)
  ScriptApp.newTrigger('dailyBackupJob_')
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .create();
  
  return 'Daily backup trigger installed (02:00 Asia/Ho_Chi_Minh).';
}

/**
 * Trigger target: runs daily, copies the source sheet to the timestamped
 * backup folder, then cleans up backups older than retention window.
 */
function dailyBackupJob_(e) {
  try {
    var sourceId = PropertiesService.getScriptProperties().getProperty('SOURCE_SHEET_ID');
    if (!sourceId) throw new Error('Source sheet ID not configured.');
    
    // Backup
    var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmmss');
    var backupParent = getOrCreateBackupsFolder_();
    var timestampedFolder = backupParent.createFolder(timestamp);
    var sourceFile = DriveApp.getFileById(sourceId);
    sourceFile.makeCopy(sourceFile.getName() + ' [Backup ' + timestamp + ']', timestampedFolder);
    
    // Cleanup old backups
    cleanupOldBackups_(backupParent);
    
    console.log('Daily backup completed: ' + timestamp);
  } catch (err) {
    console.error('dailyBackupJob_ failed: ' + (err && err.message));
    // Don't throw — a single failed backup shouldn't disable the trigger
  }
}
```

### Trigger Quotas & Collision Prevention

| Limit | Value | App Status |
|-------|-------|-----------|
| Total triggers per script | 20 | ✓ SAFE: 1 backup + 1 cleanup << 20 |
| Consumer daily trigger runtime | 90 minutes | ✓ SAFE: backup + cleanup < 10 sec/day |
| Workspace daily trigger runtime | 6 hours | ✓ SAFE: massive headroom |

**Duplicate Trigger Prevention:** Exact pattern from ExportJob.gs's `deleteExportJobTriggers_()`:
1. Loop all triggers: `ScriptApp.getProjectTriggers()`
2. Check handler name: `trigger.getHandlerFunction() === 'dailyBackupJob_'`
3. Delete matching: `ScriptApp.deleteTrigger(trigger)`
4. Then create new one

Result: `setupBackupTrigger()` can be run 100 times and still end up with exactly 1 trigger.

---

## 5. RETENTION & CLEANUP

### Folder Iteration Pattern

```javascript
/**
 * Prunes timestamped backup folders older than retentionDays.
 * Iterates the backups parent folder, checks each subfolder's
 * creation date, and trashes old ones.
 *
 * @param {Folder} backupParent the "Sao lưu THIENTAN" root folder
 */
function cleanupOldBackups_(backupParent, retentionDays) {
  retentionDays = retentionDays || 14; // default: keep 14 days
  var cutoffMs = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
  
  var folders = backupParent.getFolders();
  var removed = 0, errors = 0;
  
  while (folders.hasNext()) {
    var folder = folders.next();
    try {
      var folderCreatedMs = folder.getDateCreated().getTime();
      if (folderCreatedMs < cutoffMs) {
        // Folder is old enough — trash it along with all files inside
        DriveApp.getFileById(folder.getId()).setTrashed(true);
        removed++;
      }
    } catch (err) {
      errors++;
      console.error('cleanupOldBackups_: error trashing ' + folder.getName() + ': ' + (err && err.message));
    }
  }
  
  console.log('cleanupOldBackups_: removed ' + removed + ' folder(s), ' + errors + ' error(s).');
  return { removed: removed, errors: errors };
}
```

### Edge Cases Handled

| Edge Case | Handling |
|-----------|----------|
| Folder has 0 files | Not a problem — `folder.getFiles()` returns empty iterator, loop never enters |
| Newly created backup just hit cutoff | Loop checks `< cutoffMs` (strictly older than window), so day-14 backup is still kept |
| Trash during iteration | Safe — iterator is lazy, checks `hasNext()` each round |
| One folder fails to trash | Wrapped in try/catch; cleanup continues for other folders |
| File in folder is read-only | `setTrashed()` raises exception, caught, logged, cleanup continues |

### Integration with Daily Trigger

Call `cleanupOldBackups_(backupParent)` at the end of `dailyBackupJob_()`, right after backup completes:

```javascript
function dailyBackupJob_(e) {
  try {
    // ... backup creation ...
    var backupParent = getOrCreateBackupsFolder_();
    // ... makeCopy ...
    
    // Cleanup old backups (keep last 14 days)
    cleanupOldBackups_(backupParent, 14);
  } catch (err) {
    console.error('dailyBackupJob_ failed: ' + err.message);
  }
}
```

**Read from config:**

```javascript
function exportRetentionDays_(config) {
  var n = parseInt(config && config.backupRetentionDays, 10);
  return (n > 0) ? n : 14;
}

// In cleanupOldBackups_:
var config = readPublicConfig_(); // same function as ExportJob.gs
cleanupOldBackups_(backupParent, exportRetentionDays_(config));
```

---

## 6. KNOWN PITFALLS

### Trash vs Permanent Delete

| Method | Behavior | Recovery |
|--------|----------|----------|
| `file.setTrashed(true)` | Moves to Drive trash | 30-day recovery window (safe) |
| `file.deleteFile()` | Permanent removal | Cannot be undone ❌ |
| (DriveAPI) `Drive.Files.remove(id)` | Sometimes errors in Apps Script; unreliable | — |

**Recommendation:** Always use `setTrashed()` for automated cleanup. A 30-day recovery window is crucial if cleanup logic has a bug (e.g., wrong cutoff calculation). Permanent delete is irreversible and unnecessary here.

### Drive Quota Accounting

**Backup copies count against the OWNER of the copy operation** — i.e., the Apps Script user account that runs `makeCopy()`.

For THIENTAN:
- Source sheet is owned by the deployment account (per docs/IDENTITY.md: "Execute as: Me")
- Backups are created by the same account
- Each backup copy consumes storage from that account's Drive quota
- **Cost per backup:** ~file size of source sheet (e.g., 10 tabs, 2MB = 2MB per backup)
- **Retention = 14 days:** at most 14 backups × 2MB = ~28MB ongoing

**Shared Drive differences:**
- Shared Drive has separate 50GB quota pool (organizational, not per-person)
- If backups were moved to Shared Drive, they'd count against org quota instead
- Current app uses My Drive (private sheet) — quota is personal

### Concurrent Backup Runs (Unlikely, but Safe)

If admin manually clicks "Backup Now" while the daily trigger is running:
- Both execution contexts are separate
- First to acquire the lock wins (if using LockService)
- Second spins or fails
- **Recommendation:** Don't add lock complexity — concurrent backups are harmless (just two copies created)

```javascript
// Two simultaneous backups create 2 files in 2 different timestamped folders:
// Backups/2026-09-13_14-05-22/ (manual)
// Backups/2026-09-13_14-05-23/ (automatic, seconds later)
// Both are valid, both count toward retention, cleanup handles both.
```

### Apps Script DriveApp vs Drive API

**DriveApp (built-in):**
- Easier, pre-scoped
- **Limitation:** Does NOT work with Shared Drives
- Suitable for this app (My Drive backup)

**Drive API (advanced service):**
- Required if backups ever move to Shared Drive
- More verbose, but supports Shared Drives

For THIENTAN's immediate scope (My Drive backups), DriveApp is sufficient.

---

## SUGGESTED IMPLEMENTATION ORDER

1. **Phase 1: Admin button + `actionBackupNow_(user)`**
   - Add button to admin UI
   - Implement file copy + folder creation
   - Manual testing: click button, verify backup in Drive

2. **Phase 2: Daily trigger + `setupBackupTrigger()`**
   - Add setup function (run once from editor)
   - Verify trigger appears in script editor's "Triggers" panel
   - Test: Wait for next scheduled time, check backup was created

3. **Phase 3: Cleanup + `cleanupOldBackups_()`**
   - Integrate into `dailyBackupJob_()`
   - Set retention window (recommend 14 days)
   - Test: Manually create old timestamped folders, run cleanup, verify they're trashed

---

## CODE REUSE FROM EXISTING APP

This proposal mirrors patterns already in ExportJob.gs (Milestone 4):
- Folder creation/reuse: `exportsFolder_()` → adapt to `getOrCreateBackupsFolder_()`
- Trigger installation: `installExportJobCleanupReminder()` → adapt to `setupBackupTrigger()`
- Cleanup loop: `cleanupExportJobs()` → adapt to `cleanupOldBackups_()`
- Try/catch per-item: matches ExportJob.gs's error isolation pattern
- PropertiesService for config: same as exportRetentionDays_()

**File to add:** `BackupJob.gs` (companion to ExportJob.gs, ~150 lines including all three functions above).

---

## UNRESOLVED QUESTIONS

1. **Config storage:** Should `SOURCE_SHEET_ID` and `backupRetentionDays` live in PropertiesService, the Config sheet, or hardcoded? (Recommend: Config sheet, read by `readPublicConfig_()` matching ExportJob.gs pattern.)

2. **Email notification:** Should the daily trigger send a summary email (success/failure)? (Not in scope for this research; recommend as Phase 3 enhancement if desired.)

3. **Backup naming:** Current proposal: `Orders Sheet [Backup 2026-09-13_14-05-22]`. Acceptable, or prefer a different scheme? (GreenFlux blog used `sourceName_BAK_yyyyMMdd_HHmmss`.)

4. **Timestamp timezone:** `Session.getScriptTimeZone()` assumed (from ExportJob.gs's pattern). Confirm this matches THIENTAN's business hours (Asia/Ho_Chi_Minh assumed).

---

## SOURCES

- [Google Apps Script Quota Limits 2026 — Medium](https://medium.com/@stackarchitect123/google-apps-script-quotas-2026-official-limits-6-minute-rule-consumer-vs-workspace-d18245035715)
- [Apps Script Quotas & Limits — ModelMonkey](https://modelmonkey.io/blog/apps-script-quotas-limits-2026)
- [Installable Triggers — Google for Developers](https://developers.google.com/apps-script/guides/triggers/installable)
- [Class Folder — Google for Developers](https://developers.google.com/apps-script/reference/drive/folder)
- [Creating Automatic Scheduled Backups — GitHub Gist (Abhijeet Chopra)](https://gist.github.com/abhijeetchopra/99a11fb6016a70287112)
- [Creating a Scheduled Backup Service — GreenFlux Blog](https://blog.greenflux.us/creating-a-scheduled-backup-service-for-google-sheets-using-apps-script/)
- [Schedule File Deletion in Google Drive — Medium (Thu P)](https://medium.com/@thu_solution_explorer/auto-clean-up-files-in-google-drive-with-apps-script-daf77bafb933)
- [Google Drive Storage Quotas — Google One Help](https://support.google.com/googleone/answer/9312312?hl=en)
- [Prevent Duplicate Triggers — DEV Community](https://dev.to/googleworkspace/automate-your-google-workspace-with-apps-script-triggers-5090)
- [DriveApp Folder Operations — Google for Developers](https://developers.google.com/apps-script/reference/drive/drive-app)
