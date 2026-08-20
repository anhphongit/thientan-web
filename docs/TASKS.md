# Tasks — one per conversation

`MILESTONES.md` says *what* a milestone contains. This file breaks it into pieces
small enough to finish, test and verify one at a time.

**The rule** (set 2026-08-20, see `AGENTS.md` §7): a milestone is split into tasks
before any of it is built. Phong picks the next task each conversation. An agent
does that task, updates the row below, and stops.

Status: ☐ not started · ◐ in progress · ☑ done · ✎ built but not yet verified live

Every task row answers three questions: what changes, how it is checked, and what
it must not touch.

---

## Milestone 2 — Order CRUD

> ⚠️ M2 was built in one conversation on 2026-08-20, **before this rule existed**.
> The code is written and covered by `tools/offline-tests/` (105 assertions), but
> none of it has run against the real spreadsheet. The tasks below are therefore
> written as **verification slices**: each one is a small, self-contained thing to
> deploy and check on the live app, in order. Nothing needs to be rebuilt — but if
> a slice fails, fix it in that conversation and stop there.

| # | Task | How Phong verifies it | Status |
|---|------|----------------------|--------|
| 2.0 | Decide the four blocked questions; update `OPEN_QUESTIONS.md` + `DATA_MODEL.md` | Read the two docs; the answers match what he said | ☑ 2026-08-20 |
| 2.1 | `Config.gs` headers + `setupMilestone2()` | Push api, run `setupMilestone2` in the editor. Log shows 4 sheets and a passing header check. Run it twice — nothing is overwritten. **Checklist section A** | ☑ 2026-08-20 |
| 2.2 | `Orders.gs` create + the list/get reads | Create a 1-line order and an 8-line order from the app. Rows land correctly in `Orders` and `OrderLines`. **Checklist B** | ◐ retest |
| 2.3 | Money: per-line VAT, totals, deposits | 8% and 10% lines in one order; totals match; `47.466.000` is stored as the number 47466000. **Checklist C** | ✎ |
| 2.4 | Edit and delete, line reconciliation | Edit the 8-line order (change one, remove one, add one); check no orphan or duplicate lines, ids stable. Then delete an order. **Checklist D** | ✎ |
| 2.5 | Invoices: shared invoice, missing date refused | Two lines on invoice 50 in different orders → one row in `Invoices`. Number without a date is refused. **Checklist E** | ✎ |
| 2.6 | Permission scoping and price blindness | Second account: own-orders only, no create button, locked status, no price columns — and saving does **not** wipe stored prices. **Checklist F** | ✎ |
| 2.7 | Phone pass | Real phone: list readable, no zoom on focus, add/remove line easy, numeric keyboard, save a 3-line order. **Checklist G, H** | ✎ |

### 2.2 — attempt 1 failed on the client, fixed 2026-08-20

The Đơn hàng tab hung on *"Đang tải đơn hàng..."* — no error, no
**+ Tạo đơn hàng** button, nothing clickable.

Cause: `ViewsOrders.html` read `window.TT` at load time, but `Index.html` includes
it **before** `App.html`, which is what defines that bridge. So `T` was `undefined`
for the whole session. `showList()` painted the loading text and threw on the very
next line, which is why it looked like a request that never came back.

Fixed:
- the bridge is now read inside `render()` (see the comment at the top of the file)
- `App.html` catches a throwing view and shows a message instead of leaving the
  last painted text on screen forever
- `orders-ui.test.js` now attaches TT only *after* parsing the module, mirroring
  the real page load — the buggy version dies on that test

**This taught us nothing about the server yet.** Re-push `apps/web` and publish a
new version — the API is untouched, so no `setupMilestone2` re-run and no API
deployment needed — then walk Checklist B.

Sign M2 off only when 2.1–2.7 all read ☑. The Vietnamese wording of every check is
in [`CHECKLIST_M2_VI.md`](CHECKLIST_M2_VI.md).

---

## Milestone 2.5 — Performance & UX

Raised by Phong on 2026-08-20: the Đơn hàng tab is slow enough to feel stuck, with
no feedback while it works. Analyzed the same day, before any of it was built —
this section is the split, following the rule in `AGENTS.md` §7.

