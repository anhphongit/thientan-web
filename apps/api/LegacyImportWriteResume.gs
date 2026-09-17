/**
 * LegacyImportWriteResume.gs — Milestone 7 / Phase 4: idempotency and
 * resumability for the legacy Excel import write path (LegacyImportWrite.gs
 * / LegacyImportWriteOrder.gs). Apps Script's 6-minute execution ceiling
 * means migrateImportLegacyOrders() may need several separate runs to cover
 * every parsed order (~206 total); this file makes a second (or third, ...)
 * run pick up exactly where the previous one stopped instead of re-writing
 * orders it already wrote — the same "recomputes from source data, never
 * trusts a previous run's output" convention Migrations.gs documents
 * (Migrations.gs:10-12), applied here via an explicit resume-position index
 * rather than a sheet rescan.
 *
 * WHY A SCRIPT PROPERTY INDEX, NOT A SHEET-SCAN TAG (unlike DevSeed.gs's
 * nextSeedNumber_ precedent): DevSeed's SEED-<n> po tags are synthetic data
 * it invented, so scanning the sheet for the highest one back is safe. A
 * legacy-imported order's `po` is a REAL historical value that must be
 * preserved exactly, so it cannot be overloaded with a resume marker.
 * Phase 1's parse produces a deterministic, source-row-ordered list of order
 * groups (parsed.months[].orders[], flattened the same way on every call —
 * see legacyRunImportBatch_'s `allOrders` build in LegacyImportWrite.gs) —
 * an integer index into that list is all resuming needs, and it touches no
 * user-visible field.
 *
 * RESUME POINT SEMANTICS: the index is the count of parsed orders already
 * FULLY RESOLVED by a previous run — either successfully written (its
 * Orders header row appended) or explicitly skipped (Phase 3's
 * no-parseable-date / unparseable-line-data cases). A skipped order is
 * never retried forever: once legacyRunImportBatch_ has looked at it and
 * logged why it can't be imported, the index moves past it exactly like a
 * written order does — but the run report keeps "written" and "skipped" as
 * separate tallies (LegacyImportWrite.gs's legacyBuildWriteReport_) so a
 * skip is never miscounted as an import. An order that CRASHES mid-write
 * (an exception thrown from legacyWriteOneOrder_ itself) does NOT advance
 * the index — see legacyRunImportBatch_'s comment on why that call is
 * deliberately not wrapped in try/catch: the whole run aborts, and the next
 * run re-attempts that exact order from scratch.
 */

/**
 * Reads the current resume index — how many parsed orders, in
 * legacyRunImportBatch_'s deterministic order, are already resolved. Reads
 * back as 0 if never set: a fresh deployment and a deliberate reset
 * (resetLegacyImportResumePoint below) both mean "start from the beginning."
 */
function getLegacyImportResumePoint_() {
  var raw = PropertiesService.getScriptProperties().getProperty(PROP.LEGACY_IMPORT_RESUME_INDEX);
  var n = parseInt(raw, 10);
  return (isNaN(n) || n < 0) ? 0 : n;
}

/**
 * Writes the resume index to a Script Property — not in-memory state, so it
 * survives across separate Apps Script executions (the entire point; see
 * the file doc comment above).
 */
function setLegacyImportResumePoint_(index) {
  PropertiesService.getScriptProperties().setProperty(PROP.LEGACY_IMPORT_RESUME_INDEX, String(index));
}

/**
 * Admin-only, deliberate reset back to index 0 — for the rare case of
 * intentionally re-running the import against a corrected source file.
 * guardSetup_()-guarded and no trailing underscore, same run-by-hand
 * convention as migrateImportLegacyOrders/seedTestOrders/DevSeed.gs's
 * helpers: appears in the API editor's Run dropdown, never reachable over
 * HTTP (guardSetup_ throws if any editor-only name it recognizes is ever
 * found in getActions_()'s registry).
 *
 * THIS DOES NOT UNDO ANY WRITTEN ORDER. It only rewinds where the next run
 * starts reading from Phase 1's parsed list — running
 * migrateImportLegacyOrders() again afterward re-imports every order from
 * the start, duplicating whatever a prior run already wrote unless those
 * rows are removed first. Use only when that is genuinely intended (e.g.
 * the source file was corrected and the sheet was restored from a
 * pre-import backup) — never as a confused reflex after a run looks wrong.
 * Documented as an explicit, deliberate action in the Phase 5 runbook.
 */
function resetLegacyImportResumePoint() {
  guardSetup_();
  setLegacyImportResumePoint_(0);
  var summary = 'resetLegacyImportResumePoint: resume index reset to 0. The next ' +
    'migrateImportLegacyOrders() run will re-process every parsed order from the start — ' +
    'only do this deliberately (e.g. after restoring the sheet from a pre-import backup), ' +
    'never as a blind retry after an unexpected run result.';
  console.log(summary);
  return summary;
}

/**
 * Defensive tripwire (Phase 4 Implementation Step 3): before
 * legacyWriteOneOrder_ (LegacyImportWriteOrder.gs) writes the first
 * OrderLines row for a freshly allocated orderId, assert that NO OrderLines
 * row already exists for that id. Should be impossible — nextOrderId_()
 * (Orders.gs) never reissues an id already present on the live Orders
 * sheet, and the resume index above already excludes every
 * previously-resolved parsed order — but if this invariant is ever
 * violated (e.g. a resume index that drifted from actual sheet state
 * because rows were deleted/restored by hand between runs, see the phase
 * plan's Risk Assessment), fail loudly rather than silently overwrite or
 * duplicate line data.
 */
function legacyAssertNoOrderLinesForOrderId_(orderId) {
  var existing = findBy_(SHEETS.ORDER_LINES, 'orderId', orderId);
  if (existing) {
    var msg = 'legacyAssertNoOrderLinesForOrderId_: OrderLines already has a row for ' +
      'newly allocated orderId ' + orderId + ' — resume-position invariant violated ' +
      '(this should be impossible). Aborting this write; check for a drifted ' +
      'LEGACY_IMPORT_RESUME_INDEX Script Property or manually edited sheet rows before ' +
      're-running migrateImportLegacyOrders().';
    console.error(msg);
    throw new Error(msg);
  }
}
