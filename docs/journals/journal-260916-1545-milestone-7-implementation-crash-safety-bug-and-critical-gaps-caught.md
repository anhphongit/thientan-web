# Milestone 7 Implementation: Crash-Safety Bug and Critical Gaps Caught in Code Review

**Date:** 2026-09-16 15:45
**Severity:** Critical (bug caught pre-ship)
**Component:** Legacy Excel Import (Phases 1–5 implementation, all 10 new `apps/api/LegacyImport*.gs` files)
**Status:** Code complete, offline tests passing (162 assertions), requires live production run with user present

---

## What Happened

Completed implementation of Milestone 7 Phases 1–5 across 6 sequential subagent sessions (one per phase, then code-reviewer, then bug-fix). Code-reviewer pass caught **1 CRITICAL crash-safety bug** and **3 high-priority scope gaps** that would have shipped silently broken into production if not caught. All fixed before final state.

---

## The Brutal Truth

This job nearly shipped a silent production data-corruption vector. The original `legacyWriteOneOrder_()` function wrote the `Orders` header row **before** its associated `OrderLines` rows (mirroring the existing `actionCreateOrder_`'s normal interactive flow). Under Apps Script's 6-minute execution ceiling, a mid-import crash on any of ~206 sequential order writes would leave a broken, half-populated `Orders` row dangling in production — invisible to end users (no invoice link, no lines), but impossible to clean up.

**Why it's unfixable after the fact:** Phase 4's resumability logic uses `nextOrderId_()` to detect where the import stopped and resume from the next-fresh ID. A crashed `Orders` row doesn't get "resumed" — it gets **duplicate-written** on the next run (because `nextOrderId_()` allocates a fresh, never-seen-before ID). The broken first row stays orphaned forever. The only recovery path is manual production sheet surgery.

**Decision made:** Reordered writes to `OrderLines` + `StatusHistory` **before** `Orders` header. A crash now leaves only harmless orphaned line rows (invisible in the app, no header ever points at them) instead of a broken visible order. A deliberate divergence from `actionCreateOrder_`'s existing convention, justified by this migration's different risk profile (bulk unattended vs. interactive single-order).

Three other high-priority gaps also shipped broken:
- `rememberCustomer_()` and `rememberUoms_()` were never called during import, silently contradicting Phase 3's explicit scope decision #2 (customer/UoM lists were supposed to self-fill). The Phase 3 implementer read Phase 2's output shape but didn't read Phase 2's code itself.
- All 4 new editor-only entry points (`dryRunImportLegacyOrders`, `migrateImportLegacyOrders`, `resetLegacyImportResumePoint`, `reconcileLegacyImport`) called `guardSetup_()` but weren't registered in `Setup.gs`'s `editorOnly` array. The safety net's self-check was disconnected (currently harmless only because they also weren't in the HTTP router).
- Default `Config.statusList` had no `done`-equivalent entry. ~443 of ~534 legacy lines have status "done"/"Done" (the literal text). A dry-run would generate `status-unmatched` review flags for 83% of line items — enough noise to bury a genuine anomaly.

---

## Technical Details

**The crash-safety bug (commit-level detail):**
```
BEFORE (crashes leave broken Orders row):
writeOrders({...order...})           // <- crash here leaves half-populated row orphaned forever
writeOrderLines({...lines...})
writeStatusHistory({...history...})

AFTER (crashes leave harmless orphaned lines):
writeOrderLines({...lines...})
writeStatusHistory({...history...})
writeOrders({...order...})           // <- crash here: no header, orphaned lines invisible
```

**Files touched:** 10 new apps/api files (~1500 LOC total):
- `LegacyImportParser.gs` — Drive API xlsx→Sheets conversion, month-block detection
- `LegacyImportExtractor.gs` — Field mapping, VAT/PO/deposit/UoM parsing
- `LegacyImportWriter.gs` — Reuses `nextOrderId_()`, `buildLineRecord_()`, `ensureInvoice_()` primitives; reordered write order
- `LegacyImportResumePoint.gs` — Script Properties tracking (position, state)
- `LegacyImportReconciliation.gs` — Month totals vs. file's DOANH SỐ THÁNG
- Plus 4 entry-point wrappers (`LegacyImportActions.gs`)

**Offline tests:** 5 test files, 162 assertions, all green. Test structure validated parsing, extraction rules, write ordering, resumability state tracking, reconciliation math offline — not against real Sheets (no Apps Script runtime available in this environment).

