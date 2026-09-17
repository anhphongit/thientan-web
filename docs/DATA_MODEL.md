# Data Model — Google Sheets

All data lives in **one private Google Spreadsheet**. Sharing is **Restricted**;
only the owner account can open it. The Spreadsheet ID is stored in Script
Properties (`SPREADSHEET_ID`) and never appears in code or in the frontend.

Row 1 of every sheet is the header row. Column order may change — code must resolve
columns **by header name** via `HEADERS` in `apps/api/Config.gs`, never by
hard-coded index.

Tabs: `Users`, `Orders`, `OrderLines`, `Invoices`, `Products`, `StatusHistory`,
`Config`, plus `Security` / `SecurityLog` (see `SECURITY.md`).

Schema decisions taken on 2026-08-20 (Q1, Q3, Q4, Q6) are recorded in
[`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md). Read them before changing a column here.

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
| `orderId` | string | **Primary key**, system-generated, immutable, `DH-2026-0001`. **Shown to users** as *Mã đơn* |
| `po` | string | The purchase-order number exactly as written. One free-text field — **not** split (Q3). May be blank, temporary, or shared by two orders |
| `poNote` | string | Remark *about the PO*: "PO tạm", "PO chưa đúng", "chờ PO thật"… |
| `customer` | string | Customer name — autocomplete from `Config.customerList` (Q6) |
| `orderDate` | date | |
| `customerDeposit` | number | VND the customer has paid up front (Q1). 0 or blank = none |
| `supplierName` | string | who the goods are bought from (Q1) |
| `supplierPaid` | number | VND already paid to that supplier (Q1) |
| `totalExVat` | number | **computed server-side** = Σ line `amountExVat` |
| `totalIncVat` | number | **computed server-side** = Σ line `amountIncVat` |
| `lineCount` | number | **computed server-side** = count of this order's `OrderLines` rows (M2.5). Maintained on every save so `actionListOrders_` need not read entire `OrderLines` sheet. |
| `createdBy` | string | email — drives the "own orders only" rule. **Note:** Historical orders imported by Milestone 7 (2026-09-17) carry the admin's email address as their `createdBy`, reflecting that they were loaded via an admin migration script rather than created interactively by an end user. This explains seeing ~206 orders with the same creator email spanning Jan–Aug 2026 (before the app itself went live). |
| `createdAt` | datetime | |
| `updatedBy` | string | email |
| `updatedAt` | datetime | |
| `approvedBy` | string | **DEPRECATED** (retained for column alignment only; nothing writes them since M3.8). Replaced by `approveStatus` state machine — who/when now lives in `StatusHistory` with `field='approveStatus'` |
| `approvedAt` | datetime | **DEPRECATED** (same reason as `approvedBy`). See `Config.gs:74-81` |
| `approveStatus` | string | one of `draft` / `wait_approval` / `approved` / `rejected` (M3.8 state machine, behind `approvalFlowEnabled`). Gates editing — see `PERMISSIONS.md` |
| `rejectReason` | string | reviewer's note when `approveStatus = rejected`. Left stale (not cleared) once the order moves on — only surfaced while `approveStatus` is currently `rejected` |
| `rejectedBy` | string | email of the rejecting reviewer, same staleness rule as `rejectReason` |
| `rejectedAt` | datetime | same staleness rule as `rejectReason` |

Notes:
- There is **no** `orderNo` and no `customerPo`. See Q3: the whole PO cell is one
  value, and `orderId` is the reference people quote.
- `orderId` is ASCII (`DH-`, not `ĐH-`) on purpose — it is typed into search boxes
  and phone keyboards. Display it verbatim.
- There is **no** `invoiceNo` / `invoiceDate` here. See Q4 and §4 below.
- **Business status moved to OrderLines** (Milestone 5a): `status` and `statusNote` columns are **no longer used** on Orders. The live sheet has `status_deprecated` and `statusNote_deprecated` (renamed by the migration, not deleted, so historical values remain readable). Every read must check OrderLines for per-line status instead. `approveStatus` is the only workflow status that remains on the order level (M3.8 approval flow).
- Totals are stored for fast list/statistics reads, but always recalculated from
  the lines on every write. Client-supplied totals are ignored.

### Migrations run live

| Function | Milestone | Purpose | Live run status |
|----------|-----------|---------|-----------------|
| `migrateAddLineCount()` | M2.5 | Add `lineCount` column to Orders sheet and backfill from `OrderLines` | ✅ Yes (required; DevSeed.gs calls it via `ensureLineCountColumn_`) |
| `migrateAddApproveStatus()` | M3.8 | Add `approveStatus` column to Orders and `field` column to StatusHistory; backfill from existing `approvedBy` and blank status history | ✅ Yes (CHECKLIST_M3_VI.md:14 requires run before M3 approval flow testing) |
| `migrateAddRejectReasonColumns()` | M5 (2026-09-03d) | Add `rejectReason`, `rejectedBy`, `rejectedAt` columns to Orders | ✅ Yes (live-verified per CHECKLIST_M5_VI.md, full M5 sign-off 2026-09-13) |
| `migrateFixDatetimeColumns()` | M5 (2026-09-03f) | Fix datetime format on `approvedAt`/`rejectedAt` columns (cosmetic; logic unaffected) | ✅ Yes (live-verified per CHECKLIST_M5_VI.md, full M5 sign-off 2026-09-13) |
| `migrateOrderLineStatus()` | M5a (2026-09-14) | Add `status`/`statusNote` columns to OrderLines, `lineId` column to StatusHistory, rename Orders' `status`/`statusNote` to `status_deprecated`/`statusNote_deprecated`; no backfill | ⏳ Not yet run (Phase 8 pending) |

---

## 3. `OrderLines` — line items

| Column | Type | Notes |
|--------|------|-------|
| `lineId` | string | **Primary key**, e.g. `DH-2026-0001-L03` |
| `orderId` | string | FK → `Orders.orderId` |
| `lineNo` | number | display order within the order, 1-based |
| `productCode` | string | e.g. `710004795`, `Q4695359` — optional link to `Products.code` |
| `description` | string | long, multi-line |
| `unitPrice` | number | VND, integer |
| `qty` | number | |
| `uom` | string | from `Config.uomList` (`Cái`, `Cuộn`, `Bịch`, `Bộ`, `m`, `Hộp`, `SET`, `Xấp`) |
| `vatRate` | number | **per line**: `0.08` or `0.10` — observed in the reference file |
| `amountExVat` | number | computed = `unitPrice × qty` |
| `amountIncVat` | number | computed = `amountExVat × (1 + vatRate)`, rounded to whole VND |
| `invoiceId` | string | FK → `Invoices.invoiceId`. **Blank until this line is invoiced** (Q4) |
| `note` | string | optional |
| `status` | string | **optional**; a `key` from `Config.statusList`. A line may be saved blank — no default (Milestone 5a) |
| `statusNote` | string | free text: delivery promises, remarks, anything without a field. **optional** |

Rules:
- One order has **at least one** line. Multi-line is the normal case, not an edge case.
- `amountExVat` / `amountIncVat` are always recomputed server-side.
- Rounding: round to the nearest whole đồng at the line level, then sum. Never sum
  raw floats and round at the end.
- `lineId` survives an edit: saving an order matches lines by `lineId`, updates
  those, appends new ones and deletes the ones that were removed. It never
  deletes-and-recreates the whole set, so an `invoiceId` on an untouched line is
  never lost.

---

## 4. `Invoices` — hoá đơn

One invoice can cover **several orders**, and one order can carry **zero or
several invoices** (Q4). So an invoice is its own record, and order *lines* point
at it.

| Column | Type | Notes |
|--------|------|-------|
| `invoiceId` | string | **Primary key**, `HD-2026-0098` — year + the invoice number |
| `invoiceNo` | string | as written by the business, e.g. `98`, `30-03` |
| `invoiceDate` | date | `Ngày HĐ` |
| `customer` | string | who it was billed to |
| `note` | string | optional |
| `createdBy` | string | email |
| `createdAt` | datetime | |

Rules:
- The `Invoices` row is created on demand: entering an invoice number + date on an
  order line creates the invoice if it does not exist, and reuses it if it does.
  That is what makes "one invoice, many orders" work with no extra screen.
- The year in `invoiceId` comes from `invoiceDate`, so invoice numbers that reset
  each year cannot collide.
- Changing an invoice date is one edit here, not an edit per line.

---

## 5. `Products` — inventory

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

Created in Milestone 5.

---

## 6. `StatusHistory` — audit trail

| Column | Type | Notes |
|--------|------|-------|
| `historyId` | string | |
| `orderId` | string | FK → `Orders.orderId` |
| `oldStatus` | string | |
| `newStatus` | string | |
| `note` | string | |
| `changedBy` | string (email) | |
| `changedAt` | datetime | |
| `field` | string | which workflow field changed: `status` (business line status, Milestone 5a+) or `approveStatus` (order approval, Milestone 3.8+) |
| `lineId` | string | **nullable** (Milestone 5a); set for line-level status changes, blank for order-level `approveStatus` changes and for all pre-migration rows |

Append-only. Never edited, never deleted. Written from Milestone 3 onwards; the
tab is created in Milestone 2 so the schema is fixed.

---

## 7. `Config` — runtime settings

Key/value sheet so the Admin can change business vocabulary without touching code.

| Column | Type |
|--------|------|
| `key` | string |
| `value` | string (JSON for lists) |
| `description` | string (Vietnamese) |

Expected keys:

| Key | Example value | Notes |
|-----|---|---|
| `statusList` | `[{"key":"draft","label":"Nháp"}, …]` | Referenced by `OrderLines` (Milestone 5a+). No longer on order-level. |
| `uomList` | `["Cái","Cuộn","Bịch","Bộ","m","Hộp","SET","Xấp"]` | |
| `vatRates` | `[0.08,0.10]` | |
| `customerList` | `["Nhựa Duy Tân","Duy Tân Long An",…]` | self-filling, see Q6 |
| `currency` | `VND` | |

`orderNoPrefix` is gone — there is no business order number to prefix (Q3).

---

## 8. ID generation

- `orderId`: `DH-{year}-{4-digit sequence}` — sequence from a counter in Script
  Properties (`ORDER_SEQ_YEAR`, `ORDER_SEQ_NEXT`), allocated inside a
  `LockService` lock to avoid duplicates when two users save at the same time.
  The counter resets when the year changes. On first use in a year it is seeded
  from the highest `orderId` already in the sheet, so a lost Script Property
  cannot reissue an existing ID.
- `lineId`: `{orderId}-L{2-digit lineNo}`.
- `invoiceId`: `HD-{year of invoiceDate}-{invoiceNo, padded to 4 if numeric}`.
- `productId`: `SP-{4-digit sequence}`.

Never use row number as an ID — rows shift when anything is deleted.

---

## 9. Concurrency

With 5–6 users and ≤ 100 orders/month, contention is low but not zero. Any write
that appends rows or allocates an ID must take a `LockService.getScriptLock()` with
a short timeout, and release it in a `finally`.
