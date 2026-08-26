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
| P2 | Client cache + no-blank refresh + optimistic create (Phong's #2, #4, #5) | Returning to an already-loaded list is instant. Refresh spins in the button while the old list stays on screen. After save, the record the server just returned is shown immediately | None server-side. The one true risk: showing stale cached data as if it were current — must always be labeled "as of Xm ago" or refreshed on any write. **☑ built and verified live 2026-08-26** |
| P3 | Boot prefetch + skeleton cards | The tab is already warm by the time it's clicked; a genuine first load reads as loading, not frozen | None. **☑ built and verified live 2026-08-26** |
| P4 | Pagination + slim list payload (Phong's #3). **Absorbs Milestone 3 task 3.1** | Smaller responses (20 rows, card fields only) through the two HTTP hops | Coordinate with §3.1 below so it is not rebuilt twice. **☑ built and verified live 2026-08-26** |
| P5 | `lineCount` column on `Orders`, maintained on every save | Removes the full `OrderLines` read on every list call | Denormalized value — needs a one-time backfill for orders created before this lands. **☑ built and verified live 2026-08-26 (migration run confirmed)** |
| P6 | Memoize the spreadsheet handle + a per-execution read cache in `SheetsRepo.gs` | Removes duplicate opens/reads inside one request (e.g. `updateOrder` reads `OrderLines` more than once) | Highest bug risk here — a cache that outlives one execution, or isn't invalidated on write within it, can serve stale rows. Needs its own offline tests before anything else touches it. **✎ built 2026-08-26 (in p6-changes/), offline-tested, awaiting push + live verification** |
| P7 | Server-side cache keyed by an `ordersVersion` stamp (Phong's #2, server half) | A page served from `CacheService` skips the sheet read entirely | Any write bumps the version so every cached page invalidates at once; only helps between writes, not during a burst of them. **✎ built 2026-08-26 (in p7-changes/), awaiting push + live verification** |

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

### P2 + P3 — built 2026-08-20, verified live 2026-08-26

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

Verified by hand with a small throwaway Node harness that stubs `window.TT`
and a fake DOM node: confirmed a first render shows the skeleton, a resolved
fetch paints the real cards and drops the skeleton, returning to the list is
instant with no second skeleton, exactly one background revalidation call
fires on return, the "Làm mới" button and "cập nhật lúc" stamp render, and —
the case P3 exists for — calling `prefetch()` before the tab is ever opened
and then opening it mid-flight rides the same request instead of firing a
second one.

**Correction, made while starting P4:** the note above originally also
claimed "re-ran the 108 offline assertions afterward; all still pass" —
that was wrong, and said so without actually running them.
`tools/offline-tests/orders-ui.test.js` *does* load this file (it is not
server-only, unlike the other two test files); actually running it turned up
one real failure: it still asserted the old `"Đang tải đơn hàng..."` text
that P3 deliberately replaced with the skeleton. Fixed the assertion to check
for the skeleton markup instead — same intent (render() reached a paint
without throwing when `TT` arrives after load, the 2026-08-20 bug this test
exists to catch), updated for what P3 actually paints now. All 108 pass for
real as of this fix.

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

### P4 — built 2026-08-20, verified live 2026-08-26 (also closes 3.1)

This one DOES move the raw `_ms` numbers from P1, on the server side. Touched
`apps/api/Config.gs` (bumped `BUILD` to `api-2026-08-20-2`; added
`LIST_PAGE_SIZE_DEFAULT` = 20, `LIST_PAGE_SIZE_MAX` = 100, and
`LIST_CARD_FIELDS` — the Orders columns the list card actually draws: `po`,
`customer`, `orderDate`, `status`, `totalExVat`, `totalIncVat`),
`apps/api/Orders.gs` (`actionListOrders_` now takes `page`/`pageSize` instead
of `limit`, slices the sorted, scoped set instead of returning up to 500 rows,
and returns `page`/`pageSize`/`hasMore` alongside `orders`/`total`/`shown`;
each card goes through the new `listCardView_`, which intersects
`LIST_CARD_FIELDS` with the caller's `visible_fields` — same money-blindness
rule as everywhere else, just applied to a narrower base set), and
`apps/web/ui/ViewsOrders.html` + `Styles.html` (client now asks for
`{ page, pageSize }`, appends further pages via a new "Xem thêm" button
instead of ever asking for everything at once).

`actionGetOrder_` / `buildOrderResponse_` (the detail screen) are untouched —
they still return every field the caller may see. The slimming is
list-only, on purpose: `createdBy`/`createdAt`/`updatedBy`/`updatedAt`/
`approvedBy`/`approvedAt`/`poNote`/`statusNote`/`supplierName`/
`customerDeposit`/`supplierPaid` are all real data the list card never draws.

**A deliberate interaction with P2's cache**, worth flagging since it's easy
to miss: a background silent refresh (P2) always re-fetches page 1 only. If
`showList()` silently replaced the cache while the user had paged further
with "Xem thêm", it would quietly truncate pages they deliberately loaded —
so `silentRefresh()` now skips itself once more than one page is loaded, or
while a page is loading. The explicit "Làm mới" button still resets to page 1
unconditionally, on the reasoning that a "refresh" the user clicked on purpose
resetting to the top is expected (same as most inboxes), while a background
refresh nobody asked for silently doing the same thing would not be.

**How this was verified**, since the previous entry's "ran the tests" claim
turned out to be false — actually ran everything this time, three ways:
1. `tools/offline-tests/` — server-side pagination behavior needed real
   coverage that didn't exist yet, so added it: `orders-crud.test.js` gained
   a 25-order pagination test (page 1/2, `hasMore`, default `pageSize`, the
   `LIST_PAGE_SIZE_MAX` cap actually clamping rather than merely not
   mattering), and `orders-permissions.test.js` gained a test proving an
   admin's list card omits every non-card field and a money-blind role gets
   no `totalExVat`/`totalIncVat` on the list either — while confirming detail
   is NOT slimmed the same way. `orders-ui.test.js` (the one whose stale
   assertion caused the earlier false claim) gained assertions that the
   client now requests `{ page: 1, pageSize: 20 }`, and that "Xem thêm"
   renders when the fixture says `hasMore: true`. All 147 assertions across
   the three files pass.
2. A throwaway Node harness (not committed, same approach as P2/P3's) drove
   the actual click-through: load page 1 (45 total) → "Xem thêm" shows →
   click it → page 2 appends, count reads 40/45 → leave and return to the
   list → both pages are still there, no silent collapse back to page 1, and
   no extra `apiListOrders` call fired → click "Xem thêm" again → all 45
   shown, button gone.
3. Re-ran all three real `tools/offline-tests/*.test.js` files one more time
   after the client edits landed, to catch any cross-file regression: still
   147/147.

**How Phong verifies it live:** push both `apps/api` and `apps/web` and
publish new versions of both (this is the first P-task that touches the API).
With 20+ orders in the sheet, open Đơn hàng — only the newest 20 should
appear, with a "Xem thêm" button below the last card; clicking it should load
the next 20 without losing the first 20, and the button should disappear once
everything is loaded. With `DEV_MODE` on, watch the P1 timing pill on this
screen specifically — `đọc` should drop noticeably from the 2525ms baseline
measured earlier, since the server is no longer sorting/mapping every order
in the sheet on every list call, only the current page. It will not drop to
zero: `countLinesByOrder_` still reads the entire `OrderLines` sheet on every
call regardless of page size — that is P5's job, not this one's.

**Getting 20+ orders to test the above with:** `apps/api/DevSeed.gs`
(new, 2026-08-20 — Phong asked for a way to bulk-add test data rather than
typing 30 orders by hand through the form). Select `seedTestOrders` in the
API editor's Run dropdown and press Run — no arguments needed, it defaults to
30 and goes through the real `actionCreateOrder_` path, so seeded rows behave
exactly like anything typed by hand. Every seeded row is tagged (`po` starts
with `SEED-`, customer starts with `TEST `) so `deleteSeedTestOrders` can find
and remove all of it later without needing to remember which ids a run
produced. Both functions are editor-only, added to `guardSetup_`'s block list
in `Setup.gs` alongside `setupMilestone1`/`setupMilestone2` — neither can ever
be reached over HTTP. Verified with a throwaway Node harness (same approach
as P2–P4's manual checks): seeding tags every row correctly, spreads
`orderDate` so pagination has something real to sort, accumulates cleanly
across repeated runs (ids keep incrementing), and delete removes every
seeded order plus its lines and status history, reporting "nothing to
delete" harmlessly on a second run. Not added to `tools/offline-tests/` —
it is a manual dev tool with no HTTP path, unlike everything else that
harness covers.

**Follow-up, 2026-08-20 (after P5 landed):** Phong asked for `seedTestOrders`
to be updated so `lineCount` works properly on seeded data. `Migrations.gs`'s
`migrateAddLineCount()` was split in two — a new `ensureLineCountColumn_()`
just adds the header cell if missing, and `migrateAddLineCount()` calls it
before doing its full backfill. `seedTestOrders()` now calls
`ensureLineCountColumn_()` too, so seeded orders keep their `lineCount` even
run against a sheet nobody has migrated yet — it only adds the column if
missing, it does NOT backfill pre-existing real orders (that stays
`migrateAddLineCount()`'s job, since scanning all of `OrderLines` on every
seed run would defeat the point of P5). Verified with a throwaway harness:
seeding on an un-migrated sheet adds the column and every seeded order keeps
its own 1–5 line count correctly; a pre-existing real order on that same
sheet is left untouched by the seed run (still blank) but is correctly
backfilled once `migrateAddLineCount()` actually runs afterward; and calling
`seedTestOrders` again once the column already exists does not add a
duplicate one. Re-ran the real 154-assertion suite too — unaffected, as
expected (business logic in `Orders.gs` didn't change here, only how the two
editor tools ensure the column exists).

**Follow-up, 2026-08-26 (resumable seeding):** Phong wanted `seedTestOrders`
runnable multiple times in a row to build up larger test datasets without one
very long single execution, without ever creating a duplicate `SEED-N` tag.
Added `nextSeedNumber_()`: scans the Orders sheet for the highest existing
`SEED-<n>` po tag and returns `n + 1` (or `1` if none exist yet), computed
once at the top of `seedTestOrders()` as `startSeed`, then used for every
seeded order's `po`, description text, and customer/status pick in that run
(`seedNo = startSeed + i`) in place of the old `i + 1`, which always
restarted at `SEED-1`. `orderId`/`lineId` were never at risk of duplication —
those already come from `nextOrderId_()`/`makeLineId_()` in `Orders.gs`,
which allocate off the real sheet contents regardless of who's writing —
so the only real gap was the po tag restarting, which this closes.
`deleteSeedTestOrders()` needed no change: it already matches any `SEED-`
prefix regardless of the number, so it still removes every seeded order
across every run in one call. The returned summary now reports the actual
`SEED-N` range a run covered and what number the next run will continue
from. Verified with a throwaway Node harness: two sequential
`seedTestOrders(10)` calls produce 20 orders tagged `SEED-1..SEED-20` with
no gaps or repeats, and `deleteSeedTestOrders()` still cleanly removes all
20 plus their lines. Re-ran the real 154-assertion suite afterward —
unaffected, as expected (only `DevSeed.gs` changed, not `Orders.gs`/
`Config.gs` business logic).

### P5 — built 2026-08-20, verified live 2026-08-26 (migration run confirmed)

Touched `apps/api/Config.gs` (added `'lineCount'` to `HEADERS.Orders`, bumped
`BUILD` to `api-2026-08-20-3`), `apps/api/Orders.gs` (`actionCreateOrder_` and
`actionUpdateOrder_` now write `lineCount` — line count at creation, and
`saved.length` on every edit — alongside the totals they already recompute;
`actionListOrders_` reads `num_(row.lineCount)` straight off the row instead
of calling `countLinesByOrder_()`, which is what read the entire `OrderLines`
sheet on every single list call, forever, regardless of page size), and a new
`apps/api/Migrations.gs` with `migrateAddLineCount()`.

**Why a migration file, not just the code change:** `appendRecord_` /
`updateRecord_` (`SheetsRepo.gs`) address columns by the ACTUAL header row on
the live sheet, not by the `HEADERS.Orders` array in `Config.gs`. Adding
`lineCount` to that array only affects a brand-new sheet — `setupMilestone2`
skips a sheet that already has data. The live Orders sheet (already created,
already has M2's rows) has no `lineCount` header cell at all, so until
`migrateAddLineCount()` runs once, every create/update silently drops the
`lineCount` key it tries to write (not an error — `appendRecord_`/
`updateRecord_` only ever look at keys the sheet's actual headers have), and
every list call reads it as 0. Self-correcting, not dangerous — but every
card would show "0 dòng" until the migration runs. `migrateAddLineCount()`
adds the header cell if missing, then recomputes every order's real count
from `OrderLines` (reusing `countLinesByOrder_`, kept around specifically for
this) and rewrites only the rows that don't already match — safe to re-run
any time, e.g. after restoring a backup.

`countLinesByOrder_` itself is NOT deleted: it's exactly what the migration
needs, and a reasonable thing to keep for a future "does the column still
match reality" audit. It is dead code from `actionListOrders_`'s point of
view now, on purpose.

**How this was verified:** `tools/offline-tests/` gained permanent coverage
in the served-request path — `orders-crud.test.js` checks `lineCount` is
written correctly on create (1 line, then 8) and tracks a real change across
two edits (3→3, then 3→1), and `orders-permissions.test.js` gained the
sharpest test in the set: create a 3-line order, wipe `OrderLines` entirely
behind its back, and confirm the list still reports `lineCount: 3` from the
stored column — proving the full-sheet read is actually gone, not just
faster. All 154 assertions across the three files pass. `migrateAddLineCount`
itself can't run in that harness (it calls `getSheet_`/`readHeaders_`, real
`SpreadsheetApp` calls the harness never stubs) — verified instead with a
throwaway Node harness simulating a sheet whose header row starts without
`lineCount`: confirms the pre-migration silent-drop behavior described above
actually happens, the migration adds the header and backfills exactly the
rows that need it, a second run is a genuine no-op, a new order created
after migrating gets `lineCount` written immediately with no gap, and the
function is confirmed blocked from the HTTP action registry.

**How Phong verifies it live:** push `apps/api`. **Before** creating or
editing any order on the new build — order doesn't actually matter for
correctness (everything self-heals once the migration runs), but running it
first avoids a stretch of "0 dòng" cards — open the API editor, select
`migrateAddLineCount` in the Run dropdown, press Run, and read the summary
(it should say how many orders it added the column for and backfilled).
After that, the list should show correct line counts exactly as before, and
with `DEV_MODE` on, `đọc` in the P1 timing pill should drop again — this is
the one that removes the OrderLines read from the list entirely, not just
narrows it like P4 did for Orders.

---

## Milestone 2.5b — Loading-time & race fixes
**Live verification (2026-08-26):** L1 + L2 + L3 confirmed working by Phong.
  *(raised 2026-08-26)*

Live testing after P2–P5 showed the remaining pain is **not** sheet-read cost
inside the API. It is:

1. The list API is still called every time the user opens the Order tab or
   returns from detail (`silentRefresh` always fires).
2. Rapid navigation (list ↔ detail, tab switching) lets **old** responses
   update the UI, causing flicker and wrong screens.
3. The WEB → API hop (`mạng`) is slow / intermittent under concurrency;
   reducing the number of calls is the main lever we control.

P6 (per-request sheet memo) and P7 (CacheService) do not address (1) or (2).
These tasks do. Order: **L1 → L2 → L3**.

| # | Task | Wins | Risk / notes | Status |
|---|------|------|--------------|--------|
| L1 | Real list cache with TTL — skip API when cache is still fresh | Opening Order tab / back from detail does **not** call the API if data is younger than TTL. "Làm mới" still forces a fetch. | Stale data window = TTL. Default 60s. Must still update cache on create/edit/delete. | ☑ verified live 2026-08-26 |
| L2 | Request generation / only-latest-wins | Rapid clicks cannot let an old list or detail response paint the wrong screen | Must cover both list and detail fetches. Ignore stale responses completely. | ☑ verified live 2026-08-26 |
| L3 | Reduce concurrent pressure (optional) | Fewer overlapping WEB→API calls; optional short timeout + one retry on `API_UNREACHABLE` | Only after L1+L2 are measured live. Do not add retries that multiply load. | ☑ verified live 2026-08-26 |

### L1 — Real list cache with TTL

**Rules (to implement):**
- Keep existing `state.orders` + `state.ordersLoadedAt`.
- Add `LIST_CACHE_TTL_MS = 60000` (60 seconds) at the top of the module.
- `showList()`:
  - Cache warm **and** `Date.now() - ordersLoadedAt < LIST_CACHE_TTL_MS` → paint only. **No** `silentRefresh()`, **no** API call.
  - Cache warm **and** age ≥ TTL → paint immediately, then `silentRefresh()` (current behaviour).
  - Cache empty → skeleton + fetch (current).
- "Làm mới" → always force fetch (current `manualRefresh`).
- After successful create / edit / delete → update cache from the response and set `ordersLoadedAt = Date.now()` (already partially done via upsert/remove).
- Prefetch still allowed when cache is empty.

**How Phong verifies:**
1. Open Đơn hàng, wait for list.
2. Open a detail, press ← Danh sách within 60s → list appears instantly, **no** new network call in the timing pill / no spinner.
3. Wait > 60s (or change TTL temporarily for test), go back → silent refresh runs.
4. Click "Làm mới" → always fetches.
5. Create/edit/delete an order → list reflects the change without a full reload.

**Touches only:** `apps/web/ui/ViewsOrders.html` (and optionally a one-line note in `docs/TASKS.md`). No API change.

---

### L2 — Request generation / only-latest-wins

**Rules (to implement after L1):**
- Module-level `var requestGen = 0`.
- Every list fetch and every detail fetch does `var myGen = ++requestGen` at start.
- On resolve: if `myGen !== requestGen` → discard response (do not touch `state` or DOM).
- Opening detail while a list request is in flight must not let the list response call `paintList()` or clear the detail.
- Same for the reverse.

**How Phong verifies:** Rapidly click Order tab → an order → back → another order. UI must never flash the wrong screen. No "list appears then jumps to detail" from late responses.

---

### L3 — Reduce concurrent pressure (later)

Only after L1+L2 are live and measured. Options then:
- Skip prefetch if user is already on the list.
- Explicit shorter `UrlFetchApp` timeout + single retry on `API_UNREACHABLE` with clear message.
- Do **not** add aggressive retries that increase load under congestion.

---


### L3 — Reduce concurrent pressure — built 2026-08-26

Touched: `apps/web/ApiClient.gs`, `apps/web/ui/App.html`, `apps/web/ui/ViewsOrders.html`.

1. **ApiClient** — at most **one** retry, only when:
   - `UrlFetchApp.fetch` throws, or
   - HTTP status is 5xx  
   Never retries 4xx / 405 / non-JSON (except the existing single retry inside
   `postJsonToApi_` for the `THIENTAN API` doGet body).
2. **App.html** — prefetch runs after **400ms** so it does not stack on the
   just-completed `getSession` hop.
3. **ViewsOrders** — prefetch skips when cache warm, fetch in flight, or the
   list view is already bound/open; silent/manual refresh still coalesce on
   `loadingPromise`.

**How Phong verifies:**
1. Cold open app → getSession succeeds → ~0.4s later one listOrders (not two).
2. Kill network briefly → one retry then clear Vietnamese error (not a storm).
3. Spam Order tab / Làm mới → still a single in-flight page-1 request.

---

### P7 — Server-side list cache (ordersVersion) — built 2026-08-26

Deliverable: `artifacts/p7-changes/`

Touched:
- `apps/api/Config.gs` — `CACHE.ORDERS_VERSION_KEY`, `LIST_KEY_PREFIX`, `LIST_TTL_SECONDS` (300s safety net); `BUILD = api-2026-08-26-p7`
- `apps/api/Orders.gs` — `actionListOrders_` checks CacheService before reading sheets; create / update / delete call `bumpOrdersVersion_()`; helpers `getOrdersVersion_`, `bumpOrdersVersion_`, `listCacheKey_`, `getListCache_`, `putListCache_`

Rules:
- Cache key = `orders:list:v{version}:u{email}:p{page}:s{pageSize}` (always per-user email → ownership + visible_fields stay correct).
- Uses `CacheService.getScriptCache()` only (never UserCache).
- Version bump on every successful create / update / delete. Missed bump only risks a short stale window until TTL; never a privilege leak.
- Does **not** cache `securityGate_` or `loadUser_`.
- Cache put/get failures are swallowed — list still works without the cache.

**How Phong verifies (live):**
1. Push API only → publish new version. No `setupMilestone*` needed. No web push.
2. With `DEV_MODE` on, open Đơn hàng twice in a row (within a few minutes, no writes). Second list response should show a much lower `đọc` time in the timing pill (cache hit — sheet read skipped).
3. Create or edit any order → immediately list again → must show the new data (version was bumped).
4. Second Google account (different email) must still see only its own orders (key includes email).
5. Timing: first load after a write still pays full `đọc`; subsequent loads of the same page until the next write should be cheaper on the server side.

**What this does not fix:** the WEB→API network hop (`mạng`). Client-side L1 TTL already avoids many of those calls. P7 only helps when a list request *does* reach the API and the page has not changed since the last write.

---
## Milestone 3 — List, filter, search, status

Not started. Split now so it can be worked one task per conversation. Order
matters: each task builds on the one above it and is testable on its own.

| # | Task | Scope | How Phong verifies it | Status |
|---|------|-------|----------------------|--------|
| 3.1 | Server-side pagination | **Absorbed into Milestone 2.5 task P4** — see above. Do not build this separately; P4 covers `listOrders` paging, and 3.1 is done when P4 is | 30+ orders exist; the list loads a page at a time and the button fetches the next | ☑ → done via P4, verified live 2026-08-26 |
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
