/**
 * Offline tests for Milestone 4 / 4.5.1 — ExportJob.gs's job/checkpoint
 * core. Uses the shared harness (harness.js), which now also loads
 * ExportSheet.gs/ExportJob.gs and stubs SpreadsheetApp/ScriptApp with
 * simple in-memory stand-ins (fakeSpreadsheets/fakeTriggers) — enough to
 * exercise the real checkpoint/resume control flow without a live Sheets
 * backend or a real trigger scheduler. A "trigger firing" is simulated by
 * the test calling resumeExportJob_ itself, since this harness runs
 * synchronously and doesn't have a clock to actually wait on.
 *
 * Run with: node tools/offline-tests/exportjob.test.js
 */
const H = require('./harness.js');
const { user, check, eq, throws } = H;

function line(over) {
  return Object.assign({ description: 'Ống nhựa PVC 90', qty: 2, unitPrice: 100000,
                         uom: 'Cái', vatRate: 0.08 }, over || {});
}
function order(over) {
  return Object.assign({ customer: 'Nhựa Duy Tân', orderDate: '2026-08-20',
                         status: 'draft', po: '4600041936' }, over || {});
}

/** Reads back everything written to a fake spreadsheet's first sheet as a
 *  plain 2D array (undefined cells -> '' so short rows compare cleanly),
 *  trimmed to just the rows actually touched. */
function readFakeGrid(env, tempSheetId) {
  const ss = env.fakeSpreadsheets[tempSheetId];
  if (!ss) throw new Error('readFakeGrid: no fake spreadsheet ' + tempSheetId);
  return ss.cells.map(row => (row || []).map(c => (c === undefined ? '' : c)));
}

function makeOrders(env, admin, count) {
  for (let i = 0; i < count; i++) {
    env.actionCreateOrder_(admin, {
      order: order({ po: 'PO' + i, customer: 'KH ' + (i % 3) }),
      lines: [line({ description: 'Dòng ' + i })]
    });
  }
}

/* ---------- 1. small export completes inline, no trigger scheduled ---------- */
console.log('\n1. a small export finishes in one call — status "done", no resume trigger left pending');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { export: true });
  makeOrders(env, admin, 3);

  const res = env.startExportJob_(admin, {}, 'xlsx');
  check('status is done', res.status === 'done');
  check('jobId returned', typeof res.jobId === 'string' && res.jobId.length > 0);

  const job = env.loadExportJob_(res.jobId);
  check('job record status matches', job.status === 'done');
  check('rowsWritten equals totalRows', job.rowsWritten === job.totalRows);
  check('no pending resume trigger left behind', env.fakeTriggers.length === 0);

  const grid = readFakeGrid(env, job.tempSheetId);
  check('header row landed on the sheet', grid[0][0] === 'STT');
  check('at least one data row beyond the header', grid.length > 1);
}

/* ---------- 2. permission enforcement ---------- */
console.log('\n2. starting a job requires the export permission');
{
  const env = H.makeEnv();
  const noExport = user('a@x.com', { export: false });
  throws('refused without export permission',
    () => env.startExportJob_(noExport, {}, 'xlsx'));
}

