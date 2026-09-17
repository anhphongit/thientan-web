/**
 * LegacyImportWrite.gs — Milestone 7 / Phase 3: bulk write path. Orchestrates
 * the Drive conversion + Phase 1's parse + Phase 2's mapping + this phase's
 * own per-order write (LegacyImportWriteOrder.gs) into one editor-run
 * migration, `migrateImportLegacyOrders()`, and reports what happened.
 *
 * Same run-by-hand convention as Migrations.gs / DevSeed.gs /
 * dryRunImportLegacyOrders (Phase 1): no trailing underscore so it appears
 * in the API editor's Run dropdown, `guardSetup_()`-guarded, never added to
 * getActions_()'s registry (Router.gs) — unreachable over HTTP.
 *
 * UNLIKE dryRunImportLegacyOrders (Phase 1), this DOES write: real Orders,
 * OrderLines, Invoices, and StatusHistory rows, through the exact same
 * primitives actionCreateOrder_ uses (see LegacyImportWriteOrder.gs). Capped
 * at LEGACY_IMPORT_RUN_CAP_ orders per run (mirrors DevSeed's per-run cap
 * under Apps Script's 6-minute execution ceiling) — run it again to continue
 * with the next batch. Milestone 7 / Phase 4 (LegacyImportWriteResume.gs)
 * adds resume-point skip logic on top of this cap, so a second run picks up
 * exactly where the first stopped instead of re-importing anything already
 * written -- see legacyRunImportBatch_ below and LegacyImportWriteResume.gs's
 * file doc comment for the full mechanism.
 *
 * `createdBy`/`changedBy` on every imported row is the running Admin's own
 * email (`loadUser_(ADMIN_EMAIL)`, same pattern DevSeed.gs uses) — decided
 * by the user ahead of this phase's implementation (see phase-03's Key
 * Insights: the legacy file carries no per-order user attribution to
 * preserve instead).
 *
 * HOW TO RUN
 *   1. Same LEGACY_IMPORT_FILE_ID Script Property Phase 1 used
 *      (dryRunImportLegacyOrders already validated it points at a readable
 *      file).
 *   2. Run this ONLY against a duplicate/test copy of the live spreadsheet
 *      first — never production on the first attempt (phase-03's
 *      Implementation Steps 3-4). Spot-check 5-10 written orders against the
 *      original Excel rows before ever running against production.
 *   3. Select `migrateImportLegacyOrders` in the editor's Run dropdown and
 *      press Run. Read the returned summary: orders written, orders
 *      remaining (if capped), per-month counts, review-flag count, and any
 *      skipped-order details (no parseable date, or unparseable line data —
 *      these need a manual look, not a blind retry).
 *
 * THIS PHASE DOES NOT: reconcile totals against the printed DOANH SỐ
 * figures (Phase 5). Skipping already-imported orders on a second run is
 * handled by Phase 4 (LegacyImportWriteResume.gs) -- see legacyRunImportBatch_.
 */

/** Per-run cap — a bulk order-create write (id allocation, N line writes,
 *  header write, invoice linkage, status history) is heavier per order than
 *  DevSeed's synthetic rows, so this stays below DevSeed's 200-order cap,
 *  per the phase plan's ~150 guidance. Kept as a hard upper bound, but see
 *  LEGACY_IMPORT_TIME_BUDGET_MS_ below — in practice the real per-order
 *  Sheets API cost (2026-09-16 incident: a real run against production hit
 *  "Exceeded maximum execution time" well before 150 orders) makes the time
 *  budget the actual limiting factor almost every run. */
var LEGACY_IMPORT_RUN_CAP_ = 150;

/** Wall-clock safety margin under Apps Script's 6-minute execution ceiling
 *  — same 4.5-minute convention as ExportJob.gs's EXPORTJOB_TIME_BUDGET_MS.
 *  legacyRunImportBatch_ checks this BEFORE starting each order (never
 *  mid-order), so a run always returns its report instead of being hard-
 *  killed — a hard kill mid-order was already safe (Fix 1, 2026-09-16: lines
 *  write before the Orders header, so a kill only ever leaves harmless
 *  orphaned lines), but it also meant zero visibility into what happened
 *  and wasted the rest of the 6-minute window. */
var LEGACY_IMPORT_TIME_BUDGET_MS_ = 270 * 1000;

function migrateImportLegacyOrders() {
  guardSetup_();

  var adminEmail = String(
    PropertiesService.getScriptProperties().getProperty(PROP.ADMIN_EMAIL) || ''
  ).trim();
  if (!adminEmail) {
    throw new Error('migrateImportLegacyOrders: ADMIN_EMAIL is not set — see Setup.gs.');
  }
  var adminUser = loadUser_(adminEmail);

  var fileId = String(
    PropertiesService.getScriptProperties().getProperty('LEGACY_IMPORT_FILE_ID') || ''
  ).trim();
  if (!fileId) {
    throw new Error('migrateImportLegacyOrders: LEGACY_IMPORT_FILE_ID is not set in Script ' +
      'Properties — set it to the Drive file id of FILE THEO DOI DON HANG.xlsx.');
  }

  var tempSheetId = null;
  var parsed;
  try {
    tempSheetId = convertLegacyXlsxToSheet_(fileId);
    var ss = SpreadsheetApp.openById(tempSheetId);
    var sheet = ss.getSheetByName(LEGACY_SHEET_NAME_);
    if (!sheet) {
      throw new Error('migrateImportLegacyOrders: sheet "' + LEGACY_SHEET_NAME_ +
        '" not found in the converted spreadsheet.');
    }
    parsed = parseLegacySheet_(sheet);
  } finally {
    legacyCleanupTempFile_(tempSheetId);
  }

  var summary = legacyRunImportBatch_(parsed, adminUser, LEGACY_IMPORT_RUN_CAP_);
  console.log(summary);
  return summary;
}

