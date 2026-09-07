---
title: "Milestone 4 + 5 Completion — verified plan"
description: "Ship M4 (export/stats) then finish M5 (5.3 matrix editor, 5.4 Config editing, productCode link); audit's two biggest blockers were false positives."
status: pending
priority: P1
effort: 29h
branch: main
tags: [milestone-4, milestone-5, apps-script, verification, docs-sync]
created: 2026-09-07
---

# Milestone 4 + 5 Completion

## ⚠️ Audit Correction — read before planning any work

Source audit `plans/reports/audit-260907-1744-codebase-analysis.md` was re-verified
against the codebase. **3 of its 5 blockers are wrong**, including the two largest
effort items (20h of phantom work). One of its recommended fixes would cause a
production regression.

| Audit claim | Verdict | Evidence |
|---|---|---|
| **B2** `Inventory.gs` missing → app crashes on Inventory tab, 8–12h to build | 🔴 **FALSE POSITIVE** | Backend shipped as `Products.gs` (339 LOC). 5 actions at `apps/api/Products.gs:54,95,105,130,169`. Chain verified end-to-end: `apps/web/ui/ViewsInventory.html:64` → `apps/web/Main.gs:293-319` → `apps/api/Router.gs:197-201` → `Products.gs`. **Root cause of the audit error:** `docs/MILESTONES.md:176` names the file `Inventory.gs`; it shipped as `Products.gs`. Nothing to build. |
| **B3** Zero test coverage for M4–M5, 8h to write | 🔴 **FALSE POSITIVE** | 17 suites, **943 assertions, all passing** (measured 2026-09-07). M4 = 253 (`export.test.js` 53, `exportjob.test.js` 91, `exportsheet.test.js` 44, `stats.test.js` 65). M5 = 177 (`products.test.js` 48, `products-ui.test.js` 40, `admin.test.js` 53, `admin-ui.test.js` 36). Audit's "693 assertions" figure is stale. |
| **B1** `export_statistics` defined but never enforced → add `requirePermission_(user,'export_statistics')` to Export.gs | 🟠 **MIS-FRAMED — proposed fix is a REGRESSION** | Order export correctly gates on `export` (`Export.gs:84,110,125`; `ExportJob.gs:149`). `export_statistics` was **deliberately deferred** (`docs/TASKS.md:2191-2193`: "export_statistics comes later… deferred until the UI shape is known"). No stats-export feature exists (`ViewsStats.html` has no export control; no `apiExportStats` in `Main.gs`). Applying the audit's fix would break the `sales` preset (`Config.gs:247-248`: `export:true, export_statistics:false`) — **sales staff would lose order export**. Real work = a scope decision, see Phase 1. |
| **B4** M4 live verification not done | 🟢 **VALID** | No `docs/CHECKLIST_M4_VI.md`. All 6 exit criteria unchecked at `docs/MILESTONES.md:161-169`. Ad-hoc live feedback did occur (`TASKS.md:1104`). |
| **B5** DATA_MODEL.md stale | 🟢 **VALID** | `docs/DATA_MODEL.md` §2 lists 18 Orders columns; `Config.gs:90-94` has 23. Missing: `lineCount`, `approveStatus`, `rejectReason`, `rejectedBy`, `rejectedAt`. |
| "M3 approval flow not yet live-tested" | 🔴 **FALSE** | `docs/CHECKLIST_M3_VI.md` is 60/60 checked, including §I approval flow (lines 97-117). The audit trusted the stale progress-log entry at `MILESTONES.md:226`. |

### Gaps the audit MISSED (real M5 work)

| # | Gap | Evidence |
|---|---|---|
| G1 | `OrderLines.productCode` is a **free-text input**, not linked to the Products catalog. M5 exit criterion "`OrderLines.productCode` can link to a product" is **not met**. | `apps/web/ui/ViewsOrders.html:2061` renders `<input class="l-productCode">`; zero `listProducts` calls in that file |
| G2 | **M5.3** permission matrix editor + **M5.4** Config sheet editing not started — required by 2 of 5 M5 exit criteria | `docs/TASKS.md:3016-3017` (both ☐) |
| G3 | `MILESTONES.md` progress log ends 2026-09-02 — no M4 or M5.1/5.2 entries; headers still `◐`/`☐` | `docs/MILESTONES.md:152,172,222-226` vs `TASKS.md:1093-1105,3014-3015` |
| G4 | Q5 (auto stock deduction) still open — blocks M5 scope finalization | `docs/OPEN_QUESTIONS.md:105` 🟡 |

