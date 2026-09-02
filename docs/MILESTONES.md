# Milestones

Build **one milestone at a time**, and **one task at a time inside it** — a
milestone is never built in a single conversation. The task split lives in
[`TASKS.md`](TASKS.md); this file holds the scope and the exit criteria. Each
milestone must be independently testable on a real PC and a real phone before
starting the next. After each, run its checklist plus the
permission checklist in `PERMISSIONS.md`.

Legend: ☐ not started · ◐ in progress · ☑ done

---

## ☑ Milestone 0 — Setup  *(done 2026-08-18)*

Everything in [`SETUP.md`](SETUP.md).

**Exit criteria:** `clasp push` succeeds, the web app URL opens, Script Properties
contain the Spreadsheet ID.

---

## ☑ Milestone 1 — Foundation  *(done 2026-08-18)*

Auth, permissions, and the app shell. No business features.

Verified on a live deployment 2026-08-18: employees authenticate as themselves,
permissions and `active` are enforced, and the security gate works end to end.

Scope:
- `Config.gs`: sheet names, header rows, permission vocabulary, Vietnamese messages
- `SheetsRepo.gs`: open spreadsheet, generic read/find/append/update
- `Auth.gs`: `getCurrentUser()` — email → Users row → permissions
- `Permissions.gs`: `hasPermission`, `requirePermission`, `filterVisibleFields`
- `Main.gs`: `doGet`, `include`, error wrapper
- `Setup.gs`: `setupMilestone1()` — creates the Users + Config tabs and seeds the
  first admin, so no header row is typed by hand
- `ui/Index.html` + `Styles.html` + `App.html`: shell, nav, "logged in as", loading
  and no-access states, all in Vietnamese

**Exit criteria**

- [x] Opening the URL prompts Google login and then shows the user's Vietnamese name
- [x] An email not in `Users` sees *"Tài khoản của bạn chưa được cấp quyền truy cập..."*
- [x] `active = FALSE` is locked out
- [x] Nav items appear/disappear according to the permissions JSON
- [x] No Spreadsheet ID appears anywhere in page source
- [x] Layout is usable on a phone
- [x] The no-access screen names the Google account it saw, and offers account switching
- [x] **An employee (different Google account) logs in as themselves, not as the owner**
- [x] WEB deployed **Execute as: User accessing**, API deployed **Execute as: Me** (SETUP.md steps 4 and 6)
- [x] The employee cannot open the spreadsheet directly
- [x] `DEV_MODE` is off before employees get the link

---

## ☑ Milestone 2 — Order CRUD (multi-line)  *(done 2026-08-27)*

Unblocked on 2026-08-20: Q1, Q3, Q4 and Q6 were answered, so the schema is
settled and `Orders`, `OrderLines`, `Invoices` and `StatusHistory` now exist.
What those answers changed, in one line each:

- **Q1** — deposits are real fields: `customerDeposit`, `supplierName`, `supplierPaid`
- **Q3** — no `orderNo` / `customerPo` split. One free-text `po` + `poNote`, and the
  system reference `DH-2026-0001` is shown to users as *Mã đơn*
- **Q4** — invoices are their own tab; `OrderLines.invoiceId` points at it, so one
  invoice can cover several orders and one order can hold several invoices
- **Q6** — no `Customers` tab; `Config.customerList` autocomplete, self-filling

Built:
- `apps/api/Orders.gs`: create / get / list / update / delete, ids under a lock,
  server-side VAT and totals, ownership enforced on every path
- `apps/api/Setup.gs`: `setupMilestone2()` creates the four sheets, idempotent
- `apps/web/ui/ViewsOrders.html`: card list + multi-line form (add/remove rows,
  live totals, inline delete confirmation — no blocking browser dialogs)
- `tools/offline-tests/`: 105 assertions over the money, edit-reconciliation,
  scoping, validation and view-markup logic. Run all three before pushing —
  `node tools/offline-tests/orders-crud.test.js` and its two siblings

**Deploy order** (see `SETUP.md`): push **api** first, publish a new version, then
run `setupMilestone2()` from the API editor, then push **web** and publish.

**Exit criteria**

- [x] `setupMilestone2()` reports four sheets created and the header check passes
- [x] Create an order with 1 line, and another with 8 lines — both land correctly in `Orders` + `OrderLines`
- [x] Per-line VAT (8% / 10%) computes correctly; totals match the lines
- [x] Edit changes the right rows and does not orphan or duplicate lines
- [x] Delete removes the header and all its lines
- [x] A user without `view_all_orders` cannot open another user's order, even by URL/ID
- [x] Two lines sharing one invoice number create **one** row in `Invoices`
- [x] A deposit typed as `47.466.000` is stored as the number 47466000
- [x] A new customer name appears in `Config.customerList` afterwards
- [x] The multi-line form is usable on a phone

