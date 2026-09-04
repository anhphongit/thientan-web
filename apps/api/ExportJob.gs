/**
 * ExportJob.gs — Milestone 4 / 4.5.1: job/checkpoint core for large
 * exports.
 *
 * Problem (Phong, 2026-09-03): export size has no real limit — could be
 * multiple years of orders — which rules out doing the whole build in one
 * synchronous request/response. Apps Script's own hard ceiling is 6
 * minutes of execution time for a single run of any function, trigger
 * included. This file is the piece that makes an export survive past
 * that limit: it writes the same row grid ExportSheet.gs already builds
 * (buildExportRows_ + buildExportGrid_/writeExportGridValues_) into the
 * temp Sheet in checkpointable SLICES, saving progress into a job record
 * after each slice, and — if a single execution is running out of time —
 * schedules a one-off trigger to resume writing exactly where it left off
 * instead of losing the work or hitting the hard timeout mid-request.
 *
 * Scope of 4.5.1 specifically: the job record, the checkpoint/resume
 * mechanics, and the batched write+finish loop. 4.5.2 added the
 * status-polling action for the client. 4.5.3 (see deliverExportJob_
 * near the bottom of this file) added Drive upload + email delivery: once
 * every row is written and styled, the temp Sheet is exported to real
 * xlsx/pdf bytes, saved into a shared Drive folder, emailed to the
 * requester (attached directly when small enough, link-only past
 * EXPORTJOB_EMAIL_ATTACH_MAX_BYTES), and only THEN is the temp Sheet
 * trashed — unlike 4.5.1/4.5.2, where it was deliberately left in place
 * for this later step to pick up. Retention cleanup of OLD deliveries
 * (the files now sitting in that Drive folder) and old job records is
 * still 4.5.4, not yet built.
 *
 * Job record storage: PropertiesService.getScriptProperties(), one JSON
 * blob per job under key EXPORTJOB_PREFIX + jobId. Script Properties (not
 * CacheService) because a job must survive between the triggering request
 * and however many retrigger executions it takes to finish — CacheService
 * entries can expire mid-job; PropertiesService persists indefinitely
 * until explicitly removed (4.5.4's job to do that cleanup). This project
 * already leans on PropertiesService this way for the order-id counter
 * (Orders.gs nextOrderId_) and on LockService the same way for the
 * order-write lock (Orders.gs withOrderLock_) — same tools, same
 * reasoning, applied here to a different kind of long-lived state.
 */

/**
 * Milestone 4 / 4.5.2 — action-layer entry points. Router.gs registers
 * these as `startExportJob` / `exportJobStatus`; the client only reaches
 * this file through them, never startExportJob_/loadExportJob_ directly.
 * See apps/web/ui/ViewsOrders.html's runExportLargeXlsx_/runExportLargePdf_
 * for the polling loop that calls exportJobStatus repeatedly.
 *
 * Client-side trigger for using this path at all instead of the plain
 * synchronous exportOrdersXlsx/exportOrdersPdf (4.3/4.4, unchanged):
 * automatic, by filtered order LINE count (not order count — see
 * exportLargeThreshold_ in Export.gs for why) against the config-driven
 * `exportLargeThreshold`. CSV never uses this path (no size/timeout
 * concern — plain string building, see Export.gs's own doc comment).
 */

/**
 * @param {Object} payload same filter/basis shape as exportOrdersXlsx's
 *   payload, plus `format`: 'xlsx' or 'pdf'.
 * @return {{jobId:string, status:string}}
 */
function actionStartExportJob_(user, payload) {
  var format = payload && payload.format;
  if (format !== 'xlsx' && format !== 'pdf') throw new Error(MSG.EXPORTJOB_BAD_FORMAT);
  return startExportJob_(user, payload, format);
}

