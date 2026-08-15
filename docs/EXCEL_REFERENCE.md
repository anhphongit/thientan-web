# Excel Reference — `FILE THEO DOI DON HANG.xlsx`

**Reference only.** This file is *not* imported and *not* migrated. It exists so the
data model matches how the business actually works, and so exports feel familiar.
Live data will be entered by the Admin and users through the app.

Observed on 2026-08-15.

---

## 1. Physical structure

- One sheet: **`THONGKE_2026`** (one workbook per year — the year is in the sheet name).
- Used range: `A1:L1278`. Columns M–AH are empty.
- Row 2 = header. Row 3 = the year (`2026`).
- The sheet is then divided into **month blocks**:

```
THÁNG 1                 ← month header row
  ...order rows...
DOANH SỐ THÁNG 1        ← revenue total row for the month
THÁNG 2
  ...
```

Month blocks found: THÁNG 1 through THÁNG 8 (data through August 2026).

---

## 2. Columns

| Col | Header | Meaning | Notes |
|-----|--------|---------|-------|
| A | STT | Sequence no. | Only on the **first line** of an order. Resets each month. |
| B | PO | PO number(s) | Multi-line cell — see §3 |
| C | KHÁCH HÀNG | Customer | Repeated on every line of the order |
| D | CHI TIẾT | Item detail | `productCode :\n description`, often several lines |
| E | ĐƠN GIÁ BÁN RA VND | Unit sale price | VND, integer |
| F | SL | Quantity | |
| G | ĐVT | Unit of measure | Casing is inconsistent — see §5 |
| H | Thành tiền VND — Chưa VAT | Line amount before VAT | = E × F |
| I | Trị giá hđ | Invoiced value | = H × (1 + VAT) — **rate varies**, see §4 |
| J | HÓA ĐƠN Ra | Invoice number | Plain integer, e.g. `98` |
| K | Ngày HĐ | Invoice date | Real date value |
| L | TRẠNG THÁI | Status | Mixed controlled + free text — see §6 |

---

## 3. How multi-line orders are represented

An order occupies one **group of consecutive rows**:

- The **first row** carries `STT`, `PO`, and usually `HÓA ĐƠN` + `Ngày HĐ`.
- **Following rows** leave A, B blank and repeat only the customer + line data.

This confirms the header/lines split in `DATA_MODEL.md`: one `Orders` row, N
`OrderLines` rows.

The `PO` cell frequently contains **two or three values stacked with newlines**:

```
26001
38333
( chTh)
```

- `26001` = the business's own internal order number (`YY` + sequence, resets yearly)
- `38333` / `4600041936` = the **customer's** PO number
- `( chTh)` = a free-text note

→ The data model splits these into `orderNo`, `customerPo`, and `note`.

**Counts:** ~206 order headers, ~534 order lines across 8 months.

---

## 4. VAT is per line, not global

`I / H` is **not** a single constant:

| Ratio | Lines |
|-------|-------|
| 1.08 (8% VAT) | 438 |
| 1.10 (10% VAT) | 94 |

→ `OrderLines` must store an explicit **`vatRate`** per line. Do not hard-code 8%.

---

## 5. Reference values found in the file

**Customers (19 distinct):** Nhựa Duy Tân, Duy Tân Long An, Duy Tân Bình Dương,
Yamato, PCVN, THP, NUMBER ONE CHU LAI, NUMBER ONE HÀ NAM, NUMBER ONE HẬU GIANG,
Hibex, KỸ THUẬT HUY MINH, ACCREDO ASIA, Núi Tiên, ALOEFIELD, anh Hảo, …

Note the family grouping (Nhựa Duy Tân / Duy Tân Long An / Duy Tân Bình Dương;
NUMBER ONE ×3). Customer is currently **free text with inconsistent casing** — the
app should offer a customer list with autocomplete rather than a plain text box.

**Units (ĐVT):** Cái, cuộn, Bịch, Bộ, m, Hộp, SET, Xấp — recorded inconsistently
(`Cái`/`cái`, `Cuộn`/`cuộn`, `M`/`m`). The app should normalize these to a
controlled list in the Config sheet.

**Item codes** in `CHI TIẾT` follow two patterns: `710004795 :` (Duy Tân internal
codes) and `Q4695359:` (PCVN quote refs). The description after the code is long
and multi-line — the UI needs a textarea, not a single-line input.

---

## 6. Status values as used today

Controlled-ish values, by frequency:

| Value | Count |
|-------|-------|
| `done` / `Done` | 443 |
| `đã xuất chưa tt` (invoiced, not yet paid) | 49 |
| `đã giao, chưa xuất` (delivered, not yet invoiced) | 9 |
| `hàng về` (goods arrived) | 9 |
| `chờ hàng về` (waiting for goods) | 1 |

Plus **~20 free-text one-offs** that mix a status with a note, e.g.:

- `GH 22/09/2026\nđã cọc 18,765,000 cho Tâm Thịnh Phát` — delivery date + deposit paid to supplier
- `Khách đã cọc 47,466,000đ` — customer deposit
- `đã tt đủ NCC Regas` — supplier fully paid
- `đã đặt TVP, không cọc` — ordered, no deposit
- `Ngày 06/06: mua đt iphone` — an unrelated cash note

**Implications for the app:**

1. A controlled `status` dropdown + a separate free-text `note` field covers most cases.
2. Deposits (**cọc**), supplier payment state, and expected delivery date (**GH**)
   are real business concepts currently squeezed into the status text. See
   `OPEN_QUESTIONS.md` — they may deserve their own fields.

---

## 7. What exports should look like

The monthly report layout users recognize:

- Grouped by month, with a `DOANH SỐ THÁNG n` revenue total row per month
- `STT` and `PO` shown only on an order's first line
- Customer repeated per line
- Money right-aligned, thousand separators, no decimals