/**
 * Drive-free batch loop: given Phase 1's parseLegacySheet_() output and an
 * already-resolved admin identity, maps (Phase 2) + writes (this phase) up
 * to `cap` orders across every month, in source order, and returns a
 * human-readable summary. Split out from migrateImportLegacyOrders() so it
 * is directly testable offline with a synthetic parsed sheet — no Drive/
 * SpreadsheetApp/guardSetup_ dependency (see legacy-import-write.test.js).
 *
 * Milestone 7 / Phase 4 — RESUMABLE: `allOrders` below is the same
 * deterministic, source-row-ordered flattening Phase 3 always built; this
 * phase adds a Script-Property-backed start offset
 * (getLegacyImportResumePoint_, LegacyImportWriteResume.gs) so a run never
 * re-looks-at an order a previous run already fully resolved (written OR
 * explicitly skipped). The resume index only advances past an entry AFTER
 * it is fully resolved — for a written order, that means AFTER
 * legacyWriteOneOrder_ returns (its Orders header row is the last thing it
 * appends), so a crash partway through one order's write leaves the index
 * pointing at that same order for the next run to re-attempt whole, never
 * half-written.
 */
function legacyRunImportBatch_(parsed, adminUser, cap) {
  var config = readPublicConfig_();
  var startedAt = Date.now();

  var allOrders = [];
  parsed.months.forEach(function (m) {
    m.orders.forEach(function (o) { allOrders.push({ month: m.month, group: o }); });
  });

  var resumeStart = getLegacyImportResumePoint_();
  var written = 0, skipped = 0, reviewFlagCount = 0;
  var perMonthCounts = {};
  var skippedDetails = [];
  var resumeIndex = resumeStart;
  var stoppedByTimeBudget = false;

  for (var i = resumeStart; i < allOrders.length; i++) {
    if (resumeIndex - resumeStart >= cap) break;
    if (Date.now() - startedAt >= LEGACY_IMPORT_TIME_BUDGET_MS_) {
      stoppedByTimeBudget = true;
      break;
    }

    var entry = allOrders[i];
    var group = entry.group;
    var mapped = mapLegacyOrderGroup_(group, config);
    reviewFlagCount += mapped.reviewFlags.length;

    var orderDate = legacyResolveOrderDate_(group);
    if (!orderDate) {
      skipped++;
      skippedDetails.push(legacyDescribeOrder_(group) +
        ': no parseable order date (Ngày HĐ blank or unrecognized on every line — ' +
        'run legacyAuditNgayHdFormats() to see the raw values)');
      // Skipped orders still advance the index (Phase 4): nothing was
      // written for it, there is nothing to re-attempt, and leaving the
      // index behind would make every future run re-skip it forever.
      resumeIndex++;
      setLegacyImportResumePoint_(resumeIndex);
      continue;
    }

    var convertedLines;
    try {
      convertedLines = legacyConvertLineFieldsOrThrow_(mapped.lineFields);
    } catch (err) {
      skipped++;
      skippedDetails.push(legacyDescribeOrder_(group) + ': ' + err.message);
      resumeIndex++;
      setLegacyImportResumePoint_(resumeIndex);
      continue;
    }

    // Deliberately NOT wrapped in try/catch: if legacyWriteOneOrder_ throws
    // (e.g. a transient Sheets write failure mid-order), the exception must
    // propagate and abort this whole run WITHOUT advancing the resume index
    // past this entry — see this function's doc comment above.
    legacyWriteOneOrder_(mapped, convertedLines, orderDate, adminUser);
    written++;
    perMonthCounts[entry.month] = (perMonthCounts[entry.month] || 0) + 1;

    // Advance the resume index ONLY after the order's Orders header row is
    // fully written (legacyWriteOneOrder_ already returned successfully).
    resumeIndex++;
    setLegacyImportResumePoint_(resumeIndex);
  }

  var remaining = allOrders.length - resumeIndex;

  if (written) bumpOrdersVersion_();

  return legacyBuildWriteReport_(written, skipped, remaining, perMonthCounts, reviewFlagCount,
    skippedDetails, resumeStart, resumeIndex, allOrders.length, stoppedByTimeBudget);
}

// legacyDescribeOrder_ / legacyBuildWriteReport_ split into
// LegacyImportWriteReport.gs (repo's 200-line-per-file guideline).
