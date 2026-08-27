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

## Bugfixes found while verifying Milestone 2 (2026-08-26 / 2026-08-27)

Five issues Phong hit while walking Milestone 2's checklist and reviewing
permissions, before it could be signed off. All are in `apps/api/Orders.gs`
and `apps/web/ui/ViewsOrders.html`; `BUILD` is `api-2026-08-27-clamp` /
`web-2026-08-26-9`. 257 offline assertions pass across the three test files
(54 + 116 + 87).

| # | Issue | Root cause | Fix |
|---|-------|-----------|-----|
| B1 | Editing an order could send an empty PO, wiping the real one on save | `docs/PERMISSIONS.md`'s own `visible_fields` examples still said `orderNo` — the field name Q3 replaced with `po` — so a role configured from that example never receives `po`, its form never shows it, and the empty value it posts back was trusted and written | Server: `fieldVisible_(user, field)` generalizes the existing money-blindness pattern to `po`/`poNote`/`statusNote`/`supplierName` — a field outside the caller's `visible_fields` now keeps its stored value on update instead of being overwritten. Docs: `PERMISSIONS.md`'s examples corrected to current field names |
| B2 | Save/delete left the rest of the form fully interactive while the request was in flight | `setSaving()` only toggled the Save button itself; every other input, and the delete button, stayed live | All header/line inputs and every action button now render `disabled` for the duration of a save, delete, or reload — one shared `state.busyAction` (`'saving' \| 'deleting' \| 'reloading' \| null`) drives it |
| B3 | Nothing stopped a second action (save while deleting, delete while saving, etc.) from firing | No mutual exclusion between save/delete/reload | `isBusy()` gate at the top of `onClick()` — no click does anything while `state.busyAction` is set, in addition to the disabled attributes from B2 |
| B4 | A role restricted by `visible_fields` still saw a blank, editable input for a field it has no permission to see — on both a brand-new order and an existing one. B1's fix only stopped the value from being overwritten on save, not from being shown as an empty field to fill in. Also: on the line level, a blind role's blank `productCode`/`uom`/`note`/`invoiceNo` submission would have silently wiped an existing line's stored value the same way B1's PO bug did | `headerCardHtml`/`lineHtml` render every optional field unconditionally; the client never checked `visible_fields` before drawing an input, only the server checked it before trusting one back | Server: `fieldVisible_` extended to the line loop in `actionUpdateOrder_` (new `lineFieldsHidden`) so `productCode`/`uom`/`note`/`invoiceNo`→`invoiceId` are preserved, not just the order-level fields. Client: new `fieldAllowed_(field)` helper plus `has(o, field)` guards already used for money extended to `po`/`poNote`/`statusNote`/`supplierName`/`productCode`/`uom`/`invoiceNo`+`invoiceDate`/`note` in `headerCardHtml`, `lineHtml`, `blankLine()`, `normalizeLine()`, `openForm(null)`, and `collect()` — a field outside `visible_fields` is absent from the form entirely, not rendered blank |
| B5 | Direct-API-call review (2026-08-27), Phong's request: a role missing a field from `visible_fields` could still SET that field to anything (a huge `unitPrice`/`customerDeposit`, an arbitrary `po`/`productCode`) by calling `createOrder` directly, or by adding a brand-new line during `updateOrder` — bypassing their own web form, which never renders inputs for fields it can't see. All of B1/B4's protections (`blindToMoney`, `fieldVisible_`, `lineFieldsHidden`) only fire "if a matched/existing record already has a stored value to preserve" — a new order or a new line has nothing stored yet, so those guards never ran | `actionCreateOrder_` wrote every field straight from the validated payload with no visibility check at all; `actionUpdateOrder_`'s new-line branch (`else` — no `lineId` match) had the same gap, since `lineFieldsHidden`/`blindToMoney` there are both gated on `if (match)` | New `clampHiddenOrderFields_(user, clean)` / `clampHiddenLineFields_(user, line)` in `Orders.gs` force every field outside `visible_fields` (or blind-to-money) to its safe default — `0` for money, `''` for text, no invoice created from a hidden `invoiceNo` — called once in `actionCreateOrder_` right after validation (covers the whole new order), and once for each newly-appended line in `actionUpdateOrder_`'s `else` branch. A field the role DOES see still updates normally |

