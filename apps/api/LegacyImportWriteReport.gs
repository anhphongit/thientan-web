/**
 * LegacyImportWriteReport.gs — Milestone 7 / Phase 3 (report formatting)
 * plus Phase 4 (resume-position reporting). Split out of LegacyImportWrite.gs
 * per the repo's 200-line modularization rule: legacyRunImportBatch_'s tally
 * bookkeeping lives there, turning those tallies into the human-readable run
 * summary an editor "Run" click prints is a separate concern that lives here.
 */

/** Short identifying string for a skipped-order log line — enough for a
 *  human to find the original rows in the source Excel without dumping the
 *  entire parsed group. */
function legacyDescribeOrder_(group) {
  var po = String(group.po || '').replace(/\n/g, ' | ').trim();
  return 'STT ' + (group.stt || '?') + ', customer "' + (group.customer || '') + '", PO "' + po + '"';
}

/**
 * Builds the human-readable write-run report from legacyRunImportBatch_'s
 * tallies. Milestone 7 / Phase 4 — also reports the resume-position window
 * this run covered (resumeStart..resumeEnd of totalParsed), so a re-run's
 * output makes the idempotency behavior visible rather than implicit.
 */
function legacyBuildWriteReport_(written, skipped, remaining, perMonthCounts, reviewFlagCount,
    skippedDetails, resumeStart, resumeEnd, totalParsed, stoppedByTimeBudget) {
  var lines = ['Legacy import write run (' + LEGACY_SHEET_NAME_ + ').'];
  lines.push('Resume position: started at order #' + resumeStart + ', now at #' + resumeEnd +
    ' of ' + totalParsed + ' total parsed order(s).');
  lines.push('Orders written this run: ' + written);
  if (skipped) {
    lines.push('Orders skipped: ' + skipped +
      ' (see details below — a skipped order still advances the resume position, it is never retried)');
  }

  Object.keys(perMonthCounts)
    .sort(function (a, b) { return Number(a) - Number(b); })
    .forEach(function (m) {
      lines.push('  THÁNG ' + m + ': ' + perMonthCounts[m] + ' order(s) written');
    });

  lines.push('Review flags carried over from mapping (Phase 2): ' + reviewFlagCount);
  if (remaining && stoppedByTimeBudget) {
    lines.push('Orders remaining, not processed this run (stopped at the ' +
      (LEGACY_IMPORT_TIME_BUDGET_MS_ / 1000) + 's time-budget safety margin, under the cap ' +
      'of ' + LEGACY_IMPORT_RUN_CAP_ + '/run) — run again to continue: ' + remaining);
  } else {
    lines.push(remaining
      ? ('Orders remaining, not processed this run (cap ' + LEGACY_IMPORT_RUN_CAP_ +
         '/run) — run again to continue: ' + remaining)
      : 'No orders remaining — every parsed order was processed this run.');
  }

  if (skippedDetails.length) {
    lines.push('Skipped order details:');
    skippedDetails.forEach(function (d) { lines.push('  - ' + d); });
  }

  return lines.join('\n');
}
