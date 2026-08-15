# Detailed Plans – Option B and Option C

**Companion document to `PROJECT_INSTRUCTION.md`**  
**Purpose:** Give any AI agent a complete, ready-to-execute picture of both architectures so work can start without further clarification.

---

## Common Requirements (apply to both options)

- UI language: Vietnamese
- Responsive (PC + mobile browsers)
- Users: 1 Admin + 5–6 employees
- Volume: ≤ 100 orders/month
- Features: login, order CRUD (multi-line), filter/search, status management, inventory, revenue stats (week/month/quarter/year) + charts, export CSV/XLSX/PDF, Admin user + permission matrix management
- Data shape inspired by `FILE THEO DOI DON HANG.xlsx` (PO, customer, line items, unit price, qty, UoM, amounts, invoice no/date, status)
- Fine-grained permissions + “own orders only” by default
- Admin can manage users and the permission matrix

---

# OPTION C – Google Apps Script + Private Sheets (CHOSEN)

## Architecture Summary

```
Browser (any device)
    ↓ Google login
Apps Script Web App  (Execute as: Me)
    ↓ permission check (email → Users sheet)
Private Google Sheets  (Restricted)
```

- No local server process.
- No local JSON.
- Authentication handled by Google.
- Authorization (permission matrix) implemented entirely in Apps Script.

## Deployment Settings (mandatory)

- Execute as: **Me**
- Who has access: **Anyone with a Google account**
- Sheets sharing: **Restricted** only (never “Anyone with the link”)

## Data Layout (Private Sheets)

| Sheet          | Key columns / purpose |
|----------------|-----------------------|
| Users          | email, displayName, active, role, permissions (JSON or columns) |
| Orders         | orderId, po, customer, createdBy, createdAt, status, invoiceNo, invoiceDate, notes… |
| OrderLines     | lineId, orderId, productCode, description, unitPrice, qty, uom, amountExVAT, amountIncVAT… |
| Products       | productId, code, name, unit, stockQty, minStock… |
| StatusHistory  | (optional) orderId, oldStatus, newStatus, changedBy, changedAt, note |
| Config         | statusList, system settings |

## Permission Matrix (example fields)

Stored per user (or per role + overrides):

- view_orders
- view_all_orders          (if false → only own orders)
- create_order
- edit_order
- delete_order
- change_status
- approve_order
- search_filter
- export
- view_statistics
- export_statistics
- manage_inventory
- manage_users
- visible_fields           (list or bitmask of columns the user may see)

Every Apps Script function that returns or mutates data **must** start with a permission check.

## Core Apps Script Responsibilities

1. `doGet(e)` / `doPost(e)` – route to the correct handler
2. `getCurrentUser()` – returns email + loaded permissions
3. `checkPermission(permissionName)` – throws or returns false
4. CRUD for Orders + OrderLines (with “own only” filter)
5. Status change + optional history
6. Inventory CRUD
7. Statistics aggregation (by week/month/quarter/year)
8. Export helpers (return data for client-side CSV/XLSX/PDF generation, or generate files via Drive)
9. Admin: list/add/edit/deactivate users + edit permission matrix

## Frontend

- Single HTML page or simple multi-page served by Apps Script HTML Service (or static host that only calls the `/exec` endpoints).
- Vanilla JS + Chart.js (or similar).
- All strings in Vietnamese.
- Responsive CSS (mobile-first or good breakpoints).
- Never hard-code Sheet IDs.

## Milestone Breakdown (Option C)

| # | Milestone | Exit criteria |
|---|-----------|---------------|
| 1 | Foundation | Web app deployed, Google login works, Users sheet + basic permission check, Admin can see current user info |
| 2 | Order CRUD | Create / edit multi-line order, “own orders only” enforced, data appears correctly in Sheets |
| 3 | List + Filter + Status | Paginated/filterable list, search, change status, Admin approve/delete |
| 4 | Export + Stats | Export filtered list to CSV/XLSX/PDF, revenue charts by period |
| 5 | Inventory + Admin UI | Full product/stock management, complete user + permission matrix UI |
| 6 | Polish | Responsive finish, Vietnamese completeness, backup helper, final hardening |

