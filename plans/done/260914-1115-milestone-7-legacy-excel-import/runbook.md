# Milestone 7 — Legacy Excel Import Runbook

Process documentation for executing the one-time historical import of
`FILE THEO DOI DON HANG.xlsx` into the live THIENTAN spreadsheet. This is a
**plan artifact**, not project documentation — it describes how to *run* the
migration once; it is not kept in sync after the fact. Once the live run is
complete, `docs/EXCEL_REFERENCE.md` / `docs/MILESTONES.md` / etc. are updated
to describe the import as a completed historical event (see Step 10) — this
file is not touched again after that.

Full phase spec:
`plans/260914-1115-milestone-7-legacy-excel-import/phase-05-reconciliation-live-run-and-docs-sync.md`

**Status as of this writing: NOT YET EXECUTED.** Steps 1–6 below (through the
test-copy reconcile) may be run ahead of time by anyone with editor access.
Steps 7–10 (the live run itself) require the project owner present — do not
run them solo.

**2026-09-16: a partial test-copy Step 4 run already happened and hit the
year-2001 date bug (see Step 2a).** That test-copy spreadsheet's ~74 written
orders are stale/incorrect (some dated 2001) — discard that copy (do not
reuse it) and start Step 3 over with a **fresh** duplicate once the fix has
been pushed via `clasp`.

---

## 0a. Pre-flight — `done` status entry (code review 2026-09-16)