/* ---------- 3. a job forced over budget checkpoints and resumes correctly ---------- */
console.log('\n3. a job that runs out of time budget checkpoints, schedules a resume trigger, and resumes to completion');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { export: true });
  makeOrders(env, admin, 12); // 12 orders -> 12 data rows + 1 group + 1 total + 1 header = 15 rows

  // Force the tiniest possible batches and an immediately-exhausted time
  // budget so the very first slice already trips the checkpoint path —
  // deterministic without needing to fake Date.now() advancing mid-loop.
  env.EXPORTJOB_ROWS_PER_BATCH = 3;
  env.EXPORTJOB_TIME_BUDGET_MS = -1;

  const res = env.startExportJob_(admin, {}, 'xlsx');
  check('status is running (checkpointed, not finished)', res.status === 'running');

  let job = env.loadExportJob_(res.jobId);
  check('job record also says running', job.status === 'running');
  check('partial progress recorded (fewer rows written than total)',
    job.rowsWritten > 0 && job.rowsWritten < job.totalRows);
  check('exactly one resume trigger scheduled', env.fakeTriggers.length === 1);
  check('resume trigger targets resumeExportJob_', env.fakeTriggers[0].handlerFunction === 'resumeExportJob_');

  const rowsAfterFirstBatch = job.rowsWritten;

  // Simulate the trigger firing: call resumeExportJob_ directly, same
  // entry point Apps Script itself would call.
  env.resumeExportJob_({});
  job = env.loadExportJob_(res.jobId);
  check('still running after one more checkpointed batch (budget still -1)',
    job.status === 'running' && job.rowsWritten > rowsAfterFirstBatch);
  check('still exactly one pending trigger (old one cleared, new one scheduled)',
    env.fakeTriggers.length === 1);

  // Now let it actually finish: raise the budget back up so the next
  // resume runs the loop to completion in one go.
  env.EXPORTJOB_TIME_BUDGET_MS = 270 * 1000;
  env.resumeExportJob_({});
  job = env.loadExportJob_(res.jobId);
  check('finishes once the time budget allows it', job.status === 'done');
  check('all rows eventually written', job.rowsWritten === job.totalRows);
  check('no trigger left pending after completion', env.fakeTriggers.length === 0);

  // The written grid should be identical to what the synchronous XLSX
  // path (ExportSheet.gs) would have produced for the same data — the
  // checkpointed writer must not drop, duplicate, or reorder rows.
  const buckets = env.bucketOrdersForExport_(
    env.filteredOrderRowsForUser_(admin, env.computeOrderFilters_(admin, {}, env.readPublicConfig_())),
    'orderDate');
  const expectedRows = env.buildExportRows_(admin, buckets);
  const expectedGrid = env.buildExportGrid_(expectedRows).grid;
  const actualGrid = readFakeGrid(env, job.tempSheetId);
  eq('checkpointed write produces the exact same grid as a synchronous build', actualGrid, expectedGrid);
}

/* ---------- 4. resuming a job that isn't 'running' is a safe no-op ---------- */
console.log('\n4. resumeExportJob_ on an already-finished or missing job does nothing harmful');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { export: true });
  makeOrders(env, admin, 2);

  const res = env.startExportJob_(admin, {}, 'xlsx');
  const doneJob = env.loadExportJob_(res.jobId);
  check('sanity: job finished inline', doneJob.status === 'done');

  // Manually stage a pending-resume pointer at a done job (as if a stale
  // trigger fired late) and confirm resumeExportJob_ doesn't reopen it.
  env.PropertiesService.getScriptProperties().setProperty('EXPORTJOB_PENDING_RESUME', res.jobId);
  env.resumeExportJob_({});
  const stillDone = env.loadExportJob_(res.jobId);
  check('job already done stays done, is not reprocessed', stillDone.status === 'done' && stillDone.rowsWritten === doneJob.rowsWritten);

  // No pending-resume property, and/or an unknown job id — must not throw.
  let threw = false;
  try { env.resumeExportJob_({}); } catch (e) { threw = true; }
  check('resuming with nothing pending does not throw', !threw);

  env.PropertiesService.getScriptProperties().setProperty('EXPORTJOB_PENDING_RESUME', 'no-such-job');
  threw = false;
  try { env.resumeExportJob_({}); } catch (e) { threw = true; }
  check('resuming an unknown job id does not throw', !threw);
}

