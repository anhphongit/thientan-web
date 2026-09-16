/**
 * Offline tests for Milestone 6 / Phase 3 (stretch) — admin system-health
 * panel (SystemHealth.gs). Uses the shared harness (harness.js), which now
 * also loads SystemHealth.gs and BackupJob.gs (for the ScriptProperties
 * keys the panel reads back).
 */
const H = require('./harness.js');

console.log('\nactionSystemHealth_ — permission gate');
(function () {
  const env = H.makeEnv();
  const admin = H.user('admin@x.com', { manage_users: true });
  const employee = H.user('nhanvien@x.com', { manage_users: false });

  H.throws('a non-admin cannot call systemHealth',
    () => env.actionSystemHealth_(employee),
    env.MSG.NO_PERMISSION);

  let threw = null;
  try { env.actionSystemHealth_(admin); } catch (err) { threw = err; }
  H.check('an admin can call systemHealth without throwing', threw === null,
    threw && threw.message);
})();

console.log('\nactionSystemHealth_ — last backup status (Phase 1 ScriptProperties)');
(function () {
  const env = H.makeEnv();
  const admin = H.user('admin@x.com', { manage_users: true });

  let result = env.actionSystemHealth_(admin);
  H.eq('no backup yet: lastBackup.at is empty', result.lastBackup.at, '');
  H.eq('no backup yet: lastBackup.folderUrl is empty', result.lastBackup.folderUrl, '');

  const props = env.PropertiesService.getScriptProperties();
  props.setProperty('lastBackupAt', '2026-09-15T02:00:00.000Z');
  props.setProperty('lastBackupFolderUrl', 'https://drive.example/folder/backup-1');

  result = env.actionSystemHealth_(admin);
  H.eq('lastBackup.at reads back the persisted ScriptProperties value',
    result.lastBackup.at, '2026-09-15T02:00:00.000Z');
  H.eq('lastBackup.folderUrl reads back the persisted ScriptProperties value',
    result.lastBackup.folderUrl, 'https://drive.example/folder/backup-1');
})();

console.log('\ndevLogErrorCounts_ — windowing math');
(function () {
  const env = H.makeEnv();
  const now = Date.now();
  const hours = (n) => new Date(now - n * 60 * 60 * 1000);

  env.store.DevLog = [
    { timestamp: hours(1), level: 'error', source: 'ApiClient', actor: 'a@x.com', message: 'm', detail: '' },
    { timestamp: hours(23), level: 'error', source: 'listOrders', actor: 'b@x.com', message: 'm', detail: '' },
    { timestamp: hours(25), level: 'error', source: 'ApiClient', actor: 'a@x.com', message: 'm', detail: '' },
    { timestamp: hours(24 * 6), level: 'error', source: 'createOrder', actor: 'c@x.com', message: 'm', detail: '' },
    { timestamp: hours(24 * 8), level: 'error', source: 'ApiClient', actor: 'a@x.com', message: 'm', detail: '' },
    // Non-error levels must never be counted, regardless of age.
    { timestamp: hours(1), level: 'info', source: 'web', actor: 'a@x.com', message: 'm', detail: '' }
  ];

  const counts = env.devLogErrorCounts_();
  H.eq('last24h counts only error rows within 24h (2 of 6)', counts.last24h, 2);
  H.eq('last7d counts only error rows within 7d (4 of 6)', counts.last7d, 4);
})();

console.log('\ndevLogErrorCounts_ — combined web+api source, by construction');
(function () {
  // Corrected design (2026-09-16, see SystemHealth.gs's file doc comment):
  // DevLog is shared by apps/web's devNote_ (source e.g. 'ApiClient') and
  // apps/api's own Router.gs catch (source = the action name) — the count
  // must not filter by source, since the original "apps/api-only" framing
  // no longer reflects how the codebase actually reports errors.
  const env = H.makeEnv();
  const now = new Date();
  env.store.DevLog = [
    { timestamp: now, level: 'error', source: 'ApiClient', actor: 'a@x.com', message: 'm', detail: '' },
    { timestamp: now, level: 'error', source: 'updateOrder', actor: 'b@x.com', message: 'm', detail: '' }
  ];
  const counts = env.devLogErrorCounts_();
  H.eq('both a web-sourced and an api-sourced error row are counted', counts.last24h, 2);
})();

console.log('\ntriggerStatus_ / actionSystemHealth_ — tracked trigger installed/missing state');
(function () {
  // Milestone 6 / Phase 7 live-verification addon (2026-09-16) — surfaces
  // every tracked persistent trigger's install state so an admin can spot
  // a missed editor-only setup step without opening the Triggers page.
  const env = H.makeEnv();
  const admin = H.user('admin@x.com', { manage_users: true });

  let result = env.actionSystemHealth_(admin);
  H.eq('with no triggers installed, all 4 tracked triggers report installed:false',
    result.triggers.map((t) => t.installed), [false, false, false, false]);
  H.eq('tracked handlers are exactly the 4 persistent daily/periodic ones',
    result.triggers.map((t) => t.handler),
    ['runScheduledBackup_', 'cleanupExportJobs', 'checkSecretExpiry', 'keepWarmPing']);

  // Install two of the four (mirrors what an admin who ran some, not all,
  // of the editor-only install*() functions would have on their project).
  // Schedule details don't matter here — only that a trigger exists for
  // that handler name (the harness's fake ScriptApp builder only supports
  // everyDays/atHour, not keepWarmPing's real everyMinutes(5)).
  env.ScriptApp.newTrigger('runScheduledBackup_').timeBased().everyDays(1).atHour(2).create();
  env.ScriptApp.newTrigger('keepWarmPing').timeBased().everyDays(1).atHour(5).create();

  result = env.actionSystemHealth_(admin);
  const byHandler = {};
  result.triggers.forEach((t) => { byHandler[t.handler] = t.installed; });
  H.eq('installed trigger reports installed:true', byHandler.runScheduledBackup_, true);
  H.eq('a second installed trigger also reports installed:true', byHandler.keepWarmPing, true);
  H.eq('a still-missing trigger reports installed:false', byHandler.cleanupExportJobs, false);
  H.eq('another still-missing trigger reports installed:false', byHandler.checkSecretExpiry, false);
})();

console.log('\ndevLogErrorCounts_ — missing DevLog sheet degrades to zero, not a thrown error');
(function () {
  // readAll_ in the real SheetsRepo.gs throws for a sheet that doesn't
  // exist yet (a fresh deployment that has never logged anything). This
  // harness's readAll_ stub can't reproduce that throw (it defaults to []
  // for any unset store key), so this test calls the real guard directly
  // by simulating what a throwing readAll_ would hit: the try/catch inside
  // devLogErrorCounts_ itself, exercised via a readAll_ override.
  const env = H.makeEnv();
  const realReadAll = env.readAll_;
  env.readAll_ = function (name) {
    if (name === env.SHEETS.DEV_LOG) throw new Error('Không tìm thấy trang tính: DevLog');
    return realReadAll(name);
  };
  const counts = env.devLogErrorCounts_();
  H.eq('a missing DevLog sheet reads back as zero counts', counts, { last24h: 0, last7d: 0 });
})();

H.done();
