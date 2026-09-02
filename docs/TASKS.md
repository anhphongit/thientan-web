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

## Milestone 2 — Order CRUD ☑ done, verified live 2026-08-27

| # | Task | Status |
|---|------|--------|
| 2.0 | Blocked questions answered; `OPEN_QUESTIONS.md` / `DATA_MODEL.md` updated | ☑ |
| 2.1 | `Config.gs` headers + `setupMilestone2()` | ☑ verified live (Checklist A) |
| 2.2 | `Orders.gs` create + list/get reads | ☑ verified live (Checklist B) |
| 2.3 | Money: per-line VAT, totals, deposits | ☑ verified live (Checklist C) |
| 2.4 | Edit and delete, line reconciliation | ☑ verified live (Checklist D) |
| 2.5 | Invoices: shared invoice, missing date refused | ☑ verified live (Checklist E) |
| 2.6 | Permission scoping and price blindness | ☑ verified live (Checklist F) |
| 2.7 | Phone pass | ☑ verified live (Checklist G/H) |

**Signed off 2026-08-27.** `CHECKLIST_M2_VI.md` sections A through H are all
fully checked, including F's last box (Status field locked for a role without
`change_status`). The 2.5/2.5b/2.5c performance work and the B1–B5 permission
fixes found along the way sit on top of this CRUD layer and are also closed
out. See `MILESTONES.md`'s progress log for the sign-off entry.

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

Started 2026-08-31 with task 3.2. Split so it can be worked one task per
conversation. Order matters: each task builds on the one above it and is
testable on its own.

