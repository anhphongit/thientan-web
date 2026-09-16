/**
 * SystemHealth.gs — Milestone 6 / Phase 3 (stretch): small admin-only
 * read model for the Admin panel's "Tình trạng hệ thống" section — last
 * backup status (Phase 1's persisted ScriptProperties) and a recent
 * unexpected-error count (DevLog).
 *
 * Design note vs. the original phase plan (adapted 2026-09-16 to what the
 * codebase actually looks like by the time this shipped): the phase file's
 * Finding 7 assumed apps/web could never write to DevLog, making the error
 * count apps/api-only "by construction". That assumption no longer holds —
 * a separate plan (260912-1110, apiclient transient-failure hardening)
 * landed apps/web/ApiClient.gs's devNote_(), which already reports client-
 * side failures (missing OAuth scope, fetch failures, non-2xx/non-JSON
 * responses) into the same DevLog sheet via the existing `logDev` action
 * (Router.gs, actionLogDev_ in Security.gs). DevLog is therefore already a
 * combined web+api error log, not an apps/api-only one. This file adds the
 * one piece that was actually still missing — apps/api's own unexpected
 * errors (Router.gs's top-level catch) were never logged anywhere but
 * console.error/Stackdriver — and counts across both sources honestly,
 * rather than mislabeling the result as server-side-only.
 *
 * Also simplified vs. the original plan: logDevEvent_ (Security.gs) already
 * always attempts its write regardless of DEV_MODE (changed 2026-09-14,
 * before this phase shipped) and already never throws to its caller (its
 * own try/catch returns a boolean). Extending it with a separate
 * "always-log" parameter, and wrapping its call site in a second isolating
 * try/catch, would have duplicated a guarantee it already provides.
 */

/**
 * Milestone 6 / Phase 7 live-verification addon (2026-09-16) — every
 * editor-only, persistent (not one-off) trigger this codebase installs.
 * "Persistent" excludes ExportJob.gs's resumeExportJob_ trigger — that one
 * is created and deleted per export job, not a standing daily/periodic
 * job, so "is it installed" isn't a meaningful health question for it.
 * Surfaced here because none of these installers have any web-UI
 * equivalent (same editor-only-by-design reasoning as BackupJob.gs's file
 * doc comment: exposing "install/modify a trigger" over HTTP would let the
 * shared secret alone rewrite the project's schedule, a bigger blast
 * radius than a one-time editor step) — so this is the only place an
 * admin can otherwise confirm one wasn't missed during setup, without
 * opening the Apps Script editor's Triggers page directly.
 */
var TRACKED_TRIGGERS_ = [
  { handler: 'runScheduledBackup_', label: 'Sao lưu tự động', installFn: 'installBackupTrigger' },
  { handler: 'cleanupExportJobs', label: 'Dọn dẹp file xuất (export)', installFn: 'installExportJobCleanupReminder' },
  { handler: 'checkSecretExpiry', label: 'Nhắc xoay mã bí mật', installFn: 'installExpiryReminder' },
  { handler: 'keepWarmPing', label: 'Giữ ấm hệ thống (keep-warm)', installFn: 'installKeepWarmTrigger' }
];

/**
 * @return {Array<{handler:string,label:string,installFn:string,installed:boolean}>}
 */
function triggerStatus_() {
  var installedHandlers = {};
  ScriptApp.getProjectTriggers().forEach(function (t) {
    installedHandlers[t.getHandlerFunction()] = true;
  });
  return TRACKED_TRIGGERS_.map(function (t) {
    return {
      handler: t.handler,
      label: t.label,
      installFn: t.installFn,
      installed: !!installedHandlers[t.handler]
    };
  });
}

/**
 * Admin-only action: last backup status, recent unexpected-error counts,
 * and every tracked trigger's installed/missing state. Gated on
 * manage_users, same as every other admin control.
 *
 * @return {{lastBackup:{at:string,folderUrl:string},
 *           recentErrorCount:{last24h:number,last7d:number},
 *           triggers:Array<{handler:string,label:string,installFn:string,installed:boolean}>}}
 */
function actionSystemHealth_(user) {
  requirePermission_(user, 'manage_users');

  var props = PropertiesService.getScriptProperties();
  return {
    lastBackup: {
      at: props.getProperty(BACKUP_LAST_AT_PROP_) || '',
      folderUrl: props.getProperty(BACKUP_LAST_FOLDER_URL_PROP_) || ''
    },
    recentErrorCount: devLogErrorCounts_(),
    triggers: triggerStatus_()
  };
}

/**
 * Counts DevLog rows at level 'error' within the last 24h/7d. Reads
 * defensively: a fresh deployment that has never logged anything yet may
 * not have a DevLog sheet at all (it's created lazily by logDevEvent_'s
 * first write, or by the editor-only setupDevLog()) — readAll_ throws in
 * that case (SheetsRepo.gs's getSheet_), which would otherwise make "no
 * errors yet" itself look like a health-panel failure. Treated the same as
 * a genuinely empty log: zero counts, not an error.
 */
function devLogErrorCounts_() {
  var rows;
  try {
    rows = readAll_(SHEETS.DEV_LOG);
  } catch (err) {
    return { last24h: 0, last7d: 0 };
  }

  var now = Date.now();
  var MS_24H = 24 * 60 * 60 * 1000;
  var MS_7D = 7 * MS_24H;
  var count24h = 0, count7d = 0;

  rows.forEach(function (row) {
    if (String(row.level || '').toLowerCase() !== 'error') return;
    var ts = (row.timestamp instanceof Date) ? row.timestamp.getTime() : new Date(row.timestamp).getTime();
    if (isNaN(ts)) return;
    var age = now - ts;
    if (age < 0 || age > MS_7D) return;
    count7d++;
    if (age <= MS_24H) count24h++;
  });

  return { last24h: count24h, last7d: count7d };
}