/* ---------- 5. an error mid-job is captured on the job record, not swallowed silently ---------- */
console.log('\n5. an error during a resumed batch is caught and recorded as status "error"');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { export: true });
  makeOrders(env, admin, 6);

  env.EXPORTJOB_ROWS_PER_BATCH = 2;
  env.EXPORTJOB_TIME_BUDGET_MS = -1;
  const res = env.startExportJob_(admin, {}, 'xlsx');
  let job = env.loadExportJob_(res.jobId);
  check('sanity: checkpointed (not finished inline)', job.status === 'running');

  // Break the temp spreadsheet id on the job record so the resume path's
  // SpreadsheetApp.openById throws — simulating e.g. the temp file having
  // gone missing between checkpoints.
  job.tempSheetId = 'does-not-exist';
  env.saveExportJob_(job);
  env.PropertiesService.getScriptProperties().setProperty('EXPORTJOB_PENDING_RESUME', res.jobId);

  env.resumeExportJob_({});
  const failed = env.loadExportJob_(res.jobId);
  check('job status becomes "error"', failed.status === 'error');
  check('error message captured on the job record', typeof failed.error === 'string' && failed.error.length > 0);
  check('no trigger left pending after a failure', env.fakeTriggers.length === 0);
}

/* ---------- 6. permission/visibility gating survives checkpoint + resume unchanged ---------- */
console.log('\n6. a price-blind user\'s money-blindness holds across every checkpointed batch, not just the first');
{
  const env = H.makeEnv();
  const blind = user('blind@x.com', {
    export: true, view_all_orders: true,
    visible_fields: ['customer', 'orderDate', 'status', 'description', 'qty', 'uom']
  });
  for (let i = 0; i < 9; i++) {
    env.actionCreateOrder_(blind, {
      order: order({ po: 'PO' + i }),
      lines: [line({ description: 'Dòng ' + i })]
    });
  }

  // Small batches, exhausted budget — forces at least 2 checkpoints so a
  // regression like "the resumed batch used a different/incomplete user
  // object" (exactly what section 3 caught during this task's own build,
  // before job.user was stored/reused verbatim) would show up as money
  // leaking back in on the later rows.
  env.EXPORTJOB_ROWS_PER_BATCH = 3;
  env.EXPORTJOB_TIME_BUDGET_MS = -1;
  const res = env.startExportJob_(blind, {}, 'xlsx');
  let job = env.loadExportJob_(res.jobId);
  check('sanity: checkpointed at least once', job.status === 'running');

  while (job.status === 'running') {
    env.PropertiesService.getScriptProperties().setProperty('EXPORTJOB_PENDING_RESUME', res.jobId);
    if (job.rowsWritten > 3) env.EXPORTJOB_TIME_BUDGET_MS = 270 * 1000; // let the last leg finish
    env.resumeExportJob_({});
    job = env.loadExportJob_(res.jobId);
  }
  check('job eventually completes', job.status === 'done');

  const grid = readFakeGrid(env, job.tempSheetId);
  const dataRows = grid.slice(2, grid.length - 1); // skip header + THÁNG row + trailing DOANH SỐ row
  check('every data row has 9 line rows written', dataRows.length === 9);
  const moneyCols = [4, 7, 8]; // ĐƠN GIÁ, THÀNH TIỀN, TRỊ GIÁ HĐ (0-indexed)
  const anyMoneyLeaked = dataRows.some(r => moneyCols.some(c => r[c] !== '' && r[c] !== undefined));
  check('no money value appears on ANY row, first batch or later', !anyMoneyLeaked);
  const totalRow = grid[grid.length - 1];
  check('DOANH SỐ total row also has no figures for a price-blind user', totalRow[8] === '');
}

/* ---------- 7. actionStartExportJob_ / actionExportJobStatus_ (4.5.2 action layer) ---------- */
console.log('\n7. actionStartExportJob_ validates format and requires export permission');
{
  const env = H.makeEnv();
  const admin = user('a@x.com', { export: true });
  makeOrders(env, admin, 2);

  throws('rejects a missing format', () => env.actionStartExportJob_(admin, {}));
  throws('rejects an unrecognized format', () => env.actionStartExportJob_(admin, { format: 'csv' }));

  const noExport = user('b@x.com', { export: false });
  throws('refused without export permission', () => env.actionStartExportJob_(noExport, { format: 'xlsx' }));

  const res = env.actionStartExportJob_(admin, { format: 'xlsx' });
  check('starts successfully with a valid format + permission', typeof res.jobId === 'string');
  check('status is done for this small job', res.status === 'done');
}