**3.2 built 2026-08-31.** `actionListOrders_` (`apps/api/Orders.gs`) now
accepts `month` ('YYYY-MM') or `dateFrom`/`dateTo` ('YYYY-MM-DD', inclusive
both ends) via `orderDateFilter_`/`matchesDateFilter_`; applied AFTER
`scopeToUser_` (a filter can never surface another user's orders) and BEFORE
pagination (`total`/`hasMore` describe the filtered set). Cache key
(`listCacheKey_`) now folds the filter in so filtered and unfiltered pages
never collide. Client: `apps/web/ui/ViewsOrders.html` gets a `<input
type="month">` + "Lọc"/"Xóa lọc" filter bar above the list
(`filterBarHtml`/`setMonthFilter`); changing the filter is a deliberate
action (like "Làm mới"), not filtered live on every keystroke, and drops the
list cache so a stale unfiltered page can never show under the new filter —
a `filtersAtRequest` guard in `fetchOrders()` also discards the response of a
now-superseded in-flight request, since `UrlFetchApp` cannot be cancelled
mid-flight. 23 offline assertions in `tools/offline-tests/orders-filter.test.js`.

UI follow-up same day, Phong's call: a native `<input type="month">` pops a
full day-grid calendar on most browsers/phones for a filter that is only
ever a month — replaced with two plain dropdowns (Tháng/Năm).

**3.3 built 2026-08-31.** Customer + status + created-by filters, combinable
with 3.2's date filter (all AND together). `normalizeFilter_` trims/
lowercases customer and createdBy (status keeps case — the fixed status keys
are already lowercase_with_underscores). `createdBy` is silently ignored for
a caller without `view_all_orders` — `scopeToUser_` already narrowed them to
their own rows, so honouring a different value there would be a "show me
someone else's order" bug, not a filter. New `actionListOrderCreators_`
(gated the same way) feeds the created-by dropdown from distinct `createdBy`
values actually present in `Orders` — no `Users`-sheet read, same
self-filling reasoning as `Config.customerList` (Q6). `listCacheKey_` folds
in every filter (`safeToken_` sanitizes free text for the key). Client:
`filterBarHtml()` now draws customer/status dropdowns plus a created-by
dropdown (view_all_orders only, lazily fetched via `ensureCreatorsLoaded()`,
degrades to a disabled placeholder while loading rather than shifting
layout once it arrives); `applyFilters()`/`clearFilters()` replace the old
month-only `setMonthFilter()`. 13 more offline assertions (36 total in
`orders-filter.test.js`); all three prior suites (54+116+87) still pass
unchanged — 293 total. `BUILD` is `api-2026-08-31-filters33` /
`web-2026-08-31-filters33`. Not yet verified live — deploy **api** first
(new version), then **web**, then walk each filter alone, two together, and
all four together, on both an admin and a restricted staff account (staff
should never see the created-by dropdown at all, and combining filters
should read as AND, e.g. "confirmed AND this customer" returns only orders
matching both).

**Bug found live 2026-08-31, fixed same day:** the created-by dropdown was stuck on "Đang tải người tạo…" forever for an admin account. Root cause: `apps/web/ui/ViewsOrders.html` calls `T.call('apiListOrderCreators', {})`, which is `google.script.run.apiListOrderCreators` — a function that has to exist in the **web** Apps Script project (`apps/web/Main.gs`), separate from the API action (`Router.gs`) it forwards to. The API side (`actionListOrderCreators_`) was added and offline-tested, but the web-side pass-through was never written, so `google.script.run` failed with "function not found" and the promise never resolved. Fixed by adding `apiListOrderCreators()` to `Main.gs` alongside the other `apiList*`/`apiGet*` pass-throughs. The offline test harness only loads `apps/api/*.gs` (Config/Permissions/Orders), so it cannot catch a missing web-side wrapper — this class of bug only shows up live. `BUILD` is `web-2026-08-31-filters33-fix`.

**3.4 built 2026-08-31.** Free-text search (`q`), combinable (AND) with every
3.2/3.3 filter and still ownership-scoped. `matchesSearch_` checks `orderId`/
`po`/`customer` directly; `searchLineOrderIds_` does one full `OrderLines`
read (only when `q` is set) to also match line `description`, same "cheap at
this volume" call as D4. Client: a search box in the filter bar, applied on
"Lọc" click or Enter. 21 more offline assertions (52 total in
`orders-filter.test.js`, 309 across all suites). `BUILD` is
`api-2026-08-31-search34` / `web-2026-08-31-search34`.

**Milestone 3's list/filter/search/status slice (3.1-3.4) is now feature-complete
and unverified live.** Recommend one live pass covering all of 3.1-3.4 together
before starting 3.5 (`changeStatus` + `StatusHistory`), since 3.5 is a different
kind of change (a write, not a read) and any filter/search bug found live is
cheaper to fix before more surface area lands on top of it.

**Filter bar UI redesigned 2026-08-31, Phong's call.** The inline row of
6+ controls (search + month/year + customer + status + created-by) wrapped
messily on mobile. Sketched 4 layout options as an artifact
(collapsible panel / bottom-sheet modal / chips+modal / tidied inline row);
Phong picked "Bảng lọc thu gọn" + "Thẻ đang áp dụng": search box + a "Bộ lọc"
toggle button (dot when a filter is active) always visible; the dropdowns
live in a panel that only shows when toggled open (`state.filterPanelOpen`,
UI-only, never triggers a fetch by itself); once applied, each filter shows
as a removable chip under the search box (`chipsHtml()`) — clearing just one
filter no longer means reopening the panel to find its dropdown. No API
change. `BUILD` is `web-2026-08-31-filterui`.

**Bug found live 2026-08-31, fixed same day: search was effectively unusable.**
Three compounding problems, all client-only:
1. The "Áp dụng" button that Enter tried to click only exists in the DOM
   while the filter panel is open — with the panel closed (the default),
   Enter did nothing, and there was no other way to submit a search at all.
2. Toggling the filter panel (and any other repaint — "Làm mới", a
   background refresh) fully re-rendered the search input's `value` from
   `state.filters.q`, which only updates when a search is actually applied
   — so anything typed but not yet submitted was silently wiped by an
   unrelated repaint (e.g. just opening the filter panel).
3. There was no dedicated way to trigger a search independent of the
   dropdown panel's "Áp dụng".

Fixed by splitting the search box's live text into its own
`state.searchDraft` (updated on every keystroke via `onInput`, rendered as
the input's value — never `state.filters.q` directly) from the last
actually-searched value in `state.filters.q`. A new `submitSearch()` is the
one place that commits a search: wired to Enter, to a new always-visible 🔍
button next to the search box (`data-act="submit-search"`), and reused by
the panel's "Áp dụng" (which now also syncs `searchDraft`). Toggling the
panel now only ever flips `state.filterPanelOpen` — it never touches
`state.filters` or `state.searchDraft`, so it can no longer wipe anything.
`BUILD` is `web-2026-08-31-searchfix`.

**Search behavior refined 2026-08-31, Phong's exact spec:** the 🔍 button
now replaces the placeholder emoji with an inline SVG magnifier
(`SEARCH_ICON_SVG`, `currentColor` so `.btn-icon`'s CSS drives brand/muted
coloring — matches the app's existing bordered-icon-button look, no more
mismatched emoji). Behavior, via `canSubmitSearch()` (empty draft, or draft
equal to the already-applied `state.filters.q`, ⇒ disabled; anything else
⇒ enabled), checked on every keystroke (toggles the button directly, NOT
via a full repaint — a repaint mid-typing would tear down the input and
drop focus/cursor position) and re-checked before Enter or the button
actually act: 2a (typing enables, clearing disables), 2b (re-searching the
same committed query stays disabled), 2c (click while enabled executes the
search and adds its chip). 2d — the dropdown panel's "Áp dụng" no longer
touches the search box at all; a query typed but never submitted is
discarded (reverted to the last actually-applied query) the moment "Áp
dụng" is clicked, not silently applied alongside the dropdown filters.
`BUILD` is `web-2026-08-31-searchfix2`.

**Bug found live 2026-08-31, fixed same day: search button did nothing when
clicked.** `applyFilters()`'s own "did anything actually change?" check
(`changed = ['month','customer','status','createdBy'].some(...)`) never
listed `'q'` — so any call that only changed the search query (`submitSearch()`,
and the search chip's "✕") saw `changed === false` and returned immediately,
before ever updating `state.filters` or re-fetching. The button was correctly
enabled and correctly clickable; the click handler itself silently no-op'd
one line deeper. Same gap existed in `clearFilters()` — "Xóa lọc" cleared
every dropdown but left the search query still actually applied even though
the UI looked cleared. Fixed by adding `'q'` to both. `BUILD` is
`web-2026-08-31-searchfix3`.

**Security bug found live 2026-08-31, fixed same day: search/filters leaked
fields outside `visible_fields`.** Phong caught it directly: a role blind to
`po` could type a PO number into search and get a matching order back —
proving that PO exists and which order/customer it belongs to — even though
`po` never renders on their card (`filterVisibleFields_` strips it from the
response, but only after the search/filter had already used it to decide
which rows to return in the first place). Same gap in the 3.3 customer/status
dropdown filters: filtering by a customer or status a role can't see still
worked, silently narrowing the list by a field that's invisible to them.

Fixed in `actionListOrders_`: `customerFilter`/`statusFilter` are only
honoured when `fieldVisible_(user, 'customer'/'status')` — otherwise ignored,
same pattern `createdBy` already used for `view_all_orders`. `matchesSearch_`
now takes `user` and only checks `po`/`customer` when visible; line
`description` search (`searchLineOrderIds_`) is skipped entirely (no
`OrderLines` read at all) unless `description` is visible. `orderId` is
always checked — it's always returned regardless of `visible_fields` (see
`listCardView_`'s "always identifiable"), so it leaks nothing new. Client:
the customer/status dropdowns are no longer rendered at all for a role that
can't see those fields (`fieldAllowed_`), instead of being drawn but
silently doing nothing server-side. 8 new offline assertions (60 total in
`orders-filter.test.js`, 317 across all suites) — including a role blind to
po/customer/status/description confirming zero leakage while orderId search
and the admin (`*`) path both still work exactly as before. `BUILD` is
`api-2026-08-31-searchleak` / `web-2026-08-31-searchleak`.

| # | Task | Scope | How Phong verifies it | Status |
|---|------|-------|----------------------|--------|
| 3.1 | Server-side pagination | Absorbed into Milestone 2.5 task P4 | Done via P4 | ☑ |
| 3.2 | Month / date-range filter | One filter, server-side, permission-scoped | Pick a month → only that month's orders; a staff account still sees only their own | ☑ |
| 3.3 | Customer + status + created-by filters | Three dropdowns, combinable with 3.2 | Each alone, then two together, then all | ☑ |
| 3.4 | Free-text search | Across `orderId`, `po`, `customer`, line `description` | Search a PO fragment, a customer, a word from a description | ☑ |
| 3.5 | `changeStatus` action + `StatusHistory` | One-purpose action, `change_status` enforced, history appended with who and when | Change a status from the list; `StatusHistory` gains a row; an account without the permission is refused | ☑ |
| 3.6 | Admin approve | `approve_order`, sets `approvedBy` / `approvedAt` | Admin approves; a staff account cannot | ☐ |
| 3.7 | List UX on a phone | Filter bar collapses, cards stay readable, filters survive going into an order and back | Real phone, with filters applied | ☐ |

---

## Milestone 3, task 3.5 — quick status change from the list

**Built 2026-08-31.** `actionChangeStatus_` (`apps/api/Orders.gs`) is a new,
deliberately narrow action — separate from `actionUpdateOrder_`, which needs
the whole order + all its lines and re-validates everything. This one takes
just `{orderId, status, note}`: `requirePermission_('change_status')` →
`requireOwnershipOrAll_` → validates the status against `Config.statusList`
(`isKnownStatus_`) → re-reads the row INSIDE the lock and re-compares before
writing (not just before acquiring the lock — someone else's change could
have landed in between) → updates `Orders.status`/`updatedBy`/`updatedAt` →
`appendStatusHistory_` with who and when. Setting the same status is a no-op:
no history row, no version bump — a no-op "confirmed → confirmed" entry
would be noise, not an audit trail. `listCardView_` now also returns
`canChangeStatus` (same `mayAct_` permission+ownership check as `canEdit`/
`canDelete`) so the list knows whether to draw the control at all.

Client (first pass): each order card was an outer, non-interactive
`.order-card` div around an inner `.oc-open` `<button>` (the navigable "open
this order" area) plus a sibling `.oc-quick-status` row with a status
`<select>` and a "Đổi trạng thái" label underneath, separated by a dashed
top border.

28 new offline assertions in `tools/offline-tests/orders-changestatus.test.js`
covering the happy path, permission + ownership enforcement, unknown/missing
status, the same-status no-op, `canChangeStatus` on list cards
(ownership-aware), and an optional note. `BUILD` is
`api-2026-08-31-changestatus`; the API side of 3.5 has not changed since.

**Redesigned 2026-08-31 (style E1).** Feedback: the dashed-row control read
as too heavy for "just a quick action" — a whole extra section on every
card, with its own label and border, for something meant to be a fast flip.
Went through three rounds of option comparisons (layout concepts A/B/C →
pill-style variants B1–B4 → icon variants E1–E3) before landing on E1: the
existing status pill becomes the control itself, no new row added at all.

A trailing pencil/edit icon (`PENCIL_ICON_SVG`, `apps/web/ui/ViewsOrders.html`)
is appended after the pill's label text, colored via `currentColor` so it
always matches that pill's own status color (same technique as
`SEARCH_ICON_SVG`). A transparent `<select>` is absolutely positioned over
the pill (`.pill-wrap` / `.pill-select` in `apps/web/ui/Styles.html`) so the
whole pill is the click/tap target. The pencil and the overlaid select are
only added when `o.canChangeStatus` is true — otherwise the pill renders
exactly as before, plain and non-interactive.

Structural knock-on: since a `<select>` still can't nest inside a `<button>`,
and the pill (now interactive) sits in the same top row as the order id, the
single `.oc-open` button was split into two siblings — `.oc-open-id` (id +
line-count badge) and `.oc-open-rest` (customer/meta/money) — with the pill
as an independent element between them in `.oc-top`. Both buttons still
carry `data-open="<orderId>"` and open the same order detail; only the pill
itself is exempted from "open this order" and instead changes the status.
The underlying `change` listener (`onChange` → `changeStatusQuick`) and
`apiChangeStatus` pass-through are unchanged from the first pass.

`tools/offline-tests/orders-ui.test.js`'s card-smoke assertion was updated
to expect two `data-open` buttons per card instead of one (style E1's two
navigable regions), not a behavior change — 345 assertions across all
suites, all passing. `BUILD` is `web-2026-08-31-statuspill-e1` (API BUILD
unchanged — this redesign is client-only). Not yet verified live.

**Loading/lock state added 2026-08-31.** Feedback: while the status change
round trip is in flight, the user should be told it's happening and should
not be able to open that order's detail until the change is confirmed —
otherwise they could act on stale status data or fire a second change before
the first lands. `changeStatusQuick` is no longer optimistic: it puts the
orderId into a new `state.statusUpdatingIds` set and calls `paintList()`
immediately (before the request even goes out), then removes it and repaints
again on either success or failure — `state.orders` itself is only mutated
after the server confirms. While an orderId is in that set,
`statusQuickPillHtml` renders a pending pill ("Đang cập nhật…" + a small
spinner, no pencil, no overlaid `<select>`, so a second change can't be
queued), and `orderCardHtml` renders both of that card's `.oc-open` buttons
`disabled` with a dimmed style. `onClick`'s `data-open` handler also checks
`state.statusUpdatingIds` directly, so a click that slips in before a
repaint lands is still blocked. `BUILD` is now
`web-2026-08-31-statuspill-pending`; no API or test changes — this is
client-only and the server already re-validates change_status + ownership
on every call regardless. 345 assertions, all still passing.

**Bug fix, 2026-08-31 — stale detail cache after a quick status change.**
`orderCache` (`apps/web/ui/ViewsOrders.html`, keyed by orderId — the detail
view's own cache, separate from `state.orders`/the list) was never touched
by `changeStatusQuick`. So: open an order's detail once (caches it), go back
to the list, quick-change its status from the pill — the list card updates,
but reopening that order's detail still showed the pre-change status until
`DETAIL_CACHE_TTL_MS` expired, because `openForm` paints straight from
`orderCache[orderId]` when an entry exists and is fresh. Fixed by deleting
`orderCache[orderId]` in `changeStatusQuick`'s success handler, right where
`state.orders` is updated — not patched in place, since the cached detail
also carries `StatusHistory` and server-computed flags
(`canEdit`/`canDelete`/`canChangeStatus`) this response doesn't return, so
the next open just re-fetches cleanly instead of guessing at a merge.
`BUILD` is now `web-2026-08-31-detailcache-fix`. No server or test changes;
345 assertions, all still passing.

## Milestones 4–6

Split them when they start, not before — the split should reflect what M2 and M3
actually taught us. Scope stays in `MILESTONES.md` until then.

One thing already decided for M4 (Q2, answered 2026-08-20): revenue is shown
**both** ex-VAT and inc-VAT, and the month basis is a **toggle** between order date
and invoice date. That is two tasks, not one.