**Test coverage gaps explicitly noted:** Every phase report flagged "no real runtime verification possible — success criteria marked unverified beyond offline synthetic fixtures." Runbook's Phase 5 pre-flight steps exist to catch real-world surprises (e.g., actual Config sheet missing the 'done' status, actual file encoding issues, etc.).

---

## What We Tried

**Orchestration pattern:** Delegated 6 sequential subagent phases, each briefed with precise file paths + prior-phase code to read (not raw conversation history per orchestration-protocol.md). Each phase implementer had 3 inputs: their own spec, the prior phase's files to read, and the prior phase's report.

**Result:** Each phase succeeded individually, but **only the code-reviewer pass could see cross-phase issues.** Phase 3 implementer (bulk write) didn't catch that Phase 2's output was being partially skipped (rememberCustomer_ calls dropped). Phase 1 implementer (ingestion) couldn't see that Setup.gs registration was missing. Phase 5 (reconciliation) didn't verify that 83% of lines would fail status matching.

**Code-reviewer pass:** Single pass after all 5 phases complete. Reading all 10 files at once surfaced integration assumptions that individual phase readers couldn't catch.

**Bug-fix session:** Single focused session to fix the 4 issues, update Setup.gs registration, add missing status to Config defaults, then re-test offline.

---

## Root Cause Analysis

**Why the crash-safety bug existed:** Phase 3 implementer reused the existing `actionCreateOrder_()` write pattern (Orders first, then lines) without re-questioning it for bulk migration context. A bulk migration's different risk profile (unattended, 6-min timeout ceiling, irreversible production write) demands different tradeoffs than interactive single-order creation. The bug was a failure to **adapt** an existing pattern, not a failure to implement a new one.

**Why scope gaps shipped:** Subagent orchestration phases silhouette-read each other (Phase 3 reads Phase 2's output but doesn't internalize Phase 2's exact implementation details). Customer/UoM call sites are scattered across the import flow — not a single place to "add them." Easy to miss without a second-pass integration review.

**Why the safety-net registration gap persisted:** Four entry points added a call to `guardSetup_()` (the safety check mechanism) but no one connected them to the place that **declares** what's safe. The check ran but its result was never consulted.

---

## Lessons Learned

1. **Bulk migrations demand different write-order tradeoffs than interactive writes.** Reusing an existing pattern wholesale is a trap. Every phase must ask: "Does this pattern's risk model still hold here?" A crash-safety bug doesn't show up in unit tests — it shows up when you think through 6-minute timeout failure modes.

2. **Cross-phase integration review is not optional.** Six independent phase implementations will have 80% correctness even if each phase is individually sound. One full-codebase code-reviewer pass caught what six sequential phase reviews missed. Budget for it.

3. **Judgment calls need explicit user sign-off, not assumptions.** Three design choices (createdBy identity, status one-offs filtering, write-order divergence) could each go wrong. Asking took 3 AskUserQuestion calls; shipping wrong would've required hot-fix or manual production cleanup.

4. **Scope discipline saves rework.** Explicitly did NOT execute real Sheets operations, did NOT update 6 docs prematurely, did NOT assume production Config sheet already has 'done' status. All flagged as unverified, deferred to a manual session with the project owner present. This honesty prevents "we shipped assuming X" surprises.

---

## Next Steps

**Immediate (before live run):**
- **Runbook preflight check (Phase 5 section 4):** Verify that production's Config sheet already has a 'done'-equivalent status entry before dry-run. If not, add it via admin UI.
- **Manual dry-run with user present:** Load test file, trigger `dryRunImportLegacyOrders()`, inspect review flags for false positives (status-unmatched should drop from 400+ to <10 if 'done' status exists).
- **Real production run:** `migrateImportLegacyOrders()` after fresh `backupNow()` snapshot. Mark Milestone 7 complete in MILESTONES.md post-run.

**Post-run (docs sync, per Phase 5):**
- Update `EXCEL_REFERENCE.md`, `OPEN_QUESTIONS.md`, `README.md`, `MILESTONES.md`, `development-roadmap.md`, `DATA_MODEL.md` to reflect "historical import completed" and link the runbook as a reference for any future edge cases.
- Commit all Phase 1–5 code + offline tests + runbook once user confirms real run succeeded.

**Ownership:** Real production execution is user's responsibility (requires manual verification, real Config sheet inspection, actual Sheets access). Code is production-ready pending those manual gates.

---

## Unresolved Questions

1. **Does the production Config sheet already have a 'done' (or 'Hoàn thành', 'Complete', etc.) status entry?** Required before dry-run. If missing, must be added manually via admin UI before next session. Check during Phase 5 preflight (runbook section 4.1).