/**
 * Polls one job's progress. Scoped to the job's own creator — this is the
 * requester checking on their own async request, not a general
 * orders-visibility question, so it's gated on job ownership (email
 * match) rather than canSeeAllOrders_/view_all_orders. A job for another
 * user's email (or an unknown/expired jobId) reports EXPORTJOB_NOT_FOUND
 * either way, so polling can't be used to fish for whether a jobId exists.
 *
 * @param {Object} payload {jobId}
 * @return {{jobId:string, status:string, rowsWritten:number,
 *   totalRows:number, format:string, error:?string, deliveryUrl:?string,
 *   deliveryError:?string}} — deliberately narrow: never returns
 *   job.payload/job.user (the filters or the full requester identity),
 *   just what a progress UI needs to render. deliveryUrl (Milestone 4 /
 *   4.5.3) is only set once status is 'done' AND deliverExportJob_
 *   succeeded — a 'done' job with deliveryUrl still null and
 *   deliveryError set means the rows finished fine but Drive/email
 *   delivery itself failed; the client shows that distinctly rather than
 *   treating it the same as a full job failure (status stays 'done', not
 *   'error' — see deliverExportJob_'s doc comment for why).
 */
function actionExportJobStatus_(user, payload) {
  var jobId = payload && payload.jobId;
  var job = jobId ? loadExportJob_(jobId) : null;
  if (!job || !job.user || job.user.email !== user.email) {
    throw new Error(MSG.EXPORTJOB_NOT_FOUND);
  }
  return {
    jobId: job.jobId,
    status: job.status,
    rowsWritten: job.rowsWritten,
    totalRows: job.totalRows,
    format: job.format,
    error: job.error || null,
    deliveryUrl: job.deliveryUrl || null,
    deliveryError: job.deliveryError || null
  };
}

var EXPORTJOB_PREFIX = 'EXPORTJOB_';
/** ScriptProperties key holding the single job id a pending resume
 *  trigger should wake up for. One in-flight resume at a time is the
 *  whole of 4.5.1's concurrency model — see scheduleExportJobResume_'s
 *  doc comment for why that's sufficient for now. */
var EXPORTJOB_RESUME_PROP_ = 'EXPORTJOB_PENDING_RESUME';

/** Stop writing more of the grid once a single execution has been running
 *  this long, and checkpoint+retrigger instead. Apps Script's real
 *  ceiling is 6 minutes (360s); staying well under it (270s = 4.5 min)
 *  leaves headroom for the final styling pass (applyExportGridStyles_)
 *  that only runs once, after the LAST slice, so that step itself isn't
 *  the thing that gets caught by the hard limit right after this soft
 *  budget passed. */
var EXPORTJOB_TIME_BUDGET_MS = 270 * 1000;
/** Rows written to the temp Sheet per setValues() call before re-checking
 *  the time budget. Matches the row-count-per-call ExportSheet.gs's own
 *  doc comment already sizes for Sheets API cost (~1,000-5,000 rows); the
 *  low end of that range since this loop also pays for a clock check and
 *  a job-record save after every slice, not just the sheet write itself. */
var EXPORTJOB_ROWS_PER_BATCH = 1000;

/**
 * Starts a new export job and runs as many batches as fit inline (so a
 * SMALL export — the common case — still completes in this one request/
 * response, no polling needed). Only an export that outruns
 * EXPORTJOB_TIME_BUDGET_MS falls through to the checkpoint/retrigger
 * path.
 *
 * @param {Object} user
 * @param {Object} payload same shape as actionExportOrdersXlsx_'s payload
 *   (filters + basis) — stored on the job record so a retrigger can
 *   rebuild the same row set without needing the original HTTP request.
 * @param {string} format 'xlsx' or 'pdf' — which final export step 4.5.3
 *   will eventually run once the job is 'done'; 4.5.1 doesn't act on this
 *   itself yet (see file doc comment), just carries it for 4.5.3.
 * @return {{jobId:string, status:string}} status is 'done' for a job that
 *   finished inline, or 'running' if it had to checkpoint and hand off to
 *   a retrigger — 4.5.2's polling action checks back on a 'running' job
 *   by jobId.
 */
