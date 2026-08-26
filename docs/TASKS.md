# Tasks — one per conversation

`MILESTONES.md` says *what* a milestone contains. This file breaks it into pieces
small enough to finish, test and verify one at a time.

**The rule** (set 2026-08-20, see `AGENTS.md` §7): a milestone is split into tasks
before any of it is built. Phong picks the next task each conversation. An agent
does that task, updates the row below, and stops.

Status: ☐ not started · ◐ in progress · ☑ done · ✎ built but not yet verified live

This file tracks current status only. Build history, "how it was verified" detail,
and dated narrative live in `MILESTONES.md`'s progress log and in git history —
not here.

---

## Milestone 2 — Order CRUD ◐ built, live checklist not fully run

| # | Task | Status |
|---|------|--------|
| 2.0 | Blocked questions answered; `OPEN_QUESTIONS.md` / `DATA_MODEL.md` updated | ☑ |
| 2.1 | `Config.gs` headers + `setupMilestone2()` | ☑ verified live (Checklist A) |
| 2.2 | `Orders.gs` create + list/get reads | ◐ retest — see Checklist B |
| 2.3 | Money: per-line VAT, totals, deposits | ✎ built, not checked off live — Checklist C |
| 2.4 | Edit and delete, line reconciliation | ✎ built, not checked off live — Checklist D |
| 2.5 | Invoices: shared invoice, missing date refused | ✎ built, not checked off live — Checklist E |
| 2.6 | Permission scoping and price blindness | ✎ built, not checked off live — Checklist F |
| 2.7 | Phone pass | ✎ built, not checked off live — Checklist G/H |

**This is the actual gap, not the performance work.** `CHECKLIST_M2_VI.md`
section A (setup) is checked; sections B through H are still all unchecked
boxes. The 2.5/2.5b/2.5c performance and race-condition work sits on top of
this CRUD layer — none of it substitutes for running B–H. Do this before
starting Milestone 3. Vietnamese checklist wording is in
[`CHECKLIST_M2_VI.md`](CHECKLIST_M2_VI.md) — tick boxes there as each is
confirmed, then flip the table above to ☑.

**Lesson from 2.2's first attempt:** `ViewsOrders.html` read `window.TT` at load
time, before `App.html` (which defines it) had run, so the tab hung on
"Đang tải đơn hàng..." with no error. Fixed by reading the bridge inside
`render()`; `App.html` now catches a throwing view instead of leaving stale
text on screen. Worth remembering for any new view file.

---

## Milestone 2.5 — Performance & UX ☑ done

Raised 2026-08-20: the Đơn hàng tab felt stuck, with no feedback while loading.

| # | Task | What it did | Status |
|---|------|-------------|--------|
| P1 | Timing instrumentation (`_ms` on API responses, timing pill under `DEV_MODE`) | Turned the slowness into real numbers | ☑ |
| P2 | Client cache + no-blank refresh + optimistic writes | Returning to the list is instant; save shows the new record immediately | ☑ |
| P3 | Boot prefetch + skeleton cards | Order tab is warm before it's clicked; cold load reads as loading, not frozen | ☑ |
| P4 | Server-side pagination + slim list payload (also closes M3 task 3.1) | 20-row pages, card-only fields, smaller responses | ☑ |
| P5 | `lineCount` column on `Orders`, maintained on save | Removes the full `OrderLines` read on every list call | ☑ |
| P6 | Per-execution memoization in `SheetsRepo.gs` | One spreadsheet open / one sheet read per request | ☑ |
| P7 | Server-side list cache (`CacheService`, keyed by `ordersVersion`) | Cache hit skips the sheet read entirely | ☑ |

`apps/api/DevSeed.gs` (`seedTestOrders` / `deleteSeedTestOrders`, editor-only,
not reachable over HTTP) generates tagged test orders (`SEED-`/`TEST `) for
exercising pagination — useful again for Milestone 3's filters.

---

## Milestone 2.5b — Loading-time & race fixes ☑ done, verified live 2026-08-26

