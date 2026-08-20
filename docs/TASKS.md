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
| P1 | Timing instrumentation: API returns `_ms {gate, user, read, total}`; web adds transport ms; shown in the footer under `DEV_MODE` | Turns the guess above into numbers before spending effort on P4–P7 | None — read-only, additive. **☑ built and verified live 2026-08-20** |
| P2 | Client cache + no-blank refresh + optimistic create (Phong's #2, #4, #5) | Returning to an already-loaded list is instant. Refresh spins in the button while the old list stays on screen. After save, the record the server just returned is shown immediately | None server-side. The one true risk: showing stale cached data as if it were current — must always be labeled "as of Xm ago" or refreshed on any write. **✎ built 2026-08-20, not yet verified live** |
| P3 | Boot prefetch + skeleton cards | The tab is already warm by the time it's clicked; a genuine first load reads as loading, not frozen | None. **✎ built 2026-08-20, not yet verified live** |
| P4 | Pagination + slim list payload (Phong's #3). **Absorbs Milestone 3 task 3.1** | Smaller responses (20 rows, card fields only) through the two HTTP hops | Coordinate with §3.1 below so it is not rebuilt twice |
| P5 | `lineCount` column on `Orders`, maintained on every save | Removes the full `OrderLines` read on every list call | Denormalized value — needs a one-time backfill for orders created before this lands |
| P6 | Memoize the spreadsheet handle + a per-execution read cache in `SheetsRepo.gs` | Removes duplicate opens/reads inside one request (e.g. `updateOrder` reads `OrderLines` more than once) | Highest bug risk here — a cache that outlives one execution, or isn't invalidated on write within it, can serve stale rows. Needs its own offline tests before anything else touches it |
| P7 | Server-side cache keyed by an `ordersVersion` stamp (Phong's #2, server half) | A page served from `CacheService` skips the sheet read entirely | Any write bumps the version so every cached page invalidates at once; only helps between writes, not during a burst of them |

P1's numbers decide whether P4–P7 are worth doing at all, or whether P2+P3 already
make the app feel fixed.

### P1 — built 2026-08-20, awaiting live check

Touched: `apps/api/Router.gs` (`doPost` times the security gate, `loadUser_`, and
the action handler, and attaches `_ms {gate, user, read, total}` to any object
response), `apps/web/ApiClient.gs` (times the whole `UrlFetchApp.fetch` call and
subtracts the API's own `total` to isolate `_ms.transport` — the WEB→API network
hop), and `apps/web/ui/App.html` (`call()` derives `_ms.script`, the
browser⇄`google.script.run` leg, and repaints a new footer pill). `Index.html`
gained the `#timing-stamp` element next to the existing build stamp.

Nothing here changes what any action returns or does — every new field is
additive on the response object, gated the same way the existing build stamp
already is (`session.build` is only non-null under `DEV_MODE`). The 108
offline assertions in `tools/offline-tests/` don't touch `Router.gs` or the web
layer at all, so they were unaffected; ran them after the edit as a sanity check
and all 108 still pass.

**How Phong verifies it:** with `DEV_MODE` on, push `apps/api` and `apps/web`
and publish new versions of both, open the app, and click into Đơn hàng. A
second pill should appear under the existing build stamp reading something like
`gate 180ms · user 210ms · đọc 640ms · mạng 900ms · script 250ms · tổng 2180ms`.
Numbers will vary — the point is that they show up at all, and that `mạng`
(the WEB→API hop) is the largest one, matching the diagram above. Once real
numbers are in hand, the next task to pick is one of P2–P7 depending on which
number actually dominates.

**Real numbers, measured live 2026-08-20:**

```
Load list:   gate 1043ms · user  240ms · đọc 2525ms · mạng 1193ms · script 902ms · tổng 5918ms
Load detail: gate  495ms · user  282ms · đọc  718ms · mạng 1082ms · script 950ms · tổng 3571ms
```

Server-side work (gate+user+đọc) is 64% of the list's total — bigger than
network and script.run combined. `đọc` on the list (2525ms) is over 3× `đọc`
on detail (718ms) even though detail touches one more sheet (Invoices) —
consistent with `countLinesByOrder_` reading all of `OrderLines` just for a
per-card count, exactly what P5 targets. `gate` itself swung from 495ms to
1043ms for the same fixed-size Security-sheet read, more consistent with
`SpreadsheetApp.openById()` cold-start variance (what P6 removes) than with
the request itself. These are real, not just a UX-perception problem — but
Phong chose to still do P2+P3 next rather than jump straight to the riskier
server-side tasks; P4/P5/P6 remain the next move once P2+P3's effect is seen.

### P2 + P3 — built 2026-08-20, awaiting live check

Both landed together in one conversation at Phong's request (normally one task
per conversation — noted here since it's a deviation from the usual rule).
Everything is confined to `apps/web/ui/ViewsOrders.html`, `App.html` and
`Styles.html`; nothing server-side changed, so no API push or
`setupMilestone2()` re-run is needed for this one.

**P2 — cache, no-blank refresh, optimistic writes** (`ViewsOrders.html`):
`state.orders` is now kept across visits instead of being thrown away on every
`showList()`. Returning to the list (e.g. "← Danh sách" from a form) paints
the cached list immediately, then fires a silent background `apiListOrders`
call to revalidate — a failure there is swallowed, since the list on screen is
still the last good one. A visible **"Làm mới"** button next to the count line
does the same fetch but spins in place and reports a failure, since that one
was asked for. Every fetch also stamps `state.ordersLoadedAt`, shown as
"cập nhật lúc HH:mm" — the staleness label the risk note in the P2 row asked
for. `save()` and `doDelete()` now write straight into the cached list
(`upsertCachedOrder` / `removeCachedOrder`) with the record the server just
returned, so the next "← Danh sách" is instant *and* already correct, not
waiting on a network round trip to see your own change. All requests share one
`loadingPromise` so a background refresh, a manual refresh and the P3 prefetch
below can never fire overlapping requests for the same data.

**P3 — boot prefetch + skeleton** (`App.html` calls `TTOrders.prefetch()` right
after `apiGetSession` succeeds, gated on `can('view_orders')`; `ViewsOrders.html`
exposes `prefetch()` and a `skeletonHtml()` used whenever there's no cache and
no fetch already in flight): the orders cache starts warming the moment the
app finishes loading, before "Đơn hàng" is ever clicked, and a genuine
cold load now shows three pulsing placeholder cards instead of a static
"Đang tải đơn hàng..." line — so the tab reads as *loading*, never *frozen*,
even before the underlying request finishes.

Verified by hand with a small Node harness that stubs `window.TT` and a fake
DOM node (not part of `tools/offline-tests/`, since that harness only loads
the server-side `.gs` files): confirmed a first render shows the skeleton, a
resolved fetch paints the real cards and drops the skeleton, returning to the
list is instant with no second skeleton, exactly one background revalidation
call fires on return, the "Làm mới" button and "cập nhật lúc" stamp render,
and — the case P3 exists for — calling `prefetch()` before the tab is ever
opened and then opening it mid-flight rides the same request instead of
firing a second one. Also re-ran the 108 offline assertions afterward; all
still pass (untouched by this task).

**How Phong verifies it live:** push `apps/web` and publish a new version (API
untouched). Open the app fresh — Đơn hàng should already feel instant the
first time it's clicked, since the boot prefetch had a head start; on a slow
connection you may briefly see three grey pulsing cards instead of "Đang tải
đơn hàng...". Open an order, hit "← Danh sách" — the list should reappear with
no loading flash at all, and shortly after, the "cập nhật lúc" time should
tick forward as the silent background refresh lands. Edit an order's customer
name, save, then go back to the list — the card should already show the new
name without waiting on a refetch. Click "Làm mới" — the button should read
"Đang làm mới…" while the old list stays fully visible, not blank. This won't
move the raw numbers above (P2/P3 are client-only) — P4/P5/P6 are what would.

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