function startExportJob_(user, payload, format) {
  requirePermission_(user, 'export');
  var basis = exportBasis_(payload);
  var buckets = exportBucketsForRequest_(user, payload);
  var rows = buildExportRows_(user, buckets);
  var built = buildExportGrid_(rows);

  var ss = SpreadsheetApp.create('export-' + Utilities.getUuid());

  var job = {
    jobId: Utilities.getUuid(),
    status: 'running',
    createdBy: (user && user.email) || '',
    // The FULL user object, not just the email — resumeExportJob_ must
    // rebuild rows with EXACTLY the same permission/visibility gating the
    // request that started this job had (seesMoney_/fieldVisible_/
    // canSeeAllOrders_/scopeToUser_ all read user.permissions, not just
    // user.email). A bug caught by exportjob.test.js section 3 during
    // 4.5.1's own build: resuming with a stripped-down
    // `{email: job.createdBy}` stand-in silently produced a grid with
    // every money column blank from the 2nd checkpoint onward, because
    // seesMoney_ saw no `permissions` at all and defaulted to hiding
    // money — exactly the kind of silent data-shape bug this project
    // treats as a real bug (CONVENTIONS.md), not a cosmetic one, since it
    // would have shipped a large export that quietly leaked LESS data
    // than the user was actually allowed to see, or — for a different
    // user shape — potentially more. Storing the whole object and reusing
    // it verbatim on resume is the only way to guarantee the two halves
    // of one export apply identical rules throughout.
    user: user,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    format: format,
    // Stored so resumeExportJob_ can rebuild the exact same row set on a
    // retrigger without the original HTTP request — see that function's
    // doc comment for why recomputing from these beats trying to persist
    // the (potentially huge) row/grid arrays themselves.
    payload: payload || {},
    basis: basis,
    tempSheetId: ss.getId(),
    totalRows: built.grid.length,
    rowsWritten: 0,
    error: null
  };
  saveExportJob_(job);

  runExportJobWork_(job, built, ss.getSheets()[0]);
  return { jobId: job.jobId, status: job.status };
}

/**
 * Trigger entry point (scheduled by scheduleExportJobResume_): resumes a
 * checkpointed job, re-deriving `rows`/`built` from the job's own saved
 * payload/basis by re-running the exact same query+bucket+build pipeline
 * startExportJob_ used (cheap and deterministic — see file doc comment on
 * why recomputing beats trying to serialize the whole row/grid structure
 * into the job record itself). Only rows from `job.rowsWritten` onward
 * get written again — buildExportGrid_'s output is stable for the same
 * input, so recomputing it doesn't redo any WORK against the sheet, only
 * memory-cheap array-building.
 *
 * Deletes its own one-off trigger first thing, success or failure, so a
 * crashed batch doesn't leave a dangling trigger behind. Not currently
 * re-entrant-safe against being invoked twice for different jobIds at
 * once — EXPORTJOB_RESUME_PROP_ holds a single pending job id, which is
 * fine as long as one job's checkpoint chain finishes (or fails) well
 * within the minutes between one user's export and the next one starting;
 * revisit if concurrent large exports become common (4.5.2+ would be the
 * place to move to a per-trigger job id instead of one shared property,
 * e.g. by reading the id off the trigger's own unique id instead).
 *
 * @param {Object} e trigger event object — unused, but Apps Script always
 *   passes one to a time-based trigger's handler.
 */
