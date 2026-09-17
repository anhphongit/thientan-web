---
phase: 2
title: "Field Mapping and Extraction Rules"
status: completed
priority: P2
effort: "8h"
dependencies: [1]
completed: 2026-09-17
---

# Phase 2: Field Mapping and Extraction Rules

## Overview

Turn each parsed order-group (from Phase 1) into the exact field shapes `Orders`/`OrderLines`/
`Invoices` expect, per `docs/DATA_MODEL.md`'s `HEADERS`. This is pure data transformation —
still no writes — with offline unit tests, since every rule here is a judgment call on messy
real-world text and needs to be pinned down and regression-tested, not re-decided by hand each
run.

## Key Insights

- `docs/EXCEL_REFERENCE.md` gives concrete worked examples for every messy field (§3 PO
  splitting, §4 VAT ratios, §5 customer/UoM/item-code variants, §6 status values) — use these
  verbatim as test fixtures.
- Schema is already settled (Q1/Q3/Q4/Q6 in `docs/OPEN_QUESTIONS.md`): **no `orderNo`/
  `customerPo` split** — the whole PO cell becomes one `po` string (join multi-line cell with
  `; ` or similar), with `poNote` reserved for a genuinely separate remark line (e.g. `(chTh)`).
- VAT rate: `Trị giá hđ / Thành tiền chưa VAT` ratio → `1.08` → `vatRate: 0.08`, `1.10` →
  `vatRate: 0.10`. If `H` (Thành tiền) is 0/blank, ratio is undefined — fall back to
  `Config.vatRates[0]` and flag the line for manual review (do not guess silently).
  `buildLineRecord_()` (`Orders.gs:1362`) recomputes `amountExVat`/`amountIncVat` from
  `unitPrice × qty` itself, so the imported `vatRate` only needs to be *correct*, not used to
  back-compute anything.
- `CHI TIẾT` → split on first `:` → `productCode` (trimmed) + `description` (remainder,
  preserving internal newlines). If no `:` found, treat the whole cell as `description` with
  `productCode` blank (schema allows this — `productCode` is optional/no FK enforcement).
- `TRẠNG THÁI` → **since M5a moved status to the line level, and this file's status is already
  per-row, map straight to `OrderLines.status`/`statusNote`**: match against
  `Config.statusList` keys/labels (case-insensitive) for the 5 controlled-ish values in §6
  (`done`, `đã xuất chưa tt`, `đã giao chưa xuất`, `hàng về`, `chờ hàng về`); anything else
  becomes blank `status` + the full raw text preserved in `statusNote` (schema explicitly
  allows a line with no status).
- Deposit/supplier-payment text embedded in status (§6 examples: "Khách đã cọc
  47.466.000đ", "đã cọc 18.765.000 cho Tâm Thịnh Phát", "đã tt đủ NCC Regas") maps to
  `Orders.customerDeposit`/`supplierName`/`supplierPaid` — these are **order-level** fields,
  but the source text appears on a line row. Attempt regex extraction (Vietnamese-formatted
  number + optional "cho <supplier>" clause) on the **first line of the order group only**
  (mirrors where `STT`/`PO`/invoice fields already live); on any line beyond the first, do not
  extract into order-level fields (ambiguous which line "owns" a deposit note on a multi-line
  order) — keep the raw text in that line's `statusNote` untouched. Every extraction (matched
  or not) is logged in the parse report for manual review — this is inherently heuristic and
  must not be a silent black box.
- UoM: normalize case-insensitively against `Config.uomList` (`Cái`, `Cuộn`, `Bịch`, `Bộ`, `m`,
  `Hộp`, `SET`, `Xấp`); if no case-insensitive match, keep the raw value as-is (it will
  self-append to the list on the first live edit, same as today) and flag it.
- Customer: trim only, no normalization/dedup logic — reuse the existing self-filling
  `rememberCustomer_()` behavior at write time (Phase 3), consistent with Q6's accepted
  typo-becomes-a-new-customer tradeoff. Do not build new customer-normalization code (YAGNI).

## Requirements

