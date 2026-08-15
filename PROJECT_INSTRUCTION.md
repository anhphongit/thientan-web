# Project Instruction – Local Order & Inventory Management Website

**Version:** 1.0  
**Last updated:** 2026-08-15  
**Language of UI:** Vietnamese  
**Target users:** 1 Admin + 5–6 employees (small business)  
**Expected volume:** ≤ 100 orders / month  

This document is the single source of truth for any AI agent (Grok or other) working on this project. It contains the complete requirements, constraints, data model, security rules, and decisions already made. Do **not** re-open architecture debates unless the human explicitly asks.

---

## 1. Goal

Build a responsive web application (PC + mobile) that allows a small Vietnamese business to:

- Manage orders (create, edit, view, filter, search)
- Track order status
- Manage inventory
- View revenue statistics (week / month / quarter / year) with charts
- Export order lists to CSV, XLSX, PDF
- Let Admin fully manage users and a fine-grained permission matrix

The system must feel like an internal tool. It is **not** a public website.

---

## 2. Confirmed Architecture Decision

**Chosen direction: Option C (Google-centric)**

- All business data + user/permission data live in **private Google Sheets**.
- Backend = Google Apps Script web app.
- Authentication = Google account login (personal Gmail is acceptable).
- Authorization (permission matrix, “own orders only”, field visibility…) is **enforced only inside Apps Script**.
- Frontend = HTML + vanilla JS (or very light modern JS), fully responsive, all UI text in Vietnamese.
- No local JSON files, no local Node/Python server required on the admin PC.
- Internet is required and accepted.

(Option B exists as a documented alternative in the companion file `DETAILED_PLANS_OPTION_B_AND_C.md`. Do not implement Option B unless the human explicitly switches.)

---

## 3. Strict Security Rules (must be followed)

1. All Google Sheets must remain **Restricted** (never “Anyone with the link”).
2. Deploy Apps Script web app as:
   - **Execute as: Me** (owner account)
   - **Who has access: Anyone with a Google account**
3. Frontend must **never** contain Sheet IDs, private keys, or raw data access logic.
4. Every server-side function must:
   - Get `Session.getActiveUser().getEmail()`
   - Look up the user in the Users sheet
   - Check the exact permission required
   - Reject the request if not allowed
5. Only the owner/admin account may edit the Apps Script project itself.
6. Employees never receive direct access to the underlying Sheets.

---

## 4. Functional Requirements

### 4.1 Authentication & Users
- Login via Google account.
- Admin can add / remove / activate users.
- Fine-grained permission matrix per user (examples):
  - view_orders, create_order, edit_order, delete_order
  - view_all_orders (vs own orders only)
  - search_filter, export, view_statistics, export_statistics
  - manage_inventory, manage_users, approve_order, change_status
  - field-level visibility (which columns a user can see)
- Default rule: a normal user sees only orders they created, unless they have `view_all_orders`.

### 4.2 Orders
- Support multi-line orders (one PO → many line items).
- Core fields (derived from current Excel report):
  - STT, PO, Khách hàng, Chi tiết, Đơn giá bán ra (VND), SL, ĐVT
  - Thành tiền chưa VAT, Trị giá HĐ, Hóa đơn ra, Ngày HĐ, Trạng thái
- Status is controlled (suggested list + free note):
  - draft, confirmed, exported, delivered, paid, cancelled, waiting_stock, …
- Admin can approve / delete / change status.
- Filter + search by any relevant field.
- Export current filtered list → CSV / XLSX / PDF (layout should be able to resemble the existing monthly report).

### 4.3 Inventory
- Basic product / stock management (CRUD).
- Linkable to order lines where useful.

### 4.4 Statistics & Charts
- Revenue by week / month / quarter / year.
- Simple charts (Chart.js or equivalent).
- Permission-gated.

### 4.5 Other
- Fully responsive (usable on Windows / macOS / Android / iOS browsers).
- All UI strings in Vietnamese.
- Backup: Apps Script can export sheets + optional Drive version history. Manual “backup” button is nice-to-have.

---

## 5. Data Model (Sheets)

Suggested private sheets (exact names can be adjusted):

| Sheet            | Purpose                                      |
|------------------|----------------------------------------------|
| Users            | email, name, active, role, permission matrix |
| Orders           | header-level order data                      |
| OrderLines       | line items (linked by PO or OrderID)         |
| Products         | inventory / product master                   |
| StatusHistory    | optional audit of status changes             |
| Config           | system settings, status list, etc.           |

Multi-line orders are first-class: one Order header + many OrderLines.

---

## 6. Non-Goals (v1)

- Real-time notifications
- Multi-warehouse
- Multi-currency
- Mobile native app
- Public internet exposure beyond the Apps Script URL
- Complex audit UI beyond basic logs

---

## 7. Milestones (recommended order)

1. Foundation: Apps Script skeleton + Users sheet + Google login + permission check
2. Order CRUD with “own orders only” + multi-line support
3. List / filter / search + status management
4. Export (CSV/XLSX/PDF) + Revenue statistics + charts
5. Inventory + full Admin user/permission UI + polish
6. Hardening, backup helpers, final responsive polish

Each milestone must be independently testable on real devices.

---

## 8. Current Real Data Reference

The file `FILE THEO DOI DON HANG.xlsx` is the living example of how the business currently tracks orders. Any design or export feature should be able to produce a report that looks familiar to the users of that file (monthly grouping, multi-line POs, status notes, revenue totals).

---

## 9. How any AI agent should behave

- Treat this document + the companion plan file as authoritative.
- Do not re-open the Option B vs C debate.
- When implementing, always enforce server-side permission checks.
- Prefer simple, maintainable code (vanilla JS on frontend, clear Apps Script functions).
- Ask the human only when a real requirement is missing or ambiguous.
- After each milestone, produce a short test checklist so the human can verify.

---

**End of Project Instruction**