function resumeExportJob_(e) {
  var jobId = PropertiesService.getScriptProperties().getProperty(EXPORTJOB_RESUME_PROP_);
  deleteExportJobTriggers_();
  if (!jobId) { console.error('resumeExportJob_: no pending job id found.'); return; }
  PropertiesService.getScriptProperties().deleteProperty(EXPORTJOB_RESUME_PROP_);

  var job = loadExportJob_(jobId);
  if (!job) { console.error('resumeExportJob_: job ' + jobId + ' not found (already cleaned up?).'); return; }
  if (job.status !== 'running') return; // already finished or failed by another path

  try {
    var buckets = exportBucketsForRequest_(job.user, job.payload);
    var rows = buildExportRows_(job.user, buckets);
    var built = buildExportGrid_(rows);
    var sheet = SpreadsheetApp.openById(job.tempSheetId).getSheets()[0];
    runExportJobWork_(job, built, sheet);
  } catch (err) {
    job.status = 'error';
    job.error = String((err && err.message) || err);
    job.updatedAt = new Date().toISOString();
    saveExportJob_(job);
    console.error('resumeExportJob_: job ' + jobId + ' failed: ' + job.error);
  }
}

/**
 * Core checkpoint loop, shared by the inline-first-run path
 * (startExportJob_) and the resume path (resumeExportJob_): writes
 * `built.grid` to `sheet` starting at job.rowsWritten, EXPORTJOB_ROWS_PER_
 * BATCH rows at a time, re-checking the wall-clock after every slice.
 * When the whole grid is written, runs applyExportGridStyles_ ONCE (it
 * needs the full grid to size several ranges correctly — see that
 * function's own doc comment) and marks the job done. Always calls
 * saveExportJob_ before returning, whichever way it exits, so the job
 * record on disk never falls behind what's actually on the sheet.
 *
 * `built` must be recomputed fresh by the caller (not read off the job
 * record) — see resumeExportJob_'s doc comment for why recomputing is
 * both cheap and correct here.
 */
function runExportJobWork_(job, built, sheet) {
  var startedAt = Date.now();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    // Another execution (e.g. an overlapping retrigger) is already
    // working this exact job — bail out without touching the job record;
    // the run holding the lock is the one making progress.
    return;
  }

  try {
    while (job.rowsWritten < built.grid.length) {
      var from = job.rowsWritten;
      var count = Math.min(EXPORTJOB_ROWS_PER_BATCH, built.grid.length - from);
      var slice = built.grid.slice(from, from + count);
      sheet.getRange(from + 1, 1, count, built.width).setValues(slice);
      job.rowsWritten = from + count;

      if (Date.now() - startedAt >= EXPORTJOB_TIME_BUDGET_MS && job.rowsWritten < built.grid.length) {
        job.updatedAt = new Date().toISOString();
        saveExportJob_(job);
        scheduleExportJobResume_(job.jobId);
        return;
      }
    }

    // Every row written — apply styling once over the complete grid, then
    // mark done. Delivery (Drive upload + email, Milestone 4 / 4.5.3) runs
    // right here, still inside the lock, so a second poll can never race a
    // half-delivered job — see deliverExportJob_'s doc comment. Retention
    // cleanup of OLD deliveries/job records is 4.5.4, still out of scope.
    applyExportGridStyles_(sheet, built);
    job.status = 'done';
    job.updatedAt = new Date().toISOString();
    saveExportJob_(job);
    deliverExportJob_(job);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Schedules a one-off trigger (fires ~10s from now — no need to wait
 * longer, this isn't retrying against a rate limit, just yielding back
 * control before the CURRENT execution's own clock runs out) that calls
 * resumeExportJob_ to continue writing `jobId`'s job. Clears any other
 * pending resume trigger first — see EXPORTJOB_RESUME_PROP_'s doc comment
 * on the current one-pending-resume-at-a-time model.
 */
function scheduleExportJobResume_(jobId) {
  deleteExportJobTriggers_();
  PropertiesService.getScriptProperties().setProperty(EXPORTJOB_RESUME_PROP_, jobId);
  ScriptApp.newTrigger('resumeExportJob_').timeBased().after(10 * 1000).create();
}

/** Removes any existing resumeExportJob_ trigger(s) — called both before
 *  scheduling a new one (so retries never stack up multiple pending
 *  triggers for the same or different jobs) and at the top of
 *  resumeExportJob_ itself (so the trigger that just fired doesn't linger
 *  after it's done its one job). */
function deleteExportJobTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'resumeExportJob_') ScriptApp.deleteTrigger(t);
  });
}