**Where the time actually goes**, before guessing at a fix:

```
browser → google.script.run          ~200–600ms overhead
  → WEB apiListOrders
    → UrlFetchApp → API /exec        ~700–2000ms  ← two HTTP hops (302 redirect)
      → securityGate_   reads Security sheet     ┐
      → loadUser_       reads Users sheet        │ 4 sheet opens
      → listOrders      reads Orders sheet       │ + 4 getValues()
                        reads OrderLines sheet   ┘  (countLinesByOrder_)
```

The cross-project fetch (WEB → API) is the one cost that dwarfs everything else
and cannot be tuned away — only avoided by making fewer calls. Opening the app
pays it once for `apiGetSession`, then again the moment Đơn hàng is clicked; the
second one is avoidable. `countLinesByOrder_` reads the **entire** `OrderLines`
sheet just to print "3 dòng" per card — cost that grows every month, forever.

**What stays as-is, on purpose:**
- `securityGate_` and `loadUser_` are **not** cached. `Security.gs` and `Auth.gs`
  both argue this at length — instant revocation and instant deactivation were
  each a real incident once (`docs/IDENTITY.md`, `docs/SECURITY.md`). If P1's
  numbers show these two reads dominate, that becomes a question for Phong, not a
  silent optimization.
- No `localStorage` / `sessionStorage` for order data — shared PCs, memory only.

Recommended order: **P1 → P2 → P3**, then re-measure before doing more. P2 and P3
are what Phong actually described (*"it stuck user for a while"*) and are
client-only, so they cannot corrupt data. P4 absorbs Milestone 3 task 3.1 — do not
build pagination twice; §3.1 below is marked accordingly.

| # | Task | Wins | Risk / notes |
|---|------|------|--------------|
| P1 | Timing instrumentation: API returns `_ms {gate, user, read, total}`; web adds transport ms; shown in the footer under `DEV_MODE` | Turns the guess above into numbers before spending effort on P4–P7 | None — read-only, additive |
| P2 | Client cache + no-blank refresh + optimistic create (Phong's #2, #4, #5) | Returning to an already-loaded list is instant. Refresh spins in the button while the old list stays on screen. After save, the record the server just returned is shown immediately | None server-side. The one true risk: showing stale cached data as if it were current — must always be labeled "as of Xm ago" or refreshed on any write |
| P3 | Boot prefetch + skeleton cards | The tab is already warm by the time it's clicked; a genuine first load reads as loading, not frozen | None |
| P4 | Pagination + slim list payload (Phong's #3). **Absorbs Milestone 3 task 3.1** | Smaller responses (20 rows, card fields only) through the two HTTP hops | Coordinate with §3.1 below so it is not rebuilt twice |
| P5 | `lineCount` column on `Orders`, maintained on every save | Removes the full `OrderLines` read on every list call | Denormalized value — needs a one-time backfill for orders created before this lands |
| P6 | Memoize the spreadsheet handle + a per-execution read cache in `SheetsRepo.gs` | Removes duplicate opens/reads inside one request (e.g. `updateOrder` reads `OrderLines` more than once) | Highest bug risk here — a cache that outlives one execution, or isn't invalidated on write within it, can serve stale rows. Needs its own offline tests before anything else touches it |
| P7 | Server-side cache keyed by an `ordersVersion` stamp (Phong's #2, server half) | A page served from `CacheService` skips the sheet read entirely | Any write bumps the version so every cached page invalidates at once; only helps between writes, not during a burst of them |

P1's numbers decide whether P4–P7 are worth doing at all, or whether P2+P3 already
make the app feel fixed.

---

## Milestone 3 — List, filter, search, status

Not started. Split now so it can be worked one task per conversation. Order
matters: each task builds on the one above it and is testable on its own.

| # | Task | Scope | How Phong verifies it | Status |
|---|------|-------|----------------------|--------|
| 3.1 | Server-side pagination | **Absorbed into Milestone 2.5 task P4** — see above. Do not build this separately; P4 covers `listOrders` paging, and 3.1 is done when P4 is | 30+ orders exist; the list loads a page at a time and the button fetches the next | ☐ → tracked as P4 |
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