This was a genuine, exploitable gap — confirmed by writing the attack payload
directly against `actionCreateOrder_`/`actionUpdateOrder_` in the offline
harness (sections 6d/6e in `orders-permissions.test.js`) before the fix, where
it landed the attacker-supplied price and fields unchanged; after the fix the
same payload lands `0`/`''`. Reviewed the whole `apps/api` permission surface
while at it (`Router.gs`, `Auth.gs`, `Permissions.gs`, `Security.gs`,
`Orders.gs`) — everything else already fails closed: every action starts with
`requirePermission_`, ownership is checked separately (`requireOwnershipOrAll_`),
reads go through `filterVisibleFields_`, `actor` can never be spoofed by a
browser caller (it is read from `Session.getActiveUser()` server-side in
`apps/web/Auth.gs`, never accepted from the client), and `status` is validated
against the real status list regardless of who's asking. The one accepted,
already-documented risk is the shared-secret model itself (`Security.gs`'s
own header comment): anyone who obtains `SHARED_SECRET` can impersonate any
user including the admin, since nothing in a shared-secret design can prevent
that — mitigated by rotation/expiry and an instant Sheets-only revoke switch,
not by anything this review could add. The secret itself never reaches the
browser (the `apps/web` → `apps/api` hop is a server-to-server `UrlFetchApp`
call, not something a browser console can see or trigger with different
values).

Also fixed in the same pass, found while tracing B1/B2: `applyOrderData()` used
to assign the server response's `order` object straight into `state.order`,
so it was the same object reference as what D1 stores in `orderCache`. Editing
the form (`collect()`, called on every add-line/del-line/save) mutated the
cache too. Now a shallow copy — the cache is read-only from the form's point
of view.

---

## UI polish — order list cards (2026-08-26)

Phong asked for two readability fixes on the order list cards, not tied to a
milestone: (1) status should be tellable apart without reading the label, and
(2) line count should stand out instead of hiding in the muted meta text.

| # | Change | Detail |
|---|--------|--------|
| U1 | Per-status colour + shape, not a generic badge | New `.status-pill` family in `Styles.html` (`--draft`/`--confirmed`/`--waiting`/`--arrived`/`--delivered`/`--invoiced`/`--paid`/`--cancelled`, plus a `--default` fallback for any status key an admin adds later that isn't in the map) — each has its own background/text colour and a small dot before the label, so colour-blind users and fast scanners get a second signal beyond text. `cancelled` also gets a strikethrough. `statusPillClass(key)` in `ViewsOrders.html` picks the class from a `STATUS_STYLE` map keyed on the app's fixed 8-status workflow (`apps/api/Config.gs` `CONFIG_DEFAULTS`) |
| U2 | Line count promoted to its own indicator | Was folded into the muted `.oc-meta` line ("20/08/2026 · PO 123 · 3 dòng"); now a filled circle badge (`.oc-lines`) showing just the number (title attribute still spells out "N dòng" on hover/long-press). Went through two rounds of visual options with Phong (5 badge styles, then 5 placements), tried grouped-with-status live, then moved once more after seeing it live: settled on the badge grouped with the order id on the left of the top row (`.oc-top-left`) — "this order, N lines" reads before status/customer — `.oc-meta` keeps just the date and PO |

Offline-tested in `tools/offline-tests/orders-ui.test.js` (236 assertions
across the three test files: 54 + 95 + 87); `apps/web/Config.gs` `BUILD` is
`web-2026-08-26-9`. No API change — client-only.

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
