# Project Overview & Product Development Requirements (PDR)

Complete project specification, functional requirements, non-functional requirements, and success criteria.

---

## Executive Summary

**Project Name:** Giai đoạn Thương mại Điện tử (E-commerce Phase)

**Objective:** Build a Vietnamese-language order management system on Google Sheets / Google Apps Script to replace manual Excel-based workflows.

**Target Users:** 
- Phong (Owner/Admin) — full access
- Sales staff (3–5 people) — create/edit orders, view their own data
- Warehouse staff (1–2 people) — manage inventory, view stock levels
- Admin assistants — manage user accounts, configuration

**Timeline:** August 2026 – November 2026 (6 milestones, ~12 weeks)

**Status:** Milestones 0–3 complete; M4–M6 in progress

---

## Business Requirements

### Problem Statement

Current workflow relies on:
- Manual Excel spreadsheets (no audit trail)
- Email coordination for approvals (slow, error-prone)
- No role-based access (everyone sees everything)
- No inventory tracking
- Approval bottleneck (all decisions go through owner)

**Impact:**
- Data integrity at risk (no undo/version history)
- Compliance gaps (no audit trail)
- Employee friction (slow approvals)
- Inventory stockouts not visible

### Proposed Solution

Web-based order management system with:
- Order CRUD (create, edit, delete, with multi-line items)
- Approval workflow (draft → submit → approve/reject)
- Role-based access (Admin / Sales / Warehouse)
- Inventory tracking
- Admin UI for user + permission management
- Statistics dashboard
- Export to CSV/XLSX/PDF
- All data in Google Sheets (no external database)

### Benefits

| Stakeholder | Benefit |
|-------------|---------|
| **Owner (Phong)** | Visibility into all orders; approval bottleneck automated; audit trail built-in |
| **Sales** | Create orders directly (no owner redoing); see own data; quick status updates |
| **Warehouse** | Manage inventory; low-stock alerts; see incoming orders |
| **Admin** | User management from UI (not spreadsheet); permission matrix self-service |

---

## Functional Requirements

### FR1: Order Management

**Scope:** Create, read, update, delete orders with multi-line items.

**Requirements:**
- Multi-line orders (one header, 1–N item lines)
- Fields: PO, customer, supplier, status, amounts (qty, unit price, VAT, total)
- Validation: required fields, numeric validation
- Auto-calculation: VAT (8% or 10%), totals
- Soft delete (mark inactive, not hard delete)
- Edit lock: Only creator or admin can edit
- Status workflow: Draft → Active → Cancelled (with optional approval flow behind feature flag)

**Acceptance Criteria:**
- [x] Create multi-line order, all fields stored correctly
- [x] Edit order, changes reflected; can't edit another user's order
- [x] Delete order (soft), remains in sheet but marked inactive
- [x] Multi-line form usable on phone (no horizontal scroll)

**Status:** COMPLETE (M2)

---

### FR2: Order List, Filter, Search

**Scope:** Display orders with filtering, sorting, searching.

**Requirements:**
- Paginated list (20 items per page)
- Sort: newest first
- Filters: date range, customer, status, created-by, approve status
- Search: free-text across order ID, PO, customer, description
- Filters AND together (not OR)
- Permission-scoped (users see only their orders unless `view_all_orders`)
- Load time: <3 seconds with 1 year of data