- Functional: pure functions mapping one parsed order-group → `{orderFields, lineFields[],
  invoiceRefs[]}`, plus a review list of every heuristic decision made (VAT fallback, status
  fallback, deposit/supplier extraction attempted, UoM no-match).
- Non-functional: every mapping rule must have an offline test using the exact examples quoted
  in `EXCEL_REFERENCE.md` §3/§4/§5/§6, so the rule is pinned down, not tribal knowledge.

## Related Code Files

- Create: `apps/api/LegacyImportMap.gs` (mapping functions, called by `LegacyImport.gs` from
  Phase 1/3)
- Create: `tools/offline-tests/legacy-import-mapping.test.js` (new offline test file, following
  the existing `tools/offline-tests/*.test.js` pattern — mirrors `orders-crud.test.js`'s style)
- Read for context: `docs/EXCEL_REFERENCE.md` (source of every test fixture),
  `apps/api/Config.gs` (`HEADERS`, `statusList`/`uomList`/`vatRates` default values)

## Implementation Steps

1. `mapPoCell_(rawPoText)` → `{po, poNote}` — join multi-line cell, split trailing
   parenthetical/note segment into `poNote` if present.
2. `mapChiTietCell_(rawText)` → `{productCode, description}` — split on first `:`.
3. `detectVatRate_(unitPrice, qty, thanhTien, triGiaHd)` → `{vatRate, wasFallback}`.
4. `mapStatusCell_(rawText, statusList)` → `{status, statusNote, matched}`.
5. `extractDepositSupplier_(rawText)` → `{customerDeposit, supplierName, supplierPaid,
   matched}` — only called on an order's first line, per Key Insights above.
6. `mapUom_(rawUom, uomList)` → `{uom, wasExactMatch}`.
7. `mapLegacyOrderGroup_(group, config)` — composes the above into the final
   `{orderFields, lineFields[], invoiceRefs[]}` shape, plus a per-order `reviewFlags[]` array
   collecting every fallback/no-match/heuristic-hit for the Phase 1-style dry-run report.
8. Write `tools/offline-tests/legacy-import-mapping.test.js` covering every function above with
   the real examples from `EXCEL_REFERENCE.md`.
9. **Ask the user** (flagged in `plan.md`'s Unresolved Questions) whether the ~20 free-text
   cash-note one-offs (§6, e.g. "Ngày 06/06: mua đt iphone" — unrelated to any order) that may
   surface as unmatched `statusNote` text during real dry-run testing should import as-is
   (harmless free text on a line) or be actively filtered — do not decide silently.

## Success Criteria

**Status: Complete (2026-09-17). Real file mapping executed and validated.**

- [x] All mapping functions covered by offline tests using verbatim `EXCEL_REFERENCE.md`
      examples (PO 3-line split, VAT 1.08/1.10 ratios, all 5 controlled status values, at least
      2 deposit/supplier free-text examples, at least 2 UoM casing variants) — *offline suite complete*
- [x] Running `mapLegacyOrderGroup_` over every group from Phase 1's real dry-run parse produces
      zero uncaught exceptions (a messy/unexpected row degrades to a review flag, never a crash)
      — *offline tests verify; real file execution confirmed zero exceptions*
- [x] Review-flag counts (VAT fallback, status unmatched, UoM no-match, deposit-extraction
      attempted) are printed in an updated dry-run report and are small enough to spot-check by
      hand (expect low tens, not hundreds, given `EXCEL_REFERENCE.md`'s counts) — *runbook Steps 4, 6 flag review completed; resolved all flags before live run*

## Risk Assessment

- **Over-fitting regex to the handful of examples in the docs, missing real-file variants**:
  mitigate by running the real dry-run parse (not just unit tests) and manually reading every
  row that got a review flag before moving to Phase 3.
- **Silent wrong deposit/supplier extraction** (e.g. misreading which number is the deposit):
  mitigate by treating every extraction as a review flag regardless of confidence — Phase 5's
  live-run runbook requires a human skim of the flags, not an assumption that "matched" means
  "correct."
