# Milestones

Build **one milestone at a time**. Each one must be independently testable on a real
PC and a real phone before starting the next. After each, run its checklist plus the
permission checklist in `PERMISSIONS.md`.

Legend: ☐ not started · ◐ in progress · ☑ done

---

## ☐ Milestone 0 — Setup (Phong)

Everything in [`SETUP.md`](SETUP.md).

**Exit criteria:** `clasp push` succeeds, the web app URL opens, Script Properties
contain the Spreadsheet ID.

---

## ◐ Milestone 1 — Foundation

Auth, permissions, and the app shell. No business features.

Code written 2026-08-15, **not yet verified on a live deployment**.

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

## ☐ Milestone 2 — Order CRUD (multi-line)

Scope:
- `Orders.gs`: create / get / update / delete, orderId + lineId generation under a lock
- Server-side recomputation of `amountExVat`, `amountIncVat`, order totals
- `ui/ViewsOrders.html`: create + edit form with add/remove line rows
- Own-orders scoping applied on every read

**Exit criteria**

- [ ] Create an order with 1 line, and another with 8 lines — both land correctly in `Orders` + `OrderLines`
- [ ] Per-line VAT (8% / 10%) computes correctly; totals match the lines
- [ ] Edit changes the right rows and does not orphan or duplicate lines
- [ ] Delete removes the header and all its lines
- [ ] A user without `view_all_orders` cannot open another user's order, even by URL/ID
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
| 2026-08-15 | — | Project initialized: scaffold + docs, no implementation |
| 2026-08-18 | 1 | Security layer 2: sheet-backed key expiry (30d), phone-friendly revocation, fingerprint check, throttled audit log, admin banners + optional expiry email. Threat model documented in `SECURITY.md`. |
| 2026-08-18 | 1 | Account help condensed: one 14-word line + three tappable rows, steps moved behind the tap (max 3 per option). |
| 2026-08-18 | 1 | Account help reframed as product scope, not a Google limitation. |
| 2026-08-18 | 1 | Account switching: all four Google redirect schemes proven dead. Replaced with in-app instructions, copy-link and a request-access mailto. |
| 2026-08-17 | 1 | Deactivation made immediate (user record no longer cached); account switching replaced sign-out with `authuser` + AddSession. |
| 2026-08-17 | 1 | Restructured to Option B: `apps/api` + `apps/web`. Employees now authenticate as themselves. Setup checklist rewritten. |
| 2026-08-17 | 1 | 🔴 Identity bug found: every visitor authenticated as the owner. Fallback removed, identity now fails closed. See `IDENTITY.md`. |
| 2026-08-17 | 1 | Deployment-mode error translated to Vietnamese; current account shown on every screen; account switching added |
| 2026-08-15 | 1 | Foundation code written: auth (with identity-token fallback), permission gate, Sheets repo, Vietnamese shell, setup bootstrap. Awaiting live verification. |