| # | Task | What it did | Status |
|---|------|-------------|--------|
| L1 | List cache with 60s TTL | Opening the tab / back from detail skips the API call if data is fresh; "Làm mới" always forces a fetch | ☑ |
| L2 | Request generation / only-latest-wins | Rapid navigation can't let a stale response paint the wrong screen | ☑ |
| L3 | Reduced concurrent pressure (single retry on 5xx/network error, staggered prefetch) | Fewer overlapping WEB→API calls | ☑ |

---

## Milestone 2.5c — Extend loading-time optimizations to every API request ◐ in progress

The API's surface is small and fixed — `getSession`, `listOrders`, `getOrder`,
`createOrder`, `updateOrder`, `deleteOrder`, `logDev` (`apps/api/Router.gs`'s
action map) — audited one at a time against the 2.5/2.5b playbook (client TTL
cache + stale-while-revalidate, skeleton instead of blocking text,
request-generation guarding, server-side slimming/caching): apply it fully,
partially, or not at all, per action, with a reason either way.

| # | Task | Verdict | Status |
|---|------|---------|--------|
| D1 | `getOrder` (order detail) — client TTL cache + skeleton (mirrors L1/P2/P3) + a "Tải lại" force-reload button (bypasses the cache; confirms first if the form is editable, since it would discard unsaved typing) | Applies fully | ☑ verified live 2026-08-26 |
| D2 | `createOrder` / `updateOrder` / `deleteOrder` responses | Does not apply — a write must return fresh data; already gets P6's memoization for free | ☑ audited, no action |
| D3 | `getSession` | Does not apply — called once per page load, nothing to skip on repeat | ☑ audited, no action |
| D4 | `buildOrderResponse_`'s `invoiceIndex_()` full-`Invoices`-sheet scan (used by `getOrder` and every create/update response) | Deferred — same shape as the problem P5 fixed for `OrderLines`, but unlikely to dominate at today's data volume. Revisit if `đọc` on detail stays high | ☐ deferred |

**D1's staleness risk, in one line:** `actionUpdateOrder_` has never guarded
saves with an `updatedAt`/version check, so two overlapping edits already
last-write-win regardless of caching — a 60s TTL doesn't meaningfully change
that. Offline-tested in `tools/offline-tests/orders-ui.test.js` (166
assertions across the three files); `apps/web/Config.gs` `BUILD` is
`web-2026-08-26-4`.

---

## Milestone 3 — List, filter, search, status

Not started. Split so it can be worked one task per conversation. Order matters:
each task builds on the one above it and is testable on its own.

| # | Task | Scope | How Phong verifies it | Status |
|---|------|-------|----------------------|--------|
| 3.1 | Server-side pagination | Absorbed into Milestone 2.5 task P4 | Done via P4 | ☑ |
| 3.2 | Month / date-range filter | One filter, server-side, permission-scoped | Pick a month → only that month's orders; a staff account still sees only their own | ☐ |
| 3.3 | Customer + status + created-by filters | Three dropdowns, combinable with 3.2 | Each alone, then two together, then all | ☐ |
| 3.4 | Free-text search | Across `orderId`, `po`, `customer`, line `description` | Search a PO fragment, a customer, a word from a description | ☐ |
| 3.5 | `changeStatus` action + `StatusHistory` | One-purpose action, `change_status` enforced, history appended with who and when | Change a status from the list; `StatusHistory` gains a row; an account without the permission is refused | ☐ |
| 3.6 | Admin approve | `approve_order`, sets `approvedBy` / `approvedAt` | Admin approves; a staff account cannot | ☐ |
| 3.7 | List UX on a phone | Filter bar collapses, cards stay readable, filters survive going into an order and back | Real phone, with filters applied | ☐ |

---

## Milestones 4–6

Split them when they start, not before — the split should reflect what M2 and M3
actually taught us. Scope stays in `MILESTONES.md` until then.

One thing already decided for M4 (Q2, answered 2026-08-20): revenue is shown
**both** ex-VAT and inc-VAT, and the month basis is a **toggle** between order date
and invoice date. That is two tasks, not one.
