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

## ◐ Milestone 2 — Order CRUD (multi-line)  ← **BUILT, AWAITING LIVE TEST**

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

- [ ] `setupMilestone2()` reports four sheets created and the header check passes
- [ ] Create an order with 1 line, and another with 8 lines — both land correctly in `Orders` + `OrderLines`
- [ ] Per-line VAT (8% / 10%) computes correctly; totals match the lines
- [ ] Edit changes the right rows and does not orphan or duplicate lines
- [ ] Delete removes the header and all its lines
- [ ] A user without `view_all_orders` cannot open another user's order, even by URL/ID
- [ ] Two lines sharing one invoice number create **one** row in `Invoices`
- [ ] A deposit typed as `47.466.000` is stored as the number 47466000
- [ ] A new customer name appears in `Config.customerList` afterwards
- [ ] The multi-line form is usable on a phone

---

## ☐ Milestone 3 — List, filter, search, status

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
