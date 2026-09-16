# Codebase Summary

Quick reference guide to the project's modules, milestones, and test coverage.

---

## 1. API Modules (`apps/api/*.gs`)

| File | LOC | Milestone | Purpose |
|------|-----|-----------|---------|
| `Router.gs` | 294 | M1 | HTTP request routing, endpoint dispatcher for all API actions |
| `Auth.gs` | 78 | M1 | Google OAuth login / logout, session management |
| `Config.gs` | 493 | M1–M5 | Schema definitions, constants, config values, default lists |
| `Setup.gs` | 313 | M1 | Sheet initialization, headers, first-time setup |
| `Permissions.gs` | 92 | M3 | Permission validation, gate enforcement for protected actions |
| `SheetsRepo.gs` | 192 | M1 | Low-level sheet read/write operations, row addressing by header |
| `Admin.gs` | 397 | M1–M3 | User CRUD, role/permission management UI actions |
| `AdminConfig.gs` | 346 | M2 | Config sheet editing: status, UOM, customer, VAT rate lists |
| `Orders.gs` | 1649 | M1–M5 | Core order operations: CRUD, filtering, status change, approval flow |
| `Products.gs` | 383 | M5 | **Inventory backend (M5.1–5.4).** Product catalog: CRUD, lookup, low-stock flag |
| `Stats.gs` | 337 | M4 | Revenue statistics: bucketing by period/customer/status |
| `Export.gs` | 441 | M4 | Export formatting, CSV/XLSX/PDF generation logic |
| `ExportJob.gs` | 582 | M4 | Export queue management, job tracking, concurrency |
| `ExportSheet.gs` | 324 | M4 | Spreadsheet export layout and styling |
| `Migrations.gs` | 328 | M2–M5 | One-time schema migrations (add columns, backfill data) |
| `Security.gs` | 322 | M3 | Audit logging, security event recording, access control |
| `SystemHealth.gs` | 68 | M6 | Admin-only system health panel: last backup status, error counts (24h/7d) |
| `DevSeed.gs` | 204 | M1 | Test data generation (reference file → Orders/OrderLines for development) |

**Notes:**
- **Products.gs is the M5 inventory backend**, NOT Inventory.gs (no Inventory.gs file exists).
- All API files use Apps Script conventions: trailing underscores denote private functions; public functions have no underscore.

---

## 2. Web UI Modules

### HTML Views (`apps/web/ui/*.html`)

| File | LOC | Milestone | Purpose |
|------|-----|-----------|---------|
| `Index.html` | 159 | M1 | Root page, IPC setup, web-app container |
| `App.html` | 721 | M1–M5 | Top-level application chrome, nav, dialog container |
| `Styles.html` | 1338 | M1–M5 | Global CSS, component classes, theme variables |
| `ViewsOrders.html` | 3163 | M1–M5 | Order list + detail card UI, search/filter inputs, approval flow, reject modal |
| `ViewsInventory.html` | 836 | M5 | Product catalog UI: list, detail card, add/edit product form |
| `ViewsAdmin.html` | 1578 | M1–M6 | User matrix, permission grid, role presets, config editing, system health panel |
| `ViewsStats.html` | 615 | M4 | Revenue statistics display: charts, period/filter toggles, CSV export link |

### AppScript Logic (`apps/web/*.gs`)

| File | LOC | Milestone | Purpose |
|------|-----|-----------|---------|
| `Main.gs` | 442 | M1–M5 | Web entry point, sidebar handler, all UI IPC functions |
| `ApiClient.gs` | 214 | M1–M5 | HTTP client wrapper, error handling, JSON serialization |
| `Auth.gs` | 38 | M1 | Client-side auth checks (for UI gating before API call) |
| `Config.gs` | 41 | M1 | Client-side constants (message strings, field lists) |

---

## 3. Test Suite (`tools/offline-tests/*.test.js`)

19 test files, **1154+ total assertions** across all suites (updated 2026-09-16).

