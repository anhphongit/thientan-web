/**
 * Offline tests for Milestone 6 / Phase 1 — BackupJob.gs's backup-to-Drive
 * logic (manual button, scheduled trigger, retention cleanup). Uses the
 * shared harness (harness.js), which now also loads BackupJob.gs and stubs
 * a richer DriveApp (nested folders, getFolderById, folder.setTrashed,
 * getDateCreated) plus a minimal getSpreadsheet_() stand-in — see harness.js
 * doc comments on fakeDriveFolderRecords/makeFakeFolder/getSpreadsheet_ for
 * why those exist.
 *
 * Run with: node tools/offline-tests/backup-job.test.js
 */
const H = require('./harness.js');
const { user, check, eq, throws } = H;

const DAY_MS = 24 * 60 * 60 * 1000;

/* ---------- 1. backupsParentFolder_ — missing stored id: creates + persists ---------- */
console.log('\n1. backupsParentFolder_ — no stored BACKUP_FOLDER_ID yet: creates by name and persists the id');
{
  const env = H.makeEnv();
  const props = env.PropertiesService.getScriptProperties();

  check('no BACKUP_FOLDER_ID set yet', props.getProperty(env.BACKUP_FOLDER_ID_PROP_) === null);

  const folder = env.backupsParentFolder_();
  check('folder created with the expected name', folder.getName() === env.BACKUP_FOLDER_NAME);
  check('BACKUP_FOLDER_ID persisted after first resolution',
    props.getProperty(env.BACKUP_FOLDER_ID_PROP_) === folder.getId());
}

/* ---------- 2. backupsParentFolder_ — valid stored id: uses it directly, ignores a same-named stray ---------- */
console.log('\n2. backupsParentFolder_ — a valid stored id wins over a same-named stray folder (Finding 13)');
{
  const env = H.makeEnv();
  const original = env.backupsParentFolder_();
  const originalId = original.getId();

  // Simulate a same-named stray folder appearing later (human accident,
  // another script, a manual Drive action) — DriveApp.createFolder here
  // also happens to overwrite the name->id index, exactly the collision
  // Finding 13 describes.
  const stray = env.DriveApp.createFolder(env.BACKUP_FOLDER_NAME);
  check('sanity: the stray folder is a different id', stray.getId() !== originalId);

  const resolved = env.backupsParentFolder_();
  check('resolves back to the ORIGINAL folder via the stored id, not the stray one',
    resolved.getId() === originalId);
}

/* ---------- 3. backupsParentFolder_ — invalid/stale stored id falls back to name lookup ---------- */
console.log('\n3. backupsParentFolder_ — a stored id that no longer resolves falls back to name-based find-or-create');
{
  const env = H.makeEnv();
  const props = env.PropertiesService.getScriptProperties();
  props.setProperty(env.BACKUP_FOLDER_ID_PROP_, 'no-such-folder-id');

  const folder = env.backupsParentFolder_();
  check('falls back to a real, name-matched folder', folder.getName() === env.BACKUP_FOLDER_NAME);
  check('BACKUP_FOLDER_ID re-persisted to the newly resolved (valid) id',
    props.getProperty(env.BACKUP_FOLDER_ID_PROP_) === folder.getId());

  // Second call now takes the direct id path again — same folder, no
  // second name lookup/create.
  const again = env.backupsParentFolder_();
  check('subsequent call resolves to the same folder', again.getId() === folder.getId());
}

/* ---------- 4. backupNow_ — produces a folder + file, persists last-backup state ---------- */
console.log('\n4. backupNow_ — creates a timestamped subfolder + spreadsheet copy, persists lastBackupAt/lastBackupFolderUrl');
{
  const env = H.makeEnv();
  const props = env.PropertiesService.getScriptProperties();

  const result = env.backupNow_();
  check('result has a folderUrl', typeof result.folderUrl === 'string' && result.folderUrl.length > 0);
  check('result has a fileUrl', typeof result.fileUrl === 'string' && result.fileUrl.length > 0);
  check('result has a createdAt timestamp', typeof result.createdAt === 'string' && result.createdAt.length > 0);

  check('lastBackupAt persisted to ScriptProperties',
    props.getProperty(env.BACKUP_LAST_AT_PROP_) === result.createdAt);
  check('lastBackupFolderUrl persisted to ScriptProperties',
    props.getProperty(env.BACKUP_LAST_FOLDER_URL_PROP_) === result.folderUrl);

  const parent = env.backupsParentFolder_();
  const it = parent.getFolders();
  let count = 0;
  while (it.hasNext()) { it.next(); count++; }
  check('exactly one subfolder created under the parent for this one run', count === 1);
}

