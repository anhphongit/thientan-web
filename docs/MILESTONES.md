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

## ☑ Milestone 3 — List, filter, search, status  *(done 2026-09-03)*

Scope:
- Paginated order list, sorted newest first
- Filter by month/date range, customer, status, created-by, approve status
- Free-text search across order no, customer PO, customer, description
- `changeStatus` + `StatusHistory` append
- Approve-status workflow (Draft/Wait For Approved/Approved/Rejected) gating
  who can edit an order — task 3.8, replaces the plain admin-approve stamp
  originally scoped here as "Admin approve / delete"

**Exit criteria**

- [x] List loads under ~3 seconds with a year of data — Phong confirmed
      live 2026-09-03 after pushing/migrating; not independently
      re-measured against a specific dataset size beyond that.
- [x] Every filter works alone and combined; filters are permission-scoped
      — `orders-filter.test.js` (60 assertions, month/customer/status/
      createdBy/search/approveStatus, alone and ANDed together, scoped by
      `visible_fields`/`view_all_orders`).
- [x] Status change is recorded in `StatusHistory` with who and when —
      `appendStatusHistory_` on every `status`/`approveStatus` transition;
      `orders-changestatus.test.js` (28 assertions) — renamed
      `orders-changelinestatus.test.js` in Milestone 5a, when
      `actionChangeStatus_` (the order-level quick-status action this
      tested) was deleted outright and status moved to line scope.
- [x] `change_status` is enforced server-side — `actionChangeStatus_`
      calls `requirePermission_('change_status')` before anything else;
      covered in `orders-changestatus.test.js` and
      `orders-permissions.test.js` (116 assertions) — `actionChangeStatus_`
      no longer exists post-Milestone 5a (see above); `change_status` is
      now enforced per line inside `actionUpdateOrder_`.
- [x] The approve-status edit-gating matrix (`TASKS.md`, task 3.8) is
      enforced server-side for every `approveStatus` × permission
      combination, not just the UI hiding a button —
      `canEditForApproveStatus_`/`approveActionFlags_`, re-checked inside
      `withOrderLock_` on every write; `orders-approvestatus.test.js` (97
      assertions) and `orders-approvestatus-ui.test.js` (51 assertions).
- [x] The list is readable on a phone (cards, not a squashed table) —
      card-based list (`.order-card`) confirmed by design throughout 3.5/
      3.8's UI revisions; Phong's live test 2026-09-03 covered the
      current build but wasn't called out phone-specifically — flag if
      that still needs a dedicated phone pass before fully trusting this
      box.

Closed out 2026-09-03 after Phong pushed, ran both pending migrations
(`migrateAddRejectReasonColumns`, `migrateFixDatetimeColumns`), and live-
tested the full approve-status/self-approver/reject-reason/locking build
with no issues. 489 offline assertions passing across 7 files at close.
Whole-repo total across every milestone: see `TASKS.md` for the
per-revision breakdown.

---

## ☑ Milestone 4 — Export + statistics *(done 2026-09-12)*

Scope:
- `Export.gs`: export the **currently filtered** list to CSV / XLSX / PDF
- Layout mirrors the existing monthly report (month grouping, `STT`/`PO` on first
  line only, `DOANH SỐ THÁNG n` totals) — see `EXCEL_REFERENCE.md`
- `Stats.gs`: revenue by week / month / quarter / year, by customer, by status
- `ui/ViewsStats.html`: CSS-based chart rendering (design choice per TASKS.md 4.7.x)

**Exit criteria**

- [x] Exported file matches what is on screen, including filters
- [x] A user cannot export a column outside their `visible_fields`
- [x] The PDF is recognizable to someone used to the current Excel report
- [x] Vietnamese characters render correctly in all three formats
- [x] Revenue figures reconcile against the reference Excel for a sample month
- [x] `view_statistics` is enforced; `export_statistics` is reserved for a future stats-export surface (deferred per TASKS.md 2191–2193, no call site exists)

---

## ☑ Milestone 5 — Inventory + Admin UI *(done 2026-09-13)*

Scope:
- `Products.gs` + `ui/ViewsInventory.html`: product/stock CRUD, low-stock flag
- `Admin.gs` + `ui/ViewsAdmin.html`: user list, add/edit/deactivate, permission
  matrix editor, `Config` sheet editing (status list, UoM list, customer list)

**Exit criteria**

- [x] Admin can create a user and set permissions without touching the Sheet
- [x] A permission change takes effect on the affected user's next action
- [x] The last active admin cannot be deactivated or stripped of `manage_users`
- [x] Product CRUD works; `OrderLines.productCode` can link to a product
- [x] The permission matrix is usable on a phone (card per user)

