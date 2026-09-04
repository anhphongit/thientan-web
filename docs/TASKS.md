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

| # | Task | Status |
|---|------|--------|
| 4.1 | CSV export — filtered list, order-date grouping, `EXCEL_REFERENCE.md` §7 layout | ☑ |
| 4.2 | Export month-basis toggle (order date / invoice date) + shared per-line bucketing | ☐ |
| 4.3 | XLSX export (temp-Sheet build + export URL + cleanup) | ☐ |
| 4.4 | PDF export (same temp-Sheet, PDF print params) | ☐ |
| 4.5 | Async/large-export infra — checkpoint+retrigger, status polling, Drive+email delivery, retention cleanup | ☐ |
| 4.6 | Statistics aggregation (`Stats.gs`) — revenue by week/month/quarter/year, by customer, by status | ☐ |
| 4.7 | Statistics UI (`ui/ViewsStats.html` + Chart.js) | ☐ |

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