### Revised effort

Audit estimated **45–55h**. Verified: **26–34h** (~29h planned). The 20h delta is the two false positives.

---

## Phases

| # | Phase | Effort | Status | Blocked by |
|---|-------|--------|--------|-----------|
| 1 | [Truth baseline + `export_statistics` resolution](phase-01-truth-baseline-and-export-statistics.md) | 2h | pending | — |
| 2 | [M4 live verification + sign-off](phase-02-m4-live-verification-and-signoff.md) | 4–5h | pending | Phase 1 |
| 3 | [M5.3 — permission matrix editor](phase-03-m5-3-permission-matrix-editor.md) | 6–8h | pending | Phase 1 (decision only) |
| 4 | [M5.4 — Config sheet editing](phase-04-m5-4-config-sheet-editing.md) | 5–7h | pending | Phase 3 (file conflict) |
| 5 | [productCode ↔ Products link](phase-05-productcode-product-link.md) | 3–4h | pending | Q5 decision |
| 6 | [M5 live verification + sign-off](phase-06-m5-live-verification-and-signoff.md) | 4–5h | pending | Phases 3, 4, 5 |
| 7 | [Documentation final sync](phase-07-documentation-final-sync.md) | 1.5h | pending | Phases 2, 6 |

Requested-structure mapping: requested "Phase 1 critical fixes" → Phase 1 (the
`Inventory.gs` half of it does not exist as work). Requested "Phase 3 M5
completion" → Phases 3–6 (18–24h is too large for one phase; also file
ownership forces the split). Requested "Phase 4 docs" → Phase 7.

---

## Critical path

```
Phase 1 (2h) ──► Phase 2 (5h) ──────────────────────────┐
      │                                                  ├──► Phase 7 (1.5h)
      └──► Phase 3 (8h) ──► Phase 4 (7h) ──► Phase 6 (5h)┘
                  Phase 5 (4h) ──────────────►┘
```

**Longest chain: 1 → 3 → 4 → 6 → 7 = 23.5h.** Phase 2 (5h) and Phase 5 (4h) are
off the critical path. Phase 5 can overlap Phase 3 only if it adds no `Config.gs`
`MSG` entries — otherwise it serializes (see File Ownership).

## File ownership (no two concurrent phases may share a file)

| Phase | Owns |
|---|---|
| 1 | `docs/MILESTONES.md`, `docs/TASKS.md`, `plans/reports/audit-260907-1744-*.md` (append correction) |
| 2 | `docs/CHECKLIST_M4_VI.md` (new) |
| 3 | `apps/api/Admin.gs`, `apps/web/ui/ViewsAdmin.html`, `apps/api/Router.gs`, `apps/api/Config.gs`, `apps/web/Main.gs`, `tools/offline-tests/admin*.test.js` |
| 4 | same set as Phase 3 → **must run after Phase 3, never beside it** |
| 5 | `apps/web/ui/ViewsOrders.html`, `apps/api/Orders.gs`, `tools/offline-tests/orders-*.test.js` (+ `Config.gs` if new MSG needed → then serialize behind Phase 4) |
| 6 | `docs/CHECKLIST_M5_VI.md` (new) |
| 7 | `docs/DATA_MODEL.md`, `docs/MILESTONES.md`, `docs/PERMISSIONS.md`, `docs/codebase-summary.md` |

## Execution order — two options

### Option A — Ship M4 first ✅ RECOMMENDED
`1 → 2 → (sign off M4) → 3 → 4 → 5 → 6 → 7`

- M4 is code-complete with 253 passing assertions; only a checklist + live pass separates it from shipped value. Users get export + statistics in ~7h.
- Banks the delivered value before touching Admin/Config code that carries permission-escalation risk.
- Keeps deploys small: M4 verification needs **no code deploy** if Phase 1 resolves to option 1b (doc-only), so no new `BUILD` and no regression surface.
- Cost: M5 completion slips ~7h.

