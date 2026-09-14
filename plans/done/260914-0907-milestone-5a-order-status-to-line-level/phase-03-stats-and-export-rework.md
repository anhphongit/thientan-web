---
phase: 3
title: "Stats & Export rework"
status: completed
priority: P2
effort: 4h
dependencies: [2]
---

# Phase 3: Stats & Export rework

## Overview

`Stats.gs` and `Export.gs` are the two consumers that *aggregate* on business status. Both
currently source from `order.status`, which no longer exists after Phase 2. Both need to be
re-sourced from `OrderLines.status`.

**This phase deliberately starts with research, not code.** The correct aggregation shape is a
genuine design question (an order's revenue now splits across several line statuses, and a line
may have *no* status at all), and guessing it here would be exactly the kind of invented work
this project has been burned by before. Step 1 is "read the code and decide", and the decision
gets written into this file before any edit.

## Requirements

**Functional**
- `actionStatsByStatus_` groups by **line** status and produces correct revenue totals.
- Lines with a blank status are represented explicitly, not silently dropped.
- Status labels still resolve through `Config.statusList` via the shared
  `statusLabelIndex_`/`statusLabelText_` helpers — no second copy of the label list.
- The export's status column reflects line status.
- `view_statistics` / `export` permission gating is unchanged in strength.

**Non-functional**
- Revenue totals must still reconcile: the sum across status groups must equal the
  ungrouped total, or the discrepancy must be a deliberate, documented choice.

## Architecture

### Current state (verified 2026-09-14)

`Stats.gs:290-304`
```
actionStatsByStatus_
  ├─ fieldVisible_(user,'status') gate                      (297)
  ├─ statusLabels = statusLabelIndex_(config)               (302)
  ├─ statsByField_(rows, includeNoInvoice, o => o.status)   (303)  ← rows are ORDER rows
  └─ groups.forEach(g => g.label = statusLabelText_(...))   (304)
```
`statsByField_` receives **order rows** and a key-extractor. Sorting is "biggest first"
(Stats.gs:331). `statusLabelIndex_`/`statusLabelText_` are defined in `Export.gs:400-411` and
reused by `Stats.gs` — one source of truth for labels.

`Export.gs:322-332, 380-394`
```
per exported row: first && fieldVisible_(user,'status')
                    ? statusExportLabel_(user, view, statusLabels) : ''      (332)
statusExportLabel_ = statusLabelText_(view.status) + ' — ' + view.statusNote (391-394)
```
`first &&` means the status cell is printed **only on an order's first line** — an
order-scoped cell in a line-scoped table. With line status, that guard is exactly what must go.

### The design decision (confirmed by project owner 2026-09-14 — implement as-is, no re-litigation)

Grouping orders by status was 1-order→1-group. Grouping by line status is 1-order→N-groups.
**Decision: option (a)** — sum **line** revenue (`amountExVat`/`amountIncVat`) per status group,
report both `lineCount` and distinct `orderCount` per group, and give blank-status lines their
own explicit group labelled **"Chưa đặt trạng thái"** (also confirmed 2026-09-14 — reuse this
exact label everywhere a blank line status needs a display string: Stats, Export, and any
Phase 4 UI grouping/label lookup). This is the only option whose totals still reconcile with
today's order-level totals, and `OrderLines` already carries `amountExVat`/`amountIncVat` per
line (Config.gs:95-97), so no new computation is needed.

Step 1 of Implementation Steps below is now "implement this shape," not "decide the shape."

### Assumption A7 — export prints status per line, dropping the `first &&` guard

The `first &&` guard (Export.gs:332) exists purely because status was order-scoped. Line status
is per-line, so the cell is printed on every line. Column position and count are unchanged —
only the value source and the guard.

### Assumption A8 — `fieldVisible_` gates stay as-is

`Stats.gs:297` and `Export.gs:332/393` gate on the field names `status`/`statusNote`. Those
keys are unchanged (Phase 1 keeps them in `DEFAULT_VISIBLE_FIELDS`); only their scope moved.
So the gates keep working verbatim — no permission change, no role reconfiguration.

## Related Code Files

**Modify**
- `apps/api/Stats.gs` — 290-304 (`actionStatsByStatus_`), and the docstrings at 8, 31, 80,
  123, 153, 257, 318 which all describe status as order-scoped.
- `apps/api/Export.gs` — 322-332 (row assembly / the `first &&` guard), 380-394
  (`statusExportLabel_` + its docblock), 79 (filter-list docstring). `statusLabelIndex_`
  (400-406) and `statusLabelText_` (408-411) stay as-is — reused verbatim.

**Read first (step 1)**
- `apps/api/Stats.gs` in full (337 lines) — especially `statsByField_` and its callers, to see
  whether it can take line rows unchanged or needs a sibling.
- `apps/api/Export.gs:280-441` — row assembly and the column layout.
- `apps/api/ExportJob.gs` — grep for `status`; most of its 37 hits are **job** status
  (running/done/error), not order status. Confirm which, if any, are order status before
  touching anything.