`Config.gs`'s `CONFIG_DEFAULTS.statusList` now includes a `done` / "Hoàn
thành" entry so `mapStatusCell_` matches the ~443 of ~534 legacy lines whose
raw TRẠNG THÁI text is literally "done"/"Done" (case-insensitive) instead of
falling through to a `status-unmatched` review flag. This default only seeds
a **fresh** Config sheet (`seedConfigDefaults_` skips keys already present)
— it does **not** retroactively add the entry to a Config sheet that already
exists (this project's production sheet already exists).

**Before running Step 2 (dry run) or Step 4 (test-copy write) against
production or a copy of it:** add the `done` status manually via the Admin
UI's config editor (statusList supports admin add/relabel, see
`AdminConfig.gs`'s `EDITABLE_CONFIG_KEYS`) — key `done`, label e.g. "Hoàn
thành" — on **both** the production Config sheet (before Step 2, since the
test copy in Step 3 is duplicated FROM production) and confirm it carried
over into the test copy after duplicating. Skipping this step does not break
anything — those lines just keep falling through to `status-unmatched`
review flags (Step 4's gate) — but doing it first avoids ~443 flags to
manually clear.

**2026-09-17 clarification (verified offline — `mapStatusCell_` correctly
resolves "done"/"Done" to `status: 'done'` given a `statusList` containing
`{key: 'done', label: ...}`, whatever label text you chose):** if you add
(or change) a Config entry like this **partway through** a Step 4 test-copy
run, already-written orders are NOT retroactively remapped — resumability
(Phase 4) only ever looks at orders not yet processed. If you see already-
imported lines still showing blank status + `statusNote: "done"` after
adding the entry, that's stale data from before the Config change, not a
live bug — **discard the test copy, reset the resume point
(`resetLegacyImportResumePoint()`), and start Step 3 over fresh** so every
order gets mapped against the SAME final Config, rather than mixing
old-mapping and new-mapping orders in one spreadsheet.

## 0. Prerequisites — Script Properties

Set these on the **API Apps Script project** (Project Settings → Script
Properties in the Apps Script editor, or `PropertiesService.getScriptProperties()
.setProperty(...)` run once from the editor console):

| Key | Value | Notes |
|-----|-------|-------|
| `LEGACY_IMPORT_FILE_ID` | `1EBfEWIzp9VLNpaWwasvPk_qI-O2NzGRv` | Drive file id of `FILE THEO DOI DON HANG.xlsx`. Already uploaded — see LegacyImport.gs's file doc comment. |
| `ADMIN_EMAIL` | the admin's Google account email | Same property `migrateImportLegacyOrders()`/Setup.gs already use elsewhere. Every imported row's `createdBy`/`changedBy` is this identity (phase-03's Key Insights: the legacy file carries no per-order attribution to preserve). |
| `SPREADSHEET_ID` | the spreadsheet to operate against | **This is the property that decides test-copy vs. production.** Point it at a duplicate spreadsheet for Steps 3–6, then re-point it at production for Steps 7–9. See Step 2. |

All three are read fresh on every run — no caching, no restart needed after
changing them (`PropertiesService` values are read live by every guarded
entry point below).

---

## 1. Initial full backup (safety net for the whole procedure)

Run `backupNow` against **production** before touching anything, even before
the dry run — a general safety net for the whole session, independent of the
narrower "fresh backup right before the live write" in Step 7.

- Via the Admin UI: the "Backup Now" action (`backupNow` → `actionBackupNow_`
  → `backupNow_()` in `apps/api/BackupJob.gs`) — click the button an admin
  account has access to.
- Confirm in Drive: a new timestamped backup subfolder exists with a
  spreadsheet copy inside, per M6's own exit criteria (confirm it opens and
  is restorable — do not just check the folder exists).

## 2. Dry run — parse only, no writes (Phase 1)

With `LEGACY_IMPORT_FILE_ID` set (Step 0) and `SPREADSHEET_ID` still pointing
at **production** (this step writes nothing regardless):

1. Open the API project in the Apps Script editor.
2. Select `dryRunImportLegacyOrders` in the Run dropdown, press Run.
3. Read the returned/logged report: order/line counts per month, any
   `unrecognizedRows`, and each month's parsed `DOANH SỐ THÁNG n` total.

**Gate:** if `unrecognizedRows` is non-empty, or a month's printed total
reads "not found" for a month you expect to have one, stop and investigate
the source file / `LegacyImportParse.gs` before continuing — a parsing gap
here will silently under/over-count in every later step.

## 2a. Date-format audit (2026-09-16 incident — run once before Step 4)

**Why:** a real test-copy run of Step 4 (2026-09-16, ~4:35pm) showed 206
parsed orders: only 74 written, 132 skipped as "no parseable order date",
and — worse — some of the 74 that WERE written landed in year **2001**.

**Root cause:** `Ngày HĐ` (col K) is frequently stored as bare `d/m` with no
year. The shared `parseDate_` (Orders.gs) only recognizes ISO and full
`d/m/yyyy`; anything else falls back to the native `new Date(text)`
constructor, which is silently inconsistent for a bare `d/m`:
`new Date("6/6")` "succeeds" as US `m/d` in year **2001** (V8's legacy
default), while `new Date("22/9")` (day > 12, unambiguous) correctly fails.
So ambiguous dates (day ≤ 12) were silently corrupted to 2001, and
unambiguous ones (day > 12) were silently dropped as "unparseable" — both
wrong, explaining both symptoms in the same log.

**Fix applied (2026-09-16):** a new `legacyParseHistoricalDate_()`
(`LegacyImportDateParse.gs`), used in place of `parseDate_` only within
Milestone 7's own code, never delegates a bare `d/m` to the native Date
constructor — it parses ISO / `d/m/yyyy` exactly like `parseDate_`, and
additionally recognizes bare `d/m` explicitly, defaulting to
`legacyImportYear_()` (2026, derived from `LEGACY_SHEET_NAME_`, not a
second hardcoded constant). Anything else still returns null — never a
guessed date. 13 offline regression tests cover the exact `"6/6"`/`"22/9"`
cases from the incident. **Step 4 must be re-run from a fresh test copy**
after this fix — the previous test-copy run's 74 orders (some dated 2001)
are stale and must not be trusted.

This audit step remains useful as a pre-flight check — it verifies the
"always bare d/m" assumption holds for the real file before Step 4 runs,
rather than only discovering exceptions after a write.

**Second incident (2026-09-16, real audit run):** `legacyAuditNgayHdFormats()`
against the real file found 324 bare `d/m` (now fixed), 207 blank (fine —
`legacyResolveOrderDate_` scans every line of an order, only skips if ALL
are blank), and 7 exceptions:
- **5 rows in the THÁNG 4 block** (`"4/21/2026"`, `"5/15/2026"`, etc.) were
  mis-flagged as "has a year — probably fine" but were actually **US
  M/D/YYYY**, not Vietnamese D/M/YYYY — month=21/15 is invalid under D/M, so
  the old unvalidated `dmy` branch let the native month-index silently roll
  into a **different year** (`new Date(2026, 20, 4)` → September 2027, not
  April 2026) — same silent-wrong-date failure class as the year-2001
  incident. **Fixed**: `legacyParseHistoricalDate_` now validates day/month
  ranges for `d/m/yyyy` too, and falls back to M/D only when D/M is
  mathematically invalid (never an ambiguous guess — confirmed by 4 more
  offline regression tests).
- **2 rows are genuinely unrecoverable**: `"30/30"` (THÁNG 3, row 144) and
  `"24/24/26"` (THÁNG 4, row 158) — invalid under every reading. **Decision
  (2026-09-16): fix these 2 cells directly in the source
  `FILE THEO DOI DON HANG.xlsx` before the next Step 2a/4 run** — the code
  will keep skipping (and flagging) these 2 orders otherwise, never guess.

**Step 4 must be re-run from a fresh test copy again** after this second
fix, for the same reason as the first.

1. Select `legacyAuditNgayHdFormats` in the Run dropdown, press Run.
2. Read the report: counts for bare `d/m` (expected), `d/m/yyyy` (has an
   explicit year — a real exception), blank, and "other" (unrecognized
   shape) — with every `d/m/yyyy`/`other` row listed individually (row
   number + raw text) so it can be checked against the source Excel.

**Gate:** if `d/m/yyyy` or `other` counts are non-zero, do NOT proceed to
Step 4 until each listed row has been checked by hand — a `d/m/yyyy` row
almost certainly still means 2026 (safe), but confirm it doesn't contradict
the month block it's in; an `other` row needs a source-file decision (fix
the cell, or accept the order will be skipped — `legacyResolveOrderDate_`
never fabricates a date).