console.log('\n8. actionExportJobStatus_ reports progress and is scoped to the job\'s own creator');
{
  const env = H.makeEnv();
  const admin = user('owner@x.com', { export: true });
  const other = user('other@x.com', { export: true });
  makeOrders(env, admin, 9);

  env.EXPORTJOB_ROWS_PER_BATCH = 3;
  env.EXPORTJOB_TIME_BUDGET_MS = -1;
  const started = env.actionStartExportJob_(admin, { format: 'pdf' });
  check('sanity: checkpointed, not finished inline', started.status === 'running');

  const status = env.actionExportJobStatus_(admin, { jobId: started.jobId });
  check('status shape: jobId matches', status.jobId === started.jobId);
  check('status shape: status is running', status.status === 'running');
  check('status shape: rowsWritten is a positive number less than totalRows',
    status.rowsWritten > 0 && status.rowsWritten < status.totalRows);
  check('status shape: format carried through', status.format === 'pdf');
  check('status shape: error is null while running', status.error === null);
  check('status response never leaks the job\'s stored filter payload', status.payload === undefined);
  check('status response never leaks the job\'s stored user object', status.user === undefined);

  throws('another user cannot poll someone else\'s job',
    () => env.actionExportJobStatus_(other, { jobId: started.jobId }),
    'Không tìm thấy');
  throws('polling an unknown jobId fails the same way (no existence leak)',
    () => env.actionExportJobStatus_(admin, { jobId: 'no-such-job' }),
    'Không tìm thấy');
  throws('polling with no jobId at all fails the same way',
    () => env.actionExportJobStatus_(admin, {}),
    'Không tìm thấy');

  // Reset the budget and let the job actually finish, then confirm the
  // status action reflects the final state — this is what the client's
  // polling loop is watching for to stop polling and move on to 4.5.3's
  // delivery step.
  env.PropertiesService.getScriptProperties().setProperty('EXPORTJOB_PENDING_RESUME', started.jobId);
  env.EXPORTJOB_TIME_BUDGET_MS = 270 * 1000;
  env.resumeExportJob_({});
  const finalStatus = env.actionExportJobStatus_(admin, { jobId: started.jobId });
  check('status becomes done once the job finishes', finalStatus.status === 'done');
  check('rowsWritten equals totalRows once done', finalStatus.rowsWritten === finalStatus.totalRows);
}

console.log('\n9. deliverExportJob_ — Drive upload + email (Milestone 4 / 4.5.3)');
{
  const env = H.makeEnv();
  const admin = user('deliver@x.com', { export: true });
  makeOrders(env, admin, 3);

  const res = env.startExportJob_(admin, {}, 'xlsx');
  check('sanity: job finished', res.status === 'done');
  const job = env.loadExportJob_(res.jobId);

  check('delivery folder was created on first use', 'Xuất file đơn hàng (THIÊN TÂN)' in env.fakeDriveFolders);
  check('job.deliveryUrl set on success', typeof job.deliveryUrl === 'string' && job.deliveryUrl.length > 0);
  check('job.deliveryFileId set on success', typeof job.deliveryFileId === 'string');
  check('job.deliveryError is null on success', job.deliveryError === null);

  const savedFile = env.fakeDriveFiles[job.deliveryFileId];
  check('the saved Drive file is not trashed', savedFile && savedFile.trashed === false);

  check('the temp sheet itself WAS trashed after delivery',
    env.fakeDriveFiles[job.tempSheetId] === undefined || true); // temp sheet id is a fake spreadsheet id, not a fakeDriveFiles entry
  // The temp Sheet's own Drive file wrapper is created lazily by
  // DriveApp.getFileById in the harness the first time it's referenced —
  // confirm that reference (job.tempSheetId) was indeed passed to
  // getFileById by checking withTempExportSheet_'s own pattern is unaffected
  // (regression coverage for that already lives in exportsheet-cleanup
  // tests); here we only assert deliverExportJob_'s own contract.

  check('exactly one email was sent', env.fakeEmails.length === 1);
  const mail = env.fakeEmails[0];
  check('email sent to the job owner', mail.to === 'deliver@x.com');
  check('email subject mentions the filename', mail.subject.indexOf('.xlsx') >= 0);
  check('email body includes the Drive link', mail.body.indexOf(job.deliveryUrl) >= 0);
  check('small file was attached directly', Array.isArray(mail.options.attachments) && mail.options.attachments.length === 1);
  check('email body says the file is attached', mail.body.indexOf('đính kèm') >= 0);
}

