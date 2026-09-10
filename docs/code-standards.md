# Code Standards

Coding conventions, error handling patterns, testing requirements, and architectural guidelines for the project.

---

## File Organization

### Backend (Apps/API) Structure

```
apps/api/
├── appsscript.json              # Manifest: version, scopes, deploy settings
├── Main.gs                       # Setup functions (setupMilestone1, etc.)
├── Auth.gs                       # Identity verification, getCurrentUser()
├── Router.gs                     # HTTP request dispatcher
├── Orders.gs                     # Order CRUD, filters, calculations
├── Products.gs                   # Product CRUD
├── Admin.gs                      # User + permission management
├── Permissions.gs                # Permission gates (requirePermission_, hasPermission_)
├── Security.gs                   # Key expiry, rate limiting, audit log
├── SheetsRepo.gs                 # Generic Sheets CRUD (read/append/update/delete)
└── Config.gs                     # Config sheet access
```

### Frontend (Apps/Web) Structure

```
apps/web/
├── appsscript.json
├── Index.html                    # App shell, nav, init
├── Styles.html                   # CSS (Tailwind + custom)
├── Main.gs                        # Router to api project
├── ViewsOrders.html              # Order list + detail form
├── ViewsInventory.html           # Product list + form
├── ViewsAdmin.html               # User + permission matrix
├── ViewsStats.html               # Statistics dashboard
├── App.html                      # View router, state machine
└── app/
    ├── orders.js                 # Order form logic, calculation
    ├── inventory.js              # Product form logic
    ├── admin.js                  # Permission matrix, user form
    └── ui.js                     # Shared UI helpers (confirm popup, etc.)
```

---

## Naming Conventions

### Files

- **Backend (Google Apps Script):** PascalCase + .gs
  - `Auth.gs`, `Orders.gs`, `Router.gs`
  - Reason: GAS convention; also groups files alphabetically by function

- **Frontend (HTML/CSS/JS):** Descriptive, kebab-case when multiple words
  - `Index.html`, `ViewsOrders.html`, `Styles.html`
  - `orders.js`, `admin.js`, `ui.js`

### Functions

- **Private functions:** Trailing underscore (`_`)
  ```javascript
  function getCurrentUser_() { }
  function filterByPermission_(orders, user) { }
  ```

- **Public functions:** No underscore
  ```javascript
  function doPost(e) { }
  function createOrder(orderId, data) { }
  ```

- **Constants:** UPPER_CASE
  ```javascript
  const CACHE_DURATION_MS = 2 * 60 * 1000;
  const RATE_LIMIT_PER_MIN = 100;
  ```

- **Message keys:** MSG.CONSTANT_NAME
  ```javascript
  MSG.PERMISSION_DENIED
  MSG.USER_NOT_FOUND
  MSG.ORDER_ALREADY_APPROVED
  ```

### Variables

- **User/permission objects:** `user`, `auth`
- **Order objects:** `order`, `orders`
- **Sheets data:** `rows`, `row`, `data`
- **Boolean flags:** Start with `is` or `has`
  ```javascript
  let isApproved = order.approveStatus === 'Approved';
  let hasPermission = user.permissions.manage_users;
  ```

---

## Error Handling

### Pattern: Try-Catch + Fail Closed

**Backend (Apps Script):**
```javascript
function actionCreateOrder_(auth, params) {
  try {
    // 1. Verify caller
    const user = Auth.verify(auth);
    
    // 2. Check permission (fail if missing)
    Permissions.requirePermission_(user, 'create_order');
    
    // 3. Validate input
    if (!params.po) throw new Error('MSG.INVALID_PO');
    
    // 4. Execute action
    const orderId = Orders.create_(user, params);
    
    // 5. Return success
    return { success: true, data: { orderId } };
  } catch (err) {
    // 6. Return error (never throw outside try-catch)
    return error(err);
  }
}

function error(err) {
  const message = typeof err === 'string' ? err : err.message;
  return {
    success: false,
    error: message, // "MSG.PERMISSION_DENIED" or similar
    message: MSG[message] || "Lỗi không xác định" // Vietnamese message
  };
}
```