/* ---------- 5. actionBackupNow_ — permission enforcement, never touches Drive when denied ---------- */
console.log('\n5. actionBackupNow_ refuses a non-admin before touching Drive');
{
  const env = H.makeEnv();
  const props = env.PropertiesService.getScriptProperties();
  const staff = user('staff@x.com', { manage_users: false });

  throws('refused without manage_users', () => env.actionBackupNow_(staff, {}), 'quyền');

  check('no BACKUP_FOLDER_ID was ever created', props.getProperty(env.BACKUP_FOLDER_ID_PROP_) === null);
  check('no lastBackupAt was ever written', props.getProperty(env.BACKUP_LAST_AT_PROP_) === null);
  check('no Drive folder records exist at all', Object.keys(env.fakeDriveFolderRecords).length === 0);

  const admin = user('admin@x.com', { manage_users: true });
  const result = env.actionBackupNow_(admin, {});
  check('an admin succeeds and gets the same shape as backupNow_', typeof result.folderUrl === 'string');
}

/* ---------- 6. cleanupOldBackups_ — always keeps the newest MIN_BACKUPS_KEPT regardless of age ---------- */
console.log('\n6. cleanupOldBackups_ — newest-N floor exempts recent AND ancient backups alike when fewer than N exist');
{
  const env = H.makeEnv();
  env.backupNow_();
  env.backupNow_();
  check('sanity: exactly 2 backups exist (fewer than MIN_BACKUPS_KEPT=' + env.MIN_BACKUPS_KEPT + ')', (() => {
    const it = env.backupsParentFolder_().getFolders();
    let n = 0; while (it.hasNext()) { it.next(); n++; }
    return n === env.MIN_BACKUPS_KEPT - 1;
  })());

  // Backdate BOTH far past any reasonable retention window.
  Object.keys(env.fakeDriveFolderRecords).forEach(id => {
    const rec = env.fakeDriveFolderRecords[id];
    if (rec.name !== env.BACKUP_FOLDER_NAME) rec.dateCreated = new Date(Date.now() - 999 * DAY_MS);
  });

  const summary = env.cleanupOldBackups_();
  check('summary reports 0 trashed', summary.indexOf('trashed 0') >= 0);
  check('summary reports 2 kept (both under the floor)', summary.indexOf('kept 2') >= 0);

  const it2 = env.backupsParentFolder_().getFolders();
  let stillThere = 0;
  while (it2.hasNext()) { if (!it2.next().isTrashed()) stillThere++; }
  check('both ancient backups remain untrashed — the floor overrides age', stillThere === 2);
}

/* ---------- 7. cleanupOldBackups_ — beyond the floor, only the age-expired ones are trashed ---------- */
console.log('\n7. cleanupOldBackups_ — beyond the newest-3 floor, only backups older than backupRetentionDays_ are trashed');
{
  const env = H.makeEnv({ backupRetentionDays: '14' });
  // 5 backups: newest 3 exempt by the floor; of the remaining 2 (oldest),
  // only the ones past the 14-day retention window should be trashed.
  const subfolderIds = [];
  for (let i = 0; i < 5; i++) {
    env.backupNow_();
  }
  const parentFolders = () => {
    const it = env.backupsParentFolder_().getFolders();
    const out = [];
    while (it.hasNext()) out.push(it.next());
    return out;
  };
  const all = parentFolders();
  eq('sanity: 5 backup subfolders exist', all.length, 5);

  // Sort oldest-created first isn't guaranteed distinct (created within the
  // same tick) — assign strictly increasing dateCreated so rank is
  // unambiguous, oldest at index 0.
  all.forEach((folder, i) => {
    env.fakeDriveFolderRecords[folder.getId()].dateCreated = new Date(Date.now() - (5 - i) * DAY_MS);
  });
  const oldestTwoIds = all.slice(0, 2).map(f => f.getId());
  const newestThreeIds = all.slice(2).map(f => f.getId());

  // Push only the two OLDEST past the 14-day retention window.
  oldestTwoIds.forEach(id => {
    env.fakeDriveFolderRecords[id].dateCreated = new Date(Date.now() - 20 * DAY_MS);
  });

  const summary = env.cleanupOldBackups_();
  check('summary reports 2 trashed', summary.indexOf('trashed 2') >= 0);
  check('summary reports 3 kept', summary.indexOf('kept 3') >= 0);

  oldestTwoIds.forEach(id => {
    check('oldest backup ' + id + ' was trashed', env.fakeDriveFolderRecords[id].trashed === true);
  });
  newestThreeIds.forEach(id => {
    check('newest backup ' + id + ' was kept (floor), regardless of retention math', env.fakeDriveFolderRecords[id].trashed === false);
  });
}