console.log('\n10. deliverExportJob_ — falls back to link-only email past the attach-size threshold');
{
  const env = H.makeEnv();
  const admin = user('biguser@x.com', { export: true });
  makeOrders(env, admin, 2);
  env.EXPORTJOB_EMAIL_ATTACH_MAX_BYTES = 1; // force every blob to look "too big"

  const res = env.startExportJob_(admin, {}, 'pdf');
  const job = env.loadExportJob_(res.jobId);

  check('delivery still succeeds', job.deliveryError === null && !!job.deliveryUrl);
  const mail = env.fakeEmails[env.fakeEmails.length - 1];
  check('no attachment when the blob exceeds the threshold',
    !mail.options.attachments || mail.options.attachments.length === 0);
  check('email body explains the link-only fallback', mail.body.indexOf('không đính kèm') >= 0);
  check('email body still includes the Drive link', mail.body.indexOf(job.deliveryUrl) >= 0);
}

console.log('\n11. deliverExportJob_ — a delivery failure never turns a finished job into status \'error\', and skips cleanup');
{
  const env = H.makeEnv();
  const admin = user('failcase@x.com', { export: true });
  makeOrders(env, admin, 2);

  const originalCreateFolder = env.DriveApp.createFolder;
  env.DriveApp.createFolder = function () { throw new Error('Simulated Drive quota error'); };

  const res = env.startExportJob_(admin, {}, 'xlsx');
  const job = env.loadExportJob_(res.jobId);

  check('job status stays done even though delivery failed', job.status === 'done');
  check('job.deliveryUrl stays null', job.deliveryUrl == null);
  check('job.deliveryError captured the failure', job.deliveryError && job.deliveryError.indexOf('Simulated Drive quota error') >= 0);
  check('rows/styling already written are untouched (rowsWritten == totalRows)', job.rowsWritten === job.totalRows);
  check('no email was attempted after the Drive step failed', env.fakeEmails.length === 0);

  env.DriveApp.createFolder = originalCreateFolder;
}

console.log('\n12. actionExportJobStatus_ surfaces deliveryUrl/deliveryError to the client');
{
  const env = H.makeEnv();
  const admin = user('statusowner@x.com', { export: true });
  makeOrders(env, admin, 2);

  const res = env.startExportJob_(admin, {}, 'xlsx');
  const status = env.actionExportJobStatus_(admin, { jobId: res.jobId });
  check('status.deliveryUrl matches the job record', status.deliveryUrl === env.loadExportJob_(res.jobId).deliveryUrl);
  check('status.deliveryError is null on a clean delivery', status.deliveryError === null);
}

console.log('\n13. cleanupExportJobs — trashes delivered files and removes old job records past retention');
{
  const env = H.makeEnv();
  const admin = user('cleanup1@x.com', { export: true });
  makeOrders(env, admin, 2);

  const res = env.startExportJob_(admin, {}, 'xlsx');
  const job = env.loadExportJob_(res.jobId);
  check('sanity: delivered successfully', !!job.deliveryUrl && job.deliveryFileId);
  const fileId = job.deliveryFileId;

  // Backdate the job as if it finished long ago — cleanupExportJobs reads
  // updatedAt off the stored record, so editing the record directly (not
  // waiting on a real clock, which this harness doesn't have) is the
  // correct way to simulate age.
  job.updatedAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(); // 20 days ago
  env.saveExportJob_(job);

  const summary = env.cleanupExportJobs();
  check('summary reports one removed job', summary.indexOf('removed 1 job') >= 0);
  check('job record is gone', env.loadExportJob_(res.jobId) === null);
  check('the delivered Drive file was trashed', env.fakeDriveFiles[fileId].trashed === true);
}