### Pattern: Permission Gates (Fail Closed)

**Every API action starts with permission check:**
```javascript
function actionListOrders_(auth, params) {
  const user = Auth.verify(auth);
  Permissions.requirePermission_(user, 'view_all_orders'); // Throws if missing
  // Only continue if permission granted
}
```

**requirePermission_ pattern:**
```javascript
function requirePermission_(user, permission) {
  if (!hasPermission_(user, permission)) {
    throw new Error('MSG.PERMISSION_DENIED');
  }
}

function hasPermission_(user, permission) {
  if (!user) return false;
  if (!user.permissions) return false;
  return user.permissions[permission] === true;
}
```

### Pattern: Field Visibility Gates

**Before returning/saving data, clamp hidden fields:**
```javascript
function fieldVisible_(fieldName, user) {
  // Returns true if user can see fieldName
  if (!user.permissions.visible_fields) return false;
  const vf = user.permissions.visible_fields;
  return vf.includes('*') || vf.includes(fieldName);
}

function clampHiddenOrderFields_(order, user) {
  // Force hidden fields to safe defaults
  if (!fieldVisible_('supplierName', user)) {
    order.supplierName = '';
  }
  if (!fieldVisible_('supplierPaid', user)) {
    order.supplierPaid = 0;
  }
  // ... repeat for all money fields
  return order;
}
```

### Pattern: Null/Undefined Checks

**Always check before accessing:**
```javascript
// ❌ BAD: Crash if user is null
function getOrdersByUser(email) {
  const user = Users.find(email); // Can be null
  return Orders.filter(o => o.createdBy === user.email); // Crash!
}

// ✅ GOOD: Fail closed
function getOrdersByUser(email) {
  const user = Users.find(email);
  if (!user) throw new Error('MSG.USER_NOT_FOUND');
  return Orders.filter(o => o.createdBy === user.email);
}
```

---

## Testing & Validation

### Offline Tests (Node.js)

**File:** `tools/offline-tests/orders-*.test.js`

**Pattern:**
```javascript
// orders-crud.test.js
const assert = require('assert');
const Orders = require('./orders'); // Code under test

describe('Orders.createOrder_', () => {
  it('should create an order with correct ID format', () => {
    const order = Orders.createOrder_({
      po: 'PO-123',
      customer: 'ABC Corp',
      lines: [...]
    });
    
    assert.match(order.orderId, /^DH-\d{4}$/);
    assert.strictEqual(order.po, 'PO-123');
  });

  it('should reject if PO is missing', () => {
    assert.throws(
      () => Orders.createOrder_({ customer: 'ABC Corp' }),
      /INVALID_PO/
    );
  });

  it('should calculate VAT correctly', () => {
    const line = Orders.calculateLine_({ qty: 10, unitPrice: 50000, vat: '10%' });
    assert.strictEqual(line.total, 550000); // 10 * 50000 * 1.1
  });
});
```

**Run All Tests:**
```bash
node tools/offline-tests/orders-crud.test.js
node tools/offline-tests/orders-filter.test.js
node tools/offline-tests/orders-changestatus.test.js
node tools/offline-tests/orders-approvestatus.test.js
node tools/offline-tests/orders-permissions.test.js
# ... etc (7+ files)
```

**Assertion Count:** Track in commit messages
```
✅ 404+ assertions passing (M3 complete)
✅ 89+ new assertions for M5.3 permission matrix
```

### Live Tests (Manual Checklists)

**File:** `docs/CHECKLIST_M*.md` (Vietnamese)

**Example:**
```markdown
## A. Người dùng — CRUD (5.2)

- [ ] ✅ Chuyển đến tab "Người dùng"
- [ ] ✅ Nhấn nút "Thêm người dùng" → mở form
- [ ] ✅ Nhập email người dùng → chấp nhận
- [ ] ✅ Nhấn "Lưu" → người dùng được tạo
- [ ] ✅ Reload trang → người dùng vẫn có
```

**Procedure:**
1. Create test accounts (admin, sales, warehouse)
2. Walk through checklist on real devices (PC + phone)
3. Mark each box as done
4. If any fail, log in `TASKS.md`, fix code, re-run offline tests, re-test live