### Option B — Complete M5 first
`1 → 3 → 4 → 5 → 6 → 2 → 7`

- Only better if there is a hard external deadline on Admin self-service (admin currently must hand-edit the Users/Config sheets to do anything presets don't cover).
- Risks: one giant multi-milestone live-test session at the end; a permission-editor bug and an export bug surface in the same deploy, making attribution hard; M4's finished value sits unshipped for ~25h.

**Recommendation: Option A.** Rationale — M4 is 5h from shipped, M5 is 25h from shipped; shipping the cheap finished thing first is strictly better unless an external deadline says otherwise. Also, Phase 2's live pass exercises the permission model on real data, which de-risks Phase 3's matrix editor.

## Prioritised task list

| P | Task | Effort | Phase |
|---|---|---|---|
| P1 | Append audit correction; fix `MILESTONES.md:176` `Inventory.gs`→`Products.gs` | 45m | 1 |
| P1 | **DECIDE** `export_statistics`: build stats export vs. reserve permission | 30m | 1 |
| P1 | Write `docs/CHECKLIST_M4_VI.md` from the 6 exit criteria | 45m | 2 |
| P1 | Live-test export CSV/XLSX/PDF on PC + phone, Vietnamese diacritics | 2h | 2 |
| P1 | Reconcile revenue vs `FILE THEO DOI DON HANG.xlsx` for one month | 1h | 2 |
| P2 | Build M5.3 permission matrix editor + tests | 6–8h | 3 |
| P2 | Build M5.4 Config sheet editing + tests | 5–7h | 4 |
| P2 | **DECIDE** Q5 auto stock deduction, then productCode link | 3–4h | 5 |
| P2 | Write `docs/CHECKLIST_M5_VI.md`, live-test, sign off | 4–5h | 6 |
| P3 | `DATA_MODEL.md` §2: add 5 missing Orders columns | 30m | 7 |
| P3 | `MILESTONES.md` progress log + header status flip | 45m | 7 |

## Top risks

| Risk | L×I | Mitigation |
|---|---|---|
| Someone applies the audit's `export_statistics` fix verbatim → sales staff lose order export | Med × **High** | Phase 1 records the correction in-repo; Phase 3 adds a regression assertion that `sales` can still call `exportOrdersCsv` |
| Matrix editor (5.3) lets an admin grant themselves or strip the last admin | Med × **High** | Reuse `requireNotSelfRemovingAdmin_` (`Admin.gs:188`) + `requireNotStrippingLastAdmin_` (`Admin.gs:204`) — do NOT write new guards |
| Config editing (5.4) corrupts `statusList`/`approvalFlowEnabled` → app-wide breakage | Low × **High** | Allowlist editable keys; never expose `Security`-sheet keys or `approvalFlowEnabled` |
| Live test blocked by no Apps Script deploy access | Med × Med | Confirm `clasp` push + both deployments before Phase 2 starts |

## Rollback

Every phase reverts by `git revert` of its commit + `clasp push` of the prior
`BUILD` string (`apps/api/Config.gs:18`, currently `api-2026-09-06b-usersadmin`).
Phases 1, 2, 7 are docs-only → zero runtime rollback. Phases 3–5 are additive
(new actions, new UI) with no schema migration, so revert is clean. Phase 4 is
the only phase that writes to the `Config` sheet — snapshot that tab before it.

## Key dependencies

- **External:** Google Apps Script deploy access (both `apps/api` and `apps/web`), the live Spreadsheet, reference file `FILE THEO DOI DON HANG.xlsx`, a real phone.
- **Human decisions (blocking):** `export_statistics` scope (Phase 1), Q5 auto-deduct (Phase 5).
- **Internal:** Phase 4 after Phase 3 (shared files). Phase 6 after 3+4+5.

## Test baseline (must not regress)

`943 assertions / 17 suites / 0 failures` as of 2026-09-07. Re-run all before every commit:
```bash
for f in tools/offline-tests/*.test.js; do node "$f" || echo "FAIL $f"; done
```