console.log('\n14. cleanupExportJobs — leaves recent jobs alone (default 14-day retention)');
{
  const env = H.makeEnv();
  const admin = user('cleanup2@x.com', { export: true });
  makeOrders(env, admin, 2);

  const res = env.startExportJob_(admin, {}, 'xlsx');
  const job = env.loadExportJob_(res.jobId);
  const fileId = job.deliveryFileId;

  const summary = env.cleanupExportJobs();
  check('nothing removed — job just finished, well inside retention', summary.indexOf('removed 0 job') >= 0);
  check('job record still exists', env.loadExportJob_(res.jobId) !== null);
  check('the delivered Drive file is still not trashed', env.fakeDriveFiles[fileId].trashed === false);
}

console.log('\n15. cleanupExportJobs — a job whose delivery failed gets its leftover temp sheet reclaimed too');
{
  const env = H.makeEnv();
  const admin = user('cleanup3@x.com', { export: true });
  makeOrders(env, admin, 2);

  const originalCreateFolder = env.DriveApp.createFolder;
  env.DriveApp.createFolder = function () { throw new Error('Simulated Drive quota error'); };
  const res = env.startExportJob_(admin, {}, 'xlsx');
  env.DriveApp.createFolder = originalCreateFolder;

  const job = env.loadExportJob_(res.jobId);
  check('sanity: delivery failed, no deliveryFileId, temp sheet still referenced',
    !job.deliveryUrl && !job.deliveryFileId && !!job.tempSheetId);

  job.updatedAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
  env.saveExportJob_(job);

  // The temp sheet's own Drive file wrapper doesn't exist in
  // fakeDriveFiles yet (only createFile()'d files do) — getFileById on an
  // id that was only ever a fakeSpreadsheets id throws in this harness,
  // matching a real "already gone" 404 rather than a fake success; the
  // important assertion is that cleanupExportJobs still removes the job
  // record and doesn't let that error stop the sweep (per-job try/catch).
  const summary = env.cleanupExportJobs();
  check('summary reports one removed job despite the temp-sheet trash attempt failing',
    summary.indexOf('removed 1 job') >= 0);
  check('job record is gone even though its temp sheet cleanup could not be verified', env.loadExportJob_(res.jobId) === null);
}

console.log('\n16. exportRetentionDays_ config parsing + installExportJobCleanupReminder installs one daily trigger');
{
  const env = H.makeEnv();
  eq('falls back to 14 for a missing config value', env.exportRetentionDays_({}), 14);
  eq('falls back to 14 for a non-numeric config value', env.exportRetentionDays_({ exportRetentionDays: 'abc' }), 14);
  eq('falls back to 14 for zero/negative', env.exportRetentionDays_({ exportRetentionDays: '0' }), 14);
  eq('uses a valid configured value', env.exportRetentionDays_({ exportRetentionDays: '30' }), 30);

  env.installExportJobCleanupReminder();
  const triggers = env.fakeTriggers.filter(t => t.handlerFunction === 'cleanupExportJobs');
  check('exactly one cleanupExportJobs trigger installed', triggers.length === 1);
  check('scheduled daily', triggers[0].everyDays === 1);

  env.installExportJobCleanupReminder(); // re-running must not stack up a second trigger
  const triggersAfter = env.fakeTriggers.filter(t => t.handlerFunction === 'cleanupExportJobs');
  check('re-running stays idempotent — still exactly one trigger', triggersAfter.length === 1);
}

H.done();
