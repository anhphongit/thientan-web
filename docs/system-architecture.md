# System Architecture

Detailed technical architecture covering data flow, component structure, security model, and deployment topology for the e-commerce order management system.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Employee Browsers                         │
│              (Sales, Warehouse, Admin Staff)                │
└─────────────────────────────────────────────────────────────┘
                              ↓↑
        ┌───────────────────────────────────────────┐
        │  apps/web — Deployed to Google Apps       │
        │  Script web frame (HTML/CSS/JS)           │
        │                                           │
        │  - ViewsOrders.html (order CRUD)         │
        │  - ViewsInventory.html (product CRUD)    │
        │  - ViewsAdmin.html (user + config)       │
        │  - ViewsStats.html (statistics)          │
        │                                           │
        │  Engine: Google Apps Script (client)      │
        └───────────────────────────────────────────┘
                              ↓↑
        ┌───────────────────────────────────────────┐
        │  apps/api — Google Apps Script backend    │
        │                                           │
        │  - Auth.gs (authentication + identity)   │
        │  - Router.gs (HTTP request router)       │
        │  - Orders.gs (order CRUD, filters)       │
        │  - Products.gs (inventory CRUD)          │
        │  - Admin.gs (user + permission matrix)   │
        │  - Permissions.gs (permission gates)     │
        │  - Security.gs (key expiry, audit log)   │
        │  - SheetsRepo.gs (generic Sheets I/O)    │
        │                                           │
        │  Engine: Google Apps Script (server)      │
        └───────────────────────────────────────────┘
                              ↓↑
        ┌───────────────────────────────────────────┐
        │  Google Sheets (Database)                 │
        │                                           │
        │  - Config (app settings, status lists)   │
        │  - Users (accounts + permissions JSON)   │
        │  - Orders (header + metadata)            │
        │  - OrderLines (multi-line items)         │
        │  - Invoices (invoice tracking)           │
        │  - Products (inventory master)           │
        │  - StatusHistory (audit trail)           │
        │  - SecurityLog (rate limiting, revocation)│
        │                                           │
        │  Engine: Google Sheets (data store)       │
        └───────────────────────────────────────────┘
```

---

## Authentication & Identity

### Two-Project Architecture

**Problem:** If `apps/api` and `apps/web` were one project, they'd execute as one Google account (the project owner). Employees would see the owner's identity, not their own.

**Solution:** Separate projects:
- `apps/api`: Deployed as "Execute as: Me" (owner account) — can access all data
- `apps/web`: Deployed as "Execute as: User accessing" (employee account) — can see own identity

### Authentication Flow

```
1. Employee visits web app URL
   ↓
2. Google login prompt (if not already signed in)
   ↓
3. `apps/web` captures employee's Google account
   ↓
4. `apps/web:Main.gs:getSession()` → `apps/api:Auth.gs:getSession()`
   ↓
5. `apps/api` verifies employee's email in Users sheet
   ↓
6. `apps/api` returns user record + permissions
   ↓
7. `apps/web` displays Vietnamese name, enforces permission checks
   ↓
8. All API calls to `apps/api:Router.gs` include identity token
   ↓