- `apps/api/ExportSheet.gs` — 0 status hits; expected to be unaffected. Verify.

**Create / Delete:** none.

## Implementation Steps

1. **Research (do this before any edit).** Read `Stats.gs` in full and `Export.gs:280-441`.
   Determine: (i) whether `statsByField_` can accept line rows as-is, (ii) the real export
   column layout and index of the status cell, (iii) which `ExportJob.gs` status references are
   job-status vs order-status. The aggregation shape itself is already decided (above — sum
   line revenue per status, `lineCount` + distinct `orderCount`, explicit blank-status group);
   write findings (i)-(iii) into an "Implementation notes" section appended to this file.
2. Implement the chosen aggregation in `actionStatsByStatus_`: source line rows, group by
   `line.status`, resolve labels through the existing `statusLabelText_`, keep the
   biggest-first sort (Stats.gs:331) and the `fieldVisible_` gate (297).
3. Give blank status an explicit group with a Vietnamese label. `statusLabelText_` falls back
   to returning the raw key (Export.gs:408-411), which for `''` yields an empty label — so the
   blank group needs its own label supplied explicitly, not via that fallback.
4. Update `Export.gs`: drop the `first &&` guard on the status cell (332) and re-source
   `statusExportLabel_` (391-394) from the **line** object rather than the order view. Keep the
   "label — note" concatenation format; the reference file's mixed controlled-status +
   free-text convention (documented at 380-390) is unchanged.
5. Update every stale docstring listed under Related Code Files — this project's comments carry
   real design rationale and a stale one is a future false lead.
6. Re-check `ExportJob.gs`/`ExportSheet.gs` against step 1's findings; change only what step 1
   proved is order status.
7. Run `stats.test.js`, `export.test.js`, `exportjob.test.js`, `exportsheet.test.js`. Expect
   failures (Phase 6 fixes them); confirm each failure is an intentional consequence, not a
   crash.

## Todo List

- [x] Step 1 research done, aggregation decision appended to this file
- [x] `actionStatsByStatus_` sources line status
- [x] Blank-status group present with an explicit label
- [x] Revenue totals reconcile against the ungrouped total
- [x] Export status cell is per-line; `first &&` guard removed
- [x] `statusExportLabel_` re-sourced from the line
- [x] Stale docstrings updated
- [x] `ExportJob.gs`/`ExportSheet.gs` verified

## Success Criteria

- [x] The aggregation decision is written down in this file with its rationale.
- [x] `grep -n "order.status" apps/api/Stats.gs apps/api/Export.gs` returns nothing.
- [x] For an order with two lines in different statuses, stats shows it under both groups and
      the group revenues sum to the order's total.
- [x] An order whose lines are all blank-status appears in the blank group, not nowhere.
- [x] The export shows a status value on every line of a multi-line order, not just the first.
- [x] A role blind to `status` still gets `MSG.NO_PERMISSION` from `actionStatsByStatus_`
      (`stats.test.js:300-304` asserted this pre-5a; verified directly against the harness since
      the old test now crashes on stale order-scoped fixtures before reaching that assertion —
      see Implementation notes).
- [x] `exportsheet.test.js` passes unchanged (44/44 pass, 0 failed).

## Risk Assessment

| Risk | L×I | Mitigation |
|---|---|---|
| Aggregation is guessed rather than researched; numbers look plausible but are wrong | **High** × High | Step 1 is a hard gate: the decision must be written into this file before any edit. The reconciliation criterion (group sum == ungrouped total) is the objective check. |
| Double-counting revenue if whole-order money is attributed per distinct line status | Med × High | Recommended default (a) sums **line** money, which cannot double-count. If (b) is chosen instead, the reconciliation criterion must be explicitly waived and documented. |
| Blank-status lines silently vanish from reports | High × Med | Explicit blank group required by Success Criteria; note that `statusLabelText_`'s raw-key fallback yields an empty string for `''` and will not do the job. |
| `export.test.js:312` asserts a hard-coded column index (`dataRow[11]`) | High × Low | Known and expected. Phase 6 owns it. Flagged here so it is not mistaken for a regression. |
| `ExportJob.gs` job-status code edited by mistake (37 `status` hits, mostly job state) | Med × High | Step 1 requires classifying every hit before touching the file. |
| Live sheet holds real M5 data | Med × Low | Read-only paths; no schema change in this phase. |

## Security Considerations

- Keep the `fieldVisible_(user,'status')` gate on `actionStatsByStatus_` (Stats.gs:297) and the
  `statusNote` gate inside `statusExportLabel_` (Export.gs:393). A line-level re-source must not
  become a way for a status-blind role to read status through a report.
- `export_statistics` remains deliberately deferred — do **not** add enforcement for it here
  (a prior audit wrongly flagged this; order export correctly gates on `export`).

