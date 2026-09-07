# Phase 7 — Documentation final sync

## Context links
- Stale schema: `docs/DATA_MODEL.md:41-64` (§2 `Orders`) vs actual `apps/api/Config.gs:90-94`
- Stale progress log: `docs/MILESTONES.md:222-226` (last entry 2026-09-02)
- Docs policy: `CLAUDE.md` → "Documentation Management", `.claude/rules/documentation-management.md`
- Audit finding B5 (valid): `plans/reports/audit-260907-1744-codebase-analysis.md:375`

## Overview
- **Priority:** P3 · **Status:** pending · **Effort:** 1.5h
- **Blocked by:** Phases 2 and 6 (both sign-offs must land so the log records real dates).
- Docs-only. Zero runtime risk, zero rollback concern.

## Key insights (verified)
- **`DATA_MODEL.md` §2 lists 18 Orders columns; the code has 23.** Documented: `orderId, po, poNote, customer, orderDate, status, statusNote, customerDeposit, supplierName, supplierPaid, totalExVat, totalIncVat, createdBy, createdAt, updatedBy, updatedAt, approvedBy, approvedAt`. Missing from the doc: **`lineCount`, `approveStatus`, `rejectReason`, `rejectedBy`, `rejectedAt`** — all present at `Config.gs:90-94`.
- `approvedBy`/`approvedAt` are still in `HEADERS` but **nothing writes them anymore** (`Config.gs:75-81`): M3.8 replaced that pair with the `approveStatus` state machine, and who/when now lives in `StatusHistory` with `field='approveStatus'`. The doc presents them as live. They must be marked deprecated-but-retained-for-column-alignment.
- `OrderLines` (13 cols) and `Users` (8 cols) **are** correct — `DATA_MODEL.md` §3/§1 match `Config.gs:97-99` / `:55`. Do not "fix" those.
- `MILESTONES.md` progress log's newest row is 2026-09-02 (`:226`) while `TASKS.md` records work through 2026-09-06 (M5.1 and M5.2). Four milestones' worth of entries are missing: all of M4 (4.1→4.7.3) and M5.1/5.2.
- The stale log at `:226` is what made the audit report M3's approval flow as un-live-tested — `CHECKLIST_M3_VI.md` is in fact 60/60 checked including §I. **Fixing the log is what stops this class of error recurring.**
- `docs/PERMISSIONS.md:92` shows `export_statistics` as granted to admin/accounting. Whatever Phase 1 decided must be reflected here too, or the same false "unenforced permission" finding regenerates on the next audit.
- The four migrations (`Migrations.gs:40,115,199,266`) are tracked in code but the doc does not list which have been run live. `CHECKLIST_M3_VI.md:14` implies `migrateAddApproveStatus()` was run.
- `docs/codebase-summary.md` **does not exist** despite `CLAUDE.md`'s documented docs structure. Create it — it is the artifact that would have prevented the audit's `Inventory.gs` false positive.

## Requirements
- FR1: `DATA_MODEL.md` §2 matches `Config.gs:90-94` exactly, in order.
- FR2: `MILESTONES.md` progress log covers M4 and M5; both milestone headers are `☑`.
- FR3: `PERMISSIONS.md` reflects the Phase 1 `export_statistics` decision.
- FR4: A `codebase-summary.md` exists mapping each module to its milestone and its **actual filename**.
- FR5: Test-count references anywhere in docs are corrected or removed (no more "693 assertions").
- NFR1: No fabricated dates. Use the real sign-off dates from Phases 2 and 6.

## Related code files
**Modify**
- `docs/DATA_MODEL.md` — §2 `Orders` table (add 5 rows, annotate 2 as deprecated)
- `docs/MILESTONES.md` — `:152` and `:172` headers, `:161-169` and `:180-185` criteria, `:222+` progress log
- `docs/PERMISSIONS.md` — `:25`, `:65`, `:92` `export_statistics` rows
- `docs/OPEN_QUESTIONS.md:105` — Q5 🟡 → ✅ with the Phase 5 decision
- `docs/TASKS.md` — M4/M5 table statuses (targeted edits only; the file is 207KB)

**Create**
- `docs/codebase-summary.md`

**Do not modify:** anything under `apps/`. This phase is docs-only.