## Backup Strategy (Option C)

- Google Drive version history is the primary safety net.
- Optional: Apps Script function that exports each sheet as CSV/JSON to a Drive folder named with timestamp.
- Manual “Backup” button in Admin UI is recommended.

## Pros / Cons (honest)

**Pros**
- No process to keep alive on admin PC
- Google handles login securely
- Simple operational model
- Works from any internet-connected device

**Cons**
- Internet required
- Custom permission logic must be written carefully
- Apps Script quotas & 6-minute limit (not a problem at this scale)
- Moves away from pure “local IP” hosting

---

# OPTION B – Thin Local Server on Admin Windows PC (Alternative)

## Architecture Summary

```
LAN devices / future VPN
    ↓
Node.js (or Python) server running on Admin Windows PC
    ├── serves static frontend
    ├── owns local security store (JSON or SQLite)
    ├── performs login + session + all permission checks
    └── calls Google Apps Script or Sheets API for business data
```

- Security data (users, hashes, permission matrix, sessions) lives **only** on the local machine.
- Business data still lives in Google Sheets (source of truth).
- Frontend never sees security data or raw Sheet IDs.

## Recommended Tech Stack

- Runtime: Node.js (Express or Hono) – easiest for most agents
- Alternative: Python (FastAPI / Flask)
- Local store: SQLite (preferred) or JSON files
- Password hashing: bcrypt or argon2
- Session: signed cookies or short-lived JWT
- Frontend: same as Option C (vanilla JS, responsive, Vietnamese)

## Data Split

| Location          | Content |
|-------------------|---------|
| Local SQLite/JSON | users, password hashes, roles, permission matrix, active sessions |
| Private Google Sheets | Orders, OrderLines, Products, StatusHistory, Config (same schema as Option C) |

## Security Flow

1. User opens `http://ADMIN-IP:PORT`
2. Login form → server verifies hash → issues session
3. Every API call carries session token
4. Server loads permissions and enforces them **before** any Sheets call
5. Server talks to Apps Script web app (or Sheets API with service account) using owner credentials

## Milestone Breakdown (Option B)

| # | Milestone | Exit criteria |
|---|-----------|---------------|
| 1 | Local foundation | Server runs on Windows, serves frontend, local user store + login + session works from another LAN device |
| 2 | Sheets integration | Server can read/write Orders via Apps Script or API, permission checks in place |
| 3 | Full order workflow | Multi-line CRUD, list/filter/search, status, own-orders rule |
| 4 | Export + Stats | Same as Option C |
| 5 | Inventory + Admin UI + Backup | Local backup of SQLite/JSON + Sheets export to dated folder on the PC |
| 6 | Polish & Windows service | Optional: run as Windows service, firewall notes, VPN readiness |

## Backup Strategy (Option B)

- Manual + scheduled job on the PC:
  - Copy local SQLite/JSON to `backup/YYYY-MM-DD_HH-mm/`
  - Trigger Apps Script export of all sheets into the same folder (or Drive sync)
- Restore = put files back + restart server

## Pros / Cons (honest)

**Pros**
- True local hosting on admin PC IP
- Security data never leaves the machine
- Works on pure LAN (internet only needed for Sheets calls)
- Full control over session & permission logic

**Cons**
- Must keep a process running on the Windows PC
- Slightly more moving parts (Node/Python install, firewall, possible Windows service)
- Admin PC must be on for the system to be available

---

## Decision Guidance for Future Agents

- **Default / current choice:** Option C (see `PROJECT_INSTRUCTION.md`)
- Switch to Option B only if the human explicitly requests local hosting, offline capability, or stronger isolation of security data.
- Both options share the same business data model and permission concepts, so migration of Sheets content is straightforward if a switch is needed later.

---

## Shared Implementation Notes (both options)

1. Multi-line orders are mandatory (header + lines).
2. Status values should be controlled but allow a free-text note.
3. Export must be able to produce a report that looks familiar to users of the existing Excel file.
4. All user-facing text in Vietnamese.
5. Permission checks are never optional and never client-side only.
6. Prefer simple, readable code over clever abstractions (YAGNI / KISS).

---

**End of Detailed Plans**