## 3. Create a test-copy spreadsheet

1. In Drive, duplicate the live production spreadsheet (File → Make a copy).
   This copy must be the **exact same schema** (all sheets/headers) as
   production — a straight Drive duplicate guarantees that.
2. Set the `SPREADSHEET_ID` Script Property (Step 0) to the **copy's** id.
   Every write from this point forward (Steps 3–6) lands in the copy, never
   production — double-check this value before running anything that writes.

## 4. Test-copy write (Phase 3) + mapping review (Phase 2)

**Two more incidents from the real test-copy run (2026-09-16), both fixed:**
- **`GoogleJsonResponseException: ... User rate limit exceeded`** on
  `drive.files.copy` — this session's repeated audit/dry-run/write runs in
  quick succession tripped Google's transient per-user Drive quota.
  `convertLegacyXlsxToSheet_` now retries with exponential backoff (2s, 4s,
  8s, 16s) on this specific error, failing fast on anything else. If you
  still see this after the fix, wait a minute and try again — it's Google's
  quota window resetting, not a code issue.
- **`Exceeded maximum execution time`** — the fixed 150-order/run cap
  assumed a per-order write cost close to `DevSeed.gs`'s synthetic rows;
  real historical orders (line writes + status history + invoice linkage +
  `rememberCustomer_`/`rememberUoms_`) cost enough more that 150 orders in
  one run can exceed Apps Script's 6-minute ceiling. `legacyRunImportBatch_`
  now also checks a 270-second wall-clock time budget (same convention as
  `ExportJob.gs`) before starting each order and stops cleanly — saving the
  resume position and returning a real report — well before Apps Script
  would hard-kill the execution. **Runs will now very likely stop earlier
  than 150 orders, reporting "stopped at the 270s time-budget safety
  margin" — this is expected, not an error. Just run it again, as many
  times as it takes**; each run makes real progress and nothing is lost or
  duplicated (10 offline regression tests cover this).

1. Select `migrateImportLegacyOrders` in the Run dropdown, press Run.
   (Capped at 150 orders per run OR the 270s time budget, whichever comes
   first — re-run it again, unchanged, if the summary reports orders
   remaining; Phase 4's resume index picks up where the previous run left
   off automatically. Expect several runs to cover all ~206 orders.)
   - **If a run stops mid-batch (timeout, transient Sheets error, etc.):**
     no manual cleanup is needed before resuming. `legacyWriteOneOrder_`
     (code review 2026-09-16) writes OrderLines/StatusHistory before the
     Orders header row, so a crash mid-order leaves at most one order's
     worth of orphaned OrderLines/StatusHistory rows with no Orders header
     ever pointing at them — invisible in the app's UI (which reads by
     iterating Orders and joining lines) and harmless to leave in place.
     Just re-run `migrateImportLegacyOrders` again unchanged; the resume
     index re-attempts that exact order whole, it is never left
     half-written or silently duplicated.