/* =======================================================================
   Job record persistence
   ======================================================================= */

function saveExportJob_(job) {
  PropertiesService.getScriptProperties().setProperty(EXPORTJOB_PREFIX + job.jobId, JSON.stringify(job));
}

function loadExportJob_(jobId) {
  var raw = PropertiesService.getScriptProperties().getProperty(EXPORTJOB_PREFIX + jobId);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error('loadExportJob_: corrupt job record for ' + jobId + ': ' + err);
    return null;
  }
}

/* =======================================================================
   Milestone 4 / 4.5.3 — Drive + email delivery
   ======================================================================= */

/** Files under this size are attached directly to the email — Gmail's own
 *  ceiling is 25MB per message, but that's for the WHOLE message (all
 *  attachments + headers + quoted body together), so this stays
 *  comfortably under it rather than targeting 25MB exactly. Anything at
 *  or above this size gets a Drive-link-only email instead — see
 *  deliverExportJob_. */
var EXPORTJOB_EMAIL_ATTACH_MAX_BYTES = 20 * 1024 * 1024;

/** Name of the Drive folder (created once, reused after) that finished
 *  large-export files are saved into. A flat, findable place for Phong to
 *  browse past exports from Drive directly, separate from the throwaway
 *  temp Sheets (named 'export-<uuid>', never renamed, always trashed) the
 *  synchronous and checkpoint paths both create as scratch space along
 *  the way — those two naming schemes are deliberately different so the
 *  two kinds of file are never confused for each other while both exist
 *  in the same Drive. */
var EXPORTJOB_FOLDER_NAME = 'Xuất file đơn hàng (THIÊN TÂN)';

/**
 * Converts a finished job's temp Sheet into the requested final format,
 * saves it into the shared export folder, emails the requester a link
 * (always) plus the file itself as an attachment when it's small enough,
 * and finally trashes the temp Sheet — the temp Sheet's whole reason to
 * exist was to produce this one file, so once the file is safely in
 * Drive there's nothing left to keep it around for (unlike the small/
 * synchronous path's withTempExportSheet_, which never persists a Sheet
 * at all — this is the large-path equivalent of that same cleanup, just
 * one step later because the file has to be built first here).
 *
 * Runs synchronously inside runExportJobWork_, still holding the export
 * job's lock, right after the job is marked 'done' — deliberately NOT a
 * separate retriggered step: a single spreadsheet export (fetchSpreadsheet
 * ExportBase64_) plus one MailApp call are both well within the time
 * budget checkpointing exists for in the first place (that budget is
 * about the ROW-WRITING loop scaling with order count; this step doesn't
 * scale with row count, it's one UrlFetchApp call regardless of how big
 * the sheet is). Keeping it inside the same lock/run also means a client
 * polling apiExportJobStatus right after seeing 'done' can never observe
 * a job that's finished-but-not-yet-delivered — delivery fields are
 * always populated by the time status flips to 'done' becomes visible.
 *
 * Never throws to its caller: a delivery failure (Drive quota, MailApp
 * quota, a transient UrlFetchApp error) must not turn an otherwise-
 * successful export into a job the client sees as failed — the temp
 * Sheet already has every row + styling applied at this point, so losing
 * it on a delivery hiccup would be strictly worse than leaving it in
 * place for a manual look. On failure, job.deliveryError is set (and the
 * temp Sheet is deliberately NOT trashed) so 4.5.4's retention pass (or a
 * manual look at the job record) has something to go on instead of a
 * silently vanished file.
 *
 * @param {Object} job job record, already status:'done' and saved.
 */