/* ---------- 8. backupRetentionDays_ config parsing ---------- */
console.log('\n8. backupRetentionDays_ config parsing — same fallback shape as exportRetentionDays_');
{
  const env = H.makeEnv();
  eq('falls back to 14 for a missing config value', env.backupRetentionDays_({}), 14);
  eq('falls back to 14 for a non-numeric config value', env.backupRetentionDays_({ backupRetentionDays: 'abc' }), 14);
  eq('falls back to 14 for zero/negative', env.backupRetentionDays_({ backupRetentionDays: '-3' }), 14);
  eq('uses a valid configured value', env.backupRetentionDays_({ backupRetentionDays: '30' }), 30);
}

/* ---------- 9. installBackupTrigger — idempotent (delete-before-create) ---------- */
console.log('\n9. installBackupTrigger — installs one daily trigger, re-running stays idempotent');
{
  const env = H.makeEnv();
  env.installBackupTrigger();
  let triggers = env.fakeTriggers.filter(t => t.handlerFunction === 'runScheduledBackup_');
  check('exactly one runScheduledBackup_ trigger installed', triggers.length === 1);
  check('scheduled daily', triggers[0].everyDays === 1);
  check('scheduled at hour 2', triggers[0].atHour === 2);

  env.installBackupTrigger();
  env.installBackupTrigger();
  triggers = env.fakeTriggers.filter(t => t.handlerFunction === 'runScheduledBackup_');
  check('re-running twice more still leaves exactly one trigger', triggers.length === 1);
}

/* ---------- 10. runScheduledBackup_ — a backupNow_ failure is caught, logged, never left uncaught ---------- */
console.log('\n10. runScheduledBackup_ — a backupNow_ failure is caught and does not propagate; cleanup still runs');
{
  const env = H.makeEnv();
  const props = env.PropertiesService.getScriptProperties();

  // Pre-warm the parent folder so cleanupOldBackups_'s own folder
  // resolution doesn't depend on the DriveApp method we're about to break —
  // isolates the simulated failure to backupNow_'s copy step specifically.
  env.backupsParentFolder_();

  const originalGetFileById = env.DriveApp.getFileById;
  env.DriveApp.getFileById = function () { throw new Error('Simulated Drive quota error'); };

  let threw = false;
  try { env.runScheduledBackup_(); } catch (e) { threw = true; }
  check('runScheduledBackup_ never throws even though backupNow_ failed', !threw);
  check('no lastBackupAt written since the backup itself failed',
    props.getProperty(env.BACKUP_LAST_AT_PROP_) === null);

  env.DriveApp.getFileById = originalGetFileById;
}

/* ---------- 11. runScheduledBackup_ — happy path writes last-backup state same as the manual action ---------- */
console.log('\n11. runScheduledBackup_ — happy path persists lastBackupAt/lastBackupFolderUrl same as the manual button');
{
  const env = H.makeEnv();
  const props = env.PropertiesService.getScriptProperties();

  env.runScheduledBackup_();
  check('lastBackupAt written after a successful scheduled run',
    typeof props.getProperty(env.BACKUP_LAST_AT_PROP_) === 'string');
  check('lastBackupFolderUrl written after a successful scheduled run',
    typeof props.getProperty(env.BACKUP_LAST_FOLDER_URL_PROP_) === 'string');

  // Readable back in a later, unrelated call — the whole point of Finding 1
  // (a trigger's own return value is discarded by Apps Script).
  const lastAt = props.getProperty(env.BACKUP_LAST_AT_PROP_);
  const stillThere = env.PropertiesService.getScriptProperties().getProperty(env.BACKUP_LAST_AT_PROP_);
  check('state survives being read back in a separate call', stillThere === lastAt);
}

H.done();