## Implementation steps
1. `DATA_MODEL.md` §2: append the 5 missing columns **in code order** (`lineCount` after `totalIncVat`; `approveStatus`, `rejectReason`, `rejectedBy`, `rejectedAt` after `approvedAt`), with notes sourced from the comments already at `Config.gs:69-89`:
   - `lineCount` | number | M2.5/P5 — maintained on every save so `listOrders` need not read `OrderLines`
   - `approveStatus` | enum | M3.8 — Draft / Wait For Approved / Approved / Rejected; gates editing
   - `rejectReason` | string | revision 2026-09-03d — written by `actionRejectOrder_`, surfaced only while `approveStatus === 'rejected'`; left stale afterwards by design
   - `rejectedBy` | string | email
   - `rejectedAt` | datetime |
2. Annotate `approvedBy` / `approvedAt` as **deprecated, retained for column alignment; nothing writes them since M3.8** (`Config.gs:75-81`).
3. Add a "Migrations run live" subsection to `DATA_MODEL.md` listing the four functions (`Migrations.gs:40,115,199,266`) with run status, so the next reader does not have to infer it from a checklist footnote.
4. `MILESTONES.md`: flip `:152` and `:172` to `☑` with the real dates; tick the criteria; append progress-log rows for M4 (4.1→4.7.3, one consolidated row) and M5 (5.1→5.4, one consolidated row), each naming the actual files and the assertion counts.
5. `PERMISSIONS.md`: update the `export_statistics` row per Phase 1's decision. Under option 1b, state plainly: *reserved; no call site by design; order export is gated on `export`* — with the `TASKS.md:2191-2193` citation.
6. `OPEN_QUESTIONS.md:105`: flip Q5 to ✅ with the decision and its date.
7. Create `docs/codebase-summary.md`: a module table (file → LOC → milestone → purpose) for all 17 API and 11 web modules, plus the test-suite table with real assertion counts, plus an explicit note: **the M5 inventory backend is `Products.gs`, not `Inventory.gs`.**
8. Grep docs for stale counts (`693`, `366`, `404`, `345`) and correct or delete them. Better: state the count in one place (`codebase-summary.md`) and have the others point at it (DRY).
9. Re-run all suites to capture the final number for the summary.

## Todo
- [ ] `DATA_MODEL.md` §2 has all 23 columns in code order
- [ ] `approvedBy`/`approvedAt` marked deprecated
- [ ] Migrations-run-live subsection added
- [ ] `MILESTONES.md` M4 + M5 headers ☑, criteria ticked, real dates
- [ ] Progress-log rows for M4 and M5
- [ ] `PERMISSIONS.md` `export_statistics` matches Phase 1's decision
- [ ] Q5 flipped to ✅
- [ ] `docs/codebase-summary.md` created, states `Products.gs` ≠ `Inventory.gs`
- [ ] Stale assertion counts corrected; single source of truth
- [ ] Final suite run recorded

## Success criteria
- A column-by-column diff of `DATA_MODEL.md` §2 against `Config.gs:90-94` shows zero differences.
- `grep -rn "Inventory.gs" docs/` returns nothing.
- `grep -rn "693" docs/` returns nothing.
- `MILESTONES.md` shows Milestones 0–5 all `☑`; only Milestone 6 open.
- A fresh reader can derive the correct module→milestone map from `codebase-summary.md` alone without grepping — this is the check that this whole audit-correction exercise does not need repeating.

## Risk assessment
| Risk | L×I | Mitigation |
|---|---|---|
| Docs updated from this plan rather than from the code → new drift | Med × **High** | Every step cites a `file:line`; re-read `Config.gs:90-94` at write time, do not copy from here |
| Fabricated sign-off dates | Med × Med | Dates come from the completed Phases 2 and 6 only; this phase is blocked until then |
| Blunt edit corrupts the 207KB `TASKS.md` | Med × Med | Targeted `Edit` on the two table rows; never rewrite the file |
| `codebase-summary.md` becomes another stale doc | **High** × Med | Keep it a thin table plus the naming caveat; no prose that duplicates `system-architecture.md` |
| "Fixing" `OrderLines`/`Users` schema docs that are already correct | Low × Med | Explicitly out of scope — §1 and §3 verified matching |

## Security considerations
- `PERMISSIONS.md` is the reference an auditor checks the code against. A wrong entry there manufactures phantom findings (that is precisely how audit B1 arose) or masks real ones. Getting `export_statistics` right here is the security-relevant part of this phase.
- Do not document secret rotation specifics beyond what `SECURITY.md` already covers.

## Next steps
- Milestones 0–5 closed. Only **Milestone 6** (backup, responsive pass, Vietnamese sweep, user guide — `MILESTONES.md:204-220`) remains.
- Recommend a fresh `/ck:plan` for M6, and re-running the audit against the corrected docs to confirm the false-positive class is gone.