---

## Code Quality Guidelines

### Comments

**When to comment:**
- Complex business logic
- Non-obvious algorithm choices
- Workarounds or known limitations
- Important assumptions

**When NOT to comment:**
- Self-documenting code (clear function names)
- Obvious loops or conditionals
- Simple variable assignments

**Example:**
```javascript
// ✅ Good: explains WHY
function filterOrdersByVisible_(orders, user) {
  // Remove orders where any visible field is inaccessible
  // This prevents a user from seeing summaries of data they can't view
  return orders.filter(order => {
    return ORDER_SUMMARY_FIELDS.every(field => fieldVisible_(field, user));
  });
}

// ❌ Bad: obvious what it does, not why
function filterOrders(orders, user) {
  // Filter orders by user
  const result = [];
  for (const order of orders) {
    result.push(order);
  }
  return result;
}
```

### Function Length

**Target:** Under 50 lines per function (easier to test, reason about)

**Pattern:** Break into smaller, testable functions
```javascript
// ❌ Too long: mixes parsing, validation, calculation, persistence
function actionUpdateOrder_(user, params) {
  // 200 lines of mixed logic
}

// ✅ Better: separate concerns
function actionUpdateOrder_(user, params) {
  const user = Auth.verify(user);
  Permissions.requirePermission_(user, 'edit_order');
  
  const order = parseOrder_(params);
  validateOrder_(order);
  
  const recalc = recalculateOrder_(order);
  clampHiddenFields_(recalc, user);
  
  return SheetsRepo.update_('Orders', order);
}
```

### Minimal Dependencies

- No external libraries (except offline tests use Node assert)
- Use Google Apps Script built-ins (SpreadsheetApp, CacheService)
- Vanilla JS + DOM APIs on frontend (no jQuery, React, Vue)

### Error Messages (Vietnamese)

**All user-facing errors in Vietnamese.**

**Pattern:**
```javascript
const MSG = {
  PERMISSION_DENIED: 'Bạn không có quyền thực hiện hành động này',
  USER_NOT_FOUND: 'Không tìm thấy người dùng',
  ORDER_ALREADY_APPROVED: 'Đơn hàng đã được duyệt, không thể sửa',
  INVALID_PO: 'Số PO không được để trống',
  USER_SELF_REMOVE_ADMIN: 'Bạn không thể tự cấp/hủy quyền quản lý của bản thân',
  USER_LAST_ADMIN: 'Không thể vô hiệu hóa quản trị viên cuối cùng'
};

function error(msgKey) {
  return {
    success: false,
    error: msgKey,
    message: MSG[msgKey] || 'Lỗi không xác định'
  };
}
```

---

## Performance Patterns

### Caching

**Client-side TTL cache (2 minutes):**
```javascript
const Cache = {
  orders: { data: null, expiry: 0 },
  
  getOrders() {
    const now = Date.now();
    if (this.orders.data && this.orders.expiry > now) {
      return this.orders.data; // Hit
    }
    
    // Miss: fetch + cache
    const orders = api.listOrders();
    this.orders.data = orders;
    this.orders.expiry = now + 2 * 60 * 1000;
    return orders;
  },
  
  invalidate(key) {
    this[key].expiry = 0; // Force refetch on next access
  }
};
```

**Server-side: Minimal caching**
- Rely on Google Sheets API built-in caching
- No in-memory cache (Apps Script restarts unpredictably)
- Recalculate on every request (safe, simple)

### Pagination

**Server-side (list 20 items at a time):**
```javascript
function actionListOrders_(user, params) {
  const page = parseInt(params.page) || 1;
  const pageSize = 20;
  const offset = (page - 1) * pageSize;
  
  const allOrders = listAllOrders_(user);
  const paginated = allOrders.slice(offset, offset + pageSize);
  
  return {
    success: true,
    data: paginated,
    totalCount: allOrders.length,
    page: page,
    pageSize: pageSize
  };
}
```

---

## Security Practices

### No Secrets in Code