function deliverExportJob_(job) {
  try {
    var ext = job.format === 'pdf' ? 'pdf' : 'xlsx';
    var mimeType = job.format === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    var base64 = fetchSpreadsheetExportBase64_(job.tempSheetId, job.format === 'pdf' ? 'pdf' : 'xlsx', {});
    var blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, exportFilename_('orders', ext));

    var folder = exportsFolder_();
    var driveFile = folder.createFile(blob);
    var driveUrl = driveFile.getUrl();

    var toEmail = job.user && job.user.email;
    if (toEmail) {
      emailExportDelivery_(toEmail, driveFile.getName(), driveUrl, blob);
    }

    job.deliveryUrl = driveUrl;
    job.deliveryFileId = driveFile.getId();
    job.deliveryError = null;
    job.updatedAt = new Date().toISOString();
    saveExportJob_(job);

    // Delivered — the temp Sheet has served its purpose. Same
    // best-effort try/catch pattern withTempExportSheet_ uses (including
    // going through DriveApp.getFileById, not Spreadsheet.getParent()
    // (Sheet's own parent is the Spreadsheet object, which has no
    // setTrashed — only the Drive FILE wrapper does)): cleanup failing
    // must never be treated as the export itself failing.
    try {
      DriveApp.getFileById(job.tempSheetId).setTrashed(true);
    } catch (cleanupErr) {
      console.error('deliverExportJob_: temp sheet cleanup failed for ' +
        job.tempSheetId + ': ' + (cleanupErr && cleanupErr.message));
    }
  } catch (err) {
    job.deliveryError = String((err && err.message) || err);
    job.updatedAt = new Date().toISOString();
    saveExportJob_(job);
    console.error('deliverExportJob_: delivery failed for job ' + job.jobId + ': ' + job.deliveryError);
    // Temp Sheet intentionally left in place — see file doc comment.
  }
}

/**
 * Sends the "your export is ready" email. Always includes the Drive link
 * (works regardless of size); additionally attaches the file itself when
 * it's under EXPORTJOB_EMAIL_ATTACH_MAX_BYTES, so the common case (most
 * exports, even large ones by row count, are a few MB at most as XLSX/PDF)
 * lands directly in the inbox without an extra click through Drive.
 */
function emailExportDelivery_(toEmail, filename, driveUrl, blob) {
  var subject = '[THIÊN TÂN] File xuất đơn hàng đã sẵn sàng — ' + filename;
  var bodyLines = [
    'File xuất đơn hàng của bạn đã xuất xong.',
    '',
    'Xem/tải trên Drive: ' + driveUrl
  ];
  var options = {};
  if (blob.getBytes().length < EXPORTJOB_EMAIL_ATTACH_MAX_BYTES) {
    bodyLines.push('', 'File cũng được đính kèm trong email này.');
    options.attachments = [blob];
  } else {
    bodyLines.push('', 'File khá lớn nên chỉ gửi link Drive ở trên, không đính kèm trực tiếp trong email.');
  }
  MailApp.sendEmail(toEmail, subject, bodyLines.join('\n'), options);
}

/** Gets (or creates, the first time) the shared Drive folder that all
 *  finished large-export files are saved into. Looked up by name each
 *  call rather than caching the id in ScriptProperties — this runs at
 *  most once per finished job, nowhere near hot enough to need caching,
 *  and a fresh name lookup self-heals if the folder is ever manually
 *  renamed back or a stale cached id would otherwise 404. */
function exportsFolder_() {
  var it = DriveApp.getFoldersByName(EXPORTJOB_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(EXPORTJOB_FOLDER_NAME);
}

/* =======================================================================
   Milestone 4 / 4.5.4 — retention cleanup
   ======================================================================= */

/** Days a finished job's record + Drive file(s) are kept before
 *  cleanupExportJobs removes them, read from the Config sheet
 *  (exportRetentionDays) the same way exportLargeThreshold_ reads its own
 *  config value — falls back to 14 days for a missing/invalid config row
 *  rather than refusing to clean up at all. */
function exportRetentionDays_(config) {
  var n = parseInt(config && config.exportRetentionDays, 10);
  return (n > 0) ? n : 14;
}

/**
 * Run once from the editor to install the daily cleanup trigger. Same
 * pattern as Security.gs's installExpiryReminder — deletes any existing
 * cleanupExportJobs trigger first so re-running this is idempotent
 * (never stacks up duplicate daily triggers).
 */
function installExportJobCleanupReminder() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'cleanupExportJobs') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('cleanupExportJobs').timeBased().everyDays(1).atHour(3).create();
  return 'Daily export cleanup installed (03:00 Asia/Ho_Chi_Minh).';
}