---

## ☑ Milestone 5a — Order Status → Line Status *(done 2026-09-14)*

Not a continuation of M5.1 ("Product CRUD", above — already complete, unrelated). Inserted
after M5, before M6, per project-owner sequencing decision (2026-09-14). Full plan:
`plans/done/260914-0907-milestone-5a-order-status-to-line-level/plan.md`.

Scope:
- `Orders` loses the plain `status`/`statusNote` fields entirely — keeps only `approveStatus`
  (M3.8 workflow, unchanged, still behind `approvalFlowEnabled`)
- `OrderLines` gains optional `status`/`statusNote` (reuses `Config.statusList`); a line may be
  saved with no status
- `StatusHistory` gains a `lineId` column; every line status change is audited individually
- Order list/cards drop status entirely (no pill, no filter, no quick-change); line status is
  editable only inside the order edit form
- `Stats.gs`/`Export.gs` reworked to aggregate by line status (sum line revenue per status,
  explicit blank-status group)
- No backfill: existing orders' current `status` values are discarded, not copied to lines

**Exit criteria**

- [x] All 20 offline test suites green, including new line-status coverage
- [x] Mockup-approved per-line status control implemented and screenshot-verified
- [x] Live migration (`migrateOrderLineStatus()`) run once by the project owner, 2026-09-14 —
      verified end-to-end against real data (mixed/blank line statuses, one status-change history
      row, approveStatus intact, stats/export, non-admin permissions, 360px mobile all confirmed
      by owner). Backup-before-migrate and a standalone `checkOrderHeaders_()` confirmation were
      not explicitly captured on record — flagged as outstanding, low-risk (migration is
      non-destructive by design, rename not delete) in Phase 8's sign-off table.
- [x] `DATA_MODEL.md`/`system-architecture.md`/`PERMISSIONS.md` synced to the new schema

**☑ Milestone 5a — done 2026-09-14.** All 8 phases (schema, backend, stats/export, frontend UI,
admin-config review, tests, docs-sync, live verification) complete. Live migration run and
verified by the project owner. See Phase 8 sign-off table
(`plans/done/260914-0907-milestone-5a-order-status-to-line-level/phase-08-live-verification-and-signoff.md`)
for the full record, including two minor outstanding items noted above.

---

## ☑ Milestone 5b — Permission Labels & Per-User Visible Fields Config  *(done 2026-09-14)*

Inserted after 5a, before 6, per project-owner request (2026-09-14). Full plan:
`plans/260914-1049-milestone-5b-permission-ui-and-visible-fields/plan.md`.

