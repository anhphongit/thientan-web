# Open Questions

Gaps found while comparing `PROJECT_INSTRUCTION.md` against the real data in
`FILE THEO DOI DON HANG.xlsx`. **Do not guess these** — ask Phong. Record the answer
here with a date, then update `DATA_MODEL.md` accordingly.

Priority: 🔴 blocks a milestone · 🟡 affects design · 🟢 nice to settle

---

## 🔴 Q1 — Deposits (cọc) are a real concept, not a status

The reference file records deposits inside the status text:

- `Khách đã cọc 47.466.000đ` (customer paid a deposit)
- `đã cọc 18.765.000 cho Tâm Thịnh Phát` (deposit paid **to a supplier**)
- `đã tt đủ NCC Regas` (supplier fully paid)
- `đã đặt TVP, không cọc`

So there are **two money flows** being tracked: customer→us and us→supplier. The
instruction document mentions neither.

**Question:** should v1 have explicit fields — `customerDeposit`, `supplierName`,
`supplierPaid` — or is a free-text `statusNote` enough for now?
**Impact:** Milestone 2 (order schema). Adding fields later means editing the Sheet.

---

## 🔴 Q2 — What exactly does "doanh số" (revenue) mean?

`DOANH SỐ THÁNG n` totals a column, but the file has two money columns:
`Thành tiền chưa VAT` (ex-VAT) and `Trị giá hđ` (inc-VAT). Statistics charts need
one definition.

**Question:** revenue = ex-VAT, inc-VAT, or show both?
Also: is an order counted in the month of the **order date** or the **invoice date**?
Several orders in the file were invoiced 2–3 months after they were placed
(e.g. order `26001` in the January block, invoice dated 23/04/2026).
**Impact:** Milestone 4. Getting this wrong makes every chart wrong.

---

## 🟡 Q3 — Two order numbers, which one is primary?

The `PO` column stacks the internal number (`26001`) and the customer's PO
(`4600041936`), sometimes with a note (`( chTh)`). `DATA_MODEL.md` splits these into
`orderNo` + `customerPo` + `note`.

**Question:** confirm the split is right. Can one internal order have more than one
customer PO? Should `orderNo` auto-increment, or does Phong type it?
**Impact:** Milestone 2.

---

## 🟡 Q4 — Invoice number is per line group, not per order

In the file, order `26009` has **three different invoice numbers/dates** across its
lines (50 / 30-03 / 50). So one order can be invoiced in several parts.

**Question:** move `invoiceNo` / `invoiceDate` down to `OrderLines`, keep them on
`Orders`, or support both (order-level default + per-line override)?
**Impact:** Milestone 2 schema, Milestone 4 export layout.

---

## 🟡 Q5 — Should inventory deduct automatically?

`PROJECT_INSTRUCTION.md` says "basic product/stock management, linkable to order
lines where useful" — deliberately vague.

**Question:** when an order reaches a certain status, should `Products.stockQty`
decrease automatically, or is stock adjusted manually?
**Impact:** Milestone 5. Automatic deduction needs a defined trigger status and a
reversal rule for cancellations.

---

## 🟡 Q6 — Customer master list?

19 distinct customers, with inconsistent casing and family groupings
(`Nhựa Duy Tân` / `Duy Tân Long An` / `Duy Tân Bình Dương`).

**Question:** a proper `Customers` sheet (code, name, tax code, address), or just a
`customerList` in `Config` for autocomplete?
**Impact:** Milestone 2. A `Customers` sheet would be a 7th tab — cheap now,
annoying later.

---

## 🟢 Q7 — One spreadsheet per year?

The reference file's tab is `THONGKE_2026`, suggesting a yearly rollover. At ≤ 100
orders/month, a single `Orders` sheet holds ~1,200 rows/year — fine for many years.

**Question:** keep everything in one sheet forever, or archive per year?
**Recommendation:** one sheet, revisit at ~10,000 rows.

---

## 🟢 Q8 — Are the free-text cash notes in scope?

Rows like `Ngày 16/04: rút 100tr` and `Ngày 06/06: mua đt iphone` appear in the
status column — personal/company cash notes, unrelated to orders.

**Question:** ignore these entirely in the new system (recommended), or is there a
petty-cash log that also needs a home?

---

## 🟢 Q9 — Who can see prices?

`visible_fields` exists in the permission matrix, but no one has said which roles
should be blocked from seeing `unitPrice` and amounts.

**Question:** confirm the default profiles in `PERMISSIONS.md` §3 — specifically,
should warehouse staff see prices?

---

## 🟢 Q10 — VAT rates

Two rates observed: 8% (438 lines) and 10% (94 lines).

**Question:** is 8% the default for new lines? Are other rates (0%, 5%) possible?
**Current plan:** per-line `vatRate`, default from `Config.vatRates[0]`.

---

## Answered

| Date | Question | Answer |
|------|----------|--------|
| 2026-08-15 | Which architecture? | Option C — Apps Script + private Sheets |
| 2026-08-15 | Import the existing Excel? | No. Reference only; users enter live data |
| 2026-08-15 | Use clasp? | Yes |
