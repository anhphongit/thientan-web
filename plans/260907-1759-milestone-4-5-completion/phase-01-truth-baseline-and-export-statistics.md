# Phase 1 — Truth baseline + `export_statistics` resolution

## Context links
- Source audit (contains 3 false positives): `plans/reports/audit-260907-1744-codebase-analysis.md`
- Correction table: `plan.md` → "Audit Correction"
- Deferral record: `docs/TASKS.md:2191-2193`
- Permission spec: `docs/PERMISSIONS.md:25,65,92`

## Overview
- **Priority:** P1 · **Status:** ✅ COMPLETE · **Effort:** 2h (actual: ~1h)
- **Blocked by:** nothing. **Blocks:** Phase 2 (needs the decision ✓), Phase 3 (needs the regression assertion ✓).
- Two jobs: (a) stop the wrong audit findings from being acted on, (b) close the one genuine ambiguity — what `export_statistics` is for.

## Key insights (verified)
- `export_statistics` appears in exactly 2 places in code: `apps/api/Config.gs:176` (in `PERMISSION_KEYS`) and `Config.gs:248,259,270` (preset values). **Zero call sites.**
- Order export gates on `'export'` and that is correct: `Export.gs:84` (`actionExportOrdersCsv_`), `Export.gs:110` (`actionExportOrdersXlsx_`), `Export.gs:125` (`actionExportOrdersPdf_`), `ExportJob.gs:149` (`actionStartExportJob_`).
- `Config.gs:247-248` — `sales` preset is `export: true, export_statistics: false`. Adding `requirePermission_(user,'export_statistics')` to those four handlers **removes order export from sales staff**. This is the audit's recommended fix. Do not apply it.
- `docs/MILESTONES.md:169` exit criterion "`view_statistics` / `export_statistics` are enforced" is currently **unsatisfiable** — there is no stats-export surface to enforce it on. `view_statistics` half *is* enforced: `Stats.gs:92,277,296`.
- `apps/web/ui/ViewsStats.html` has no export button (grep for export/Xuất/Tải returns only prose and the "chưa xuất hoá đơn" toggle label at :418).

## Requirements
- FR1: The repo must state the corrected status so no later agent or human re-derives the phantom blockers.
- FR2: `export_statistics` must end this phase with a decided, documented meaning.
- NFR1: No behavioural change to order export for any preset.

## Data flow (decision 1a only)
```
ViewsStats.html [Xuất CSV button]
  → Main.gs apiExportStatsCsv(payload)
  → ApiClient.gs apiCall_('exportStatsCsv', payload)
  → Router.gs registry: exportStatsCsv → actionExportStatsCsv_
  → Stats.gs actionExportStatsCsv_:
       requirePermission_(user,'view_statistics')     // must be able to see it
       requirePermission_(user,'export_statistics')   // ...and to export it
       reuse statsRevenue_/statsByField_ aggregation  (no new aggregation logic)
       → CSV string with UTF-8 BOM (mirror Export.gs:92 '﻿' + csv)
  → client Blob download (mirror Main.gs:198 apiExportOrdersCsv)
```

## Decision gate — pick ONE, then proceed