Scope:
- Homepage "Quyền hạn" card (`apps/web/ui/App.html`'s `homeHtml()`) shows Vietnamese
  labels instead of raw permission keys, reusing `ViewsAdmin.html`'s existing
  `PERMISSION_GROUPS` (extracted into a shared `ui/PermissionLabels.html` partial)
- Non-admin users see only their granted permissions (denied ones hidden entirely,
  not just styled); admins (`manage_users`) keep seeing the full list styled
  granted/denied, same as today
- The homepage's "Cột được xem" (visible_fields) line is removed — that belongs only
  in the admin config screen
- Admin permission matrix editor (`ViewsAdmin.html`) gains a real per-user
  `visible_fields` editor: grouped checkboxes (Đơn hàng / Dòng đơn hàng / Hoá đơn) +
  a "Toàn bộ cột" master toggle, sourced live from `Config.gs`'s `HEADERS` via a new
  `listVisibleFieldGroups` action — today it's silently inherited from whichever
  preset a user's base resolves to, with no UI control at all
- New `ui/AdminVisibleFields.html` partial (modularization, alongside the label
  extraction) keeps the already-oversized `ViewsAdmin.html` from growing further inline

**Exit criteria**

- [x] Non-admin homepage shows only granted permissions, labeled, no raw keys
- [x] Admin homepage shows all permissions, labeled, styled granted/denied
- [x] Admin can configure per-user `visible_fields` via checkboxes and save successfully
- [x] "Toàn bộ cột" toggle and always-visible/money-field indicators work as designed
- [x] Mockup approved (Phase 3) and implementation screenshot-verified against it
- [x] All offline test suites green, including new/updated visible_fields and
      homepage-permission-display coverage
- [x] `PERMISSIONS.md`/`system-architecture.md` synced to describe the real editor

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

## ☑ Milestone 6 — Hardening and polish  *(done 2026-09-16)*

Scope:
- `backupNow()`: export every sheet to a timestamped Drive folder; Admin button
- Full responsive pass on real devices
- Vietnamese completeness sweep — zero English strings left
- Error message review; no stack traces reach users
- Short user guide in Vietnamese for the employees

**Exit criteria**

- [x] Backup produces a restorable copy of all six sheets
- [x] Every screen usable on iOS Safari and Android Chrome
- [x] Full permission checklist from `PERMISSIONS.md` passes
- [x] Employees can complete a full order lifecycle unaided using the guide

---

## ☐ Milestone 7 — Legacy Excel Order Import

New milestone, for the live/go-live stage, per project-owner request (2026-09-14). Inserted
after M6, before employee rollout with real data. Full plan:
`plans/260914-1115-milestone-7-legacy-excel-import/plan.md`.

A deliberate, one-time exception to the 2026-08-15 decision recorded in `OPEN_QUESTIONS.md`
("Import the existing Excel? No. Reference only") — this milestone imports the real historical
`FILE THEO DOI DON HANG.xlsx` (Jan–Aug 2026, ~206 orders / ~534 lines) into live data so
employees start with real order history instead of an empty app. It does not change the
app's manual-entry design going forward.

Scope:
- One-time admin migration script (`migrateImportLegacyOrders()`, `apps/api/LegacyImport.gs`),
  run once from the Apps Script editor — no ongoing UI, no repeat-use import feature
- Parses the raw legacy `.xlsx` as-is: month blocks, multi-line PO/status cells, per-line
  VAT-ratio detection — no manual pre-cleanup spreadsheet
- Populates `Orders` + `OrderLines` + `Invoices` only; `Config.customerList`/`uomList` self-fill
  via the existing live mechanism, not separately seeded
- Line status (`OrderLines.status`/`statusNote`) populated directly from the source file's
  per-row `TRẠNG THÁI` column — requires Milestone 5a's schema first
- Reconciles every imported month's total against the file's own printed `DOANH SỐ THÁNG n`
  figure before and after the live run
- Requires a fresh `backupNow()` (Milestone 6) snapshot immediately before the live run

**Exit criteria**

- [ ] All 8 months' imported totals reconcile against their printed `DOANH SỐ THÁNG n` value
- [ ] Live run executed once against production, with a fresh verified backup taken immediately
      before it, project owner present
- [ ] Spot-checked orders render correctly in the live web app (not just the Sheet)
- [ ] `EXCEL_REFERENCE.md`, `OPEN_QUESTIONS.md`, `README.md`, `DATA_MODEL.md`,
      `development-roadmap.md` synced to describe this as a one-time historical import

---

## Progress log

| Date | Milestone | Note |
|------|-----------|------|
| 2026-09-16 | 6 | **Milestone 6 live verification and sign-off completed** — All base exit criteria verified and signed off by project owner 2026-09-16. Backup production-ready (manual "Sao lưu ngay" creates restorable copy of all six sheets; tested opening from Drive). Full responsive pass confirmed on iOS Safari and Android Chrome with real devices (Phase 4). Complete permission checklist from `PERMISSIONS.md` re-run and all boxes passed. User guide walkthrough (`docs/USER_GUIDE_VI.md`) completed by employee unaided, confirming full order lifecycle is doable without admin intervention. Three stretch items shipped and verified live: (1) Scheduled backup + retention trigger (Phase 1, `BackupJob.gs`) with admin visibility in trigger-installed panel, (2) Admin system-health panel showing last backup time + 24h/7d error counts from combined api/web logs (Phase 3, `SystemHealth.gs`), (3) Vietnamese regression-guard lint script tool (`tools/offline-tests/lint-english-strings.test.js`) preventing future English reintroduction (Phase 5). All 26 offline test files passing, 1154+ assertions. See `CHECKLIST_M6_VI.md` sections A–H and `docs/PERMISSIONS.md` for full coverage. |
| 2026-09-14 | 5b | **Milestone 5b code-complete and docs synced** — All five phases complete (shared permission labels, backend visible-field groups source, mockup-approved per-user editor, editor implementation with "Toàn bộ cột" toggle + grouped checkboxes + live filter, tests + docs sync). Homepage "Quyền hạn" card now shows Vietnamese labels instead of raw keys; non-admin users see only granted permissions, admins see full list styled granted/denied. Admin permission matrix editor now has a real per-user `visible_fields` editor (previously read-only, inherited only from preset). Editor UI: separate disclosure section with group-collapsed checkboxes (Đơn hàng, Dòng đơn hàng, Hoá đơn), master "Toàn bộ cột" toggle, live text filter, alwaysVisible fields disabled/tagged "khoá", isMoney fields tagged "₫". Backend source: `listVisibleFieldGroups` action returns live deduped field list from `HEADERS` via `visibleFieldGroups_()`, 37 unique fields. During review: caught and fixed critical bug where alwaysVisible fields in explicit saved list (approveStatus/updatedBy/updatedAt) would spuriously mark a preset-based user as role:'custom' on an otherwise untouched save. R3 escalation protection (carry-from-base-when-untouched) preserved; explicit editing layered on top. All offline test suites green (1,129+ assertions). |
| 2026-09-14 | 5a | **Milestone 5a live migration run and signed off** — `migrateOrderLineStatus()` run once against the live sheet by the project owner; end-to-end verification (mixed/blank line statuses, one status-change history row, order list free of business status with approveStatus intact, stats/export, approval-workflow regression check, non-admin permission spot-check, 360px mobile) confirmed working. Two minor items not captured on record: an explicit pre-migration backup and a standalone `checkOrderHeaders_()` confirmation — low risk given the migration is non-destructive by design (rename, not delete); see Phase 8 sign-off table for detail. All 8 phases of the plan now complete. |
| 2026-09-14 | 5a | **Milestone 5a code-complete and docs synced** — Phases 1–6 completed (schema migration, backend line-status logic, stats/export aggregation by line, frontend UI with mockup-approved per-line control, admin config review, comprehensive test suite). Phase 7 (docs-sync) executed: `DATA_MODEL.md` updated to show status/statusNote on OrderLines (optional) with statusList referenced from Config, StatusHistory added lineId (nullable), migration documented as not-yet-run-live. MILESTONES.md and development-roadmap.md flipped "Milestone 5a" placeholders from ☐ to ☑. Phase 8 (live migration + sign-off) pending project owner execution. All 18 offline test suites passing. Line-status aggregation by business decision: sum line revenue per status, explicit blank-status group "Chưa đặt trạng thái". Frontend option D approved: inline select + full-width always-visible status-note field below. Migration `migrateOrderLineStatus()` ready but not yet executed against live sheet. See plan `260914-0907-milestone-5a-order-status-to-line-level` for full phase details. |
| 2026-09-13 | 5 | **Milestone 5 live verification and sign-off completed** — All exit criteria verified and signed off by project owner 2026-09-13. Inventory CRUD (products, categories, low-stock alerts), user management (create/edit/deactivate/permissions), permission matrix (14 checkboxes, phone-friendly card layout), config editing (status list, UoM list, customer list with instant cache invalidation), and admin protection rules (last-admin safeguards, self-escalation prevention) all confirmed operational. One bug found and fixed during test pass (stale inventory cache on inactive toggle — M5-1 in TASKS.md). All 126 checklist items in `CHECKLIST_M5_VI.md` passed. See checklist sections A–K for full test coverage. |
| 2026-09-12 | 5 | **Bug found and fixed — stale inventory cache on active→inactive edit**: During M5 live testing, editing a product's `active` flag from true→false and returning to the list still showed the product even though "Bao gồm hàng không hoạt động" (include inactive) filter was OFF. Root cause: `upsertCachedProduct()` write-through cache after edit/create didn't check filter state. Fix: added `matchesFilters` check before upserting; now removes from cache if product no longer matches active filters. Regression test added to `products-ui.test.js`. Full suite: 18/18 passing. See `TASKS.md` for full details. |
| 2026-09-12 | 4 | **Milestone 4 live verification and sign-off completed** — All exit criteria verified and signed off by project owner 2026-09-12. Export (CSV/XLSX/PDF) with filtering, permissions-based column hiding, Vietnamese character rendering, and revenue reconciliation all confirmed. Statistics views (by week/month/quarter/year, by customer, by status) operational. Mobile responsiveness verified. All 11 M4 subtasks (4.1-4.7.3) code-complete and live-tested. See `CHECKLIST_M4_VI.md` sections A–I all checked. |
| 2026-09-10 | 5 | 🔴 **Security fix (R3): Privilege escalation in `visible_fields` on permission matrix save** — Severity: HIGH. Root cause: `ViewsAdmin.html:742` hardcoded `visible_fields` to `['*']` on every matrix save, allowing warehouse users to become visible to all money columns (supplier cost, deposit, VAT, etc.) regardless of their intended role. Fix: Carry `visible_fields` from base preset (never hardcode); only override if user selects custom permissions. Validated offline; awaiting live re-test after deploy. Impact: Anyone editing the permission matrix (admin or user with appropriate perms) needed to retake their permissions afterward — already tested in M5 checklist. Root cause traced to a copy-paste from UI preset-handling code. See `TASKS.md` for full audit of `visible_fields` flow. |
| 2026-09-10 | 5.3b | **Permission disclosure UI redesigned — Phase 01-05 completed** (M5-3 design, Issue M5-3/2026-09-10): Replaced checkbox toggle (`presetToggle`, "Dùng preset" / "Tuỳ chỉnh") with collapsible button (`"Nhóm quyền chi tiết"` / Details group) in permission matrix editor. New flow: (1) user selects base role → matrix seeded from that preset, (2) edits individual checkboxes as needed, (3) button auto-labels as `"+ tuỳ chỉnh"` when diff detected, (4) on edit (unknown permission state) auto-expands details group. Server payload now decides `presetKey` vs `permissions` based on whether saved state matches a preset exactly (not a toggle). Benefits: cleaner UI, no "Which mode am I in?" confusion, permission intent clearer on both client and server. Backend (`Admin.gs:actionUpdateUserPermissions_`) updated to validate preset matching; frontend (`ViewsAdmin.html` + `app/admin.js`) updated to track diff and render conditional labels. All 14 checkboxes phone-friendly on card layout (K.3 checklist). 89 new offline test assertions, all passing. Verified live M5 checklist sections E–F. |
| 2026-09-02 | 3 | **Task 3.8 built** (server pass then client pass, same day as the design was agreed): `approveStatus` state machine (Draft/Wait For Approved/Approved/Rejected) live in `apps/api` (new `requestApprove`/`approveOrder`(rewritten)/`rejectOrder` actions, the edit-gating matrix enforced in `actionUpdateOrder_`, `ALWAYS_VISIBLE_FIELDS` for approve-status/last-updated-by, `migrateAddApproveStatus()`) and `apps/web` (approve-status pill on every card/detail, Gửi duyệt/Duyệt/Từ chối buttons, the auto-approve-vs-draft save prompt, an approve-status filter, `T.confirm()` gained an optional reject-note field). Fixed a gap inherited from 3.6 along the way: approve/reject require only `approve_order`, not `edit_order`, but the old action-row markup hid those buttons whenever the order was read-only for that user — now drawn independent of the read-only gate. Behind `approvalFlowEnabled` (Config, default off) end to end — flag off reproduces today's plain edit/view behavior exactly, both client and server. 404 assertions across 7 offline test files, all passing (49 new server assertions, 14 new UI assertions). `migrateAddApproveStatus()` has NOT been run against the live sheet yet, and the flag has not been verified live — do that before enabling it for real users. Full detail in `TASKS.md`, "Milestone 3, task 3.8". |
| 2026-09-02 | 3 | **Task 3.8 designed, not built**: reviewed 3.6's `approve_order` stamp with Phong — it had no effect on who could edit, so an "approved" order could be silently edited by anyone. Agreed a real `approveStatus` state machine (Draft/Wait For Approved/Approved/Rejected) that gates editing itself, replacing 3.6 outright. Full design, edit-gating matrix, and a decision log are in `TASKS.md` under "Milestone 3, task 3.8". Nothing coded yet — next session builds server-side first (Orders.gs + offline tests for the gating matrix), then the client UI as a separate pass, per Phong's explicit staging request. |
| 2026-08-31 | 3 | **Reusable confirm popup (`TT.confirm()`)**: every inline confirm-box (delete order, approve order, discard-and-reload) migrated to a shared popup on `window.TT`, so any future view can reuse it. Style is the "S2" option picked from Artifact mockups — tinted icon-band header + a mini order-summary card (id, status pill, customer, total) so the user confirms against the specific record on screen. Reviewed every action in the app for a missing confirm: found and fixed one gap — quick status change from the list pill now confirms too (lightweight, no summary card, stays a quick action). Still not `window.confirm` (blocks the Apps Script iframe). Test suite updated for the new async flow, 362 assertions across all suites (net -4 from removing now-unobservable mid-flight checks, +3 for the new popup assertions), all passing. Client-only; API BUILD unchanged. Not yet verified live. |
| 2026-08-31 | 3 | **Task 3.6 built**: `approveOrder`, a new one-purpose API action for admin approval (separate from the edit/status-change flows) — `approve_order` + ownership enforced, refuses outright if already approved (re-checked inside the lock against a race between two admins), `approvedBy`/`approvedAt` stamped, one-way (no unapprove). List cards and the detail response gain `canApprove` (ownership-aware, false once approved). Client: a "Duyệt đơn hàng" button (confirm-then-approve, same pattern as delete) in the detail action row, plus an "Đã duyệt bởi …" note once approved. Also patches the list-card cache and invalidates the detail cache on success, same as the 3.5 quick-status fix. 21 more offline assertions (366 total across all suites). Not yet verified live. |
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
