---
title: "Milestone 5a — Order Status → Order Line Status"
description: "Move the business status field from Orders to OrderLines (optional per line); Orders keeps only approveStatus."
status: completed
priority: P2
effort: 26h
milestone: "5a"
branch: "main"
tags: [milestone-5a, schema, orders, orderlines, status, migration, breaking-change]
blockedBy: []
blocks: []
created: "2026-09-14"
createdBy: "ck:plan"
source: skill
---

# Milestone 5a: Order Status → Order Line Status

## Overview

Today `Orders` carries TWO independent status columns: the business `status` + `statusNote`
(required, from `Config.statusList`, Config.gs:322-333) and `approveStatus` (M3.8 approval
workflow, flag-gated). This work moves the **business status down to the line level**:

- `Orders` loses `status`/`statusNote` entirely. **`approveStatus` is untouched** — same
  flag (`Config.approvalFlowEnabled`), same off-by-default behaviour, same code paths.
- `OrderLines` gains **optional** `status` + `statusNote`, reusing the exact same
  `Config.statusList` keys/labels. A line may be saved blank — modelled on the existing
  optional `invoiceId`/`note` line fields (validated-if-present, never required).
- `StatusHistory` gains a nullable `lineId`; every line status change gets its own audit row.
- **No backfill.** Existing order `status` values are discarded, not copied to lines.
- Order list/cards drop status entirely (no pill, no filter, no quick-change). Line status is
  visible/editable only inside the order detail/edit lines table.

> **Terminology.** Tracked as **Milestone 5a**, inserted after M5, before M6, per project-owner
> sequencing decision (2026-09-14). Deliberately NOT "M5.1" or "M5.2" — both already taken by
> completed, unrelated work (`docs/development-roadmap.md:102,110`: Product CRUD, User
> Management). Now an official entry in `docs/MILESTONES.md` and `docs/development-roadmap.md`
> (added 2026-09-14). Refer to this work as **"Milestone 5a"** everywhere — plan, code
> comments, commit messages, docs.

> **Cross-plan.** `plans/260912-1110-apiclient-transient-failure-hardening` and
> `plans/260913-2326-milestone-6-hardening-and-polish` also touch `apps/api` (the latter
> touches `Orders.gs`, but only the error-rethrow/logging wrapper region — no overlap with
> status logic). No formal dependency; just avoid editing `Orders.gs` in parallel.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [schema-and-migrations](./phase-01-schema-and-migrations.md) | Completed |
| 2 | [backend-line-status-logic](./phase-02-backend-line-status-logic.md) | Completed |
| 3 | [stats-and-export-rework](./phase-03-stats-and-export-rework.md) | Completed |
| 4 | [frontend-line-status-ui](./phase-04-frontend-line-status-ui.md) | Completed |
| 5 | [adminconfig-statuslist-review](./phase-05-adminconfig-statuslist-review.md) | Completed |
| 6 | [tests-update](./phase-06-tests-update.md) | Completed |
| 7 | [docs-sync](./phase-07-docs-sync.md) | Completed |
| 8 | [live-verification-and-signoff](./phase-08-live-verification-and-signoff.md) | Completed |

## Dependencies

Strictly sequential 1 → 2 → 3 → 4 → 6 → 7 → 8. Phase 5 is a small verification phase,
runnable any time after Phase 1. Phase 3 depends on Phase 2 (needs line status written).
Phase 6 depends on 2+3+4 (tests span all three). Phase 8 is last and includes a
**manual, owner-run** migration step against the live sheet.

**Baseline verified 2026-09-14:** all 18 offline suites green
(`for f in tools/offline-tests/*.test.js; do node "$f"; done`).

## Key architectural constraint (read before Phase 1)

`appendRecord_`/`updateRecord_` (SheetsRepo.gs:145-168) bind columns to the **live sheet's
header row**, not to `HEADERS` in Config.gs. Therefore removing `status` from `HEADERS.Orders`
does **not** remove the column from the live sheet — old rows keep their values and
`readAll_` will still expose `row.status`. Every reader must be removed, or stale data leaks
silently. `checkOrderHeaders_` (Setup.gs:299-313) only reports *missing* columns, so extra
dead columns pass the health check cleanly.