**Option 1a — Build stats CSV export (+2–3h, lands in Phase 3's deploy)**
Adds one action reusing existing aggregation. Satisfies `MILESTONES.md:169` literally.
Choose if Phong wants to hand the stats table to accounting as a file.

**Option 1b — Reserve the permission, amend the criterion (0h code) ✅ default**
`export_statistics` stays a declared-but-unused key (already the documented
intent, `TASKS.md:2192`). Amend `MILESTONES.md:169` to "`view_statistics` is
enforced; `export_statistics` is reserved for a future stats-export surface
(TASKS.md 2191-2193) and has no call site by design." Add the regression test.
Choose by default — YAGNI: nobody has asked for a stats file.

**Do NOT choose:** the audit's fix. It is a regression, not a fix.

## Related code files
- Modify: `docs/MILESTONES.md` (line 169 criterion; line 176 `Inventory.gs`→`Products.gs`; line 157 Chart.js→CSS note)
- Modify: `plans/reports/audit-260907-1744-codebase-analysis.md` (append correction header)
- Modify: `docs/TASKS.md` (M4 table note that live verification is the only open M4 item)
- Create: `tools/offline-tests/export-permissions.test.js` (or extend `export.test.js`)
- Create only under option 1a: additions to `Stats.gs`, `Router.gs`, `Main.gs`, `ViewsStats.html`
- **Do not touch:** `apps/api/Export.gs` (no change is correct here)

## Implementation steps
1. Prepend a `> **CORRECTED 2026-09-07**` block to the audit report listing the 3 false positives (B1 mis-framed, B2/B3 invalid) and pointing at `plan.md`. Do not delete the original text — keep the record.
2. `docs/MILESTONES.md:176`: change `` `Inventory.gs` + `ui/ViewsInventory.html` `` to `` `Products.gs` + `ui/ViewsInventory.html` ``. This single line caused the B2 false positive.
3. `docs/MILESTONES.md:157`: change `` `ui/ViewsStats.html`: Chart.js charts `` to note CSS-based rendering was chosen instead (see `TASKS.md` 4.7.x).
4. Get the Option 1a/1b decision from Phong. Record it inline in `MILESTONES.md` next to the amended criterion.
5. Add regression assertions to the export test suite:
   - `sales` preset (`export:true, export_statistics:false`) **can** call `actionExportOrdersCsv_`/`Xlsx_`/`Pdf_`/`actionStartExportJob_`.
   - `warehouse` preset (`export:false`) **cannot** — expect the permission error.
   - Assert `export_statistics` has zero effect on order export (guards against a future well-meaning "fix").
6. If Option 1a: implement per the data flow above — reuse `statsRevenue_` (`Stats.gs:106`) and `statsByField_` (`Stats.gs:323`); add the `'﻿'` BOM as `Export.gs:92` does; bump `BUILD` (`Config.gs:18`).
7. Re-run all 17 suites; assertion count must be ≥ 943.

## Todo
- [x] Audit report correction block appended
- [x] `MILESTONES.md:176` file name fixed (`Inventory.gs` → `Products.gs`)
- [x] `MILESTONES.md:157` Chart.js note corrected (CSS-based instead)
- [x] `export_statistics` decision made and recorded (**Option 1b: reserve permission, amend criterion**)
- [x] Export permission regression assertions added and passing
- [x] Full suite green: **946 assertions / 17 suites / 0 failures** (target ≥943 ✓)

## Success criteria
- Grep for `Inventory.gs` across `docs/` returns zero hits.
- The audit report cannot be read without seeing the correction.
- A test fails if anyone adds `export_statistics` to an order-export handler.
- `docs/MILESTONES.md:169` describes something that is actually true of the code.

## Risk assessment
| Risk | L×I | Mitigation |
|---|---|---|
| Audit's fix applied by another agent before this phase lands | **High** × High | Do this phase first, before any code phase; the regression test is the durable guard |
| Option 1a scope-creeps into charts-to-PDF | Med × Med | Scope is CSV of the already-computed table only; no new aggregation, no new format |
| Editing `TASKS.md` (207KB) with a blunt tool | Med × Low | Targeted `Edit` on the M4 table rows only; never rewrite the file |

## Security considerations
- No new permission keys. No preset changes. `PERMISSION_KEYS` (`Config.gs:174-177`) is unchanged — removing `export_statistics` from it would silently drop the key from every stored user `permissions` JSON on next write, so **leave it in place** even under option 1b.
- Option 1a must check `view_statistics` **and** `export_statistics` — a user who cannot see stats must not be able to export them.

## Next steps
→ Phase 2 (M4 verification) and Phase 3 (matrix editor) both unblock. Under Option A, go to Phase 2.
