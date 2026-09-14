# Journal: Milestone 7 Planning — Legacy Excel Order Import

**Date:** 2026-09-14  
**Status:** PLANNING COMPLETE  
**Plan Location:** `plans/260914-1115-milestone-7-legacy-excel-import/plan.md`  
**Plan ID:** ck:plan (policy reversal, live go-live stage)

---

## Summary

Completed planning for Milestone 7 (M7 exit criterion: one-time bulk import of legacy Orders/OrderLines/Invoices from `FILE THEO DOI DON HANG.xlsx` into live production Sheets before go-live, so employees start with ~206 orders + ~534 lines of real historical data). **Reverses documented "never import" policy** (OPEN_QUESTIONS.md 2026-08-15 + README.md) explicitly via user AskUserQuestion (3 questions, all user-selected recommended option). Codebase pass found reusable Order/Line/Invoice primitives, Migrations.gs precedent for bulk idempotency, zero xlsx-ingestion code (builds from scratch). Blocked on two pending plans (M5a schema, M6 backup-before-write safety). 5 phases ready for `/ck:cook`.

---

## Policy Reversal Decision: Explicit, Scoped, One-Time Exception

**Prior recorded stance (2026-08-15):**
- `docs/OPEN_QUESTIONS.md`: "Import the existing Excel? **No.** Reference only; users enter live data."
- `README.md`: "Import never. Reference only."
- `docs/EXCEL_REFERENCE.md`: "Never imported."

**New stance (2026-09-14):**
Import historical data **once, at go-live only**, as a one-time exception to bootstrap employee context. App remains manual-entry-only thereafter.

**Rationale:** User decision (all three clarification questions answered with recommended option). Explicit framing: this is a deliberate go-live event accommodation, not a shift to ongoing import UI. Docs will be updated in Phase 5 to describe this honestly (not silently contradict earlier policy).

---

## Three Clarifying Questions: User Answers

Before planning, surfaced three design choices explicitly (not assumed):

| Question | User Choice | Rationale |
|----------|-------------|-----------|
| **Mechanism** | One-time admin-triggered migration script (like `migrateAddLineCount()` in apps/api/Migrations.gs) | No reusable import UI; go-live event only. Matches existing pattern. |
| **Data scope** | Orders + OrderLines + Invoices only (NOT seeding Config.customerList/uomList/Products) | Customer/UoM/Product lists self-populate via live data entry. No separate seeding needed. |
| **Source format** | Raw .xlsx parsed as-is (month blocks, multi-line PO/status cells, per-line VAT detection) | No manual pre-cleaning stage. Accept the file structure exactly as it exists. |

---

## Codebase Pass Results: Reusable Primitives Found

**Explore-agent pass over `apps/api`:**

**Reusable Order/Line/Invoice internals (Orders.gs):**
- `nextOrderId_()`: ID generation
- `buildLineRecord_()`: Line object assembly
- `sumLines_()`: Aggregation
- `ensureInvoice_()`: Invoice upsert

**Migrations.gs precedent:**
- Naming convention: `migrate*()` + `Migrations.gs` module
- Idempotency pattern: Script Properties tracking (position, state, run count)
- Row-by-row append via `appendRecord_()` (no batch `setValues` exists in SheetsRepo.gs)

**DevSeed.gs precedent:**
- Bulk row creation pattern (sequential append, not batch)

**No xlsx-ingestion code found anywhere:**
- Advanced Drive Service `Drive.Files.copy` xlsx→Sheets conversion not yet in repo (build from scratch)
- Good news: Apps Script manifest already has `drive` OAuth scope (no permission boundary)

---

## Cross-Plan Blockers: Resolved with Bidirectional Links

**Blocking M5a (Order Status to Line Level):**
- **Reason:** Source file's status column maps per-line. Only clean after M5a moves status from Orders to OrderLines.
- **Action:** Both `plan.md` files updated: M5a frontmatter now includes `blocks: ["260914-1115-milestone-7-legacy-excel-import"]`; M7 includes `blockedBy: ["260914-0907-milestone-5a-order-status-to-line-level"]`.

**Blocking M6 (Hardening & Polish):**
- **Reason:** Must take fresh backup immediately before writing ~206 orders/~534 lines into production. M6's `backupNow()` + Drive export must exist first.
- **Action:** Both `plan.md` files updated: M6 frontmatter now includes `blocks: ["260914-1115-milestone-7-legacy-excel-import"]`; M7 includes `blockedBy: ["260913-2326-milestone-6-hardening-and-polish"]`.