2. Read the returned summary. It reports, among other counts:
   `Review flags carried over from mapping (Phase 2): N`.
   - **Correction vs. the phase doc's wording:** this count appears in the
     *write* run's report (`migrateImportLegacyOrders`), not in the Phase 1
     dry-run report — `dryRunImportLegacyOrders()` never calls the mapping
     layer (`mapLegacyOrderGroup_`) at all, only `parseLegacySheet_`. The
     write run against the test copy is the first point `reviewFlags` exist
     to review.
   - If `N > 0`, add a temporary `console.log(JSON.stringify(mapped.reviewFlags))`
     inside `legacyRunImportBatch_` (`apps/api/LegacyImportWrite.gs`) — or
     inspect via the Apps Script execution log — to see exactly which
     heuristic fired on which order (VAT-rate guess, deposit/supplier
     extraction, etc., see `LegacyImportMapCompose.gs`/`LegacyImportMapDeposit.gs`).
     Remove the temporary log line before the live run.
3. Also note the summary's "Orders skipped" section (no parseable date /
   unparseable line data) — these need a manual look at the source rows, not
   a blind re-run.

**Gate:** resolve every review flag / skip you don't understand before
proceeding — trace back to a Phase 2 mapping bug if the flag looks wrong,
don't just accept it.

## 5. Spot-check (10 random orders)

Open 10 orders written into the test-copy spreadsheet's `Orders`/`OrderLines`
sheets and compare each, by hand, against its source row(s) in the original
Excel file: customer, PO, line items, unit price × qty, VAT rate, invoice
number/date, order date. Pick orders spread across different months, not all
from one block.

## 6. Reconcile — test copy (Phase 5, this deliverable)

With `SPREADSHEET_ID` still pointing at the **test copy**:

1. Select `reconcileLegacyImport` in the Run dropdown, press Run.
2. Read the returned report: one line per month —
   `THÁNG n: OK — printed = X, actual imported = Y, diff = Z`
   or `THÁNG n: MISMATCH — ...`, plus a closing tally line.

**Gate — mandatory, non-negotiable:** all 8 months must report `OK` before
the live run is even attempted. A `MISMATCH` traced to a genuine bug (a
Phase 2 mapping rule, a missed row) must be fixed and Steps 3–6 re-run from
a fresh test copy. A `MISMATCH` traced to a genuine source-data ambiguity
(the business's own printed total looks internally inconsistent, not a bug
on our side) requires the project owner's **explicit, documented sign-off**
to proceed anyway — never silently round it away (see phase-05's Risk
Assessment). A `NO PRINTED TOTAL` result means `DOANH SỐ THÁNG n` wasn't
found for that month at all — treat this the same as a mismatch requiring
investigation, not a pass.

> **STOP HERE if any month has not reconciled cleanly.** Do not proceed past
> this point until every one of Steps 2–6 has passed without an unresolved
> discrepancy. This is the single most important gate in this runbook.

---

## 7. Fresh backup — immediately before the live write

Re-point `SPREADSHEET_ID` back to **production**. Run `backupNow` again
(same action as Step 1) so the backup taken immediately precedes the live
write — the Step 1 backup may be stale by the time you reach this point.
Confirm the new backup exists before continuing.

## 8. Live run — production (project owner present)

**With the project owner physically present, reviewing the output as it
happens:**

1. Confirm `SPREADSHEET_ID` is production, `LEGACY_IMPORT_FILE_ID` and
   `ADMIN_EMAIL` are still correct (Step 0).
2. Select `migrateImportLegacyOrders` in the Run dropdown, press Run.
3. Read the summary together with the project owner: orders written,
   per-month counts, any skipped orders, review-flag count.
4. If the run reports orders remaining (150-order cap), run it again,
   unchanged — the resume index continues automatically. Repeat until "No
   orders remaining" appears.

