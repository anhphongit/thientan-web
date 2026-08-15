# Data Model — Google Sheets

All data lives in **one private Google Spreadsheet** with six tabs. Sharing is
**Restricted**; only the owner account can open it. The Spreadsheet ID is stored in
Script Properties (`SPREADSHEET_ID`) and never appears in code or in the frontend.

Row 1 of every sheet is the header row. Column order may change — code must resolve
columns **by header name** via the column map in `Config.gs`, never by hard-coded index.

---

## 1. `Users`

| Column | Type | Notes |
|--------|------|-------|
| `email` | string | Google account email. **Primary key**, lowercase, unique |
| `displayName` | string | Vietnamese full name shown in the UI |
| `role` | enum | `admin` \| `staff` — a convenience label; permissions are what actually count |
| `active` | boolean | `FALSE` → login rejected |
| `permissions` | JSON string | see `PERMISSIONS.md` |
| `createdAt` | datetime | |
| `createdBy` | string | email |
| `note` | string | optional |

Rules:
- At least one active user with `manage_users` must always exist.
- Users are never deleted, only deactivated (history stays intact).

---

## 2. `Orders` — order header

| Column | Type | Notes |
|--------|------|-------|
| `orderId` | string | **Primary key**, system-generated, immutable, e.g. `ORD-2026-0001` |
| `orderNo` | string | Business order number, e.g. `26001` (`YY` + sequence, resets each year) |
| `customerPo` | string | The customer's own PO number, e.g. `4600041936` |
| `customer` | string | Customer name — pick from the customer list, autocomplete |
| `orderDate` | date | |
| `status` | string | from the `statusList` in `Config` |
| `statusNote` | string | free text (deposits, delivery promises, remarks) |
| `invoiceNo` | string | `HÓA ĐƠN Ra` |
| `invoiceDate` | date | `Ngày HĐ` |
| `totalExVat` | number | **computed server-side** = Σ line `amountExVat` |
| `totalIncVat` | number | **computed server-side** = Σ line `amountIncVat` |
| `createdBy` | string | email — drives the "own orders only" rule |
| `createdAt` | datetime | |
| `updatedBy` | string | email |
| `updatedAt` | datetime | |
| `approvedBy` | string | email, empty until approved |
| `approvedAt` | datetime | |

Notes:
- `orderId` is internal and never shown; `orderNo` is what users talk about.
- Totals are stored for fast list/statistics reads, but always recalculated from the
  lines on every write. Client-supplied totals are ignored.

---

## 3. `OrderLines` — line items

| Column | Type | Notes |
|--------|------|-------|
| `lineId` | string | **Primary key**, e.g. `ORD-2026-0001-L03` |
| `orderId` | string | FK → `Orders.orderId` |
| `lineNo` | number | display order within the order, 1-based |
| `productCode` | string | e.g. `710004795`, `Q4695359` — optional link to `Products.code` |
| `description` | string | long, multi-line |
| `unitPrice` | number | VND, integer |
| `qty` | number | |
| `uom` | string | from the `uomList` in `Config` (`Cái`, `Cuộn`, `Bịch`, `Bộ`, `m`, `Hộp`, `SET`, `Xấp`) |
| `vatRate` | number | **per line**: `0.08` or `0.10` — observed in the reference file |
| `amountExVat` | number | computed = `unitPrice × qty` |
| `amountIncVat` | number | computed = `amountExVat × (1 + vatRate)`, rounded to whole VND |
| `note` | string | optional |

Rules:
- One order has **at least one** line. Multi-line is the normal case, not an edge case.
- `amountExVat` / `amountIncVat` are always recomputed server-side.
- Rounding: round to the nearest whole đồng at the line level, then sum. Never sum
  raw floats and round at the end.

---

## 4. `Products` — inventory

| Column | Type | Notes |
|--------|------|-------|
| `productId` | string | **Primary key**, e.g. `SP-0001` |
| `code` | string | business code, unique, matches `OrderLines.productCode` |
| `name` | string | |
| `uom` | string | |
| `stockQty` | number | |
| `minStock` | number | low-stock threshold |
| `lastPrice` | number | last known purchase/sale price, informational |
| `active` | boolean | |
| `note` | string | |

---

## 5. `StatusHistory` — audit trail

| Column | Type |
|--------|------|
| `historyId` | string |
| `orderId` | string |
| `oldStatus` | string |
| `newStatus` | string |
| `note` | string |
| `changedBy` | string (email) |
| `changedAt` | datetime |

Append-only. Never edited, never deleted.

---

## 6. `Config` — runtime settings

Key/value sheet so the Admin can change business vocabulary without touching code.

| Column | Type |
|--------|------|
| `key` | string |
| `value` | string (JSON for lists) |
| `description` | string (Vietnamese) |

Expected keys:

| Key | Example value |
|-----|---------------|
| `statusList` | `["nháp","đã xác nhận","chờ hàng về","hàng về","đã giao chưa xuất","đã xuất chưa TT","đã thanh toán","đã huỷ"]` |
| `uomList` | `["Cái","Cuộn","Bịch","Bộ","m","Hộp","SET","Xấp"]` |
| `vatRates` | `[0.08,0.10]` |
| `customerList` | `["Nhựa Duy Tân","Duy Tân Long An",...]` |
| `orderNoPrefix` | `26` |
| `currency` | `VND` |

---

## 7. ID generation

- `orderId`: `ORD-{year}-{4-digit sequence}` — sequence from a counter in Script
  Properties, allocated inside a `LockService` lock to avoid duplicates when two
  users save at the same time.
- `lineId`: `{orderId}-L{2-digit lineNo}`.
- `productId`: `SP-{4-digit sequence}`.

Never use row number as an ID — rows shift when anything is deleted.

---

## 8. Concurrency

With 5–6 users and ≤ 100 orders/month, contention is low but not zero. Any write
that appends rows or allocates an ID must take a `LockService.getScriptLock()` with
a short timeout, and release it in a `finally`.