Verified live 2026-08-27 via `CHECKLIST_M2_VI.md` sections A–H (all boxes
checked, including F's `change_status`-locked Status field). B1–B5 bugs found
during this verification pass are fixed and covered by 257 offline
assertions — see `TASKS.md`.

---

## ◐ Milestone 3 — List, filter, search, status

Scope:
- Paginated order list, sorted newest first
- Filter by month/date range, customer, status, created-by
- Free-text search across order no, customer PO, customer, description
- `changeStatus` + `StatusHistory` append
- Admin approve / delete

**Exit criteria**

- [ ] List loads under ~3 seconds with a year of data
- [ ] Every filter works alone and combined; filters are permission-scoped
- [ ] Status change is recorded in `StatusHistory` with who and when
- [ ] `change_status` and `approve_order` are enforced server-side
- [ ] The list is readable on a phone (cards, not a squashed table)

---

## ☐ Milestone 4 — Export + statistics

Scope:
- `Export.gs`: export the **currently filtered** list to CSV / XLSX / PDF
- Layout mirrors the existing monthly report (month grouping, `STT`/`PO` on first
  line only, `DOANH SỐ THÁNG n` totals) — see `EXCEL_REFERENCE.md`
- `Stats.gs`: revenue by week / month / quarter / year, by customer, by status
- `ui/ViewsStats.html`: Chart.js charts

**Exit criteria**

- [ ] Exported file matches what is on screen, including filters
- [ ] A user cannot export a column outside their `visible_fields`
- [ ] The PDF is recognizable to someone used to the current Excel report
- [ ] Vietnamese characters render correctly in all three formats
- [ ] Revenue figures reconcile against the reference Excel for a sample month
- [ ] `view_statistics` / `export_statistics` are enforced

---

## ☐ Milestone 5 — Inventory + Admin UI

Scope:
- `Inventory.gs` + `ui/ViewsInventory.html`: product/stock CRUD, low-stock flag
- `Admin.gs` + `ui/ViewsAdmin.html`: user list, add/edit/deactivate, permission
  matrix editor, `Config` sheet editing (status list, UoM list, customer list)

**Exit criteria**

- [ ] Admin can create a user and set permissions without touching the Sheet
- [ ] A permission change takes effect on the affected user's next action
- [ ] The last active admin cannot be deactivated or stripped of `manage_users`
- [ ] Product CRUD works; `OrderLines.productCode` can link to a product
- [ ] The permission matrix is usable on a phone (card per user)

---

## ☑ Unplanned — Identity and security hardening  *(done 2026-08-18)*

Not in the original six. Forced by what live testing found, and worth listing so
the effort is visible:

- Two-project split (`apps/api` + `apps/web`) so employees authenticate as
  themselves — see [`IDENTITY.md`](IDENTITY.md)
- Privilege-escalation bug found and fixed (every visitor was resolving to the owner)
- Deactivation made immediate (user records are no longer cached)
- Security gate: key expiry, phone-friendly revocation, fingerprint check,
  throttled audit log, admin banners — see [`SECURITY.md`](SECURITY.md)
- Account-switching help rewritten after four dead-end Google redirect schemes

---

## ☐ Milestone 6 — Hardening and polish

Scope:
- `backupNow()`: export every sheet to a timestamped Drive folder; Admin button
- Full responsive pass on real devices
- Vietnamese completeness sweep — zero English strings left
- Error message review; no stack traces reach users
- Short user guide in Vietnamese for the employees

**Exit criteria**

- [ ] Backup produces a restorable copy of all six sheets
- [ ] Every screen usable on iOS Safari and Android Chrome
- [ ] Full permission checklist from `PERMISSIONS.md` passes
- [ ] Employees can complete a full order lifecycle unaided using the guide

---

## Progress log

| Date | Milestone | Note |
|------|-----------|------|
| 2026-08-31 | 3 | **Task 3.5 quick-status control redesigned (style E1)**: dropped the dashed-border status row entirely — the status pill itself is now the control, with a small trailing pencil icon tinted to the pill's own status color (`currentColor`) and a transparent `<select>` overlaid on the pill to capture the click. Card top row split into two sibling navigable buttons (id/lines area, customer/meta/money area) with the pill as an independent element between them, since a select still can't nest in a button. Chosen after three rounds of option mockups (A/B/C layouts → B1–B4 pill styles → E1–E3 icon variants). Test suite updated for the new two-button-per-card markup, not a behavior change (345 assertions, all passing). Client-only; API BUILD unchanged. Not yet verified live. |
| 2026-08-31 | 3 | **Task 3.5: status change is no longer optimistic.** While a quick status change is in flight, the pill shows a pending state ("Đang cập nhật…" + spinner, select removed) and both of that card's open-detail buttons are disabled — the user can't navigate into the order or fire a second change until the server confirms. Client-only; API BUILD unchanged; 345 assertions still passing. |
| 2026-08-31 | 3 | **Bug fix: quick status change left the detail-view cache stale.** `orderCache` (opening an order's detail) is separate from the list's `state.orders` and `changeStatusQuick` only updated the latter — reopening a recently-changed order's detail could show the old status until the cache TTL expired. Fixed by invalidating `orderCache[orderId]` on a successful quick change, so the next open re-fetches. Client-only; 345 assertions still passing. |
| 2026-08-31 | 3 | **Task 3.5 built**: `changeStatus`, a new one-purpose API action for a quick status change directly from an order card (separate from the full `updateOrder` edit flow) — `change_status` + ownership enforced, `StatusHistory` logged with who/when, same-status is a no-op. Card layout restructured (outer div + inner button + sibling status select — a select can't nest in a button). 28 more offline assertions (345 total across all suites). Not yet verified live. |
| 2026-08-31 | 3 | **Task 3.4 built**: free-text search across `orderId`/`po`/`customer` and line `description`, combinable with every 3.2/3.3 filter (all AND, still ownership-scoped). 21 more offline assertions (52 in `orders-filter.test.js`, 309 total). Also fixed live: a missing `apps/web/Main.gs` pass-through (`apiListOrderCreators`) that left the created-by dropdown stuck on "Đang tải người tạo…" forever on any failure — now falls back and surfaces the error instead of hanging silently. Milestone 3's list/filter/search slice (3.1-3.4) is feature-complete but not yet verified live — recommend one full live pass before 3.5. |
| 2026-08-31 | 3 | **Task 3.3 built**: customer + status + created-by filters, combinable (AND) with 3.2's date filter; created-by gated to `view_all_orders` and fed by a new `actionListOrderCreators_` (distinct creators actually in `Orders`, not a full Users-sheet read). 13 more offline assertions (36 total in `orders-filter.test.js`, 293 across all suites). Also: 3.2's date filter UI swapped from a native month-picker (opens a full day calendar) to two plain Tháng/Năm dropdowns, per Phong. Not yet verified live — see `TASKS.md`. |
| 2026-08-31 | 3 | **Task 3.2 built**: server-side month / date-range filter on the order list (`orderDateFilter_` in `apps/api/Orders.gs`, applied after ownership scoping and before pagination; a month/date-range input + "Lọc"/"Xóa lọc" bar on the list screen). 23 offline assertions added, all prior suites still green. Not yet verified live — see `TASKS.md`. Milestone 3 moved from not-started to in-progress. |
| 2026-08-27 | 2 | **Milestone 2 signed off.** `CHECKLIST_M2_VI.md` sections A–H fully checked live (F's last box — Status field locked for a role without `change_status` — confirmed and ticked). All exit criteria in this file flipped to done. See `TASKS.md` for the full B1–B5 bug list closed out along the way. |
| 2026-08-26 | 2 | Three bugs found while walking the M2 checklist, fixed same day: (1) a role missing `po` from `visible_fields` (traced to `docs/PERMISSIONS.md`'s stale `orderNo` examples, predating Q3) could have its edit silently wipe the real PO on save — fixed by generalizing money-blindness's preserve-on-save pattern to `po`/`poNote`/`statusNote`/`supplierName` (`fieldVisible_` in `Orders.gs`); (2) the order form stayed fully editable during a save/delete; (3) nothing stopped a second action from firing while one was in flight — (2) and (3) fixed together with one `state.busyAction` lock. Also fixed: a D1 caching bug where `state.order` and its `orderCache` entry were the same object reference. See `TASKS.md`. |
| 2026-08-26 | — | UI polish, not tied to a milestone: order list cards now colour-code status (`.status-pill`, one style per workflow step plus a dot, so status reads without needing the text) and give line count its own indicator instead of hiding it in the muted date/PO line. Line-count treatment went through several rounds with Phong (5 badge styles, then 5 placements, tried grouped-with-status live, then moved once more) before settling on a filled circle badge, number-only, grouped with the order id on the left of the top row. Client-only; `BUILD` is `web-2026-08-26-9`. See `TASKS.md`. |
| 2026-08-27 | 2 | B5, found on Phong's request to verify a direct API call (Postman/console, bypassing the web form) can't do anything a user's permissions forbid: `createOrder`, and appending a brand-new line during `updateOrder`, wrote every field straight from the client payload with no `visible_fields`/money check at all — B1/B4's guards only protect a field that ALREADY has a stored value, which a new order/line doesn't. A role with `create_order` but blind to money (or missing `po`/`productCode`/etc.) could set any price or hidden field by calling the API directly. Fixed with `clampHiddenOrderFields_`/`clampHiddenLineFields_`, forcing every hidden field to its safe default (`0`/`''`) on anything new. Also reviewed the rest of the permission surface (`Router.gs`, `Auth.gs`, `Permissions.gs`, `Security.gs`) — everything else fails closed; the one accepted risk is the shared-secret model itself, already documented in `Security.gs`. 257 offline assertions pass; `BUILD` is `api-2026-08-27-clamp`. See `TASKS.md`. |
| 2026-08-26 | 2 | B4, found on a follow-up review Phong asked for: a `visible_fields`-restricted role still saw a blank, editable input for a field it couldn't see, on both a new order and an existing one — B1 had only stopped the value from being overwritten, not from being shown at all. Also generalized B1's line-level equivalent, since a blind role's blank `productCode`/`uom`/`note`/`invoiceNo` would have silently wiped an existing line's stored value the same way. Fixed server-side (`fieldVisible_` extended to the line-reconciliation loop in `actionUpdateOrder_`) and client-side (`fieldAllowed_`/`has()` guards now cover every optional field in `headerCardHtml`, `lineHtml`, `blankLine()`, `normalizeLine()`, `openForm(null)`, `collect()` — a hidden field is absent from the form, not rendered empty). 230 offline assertions pass (54+95+81); `BUILD` is `api-2026-08-26-fieldguard2` / `web-2026-08-26-6`. See `TASKS.md`. |
| 2026-08-26 | 2.5c | D1 verified live: order detail now has the same TTL cache + skeleton as the list, plus a "Tải lại" button to force-refresh an order (bypassing the cache) if another user changed it — confirms first when the form is editable, since that would discard unsaved typing. D2/D3 audited with no action needed; D4 (Invoices full-sheet scan in `buildOrderResponse_`) deferred pending real numbers. See `TASKS.md`. |
| 2026-08-26 | 2.5c | P7's `getOrdersVersion_` fixed (unguarded `CacheService` call could throw and take the whole order list down; now fails safe like its siblings) and verified live. New Milestone 2.5c opened to audit the 2.5/2.5b loading-time playbook against every API request (small, fixed surface — see `TASKS.md`): `getOrder` detail now has the same TTL cache + stale-while-revalidate + skeleton treatment as the list (D1, built, offline-tested, awaiting live verification); create/update/delete and `getSession` audited and found not to need it; the `Invoices` full-sheet scan in `buildOrderResponse_` deferred pending real numbers. Also: Milestone 2's own CRUD checklist (`CHECKLIST_M2_VI.md` sections B–H) confirmed still unrun — this progress log had drifted from `TASKS.md`, which is the accurate source for 2.5/2.5b/2.5c status. |
| 2026-08-20 | 2 | **Milestone 2 built.** Q1/Q3/Q4/Q6 answered and recorded; schema settled; `Orders.gs`, `setupMilestone2()`, order list + multi-line form, 105 offline assertions. Awaiting live verification. |
| 2026-08-20 | 4 | Q2 answered: revenue shown ex-VAT **and** inc-VAT; month basis switchable (order date / invoice date). |
| 2026-08-15 | — | Project initialized: scaffold + docs, no implementation |
| 2026-08-18 | 0,1 | **Milestones 0 and 1 signed off** — setup complete, foundation verified live. Milestone 2 not started, blocked on Q1/Q3/Q4/Q6. |
| 2026-08-18 | 1 | Security layer 2: sheet-backed key expiry (30d), phone-friendly revocation, fingerprint check, throttled audit log, admin banners + optional expiry email. Threat model documented in `SECURITY.md`. |
| 2026-08-18 | 1 | Account help condensed: one 14-word line + three tappable rows, steps moved behind the tap (max 3 per option). |
| 2026-08-18 | 1 | Account help reframed as product scope, not a Google limitation. |
| 2026-08-18 | 1 | Account switching: all four Google redirect schemes proven dead. Replaced with in-app instructions, copy-link and a request-access mailto. |
| 2026-08-17 | 1 | Deactivation made immediate (user record no longer cached); account switching replaced sign-out with `authuser` + AddSession. |
| 2026-08-17 | 1 | Restructured to Option B: `apps/api` + `apps/web`. Employees now authenticate as themselves. Setup checklist rewritten. |
| 2026-08-17 | 1 | 🔴 Identity bug found: every visitor authenticated as the owner. Fallback removed, identity now fails closed. See `IDENTITY.md`. |
| 2026-08-17 | 1 | Deployment-mode error translated to Vietnamese; current account shown on every screen; account switching added |
| 2026-08-15 | 1 | Foundation code written: auth (with identity-token fallback), permission gate, Sheets repo, Vietnamese shell, setup bootstrap. Awaiting live verification. |
