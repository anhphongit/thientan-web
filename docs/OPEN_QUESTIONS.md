# Open Questions

Gaps found while comparing `PROJECT_INSTRUCTION.md` against the real data in
`FILE THEO DOI DON HANG.xlsx`. **Do not guess these** — ask Phong. Record the answer
here with a date, then update `DATA_MODEL.md` accordingly.

Priority: 🔴 blocks a milestone · 🟡 affects design · 🟢 nice to settle

---

## ▶ Resume here (updated 2026-08-20)

**Milestone 2 is unblocked.** Q1, Q3, Q4 and Q6 were answered on 2026-08-20, and
Q2 (which blocks Milestone 4) was answered at the same time. `DATA_MODEL.md` has
been updated to match; `Orders`, `OrderLines` and `Invoices` are created by
`setupMilestone2()`.

Still open, none of them blocking: **Q5** (automatic stock deduction — Milestone 5),
**Q7** (yearly rollover), **Q8** (petty-cash notes), **Q9** (who may see prices),
**Q10** (VAT rates beyond 8% / 10%).

---

## ✅ Q1 — Deposits (cọc) are a real concept, not a status

**Answered 2026-08-20: explicit fields.**

The reference file records deposits inside the status text:

- `Khách đã cọc 47.466.000đ` (customer paid a deposit)
- `đã cọc 18.765.000 cho Tâm Thịnh Phát` (deposit paid **to a supplier**)
- `đã tt đủ NCC Regas` (supplier fully paid)

Two money flows: customer→us and us→supplier. `Orders` therefore gains
`customerDeposit`, `supplierName` and `supplierPaid`, all optional, alongside the
existing free-text `statusNote` for anything that does not fit a number.

---

## ✅ Q2 — What exactly does "doanh số" (revenue) mean?

**Answered 2026-08-20: show both figures, and make the month basis switchable.**

- Revenue is reported **both** ex-VAT (`Thành tiền chưa VAT`) and inc-VAT
  (`Trị giá hđ`). Neither is "the" number; statistics screens show the pair.
- The month an order counts in is a **toggle** on the statistics screen: by order
  date, or by invoice date. Default is invoice date, because that is what the
  invoice numbers in the file imply; orders with no invoice yet are excluded from
  the invoice-date view and shown as a separate "chưa xuất hoá đơn" figure.

**Impact:** Milestone 4. With the toggle, both readings stay available, so no
chart is silently wrong.

**Superseded 2026-09-04 (Milestone 4.7.3, "stat by order"):** Phong changed the
statistics unit from order LINE to ORDER, which removes the order-date/
invoice-date basis toggle entirely — an order has exactly one date, so there is
nothing left for a second basis to mean. In its place, a single global "Bao gồm
đơn chưa xuất hoá đơn" (include orders without invoice) toggle, default ON,
controls whether unbilled orders (or the unbilled portion of a mixed order)
count toward the stats or are pulled into the "chưa xuất hoá đơn" figure
instead — see Stats.gs's file doc comment and `statsAggregateByOrder_` for the
exact split rule. Both VAT figures (ex-VAT/inc-VAT) are still shown together,
unchanged by this revision.

---

## ✅ Q3 — Two order numbers, which one is primary?

**Answered 2026-08-20: do not split the PO column.**

The whole `PO` cell is one value — the purchase-order number as the business
writes it, whatever it contains. It is **not** split into `orderNo` + `customerPo`.
A second field, `poNote`, holds remarks *about the PO*: that it is temporary, that
it is a placeholder increasing number until the customer's real PO arrives, that
it looks wrong, and so on.

Consequence: there is no auto-incrementing business order number. Because a PO can
be blank, temporary or shared between orders, **the system reference `orderId`
(`DH-2026-0001`) is shown to users** — on the order screen, in the list and in
exports — so an order can always be named unambiguously.

`orderId` is written in ASCII (`DH-`, not `ĐH-`) deliberately: it gets typed into
search boxes and phone keyboards, and an unaccented key is safe everywhere. The UI
may label it "Mã đơn".

---

## ✅ Q4 — Invoice number is per line group, not per order

**Answered 2026-08-20: invoices are their own entity.**

The business rule, in Phong's words: one invoice can cover several orders, and one
order can have zero (not yet invoiced) or several invoices. So invoice is neither
an order field nor a line field — it is a record of its own that lines point at:

- a new **`Invoices`** tab holds each invoice once (`invoiceId`, `invoiceNo`,
  `invoiceDate`, `customer`, `note`)
- **`OrderLines.invoiceId`** references it, blank until that line is invoiced

`Orders.invoiceNo` / `Orders.invoiceDate` are gone. Correcting an invoice date is
one edit in one place, and "which orders are on invoice 50" is one lookup.

---

## 🟡 Q5 — Should inventory deduct automatically?

`PROJECT_INSTRUCTION.md` says "basic product/stock management, linkable to order
lines where useful" — deliberately vague.

**Question:** when an order reaches a certain status, should `Products.stockQty`
decrease automatically, or is stock adjusted manually?
**Impact:** Milestone 5. Automatic deduction needs a defined trigger status and a
reversal rule for cancellations.

---

## ✅ Q6 — Customer master list?

**Answered 2026-08-20: no `Customers` sheet.** `customerList` in `Config` drives
autocomplete on the order form. It is seeded with the 19 names observed in the
reference file, and a name typed that is not on the list is appended to it, so the
list fills itself instead of staying empty until the admin UI exists (Milestone 5).

Trade-off accepted: a typo becomes a new "customer" in the suggestion list. The
admin can prune the list in `Config`. Revisit if per-customer tax codes or
addresses are ever needed on exports.

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
| 2026-08-20 | Q1 — deposits | Explicit fields: `customerDeposit`, `supplierName`, `supplierPaid` |
| 2026-08-20 | Q2 — revenue | Show ex-VAT **and** inc-VAT; month basis switchable (order date / invoice date) |
| 2026-08-20 | Q3 — order numbering | No split: one free-text `po` + `poNote`. System reference `DH-2026-0001` is shown to users |
| 2026-08-20 | Q4 — invoices | Own `Invoices` tab; `OrderLines.invoiceId` points at it. Many-to-many in practice |
| 2026-08-20 | Q6 — customers | No `Customers` sheet. `Config.customerList` autocomplete, self-filling |