/**
 * Trigger target: finds every export job record whose last update is
 * older than exportRetentionDays_() and reclaims what it left behind,
 * then removes the job record itself. Three kinds of leftovers, handled
 * per job depending on how it ended:
 *
 *   - A DELIVERED job (job.deliveryFileId set): trash the Drive file in
 *     the shared export folder. This is the normal case — most jobs
 *     reach here having already succeeded, and this is what keeps that
 *     folder from growing forever, which is the whole point of 4.5.4.
 *   - A job whose delivery FAILED (job.deliveryError set, temp Sheet
 *     deliberately left in place by deliverExportJob_ — see its doc
 *     comment): trash the temp Sheet too, once it's old enough that it's
 *     clearly not still being worked on. Losing an old failed delivery's
 *     data after the retention window is an accepted tradeoff — Phong (or
 *     an admin) has exportRetentionDays_ to make that window as long as
 *     needed if a failed job might need manual recovery.
 *   - A job that's still 'running' (a checkpoint chain that got stuck or
 *     abandoned — its resume trigger failed silently, or the job record
 *     was left behind by some other edge case): also cleaned up past the
 *     retention window, same as the other two — an old 'running' job that
 *     hasn't updated in exportRetentionDays_ days is not going to finish
 *     on its own, and its temp Sheet is reclaimed the same way a failed
 *     delivery's is.
 *
 * Every job is wrapped individually so one bad/corrupt record can't stop
 * the rest of the sweep — matches the try/catch-per-item pattern
 * deliverExportJob_ and withTempExportSheet_ both already use for the
 * same reason (a cleanup pass is exactly the kind of maintenance job that
 * must not itself become fragile).
 */
function cleanupExportJobs() {
  var config = readPublicConfig_();
  var retentionMs = exportRetentionDays_(config) * 24 * 60 * 60 * 1000;
  var cutoff = Date.now() - retentionMs;

  var props = PropertiesService.getScriptProperties();
  var allProps = props.getProperties();
  var removed = 0, failed = 0;

  Object.keys(allProps).forEach(function (key) {
    if (key.indexOf(EXPORTJOB_PREFIX) !== 0) return; // not a job record (e.g. EXPORTJOB_PENDING_RESUME)

    try {
      var job = JSON.parse(allProps[key]);
      var updatedAt = new Date(job.updatedAt || job.createdAt || 0).getTime();
      if (isNaN(updatedAt) || updatedAt > cutoff) return; // not old enough yet

      if (job.deliveryFileId) {
        try { DriveApp.getFileById(job.deliveryFileId).setTrashed(true); }
        catch (err) { console.error('cleanupExportJobs: could not trash delivery file for job ' + job.jobId + ': ' + err.message); }
      } else if (job.tempSheetId) {
        // Delivery never succeeded (or the job never finished) — the temp
        // Sheet is the only leftover in that case, see file doc comment.
        try { DriveApp.getFileById(job.tempSheetId).setTrashed(true); }
        catch (err) { console.error('cleanupExportJobs: could not trash temp sheet for job ' + job.jobId + ': ' + err.message); }
      }

      props.deleteProperty(key);
      removed++;
    } catch (err) {
      failed++;
      console.error('cleanupExportJobs: failed to process ' + key + ': ' + (err && err.message));
    }
  });

  var summary = 'cleanupExportJobs: removed ' + removed + ' job(s), ' + failed + ' failure(s).';
  console.log(summary);
  return summary;
}