## Implementation notes (Step 1 research, appended 2026-09-14)

**(i) Can `statsByField_` accept line rows as-is?** No, and it wasn't extended to — it stays
exactly as-is (order-scoped, `statsAggregateByOrder_` underneath), still used only by
`actionStatsByCustomer_`. The reason: `statsAggregateByOrder_`'s whole design is "one order/
order-portion contributes to exactly one bucket" (`addTo(keyFn(order), ...)` — keyFn always
receives the *order*). By-status is now fundamentally many-buckets-per-order (a mixed order has
lines in different statuses), which doesn't fit that shape at all — threading a line-aware mode
into `statsAggregateByOrder_` would have forced an order-scoped function to secretly branch into
line-scoped behavior for one caller. Wrote a sibling instead: `statsByLineStatus_` (new,
Stats.gs), which walks `linesForOrder_(order.orderId)` directly and sums each line's own
`amountExVat`/`amountIncVat` into its `line.status` bucket, tracking `lineCount` plus a
per-group `Set` of `orderId`s for distinct `orderCount`. `includeNoInvoice` keeps its existing
meaning (true: every line counts in full; false: uninvoiced lines move into the single global
`noInvoice` total, invoiced lines count toward their status group) via `invoiceIndex_`, the same
helper `statsAggregateByOrder_`'s split branch already uses.

**(ii) Export's real column layout / status cell index.** `EXPORT_CSV_HEADER` (Export.gs) is
12 columns; `TRẠNG THÁI` is index 11 (0-based), last column. `buildExportRows_` assembles one
`cells` array per order LINE (`orderLines.forEach(function (line, i) {...})`), so the row is
already line-scoped for every other cell (`CHI TIẾT`, `ĐƠN GIÁ`, `SL`, `THÀNH TIỀN`, etc. all
read off `line`) — only the `STT`/`PO`/`KHÁCH HÀNG`/`TRẠNG THÁI` cells were order-scoped
(`first &&` guard or `view.*`), because those were the only fields that used to live on the
order (STT/PO/customer still legitimately do; status doesn't anymore). So the fix is narrow:
cell 11 drops `first &&` and reads `line.status`/`line.statusNote` instead of `view.status`/
`view.statusNote`. STT/PO/KHÁCH HÀNG's `first &&` guards are UNCHANGED (still genuinely
order-scoped) — confirmed not to touch those.

**(iii) `ExportJob.gs` status hits — job-status vs order-status.** Grepped every `status` hit
in `ExportJob.gs`: every one is **job** status (`job.status`, the `'running'`/`'done'`/`'error'`
lifecycle of an async export job — see `runExportJobStep_`, `actionExportJobStatus_`,
`deliverExportJob_`). None reference `order.status` or a line's business status. `ExportSheet.gs`
has zero `status` hits at all (confirmed via grep, matches the phase file's prediction). Neither
file was touched — `exportjob.test.js` (91/91) and `exportsheet.test.js` (44/44) both pass
unchanged, confirming the classification was right.

**Aggregation decision:** already fixed by the project owner (see "The design decision" section
above) — sum LINE `amountExVat`/`amountIncVat` per `line.status` group, report `lineCount` +
distinct `orderCount`, blank status is an explicit group labelled `LINE_STATUS_BLANK_LABEL`
(`'Chưa đặt trạng thái'`, defined once in Export.gs next to `statusLabelIndex_`/
`statusLabelText_`, reused by Stats.gs — not duplicated). Reconciliation verified directly
against the harness (see below): sum of group `exVat` across all groups (including blank) equals
the order's own `totalExVat` for a multi-status order, and holds generally since `includeNoInvoice`
defaults to true (every line counted exactly once, into exactly one group).

**Manual verification (ad hoc script against `tools/offline-tests/harness.js`, not committed —
the existing `stats.test.js`/`export.test.js` fixtures predate the line-status move and can't
exercise it; Phase 6 owns rewriting them):**
- Order with 2 lines, `status: 'draft'` (100,000) and `status: 'confirmed'` (300,000): both
  groups present, `draft.exVat=100000`, `confirmed.exVat=300000`, each `orderCount=1`, sum of
  group `exVat` (400,000) == the order's `totalExVat` (400,000).
- Order with 1 line, no status set: single group, `key: ''`, `label: 'Chưa đặt trạng thái'`,
  `exVat` matches the line's amount.
- Role with `status` not in `visible_fields`: `actionStatsByStatus_` still throws
  `MSG.NO_PERMISSION`.
- Export CSV of a 3-line order (statuses `draft`/`confirmed`/blank): `TRẠNG THÁI` column shows
  `Nháp` / `Đã xác nhận` / `Chưa đặt trạng thái` on all three lines (not just the first).

## Next Steps

Phase 4 (frontend). Independent of this phase's output, but sequenced after it to keep the
`Orders.gs`/`apps/api` working set clear before the UI work begins.