9. `apps/api` re-verifies identity + permission on every request
```

### Identity Token

**Purpose:** Prevent CSRF, verify caller's identity, audit log caller.

**Format:** Google Apps Script `ScriptApp.getIdentityToken()` — signed JWT containing:
- Calling app's project ID
- Caller's email (from OAuth scope)
- Timestamp
- Signature (verified by Google)

**Validation:** Every API request in `Router.gs` calls `Auth.gs:getCurrentUser()` which:
1. Extracts token from request header
2. Verifies signature with Google
3. Returns user record from Users sheet
4. Fails closed if token invalid or user not found

---

## Data Model

### Core Tables

#### Users
```
| Email          | DisplayName  | Active | Permissions JSON    | Notes  |
|----------------|-------------|--------|-------------------|--------|
| phong@...      | Phong N.    | TRUE   | {admin preset}     | Owner  |
| sales@...      | Bán Hàng    | TRUE   | {sales preset}     | —      |
| warehouse@...  | Kho         | TRUE   | {warehouse preset} | —      |
```

**Permissions JSON Schema:**
```json
{
  "presetKey": "admin" | "sales" | "warehouse" | null,
  "permissions": {
    "create_order": boolean,
    "edit_order": boolean,
    "change_status": boolean,
    "view_all_orders": boolean,
    "view_statistics": boolean,
    "manage_inventory": boolean,
    "manage_users": boolean,
    "manage_config": boolean,
    "export_statistics": boolean,
    "visible_fields": ["orderId", "po", "customer", ...] | ["*"]
  }
}
```

**Presets:**
- **admin:** All permissions, visible_fields = ["*"]
- **sales:** create_order, edit_order, change_status, view_all_orders (limited), visible_fields = [order fields only, no money]
- **warehouse:** manage_inventory, visible_fields = [inventory fields only]

#### Orders
```
| OrderId | Po    | Customer    | SupplierName | Status   | ApproveStatus | CreatedBy   | CreatedAt | ... |
|---------|-------|-------------|-------------|----------|---------------|------------|-----------|-----|
| DH-001  | PO-01 | ABC Corp    | Supplier A  | Active   | Draft         | sales@...  | 2026-09-01| ... |
```

**Workflow States:**
- **Status:** Active/Cancelled/Draft (business status)
- **ApproveStatus:** Draft → Wait For Approved → Approved/Rejected (approval state machine, behind feature flag)

#### OrderLines
```
| LineId | OrderId | Description     | ProductCode | UoM  | Qty | UnitPrice | VAT  | ... |
|--------|---------|-----------------|-------------|------|-----|-----------|------|-----|
| 1      | DH-001  | Widget A (Blue) | SP-001      | Cái  | 10  | 50,000    | 10%  | ... |
| 2      | DH-001  | Widget B (Red)  | SP-002      | Cái  | 5   | 75,000    | 10%  | ... |
```

**M5.5 ProductCode Autocomplete (Live Search):**
The `productCode` field in order lines now provides live autocomplete search against the Products catalog. As the user types, a dropdown list appears with matching product codes. Internally: `apps/web/ui/ViewsOrders.html` calls `.apiLookupProducts({ q: searchTerm })` which invokes `apps/api/Products.gs:actionLookupProducts_()` for server-side search. Replaces the old free-text input.

#### Products
```
| ProductCode | Name        | UoM | LastPrice | StockQty | MinStock | Active |
|-------------|------------|-----|-----------|----------|----------|--------|
| SP-001      | Widget A   | Cái | 50,000    | 100      | 20       | TRUE   |
| SP-002      | Widget B   | Cái | 75,000    | 50       | 15       | TRUE   |
```

#### Config
```
| Key                    | Value                                    | Editable from Admin UI |
|------------------------|------------------------------------------|------------------------|
| statusList             | ["Active", "Cancelled", "Draft"]        | ✅ Yes (M5.4)         |
| uomList                | ["Chiếc", "Túi", "Hộp"]                | ✅ Yes (M5.4)         |
| customerList           | ["ABC Corp", "XYZ Ltd", ...]           | ✅ Yes (M5.4)         |
| vatRates               | {"10%": 1.1, "5%": 1.05, ...}          | ✅ Yes (M5.4)         |
| currency               | "VND"                                    | ✅ Yes (M5.4)         |
| approvalFlowEnabled    | false (feature flag)                    | ❌ No (security)      |
| Security               | {key_expiry_days: 30, ...}             | ❌ No (security)      |
```

**M5.4 Config Editing:**
Admins can edit `statusList`, `uomList`, `customerList`, `vatRates`, `currency` directly from the Admin UI (`apps/api/AdminConfig.gs`). Each key is guarded by an `EDITABLE_CONFIG_KEYS` allowlist with type validation and custom validators. Breaking configuration like `approvalFlowEnabled` and security-related keys are **explicitly excluded** from the allowlist for protection.

---

## Permission System

### Three Layers

#### Layer 1: Navigate (UI)
Menu items appear/disappear based on user's permissions.

**Example:**
```javascript
if (user.permissions.manage_inventory) {
  showTab("Kho hàng");
}
```

#### Layer 2: Route (Server)
API endpoints check permission before any data access.

**Example:**
```javascript
requirePermission_('manage_inventory');
```

#### Layer 3: Blind (Data)
`visible_fields` restricts which columns a user can see/edit.

**Example:**
```javascript
if (!fieldVisible_('supplierName', user)) {
  preserveOnSave('supplierName', order);
}
```

### visible_fields

**Purpose:** Prevent accidental disclosure of sensitive columns (money, cost, supplier).

**Applied to:**
- Order headers: supplierName, supplierPaid, customerDeposit (money fields)
- Order lines: unitPrice, VAT, total (money fields)
- Products: lastPrice, cost (money fields)

**Behavior:**
- If role is blind to a field, it doesn't appear in form
- If form is submitted, hidden values are preserved (not cleared)
- API caller cannot override via direct call (clamped to safe defaults for new records)

**R3 Security Fix (2026-09-10):**
Previously, permission matrix save hardcoded `visible_fields = ['*']`, escalating any user to see all fields. Now carried from base preset; only overridden if user explicitly customizes.

---

## Permission Matrix Editor (M5.3b UI Redesign)

### Before (Checkbox Toggle)

```
┌─────────────────────────────────────────┐
│ Người dùng: sales@...                   │
├─────────────────────────────────────────┤
│ ☑ Dùng preset                           │
│ ◯ Nhân viên bán                         │
│                                         │
│ ☐ Tuỳ chỉnh (checkbox)                  │
│   [14 individual checkboxes appear]     │
├─────────────────────────────────────────┤
│ [Lưu] [Hủy]                            │
└─────────────────────────────────────────┘
```

**Problem:** Toggle hidden in form; users unsure which mode they're in.

### After (Collapsible Button)

```
┌─────────────────────────────────────────┐
│ Người dùng: sales@...                   │
├─────────────────────────────────────────┤
│ Nhóm quyền cơ sở:                      │
│ ◯ Nhân viên bán (preset selector)      │
│ ◯ Nhân viên kho                        │
│ ◯ Quản trị viên                        │
│                                         │
│ [▼ Nhóm quyền chi tiết] (collapsible)  │
│   ☑ create_order                       │
│   ☑ edit_order                         │
│   ☑ change_status                      │
│   [... 11 more checkboxes ...]         │
│                                         │
│ Label shows "[+ tuỳ chỉnh]" if diff    │
│ detected from selected preset           │
├─────────────────────────────────────────┤
│ [Lưu] [Hủy]                            │
└─────────────────────────────────────────┘
```

**Benefits:**
- Clear intent: preset first, then customize if needed
- Auto-expanding on edit (when permissions unknown)
- Auto-labeling ("+ tuỳ chỉnh" when changed from preset)
- Server diff-checks: decides `presetKey` vs full `permissions` based on exact match

---

## API Design

### Router Pattern

**File:** `apps/api/Router.gs`

```javascript
function doPost(e) {
  const auth = Auth.verify(e);
  const action = e.parameter.action;
  
  const handlers = {
    'createOrder': Orders.createOrder_,
    'updateOrder': Orders.updateOrder_,
    'deleteOrder': Orders.deleteOrder_,
    'listOrders': Orders.listOrders_,
    'getOrder': Orders.getOrder_,
    // ... more handlers
  };
  
  if (!handlers[action]) return error('Unknown action');
  
  return handlers[action](auth, e.parameter);
}
```

### Request/Response Format

**Request:**
```javascript
{
  action: "createOrder",
  orderId: "DH-001",
  data: JSON.stringify({...})
}
```

**Response (Success):**
```javascript
{
  success: true,
  data: {...}
}
```

**Response (Error):**
```javascript
{
  success: false,
  error: "MSG.PERMISSION_DENIED",
  message: "Bạn không có quyền tạo đơn hàng"
}
```

---

## Caching Strategy

### Client-Side Cache

**Order List:**
- TTL: 2 minutes
- Invalidation: On create/update/delete order; on status change; on permission change
- Stale-while-revalidate: Show cached list while refetching

**Order Detail:**
- TTL: 2 minutes
- Invalidation: On save; on quick status change; on permission change
- Manual refresh button: "Tải lại" (bypasses cache)

**Config (status list, UoM, customers):**
- TTL: 2 minutes
- Invalidation: On config edit
- Goal: Config changes appear instantly, not after 2 minutes

### Server-Side Cache

**Minimal:** Relying on Google Sheets API caching + conditional requests.

---

## Security Model

### Threats & Mitigations

#### T1: Identity Spoofing
**Threat:** Attacker claims to be another user.
**Mitigation:** Google Apps Script identity token (signed by Google, can't forge).

#### T2: Tampering (in flight)
**Threat:** Network eavesdropper modifies API request.
**Mitigation:** HTTPS only (Google Apps Script enforces).

#### T3: Privilege Escalation
**Threat:** User with limited permissions gains more.
**Mitigations:**
- Permission gates on every API action
- `visible_fields` prevents seeing restricted columns
- No caching of permission checks (rechecked on every request)
- Last-admin + self-admin protection in Users UI

**Known Issues:**
- R3 (2026-09-10): Hardcoded visible_fields in matrix save — FIXED
- Shared-secret model (Config sheet not encrypted) — ACCEPTED RISK
- (2026-09-14) WEB→API transport (`apps/web/ApiClient.gs:apiCall_`) occasionally
  saw a bare HTTP 3xx (redirect not resolved by `followRedirects:true`) and,
  confirmed later the same day, a bare HTTP 404 — both surfaced live as an
  intermittent connectivity error (`apiListProducts`, then
  `apiListPermissionPresets`). Root cause confirmed for the 404 case: a
  26.7s-slow attempt returning `Server: ESF` (Google's own edge) with a
  generic Google error page, not `apps/api`'s JSON — proof the request never
  reached script code; `apps/api`'s `doPost` can only ever answer 200 when
  its code actually runs. Fixed: both 3xx and 404 now retried under the same
  bounded 2-attempt cap as 5xx (other 4xx still unretried — no evidence they
  behave the same way), and every non-200/thrown attempt logs response
  headers + per-attempt elapsed-ms to Stackdriver. Root-cause mitigation
  (not just retry-around): a 5-minute keep-warm trigger
  (`apps/api/Security.gs:installKeepWarmTrigger`/`keepWarmPing`) — a
  community-established Apps Script Web App pattern, not an official Google
  guarantee (Google publishes no cold-start SLA for this runtime); see
  `plans/reports/researcher-260914-1345-appsscript-coldstart-mitigation.md`.
  Deployed and live-tested same day: no 3xx/404 recurred in that session —
  encouraging, not conclusive proof (no Google SLA exists for the underlying
  cause); see `plans/260912-1110-apiclient-transient-failure-hardening/`
  (closed).
  A separate, unrelated bug found during this investigation — `DevLog` sheet
  silently recording zero rows despite real errors, because `actionLogDev_`
  (`apps/api/Security.gs`) reported the DEV_MODE flag instead of the actual
  write outcome — is fixed, and (per direct instruction) the DEV_MODE gate
  on DevLog writes is now removed entirely on both projects: it always
  attempts to log, in production too (see `docs/TASKS.md`).

#### T4: Denial of Service
**Threat:** User spams API calls.
**Mitigation:** Rate limiting (throttled SecurityLog, 100 calls/min per user).

#### T5: Information Disclosure
**Threat:** User reads data they shouldn't (order money, supplier cost, etc.).
**Mitigations:**
- Permission checks gate access to API endpoints
- `visible_fields` hides columns in order form
- No enumeration: permission denied returns same error for "wrong permission" and "record doesn't exist"

#### T6: Audit Trail Tampering
**Threat:** User modifies StatusHistory or SecurityLog to hide actions.
**Mitigation:** Append-only sheets; no delete/edit API for these tables.

### Key Management

**Expires After:** 30 days (configured in Config sheet)

**Revocation:**
- Admin marks user `active = FALSE` → takes effect immediately (no cache)
- Next API call fails with "User deactivated"
- Phone-friendly: key on phone can be revoked without phone being present

**Fingerprint Check:** Optional; if enabled, session must be from same IP or device fingerprint.

---

## Performance Characteristics

### Order List Load Time

**Target:** <3 seconds with 1 year of data

**Achieved:** ✅ Confirmed on live deployment (Phong 2026-09-03)

**Optimizations:**
- Server-side pagination (fetch 20 items at a time)
- Server-side filtering (before pagination)
- Indexed Sheets queries where possible
- Client-side caching + skeleton UI (shows quick while loading)

### Order Create/Update Time

**Target:** <1 second

**Characteristics:** Depends on Sheets API latency (typically 500ms–1s)

---

## Deployment

### Project Structure

```
thientan-web/
├── apps/
│   ├── api/                          # Google Apps Script backend
│   │   ├── appsscript.json           # Manifest (settings, scopes, version)
│   │   ├── Auth.gs                   # Identity + session management
│   │   ├── Router.gs                 # HTTP request dispatcher
│   │   ├── Orders.gs                 # Order CRUD + filters
│   │   ├── Products.gs               # Inventory CRUD
│   │   ├── Admin.gs                  # User + permission management
│   │   ├── Permissions.gs            # Permission gates
│   │   ├── Security.gs               # Key expiry, audit log
│   │   ├── SheetsRepo.gs             # Generic Sheets operations
│   │   ├── Config.gs                 # Config sheet access
│   │   └── Main.gs                   # Setup + helper functions
│   │
│   └── web/                          # Google Apps Script web frame
│       ├── appsscript.json
│       ├── Index.html                # App shell + nav
│       ├── Styles.html               # CSS (Tailwind + custom)
│       ├── Main.gs                   # Router to api project
│       ├── ViewsOrders.html          # Order list + form
│       ├── ViewsInventory.html       # Product list + form
│       ├── ViewsAdmin.html           # User + permission matrix
│       ├── ViewsStats.html           # Statistics dashboard
│       ├── app/
│       │   ├── orders.js             # Order form logic
│       │   ├── inventory.js          # Product form logic
│       │   ├── admin.js              # Permission matrix logic
│       │   └── ui.js                 # Shared UI helpers
│       └── App.html                  # View router
│
├── docs/                             # Documentation
│   ├── MILESTONES.md                 # Roadmap + progress
│   ├── CHECKLIST_M*.md               # Verification checklists
│   ├── project-changelog.md          # Feature/fix log
│   ├── development-roadmap.md        # Timeline + phases
│   ├── system-architecture.md        # This file
│   ├── code-standards.md             # Code conventions
│   ├── SECURITY.md                   # Threat model
│   ├── PERMISSIONS.md                # Permission matrix
│   ├── SETUP.md                      # Setup guide
│   └── ...
│
└── tools/
    └── offline-tests/
        ├── orders-crud.test.js       # Order CRUD assertions
        ├── orders-filter.test.js     # Filter logic assertions
        ├── orders-changestatus.test.js  # Status change assertions
        └── ... (7+ test files, 400+ assertions)