| File | Assertions | Purpose |
|------|-----------|---------|
| `appsscript-manifest.test.js` | 5 | Manifest structure validation |
| `apiclient-scope.test.js` | 15 | OAuth scope and client validation |
| `admin-config.test.js` | 68 | Config sheet CRUD: statusList, uomList, customerList, vatRates |
| `admin-ui.test.js` | 91 | Admin UI state: permission matrix grid, role presets |
| `admin.test.js` | 98 | User CRUD: add, edit, deactivate; permission matrix persistence |
| `export.test.js` | 56 | CSV/XLSX/PDF export generation |
| `exportjob.test.js` | 91 | Export job queue, concurrency, retry logic |
| `exportsheet.test.js` | 45 | Spreadsheet export formatting (borders, merges, styles) |
| `orders-approvestatus.test.js` | 97 | Approval workflow state machine (M3.8) |
| `orders-approvestatus-ui.test.js` | 49 | Approval UI: request/approve/reject buttons and modals |
| `orders-changelinestatus.test.js` | 32 | Line status changes and history logging (renamed from `orders-changestatus.test.js`, Milestone 5a) |
| `orders-crud.test.js` | 58 | Create, read, update, delete orders and lines |
| `orders-filter.test.js` | 56 | Filtering: date, customer, status, creator, free-text search |
| `orders-permissions.test.js` | 114 | Permission matrix enforcement, field visibility, ownership |
| `orders-ui.test.js` | 80 | Order list UI state: pagination, cards, edit form |
| `products.test.js` | 67 | Product CRUD, low-stock flag, lookup, inactive handling |
| `products-ui.test.js` | 53 | Product UI: list, detail, add/edit forms, picker |
| `stats.test.js` | 65 | Revenue stats: bucketing, filtering, customer/status grouping |
| `system-health.test.js` | — | System health panel: permission gate, error-count windowing, logging isolation |

**How to run:** `for f in tools/offline-tests/*.test.js; do node "$f" || echo "FAIL $f"; done` — all 19 should pass, 0 failures (26/26 total with offline helpers).

---

## 4. Key Architectural Decisions

| Decision | Milestone | Note |
|----------|-----------|------|
| **Single spreadsheet, row-by-header addressing** | M1 | Enables safe column reordering; see SheetsRepo.gs |
| **Server-side permission enforcement** | M1 | All API calls validated; `export` permission gates order export (not CSV specifics) |
| **Status history append-only log** | M1–M3 | Used for audit trail; approval workflow moved away from this in M3.8 |
| **Approval flow state machine** | M3.8 | Draft → Wait For Approval → Approved/Rejected, gates editing per PERMISSIONS.md |
| **Reject reason denormalized to Orders row** | M5 (2026-09-03d) | Avoids expensive StatusHistory scan on detail load |
| **Datetime formatting fix** | M5 (2026-09-03f) | Cosmetic; app logic unaffected (Sheets display format, not data) |
| **Stock deduction is manual, not automatic** | M5 | Products.stockQty is plain number; no auto-deduction on order operations |
| **export_statistics reserved, not enforced** | M1 (deferred) | Phase 1 decision: defer until UI shape known (TASKS.md:2191-2193) |

---

## 5. Milestones

- **M1** — Core order CRUD, user auth, permissions framework
- **M2** — Search/filter, config management, line count optimization
- **M3** — Approval workflow, security audit logging, status history
- **M4** — Statistics (revenue by period/customer/status), export to multiple formats
- **M5** — Product catalog, inventory lookup, responsive UI, Vietnamese localization
- **M5a** — Order status → line status migration (complete, 2026-09-14)
- **M5b** — Permission labels and per-user visible fields config (complete, 2026-09-14)
- **M6** — Backup, responsive polish, Vietnamese completeness, user guide (complete and live-verified, 2026-09-16; includes 3 stretch items: scheduled backup+retention, admin health panel, regression-guard script)

---

## 6. Single Source of Truth

**Test Assertion Count:** 1154 total (18 suites, see §3 above). This file is the canonical reference; do not copy this number into other docs—link to `codebase-summary.md` instead (DRY principle).

**Inventory Backend:** `Products.gs` (M5), not Inventory.gs (does not exist).