**Acceptance Criteria:**
- [x] List loads in <3 seconds
- [x] Every filter works alone and combined
- [x] Free-text search works
- [x] Filters respect `visible_fields` (can't filter by money if blind)

**Status:** COMPLETE (M3)

---

### FR3: Approval Workflow

**Scope:** Order approval state machine (Draft/Wait/Approved/Rejected).

**Requirements:**
- State machine: Draft → Wait For Approved → Approved | Rejected
- Edit gating: only Draft and Rejected orders can be edited
- Approval requires `approve_order` permission
- Reject requires reject reason (stored in StatusHistory)
- `approvalFlowEnabled` feature flag (can turn off to revert to plain edit)
- Approval instant (no email delays)

**Acceptance Criteria:**
- [x] Approve/Reject buttons only appear when eligible
- [x] Can't edit once approved
- [x] Reject reason captured and displayed
- [x] Feature flag toggles workflow on/off

**Status:** COMPLETE (M3.8), NOT YET LIVE

---

### FR4: Inventory Management

**Scope:** Product CRUD, low-stock tracking.

**Requirements:**
- Create/edit/delete products
- Fields: product code, name, UoM, last price, stock qty, min stock
- Low-stock flag (qty ≤ min)
- Search + filter (by code, name, active/inactive)
- Link to order lines: auto-fill name, UoM, price when selecting product code
- No foreign key constraint (old orders can exist without products)

**Acceptance Criteria:**
- [x] Create product, appears in autocomplete
- [x] Edit product, changes reflected on next order
- [x] Low-stock badge appears when qty ≤ min
- [x] Autocomplete in order form works

**Status:** COMPLETE (M5.1)

---

### FR5: User Management

**Scope:** Create, edit, deactivate users; assign permissions.

**Requirements:**
- Create/edit user: email, display name, notes
- Email immutable after creation
- Deactivation immediate (no cache)
- Permissions: preset (Admin / Sales / Warehouse) or custom (14 individual checkboxes)
- `visible_fields` per role (e.g., Sales can't see money columns)
- Last-admin protection: can't deactivate or strip `manage_users` from only active admin
- Self-admin protection: can't grant/revoke own `manage_users`

**Acceptance Criteria:**
- [x] Admin can create user from UI (not spreadsheet)
- [x] Permission change takes effect on user's next action
- [x] Can't deactivate last admin
- [x] Can't self-promote

**Status:** COMPLETE (M5.2)

---

### FR6: Permission Matrix

**Scope:** Granular permission control per user.

**Requirements:**
- 14 permissions: create_order, edit_order, change_status, view_all_orders, view_statistics, manage_inventory, manage_users, manage_config, export_statistics, + 5 future
- `visible_fields`: whitelist of columns (e.g., Sales can't see supplierName, supplierPaid)
- Presets: Admin (all), Sales (order create/edit, limited view), Warehouse (inventory only)
- Custom: User can override any preset by unchecking permissions
- UI: Collapsible permission group ("Nhóm quyền chi tiết"), auto-labels "Tuỳ chỉnh" if diff from preset

**Acceptance Criteria:**
- [x] Permission matrix editable from UI
- [x] Preset + custom paths both work
- [x] `visible_fields` enforced (blind users can't see/edit restricted columns)
- [x] Phone-usable (14 checkboxes fit without scroll)

**Status:** COMPLETE (M5.3), R3 SECURITY FIX (2026-09-10)

---

### FR7: Configuration Management

**Scope:** Edit status list, UoM list, customer list from UI.

**Requirements:**
- Read-only lists: Config sheet keys (no direct editing of `approvalFlowEnabled`, `Security`)
- Edit allowed: statusList, uomList, customerList, + future lists
- Changes appear instantly (cache invalidation <1 second)
- No JSON editing (user-friendly form)

**Acceptance Criteria:**
- [ ] Admin can add status → appears in dropdown immediately
- [ ] Admin can add UoM → appears in product form immediately
- [ ] Admin can add customer → appears in autocomplete immediately

**Status:** IN PROGRESS (M5.4)

---

### FR8: Statistics & Export

**Scope:** Revenue dashboard, export filtered data.

**Requirements:**
- Stats: revenue by week/month/quarter/year, by customer, by status
- Charts: CSS-based (no charting library)
- Export: CSV, XLSX, PDF
- Export respects current filters + `visible_fields`
- Layout mirrors existing Excel monthly report
- Vietnamese characters render correctly

**Acceptance Criteria:**
- [ ] Export matches on-screen data
- [ ] Can't export column outside `visible_fields`
- [ ] Vietnamese characters render in all formats

**Status:** IN PROGRESS (M4)

---

### FR9: Security & Audit

**Scope:** Access control, audit logging, key management.

**Requirements:**
- Permission gates on every API endpoint
- Identity token verification (not just API key)
- Key expiry: 30 days
- Key revocation: mark user `active = FALSE` → effect immediate
- Fingerprint check: optional (IP + device match)
- Audit log: who, what, when (rate-limited to 100/min per user)
- No secrets in code (store in Config sheet)

**Acceptance Criteria:**
- [x] Permission denied on missing permission
- [x] Deactivated user locked out immediately
- [x] Audit log captures all actions
- [x] Key expires after 30 days

**Status:** COMPLETE (M1 + security hardening)

---

## Non-Functional Requirements

### NFR1: Performance

**Requirements:**
- Order list load: <3 seconds with 1 year of data
- Order create/edit: <1 second
- Search: <2 seconds with 1000+ orders
- Pagination: 20 items per page (reduce per-page as data grows)

**Metrics:**
- [x] Order list <3s (confirmed M3)
- [ ] Search <2s (pending M3.4 live verification)

**Status:** PARTIAL

---

### NFR2: Responsiveness

**Requirements:**
- Desktop (PC/Mac): all features fully functional
- Phone (iOS Safari, Android Chrome): all major features usable
  - No horizontal scroll on forms
  - Buttons 44×44px minimum
  - Card-based layout (not table)
  - Touch-friendly (not hover-based)

**Acceptance Criteria:**
- [x] List view cards work on phone
- [x] Order form responsive
- [x] Permission matrix 14 checkboxes fit without scroll
- [ ] Full responsive pass on all screens (pending M6)

**Status:** PARTIAL

---

### NFR3: Reliability

**Requirements:**
- Uptime: 99% (Google Apps Script SLA)
- Data integrity: no data loss on network failure
- Recovery: graceful fallback if API calls fail (show cached data)
- Testing: 300+ offline assertions; manual checklist before each milestone

**Acceptance Criteria:**
- [x] 1154 offline assertions all passing (18 suites; see `codebase-summary.md` §3)
- [x] Manual checklist sections A–J verified live (M5)
- [ ] Full M6 hardening (pending)

**Status:** PARTIAL

---

### NFR4: Security

**Requirements:**
- No secrets in code
- Permission checks on every endpoint
- Rate limiting (100 calls/min per user)
- Audit trail (append-only)
- No SQL injection (using Sheets API, not SQL)
- No XSS (escaping user input)

**Acceptance Criteria:**
- [x] Permission gate pattern enforced
- [x] No hardcoded API keys
- [x] Audit log functional
- [x] Identity token verified on every request
- [x] R3 privilege escalation fixed

**Status:** COMPLETE

---

### NFR5: Maintainability

**Requirements:**
- Code under 200 lines per file
- Clear naming conventions
- Try-catch error handling (fail closed)
- Offline tests for logic (400+ assertions)
- Documentation (architecture, standards, checklists)
- Vietnamese error messages

**Acceptance Criteria:**
- [x] Code organized by function (Auth.gs, Orders.gs, etc.)
- [x] All errors in Vietnamese
- [x] Offline tests cover core logic
- [x] Documentation complete for M0–M3

**Status:** COMPLETE

---

## Constraints & Assumptions

### Constraints

| Constraint | Impact | Mitigation |
|-----------|--------|-----------|
| **Google Sheets as database** | No real-time sync; latency 500–1000ms per API call | Caching + pagination |
| **No external database** | Limited query flexibility; can't do complex JOINs | Denormalize data in Sheets; fetch + filter in Apps Script |
| **Google Apps Script limits** | 6-minute execution timeout per request | Pagination; keep requests small |
| **Vanilla JS only** | No React/Vue; more boilerplate | Manage state manually; use web components if needed |
| **Two-project architecture** | Deployment complexity; two versions to manage | Document deploy order; automate with clasp |

### Assumptions

| Assumption | Rationale |
|-----------|-----------|
| **Spreadsheet stays small** (<1M rows) | Typical order volume for target user; sheet scan still <3s |
| **No concurrent bulk edits** | Admin UI edit rate low (1–5 edits/min); lock pattern sufficient |
| **Google Sheets API reliable** | Google's SLA covers 99%; acceptable for internal tool |
| **Employees use modern browsers** | Chrome/Safari on desktop; Safari on iOS, Chrome on Android |
| **Admin can manage users** | Phong trusts self to set up permissions; no audit of admin actions |

---

## Success Metrics

### Milestone Completion

| Milestone | Target | Status |
|-----------|--------|--------|
| M0 (Setup) | Deploy to Google Apps Script | ✅ COMPLETE |
| M1 (Foundation) | Auth + permissions verified live | ✅ COMPLETE |
| M2 (Order CRUD) | Multi-line orders working | ✅ COMPLETE |
| M3 (List/Filter/Search) | Paginated list with filters | ✅ COMPLETE |
| M4 (Export/Stats) | Revenue dashboard + export | ◐ IN PROGRESS |
| M5 (Inventory + Admin) | User mgmt + permission matrix | ◐ PHASES 1-3b COMPLETE |
| M6 (Hardening) | Full responsive + Vietnamese | ☐ NOT STARTED |

### Quality Metrics

| Metric | Target | Status |
|--------|--------|--------|
| **Offline test coverage** | >300 assertions | ✅ 1154 (18 suites) — `codebase-summary.md` |
| **Live verification** | Every milestone tested on real account | ✅ 4/6 milestones |
| **Security vulnerabilities** | Zero severity-high unresolved | ✅ 1 HIGH (R3, FIXED) |
| **Performance** | Order list <3s | ✅ Confirmed |
| **Phone usability** | No horizontal scroll on major screens | ✅ Partial (M6 full pass) |
| **Vietnamese completeness** | 100% of user-facing text | ◐ 95% (pending M6) |

### User Adoption Metrics (Post-Launch)

| Metric | Target |
|--------|--------|
| **Active users** | 3–5 employees using daily |
| **Order creation rate** | 5–10 orders/day |
| **Approval time** | <1 hour (vs. email back-and-forth today) |
| **Data integrity** | Zero accidental overwrites (audit trail catches) |
| **Support burden** | <1 hour/week questions |

---

## Risk Assessment

### High Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|-----------|
| **Permission escalation** | User gains unintended access | MEDIUM | Permission gates on every endpoint; offline tests; R3 fix verified |
| **Data loss on network failure** | Order partially saved, inconsistent state | LOW | Google Sheets auto-saves; client-side cache invalidation on error |
| **Approval bottleneck remains** | Feature not used (flag stays off) | MEDIUM | Live testing M3.8 before enabling; design reviewed with Phong |

### Medium Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|-----------|
| **Cache staleness** | User sees outdated order | LOW | 2-min TTL; manual refresh button; browser dev tools show cache |
| **Incomplete M6 hardening** | Bugs on phone, English strings remain | MEDIUM | Full device testing (real iOS/Android); Vietnamese audit pass |
| **Shared-secret model weakness** | Config sheet editable by anyone with access | LOW | Accepted risk; Google Sheets access control mitigates; audit log records changes |

### Low Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|-----------|
| **Employee leaves without handing off** | Orders orphaned | LOW | Ownership-scoped, but admin can reassign or edit directly |
| **Google Apps Script API changes** | Code breaks | VERY LOW | Google maintains backward compatibility; SLA covers migration time |

---

## Roadmap & Timeline

### Phase Timeline

```
Aug 2026  | M0 (Setup) ✅ + M1 (Foundation) ✅
Sep 2026  | M2 (Order CRUD) ✅, M3 (List/Filter) ✅
Oct 2026  | M4 (Export/Stats) ◐, M5 (Inventory) ◐ (1-3b ✅)
Nov 2026  | M5 complete, M6 (Hardening) ☐
```

### Go/No-Go Gates

| Gate | Decision |
|------|----------|
| **M3 → M4** | Approval state machine (3.8) verified live before enabling |
| **M5 → M6** | M5 phases 4–5 (config + product linking) complete and tested |
| **M6 → Production** | Full M6 hardening + permission checklist pass; zero English strings |

---

## Acceptance & Sign-Off

**Project Owner:** Phong (anhphongit)

**Acceptance Criteria (ALL must be met):**
- [x] All milestones M0–M3 signed off
- [x] M5 phases 1–3b complete (inventory + user mgmt + permission matrix)
- [ ] M4 complete (export + statistics)
- [ ] M5 phases 4–5 complete (config + product linking)
- [ ] M6 complete (responsive + Vietnamese)
- [ ] Zero severity-high unresolved bugs
- [ ] 400+ offline assertions passing
- [ ] Full live checklist (CHECKLIST_M5_VI.md sections A–J) verified
- [ ] Employees trained + ready to use

**Sign-Off:** ___________________ (Phong) Date: ___________

---

## Document History

| Date | Change | Author |
|------|--------|--------|
| 2026-09-10 | M5.3b permission UI redesign + R3 security fix documented | docs-manager |
| 2026-09-03 | M3 signed off; roadmap updated | docs-manager |
| 2026-08-27 | M2 signed off; M5 timeline projected | docs-manager |
| 2026-08-18 | M0 + M1 signed off; security hardening logged | docs-manager |
| 2026-08-15 | PDR created; initial roadmap | docs-manager |

---

## Related Documentation

- **[MILESTONES.md](MILESTONES.md)** — Detailed milestone definitions + progress log
- **[development-roadmap.md](development-roadmap.md)** — Timeline, phases, success metrics
- **[system-architecture.md](system-architecture.md)** — Technical design
- **[code-standards.md](code-standards.md)** — Code conventions + testing
- **[SECURITY.md](SECURITY.md)** — Threat model + security practices
- **[PERMISSIONS.md](PERMISSIONS.md)** — Permission matrix definition
- **[CHECKLIST_M*.md](CHECKLIST_M5_VI.md)** — Live verification checklists
