# Reference Data for M4 Live Verification — Revenue Reconciliation

## Purpose
This document captures reference revenue figures from `FILE THEO DOI DON HANG.xlsx` 
for live testing verification (Phase 2, section H).

## Reference File Location
- **File:** `/Users/phongna/anhphongit/Projects/thientan-web/FILE THEO DOI DON HANG.xlsx`
- **Format:** Monthly order tracking spreadsheet with revenue columns
- **Expected structure:** Month | Total Orders | Ex-VAT Revenue | Inc-VAT Revenue | Notes

## Test Data Selection Guidance

### How to Extract Reference Data

1. Open `FILE THEO DOI DON HANG.xlsx` in Excel or Google Sheets
2. Identify a month with:
   - Mix of invoiced and non-invoiced orders (to test the "Bao gồm chưa lập hóa đơn" toggle)
   - At least 5-10 orders (meaningful dataset)
   - Recent data (within last 6 months for relevance)
3. Note the **month name** and **year**
4. Record:
   - **Column for Ex-VAT total:** Usually named "Doanh số chưa thuế", "Ex-VAT", or similar
   - **Column for Inc-VAT total:** Usually named "Doanh số có thuế", "Inc-VAT", or similar
   - **Exact numeric values** (copy-paste from spreadsheet)

### Sample Reference Format

When you select a month, fill in this template:

```
## Sample Month: [Month Name] [Year]

| Metric | Value | Notes |
|--------|-------|-------|
| Total Orders | X | Number of orders in month |
| Total Revenue (Ex-VAT) | X VND | From "Doanh số chưa thuế" column |
| Total Revenue (Inc-VAT) | Y VND | From "Doanh số có thuế" column |
| Invoiced Orders | A | Orders with hóa đơn |
| Non-Invoiced Orders | B | Orders without hóa đơn |
| Split-Order Notes | [describe] | Any orders split across months |
```

## Important Notes for Tester

### Understanding Split Orders
- **Expected behavior:** A single order may have lines with different invoice dates
  - Line 1: Invoice date 2024-09-10 → counted in September
  - Line 2: Invoice date 2024-10-02 → counted in October
  - This is **CORRECT**, not a bug
- **Reconciliation strategy:** If app total ≠ reference file total:
  1. Check if any order exists in BOTH months (split-order case)
  2. Document which orders are split and why
  3. Recalculate: September total should exclude lines invoiced in October
  4. Verify match after adjusting for splits

### Toggle Testing
- **"Bao gồm chưa lập hóa đơn" = OFF (default)**
  - Only includes orders WITH hóa đơn
  - Should match reference file's "invoiced" column
  
- **"Bao gồm chưa lập hóa đơn" = ON**
  - Includes ALL orders (both invoiced + non-invoiced)
  - Should be higher than OFF state
  - Verify the delta = non-invoiced orders' revenue

## Deployment Confirmation

### Pre-Test Checklist
Before starting revenue reconciliation (Phase 2, §H):

- [ ] Latest `apps/api` has been deployed
  - Verify by checking the app's footer or API version header
  - Should show build: `api-2026-09-0X-...` or later
- [ ] Latest `apps/web` has been deployed
  - Verify by checking the web app's footer or reloading cache (Cmd+Shift+R)
  - Should show build: `web-2026-09-0X-...` or later
- [ ] Both apps are live and accessible
- [ ] Login works with test account(s)
- [ ] "Thống kê" tab is visible (confirms stats view deployed)
- [ ] "Xuất" actions (CSV/XLSX/PDF) are present in the UI

## Test Execution Log

### Session 1 - [Date] - [Tester Name]

**Reference Data Selected:**
- Month: _______________
- Year: _______________
- Ex-VAT Reference: _______________
- Inc-VAT Reference: _______________

**Test Results:**

| Check | Expected | Actual | Match? | Notes |
|-------|----------|--------|--------|-------|
| Ex-VAT (no toggle) | [value] | __________ | ✓/✗ | |
| Inc-VAT (no toggle) | [value] | __________ | ✓/✗ | |
| Revenue with "Include unpaid" ON | [higher] | __________ | ✓/✗ | |
| Split-order detected? | [yes/no] | __________ | [explain] | |

**Issues Found:**
- (list any discrepancies)

**Status:** ✓ PASS / ✗ NEEDS FIX

---

## CSV Export Verification (Tied to Revenue Check)

When testing CSV export (§A), also verify:
- [ ] Total row at bottom of CSV matches reconciliation total
- [ ] All currency values match "Inc-VAT" column (includes VAT by default)
- [ ] Filtering by month → CSV totals match §H reconciliation for same month

---

**Document Version:** 2026-09-07  
**Status:** Ready for tester input