```

### Deployment Steps

**Prerequisite:** Two Google Apps Script projects (api + web), two spreadsheets.

1. **Push API first:**
   ```
   cd apps/api && clasp push
   ```
   - Publishes new API version
   - Run `setupMilestone*()` from API editor if needed
   - Deploy as "Execute as: Me"

2. **Then push Web:**
   ```
   cd apps/web && clasp push
   ```
   - Publishes new web version
   - Deploy as "Execute as: User accessing"

3. **Order matters:** API must be live before web, since web calls API.

---

## Testing

### Offline Tests (Pre-Deploy)

**Coverage:** 400+ assertions across 7 test files

**Files:**
- `tools/offline-tests/orders-crud.test.js` — Order create/read/update/delete
- `tools/offline-tests/orders-filter.test.js` — List filters, search
- `tools/offline-tests/orders-changestatus.test.js` — Quick status change
- `tools/offline-tests/orders-approvestatus.test.js` — Approval state machine
- `tools/offline-tests/orders-approvestatus-ui.test.js` — UI approval logic
- `tools/offline-tests/orders-permissions.test.js` — Permission gates
- `tools/offline-tests/orders-money.test.js` — Money calculations, VAT

**Run All:**
```bash
node tools/offline-tests/orders-crud.test.js
node tools/offline-tests/orders-filter.test.js
node tools/offline-tests/orders-changestatus.test.js
```

### Live Tests (Post-Deploy)

**Checklist:** `docs/CHECKLIST_M*.md` (Vietnamese)

Example: M5 checklist sections A–J cover inventory, users, permission matrix, config editing, product linking.

**Procedure:**
1. Create test accounts (admin, sales, warehouse)
2. Walk through checklist on real devices (PC + phone)
3. Verify filters, search, permission gates, data persistence
4. Mark checklist items as done

---

## Glossary

| Term | Definition |
|------|-----------|
| **Apps Script** | Google's server-side scripting platform for Google Sheets / Docs / Drive |
| **visible_fields** | Whitelist of columns a role can see/edit (prevents disclosure of money fields) |
| **presetKey** | Named permission set (admin, sales, warehouse); shorthand for full permissions object |
| **Identity Token** | Signed JWT from Google proving caller's identity; used on every API call |
| **Offline Tests** | Node.js assertions that test backend logic without needing live Sheets (pre-deploy validation) |
| **TTL Cache** | Client-side cache with time-to-live; invalidated after N seconds or on action |
| **Stale-while-revalidate** | Cache strategy: show cached data immediately, refetch in background |
| **DH-XXXX** | Order ID format (Đơn Hàng / Invoice, auto-incremented, system-generated) |
| **PO** | Purchase Order number (free-text, customer-provided) |
| **M5.3b** | Milestone 5, Phase 3b: Permission disclosure UI redesign |
| **R3** | Research finding #3: Privilege escalation vulnerability (fixed 2026-09-10) |

---

## Related Documentation

- **[SECURITY.md](SECURITY.md)** — Threat model, key management, audit log
- **[PERMISSIONS.md](PERMISSIONS.md)** — Detailed permission matrix, visible_fields by role
- **[CODE_STANDARDS.md](code-standards.md)** — Code conventions, error handling, testing
- **[SETUP.md](SETUP.md)** — How to set up the project locally
- **[MILESTONES.md](MILESTONES.md)** — Roadmap + progress log