---

## Final State: 5 Active Phases

1. **Phase 1:** Ingestion & Dry-Run Parsing — xlsx→Sheet conversion via Drive API, month-block/order-group parsing (read-only)
2. **Phase 2:** Field Mapping & Extraction Rules — PO/VAT/status/deposit/UoM parsing + offline tests vs. EXCEL_REFERENCE.md examples
3. **Phase 3:** Bulk Write Path — reuse Orders.gs internals, test-copy run required pre-production
4. **Phase 4:** Idempotency & Resumability — Script Properties tracking for resume across 6-min execution limits
5. **Phase 5:** Reconciliation, Live Run & Docs Sync — month totals vs. file's DOANH SỐ THÁNG, real production run, docs update (EXCEL_REFERENCE.md/OPEN_QUESTIONS.md/README.md/MILESTONES.md/development-roadmap.md/DATA_MODEL.md)

**Also updated:**
- `docs/MILESTONES.md`: Added "☐ Milestone 7 — Legacy Excel Order Import" section (scope + exit criteria, M5a/M5b format)
- `docs/development-roadmap.md`: Added matching M7 section

**Ready for:** `/ck:cook` (sequential execution, phases depend on prior completion).

---

## Key Decisions & Tradeoffs

| Decision | Alternatives | Why This One |
|----------|--------------|--------------|
| One-time script (not reusable UI) | Build import feature for ongoing uploads | Go-live bootstrap only; no long-term import maintenance burden. Aligns user intent. |
| Raw .xlsx format (not pre-cleaned staging) | Manual staging sheet | Accepts file as-is; reduces prep work. Phase 2 handles complex month blocks & status detection. |
| Orders/Lines/Invoices only (not Config seed) | Seed customer/UoM/Product lists too | Customer/UoM lists already populate live. Simpler scope, fewer potential conflicts. |
| Reuse Orders.gs internals (row-by-row append) | Batch `setValues` approach | Batch API doesn't exist in repo; row-by-row matches existing patterns (DevSeed.gs precedent). |
| Fresh backup before production write (M6 blocker) | Import without backup | ~740 rows of irreversible data. Fresh snapshot mandatory for disaster recovery. |
| M5a blocker on status schema | Proceed with current Orders.status | Status is per-line in source file. Only maps correctly post-M5a schema move. |

---

## Lessons Captured

1. **Policy reversals need explicit framing, not silent contradiction:** Documenting "never import" twice and then reversing silently erodes trust. User-answered questions + honest docs update required.
2. **Three clarifying questions prevented bad assumptions:** Mechanism (script vs. UI), data scope (Orders only vs. seed everything), and format (raw vs. pre-cleaned) could each go wrong if assumed. Asking upfront cost 5 minutes; rework would cost hours.
3. **Codebase pass finds real reuse patterns:** `nextOrderId_()`, `buildLineRecord_()`, `ensureInvoice_()` are production-tested. Building on them reduces implementation surface area.
4. **Idempotency via Script Properties is proven pattern:** Migrations.gs already uses position tracking; M7 Phase 4 reuses exact same approach for resumability across 6-min timeout boundary.
5. **Cross-plan blocking relationships must be bidirectional:** M5a and M6 both block M7. Updating both plans' `plan.md` frontmatter ensures discovery, prevents "we forgot we were blocking this" surprises.
6. **xlsx-ingestion from scratch is non-trivial:** Drive API xlsx→Sheets conversion not in repo. Phase 1 needs concrete implementation (not "use some library"), and it's new surface area.

---

## Unresolved Questions

1. **Identity for `createdBy` on imported orders:** Should ~206 historical orders stamp `createdBy` as a system marker (e.g., "SYSTEM_IMPORT", "LEGACY") or as the admin's email? Not decided during planning. Flagged for Phase 5 (final run discussion).

2. **Free-text one-offs in status column:** ~20 entries in source file's status column are unrelated cash notes (e.g., "mua đt iphone"). Should these import as harmless free text (appended to OrderLine.statusNote) or be filtered/dropped? Not decided during planning. Flagged for Phase 2 (field-mapping validation).

---

**Status: PLANNING COMPLETE** ✅  
Ready for `/ck:cook` (pending M5a + M6 completion as prerequisites).
