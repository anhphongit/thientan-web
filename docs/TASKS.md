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
| 3.6 | Admin approve | `approve_order`, sets `approvedBy` / `approvedAt` | Admin approves; a staff account cannot | ☑ |
| 3.7 | List UX on a phone | Filter bar collapses, cards stay readable, filters survive going into an order and back | Real phone, with filters applied | ☑ |
| 3.8 | Approve-status workflow | New `approveStatus` state machine (Draft/Wait For Approved/Approved/Rejected) gating who can edit, replacing the plain `approve_order` stamp from 3.6; behind a feature flag | Full matrix below, `CHECKLIST_M3_VI.md` §I | ☑ |

---

## Milestone 3, task 3.8 — approve-status workflow (built 2026-09-02)

**Design agreed 2026-09-02, implemented the same day** (server pass, then
client pass, per Phong's "server first" preference). Full offline suite:
404 assertions across 7 files, all green — `orders-approvestatus.test.js`
(49, server logic) and `orders-approvestatus-ui.test.js` (14, client
rendering) are new; every pre-existing file still passes unchanged.

Server-side (`apps/api`):
- `Config.gs`: `approveStatus` header on Orders, `field` header on
  StatusHistory, `can_edit_approved_order` permission key, `ALWAYS_VISIBLE_FIELDS`
  (`approveStatus`/`updatedBy`/`updatedAt`), `approvalFlowEnabled` +
  `approveStatusList` config defaults, new `MSG` entries. `BUILD`:
  `api-2026-09-02-approvestatus`.
- `Permissions.gs`: `filterVisibleFields_` now layers `ALWAYS_VISIBLE_FIELDS`
  on top of the allowlist — those fields are never excludable by a role's
  `visible_fields`.
- `Migrations.gs`: `migrateAddApproveStatus()` — adds both new columns to an
  existing sheet and backfills (`approvedBy` set → `approved`, else `draft`;
  every existing StatusHistory row → `field: 'status'`). **Not yet run
  against the live sheet — run it once before enabling the flag on a real
  deployment** (registered in `guardSetup_`'s editor-only allowlist).
- `Orders.gs`: `canEditForApproveStatus_`/`approvalFlowEnabled_`/
  `isKnownApproveStatus_` helpers; `actionUpdateOrder_` enforces the edit
  gate (checked twice — before and inside the lock) and the save-time
  draft/auto-approve transition; `actionCreateOrder_` defaults to
  `approveStatus: 'draft'`; `actionRequestApprove_`/`actionRejectOrder_` are
  new, `actionApproveOrder_` is rewritten in place (3.6's version fully
  replaced, per "Replace outright"); `appendStatusHistory_` takes a `field`
  argument; `listCardView_`/`buildOrderResponse_` expose `approveStatus`
  (always) plus `canRequestApprove`/`canApprove`/`canReject`;
  `actionListOrders_`/`listCacheKey_` gained the `approveStatus` filter.
- `Router.gs`: registers `requestApprove`/`rejectOrder`, keeps `approveOrder`
  pointed at the rewritten handler.

Client-side (`apps/web`):
- `Main.gs`: thin pass-throughs `apiRequestApprove`/`apiRejectOrder` added;
  `apiApproveOrder` kept, now calls the rewritten server action.
- `App.html`: `T.confirm()` gained an optional `noteField` option
  ({label, placeholder}) — when given, the promise resolves `{ok, note}`
  instead of a plain boolean (every existing caller that omits it is
  unaffected). Used by the reject flow's optional note.
- `ViewsOrders.html`: approve-status pill (own `approve-status-pill--*`
  classes, not reusing business-status classes — `status-pill--cancelled`'s
  strikethrough would wrongly bleed into "rejected") shown on every list
  card and in the detail view, always, once the flag is on; a
  "Cập nhật lần cuối bởi …" line in the detail view (independent of the
  flag — plain audit info); "Gửi duyệt"/"Duyệt"/"Từ chối" buttons driven by
  `canRequestApprove`/`canApprove`/`canReject`; the auto-approve-vs-draft
  confirm prompt on every save by an `approve_order` holder (`confirmApprove`
  in the payload); an approve-status filter dropdown, combining AND with
  every other filter. The 3.6 `approvedNoteHtml()`/"Đã duyệt bởi …" block
  and its `state.order.approvedBy`/`approvedAt` wiring are fully removed
  (replaced outright).
- **Fixed a gap inherited from 3.6**: `actionApproveOrder_`/
  `actionRejectOrder_` only require `approve_order`, not `edit_order`, but
  the old `actionsHtml()` hid the whole action row (including the approve
  button) whenever the server said `canEdit: false`. A user who could
  approve/reject but not edit would never have seen the button. Fixed by
  drawing request-approve/approve/reject independent of the read-only gate;
  save/Huỷ/delete stay gated on it since those really do need `canEdit`/
  `canDelete`. Covered by `orders-approvestatus-ui.test.js`'s "read-only
  order still shows Duyệt/Từ chối button" assertions.
- `Styles.html`: `.approve-status-pill--*` palette, `.oc-approve-row`,
  `.approve-status-banner`/`.updated-note` (replacing `.approved-note`),
  `.confirm-note-field` for the reject textarea. `BUILD`:
  `web-2026-09-02-approvestatus`.

Docs: `docs/PERMISSIONS.md` gained the `can_edit_approved_order` row, an
updated preset matrix (off for every preset — an admin opts a role in
explicitly), and a §4 rule 8 documenting the edit-gating matrix.

Still pending before turning the flag on for real users:
- Run `migrateAddApproveStatus()` on the live sheet once (see Migrations.gs
  doc comment for the exact steps).
- Walk `CHECKLIST_M3_VI.md` §I on a real deployment with the flag on.
- Deploy order as always: push+publish `apps/api` first, then `apps/web`.

### Revision 2026-09-03 — self-approver flow + UI placement

Two rounds of feedback from Phong after seeing 3.8 live, both implemented
the same day. Full offline suite now **456 assertions across 7 files**, all
green (`orders-approvestatus.test.js` 84, `orders-approvestatus-ui.test.js`
31).

**A. Approve-status marker moved next to the order id** (UI only, no logic
change). The 3.8 pill sat on its own row under the id and read as clutter.
Replaced with a fused id+status component picked from four rounds of
mockups ("Option N"): the order id and a small bordered status half sit
flush against each other as one object, each with its own border.
- `Styles.html`: `.oc-id-fused` + `.oc-id-fused--*` added, `.oc-approve-row`
  removed. `.approve-status-pill--*` is kept — it still styles the labelled
  badge in the detail banner.
- `ViewsOrders.html`: `APPROVE_STATUS_ICON` (pencil / hourglass / check /
  cross — shape, not just colour, same colour-blind reasoning as the
  business-status dot) and `fusedOrderIdHtml()`; used by `orderCardHtml()`
  and by the detail title in `paintForm()`.
- Per Phong's spec: **list cards show colour + icon only** (the label lives
  in `title`/`aria-label`, not as visible text), **the detail view keeps the
  full text label** — supplied by the existing `approveStatusBannerHtml()`
  pill below the title, not by the title marker.

**B. Self-approver flow** (points 1-5 of Phong's 2026-09-03 message). A user
holding BOTH `edit_order` and `approve_order` writes and signs off their own
work, so the request-approval hop is busywork for them.
- `Orders.gs`: `isSelfApprover_()` (both permissions, ownership layered on
  via `mayAct_` as everywhere else) and `approveActionFlags_()` — the four
  button flags now computed in ONE place, because `listCardView_` and
  `buildOrderResponse_` had drifted into duplicate copies of the same rules.
- Point 1 — `actionCreateOrder_` now honours `payload.confirmApprove` exactly
  as `actionUpdateOrder_` does, so an approver can create an
  already-approved order in one step. Writes an `''` → `approved`
  StatusHistory row when it fires; a plain draft create still writes none.
- Point 2 — `canRequestApprove` is always false for a self-approver.
- Points 3/4/5 — a self-approver may approve from any status except
  `approved`, reject from any except `rejected`, and send back to `draft`
  from any except `draft`. New action `actionSetDraftOrder_` +
  `setDraftOrder` route + `apiSetDraftOrder` pass-through; new `canSetDraft`
  flag and "Về Nháp" button (plain `.btn` — reopening an order is neither an
  approval nor a refusal). No note field on it, unlike reject.
- **A pure approver (`approve_order` WITHOUT `edit_order`) keeps the original
  wait_approval-only rule** — Phong's explicit answer. Widening it would let
  a review-only account push an order nobody ever submitted straight to
  approved, which is the exact control `wait_approval` exists to enforce.
- `ViewsOrders.html`: `localApproveFlags()` mirrors `approveActionFlags_()`
  for the local repaint right after an action lands (the old hand-rolled
  three-line patch encoded the pre-revision rules); the save prompt now
  fires on create too, with create-specific wording.
- New `MSG` entries for the no-op transitions
  (`APPROVE_STATUS_ALREADY_APPROVED`/`_REJECTED`/`_DRAFT`) and
  `APPROVE_STATUS_SET_DRAFT_DENIED`.

### Why this replaces 3.6

3.6 added `approve_order` as a one-shot stamp (`approvedBy`/`approvedAt`)
with no effect on who could edit an order. Phong's review: that has no
teeth — an order can be approved and then silently edited by anyone with
`edit_order`, which defeats the point of an approval. 3.8 replaces it with
a real state machine that actually gates editing, and the standalone
"Duyệt đơn hàng" button/action from 3.6 goes away entirely (not kept
alongside — confirmed explicitly, see decision log below).

### Data model

- New `Orders` column `approveStatus`: `draft` | `wait_approval` | `approved`
  | `rejected`. Defaults to `draft` on create. **Always visible** to every
  role — outside `visible_fields` gating entirely, unlike money fields — so
  every list card and detail view shows it (point 2 of the review).
- `approvedBy`/`approvedAt` columns and `actionApproveOrder_` are retired.
  Who/when of the most recent approval is read back from the history trail
  below instead of a denormalized pair of columns.
- `StatusHistory` gains a `field` column: `'status'` (the existing business
  status) or `'approveStatus'` (new). Both kinds of transition share the
  same sheet, the same `appendStatusHistory_`-style append function, and
  the same history UI — reusing the row shape (`oldStatus`/`newStatus`/
  `note`/`changedBy`/`changedAt`) rather than adding a second sheet.
- Order detail shows "Cập nhật lần cuối bởi `updatedBy` · `updatedAt`"
  (point 4) — both columns already exist on every order today, this is
  purely a display addition.
- New `Config` sheet flag, e.g. `approvalFlowEnabled` (point 11), read via
  `readPublicConfig_()`. OFF today (this task hasn't shipped); once ON,
  every rule below applies. Turning it back OFF only stops enforcing/
  showing `approveStatus` — existing values already written to the column
  stay in the sheet untouched and reappear if the flag is turned back on
  (explicit decision, see log).

### Permissions

- `approve_order` (existing key, kept — Phong's explicit naming choice,
  not renamed to `can_approve`): may approve or reject a `wait_approval`
  order, and gets the auto-approve-on-save behavior below.
- `can_edit_approved_order` (new key): may edit a `wait_approval` or
  `approved` order's contents WITHOUT approve/reject rights. Editing this
  way always drops the order back to `draft` (see Save behavior).

### Edit-gating (server-enforced in `actionUpdateOrder_`, mirrored client-side
for UI only — the client-side check is cosmetic, same as every other
permission in this app)

Only in effect when `approvalFlowEnabled` is true. When false: today's
rule stands unchanged (`edit_order` + ownership, no `approveStatus` check
at all).

| `approveStatus` | Who may edit |
|---|---|
| `draft` | `edit_order` (+ ownership, same as today) |
| `rejected` | `edit_order` (+ ownership, same as today) |
| `wait_approval` | `edit_order` AND (`approve_order` OR `can_edit_approved_order`) |
| `approved` | `edit_order` AND (`approve_order` OR `can_edit_approved_order`) |

(`wait_approval` and `approved` ended up with the identical gate — Phong's
final call after reviewing the first draft, which had `approved` requiring
`approve_order` alone; widened to match `wait_approval`'s rule instead.)

### Save behavior

- Every save defaults `approveStatus` to `draft` (point 8) — the baseline
  for anyone without `approve_order`, and for a `can_edit_approved_order`
  edit specifically (explicit: "when edit by can_edit_approve, approve
  status will go to draft").
- Exception: a saving user who HAS `approve_order` gets a confirm popup on
  **every** save (not just saves of `wait_approval`/`approved` orders) —
  "Duyệt luôn đơn này?" Confirm → saved as `approved` (auto-approve).
  Cancel/dismiss → saved as `draft`, and the popup explicitly says that's
  what will happen before the user chooses (point 9's "if user not
  confirm, show alert that it will become draft").

### Request-approval action (point 5)

- A separate "Gửi duyệt" button next to Save, visible only on a `draft` or
  `rejected` order, requiring `edit_order` (the same population that can
  edit a draft at all). Moves `draft`/`rejected` → `wait_approval`. Not
  folded into Save itself — kept as an explicit, deliberate step once the
  editor is done (Phong's answer: "separate explicit button").

### Approve / reject actions (only reachable from `wait_approval`)

- **Approve**: `approve_order` only → `approved`.
- **Reject**: `approve_order` only (not `can_edit_approved_order` — Phong's
  answer: symmetric with approve) → `rejected`, with an **optional** note
  stored on the `StatusHistory` row (Phong's answer: optional, not
  required, not omitted).
- Both go through the existing `T.confirm()` popup (built for 3.6, now
  reused rather than orphaned) with the order-summary card.

### Filter (point 10)

- A new `approveStatus` dropdown in the filter bar, combinable (AND) with
  the existing month/customer/status/createdBy/search filters. Since
  `approveStatus` is always visible (point 2), this filter is available to
  every role — not gated by `visible_fields` the way the 3.3 customer/
  status filters are. Still gated by the feature flag: the dropdown does
  not render at all when `approvalFlowEnabled` is false.

### Feature flag (point 11)

`approvalFlowEnabled` (or similar `Config` key) wraps every rule above.
OFF: no `approveStatus` column shown anywhere, no approve/reject/
request-approve controls, no filter dropdown, edit-gating is exactly
today's `edit_order` + ownership check — i.e. the app behaves exactly as
it does right now, task 3.6 fully reverted in effect (though its code is
being replaced, not kept dormant). ON: every rule above applies. This
roughly doubles the paths through `actionUpdateOrder_`'s authorization
logic (flag on vs. off) and needs offline test coverage for both — flagged
here so that cost is visible up front, not discovered mid-implementation.

### Decision log (from the review conversation)

- Auto-approve prompt (point 9) fires on **every** save by an
  `approve_order` user, not only saves of `wait_approval`/`approved`
  orders.
- 3.6's `approvedBy`/`approvedAt` and `actionApproveOrder_` are replaced
  outright, not kept alongside `approveStatus`.
- The transition history reuses `StatusHistory` with a new `field` column,
  rather than a separate `ApprovalHistory` sheet.
- Turning the flag off only hides/stops enforcing `approveStatus`; existing
  data on the column is preserved, not cleared.
- "Gửi duyệt" is a separate button from Save, not a save-time prompt.
- Reject requires `approve_order` only, with an optional note.
- `approved` orders are editable by `edit_order` AND (`approve_order` OR
  `can_edit_approved_order`) — same gate as `wait_approval`, per Phong's
  final amendment (the first draft had required `approve_order` alone for
  `approved`).
- Permission key names: kept `approve_order` (not renamed to `can_approve`)
  and `can_edit_approved_order` (not `can_edit_approved`) — Phong's exact
  wording.
- Build order for the next session: **server first** (Config/Permissions/
  Orders.gs + full offline test coverage for the edit-gating matrix above),
  confirmed green, **then** the client UI (ViewsOrders.html/Styles.html) as
  a separate pass — not one combined change.

### Revision 2026-09-03b — reject reason surfaced on detail (B2 banner)

Follow-up feedback after 2026-09-03's marker/self-approver work: (1) the
reject note WAS captured (`actionRejectOrder_` already wrote it to
`StatusHistory`) but never shown anywhere — the only way to see why an
order was rejected was opening the raw sheet; (2) quick actions should
lock each other out during an in-flight call, still to be scoped/built.
This entry covers (1) only.

Went through two rounds of mockups (`reject-reason-display.html`, four
concepts: inline line / full history list / tooltip / combined banner; then
`reject-reason-banner-v2.html`, six variants B1–B6 on the banner concept
Phong picked). Landed on **B2**: a single compact line — icon, quoted
reason, "— who, when" trailing on the same line — no separate title row.

- `Orders.gs`: new `latestRejectInfo_(orderId)` reads `StatusHistory`
  filtered to this order's `approveStatus`-field `rejected` rows and
  returns the LAST one (append order, not a `changedAt` sort — two rejects
  in the same second would tie under sort, append order never does).
  `buildOrderResponse_` now attaches `rejectReason`/`rejectedBy`/
  `rejectedAt` to the order payload, but only when `approveStatus ===
  'rejected'` — `StatusHistory` itself is unchanged, still append-only,
  this is a read path added on top of it.
- `ViewsOrders.html`: `rejectReasonHtml(o)` renders the B2 line, called
  from `approveStatusBannerHtml()` between the status pill and the
  "Cập nhật lần cuối bởi…" note. Empty string (renders nothing) unless
  `approveStatus === 'rejected'` AND a reason is actually present — an
  older rejected row from before this shipped has no `rejectReason` on it
  and correctly shows no banner rather than an empty one.
- `Styles.html`: `.reject-reason-line` / `.reject-reason-who` — reuses the
  exact rejected palette already in use for `.approve-status-pill--rejected`
  (`#fdecea` / `#f3c2bd` / `--c-danger`) rather than inventing new tokens,
  so the banner and the pill above it read as the same "rejected" state.
- Offline tests: `orders-approvestatus.test.js` section 11 (5 new
  assertions — reason/who/when present on a rejected order's detail
  response, absent on a draft order, and "latest wins" across two rejects
  of the same order). `orders-approvestatus-ui.test.js` extended with a
  fourth fixture order (`DH-2026-0003`, pre-rejected with a reason) and 3
  assertions that opening its detail actually paints the banner with the
  right text and who. Full suite: **136 assertions across the two
  approvestatus files** (89 + 47), all green; whole-repo offline suite
  (7 files) all green. `BUILD` is `api-2026-09-03b-rejectreason` /
  `web-2026-09-03b-rejectreason`. Not yet verified live.

### Revision 2026-09-03c — lock the other quick action on the same order

Point 1 of the same 2026-09-03 feedback: firing the approve-menu action and
the business-status quick-select on the same order at the same time risks
a real conflict (e.g. approving an order whose status just changed under
it, or vice versa). Phong's answer on scope: **same order only** — other
orders in the list are unaffected; this is purely a same-card cross-lock
between two controls that already sat side by side.

- `ViewsOrders.html` `orderCardHtml()`: while `state.statusUpdatingIds[o.orderId]`
  is set, the approve marker is passed an empty actions array (not just
  "pending" — genuinely no actions), so `fusedOrderIdHtml` draws it as the
  plain, non-interactive marker — same branch as "no actions available at
  all", not the spinner branch (nothing about approveStatus itself is
  changing, so a spinner would misdescribe what's happening).
- `statusQuickPillHtml()`: while `state.approveUpdatingIds[o.orderId]` is
  set, the pill drops its overlaid `<select>` and pencil icon the same way
  it already does for `!o.canChangeStatus` — plain pill, no control.
- `onClick`'s `toggle-approve-menu` case: added `state.statusUpdatingIds[key]`
  to the existing `state.approveUpdatingIds[key]` guard, same
  belt-and-suspenders reasoning as the `data-open` guard beside it (the
  button isn't rendered in that state at all, but a click landing a moment
  before the repaint lands is still refused).
- No server-side change — this is purely a UI race-prevention measure; the
  server already serializes writes to a given order via `withOrderLock_`
  regardless.
- Offline tests: `orders-approvestatus-ui.test.js` gained 4 assertions
  under a temporarily swapped-in deferred (manually-resolved) response for
  `apiRejectOrder`/`apiChangeStatus`, since both fixtures normally resolve
  immediately via `Promise.resolve()` and a same-order lock only exists in
  the narrow window before that resolution — a plain `await tick()` lets
  the whole round trip finish before there's anything to observe, so the
  call under test is intercepted and held pending instead. Full suite:
  **51 assertions in `orders-approvestatus-ui.test.js`** (up from 47);
  whole-repo offline suite (7 files, 481 assertions total) all green.
  `BUILD` is `web-2026-09-03c-lockquickactions` (client-only). Not yet
  verified live.

### Revision 2026-09-03d — reject reason: correction, off the StatusHistory scan

Phong's review of 2026-09-03b/c caught two problems:

1. **Reading the reject reason back from `StatusHistory` was a bad idea.**
   `latestRejectInfo_` scanned the entire sheet, filtered, and sorted on
   every single detail-screen load — an unnecessary full-table read for
   something that only ever needs the CURRENT order's most recent value.
2. **The banner showed even with `approvalFlowEnabled` OFF.**
   `buildOrderResponse_`'s reject-reason block never checked the flag at
   all — an oversight in 2026-09-03b, unlike every other approve-status
   branch in that function, which does gate on it.

Fix for both: store the reason directly on the `Orders` row instead of
deriving it from history, and gate the read on the flag like everything
else does.

- `Config.gs`: `HEADERS.Orders` gains `rejectReason`/`rejectedBy`/
  `rejectedAt` (three new columns, appended at the end — existing sheets
  need `migrateAddRejectReasonColumns()`, `Migrations.gs`, run once).
- `Orders.gs`: `actionRejectOrder_` now writes all three directly in the
  same `updateRecord_` call that sets `approveStatus: 'rejected'` — no
  extra sheet write, same lock, same transaction. `latestRejectInfo_` is
  deleted outright; `StatusHistory` goes back to being purely an
  append-only audit trail with no read path anywhere in the app, exactly
  as it was before 2026-09-03b (the `note` is still written there too,
  unchanged, for that audit trail — just no longer read back from it).
- `buildOrderResponse_`: now reads `row.rejectReason` etc. directly (no
  extra sheet scan), and the condition gained
  `approvalFlowEnabled_(config) &&` up front. One more fix needed here
  beyond just adding the check: `filterVisibleFields_` earlier in the
  same function already copies EVERY row field through untouched for a
  `visible_fields: ['*']` profile (the seeded admin role, and this repo's
  test `user()` helper's default) — so the three fields were leaking
  through from that generic copy regardless of the gate below it. Fixed by
  explicitly `delete`-ing all three off `order` before the gated re-add,
  so a flag-off (or non-rejected, or reason-less) response never carries
  a stale value forward.
- No client change needed — `rejectReasonHtml()` was already correctly
  written to render nothing when the fields are simply absent from the
  response; it was the server leaking them that was the bug.
- Offline tests: `orders-approvestatus.test.js` section 11 gained one
  assertion — flip `approvalFlowEnabled` off mid-test (`H.withApprovalFlow`)
  on an order that IS rejected and confirm `rejectReason` comes back
  `undefined`, not the reason it actually has stored. This assertion
  failed against the fix's first draft (gate added but no `delete`) for
  exactly the `visible_fields: ['*']` leak described above — real
  regression coverage, not just a rubber stamp. Full suite: **90
  assertions in `orders-approvestatus.test.js`** (up from 89); whole-repo
  offline suite (7 files, 482 assertions total) all green. `BUILD` is
  `api-2026-09-03d-rejectcolumn` / `web-2026-09-03d-rejectcolumn`. Not yet
  verified live.

### Revision 2026-09-03e — approvedBy/approvedAt restored

Phong noticed `approvedBy`/`approvedAt` "not working anymore" — correct:
they'd been write-only-retired since 3.8 (replaced by `approveStatus` +
`StatusHistory` as the source of truth for who/when approved), a design
decision from well before this session touched anything, not a
regression from 2026-09-03b/c/d's reject-reason work (verified: those
columns were never even read, and `appendRecord_`/`updateRecord_` map by
the sheet's actual header row, so adding unrelated columns couldn't have
shifted or clobbered them). Phong's answer: bring them back as real,
actively-written fields — write-only for now, no UI change (unlike
`rejectReason`, which does have a banner).

- `Orders.gs`, all three places an order can land on `approveStatus:
  'approved'` now stamp `approvedBy: user.email` / `approvedAt: now` in
  the same `updateRecord_`/`appendRecord_` call:
  - `actionApproveOrder_` — every explicit approve.
  - `actionCreateOrder_` — a create born approved (`bornApproved`); a
    plain create still writes `''`/`''`, unchanged.
  - `actionUpdateOrder_` — the save-time auto-approve path
    (`nextApproveStatus === 'approved'`, i.e. an `approve_order` holder
    who confirmed the prompt). Re-stamps `approvedBy`/`approvedAt` on
    every such save, even one that RE-confirms an already-approved
    order — same "reflects the most recent approval action" semantics as
    `updatedBy`/`updatedAt` refreshing on every save. A save that leaves
    `approveStatus` at anything else (`draft`/`rejected`/`wait_approval`)
    leaves the existing stored value untouched, not blanked.
- No change to `buildOrderResponse_` — these two are ordinary
  `visible_fields`-gated columns like any other order field (unlike
  `rejectReason`, which needed an explicit gate/delete because of the
  `ALWAYS_VISIBLE_FIELDS`-style handling `approveStatus` gets); nothing
  new is forced into the response.
- Offline tests: new section 12 in `orders-approvestatus.test.js` (7
  assertions) covering all three write paths, plus confirming a plain
  (non-approved) create still leaves the columns blank. Full suite: **97
  assertions in `orders-approvestatus.test.js`** (up from 90); whole-repo
  offline suite (7 files, 489 assertions total) all green. `BUILD` is
  `api-2026-09-03e-approvedstamp` (server-only — `web` BUILD unchanged,
  no client file touched). Not yet verified live.

### Revision 2026-09-03f — approvedAt/rejectedAt showing date-only on the real sheet

Phong: the real spreadsheet's `*At` audit columns show a bare date
(mm/dd/yyyy) with no time, while old sample data shows a full datetime —
asked for a review of every datetime write, a fix, then a migration to
normalize existing date-only cells to `00:00:00`. Follow-up correction
after the first pass: only `approvedAt`/`rejectedAt` actually show this;
`createdAt`/`updatedAt`/`changedAt` display correctly and were never
affected.

**Review finding: every write site is already correct.** Every `*At`
column (`Orders.createdAt/updatedAt/approvedAt/rejectedAt`,
`Invoices.createdAt`, `StatusHistory.changedAt`) is written as a real
`new Date()` JS object at every call site —
`actionCreateOrder_`/`actionUpdateOrder_`/`actionApproveOrder_`/
`actionRejectOrder_`/`actionRequestApprove_`/`actionSetDraftOrder_`/
`appendStatusHistory_` (`Orders.gs`), the admin seed (`Setup.gs`), and
`DevSeed.gs` (which seeds through `actionCreateOrder_` itself, the same
path as real usage — confirming sample and real data share one write
path, not two). `SheetsRepo.gs`'s `appendRecord_`/`updateRecord_` never
reformat, stringify, or strip time off a Date before writing it. `grep`
for `setNumberFormat` across the whole repo returned zero hits — nothing
in the app code ever sets a date-only cell format either.

`orderDate` was checked and confirmed to be a DIFFERENT, intentionally
date-only field (`parseDate_` in `Orders.gs` builds
`new Date(y, m-1, d)` at midnight from a client-supplied business date)
— not one of the audit columns, and out of scope here.

**Diagnosis, narrowed after Phong's correction**: the write path is
correct everywhere, but only `approvedAt`/`rejectedAt` show the display
bug — which lines up with WHY, not just confirms it's cosmetic.
`createdAt`/`updatedAt`/`changedAt` have carried real datetime values
continuously since long before this session. `approvedAt`/`rejectedAt`
are the two columns that only just started being WRITTEN: `approvedAt`
was added to the header at 3.8 but nothing wrote to it until revision
2026-09-03e restored it; `rejectedAt` is brand new from 2026-09-03d.
Both sat as blank, freshly-appended columns with no prior data for a
long time — exactly the situation where Sheets' automatic format
detection can land on date-only for the first values written into them,
rather than the full datetime format the other columns picked up early
on. `readAll_`'s `getValues()` reads the real underlying value
regardless of display format either way, so app logic was never
affected — this is cosmetic on the sheet, not a data-correctness bug.

- **No code change was needed** for "make it work as expected" — there
  was nothing broken in the write path to fix.
- `Migrations.gs`: `migrateFixDatetimeColumns()`, scoped to
  `Orders.approvedAt`/`Orders.rejectedAt` ONLY (narrowed from an initial
  draft that also touched createdAt/updatedAt/changedAt/Invoices.createdAt
  — pulled back out per Phong's correction, since touching columns that
  already work risks nothing but isn't the fix he asked for). For each of
  the two columns: (1) resets the column's number format to
  `M/d/yyyy H:mm:ss`; (2) reads every existing cell — a cell that IS
  already a real JS `Date` object is left completely untouched, its
  actual time preserved exactly as stored; a cell that is NOT a Date
  object (Sheets parsed it as plain text — no time was ever recorded) is
  rewritten to `new Date(y, m, d, 0, 0, 0)`, an explicit midnight, per
  Phong's instruction. Idempotent — safe to run more than once.
- Not an offline-testable change (pure Google Sheets API calls —
  `setNumberFormat`/`getRange`/`getValues`/`setValues` against a live
  spreadsheet, no code path the Node harness's mock sheet models). No
  `BUILD` bump — no application code changed, only `Migrations.gs`.

**HOW TO RUN** (also in the function's own doc comment): push
`apps/api`, select `migrateFixDatetimeColumns` in the Apps Script
editor's Run dropdown, run with no arguments, read the returned summary
(per-column: format fixed, N of M rows normalized). Not yet run against
the live sheet.

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

## Milestone 3, task 3.6 — admin approve

**Built 2026-08-31.** `actionApproveOrder_` (`apps/api/Orders.gs`) is a new
one-purpose action, the same shape as `actionChangeStatus_`: takes just
`{orderId}`, not a full order payload. `requirePermission_('approve_order')`
→ `requireOwnershipOrAll_` (consistent with every other order action here,
even though in practice every preset granting `approve_order` also grants
`view_all_orders` — see `docs/PERMISSIONS.md` §3, only Admin has it checked)
→ refuses outright if `row.approvedBy` is already set (checked once before
the lock, and re-checked on the freshly re-read row INSIDE the lock, so two
admins approving the same order within the same instant can't both succeed
and silently overwrite each other's stamp) → `updateRecord_` sets
`approvedBy`/`approvedAt`/`updatedBy`/`updatedAt` → `bumpOrdersVersion_`.
Approval is one-way: there is no `unapprove` action, matching the spec's
"Admin approves; a staff account cannot" — nothing here revokes one.

`listCardView_` and `buildOrderResponse_` both gain `canApprove` — same
`mayAct_(user, row, 'approve_order')` shape as `canEdit`/`canDelete`/
`canChangeStatus`, additionally ANDed with `!row.approvedBy` so the flag (and
therefore the button) disappears for good the moment an order is approved,
for every user including the approver themselves.

Client: a "Duyệt đơn hàng" button appears in the detail view's action row
(`apps/web/ui/ViewsOrders.html`, `actionsHtml`) whenever
`state.order.canApprove` is true, styled `.btn-ok` (an outline in `--c-ok`,
not `--c-danger`, so it doesn't read as destructive next to "Xoá đơn hàng").
Clicking it reveals an inline confirm row (`confirm-box confirm-ok`, no
native `window.confirm` — that would block the whole Apps Script iframe),
same pattern as delete. Confirming calls the new `apiApproveOrder`
pass-through (`apps/web/Main.gs`) and — deliberately not optimistic — only
updates `state.order` from the server's actual response
(`res.approvedBy`/`res.approvedAt`), since the server is what stamps the
timestamp and resolves any approve-approve race. On success it also patches
the matching card in `state.orders` (`canApprove = false`) and deletes any
cached `orderCache[orderId]` entry, the same two things `changeStatusQuick`
does after a status change — see the detail-cache bug fixed just above.
Once approved, `approvedNoteHtml` shows "Đã duyệt bởi &lt;email&gt; ·
&lt;date&gt;" at the top of the detail view; gated by
`has(o, 'approvedBy')`, so a role without that field in `visible_fields`
never receives it from the server and the note simply doesn't render —
same pattern as every other optional field on this screen.

21 new offline assertions in `tools/offline-tests/orders-approve.test.js`
covering the happy path, permission + ownership enforcement, the
already-approved refusal (including a second, different admin), an unknown
orderId, and `canApprove` on both list cards and the detail response
(ownership-aware, flips off once approved) — 366 assertions across all
suites, all passing. `BUILD` is `api-2026-08-31-approveorder` /
`web-2026-08-31-approveorder`. Not yet verified live.

## Milestone 3 — reusable confirm popup (`TT.confirm()`)

**Built 2026-08-31.** Replaced every inline `.confirm-box` in
`apps/web/ui/ViewsOrders.html` (delete order, approve order, discard-and-
reload) with one shared popup, `TT.confirm()`, added to the app shell
(`apps/web/ui/App.html`) rather than to ViewsOrders — it lives on
`window.TT` alongside `call`/`can`/`esc`/`toast`, so any future view module
(Inventory, Users, Statistics — currently stub files) can use the exact
same popup without depending on Orders code at all.

**Shape.** `TT.confirm({title, message, summary, okLabel, cancelLabel,
danger})` returns `Promise<boolean>`, resolving `true`/`false` on the
user's choice (backdrop click and Escape both resolve `false`). Still not
`window.confirm` — same reason as the inline pattern it replaces: a native
dialog blocks the whole Apps Script iframe (documented at the call site in
`App.html`, same as the old comment in ViewsOrders.html it succeeds). A
single `#confirm-modal` node lives in `ui/Index.html` (a `.modal`/
`.modal-card` pair — the same fixed, dimmed-overlay convention the existing
`#switch-modal` account-switcher already used, not duplicated CSS), filled
in per call and torn down (listeners removed) on every resolution so
nothing leaks between calls.

**UI, per the "S2" option the user picked out of several rounds of Artifact
mockups**: a tinted icon-band header (green for a safe one-way action,
red for `danger: true`), then — when the caller passes `summary` — a mini
order-card block (id, status pill, customer, meta line, total) in the same
visual language as a real list card, so the user is confirming against the
*specific* record on screen rather than reading a generic sentence. Useful
when the list is filtered/scrolled and it's not obvious at a glance which
row "this one" is. `summary` is entirely optional per field — a caller
without money-visible fields just omits `money`, nothing breaks.

**Migrated call sites** (`ViewsOrders.html`): `confirmDelete()` (danger,
full summary via a new `orderSummaryFor(order)` helper — respects
`state.hiddenMoney` and `has()` the same way the rest of the screen does,
so a role without visible money fields simply doesn't get a money line),
`confirmApprove()` (safe, same summary), `confirmReload()` (danger — this
one discards unsaved local edits, not server data, but the friction should
still match "you'll lose something"). All three replace what used to be an
`ask-X` click revealing an inline row, then a separate `do-X`/`cancel-X`
click — now a single `ask-X` click opens the popup and its own two buttons
are the only next step; the old `toggleConfirm`/`toggleApproveConfirm`/
`toggleReloadConfirm` helper functions and the `.confirm-box` CSS rules
they toggled are gone.

**New confirm, not previously present**: quick status change from the list
pill (`changeStatusQuick`) was a one-click `<select>` firing
`apiChangeStatus` immediately, no undo, no confirm at all — found during
this review as the one action that plausibly needed a confirm and didn't
have one. Now shows a lightweight `TT.confirm()` (no summary card,
deliberately — this control's whole point since task 3.5 is staying a
*quick* action, not becoming a heavy multi-step flow) with a one-line
"A → B cho đơn X" message before calling through. Because the browser
already commits the `<select>`'s value the instant `change` fires, a
cancelled confirm explicitly resets `selectEl.value` back to the previous
status without a full list repaint (nothing else in `state` changed).

**Not migrated / left as-is**: removing a line from the order FORM
(`del-line`, before Save) — local, unsaved state, reviewed and judged low-
stakes enough to leave unconfirmed; Save itself — the safe, primary action,
correctly unconfirmed; sign-out (`App.html`) — no specific record, a plain
session action, judged not to need this pattern.

Offline tests: `tools/offline-tests/orders-ui.test.js` updated for the new
flow — its harness's `T` stub gained a `confirm()` that resolves `true`
immediately and records what it was called with (`lastConfirmOpts`), so
tests can assert the popup was asked with the right title/summary without
a real DOM popup. Four assertions that checked a synchronous "mid-flight,
busy-locked" window inside the old two-click ask/do pattern no longer have
an observable equivalent now that confirming itself is a Promise (same as
the real popup) — removed with an explanatory comment rather than faked;
three new assertions cover the popup being asked with the right
title/summary on reload and delete. Net: 362 assertions across all
suites (down from 366; the busy-lock guarantees those four covered are
still exercised elsewhere in the same test, by the save-in-flight
assertions, which don't go through `T.confirm()`), all passing. `BUILD` is
`web-2026-08-31-confirmpopup` (API unchanged — this is entirely
client-side). Not yet verified live.

## Milestone 4 — Export + statistics

Planned 2026-09-03, split into small tasks per the rule (`AGENTS.md` §7):
one task per conversation, order matters, each builds on the one before
and is testable/verifiable on its own — same shape as Milestone 3's
3.2→3.8 split. Design questions below were resolved with Phong BEFORE
any of this is built, so no task should hit an open question mid-work.

**4.5 split into sub-tasks (2026-09-04)**: originally one task ("Async/
large-export infra"), but it's architecturally bigger and more novel to
this codebase than 4.1-4.4 — a whole job/checkpoint/polling/delivery
system, not one request/response feature — so Phong asked to split it the
same way Milestone 3 split 3.2→3.8, rather than build it as one large,
harder-to-review unit. 4.5.1-4.5.4 below, in build order: each depends on
the one before it (polling needs a job record to poll; delivery needs a
finished job to deliver; cleanup needs delivered jobs to clean up).

| # | Task | Status |
|---|------|--------|
| 4.1 | CSV export — filtered list, order-date grouping, `EXCEL_REFERENCE.md` §7 layout | ☑ |
| 4.2 | Export month-basis toggle (order date / invoice date) + shared per-line bucketing | ☑ |
| 4.3 | XLSX export (temp-Sheet build + export URL + cleanup) | ☑ |
| 4.4 | PDF export (same temp-Sheet, PDF print params) | ☑ |
| 4.5.1 | Job/checkpoint core — `PropertiesService` job record, `LockService`, batch-writing loop that checkpoints and self-retriggers before the 6-min execution limit | ☑ |
| 4.5.2 | Status polling — `exportJobStatus` action + client polling UI (progress, done/error states) so a large export doesn't hold the request open | ☑ |
| 4.5.3 | Drive + email delivery — finished job uploads to a Drive export folder, emails a link or attachment (size-threshold fallback past Gmail's ~25MB ceiling) | ☑ |
| 4.5.4 | Retention cleanup — time-based trigger that trashes old Drive exports/job records so the folder doesn't grow indefinitely | ☑ |
| 4.6.1 | Revenue by time period (week/month/quarter/year, generalizing the existing month-bucketing) + `statsRevenue` action/permission wiring | ☑ |
| 4.6.2 | Revenue by customer and by status (separate aggregation dimension from time-period) | ☑ |
| 4.7.1 | Stats view UI — period toggle + one Chart.js chart + totals table | ☑ |
| 4.7.2 | Customer/status breakdown views, filters, polish | ☐ |

**Backlog — last task before go-live, not milestone-specific (noted
2026-09-04, not yet built):** a `verifyAuthorization()`-style setup
function in `Setup.gs`, run once from the online editor as the final step
of setting up ANY environment (first production deploy, a future staging
env, or recovering after `appsscript.json`'s scopes change again). Why
this is worth having: this session found, the hard way, that
`appsscript.json` listing a scope is not the same as that scope actually
being consented/working — `drive.file` was silently insufficient for
`DriveApp.getFileById`/`searchFiles` for every XLSX/PDF export since 4.3,
caught only because Phong noticed files piling up in Drive and we built a
one-off diagnostic script to isolate it. That was a manual, reactive hunt;
it should instead be one function anyone can run at setup time (or after
any manifest scope change) that deliberately exercises EVERY scope the
app actually depends on and reports pass/fail for each, so a gap like
that is caught in one minute instead of accumulating silently in
production. Concretely, one function that, in order, and never throwing
early so the whole report always completes:

- `SpreadsheetApp`/data-sheet access (`spreadsheets` scope) — read one
  real row from the data spreadsheet via `getSpreadsheet_()`.
- `DriveApp` (`drive` scope) — create a throwaway file, confirm
  `getFileById`/`searchFiles`/`setTrashed` all work, delete it. The exact
  isolated check `manualTestExportCleanup`/`manualTestMailAuth` (ad-hoc
  diagnostic scripts printed in chat this session, not part of the repo)
  already did by hand.
- `MailApp` (`script.send_mail` scope) — send one test email to
  `ADMIN_EMAIL`.
- `UrlFetchApp` (`script.external_request` scope) — the same spreadsheet-
  export URL fetch `fetchSpreadsheetExportBase64_` uses, against the
  throwaway Drive file above.
- `ScriptApp` trigger creation/deletion (`script.scriptapp` scope) —
  create a one-off trigger, confirm it's listed, delete it.

Each check wrapped so one failure doesn't stop the rest (same pattern the
ad-hoc diagnostic scripts used), ending in one summary log: which scopes
are genuinely working right now, not just declared in the manifest. Add
it to `guardSetup_`'s `editorOnly` allowlist alongside `setupMilestone1`/
`rotateSecret` so it can never be reachable over HTTP. `docs/SETUP.md`
should point to it as the standard first step of any new environment
setup, replacing today's implicit "click through whatever dialog Apps
Script happens to show you" approach. Deliberately deferred rather than
built now — nothing currently in this project is unauthorized (as far as
tested), and the exact scope list is still moving (this session alone
added `drive`; more may follow before the project's done), so building
this now risks having to revisit it more than once. Revisit as the last
task before the project is considered feature-complete and ready to hand
off/go live.

Already decided going in (Q2, answered 2026-08-20 — see `OPEN_QUESTIONS.md`):
revenue shown **both** ex-VAT and inc-VAT; month basis is a toggle (order
date / invoice date), default invoice date for stats. `export` /
`view_statistics` / `export_statistics` already exist as permissions
(`PERMISSIONS.md`) — nothing new to add there.

**Design decisions resolved with Phong 2026-09-03, before any task starts:**

- **Invoice-date bucketing is per LINE, not per order** (`invoiceId` lives
  on `OrderLines`, not `Orders` — `DATA_MODEL.md` §4, one order can have
  lines invoiced on different dates or not yet invoiced). Order-date basis
  groups by order as the reference file already does — unbilled lines just
  show blank `invoiceNo`/`invoiceDate`, nothing special. Invoice-date basis
  buckets per line, sub-grouped by order within each month bucket (a split
  order legitimately appears in more than one bucket); unbilled lines go
  into their own "no invoice" bucket, also sub-grouped by order, rather
  than spread across months or dropped. One shared bucketing function for
  both 4.2 (export) and 4.6 (stats) — not reimplemented per task.
- **Export gets the same toggle as stats**, not order-date-only — default
  stays order-date to match the reference file.
- **Export size has no real limit — could be multiple years** (Phong's
  answer), which rules out a purely synchronous build-then-return design
  (risks the 6-minute execution limit). 4.5 covers this: checkpoint-and-
  re-trigger past the limit, build/convert split into two phases, client
  polls a status record instead of holding the request open. A small
  export still completes inline in one execution — the async path is for
  the large case only.
- **Delivery is both a Drive link and an emailed attachment** (Phong's
  answer, not either/or) — size-threshold fallback to link-only email past
  Gmail's ~25MB attachment ceiling, plus a retention/cleanup trigger so
  the Drive export folder doesn't accumulate indefinitely.

**Technical approach, researched 2026-09-03 (current Apps Script platform
behavior — see git history for the full research writeups if needed):**

- XLSX/PDF: no npm/vendored library (SheetJS-style writers don't run
  cleanly in the V8 sandbox) — standard approach is build a temp Google
  Sheet (`SpreadsheetApp.create`, batched `Range.setValues()`, ~1,000–
  5,000 rows/call), export via the Drive export URL (`UrlFetchApp` +
  `ScriptApp.getOAuthToken()`, PDF print params: `size`/`portrait`/
  `fitw`/`gridlines`/margins/`gid`/`range`), delete the temp Sheet in a
  `try/finally`. Vietnamese diacritics are a non-issue in all three
  formats (Unicode-native export path, not glyph rendering).
- CSV: plain string-building, prepend a UTF-8 BOM so Excel on Windows
  doesn't mangle Vietnamese diacritics.
- Large exports (4.5): `PropertiesService` for job/progress state,
  `LockService` against overlapping runs, one-off time-based triggers to
  resume a checkpointed job, `MailApp`/`GmailApp` for the emailed copy.
- Chart.js (4.7): loads fine via a normal CDN `<script>` tag under
  HtmlService's IFRAME sandbox — no vendoring needed. `Stats.gs`
  pre-aggregates server-side; ship bucketed totals as JSON, never raw
  order/line rows.

## Milestone 4, task 4.1 — CSV export (built 2026-09-03)

Server-side CSV export of the currently-filtered order list, order-date
basis only (the toggle to invoice-date is 4.2). New action `exportOrdersCsv`
(`apps/api/Export.gs`), pass-through `apiExportOrdersCsv` (`apps/web/Main.gs`).

**Shape:** groups orders by `orderDate` month (`THÁNG n`, oldest first),
STT resets per month, STT/PO/status shown only on an order's first line,
customer repeated every line, one row per order line (`filteredLine` join
against `OrderLines`), a `DOANH SỐ THÁNG n` total row (ex-VAT / inc-VAT,
`toLocaleString('vi-VN')`) closes each month — matches
`EXCEL_REFERENCE.md` §7. Unbilled lines show blank `HÓA ĐƠN RA`/`NGÀY HĐ`,
per Phong's answer (order-date basis keeps unbilled lines in place, no
special handling). CSV is RFC 4180 escaped, UTF-8 BOM-prefixed for Excel
on Windows.

**Reused `actionListOrders_`'s filters, not reimplemented:** extracted
`computeOrderFilters_(user, payload, config)` and
`filteredOrderRowsForUser_(user, filters)` out of `actionListOrders_` so
export takes exactly the same payload shape (month/dateFrom/dateTo,
customer, status, createdBy, approveStatus, q) and the same security
gating (`fieldVisible_`, `canSeeAllOrders_`/`scopeToUser_`,
`approvalFlowEnabled_`) as the list screen, with zero duplication. Full
offline suite re-run after the extraction (489/489) and again with
`Export.gs` added to the harness (still 489/489) confirmed the refactor
is behavior-preserving before any export code depended on it.

**Money visibility:** gated by `seesMoney_(user)` (the actual
price-blindness check, not `fieldVisible_`) — unit price, both amount
columns, and the month total are all blank for a price-blind role.
`export` permission required (`requirePermission_(user, 'export')`,
already in `PERMISSION_KEYS`).

**Manual-testing UI added**: a "Xuất CSV" button on the orders list
(`ViewsOrders.html`, gated by `T.can('export')`), next to "+ Tạo đơn
hàng". Reuses `listPayload()` so the export always matches whatever
filters are currently applied to the list. `doExportCsv()` calls
`apiExportOrdersCsv`, then turns the returned `{filename, mimeType, csv}`
into a real download via a Blob + temporary `<a download>` link (`csv`
already carries its UTF-8 BOM). `state.exporting` disables the button and
swaps its label to "Đang xuất…" while the round trip is in flight. This
button is meant for manual verification, not a finished export
experience — no format choice, no month-basis toggle (4.2), no async
path for large exports (4.5) yet.

Tests: `tools/offline-tests/export.test.js`, 10 sections / 33 assertions —
permission enforcement, CSV shape (BOM/header/filename/mimeType), month
grouping + STT + DOANH SỐ totals, multi-line STT/PO/customer placement,
unbilled-line blank invoice columns, price-blind money gating,
`view_all_orders` scoping, filter reuse, CSV escaping, zero-line-order
handling. Full suite: 522/522 passing
(export 33, approvestatus-ui 51, approvestatus 97, changestatus 28,
crud 54, filter 60, permissions 116, ui 83).

`BUILD`: `api-2026-09-03f-exportcsv` / `web-2026-09-03e-exportcsv`.

## Milestone 4, task 4.2 — export month-basis toggle (built 2026-09-03)

Adds `payload.basis` (`'orderDate'` default, or `'invoiceDate'`) to
`exportOrdersCsv`, plus the shared bucketing function
`bucketOrdersForExport_` (`apps/api/Export.gs`) that both 4.1's order-date
grouping and this task's invoice-date grouping now go through — the
single place export (and later, 4.6 stats) decides which month bucket a
line's revenue belongs to.

**order-date basis** (unchanged from 4.1): one bucket per order's
`orderDate` month, an order's lines stay together regardless of invoice
status.

**invoice-date basis** (new): bucketed per LINE, not per order —
`invoiceId` lives on `OrderLines` (`DATA_MODEL.md` §4), so a single order
can have lines invoiced in different months. Each bucket sub-groups its
lines by order (an order can legitimately produce an orderGroup in more
than one month bucket — verified in test 13, "Dòng A"/"Dòng B" of the
same order land in THÁNG 8 and THÁNG 9 respectively, each carrying its
own STT/PO as the first line of its own bucket-local orderGroup). Lines
with no invoice go into a dedicated `CHƯA XUẤT HÓA ĐƠN` bucket, sorted
last, also sub-grouped by order (Phong's answer, 2026-09-03) — never
spread across months or dropped. `DOANH SỐ` totals are computed per
bucket, so a split order's revenue is correctly divided between its
buckets (test 15) rather than double-counted or attributed to one month.

An unrecognized/missing `basis` value falls back to `orderDate` rather
than erroring — matches the reference file and never breaks on a stale
client.

**Client UI**: a "Theo ngày đặt / Theo ngày hóa đơn" `<select>` next to
the "Xuất CSV" button on the orders list (`ViewsOrders.html`), read live
at export time (same pattern as the month/year filter selects) and sent
as `payload.basis`.

Tests: `tools/offline-tests/export.test.js` extended with 5 new sections
(11–15): basis defaults/falls back to order-date; a fully-invoiced order
buckets by its invoice month; a split order produces two orderGroups in
two different month buckets, each with its own STT/PO; an unbilled line
lands in the no-invoice bucket; and per-bucket revenue totals are
attributed correctly for a split order. 33 → 43 assertions in this file.
Full suite: 532/532 passing (export 43, approvestatus-ui 51,
approvestatus 97, changestatus 28, crud 54, filter 60, permissions 116,
ui 83).

`BUILD`: `api-2026-09-03g-exportbasis` / `web-2026-09-03f-exportbasis`.

## Milestone 4, task 4.2 — UI revision: export-options dialog (2026-09-03)

Phong's review of the shipped 4.2 toolbar toggle: "UI is not good, lets
move toggle approach to options confirm when export... show me some UI
options to choose first." 4 initial layouts sketched (segmented control,
radio list, plain dropdowns, full-filter-summary) — Phong picked the
radio-list direction ("Option 2"), then 4 more variants of it (icons,
inline warning, 2-column, full-row-clickable). Picked: **B2** — filters
shown as chips at the top, a divider, then the two radio groups, with an
inline warning box that appears under "Ngày hóa đơn" only once it's
selected (explaining the per-line month-split behavior at the moment
it's relevant, not as unconditional subtext).

Replaces the `<select>` toggle next to "Xuất CSV" entirely: the button now
opens a dedicated `#export-modal` (`ui/Index.html`) — a bespoke dialog,
not `TT.confirm()` (that popup's shape has no room for live radio groups
or a conditionally-shown block). Shows `activeFilterChips()` (the same
{key,label} data the filter-bar's own removable chips use — extracted
from `chipsHtml()` so the two never describe "what's an active filter"
differently), an order-count chip, then:
- **Nhóm theo tháng dựa trên**: Ngày đặt hàng (default) / Ngày hóa đơn,
  the latter revealing an inline hint box on selection.
- **Định dạng file**: CSV only for now — XLSX/PDF (4.3/4.4) add rows here
  rather than a new dialog.

`openExportDialog()` resolves `{ok:true, basis}` / `{ok:false}`, same
ok-flag shape as `TT.confirm()`; `doExportCsv()` now opens the dialog
first and only calls the export (`runExportCsv(basis)`, previously
`doExportCsv`'s body) if confirmed. No server-side change — `basis` still
flows through the same `apiExportOrdersCsv` payload field from 4.2's
first pass.

No new offline tests (this is a client-only UI change; the underlying
`bucketOrdersForExport_`/`actionExportOrdersCsv_` behavior it drives is
already covered by `export.test.js`'s 43 assertions). Syntax-checked via
`node --check` on the extracted script block.

`BUILD`: `web-2026-09-03g-exportdialog` (api unchanged, still
`api-2026-09-03g-exportbasis`).

### Bug fix 2026-09-03 — export dialog hint never actually hid

Phong live-tested and screenshotted: the "Ngày hóa đơn" hint box showed
under BOTH radio choices, unchanged either way. Root cause: `.export-hint`
(Styles.html) sets `display: flex` directly on the class — a stylesheet
rule beats the native `hidden` attribute's UA-stylesheet `display: none`,
so toggling `hint.hidden` in JS did nothing visually. Fixed with an
explicit `.export-hint[hidden] { display: none; }` override, plus calling
`syncHint()` once at dialog-open time (not just on `change`) so the first
render is correct regardless of which radio starts checked.

`BUILD`: `web-2026-09-03h-exportdialogfix`.

## Milestone 4, task 4.3 — XLSX export (built 2026-09-03)

Adds `exportOrdersXlsx` (`actionExportOrdersXlsx_`, `apps/api/Export.gs`),
sharing filters/basis/permission with `exportOrdersCsv` via a new
`exportBucketsForRequest_(user, payload)` helper (resolve basis → filters
→ buckets, permission check stays in each action per the codebase's
"requirePermission_ as the first line" convention).

**Shared row structure**: `buildExportCsv_` was refactored to consume a
new `buildExportRows_(user, buckets)` — the ONE place that walks buckets
into printable rows (`{kind:'group'|'data'|'total', cells}`), instead of
CSV and XLSX independently re-deriving STT/PO placement, money gating,
and DOANH SỐ totals. Numeric cells are now real JS numbers (`num_()`)
rather than raw sheet values passed through — XLSX needs real numbers to
write numeric cells (not text), and this is safe for CSV too since
`qty`/`unitPrice` are always validated numeric at order-save time
(`validateLine_`).

**New file `apps/api/ExportSheet.gs`** — a deliberate, scoped exception to
`CONVENTIONS.md`'s "business logic never calls SpreadsheetApp directly,
only via SheetsRepo.gs": that rule is about the app's DATA spreadsheet.
This file never touches it — it creates a throwaway temp Spreadsheet
purely as an XLSX-writing mechanism (no XLSX-writer library runs in the
V8 sandbox, per the 2026-09-03 platform research), and deletes
(trashes) it before returning, success or failure (`finally`). Flow:
`SpreadsheetApp.create()` → batch `setValues()` the shared row grid,
bold header/group/total rows, freeze the header row, autosize columns →
fetch the temp file's own `/export?format=xlsx` URL via `UrlFetchApp` +
`ScriptApp.getOAuthToken()` → base64-encode the bytes (doPost's JSON
response has no binary channel) → `DriveApp...setTrashed(true)` in a
`finally`.

Added `https://www.googleapis.com/auth/script.external_request` to
`apps/api/appsscript.json`'s `oauthScopes` — needed for the new
`UrlFetchApp.fetch` call (Apps Script's manifest scope list is derived by
static analysis of API calls used; fetching a `docs.google.com` export
URL is still an "external" request even though it's the app's own file).

**Client**: an "Excel (.xlsx)" radio row added to the export dialog's
format section (previously CSV-only). `runExportXlsx()` mirrors
`runExportCsv()` but decodes the response's `base64` field back into
bytes (`base64ToBlob_`, `atob()` + `Uint8Array`) before building the
download Blob; both now share one `downloadBlob()` helper (Blob → `<a
download>` → revoke) instead of duplicating that flow per format.

**Bug caught by a test, not inspection**: `writeExportRowsToSheet_`
originally guarded `sheet.getRange(...).setValues(grid)` behind
`if (grid.length > 1)` — meaning a zero-line export (all filtered out, or
an empty result) never wrote anything at all, not even the header row,
leaving the temp sheet completely blank. Fixed by writing unconditionally
(the header alone must still land).

Tests: new `tools/offline-tests/exportsheet.test.js` (20 assertions) —
covers `writeExportRowsToSheet_`'s grid construction (batched single
`setValues` call, header/group/data/total rows all present and correctly
shaped) and bold-row targeting (header + group + total rows bolded, plain
data rows not), frozen header, column autosize, `padRow_` pad/truncate,
and the zero-rows-still-writes-header case (the bug above). Does NOT
attempt to test `buildExportXlsx_`/`fetchSpreadsheetExportBase64_`
offline — those call real `SpreadsheetApp.create`/`DriveApp`/
`UrlFetchApp`/`ScriptApp.getOAuthToken()` with no meaningful offline
stand-in, same as every other Google-API-touching code path in this
project; verify those live. Full suite: 552/552 passing (export 43,
exportsheet 20, approvestatus-ui 51, approvestatus 97, changestatus 28,
crud 54, filter 60, permissions 116, ui 83).

`BUILD`: `api-2026-09-03h-exportxlsx` / `web-2026-09-03i-exportxlsx`.

**Live-test checklist for Phong**: open the export dialog, pick "Excel
(.xlsx)", confirm the downloaded file opens in Excel with bold
header/month/total rows and real numeric columns (not text-formatted
numbers); confirm no leftover temp files accumulate in the API project's
Drive (the deploying account's Drive, not yours) after a few exports.

### Fixes 2026-09-03 (Phong live-tested XLSX export) — 3 issues

**1. Export dialog cut off on phone, "Xuất file" unreachable.** Root cause:
`.confirm-modal-card` sets `overflow: hidden` (needed for the rounded top
band), which silently killed `.modal-card`'s own `overflow-y: auto` /
`max-height: 88vh` scroll — so once the dialog's content grew taller than
the viewport (this dialog especially, once the invoice-date hint is
showing), it just got clipped with nowhere to scroll. Fixed generally, not
just for this dialog: `.export-modal-card` is now a capped-height flex
column, and everything except the pinned action buttons moved into a new
`.export-modal-scroll` wrapper that scrolls internally — "scrollable body,
sticky footer," the shape any confirm-style dialog needs once its content
can outgrow the viewport.

**2. TRẠNG THÁI column showed the raw status KEY** (e.g.
`delivered_not_invoiced`) instead of the Vietnamese label a person reads
on the list/detail screens. `statusExportLabel_` was writing `view.status`
straight through with no translation. Fixed with a new
`statusLabelIndex_(config)` ({key: label} built once per export from
`config.statusList`, same source `Config.gs`'s `CONFIG_DEFAULTS` seeds and
the client's own `statusLabel()` reads) and `statusLabelText_()` doing the
lookup with a same-key fallback if a status is somehow missing from the
list.

**3. XLSX should visually merge cells like the reference file, not just
blank-repeat.** Resolved with Phong via AskUserQuestion first (the
reference file's own description, EXCEL_REFERENCE.md §3, says it actually
blank-repeats rather than truly merging — confirmed the ask before
guessing): Phong wants real merged cells even though the source file
doesn't have them — more finished-looking than a literal 1:1 reproduction.
`buildExportRows_` now stamps `groupSize` (line count) on the first data
row of each order; `writeExportRowsToSheet_` (ExportSheet.gs) merges STT,
PO, KHÁCH HÀNG, and TRẠNG THÁI (`EXPORT_MERGE_COLS = [1,2,3,12]`) down
that many rows for any order with more than one line, top-aligns the
merged cells so labels sit with the first line rather than floating to
the visual center, and also merges each THÁNG banner row across the full
width and each DOANH SỐ row's blank lead-in (A:G) for a cleaner look.
CSV is untouched — `groupSize` only means something to the sheet writer;
a flat text format has no concept of a merged cell, so CSV keeps the
blank-on-2nd-line pattern (matching the reference file's own plain-text
behavior).

Tests: `export.test.js` +3 (44→47) — status label translation (a real
key/label mismatch, not a coincidental match), and `buildExportRows_`'s
`groupSize` contract (set only on an order's first line, correct count,
`undefined` elsewhere). `exportsheet.test.js` +10 (20→30) — THÁNG/DOANH
SỐ banner-row merges, per-order STT/PO/KHÁCH HÀNG/TRẠNG THÁI merge spans
for a multi-line order, no merge at all for a single-line order, CHI TIẾT
never merged (every line keeps its own description), top-alignment.
Full suite: 566/566 passing.

`BUILD`: `api-2026-09-03i-exportfixes` / `web-2026-09-03j-exportfixes`.

**Live-test checklist for Phong**: re-test the export dialog on phone with
"Ngày hóa đơn" selected (the tallest state) — confirm both buttons are
reachable and the dialog scrolls instead of clipping. Export CSV and XLSX
for an order with a non-`draft`/non-`confirmed` status and confirm the
Vietnamese label shows, not the key. Open the XLSX in Excel and confirm a
multi-line order's STT/PO/KHÁCH HÀNG/TRẠNG THÁI appear as single merged
cells spanning its rows, single-line orders look unchanged, and the
THÁNG/DOANH SỐ banner rows read as full-width bars.

## Milestone 4, task 4.4 — PDF export (built 2026-09-03)

Adds `exportOrdersPdf` (`actionExportOrdersPdf_`, `apps/api/Export.gs`),
same filters/basis/permission as CSV/XLSX via the existing
`exportBucketsForRequest_`.

**Shared temp-Sheet build with XLSX**: `ExportSheet.gs`'s
`buildExportXlsx_`/`buildExportPdf_` both now go through a new
`withTempExportSheet_(user, buckets, fn)` — create the temp spreadsheet,
write the shared row grid (`writeExportRowsToSheet_`, unchanged from
4.3), hand `(ss, sheet)` to a format-specific callback, always clean up
in a `finally` regardless of what the callback does or throws. Only the
final export step differs per format: XLSX passes no extra params;
PDF passes print params (`buildExportPdf_`) — A4 portrait, fit-to-width,
gridlines on, the frozen header row repeated per page (`fzr`), 0.5"
margins, and critically an explicit `range` (`sheet.getLastRow()` ×
`getLastColumn()`'s A1 notation) — Drive's PDF export otherwise renders
the sheet's full default 1000-row grid as mostly-blank pages instead of
just the written rows.

`fetchSpreadsheetExportBase64_` (4.3) was extended to take a `params`
object appended as extra query string params — `{}` for XLSX (unchanged
behavior), the PDF print params above for PDF.

**Client**: a "PDF" radio row added to the export dialog's format
section. `runExportPdf()` mirrors `runExportXlsx()` — same base64-decode-
then-download flow, different action/default filename — kept as a near
copy rather than further-shared with `runExportXlsx()`; the two are
already about as DRY as they can be without the flow becoming harder to
read than the few duplicated lines saved.

Tests: `exportsheet.test.js` +3 (30→33) — `fetchSpreadsheetExportBase64_`
now testable in isolation with stubbed `UrlFetchApp`/`ScriptApp`/
`Utilities` (same pattern as `fakeSheet()`): confirms the URL it builds
carries `format=xlsx` alone when `params` is `{}`, carries every given
param correctly encoded for the PDF case (`gid`, `size`, `range` with its
`:` properly percent-encoded), and that a non-200 response throws rather
than silently returning garbage bytes. `buildExportPdf_`/
`withTempExportSheet_` themselves still call real `SpreadsheetApp`/
`DriveApp` and aren't tested offline, same as `buildExportXlsx_` before
them — verify live. Full suite: 569/569 passing (export 47, exportsheet
33, approvestatus-ui 51, approvestatus 97, changestatus 28, crud 54,
filter 60, permissions 116, ui 83).

`BUILD`: `api-2026-09-03j-exportpdf` / `web-2026-09-03k-exportpdf`.

**Live-test checklist for Phong**: export PDF for a month with several
multi-line orders — confirm it isn't mostly blank pages (the `range` fix
above), the header row repeats on every page, gridlines and merges
(4.3's STT/PO/KHÁCH HÀNG/TRẠNG THÁI merges) render correctly in the PDF
too, and no leftover temp files accumulate in the API project's Drive
after a few PDF exports (same cleanup path as XLSX, shared via
`withTempExportSheet_`).

---

### Post-4.4 feedback round — popup scroll (round 2), currency number format, XLSX visual style

After 4.4 shipped, Phong tested live and reported 3 issues in one batch:

**1. Export popup still cut off on phone, still couldn't scroll.** The
round-1 fix (previous section: `.export-modal-card` as a flex column with
its own `max-height: 88vh`, body wrapped in `.export-modal-scroll` with
`overflow-y: auto`) turned out insufficient — confirmed not fixed by
Phong. Root cause: `.export-modal-card` is itself a flex ITEM of `.modal`
(`.modal` is `display:flex; align-items:center`), and on WebKit a flex
item without its own `min-height: 0` can refuse to shrink below its
content's natural height — so `max-height: 88vh` never actually capped
it, and `.export-modal-scroll` never got a constrained box to scroll
within in the first place. Fix: added `min-height: 0;` directly to
`.export-modal-card`. Reproduced against a minimal standalone repro HTML
(flex modal + tall content) before and after the fix to confirm the
mechanism, not just patched blind.

**2. Money values should read as currency-formatted numbers.** CSV is
unaffected — a flat text format has no formatting concept, and the
destination app (Excel/Sheets) formats on open same as before. XLSX now
gets a real Sheets `NumberFormat` (`#,##0` — thousand separators, no
decimals, no currency symbol per cell since VND is implied by the sheet),
applied to `EXPORT_MONEY_COLS = [5, 8, 9]` (ĐƠN GIÁ, THÀNH TIỀN, TRỊ GIÁ
HĐ) via one `setNumberFormat()` call per column spanning the data-row
range — a real number, not a formatted string, so it stays sortable/
summable/usable in a formula.

**3. XLSX export needs a more finished look — table lines, section fill
colors.** Per Phong's "show me some options first," built 4 style
mockups (`/tmp/mockups/xlsx-style-options.html`, rendered `<table>`
previews): A (minimal — thin grey grid, light grey fills only, no brand
color), B (branded header + banded rows, tagged Recommended), C (soft
color-coding, no header fill), D (bold borders around each order group +
alternating blocks). **Phong chose Option A.** Implemented in
`writeExportRowsToSheet_` (`ExportSheet.gs`): a single `setBorder()` call
over the whole written grid (thin solid `#d0d5dd` grey on every cell),
plus `setBackground()` on the header row (`#f2f3f5`), each THÁNG banner
row (`#eef2f6`), and each DOANH SỐ total row (`#f7f7f7`) — no brand
color, safe for black-and-white printing per the option's own pitch.

Tests: `exportsheet.test.js` +6 (38→44) — section 11 confirms the border
call spans the full grid exactly once with the correct color/style, and
that background fills land on exactly the header/THÁNG/DOANH SỐ rows
with the right colors and nowhere else. `fakeSheet()` stub extended with
`setBorder`/`setBackground`; sandbox now also stubs
`SpreadsheetApp.BorderStyle.SOLID` since `writeExportRowsToSheet_`
references it directly. Full suite: 585/585 passing (export 47,
exportsheet 44, approvestatus-ui 51, approvestatus 97, changestatus 28,
crud 54, filter 60, permissions 116, ui 83).

`BUILD`: `api-2026-09-04a-exportfix` / `web-2026-09-04a-exportfix`.

**Live-test checklist for Phong**:
- Open the export dialog on a phone with a long enough content (e.g. all
  3 radio sections visible) and confirm it now actually scrolls instead
  of being cut off — this is a second attempt at the same bug, please
  check carefully.
- Export XLSX and confirm the money columns (ĐƠN GIÁ, THÀNH TIỀN, TRỊ GIÁ
  HĐ) display with thousand separators (e.g. `200.000`) and are still
  real numbers (right-aligned, usable in a SUM formula), not text.
- Export XLSX and confirm the Option A look: thin grey grid lines on
  every cell, light grey fill on the header row, THÁNG rows, and DOANH SỐ
  rows — no other rows filled.

---

### Export popup scroll — round 3 (actual fix, verified in a real browser)

Phong reported the popup-scroll bug a THIRD time after round 2's
`min-height: 0` fix ("the popup could not scroll still occur"). Rather
than reasoning about the CSS again, built a byte-exact repro of the real
page — extracted the actual `<style>` block from `Styles.html` and the
actual `body.innerHTML` output of `openExportDialog()` (`ViewsOrders.html`)
via Node, assembled them into a real HTML file matching the real DOM
exactly, and rendered it in an actual headless Chromium (Playwright) at
phone viewport sizes to see the real computed layout — not a hand-built
approximation this time.

**Root cause, finally correct**: `Index.html`'s static markup is
`.export-modal-card > #export-modal-body` (an empty wrapper div),
and `openExportDialog()` fills `#export-modal-body`'s `innerHTML` with
`.export-modal-scroll` + `.confirm-actions` as siblings. Rounds 1 and 2
both styled `.export-modal-card` (flex column, `min-height:0`,
`max-height:88vh`) and `.export-modal-scroll` (`flex:1 1 auto`,
`overflow-y:auto`) — correct in isolation, but neither rule ever touched
`#export-modal-body`, which sits between them in the real DOM. Flex
properties (`flex: 1 1 auto`, etc.) only do anything on an element that
IS a flex item of a flex container; `#export-modal-body` was never given
`display:flex`, so it stayed a plain block box that grew to its full
unclamped content height — and `.export-modal-scroll`'s `flex:1 1 auto`
sat inertly on a non-flex-item, never sizing it. The outer card then
clipped that oversized wrapper via `.confirm-modal-card`'s
`overflow:hidden`, with nothing left to scroll. Verified this exact
failure mode first (repro rendered with the actions row landing far
outside the visible card, `cardScrollHeight` 1578 vs `cardClientHeight`
616 in the synthetic repro), then fixed and re-verified against the real
extracted page before touching the repo, confirming both no clipping
(`cardClientHeight === cardScrollHeight`) and real scrolling
(`scrollTop` advances on wheel input, reaching the full scroll extent)
at a small-phone viewport (375×600) with the invoice-date hint showing —
the tallest realistic state of this dialog.

**Fix** (`Styles.html`): added `.export-modal-card > #export-modal-body {
display: flex; flex-direction: column; min-height: 0; flex: 1 1 auto; }`
— the wrapper itself becomes the flex column that fills the card, so its
own children (`.export-modal-scroll` and `.confirm-actions`) are the real
flex items rounds 1-2 assumed they already were. Rounds 1-2's rules stay
in place (still correct, just insufficient alone).

No test-suite changes — this is a pure CSS/DOM-layout fix with no
offline-testable Apps Script logic; verification was the real-browser
render described above, not `exportsheet.test.js`/`export.test.js` (both
still 580/580 passing, unaffected). `node --check` doesn't apply to CSS.

`BUILD`: `web-2026-09-04b-modalscroll` (api unchanged — this round only
touched `apps/web/ui/Styles.html`).

**Live-test checklist for Phong**: open the export dialog on your phone,
pick "Ngày hóa đơn" (the taller state, hint box showing) so the content
is at its tallest, and confirm: the dialog no longer runs off the bottom
of the screen, you can scroll the middle content with your finger, and
"Huỷ"/"Xuất file" stay visible and tappable at the bottom the whole time.
If this still isn't right, a screen recording (not just a screenshot)
showing the attempted scroll would help pin down anything a static repro
can't catch (e.g. a real touch-scroll quirk vs. mouse-wheel).

## Milestone 4, task 4.5.1 — job/checkpoint core (built 2026-09-04)

Foundation for the large-export path (Phong's answer, 2026-09-03: export
size has no real limit, could be multiple years). Apps Script's hard
ceiling is 6 minutes per execution; this task makes an export survive
past that instead of timing out mid-request. Nothing user-visible yet —
no client action, no polling UI (4.5.2), no delivery (4.5.3), no cleanup
(4.5.4). New file: `apps/api/ExportJob.gs`.

**Design**: `startExportJob_(user, payload, format)` builds the same flat
row array `buildExportRows_` already produces for the synchronous XLSX/
PDF path (4.3/4.4), creates a temp Sheet, and writes the grid to it in
slices of `EXPORTJOB_ROWS_PER_BATCH` (1,000) rows, re-checking the clock
after each slice. A small export (the common case) finishes every slice
inline in one request — no different from before, just internally
chunked. Once a single execution has run past `EXPORTJOB_TIME_BUDGET_MS`
(270s, a 90s margin under the real 360s ceiling for the final styling
pass to fit in), it checkpoints the row-cursor into a job record and
schedules a one-off `resumeExportJob_` trigger (fires ~10s later) to
continue, rather than trying to finish in the same execution. Styling
(bold/merge/border/background/number-format — the existing Option-A look
from 4.3/4.4) only runs once, after every row is written, since several
of those calls size themselves off the complete grid.

**Refactored `ExportSheet.gs`** to make this possible without duplicating
grid-building logic: `writeExportRowsToSheet_` used to build+write+style
in one pass. Split into `buildExportGrid_` (pure, builds the 2D array and
bookkeeping — bold/group/total row indexes, order merges, data-row
indexes), `writeExportGridValues_` (just the `setValues` call), and
`applyExportGridStyles_` (everything visual, needs the full grid).
`writeExportRowsToSheet_` is now a 3-line wrapper of these for its
existing callers (`withTempExportSheet_`, unchanged behavior — confirmed
by re-running `exportsheet.test.js`, still 44/44 after the refactor,
before any new ExportJob.gs code was written). `ExportJob.gs`'s batch
loop calls `buildExportGrid_`/`writeExportGridValues_` per-slice and
`applyExportGridStyles_` once at the end — same building blocks, no
second implementation to drift.

**Job record**: `PropertiesService.getScriptProperties()`, one JSON blob
per job (`EXPORTJOB_<jobId>`) — chosen over `CacheService` because a job
must survive between the triggering request and however many retrigger
executions it takes; cache entries can expire mid-job, properties persist
until explicitly removed (4.5.4's job). `LockService.getScriptLock()`
around the batch loop, same pattern as `Orders.gs`'s `withOrderLock_`, so
an overlapping resume can't double-process a job.

**Resume correctness — a real bug the tests caught before it shipped**:
`resumeExportJob_` originally rebuilt the export's row set using a
stand-in `{ email: job.createdBy }` object instead of the real user, on
the (wrong) assumption that only the email mattered for re-deriving the
same filtered rows. It doesn't — `seesMoney_`/`fieldVisible_`/
`canSeeAllOrders_`/`scopeToUser_` all read `user.permissions`, which that
stand-in didn't have. The result: a large export that needed even ONE
checkpoint would silently show real money figures on the first batch's
rows and BLANK money on every row written after a resume — a correctness
bug that would have shipped invisibly (no error, just wrong-looking
data), caught only because `exportjob.test.js` section 3 compared a
checkpointed grid against a synchronous build of the same data and found
they didn't match. Fixed by storing the whole `user` object on the job
record (`job.user`) and reusing it verbatim in `resumeExportJob_`, never
reconstructing a partial one. Section 6 adds a dedicated regression test
for this exact scenario (a price-blind user, forced through 3 checkpoints
via a tiny batch size, asserting every single row — not just the first
batch's — has blank money).

**Split decision**: 4.5 was originally planned as one task ("Async/
large-export infra"). Phong asked to split it into sub-tasks first (same
approach Milestone 3 took for 3.2→3.8) since it's architecturally bigger
and more novel to this codebase than 4.1-4.4 — a whole job/checkpoint/
polling/delivery system, not one request/response feature. Split into
4.5.1 (this task) → 4.5.2 (status polling) → 4.5.3 (Drive+email delivery)
→ 4.5.4 (retention cleanup), each depending on the one before it.

**Tests**: `tools/offline-tests/exportjob.test.js`, new file, 6 sections /
32 assertions — small export finishes inline with no trigger left
pending; permission enforcement; a job forced over budget (tiny batch
size, budget forced negative) checkpoints, schedules exactly one resume
trigger, resumes through 2 more checkpoints, then finishes once budget
allows, with the final grid asserted byte-identical to what a synchronous
build of the same data produces; resuming an already-done or unknown job
is a safe no-op; an error mid-resume (simulated by corrupting the job's
`tempSheetId`) is caught and recorded as `status:'error'` with a message,
not swallowed or left half-checkpointed; and the price-blind-user
regression test described above. `harness.js` (shared by 6 other test
files) extended with minimal in-memory `SpreadsheetApp`/`ScriptApp`
stand-ins (`fakeSpreadsheets`/`fakeTriggers` — a "trigger firing" is
simulated by the test calling `resumeExportJob_` directly, since the
harness runs synchronously) and a `PropertiesService.deleteProperty`
stub that was missing and caused the first test run to throw — both
additive, confirmed non-breaking by re-running the full previous suite
(580/580) before adding ExportJob.gs's own tests. Full suite now
612/612 (export 47, exportjob 32, exportsheet 44, approvestatus-ui 51,
approvestatus 97, changestatus 28, crud 54, filter 60, permissions 116,
ui 83).

`BUILD`: `api-2026-09-04c-exportjobcore` (web unchanged — this task is
entirely server-side infra with no client entry point yet).

**Not live-testable yet**: nothing in this task is reachable from the
client (no Router.gs action registered on purpose — see Split decision
above). `startExportJob_`/`resumeExportJob_` are only exercised by the
offline test suite so far; the real Apps Script trigger scheduler,
6-minute wall clock, and Drive/temp-Sheet behavior are unverified against
the live platform until 4.5.2 gives this a way to actually be invoked and
watched to completion.

## Milestone 4, task 4.5.2 — status polling (built 2026-09-04)

Gives 4.5.1's job/checkpoint core an actual entry point: a client can now
start a large XLSX/PDF export and watch its progress, instead of it being
pure server-side infrastructure with nothing that could invoke it. Still
stops short of delivering the finished file (4.5.3).

**Two new actions** (`apps/api/ExportJob.gs`, registered in `Router.gs`):
- `startExportJob` → `actionStartExportJob_`: validates `payload.format`
  ('xlsx'/'pdf' only — `MSG.EXPORTJOB_BAD_FORMAT` otherwise), then calls
  4.5.1's `startExportJob_`.
- `exportJobStatus` → `actionExportJobStatus_`: returns
  `{jobId, status, rowsWritten, totalRows, format, error}` for one job.
  Scoped to the job's own creator by email match — this is the requester
  checking on their own async request, not a general orders-visibility
  question, so it doesn't reach for `canSeeAllOrders_`. A job belonging to
  someone else and an unknown/expired jobId both fail the same way
  (`MSG.EXPORTJOB_NOT_FOUND`) so polling can't be used to probe whether a
  jobId exists. Response is deliberately narrow — never echoes back
  `job.payload` (the filters) or `job.user` (the full requester identity
  stored for 4.5.1's resume path), just what a progress UI needs.

**Client** (`apps/web/Main.gs` pass-throughs `apiStartExportJob`/
`apiExportJobStatus`; polling logic in `ViewsOrders.html`): the export
dialog decides automatically which path to use, no new choice for
Phong's staff to make. `EXPORT_LARGE_THRESHOLD = 500` (filtered order
count — the dialog already shows this as "N đơn") — above it, XLSX/PDF
go through `runExportLarge_()` (start job → `pollExportJobOnce_()` every
2.5s until `done`/`error`) instead of the existing synchronous
`runExportXlsx`/`runExportPdf` (4.3/4.4, completely unchanged, still the
path for anything at or under the threshold). CSV never checks the
threshold — plain string building has no timeout risk the checkpointed
temp-Sheet-and-Drive-export-URL path exists to solve. The threshold is a
plain constant duplicated (not fetched) on the client, matching
`EXPORT_LARGE_THRESHOLD` in the API project's `Export.gs` — noted in both
places as needing manual sync if Phong wants a different number later.

While a job is polling, the export button shows live progress
("Đang xuất… 1.200/5.000 dòng") via a new `state.exportJobProgress`
(separate from the existing plain `state.exporting` boolean the
synchronous path still uses, since this path has real numbers to show).
Reaching `status:'done'` currently just toasts that the export finished
server-side — there's no download yet, since the finished job's temp
Sheet just sits in the API project's Drive until 4.5.3 gives it
somewhere to go (Drive link + email). The toast says so plainly ("Tính
năng tải/gửi file sẽ có ở bước tiếp theo") rather than implying a
download is about to start and then not delivering one.

**Tests**: `tools/offline-tests/exportjob.test.js` +18 (32→50) — sections
7-8: `actionStartExportJob_` rejects a missing/unrecognized format and
enforces the `export` permission before `actionExportJobStatus_` is even
reachable; `actionExportJobStatus_` reports the right shape while running
and once done, never leaks `payload`/`user`, refuses another user's job
and an unknown jobId with the same error (no existence oracle), and
tracks a job through to completion. Full suite: 630/630 (export 47,
exportjob 50, exportsheet 44, approvestatus-ui 51, approvestatus 97,
changestatus 28, crud 54, filter 60, permissions 116, ui 83).

`BUILD`: `api-2026-09-04d-exportjobstatus` / `web-2026-09-04c-exportjobstatus`.

**Not live-testable in a meaningful way yet**: the job path can now be
started and polled, but there's still nothing to download at the end
(4.5.3) — a live test today would only confirm the progress UI updates
and the toast fires, not that a real 500+-order export actually
completes correctly against live Sheets/Drive within the real 6-minute
wall clock. Worth a live smoke test once 4.5.3 lands so the whole path
(start → checkpoint/resume for real → deliver) can be verified end to
end in one pass rather than piecemeal.

### 4.5.2 revision — count order LINES, not orders; make the threshold config-driven

Phong asked, right after 4.5.2 shipped: "does threshold count order or
order line is better?" — the right question, since `ExportJob.gs`'s
checkpointing batches by SHEET ROW, and this project writes one export
row per order LINE (`buildExportRows_`, true for both order-date and
invoice-date basis). Order count was the wrong proxy: a handful of orders
with many lines each can take just as long to export as many
single-line orders, and the original `EXPORT_LARGE_THRESHOLD = 500`
(order count) would have under-triggered exactly that case. Phong also
asked for the threshold itself to be configurable rather than a
hardcoded constant duplicated (and manually kept in sync) on both the API
and web projects.

**Server** (`Orders.gs`): `actionListOrders_` now also returns
`totalLines` — the sum of `lineCount` (already a maintained per-order
column, Migrations.gs P5) across the WHOLE filtered set, not just the
page being shown. Free to compute: `orders` (the full filtered array,
pre-pagination) is already in memory with `lineCount` on every row.

**Config-driven threshold** (`Config.gs`): new `exportLargeThreshold`
Config-sheet row, default `'500'`, with a Vietnamese description so an
admin editing the Config sheet directly understands what it controls —
same pattern as `approvalFlowEnabled`. `Export.gs`'s hardcoded
`EXPORT_LARGE_THRESHOLD` constant is gone, replaced by
`exportLargeThreshold_(config)` (parses the config value, falls back to
500 for anything missing/zero/negative/non-numeric).

**Client** (`ViewsOrders.html`): `doExportCsv` now compares
`state.ordersMeta.totalLines` (not `.total`) against a new
`exportLargeThreshold_()` that reads `config().exportLargeThreshold` —
the whole public config already reaches the client via `getSession`
(`T.config()`), so this needed no new round trip, just reading a field
that wasn't being read before. The client-side hardcoded duplicate
constant is gone along with the "kept in sync manually" comment that
used to caveat it.

**Tests**: `orders-crud.test.js` +4 (54→58) — `totalLines` sums lineCount
across the full filtered set regardless of `pageSize`/which page is
requested, and respects the same filters `total` does. `export.test.js`
+6 (47→53) — `exportLargeThreshold_` returns the configured value, and
falls back to 500 for each invalid case (missing key, zero, negative,
non-numeric, and confirms a plain number — not just a numeric string —
also works). Full suite: 640/640 (export 53, exportjob 50, exportsheet
44, approvestatus-ui 51, approvestatus 97, changestatus 28, crud 58,
filter 60, permissions 116, ui 83).

`BUILD`: `api-2026-09-04e-exportthreshold` / `web-2026-09-04d-exportthreshold`.

**Live-test note**: an admin can now change the Config sheet's
`exportLargeThreshold` row and see the export dialog's large/small
routing change without a redeploy — worth confirming once live, along
with checking that `totalLines` in the list response looks right for a
mix of single- and multi-line orders.

### Drive cleanup never actually worked — wrong OAuth scope (found 2026-09-04)

Phong noticed both XLSX and PDF exports were leaving temp files behind in
Drive, never trashed — despite `withTempExportSheet_`'s `finally` block
looking correct (calls `DriveApp.getFileById(ss.getId()).setTrashed(true)`
unconditionally, success or failure). Rather than guess, wrote a
diagnostic script (`manualTestExportCleanup`, pasted directly into the
API project's online editor) that ran the real `actionExportOrdersPdf_`
and separately isolated the `DriveApp.setTrashed` call — its error came
back exact and unambiguous:

```
Specified permissions are not sufficient to call DriveApp.getFileById.
Required permissions: (https://www.googleapis.com/auth/drive.readonly ||
https://www.googleapis.com/auth/drive)
```

**Root cause**: the manifest (`appsscript.json`) declared
`drive.file`, added back in 4.3 alongside `script.external_request`.
`drive.file` looked sufficient at the time (the temp Sheet is a file the
script itself creates) but it isn't — `DriveApp.getFileById()` and
`DriveApp.searchFiles()` specifically require the broader `drive` or
`drive.readonly` scope, regardless of who created the file. This wasn't
a "click through the authorization prompt again" situation like the
earlier `script.external_request` gap — it was a genuinely wrong/
insufficient scope in the code, so `ExportSheet.gs`'s `try/catch` around
the cleanup call was silently swallowing this exact error on literally
every single XLSX/PDF export since 4.3 shipped, with only a
`console.error` (visible in Executions, never surfaced to a user) to
show for it. CSV was unaffected — it never touches Drive at all
(`buildExportCsv_` is plain string building, no temp Sheet).

**Fix**: `appsscript.json`'s `drive.file` scope changed to `drive` (write
access, not just read — `setTrashed` is a write, and 4.5.3 will need to
move a finished job's file into an Exports folder, which `drive.file`
also couldn't do reliably for a script-created file). `docs/SETUP.md`'s
scope summary table updated to match — it still said `drive.file`.

**This needs a live re-authorization + redeploy**, same dance as the
`script.external_request` gap earlier in Milestone 4: since the manifest's
scope set changed, run any function that touches `DriveApp` in the online
editor (the diagnostic script above works, or just `manualTestExportCleanup`
again) to trigger a fresh consent prompt for the new scope, then Deploy >
Manage deployments > edit the active deployment > New version > Deploy,
so the deployed web app (not just the editor) picks up the new consent.

No test-suite changes — offline tests stub `DriveApp` entirely (correctly
so, for a fast unit-level test), so this class of bug — a real, live
scope mismatch — was never going to be caught by them; it only ever
surfaces by actually running against real Drive, which is exactly how
Phong found it and how the diagnostic script confirmed it.

`BUILD`: `api-2026-09-04f-drivescope`.

**Live-test checklist for Phong**: after granting the fresh `drive`
consent and redeploying, re-run `manualTestExportCleanup` (or just export
an XLSX/PDF from the app normally) and confirm step 3/4's before/after
Drive file count no longer grows — the whole point of this fix. Old
already-orphaned "export-*" files from before this fix are NOT
auto-cleaned by this change (that's what 4.5.4, retention cleanup, will
eventually handle for the async path) — those need a one-time manual
trash/delete in Drive if Phong wants to clear the backlog now rather than
wait.

### 4.5.3 — Drive + email delivery (2026-09-04)

Closes the gap 4.5.1/4.5.2 deliberately left open: once a large-export
job finishes writing and styling every row, it's `status: 'done'` but
the data only existed as a temp Sheet sitting in Drive — nothing turned
that into an actual downloadable file or told the requester it was
ready. `deliverExportJob_` (new, `apps/api/ExportJob.gs`) closes that
loop, called from `runExportJobWork_` right after a job is marked
`'done'`, still inside the same lock/execution:

1. Exports the finished temp Sheet to real xlsx/pdf bytes — reuses
   `fetchSpreadsheetExportBase64_` (already built for 4.3/4.4's
   synchronous path, no new export mechanism needed).
2. Saves that as a real file into a shared Drive folder (`exportsFolder_`,
   get-or-create by name: **"Xuất file đơn hàng (THIÊN TÂN)"**) — a flat,
   Phong-browsable place for finished large exports, separate from the
   throwaway `export-<uuid>` temp Sheets both export paths create along
   the way.
3. Emails the requester (`job.user.email`) a link to that Drive file,
   always. If the file is under 20MB (`EXPORTJOB_EMAIL_ATTACH_MAX_BYTES`
   — comfortably under Gmail's ~25MB per-message ceiling, which counts
   the whole message not just the attachment), it's also attached
   directly so the common case lands in the inbox with no extra click.
   Past that size, the email explains it's link-only.
4. Only now trashes the temp Sheet (`DriveApp.getFileById(job.tempSheetId)
   .setTrashed(true)`, same pattern `withTempExportSheet_` already uses
   for the synchronous path) — its job was to produce this one file, and
   once the file is safely in Drive there's nothing left to keep the
   scratch copy around for.

**Failure handling**: delivery never turns a finished job into
`status: 'error'` — the rows are already correctly written and styled at
that point, so a Drive-quota or MailApp hiccup on the delivery step is
strictly a delivery problem, not an export problem. Instead
`job.deliveryError` is set and the temp Sheet is deliberately **not**
trashed on a delivery failure, so the data isn't lost — 4.5.4's
retention pass (or a manual look) has something to reconcile instead of
a silently vanished file.

**Status action**: `actionExportJobStatus_` now also returns
`deliveryUrl`/`deliveryError`. A `'done'` job with `deliveryUrl` set means
fully delivered; `'done'` with `deliveryUrl` null and `deliveryError` set
means the export itself succeeded but delivery didn't — the client shows
that distinctly rather than lumping it in with a real export failure.

**Client** (`apps/web/ui/ViewsOrders.html`, `pollExportJobOnce_`): the
placeholder "Tính năng tải/gửi file sẽ có ở bước tiếp theo" toast is gone.
On `done` + `deliveryUrl`, it opens the Drive file in a new tab and toasts
that the file is saved to Drive and emailed. On `done` without a
`deliveryUrl` (delivery failed), it toasts the specific delivery error
instead of implying nothing happened.

**Tests**: `tools/offline-tests/harness.js` gained `DriveApp`/`MailApp`/
`UrlFetchApp` in-memory stand-ins (`fakeDriveFolders`, `fakeDriveFiles`,
`fakeEmails`) plus `Utilities.base64Encode`/`base64Decode`/`newBlob`
(previously only `getUuid` was stubbed — `fetchSpreadsheetExportBase64_`
and the new delivery code both needed the rest).
`tools/offline-tests/exportjob.test.js` gained 4 new sections (30
assertions): successful delivery (folder created, file saved+untrashed,
temp sheet trashed, one email with the right recipient/subject/body/
attachment), the link-only fallback past the size threshold, a simulated
Drive failure leaving the job `'done'` with `deliveryError` set and the
temp sheet un-trashed, and `actionExportJobStatus_` surfacing the new
fields. Full offline suite: 669/669 passing across all ten test files.

`BUILD`: `api-2026-09-04g-exportdelivery` / `web-2026-09-04e-exportdelivery`.

**Live-test checklist for Phong** (after pasting the updated `.gs`/`.html`
files into the online editors and deploying a new version): trigger a
large export (temporarily lower `exportLargeThreshold` in the Config
sheet if you don't have 500+ order lines handy to test with for real),
confirm (a) a file actually appears in a new **"Xuất file đơn hàng (THIÊN
TÂN)"** Drive folder, (b) an email arrives at your login address with the
Drive link, and — if the file is small — the file attached directly, (c)
clicking "Xuất file" in the app opens that Drive file in a new tab once
the job finishes. No new OAuth scope is needed for this step (`drive`
already covers folder/file creation and `MailApp.sendEmail` doesn't need
a Drive scope at all), so this shouldn't need a fresh consent prompt —
but if one appears anyway, click through it the same way as before.

### 4.5.3 follow-up — popup blocked (found 2026-09-04)

Phong tried the delivered file and got Chrome's "Pop-ups blocked" bar
instead of the Drive file opening. Root cause: `pollExportJobOnce_` called
`window.open(status.deliveryUrl, '_blank')` from inside a `setTimeout`/
`.then()` poll chain — by the time a large job actually finishes, that's
seconds to minutes after the click that started the export, well outside
the "direct user gesture" window browsers require before allowing a
script-triggered popup. Every major browser blocks this by default; it
was never going to work reliably regardless of environment.

**Fix**: stopped trying to auto-open anything. `status.deliveryUrl` is now
stored on `state.exportDelivery` and rendered as a real, visible
`<a target="_blank">` link in a dismissible banner above the order list
(`exportDeliveryHtml_`, new, in `ViewsOrders.html`) instead of an
auto-popup — a genuine click on a real anchor is never blocked as a
popup, unlike a script call. The banner shows "File Excel/PDF đã sẵn sàng:
Mở file trên Drive (đã gửi email)" with a "Đóng" dismiss button, clears
itself when a new large export starts, and the toast on completion no
longer implies a tab is about to open on its own. The emailed copy
(already sent server-side by `deliverExportJob_`, unaffected by this bug)
remains the reliable fallback either way.

No server-side change — `actionExportJobStatus_`'s response shape is
unchanged, this is purely how the client presents `deliveryUrl`.

`BUILD`: `web-2026-09-04f-deliverypopupfix`.

**Live-test checklist for Phong**: paste the updated `ViewsOrders.html`
and `Styles.html` into the web project's online editor, redeploy, run a
large export again, and confirm a green banner with a working "Mở file
trên Drive" link appears once the job finishes (no popup-blocked bar this
time) — click it to confirm it actually opens the file.

## Milestone 4, task 4.5.4 — retention cleanup (built 2026-09-04)

Closes the last gap in the 4.5 split: 4.5.3 delivers a finished large
export to Drive and email, but nothing ever removed the delivered file
(or, for the rarer case of a failed delivery, the leftover temp Sheet)
or the job record itself — left alone, the export folder and
`PropertiesService` would both grow forever.

**`cleanupExportJobs`** (new, `apps/api/ExportJob.gs`) — the daily
trigger target, following the exact same shape as `Security.gs`'s
`checkSecretExpiry`/`installExpiryReminder` pair (editor-only install
function + trigger target, no HTTP action, no trailing underscore so
both appear in the online editor's Run dropdown — matching
`guardSetup_`'s documented convention, which the first draft of this
task briefly got wrong by naming them with a trailing underscore before
being corrected against the existing precedent). Scans every
`PropertiesService` key prefixed `EXPORTJOB_` (skipping
`EXPORTJOB_PENDING_RESUME`, the one non-job key sharing that prefix
family), and for any job whose `updatedAt` is older than
`exportRetentionDays_()` (config-driven, same pattern as
`exportLargeThreshold_`, default 14 days):

- a successfully delivered job (`job.deliveryFileId` set) — trashes the
  Drive file in the shared export folder;
- a job whose delivery failed, or that's still stuck `'running'`
  (`job.tempSheetId` set, no `deliveryFileId`) — trashes the temp Sheet
  instead, since that's the only leftover in that case (`deliverExportJob_`
  deliberately leaves it in place on a delivery failure — see 4.5.3);
- either way, deletes the job record itself.

Each job is wrapped in its own try/catch so one corrupt record or one
Drive error can't stop the rest of the sweep, matching the per-item
error handling `deliverExportJob_`/`withTempExportSheet_` already use.
Never throws to its trigger caller; returns a one-line summary
(`removed N job(s), M failure(s)`) that also lands in Executions logs
for a manual check.

**Config**: new `exportRetentionDays` row (default `'14'`), same
config-driven pattern Phong asked for with `exportLargeThreshold` in
4.5.2 — tunable from the Config sheet without a code deploy.

**Install**: `installExportJobCleanupReminder()` — run once from the API
editor, same as `installExpiryReminder()` — installs a trigger firing
daily at 03:00 Asia/Ho_Chi_Minh (off-hours, well clear of when exports
are actually being run). Deletes any existing `cleanupExportJobs`
trigger first, so re-running the install is idempotent.

**Tests**: `tools/offline-tests/harness.js` gained
`PropertiesService...getProperties()` (cleanup needs to enumerate every
stored key, not just look one up) and `ScriptApp.newTrigger(...)`'s
`everyDays`/`atHour` chain (previously only `after(ms)` was stubbed, for
the resume-trigger path). `exportjob.test.js` gained 4 new sections (21
assertions): a delivered job past retention gets its Drive file trashed
and record removed; a recent job is left alone; a failed-delivery job's
leftover temp sheet is reclaimed (and a per-job Drive error during
cleanup doesn't stop the record from being removed); `exportRetentionDays_`
config parsing and the install function's idempotency. Full offline
suite: 686/686 passing across all eleven test files.

`BUILD`: `api-2026-09-04h-exportretention` (no client change this task).

**Live-test checklist for Phong**: after pasting `ExportJob.gs`,
`Config.gs`, and `Setup.gs` into the API project's online editor and
deploying a new version, run `installExportJobCleanupReminder` once from
the Run dropdown (authorize if prompted — no new scope, just the trigger
itself) and confirm the log says "Daily export cleanup installed".

**Live-verified 2026-09-04** — a paste-in diagnostic
(`manualTestExportCleanupRetention`, printed in chat, not part of the
repo) created two fake job records backdated 20 days past the retention
window: Case A a normal delivered job pointing at a real throwaway Drive
file, Case B a delivery-failed job pointing at a real leftover temp
Sheet. Ran the real `cleanupExportJobs()` against them. Result: both job
records removed, both files actually trashed in Drive (confirmed via
`DriveApp...isTrashed()`, not just "no error thrown"). The run also
reported "removed 4 job(s)" — 2 more than the 2 fakes the script
created — meaning it also swept up 2 real leftover job records already
past retention from this session's own earlier live testing, which is
exactly the intended behavior on a real backlog, not a bug.

---

Milestone 4's large-export pipeline (4.5.1-4.5.4) is now fully built:
checkpointed writes past the 6-minute limit, status polling, Drive +
email delivery, and retention cleanup so nothing accumulates
indefinitely. Remaining in Milestone 4: 4.6 (statistics aggregation) and
4.7 (statistics UI) — not yet started.

## Milestone 4, tasks 4.6/4.7 — split into sub-tasks (2026-09-04)

Same reasoning as the 4.5 split: 4.6 (aggregation) + 4.7 (a whole new
Chart.js UI screen) is large enough to lose the "one task, one tested
step" convention (`AGENTS.md` §7) if built as two single tasks. Split,
confirmed with Phong, into:

- **4.6.1** — revenue by time period (week/month/quarter/year). The
  existing `monthKey_`/`bucketOrdersForExport_` in `Export.gs` already
  buckets by month for export (4.1/4.2) and is explicitly documented as
  shared with statistics — this generalizes that same per-line
  ex-VAT/inc-VAT bucketing to week/quarter/year as additional period
  granularities, not a rewrite. Also covers the new `statsRevenue` action
  and its `view_statistics` permission gate (`export_statistics` comes
  later, with whatever export format 4.7 ends up needing, if any —
  deferred until the UI shape is known).
- **4.6.2** — revenue by customer and by status. A genuinely different
  aggregation axis (group by `customer`/`status` field, not by date), so
  kept as its own task rather than folded into 4.6.1's date-bucketing
  logic.
- **4.7.1** — the stats view itself: period toggle (week/month/quarter/
  year, mirroring the export basis toggle's UX), one Chart.js chart, and
  a totals table (ex-VAT/inc-VAT side by side, per Q2). Enough to be a
  usable, reviewable screen on its own.
- **4.7.2** — customer/status breakdown views (feeding off 4.6.2), any
  filters (date range, customer, status — mirroring the order list's
  existing filter bar where it makes sense), and polish.


## Milestone 4, task 4.6.1 — revenue by time period (built 2026-09-04)

New `Stats.gs`: `statsRevenue_(rows, basis, period)` aggregates the same
per-line `amountExVat`/`amountIncVat` figures export already reads into
summed totals per period bucket — deliberately a leaner path than
`bucketOrdersForExport_` (which builds full `{order, lines}` groups sized
for writing spreadsheet rows); statistics only ever needs
`{exVat, incVat, lineCount}` per bucket.

**Basis default is invoice date**, not order date — this is the opposite
default from export (4.1/4.2), per Q2's explicit answer
(`OPEN_QUESTIONS.md`: "Default is invoice date, because that is what the
invoice numbers in the file imply"). Order-date basis buckets every
order's lines by the order's own date, same shape export already uses.
Invoice-date basis buckets **per line** (an order split across two
invoiced months contributes to both buckets — same per-line reasoning as
`bucketByInvoiceDate_`), and — also per Q2 — any line with no invoice yet
is excluded from the date buckets entirely and summed into a separate
`noInvoice` figure instead of being silently dropped or miscounted into
some default bucket.

**Period granularity** (new for stats, doesn't exist in export): week,
month, quarter, or year, generalizing the existing `monthKey_`/
`monthLabel_` rather than reimplementing date-bucketing from scratch —
month/year both defer to simple key math, quarter derives from the month
number, and week uses a real ISO-8601 week definition (week 1 = the week
containing Jan 4th; computed via the standard Thursday-shift algorithm)
so it lines up with what Sheets' own `WEEKNUM(date, 21)` would produce,
not an arbitrary Sunday/Monday-start scheme that would disagree with how
Phong might sanity-check a number by hand.

**Filtering/scoping**: reuses `computeOrderFilters_`/
`filteredOrderRowsForUser_` verbatim — the exact same date-range/
customer/status/createdBy/search filters and permission gating
(`view_all_orders` scoping, `fieldVisible_` on filter values) the order
list and every export action already use, not a second set of rules that
could quietly drift from those over time.

**Action**: `statsRevenue` (`actionStatsRevenue_`), gated on the
`view_statistics` permission (already existed in `PERMISSIONS.md`,
granted to Admin/Accountant — see the matrix). Registered in `Router.gs`;
client pass-through `apiStatsRevenue(payload)` added to `apps/web/Main.gs`
(no UI wired to it yet — that's 4.7.1).

**Tests**: new `tools/offline-tests/stats.test.js`, 34 assertions —
permission gating, basis/period defaults, order-date monthly sums,
invoice-date bucketing (single invoice, a split order across two months,
an unbilled line landing in `noInvoice`), all four period granularities
(year, quarter including a Q3-empty gap, week including two dates
sharing an ISO week vs. one in the next), and filter/scoping parity with
the order list (an account without `view_all_orders` only sees its own
revenue, a customer filter narrows the aggregation the same way it does
for export). `tools/offline-tests/harness.js` gained `Stats.gs` to its
loaded-files list — no new stubs needed, everything `Stats.gs` touches
was already covered by Orders.gs/Export.gs's existing harness support.
Full offline suite: 720/720 passing across all twelve test files.

`BUILD`: `api-2026-09-04i-statsrevenue` (no client-facing change yet —
`apiStatsRevenue` exists but nothing calls it until 4.7.1's UI).

**Live-test checklist for Phong**: nothing to click yet — this task is
server-only aggregation logic with no UI. Once 4.7.1 wires up a stats
screen, that task's checklist will be the first place this is actually
exercised live end to end.

## Milestone 4, task 4.6.2 — revenue by customer and by status (built 2026-09-04)

New `statsByCustomer`/`statsByStatus` actions
(`actionStatsByCustomer_`/`actionStatsByStatus_`, `Stats.gs`), the other
aggregation axis 4.6.1 deferred: grouping by a field on the order
(`customer`/`status`) instead of by date period.

**Confirmed with Phong before building**: these also respect the same
basis toggle (order date / invoice date) and `noInvoice` split as 4.6.1's
time-period view, rather than always summing every matched order
regardless of billing status — consistent with Q2's answer, and avoids a
customer's revenue figure silently including work that hasn't been
invoiced yet under invoice-date basis (the default).

**Refactor**: `statsRevenue_`'s per-line walk (decide bucket key, sum
into it, route an unbilled line to `noInvoice` under invoice-date basis)
was pulled out into a new shared `statsAggregateByLine_(rows, basis,
keyFn)` — `keyFn(order, invDate)` gets called once per LINE and decides
the bucket key; `invDate` is only ever non-null for invoice-date basis on
a line that resolved a real date. `statsRevenue_` uses `order.orderDate`/
`invDate` + the period granularity to build a key; the new
`statsByField_` (shared by both by-customer and by-status) ignores the
date entirely and keys off a field on the order instead. This is the ONE
place the basis/noInvoice logic lives now — 4.6.1's tests kept passing
unchanged through the refactor, confirming the extraction didn't shift
behavior.

**Sorting**: groups come back sorted by `incVat` descending (biggest
contributor first) — a revenue breakdown reads top-to-bottom as "who/
what contributes most," unlike the time-period view, which stays
chronological.

**Status labels**: reuses `statusLabelIndex_`/`statusLabelText_`
(Export.gs) to resolve each status key to its real Vietnamese label from
`Config.statusList` — one label source for the whole app, not a second
copy that could drift.

**Permission gating**: both actions require `view_statistics` (same as
4.6.1) AND `fieldVisible_(user, 'customer'/'status')` — a role that
can't see the customer or status column on an order doesn't get a
breakdown by that field either, same principle
`computeOrderFilters_`/`matchesSearch_` already apply to filtering and
searching on those fields.

**Tests**: `stats.test.js` gained 5 sections (14 assertions): customer
grouping with correct sort order and multi-order summing, the invoice-
date basis + `noInvoice` split applied correctly to a customer breakdown,
a customer-field-blind role refused, status grouping with real labels,
and a status-field-blind role refused. Full offline suite: 734/734
passing across all twelve test files.

`BUILD`: `api-2026-09-04j-statsbyfield` (no client change yet —
`apiStatsByCustomer`/`apiStatsByStatus` pass-throughs exist in
`apps/web/Main.gs` but nothing calls them until 4.7.2's UI).

**Live-test checklist for Phong**: still nothing to click — 4.7.1/4.7.2
are what put a screen in front of this.

---

4.6 (statistics aggregation) is now fully built: time-period revenue
(4.6.1) and customer/status breakdowns (4.6.2), both basis-aware and
consistently permission-scoped. Remaining in Milestone 4: 4.7.1 (stats
view UI — period toggle, one chart, totals table) and 4.7.2 (customer/
status breakdown views, filters, polish).

## Milestone 4, task 4.7.1 — stats view UI (built 2026-09-04)

New `ViewsStats.html` (was a documented stub — no earlier implementation
to preserve), wired into the same view-module pattern `ViewsOrders.html`
established: `window.TTStats = { render }`, registered in `App.html`'s
`VIEW_MODULES` as `statistics: 'TTStats'`, included in `Index.html`. The
"Thống kê" nav tab already existed in `App.html`'s `VIEWS` list, gated on
`view_statistics` — it just had nothing behind it until now.

**Screen**: a basis toggle (Theo ngày hoá đơn / Theo ngày đặt hàng —
same two options and Vietnamese labels as the export dialog's own basis
choice, invoice-date active by default per Q2), a period `<select>`
(Tuần/Tháng/Quý/Năm), one Chart.js bar chart (ex-VAT and inc-VAT as two
series per period, per Q2's "neither is 'the' number, show the pair"),
and a totals table below it with the same per-period figures plus a
summed footer row. Every toggle/select change re-fetches from
`apiStatsRevenue` (4.6.1) — no client-side re-aggregation, so the server
stays the single source of truth for what a bucket contains. A
"Chưa xuất hoá đơn" card appears only for invoice-date basis when there's
actually an unbilled figure to show (Q2's separate figure, not folded
into the chart/table).

**Chart.js**: loaded via `<script src="https://cdnjs.cloudflare.com/...">`
— confirmed feasible under `HtmlService`'s `XFrameOptionsMode.ALLOWALL`
sandbox by this session's earlier research (see the Milestone 4 "Technical
approach" notes above). `drawChart` guards on `typeof Chart === 'undefined'`
so a CDN hiccup degrades to "table works, chart missing" rather than a
broken page.

**CSS**: new rules appended to `Styles.html` (`.stats-basis-toggle`,
`.stats-period-row`, `.stats-chart-card`, `.stats-table-card`/
`.stats-table`, `.stats-noinvoice-card`, `.btn-mini.active`) — reuses
existing tokens/`.card`/`.btn-mini` rather than inventing a parallel
style vocabulary for one screen.

**No new offline tests** — this is browser DOM/rendering code with no
Apps Script `.gs` logic of its own; the harness tests server-side `.gs`
files in a Node `vm`, which doesn't apply here. The 4.6.1 aggregation
this screen calls is already covered by `stats.test.js`'s 48 assertions.
Full offline suite (unaffected by this task): 734/734 passing.

`BUILD`: `web-2026-09-04h-statsview` (no API change this task).

**Live-test checklist for Phong**: paste `ViewsStats.html`, `App.html`,
`Index.html`, `Styles.html` into the web project's online editor and
deploy a new version, then open the "Thống kê" tab (only visible to an
account with `view_statistics` — Admin/Accountant per the permission
matrix). Confirm: the chart actually renders (this is the one thing I
could not verify myself — the CDN fetch for Chart.js couldn't be checked
from this environment's network, so the very first thing to look for is
whether a chart appears at all, not just whether the table does); the
basis toggle and period selector each reload and change the numbers;
switching to invoice-date basis shows a "Chưa xuất hoá đơn" card when
there are unbilled orders, and it disappears under order-date basis;
the totals table's footer row sums correctly against what's shown per
period.

### 4.7.1 revision — pure-CSS chart, chart-type switch, skeleton loading (2026-09-04)

Live feedback on the first 4.7.1 draft: the layout felt cramped/
unpolished, the basis/period controls were awkward, the totals table was
hard to read, and — the real bug — **the chart never rendered at all**.

**Root cause of the missing chart**: the first draft loaded Chart.js from
a CDN `<script src>` tag. While mocking up redesign options as artifacts
to review with Phong, the exact same CDN-script approach silently failed
to render there too — no console error, nothing — which is how a blocked
or failed external script behaves: quietly do nothing rather than throw.
Rather than chase down whether the CDN URL, version, or CSP was the
actual cause, the chart was rebuilt entirely in plain CSS (bar heights
via inline `style="height:N%"`, all colors from existing `--c-*` tokens)
— nothing left to fail to load. Confirmed working once redrawn this way
in the same mockup review process.

**Design process**: rather than iterate blind again, built and published
several rounds of side-by-side mockups (A through H — segmented toggle +
table, sidebar radios, minimal headline number, tabbed periods + totals
strip, ranked leaderboard, dashboard hero + trend line, dense mobile
card, data-labeled bars) as an Artifact for Phong to compare directly.
Phong picked **Option A** (segmented basis toggle + pill period selector,
chart above a stat-card row above a full totals table) and asked for two
more things on top: letting the user choose how the chart is drawn, and
a proper loading skeleton instead of a bare "Đang tải…" line.

**Chart-type switch** (new): three ways to draw the SAME fetched data,
switched client-side with no re-fetch (`state.chartType`, `onClick`'s
`stats-chart-type` branch) — grouped bars (ex-VAT/inc-VAT side by side
per period, the default), stacked bars (inc-VAT as the full bar height,
ex-VAT as the base segment — reads faster with many periods, e.g. a full
year of weeks), and a ranked list (biggest period first, horizontal bars
— easiest to scan for "which period did best" without comparing bar
heights by eye).

**Skeleton loading**: reuses the `.sk-line`/shimmer animation
`ViewsOrders.html`'s own skeleton already established (Milestone 2.5 /
P3) rather than inventing a second loading-state visual language, plus a
new chart-shaped variant (`.sk-chart`/`.sk-bar-*`, uneven bar heights,
same gradient animation) so the loading state reads as "a chart is about
to appear" rather than a generic gray box.

**CSS**: the whole 4.7.1 stats section in `Styles.html` was replaced
(not just added to) — segmented toggle, period pills, chart-type pills,
grouped/stacked/ranked bar styles, chart legend, and the skeleton
chart shape. Verified every CSS class the rewritten `ViewsStats.html`
generates has a matching rule (no orphaned class names either
direction).

No server-side change — `Stats.gs`/`apiStatsRevenue` untouched, this is
purely how the client fetches once and renders the same response three
different ways.

`BUILD`: `web-2026-09-04i-statsview-v2`.

**Live-test checklist for Phong**: paste the updated `ViewsStats.html`
and `Styles.html` into the web project's online editor and redeploy.
Confirm: the chart now actually renders (grouped bars by default); the
three chart-type pills (Cột ghép / Cột chồng / Xếp hạng) switch the same
data between the three drawings without a network request each time
(should feel instant); the loading skeleton appears briefly on first
open of the "Thống kê" tab and looks like a chart+table shape, not a
blank screen or the wrong kind of skeleton.

---

### 4.7.1 follow-up: cross-tab async race — stale tab's response overwrites the current tab

**Bug reported live by Phong (2026-09-04)**: switching tabs quickly (e.g.
Đơn hàng → Thống kê) sometimes showed the OLD tab's content first, then
flipped over to the new tab's content only once that tab's own load
finished — even though the new tab was already focused/selected. Phong's
own words: "the tab reponse first make UI show it first (e.g the list)
although the tab are already focus on Stat, then when stat load
completed, the UI change to stat," and flagged it as a recurring class of
bug ("the old issue").

**Root cause**: `App.html`'s `show(viewId)` repaints one shared `<main>`
DOM node by handing it to whichever view module (`TTOrders`/`TTStats`)
is active. Each view module's own `load()`/fetch call is async
(`google.script.run` via `T.call`), and nothing stopped a slow response
from a view the user had already navigated AWAY from from still firing
its `.then()`/`.catch()` and repainting `main` after a different, newer
view had already rendered — the two tabs shared no synchronization, so
whichever network response happened to land LAST won, regardless of
which tab was actually selected. `ViewsOrders.html` already had a
same-view staleness guard (`viewSeq`, from Milestone 2.5b/L2) for races
*within* the Orders tab (e.g. two list reloads racing each other), but
that counter was never bumped by anything outside `ViewsOrders.html`, so
it did nothing to protect against a DIFFERENT tab's stale response.
`ViewsStats.html` had no staleness guard of any kind yet (4.7.1 was its
first working version).

**Fix — a shared cross-tab generation counter**:
- `App.html`: new `viewGeneration` counter, incremented once on every
  `show(viewId)` call (i.e. every tab switch, including switching back to
  a tab that's already open). Exposed on the `window.TT` bridge as
  `T.viewGeneration()` (read the current value) and
  `T.isCurrentView(viewId, snapshot)` (true only if that view is still
  the active tab AND no switch has happened since `snapshot` was taken).
- `ViewsStats.html`: `render()` captures `myGeneration = T.viewGeneration()`
  once. `load()`'s `.then()`/`.catch()` now check
  `T.isCurrentView('statistics', snapshot)` before touching `state`/
  calling `paint()` — a stale response is silently dropped.
- `ViewsOrders.html`: `render()` now also bumps `viewSeq` (in addition to
  `showList()`'s own bump), so leaving the Orders tab — not just
  reloading within it — invalidates every in-flight callback guarded by
  the existing `seq !== viewSeq` checks (list load, silent refresh,
  reload-current-order, save/delete/status-change flows, etc. — all of
  them already used this same counter, they just weren't being bumped on
  tab-away before). `ensureCreatorsLoaded()` (the filter-bar creators
  dropdown, fetched on every `showList()`) had no staleness guard at all
  before this and could repaint the list after the user left the tab; it
  now snapshots `T.viewGeneration()` and checks `T.isCurrentView(...)`
  the same way `ViewsStats.html` does.

Deliberately NOT attempting to cancel the in-flight `google.script.run`
call itself — there is no cheap abort for it. The request is left to run
to completion; only its ability to reach the DOM is gated.

No server-side (`.gs`) change — this is pure client DOM/timing logic, so
`tools/offline-tests` (Node `vm` harness for `.gs` files) doesn't cover
it; verified by syntax-checking each modified file's inline `<script>`
block with `node -e "new Function(...)"` and re-running the full offline
suite to confirm no `.gs` regressions (48/48 stats, all suites green).

`BUILD`: `web-2026-09-04j-crosstabrace`.

**Live-test checklist for Phong**: paste the updated `App.html`,
`ViewsStats.html`, and `ViewsOrders.html` into the web project's online
editor and redeploy (no API-side changes this time, so only the web
project needs a new version). Then specifically try to reproduce the
original bug: click Đơn hàng → immediately click Thống kê → immediately
click Đơn hàng again, repeating quickly a few times in both directions,
and confirm the screen always ends up showing whichever tab you're
actually on, never a flash of the tab you left. Also worth trying once
on a slower connection/throttled network if easy, since the bug is
timing-dependent and a fast machine may not reliably reproduce it even
when the bug is present.

---

### 4.7.1 follow-up 2: stats screen UI polish (control grouping, stacked-chart baseline, mobile)

**Reported live by Phong (2026-09-04)**, three issues from screenshots after
the cross-tab race fix was confirmed working:

1. The basis toggle ("Theo ngày hoá đơn"/"Theo ngày đặt hàng") and the
   period pills ("Tuần"/"Tháng"/"Quý"/"Năm") sat right on top of each
   other with matching spacing, reading as one control instead of two
   separate decisions ("look too close").
2. In the "Cột chồng" (stacked) chart, bars were vertically centered
   instead of anchored to a common bottom edge — Phong's question "why
   don't make it align bottom to make sense?" is exactly right: a stacked
   bar's whole point is a shared baseline, and this one didn't have one.
3. On mobile width the chart broke (bars/labels overflowing or clipping —
   no responsive rules existed for this screen at all before this fix).

**Fixes, all in `ViewsStats.html`/`Styles.html`, no server-side change**:

1. Wrapped the two toggles in a new `.stats-controls` block, each in its
   own `.stats-control-group` with a small uppercase caption above it
   ("CƠ SỞ TÍNH" / "XEM THEO") — same idea as the "Option B" sidebar
   labels from the original mockup round, just inline under Option A's
   layout instead of in a sidebar. More vertical gap between the two
   groups than within either one.
2. Root cause: `.stats-bar-stack` shared a rule with `.stats-bar-pair`
   (`align-items: flex-end`) that its own `align-items: stretch`
   couldn't fully override, and neither rule pinned the STACK's own box
   to the bottom of `.stats-bar-group` — `flex-direction: column-reverse`
   only reverses paint order of the two segments, it doesn't anchor the
   stack itself. Gave `.stats-bar-stack` its own standalone rule with
   `align-self: flex-end` (anchors the whole stack, not just its
   children) and a fixed `width` instead of `max-width` + `margin: 0
   auto` (which could drift instead of sitting flush). Verified visually
   via a real rendered preview (published as a private Artifact, read
   back to confirm no markup bugs, screenshotted with Claude in Chrome)
   before calling this done — same verification discipline as the
   original mockup round, not just reasoning about the CSS.
3. Added `@media (max-width: 640px)` rules for this screen (there were
   none before): smaller chart height/gaps/bar widths, a tighter
   `.stats-rank-row` grid (56px/1fr/84px instead of 70px/1fr/110px) with
   ellipsis on overflowing labels, and `.stats-chart-wrap` gained
   `overflow-x: auto` so an unusually large period count degrades to a
   horizontal scroll instead of visually breaking, on any screen size.

No server-side (`.gs`) change. Verified: syntax-checked the modified
`ViewsStats.html` inline `<script>` via `node -e "new Function(...)"`,
re-ran the full offline suite (all green, unaffected — pure CSS/HTML),
and visually confirmed both the control-grouping and stacked-baseline
fixes against a real rendered preview before considering this done.

`BUILD`: `web-2026-09-04k-statsuifix`.

**Live-test checklist for Phong**: paste the updated `ViewsStats.html`
and `Styles.html` into the web project's online editor and redeploy.
Confirm: the basis toggle and period pills now read as two visually
distinct groups with labels; switching to "Cột chồng" shows every bar's
base sitting on the same bottom line regardless of height; and on a
phone (or narrow browser window) the chart no longer overflows or clips
— bars and labels should all stay visible and legible.

---

### 4.7.2 — by-customer/by-status breakdown views, filters, polish

Builds on 4.6.2's server-side aggregation (`apiStatsByCustomer`/
`apiStatsByStatus`, `Stats.gs`) — no API/server change in this task,
purely `ViewsStats.html`/`Styles.html`.

**View switcher**: a 3-way segmented control ("Theo thời gian / Theo
khách hàng / Theo trạng thái") above the existing basis toggle swaps the
chart+table between the time-period view (4.7.1, unchanged) and the two
new breakdown views. Each view keeps its own cached response in
`state.dataByView` — switching back to an already-loaded view repaints
instantly with no re-fetch, same idea as `ViewsOrders.html`'s own list
cache. Changing basis/period or applying a filter invalidates all three
caches at once (simpler and safer than tracking exactly which control
affects which view's cache). The switcher itself only renders options a
role can actually use — "Theo khách hàng"/"Theo trạng thái" are gated on
the same `fieldAllowed_('customer'/'status')` check `ViewsOrders.html`
already uses for its own filter dropdowns, matching the server's own
`fieldVisible_()` gate on `actionStatsByCustomer_`/`actionStatsByStatus_`
(Stats.gs) — this is client-side UX polish on top of a permission check
that already existed and already enforces the real boundary.

**Filter panel**: reuses `ViewsOrders.html`'s own filter-panel markup and
CSS classes verbatim (`list-filter`/`filter-panel`/`chip-row`/…) wired to
`ViewsStats.html`'s own `state.filters` — month/year, customer, status,
createdBy, approveStatus. No new filter CSS needed. No free-text search
field: search doesn't have an obvious meaning against aggregated totals
the way it does against a list of individual orders, so it's left out
rather than added just for surface-level parity. All five filters were
already accepted server-side by every stats action via
`computeOrderFilters_` — this task only had to build the client UI and
wire the payload through, matching exactly how `ViewsOrders.html` builds
its own request payload from `state.filters`.

**Top-N + "Khác" charting**: `chartGroups()` collapses anything beyond
the top 8 groups (by revenue) into one "Khác" bar/row for the CHART only
— the totals table below always lists every group in full, uncollapsed,
sorted the same way the server already returns them (biggest first for
customer/status, chronological for time-period). Applied uniformly across
all three views rather than special-cased to customer/status only, since
a long enough time range (e.g. a full year of weeks) could plausibly need
the same treatment. The existing chart-type switch (cột ghép/cột
chồng/xếp hạng) works unchanged across all three views; "xếp hạng" pins
"Khác" last rather than re-sorting it into the middle of a ranking, since
it's explicitly "everything smaller than the Nth item," not a real
individual entry.

**Verification**: no server-side (`.gs`) change, so the offline `.gs`
suite (48/48 stats, all suites green) is an unaffected regression check,
not a test of this task's own logic. For the client-side logic actually
added — `groupsForView` (envelope normalization), `chartGroups` (top-N
collapse with sum conservation), view switching with per-view caching,
filter apply/clear, chart-type re-render without a re-fetch — wrote a
one-off Node harness that `eval()`s the real file's script body with a
fake `window.TT` bridge and drives `onClick`/`render` directly (13
assertions, all passing), since nothing in the existing offline-tests
setup exercises client-side `.html` JS at all. Also visually spot-checked
via a published Artifact preview with fake data; browser-automation
clicks into the artifact's cross-origin iframe turned out to be
unreliable for this kind of check (confirmed via direct DOM/
accessibility-tree inspection that the click landed correctly but
automation couldn't verify the outcome across the origin boundary) — the
Node harness above is what actually confirmed correctness, the Artifact
was only useful for the purely visual read (layout, spacing, the "Khác"
bar's dashed styling).

`BUILD`: `web-2026-09-04l-statsbreakdown`.

**Live-test checklist for Phong**: paste the updated `ViewsStats.html`
and `Styles.html` into the web project's online editor and redeploy.
Confirm: the three-way switch at the top moves between time/customer/
status views, each loading its own data; the "Bộ lọc" panel filters all
three views the same way the order list's own filter panel does (try a
month + a customer together); if there are more than 8 customers/statuses
with revenue, the chart should show the top 8 plus one "Khác" bar/row
while the table below still lists every one individually; switching chart
type (Cột ghép/Cột chồng/Xếp hạng) should feel instant on every view, not
just the time-period one.

---

### 4.7.2 follow-up: remove filter panel, basis toggle scoped to time-period view, real cross-tab race fix

**Reported live by Phong (2026-09-04)**, three items after testing 4.7.2:

1. "The filter look no need here, so lets remove it" — the filter panel
   added in 4.7.2 (mirroring the order list's own filter bar) wasn't
   wanted on this screen.
2. "The 'Cơ sở tính' section is just for 'Theo thời gian', for other it
   not make sense so remove, and just stat on the current focus" — the
   basis toggle (theo ngày hoá đơn/đặt hàng) doesn't visibly change
   anything for the by-customer/by-status views (the grouping key is the
   order's own field either way — basis only ever affects which DATE a
   line's bucket/noInvoice split is computed from), so showing it there
   read as broken rather than as a real option.
3. **A real regression**, described precisely: "if click on 'Đơn hàng'
   first, then 'Thống kê' right after, the loading stat showing until the
   Order loaded then show Order list although the tab now current 'Thống
   kê', when click on 'Thống kê' again, the loading show on again but
   stuck there... it could not show the stat." This is the SAME class of
   bug as the original 4.7.1-follow-up cross-tab race fix, but that fix
   turned out to be incomplete — two separate bugs, both root-caused and
   fixed this round:

   **Bug 3a — ViewsOrders.html's viewSeq guard never actually detected a
   cross-tab switch.** The original fix bumped `viewSeq` inside
   `render()`, but `render()` only runs while the user is actually ON
   Đơn hàng — switching straight from Đơn hàng to Thống kê never re-enters
   ViewsOrders.html at all, so `viewSeq` simply stopped moving. Every one
   of this file's ~19 `seq !== viewSeq` staleness checks kept comparing
   against a `viewSeq` that hadn't changed, so a slow `apiListOrders`
   response fired AFTER the switch still passed its own local check and
   painted the order list straight into the shared `main` node — on top
   of whatever Thống kê had already rendered. A purely local counter can
   never by itself detect "the user left this tab entirely," only a
   cross-module signal can (App.html's `viewGeneration`/`isCurrentView`,
   which 4.7.1's fix added but never actually wired into this file's own
   guards — only into `ensureCreatorsLoaded`).

   Fixed by introducing one shared `staleView_(seq)` helper (replacing
   all ~19 `seq !== viewSeq` call sites in one pass) that fails whenever
   EITHER the local sequence moved OR `T.isCurrentView('orders', ...)`
   is false — i.e. Đơn hàng is no longer the active tab at all, tracked
   via a `myGeneration` snapshot captured fresh on every `render()` call,
   same pattern `ViewsStats.html` already used for its own guard.

   **Bug 3b — the "stuck loading forever" half, in `ViewsStats.html`
   itself.** `load()`'s `.then()`/`.catch()` reset `state.loading = false`
   only INSIDE the `isCurrentView` success branch. So the first time the
   user left Thống kê mid-load (exactly what bug 3a was allowing to
   happen the wrong way, but this half is a real bug independent of that
   one), the response arrived, got correctly discarded as stale by
   `isCurrentView` — but as a side effect also skipped clearing
   `state.loading`, leaving it stuck `true` forever. The next visit's
   `render()` saw `!currentData() && !state.loading` evaluate to false
   (loading was still true) and silently never started a new load at
   all — exactly "the loading show on again but stuck there... could not
   show the stat." Fixed by resetting `state.loading` (and
   `state.creatorsLoading`, same pattern, before it was removed along
   with the filter panel — see below) unconditionally, before the
   staleness check, in both success and error paths.

**Changes**:
- `ViewsStats.html`: removed the entire filter panel added in 4.7.2 —
  `state.filters`, `filterBarHtml()`/`chipsHtml()`/`activeFilterChips()`,
  `applyFilterPanel()`, the month/year/customer/status/approveStatus
  option-list builders, `hasActiveFilters()`, and `ensureCreatorsLoaded()`
  (which existed only to populate the createdBy dropdown). `requestPayload()`
  now only ever sends `{basis, period}` (period only for the time-period
  view). The basis toggle now only renders when `state.view ===
  STATS_VIEW_PERIOD` (moved the ternary up into `html()`'s head-building,
  rather than rendering `.stats-controls` unconditionally and hiding just
  the toggle inside it — the whole `.stats-controls` block, including its
  "Cơ sở tính" label, is absent for the two breakdown views now, not just
  visually empty). The by-customer/by-status views implicitly stay on
  `state.basis`'s existing default (`invoiceDate`) since there's no
  longer any control to change it from those views.
- `ViewsOrders.html`: the `staleView_(seq)` fix described above (bug 3a).
- `Styles.html`: no changes needed — the filter panel reused
  `ViewsOrders.html`'s own existing CSS classes verbatim rather than
  adding new ones, so removing it from `ViewsStats.html` orphans nothing
  (those classes are still very much in use by the order list's own
  filter bar).
- `tools/offline-tests/orders-ui.test.js` and
  `orders-approvestatus-ui.test.js`: their fake `TT_BRIDGE` fixtures
  predated `viewGeneration`/`isCurrentView` and needed both added (fixed
  at `1`/`true` — these tests never simulate leaving the Đơn hàng tab
  mid-flight) since `ViewsOrders.html`'s `render()` now calls
  `T.viewGeneration()` unconditionally on every call. Both suites failed
  outright before this fix (`T.viewGeneration is not a function`); all
  83 + 51 of their existing assertions still pass after.

**Verification**: no server-side (`.gs`) change. Full offline `.gs` suite
green (including the two fixture files just updated). For the actual bug
fixes, wrote two targeted Node harnesses that exercise the REAL file
contents directly (not reimplementations): one drives `ViewsStats.html`'s
`render()`/`load()` with a controllable fake `isCurrentView()` to prove
`state.loading` now always resets even when a response is discarded as
stale, and that a subsequent visit successfully starts and completes a
new load (the exact "stuck there" bug, now fixed — 13/13 checks,
including confirming the filter panel and the view-scoped basis toggle);
the other drives `ViewsOrders.html`'s real `render()` with a simulated
"user switches to Thống kê before the slow apiListOrders response
arrives" sequence and confirms the stale response no longer overwrites
what's on screen (3/3 checks) — and, to make sure this was a real
regression test and not a tautology, re-ran it against a deliberately
reverted (pre-fix, local-only `viewSeq` check) copy of the same file and
confirmed it correctly FAILS there, reproducing Phong's exact report.

`BUILD`: `web-2026-09-04m-crosstabfix2`.

**Live-test checklist for Phong**: paste the updated `ViewsStats.html` and
`ViewsOrders.html` into the web project's online editor and redeploy (no
CSS change this round). Confirm: Thống kê no longer has a filter panel or
"Bộ lọc" button; the "Cơ sở tính" toggle only appears when "Theo thời
gian" is selected, not on "Theo khách hàng"/"Theo trạng thái"; and
specifically re-try the exact sequence that broke before — click Đơn
hàng, then immediately click Thống kê, repeatedly and in both directions
— the screen should always show whichever tab is actually selected, with
Thống kê loading and completing normally every time, never stuck.

---

### Milestone 4 / 4.7.3 — "stat by order, not order line" + include-no-invoice toggle (2026-09-04)

Phong, after live-testing 4.7.2's follow-up: "1. For now, all stat (all 3
focus) should be stat by order (not order line) 2. We will have a global
toggle of include order without invoice (default to enable) - which if
enable, all orders will be include in stats, if not only the order have
invoid in stats, the remaining will be show as bottom dialog of total not
invoice (at current)." Then, on the ambiguity of a single order having
some lines invoiced and others not: "the includes/excludes orders without
an invoice toggle means stat the order that include the order line that
have invoice, so in case an order that include line have invoice and
line have no invoice, it could be separate as 2 order when toggle
include order without invoice disabled, and the date for stats of both
separate order is all using the order date (not invoice date)." Follow-up
after that: chart/table figures should show FOUR values per bucket/group
— ex-VAT, inc-VAT, order count, and line count (not just the two VAT
figures plus one count as before).

Confirmed with Phong (AskUserQuestion) before implementing:
1. The old order-date/invoice-date "Cơ sở tính" basis toggle is REMOVED
   entirely (not kept dormant) — an order has exactly one date, so once
   the unit is orders there is nothing left for a second basis to mean.
2. The noInvoice figure stays a SINGLE global total on every view (not
   broken down per customer/status) — same shape it already had.
3. A fully-unbilled order and the split-off unbilled portion of a mixed
   order both simply add into that same noInvoice total, no distinction
   shown between the two cases.

**Root architecture change** (`Stats.gs`): every aggregation (time-period,
by-customer, by-status) switched from a per-LINE walk (`statsAggregateByLine_`,
now removed) to a per-ORDER walk (`statsAggregateByOrder_`, new). Order-date/
invoice-date basis is gone — `statsBasis_()` removed, every view always
buckets/sorts by the order's own `orderDate`. New `includeNoInvoice` payload
field (`statsIncludeNoInvoice_()`, default `true`):
- **ON** (default): every filtered order counts in full using its own
  `totalExVat`/`totalIncVat`/`lineCount` (already maintained on every
  order record by `Orders.gs` — no need to walk `linesForOrder_` at all
  in this branch). `noInvoice` is always zeroed.
- **OFF**: each order's lines are partitioned via `invoiceIndex_()` into
  billed/unbilled. An order with only billed lines counts entirely toward
  its bucket; an order with only unbilled lines counts entirely toward
  `noInvoice`; a genuinely mixed order SPLITS — the billed portion counts
  as one order-contribution to its bucket (keyed by the order's own
  date/field, never an invoice date), the unbilled portion adds into the
  single global `noInvoice` total. Matches Phong's "could be separate as
  2 order" description exactly.

Every bucket/group (and `noInvoice`) now carries `exVat`, `incVat`,
`orderCount` (new — the stats unit), and `lineCount` (kept for context).

**Changes**:
- `apps/api/Stats.gs`: rewritten per above — `statsAggregateByOrder_`
  replaces `statsAggregateByLine_`; `statsBasis_`/`EXPORT_BASIS_*` basis
  handling removed from every stats function; `statsRevenue_`/
  `statsByField_`/`actionStatsRevenue_`/`actionStatsByCustomer_`/
  `actionStatsByStatus_` all updated to the new signature
  (`(rows, includeNoInvoice, keyFn)` in place of `(rows, basis, keyFn)`).
- `apps/web/ui/ViewsStats.html`: `state.basis` and the whole basis-toggle
  UI (`basisToggleHtml()`, the "Cơ sở tính" control group) removed. New
  `state.includeNoInvoice` (default `true`) with a checkbox-style toggle
  switch (`includeNoInvoiceToggleHtml()`) shown on **every** view (unlike
  the old basis toggle, which was period-view-only) — toggling it
  invalidates all three view caches and re-fetches, same as changing
  `period` already did. `requestPayload()` now sends `{includeNoInvoice,
  period?}`. Every chart type (grouped/stacked/ranked) and the totals
  table now show all four figures — added a shared `barTooltip_()` helper
  for the chart tooltips, and a new "Số đơn" table column alongside the
  existing "Số dòng".
- `apps/web/ui/Styles.html`: added `.stats-toggle-switch`/`.stats-toggle-
  track`/`.stats-toggle-thumb`/`.stats-toggle-label` (a real hidden
  checkbox + CSS-drawn track/thumb, animated via the `:checked` sibling
  selector — no JS needed to move the thumb). Reused `.stats-control-
  group`/`.stats-controls` as-is.
- `apps/web/Main.gs`: `apiStatsRevenue`/`apiStatsByCustomer` doc comments
  updated (still thin pass-throughs to `apiCall_`, no logic change) — no
  longer describe a `basis` payload field that doesn't exist anymore.
- `docs/OPEN_QUESTIONS.md`: added a "Superseded 2026-09-04" note under Q2
  explaining the basis toggle's removal and its replacement, without
  rewriting the original 2026-08-20 answer (kept for history).
- `tools/offline-tests/stats.test.js`: rewritten entirely (the old
  per-line/basis test suite no longer matches the code) — 65 assertions
  covering: order-level totals/orderCount/lineCount: default
  `includeNoInvoice: true`; order-date-only bucketing (an attached
  invoice dated in a different month no longer moves anything); the
  `includeNoInvoice: false` split for zero-billed / fully-billed / mixed
  orders (including the exact "2 separate orders" mixed case); period
  granularities (week/quarter/year) unaffected by the revision; existing
  filter/permission scoping; by-customer/by-status grouping +
  `fieldVisible_` gating, including the "noInvoice is one global total,
  never broken down by customer" case explicitly.

**Verification**: full offline `.gs` suite green — 12 suites, 700+
assertions total, including the new 65-assertion `stats.test.js` — no
other suite touched Stats.gs's internals, so nothing else needed
updating. Proved `stats.test.js`'s mixed-order split test (test 7) is a
genuine regression test, not a tautology: patched a deliberately-wrong
copy of `statsAggregateByOrder_` that folds a mixed order's BILLED
portion into `noInvoice` too whenever any line is unbilled (a plausible
wrong reading of "could be separate as 2 order"), confirmed the test
correctly FAILS against it, then restored the real fixed file and
confirmed all 65 assertions pass again. Separately wrote a client-side
Node harness (`sim_client.js`, same `eval()`-the-real-`<script>`-body
technique used for the earlier cross-tab fixes) exercising the real
`ViewsStats.html` directly: confirms no basis-toggle code path remains,
the new toggle renders and is checked by default on every view (not just
the time-period view), toggling it invalidates and re-fetches with the
new value, the noInvoice card reflects the off-state response, and both
chart tooltips and the table show all four figures — 17/17 checks.

`BUILD`: `api-2026-09-04k-statsbyorder` / `web-2026-09-04n-statsbyorder`.

**Live-test checklist for Phong**: paste the updated `Stats.gs` into the
API project's online editor, and `ViewsStats.html`/`Styles.html`/
`Main.gs` into the web project's, then redeploy both. Confirm: the
"Cơ sở tính" (basis) toggle is gone from every view, including "Theo
thời gian"; a new "Bao gồm đơn chưa xuất hoá đơn" switch appears above
the chart on all three views, checked (on) by default; with it on, every
order shows up in the stats and the "Chưa xuất hoá đơn" card at the
bottom never appears; turn it off and confirm an order you know has no
invoice yet drops out of its period/customer/status bucket and its total
appears in the "Chưa xuất hoá đơn" card instead; for an order with a mix
of invoiced and non-invoiced lines, confirm the invoiced part still
counts in its normal bucket (using the order's own date) while the
uninvoiced part's figures land in the "Chưa xuất hoá đơn" card; check the
chart bar tooltips and the totals table both now show "Số đơn" (order
count) alongside "Số dòng" (line count), not just VAT figures.

---

### Milestone 4 / 4.7.3 follow-up — toggle placement + order/line count chart (2026-09-04)

After the "stat by order" revision above shipped, Phong asked to try
different placements for the new includeNoInvoice toggle ("the toggle
position not look good") and whether the chart should show counts
alongside VAT ("should we draw chart include remaining count?"). Rather
than guess, mocked multiple options as published Artifacts for Phong to
compare side by side before touching real code:
- Toggle placement: 4 options (inline with the title; its own settings
  bar under the title; paired with the view switch row; pinned above the
  chart card). Phong picked **Option B** — its own full-width shaded bar
  directly under "Thống kê doanh số", above the view switch.
- Count display: 9 options total across two rounds (caption under the
  bar label; tooltip-only/no change; a positioned dot; a badge on the
  bar; a third mini-bar sharing the chart; count folded into the axis
  label; bar opacity/intensity; a sparkline strip under the chart; a 4th
  dedicated chart-type). Phong picked **Option 9** — a separate "Số
  lượng" chart-type tab that swaps to a dedicated order/line-count chart,
  leaving the existing VAT chart types (Cột ghép/Cột chồng/Xếp hạng)
  completely untouched.

**Changes** (client-only — no `.gs`/API change this round):
- `apps/web/ui/ViewsStats.html`:
  - New `includeNoInvoiceBarHtml()` wraps the existing
    `includeNoInvoiceToggleHtml()` switch in its own bar
    (`.stats-toggle-bar`), rendered right after the title and BEFORE
    `viewSwitchHtml()` — previously it lived inside the shared
    `.stats-controls` block next to the period pills. `.stats-controls`
    now only ever renders the period-pills group (and only for the
    time-period view, as before).
  - `CHART_TYPE_OPTIONS` gained a 4th entry, `{value:'count', label:'Số
    lượng'}`. `chartHtml()` routes it to a new `countChartHtml(groups)` —
    same grouped-bar visual structure as `groupedChartHtml()` but scaled
    to `Math.max(orderCount, lineCount)` instead of VAT, drawing two bars
    per group (`count-order`/`count-line`) with `countLegendHtml()`
    labeling them "Số đơn"/"Số dòng". Entirely separate function/CSS
    classes from the VAT bars — selecting "Số lượng" swaps the whole
    chart; the other three chart types are unmodified by this option's
    existence.
- `apps/web/ui/Styles.html`: new `.stats-toggle-bar` (shaded strip,
  reusing the same visual language as the mocked "Option B"), and
  `.count-order`/`.count-line` bar-color modifiers plus matching legend
  swatches — a muted amber pair, deliberately distinct from `.ex`/`.inc`'s
  blue/brand so a "Số lượng" screenshot is never confused for a VAT
  chart at a glance.

**Verification**: no server-side change, so the full offline `.gs` suite
(12 files, 700+ assertions) was re-run unchanged as a sanity check — all
green, confirming nothing on the client touches server contract shapes.
For the actual UI change, extended the existing `eval()`-the-real-
`<script>`-body Node harness technique: `sim_client2.js` (9 checks)
confirms the toggle bar renders before the view switch and outside
`.stats-controls`, the "Số lượng" option renders and swaps to a chart
with `count-order`/`count-line` bars and the right legend, VAT bars are
absent while on "Số lượng", and switching back to "Cột ghép" restores the
normal VAT chart+legend untouched. Re-ran the prior round's
`sim_client.js` (17 checks, adjusted only for the file path) against this
same file to confirm the toggle's invalidate-and-refetch behavior, its
default-checked state, and the 4-figure tooltips/table columns from the
previous revision all still hold — 26/26 combined.

`BUILD`: `web-2026-09-04o-statscounttab` (API build unchanged —
`api-2026-09-04k-statsbyorder` — this round touched no `.gs` file).

**Live-test checklist for Phong**: paste the updated `ViewsStats.html`
and `Styles.html` into the web project's online editor and redeploy (no
API-side change needed this round). Confirm: the "Bao gồm đơn chưa xuất
hoá đơn" toggle now sits in its own shaded bar right under the "Thống kê
doanh số" title, above the Theo thời gian/khách hàng/trạng thái switch —
on all three views. Confirm a new "Số lượng" button appears alongside Cột
ghép/Cột chồng/Xếp hạng; selecting it swaps the chart to two amber bars
per group (Số đơn / Số dòng) with a matching legend, and switching back
to any of the other three restores the normal VAT chart exactly as
before.