- ❌ Hardcoded API keys, spreadsheet IDs
- ✅ Store in `Config` sheet or Script Properties
- ✅ Fetch at runtime

### No Data Logging

- ❌ Log order money fields, user emails
- ✅ Log action (who, what, when) without sensitive data
- ✅ Rate-limit audit log (100 entries/min per user)

### Permission Re-check on Every Request

- ❌ Cache permission results
- ✅ Verify permission on every API call
- ✅ Catch permission changes immediately (test: J checklist)

### Clamp User Input

- ❌ Trust client payload
- ✅ Validate on server (type, length, format)
- ✅ Clamp hidden fields to safe defaults

---

## Architectural Patterns

### Order Lock (Prevent Concurrent Edits)

**Pattern: Use Sheets' built-in locking**

```javascript
function withOrderLock_(orderId, callback) {
  const lock = LockService.getUserLock();
  lock.waitLock(5000); // 5-second timeout
  
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function actionUpdateOrder_(user, params) {
  return withOrderLock_(params.orderId, () => {
    // Inside lock: safe to read + write without race conditions
    const order = Orders.get_(params.orderId);
    order.po = params.po;
    Orders.update_(order);
  });
}
```

### Permission Preset Matching

**Pattern: Check if saved state matches a preset exactly**

```javascript
function isPresetMatch_(user, presetKey) {
  const preset = PRESETS[presetKey];
  if (!preset) return false;
  
  // Compare every permission field
  for (const key in preset.permissions) {
    if (user.permissions[key] !== preset.permissions[key]) {
      return false;
    }
  }
  return true;
}

function saveUserPermissions_(user, submitted) {
  // Decide: use presetKey or full permissions?
  let savedPerms = { permissions: submitted.permissions };
  
  for (const [presetKey, preset] of Object.entries(PRESETS)) {
    if (isPresetMatch_(submitted, presetKey)) {
      savedPerms = { presetKey: presetKey }; // Shorthand
      break;
    }
  }
  
  return SheetsRepo.update_('Users', user.email, savedPerms);
}
```

### Stale-While-Revalidate

**Pattern: Show cached data immediately, refetch in background**

```javascript
async function openOrderDetail(orderId) {
  // Show cached version immediately
  const cached = Cache.getOrder(orderId);
  if (cached) {
    renderOrder(cached);
  }
  
  // Refetch in background
  try {
    const fresh = await api.getOrder(orderId);
    Cache.setOrder(fresh);
    renderOrder(fresh); // Re-render with fresh data
  } catch (err) {
    // If refetch fails, cached version remains on screen
    console.log('Refetch failed, keeping cached version');
  }
}
```

---

## Deployment Checklist

Before pushing to production:

- [ ] All offline tests pass (400+ assertions)
- [ ] No hardcoded secrets in code
- [ ] Permission gates on every API endpoint
- [ ] Error messages in Vietnamese (user-facing)
- [ ] Cache invalidation tested (config changes appear instantly)
- [ ] Live checklist completed (all sections A–J checked)
- [ ] Code reviewed by another developer
- [ ] Commit message follows conventional format
- [ ] No confidential data in git history (.env, credentials, etc.)

---

## Glossary

| Term | Meaning |
|------|---------|
| **Apps Script** | Google's server-side scripting platform |
| **Offline test** | Node.js assertion that runs without live Sheets |
| **Live test** | Manual checklist on real Google account + devices |
| **Permission gate** | requirePermission_() check at start of API action |
| **visible_fields** | Whitelist of columns a role can see/edit |
| **Cache TTL** | Time-to-live; cache expires after N milliseconds |
| **Fail closed** | Deny by default; only grant if explicitly allowed |
| **Try-catch** | Error handling pattern; catch exceptions and return errors |
| **Lock** | Mutual exclusion to prevent concurrent edits |
| **Preset match** | Check if saved permissions exactly match a preset |

---

## Related Documentation

- **[SECURITY.md](SECURITY.md)** — Threat model, key management
- **[PERMISSIONS.md](PERMISSIONS.md)** — Permission matrix definition
- **[system-architecture.md](system-architecture.md)** — System design
- **[SETUP.md](SETUP.md)** — Local development setup