This is a single deliberate, observed event — not a script left to run
unattended (phase-05's non-functional requirement).

## 9. Post-run reconcile — production

Select `reconcileLegacyImport` in the Run dropdown, press Run (now against
production). Same gate as Step 6: all 8 months must reconcile within
tolerance before declaring the migration done. Do not ship a mismatched
revenue figure into production statistics — if something doesn't reconcile
here, treat it exactly as seriously as Step 6's gate.

## 10. Spot-check 5 real orders — through the actual web UI

Open 5 imported orders in the normal THIENTAN web app (not the raw Sheet) —
log in as a normal user would — and confirm each renders correctly:
customer, line items, VAT, status, invoice. This is the Success Criteria's
explicit UI-level check, distinct from Step 5's raw-sheet spot-check.

## 11. Docs sign-off (deferred — do not do this until Steps 1–10 are all real)

Once the live run (Step 8) has actually happened, update — with the real
completion date — every doc the phase spec lists:

- `docs/EXCEL_REFERENCE.md` — top banner: describe the one-time M7 import
  that occurred, with date; reaffirm the file is still not used for ongoing
  entry.
- `docs/OPEN_QUESTIONS.md` — the "Import the existing Excel? No" row: note
  pointing to M7 as the later, scoped exception.
- `README.md` — "Reference data" section's "It is never imported" line:
  qualify or point to the M7 note.
- `docs/MILESTONES.md` — add the "☐ Milestone 7" section (scope + exit
  criteria, same format as M5a/M6), all criteria checked off with the real
  live-run date.
- `docs/development-roadmap.md` — add M7 to the timeline/dependency tree and
  progress log, consistent with M5a/M6.
- `docs/DATA_MODEL.md` — note near `Orders`/`OrderLines` that the M7 import's
  rows carry the `createdBy` identity decided in Phase 3, so a reader isn't
  confused seeing ~206 orders attributed to one account/date range.

Then delegate to the `docs-manager` agent (per `primary-workflow.md` Step 4)
to verify doc sync is complete and cross-referenced correctly, and run
`/ck:journal` to record the migration event (per phase-05's Next Steps).

**These docs are deliberately NOT touched by the code-only work that
produced this runbook.** They require a real completion date that does not
exist until Step 8 has actually happened.

---

## Re-running from scratch against a corrected file

If the source `.xlsx` needs to be corrected and the whole import re-run from
the beginning (not just resumed):

1. Restore the spreadsheet from a pre-import backup (Step 1's or Step 7's),
   or manually delete every order/line/invoice/status-history row the prior
   run(s) wrote — the resume index has no memory of *which* rows it wrote,
   only *how many* parsed orders it resolved.
2. Select `resetLegacyImportResumePoint` in the Run dropdown, press Run. This
   only rewinds the resume pointer to 0 — it does **not** undo any already-
   written row (see `LegacyImportWriteResume.gs`'s doc comment). Only do this
   after Step 1 above, never as a blind retry.
3. Re-run from Step 2 (dry run) of this runbook — do not skip back into the
   middle of the sequence.

## Function reference

| Function | File | Guarded | Purpose |
|----------|------|---------|---------|
| `dryRunImportLegacyOrders()` | `LegacyImport.gs` | `guardSetup_` | Parse-only, no writes (Step 2) |
| `legacyAuditNgayHdFormats()` | `LegacyImportDateAudit.gs` | `guardSetup_` | Ngày HĐ format audit, no writes (Step 2a) |
| `migrateImportLegacyOrders()` | `LegacyImportWrite.gs` | `guardSetup_` | Bulk write, 150/run cap, resumable (Steps 4, 8) |
| `reconcileLegacyImport()` | `LegacyImportReconcile.gs` | `guardSetup_` | Per-month actual-vs-printed check (Steps 6, 9) |
| `resetLegacyImportResumePoint()` | `LegacyImportWriteResume.gs` | `guardSetup_` | Rewinds the resume index to 0 — does not undo writes |
| `backupNow` (action) / `backupNow_()` | `BackupJob.gs` | Admin UI action | Drive backup of the live spreadsheet (Steps 1, 7) |

All `guardSetup_`-guarded functions are run-by-hand only from the Apps
Script editor's Run dropdown — none are reachable over HTTP (never added to
`Router.gs`'s `getActions_()` registry).
