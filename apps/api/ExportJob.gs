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
 * mechanics, and the batched write+finish loop. It does NOT yet do
 * anything with a finished job besides mark it 'done' in the job record —
 * no status-polling action for the client (4.5.2), no Drive upload /
 * email delivery (4.5.3), no retention cleanup of old jobs/temp files
 * (4.5.4). A finished job's temp Sheet is deliberately left in place
 * (not deleted the way withTempExportSheet_'s inline path deletes it) for
 * 4.5.3 to hand off to Drive/email; 4.5.4 is what eventually reclaims it.
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
 *   totalRows:number, format:string, error:?string}} — deliberately
 *   narrow: never returns job.payload/job.user (the filters or the full
 *   requester identity), just what a progress UI needs to render.
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
    error: job.error || null
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
    // mark done. Delivery (Drive upload, email, temp-file cleanup) is
    // 4.5.3/4.5.4 — out of scope here; the temp Sheet is deliberately left
    // in place for that later step to pick up by job.tempSheetId.
    applyExportGridStyles_(sheet, built);
    job.status = 'done';
    job.updatedAt = new Date().toISOString();
    saveExportJob_(job);
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
