# Phase 2 Sub-Tasks — M4 Live Verification — Detailed Testing Steps

## Overview
These 6 sub-tasks correspond to sections in `CHECKLIST_M4_VI.md`. Each task includes:
- **Specific steps** (numbered, click-by-click)
- **Expected results** (what you should see)
- **Success criteria** (how to confirm it works)
- **Equipment needed** (PC only, phone only, or both)

---

## Task 2.1: Test CSV/XLSX/PDF Export — Filtering & File Format (PC only)

**Duration:** 20–30 min  
**Equipment:** PC/Mac with Excel or Google Sheets  
**Coverage:** Sections A, B, C in CHECKLIST_M4_VI.md

### Prerequisites
- [ ] Latest `apps/web` deployed
- [ ] Logged in with a full-permission test account
- [ ] Have `FILE THEO DOI DON HANG.xlsx` open in separate window for reference

### Step-by-step

**Part 1: Filter Setup**
1. Navigate to **Danh sách đơn hàng** (Orders list)
2. Locate the **Month filter** control
3. Click **Month dropdown** → select **Tháng 9 / 2024** (or any month with 10+ orders)
4. Verify that **danh sách only shows orders from that month**
5. Note the **order count** (e.g., "12 đơn hàng")

**Part 2: CSV Export**
1. Click **"Xuất CSV"** button
2. **Expected:** File `DanhSach_orders_Thang9_2024.csv` downloads (name may vary)
3. Open file in **Excel** (right-click → "Open with Excel")
4. Verify:
   - [ ] Column headers present: `STT`, `PO`, `Khách hàng`, `Ngày đơn`, `Ghi chú`, `Đơn giá`, `Thành tiền`, etc.
   - [ ] All rows are from Tháng 9 (check `Ngày đơn` column)
   - [ ] `STT` and `PO` appear only on first line of each order; subsequent lines same order are blank
   - [ ] Last row contains: `DOANH SỐ THÁNG 9` with total revenue
   - [ ] All currency values are formatted as numbers (not text)
   - [ ] Vietnamese characters (ơ, ê, ư, á, etc.) display correctly

**Part 3: XLSX Export**
1. Return to **Danh sách đơn hàng**
2. Verify **same month filter still active** (Tháng 9 / 2024)
3. Click **"Xuất XLSX"** button
4. **Expected:** File `.xlsx` downloads
5. Open in **Excel** and verify:
   - [ ] All columns visible (same as CSV)
   - [ ] Column widths are reasonable (not too narrow, not too wide)
   - [ ] Number format preserved (e.g., `1,000,000` shows with thousands separator)
   - [ ] Vietnamese characters correct
   - [ ] **Column formatting** (colors, bold headers) are preserved
   - [ ] Can also open in **Google Sheets** → formatting still intact
6. Compare CSV vs XLSX content:
   - [ ] Same rows, same order
   - [ ] Same total revenue figure
   - [ ] Only difference is file format, not data

**Part 4: PDF Export**
1. Return to **Danh sách đơn hàng**, verify filter still Tháng 9 / 2024
2. Click **"Xuất PDF"** button
3. **Expected:** `.pdf` file downloads
4. Open in **PDF viewer** (Adobe Reader, Preview, or browser default)
5. Verify:
   - [ ] Layout looks like a "monthly report" (group by month, totals row, etc.)
   - [ ] All columns and values visible and readable
   - [ ] Page breaks do NOT split an order mid-way (each order stays on one page or flows properly)
   - [ ] Vietnamese characters render correctly
   - [ ] Total revenue row matches the CSV/XLSX total
6. Compare with reference Excel report:
   - [ ] Styling/layout **recognizable to someone used to Excel reports**
   - [ ] Grouping by month is similar
   - [ ] Totals section is clear and in same position

**Part 5: Verify Filtering**
1. Return to **Danh sách đơn hàng**
2. Click **Month filter** → select **(Xóa)** or **All months** to clear
3. Verify danh sách shows **all orders** (count increased)
4. Export CSV again
5. **Expected:** File now contains orders from **multiple months**
6. Compare file sizes: filtered CSV < unfiltered CSV ✓

### Expected Results (All ✓)
- ✓ CSV contains correct columns, Vietnamese text, totals row
- ✓ XLSX opens in Excel with formatting intact, same data as CSV
- ✓ PDF layout is professional, recognizable, with proper page breaks
- ✓ All three formats show same data and totals
- ✓ Filtering works correctly (filtered vs. unfiltered count differs)

### Success Criteria
- Mark **Section A, B, C** in `CHECKLIST_M4_VI.md` with **✅** (all green)
- If any ❌, document in `TASKS.md` under "M4 Live Testing Issues"

---

## Task 2.2: Test Permission Gating — Visible Fields Enforcement (PC only)

**Duration:** 15–20 min  
**Equipment:** PC/Mac  
**Coverage:** Section D in CHECKLIST_M4_VI.md

### Prerequisites
- [ ] Have TWO test accounts ready:
  - **Account A:** Full admin rights (can see all columns)
  - **Account B:** Restricted role (e.g., `warehouse`, `visible_fields` excludes money columns)
- [ ] Both accounts have `export: true` permission
- [ ] Have a reference CSV/XLSX from Account A (Task 2.1) for comparison

### Step-by-step

**Part 1: Admin Account Export (Account A)**
1. Sign out, then **sign in as Account A** (full admin)
2. Navigate to **Danh sách đơn hàng**
3. Lọc **Tháng 9 / 2024** (same as before)
4. Export **CSV**
5. Open file, note which columns are present:
   - Should include: `PO`, `Khách hàng`, `Ngày đơn`, `Đơn giá`, `Thành tiền`, **all money columns**
6. Save this file as reference: **`reference_admin_export.csv`**

**Part 2: Restricted Account Export (Account B)**
1. Sign out, **sign in as Account B** (e.g., warehouse staff with limited visible_fields)
2. Navigate to **Danh sách đơn hàng**
3. Apply same filter: **Tháng 9 / 2024**
4. Try to click **"Xuất CSV"**
   - **Expected Option A:** Button is disabled/hidden → Success ✓
   - **Expected Option B:** Button present → Click it
5. If export succeeds:
   - Download the file
   - Open **`warehouse_export.csv`**
   - Verify: **NO money columns** (`Đơn giá`, `Thành tiền`, etc. should NOT be present)
   - Only columns in Account B's `visible_fields` should exist
6. Compare row count with reference:
   - Should have **same number of orders** (data scope same)
   - But **fewer columns** (money columns removed)

**Part 3: Warehouse Preset Test (if applicable)**
1. Still logged as Account B
2. If Account B has `warehouse` preset configuration (`export: false`):
   - [ ] "Xuất" button should NOT appear at all
   - [ ] If appears, clicking should show error: "Bạn không có quyền xuất"
3. If Account B has `sales` preset (`export: true, export_statistics: false`):
   - [ ] "Xuất" button appears and works
   - [ ] Statistics tab should NOT be visible (verify in next task)

### Expected Results
- ✓ Admin export contains all columns including money
- ✓ Restricted export has money columns **removed** (not just hidden)
- ✓ Warehouse role cannot export (button missing or error on click)
- ✓ Sales role can export, but no statistics access

### Success Criteria
- Mark **Section D.1 & D.2** in CHECKLIST_M4_VI.md with **✅**
- If restricted export still contains money columns → **❌ Data leak bug** → Report immediately

---

## Task 2.3: Test Statistics Views — All 4 Time Periods + Toggle (PC only)

**Duration:** 20–25 min  
**Equipment:** PC/Mac  
**Coverage:** Section G in CHECKLIST_M4_VI.md

### Prerequisites
- [ ] Logged in as Account A (full admin, has `view_statistics`)
- [ ] Latest `apps/web` deployed with Stats views active

### Step-by-step

**Part 1: Navigate to Stats**
1. Look for **"Thống kê"** tab or menu item in navigation
2. Click to enter stats view
3. **Expected:** Page loads with chart/graph visible
4. Verify page header: **"Thống kê Doanh số"** or similar

**Part 2: Time Period Selection — Tuần (Week)**
1. Locate **radio buttons or dropdown** for time period
2. Select **"Theo tuần"** (By Week)
3. **Expected:** Chart updates to show **weekly bars** or **weekly data points**
4. Verify:
   - [ ] X-axis shows weeks (e.g., "Tuần 35", "Tuần 36", etc. or "09/01–09/07", etc.)
   - [ ] Y-axis shows currency values (VND)
   - [ ] Values are positive and reasonable (not 0 for all weeks, not negative)
   - [ ] Chart updates smoothly (no error message)

**Part 3: Time Period Selection — Tháng (Month)**
1. Select **"Theo tháng"** (By Month)
2. **Expected:** Chart updates to monthly view
3. Verify:
   - [ ] X-axis shows months (e.g., "Tháng 1", "Tháng 2", ..., "Tháng 9", etc.)
   - [ ] Y-axis scale adjusts appropriately (monthly totals are larger than weekly)
   - [ ] No error or console warning

**Part 4: Time Period Selection — Quý (Quarter)**
1. Select **"Theo quý"** (By Quarter)
2. **Expected:** Chart shows **quarterly data**
3. Verify:
   - [ ] X-axis shows quarters (e.g., "Q1 2024", "Q2 2024", "Q3 2024", etc.)
   - [ ] Y-axis scale adjusted (quarterly totals even larger)
   - [ ] Chart renders correctly

**Part 5: Time Period Selection — Năm (Year)**
1. Select **"Theo năm"** (By Year)
2. **Expected:** Chart shows **yearly totals**
3. Verify:
   - [ ] X-axis shows years (e.g., "2023", "2024", etc.)
   - [ ] Only shows current year or recent years with data

**Part 6: Toggle "Bao gồm chưa lập hóa đơn" (Include Non-Invoiced)**
1. Find **checkbox or toggle** labeled "Bao gồm chưa lập hóa đơn"
2. Verify it's **currently UNCHECKED** (default)
3. Note the **current total** for September (read from chart or summary)
4. **Check the toggle**
5. **Expected:** Chart updates, **totals increase** (if there are non-invoiced orders)
6. New total should = old total + non-invoiced orders' revenue
7. **Uncheck the toggle**
8. Verify total returns to original value ✓

**Part 7: View by Customer**
1. Look for **"Doanh số theo khách hàng"** or similar link/tab
2. Click to view
3. **Expected:** Table or list appears with columns: `Tên khách hàng`, `Doanh số`
4. Verify:
   - [ ] All customers in dataset are listed
   - [ ] Each customer has correct total revenue
   - [ ] Toggle "Bao gồm chưa lập hóa đơn" also affects this view (total changes)
   - [ ] List is sortable (click column header to sort by revenue or name)

**Part 8: View by Status**
1. Look for **"Doanh số theo trạng thái"** or similar link/tab
2. Click to view
3. **Expected:** Table or list showing statuses: `Nháp`, `Chờ duyệt`, `Đã duyệt`, `Từ chối`
4. Verify:
   - [ ] Each status shows its total revenue
   - [ ] Toggle affects this view as well
   - [ ] Revenue sums are positive and reasonable

### Expected Results
- ✓ All 4 time periods (week, month, quarter, year) display data correctly
- ✓ Toggle "include non-invoiced" changes totals and persists across views
- ✓ Customer and Status views display correct aggregated data
- ✓ No console errors or loading spinners stuck

### Success Criteria
- Mark **Section G.1–G.5** in CHECKLIST_M4_VI.md with **✅**
- If any view shows 0 or error → investigate data completeness

---

## Task 2.4: Test Permission Gating — Statistics Access (PC only)

**Duration:** 10 min  
**Equipment:** PC/Mac  
**Coverage:** Section G.5 in CHECKLIST_M4_VI.md

### Prerequisites
- [ ] Account A: Has `view_statistics` permission (can see stats)
- [ ] Account B: DOES NOT have `view_statistics` (restricted, warehouse, or similar)

### Step-by-step

**Part 1: Account A (Has Permission)**
1. Sign in as **Account A**
2. Verify **"Thống kê"** tab/link is **visible** in navigation
3. Click to enter stats view
4. **Expected:** Stats page loads successfully
5. Mark: **✅ Can access**

**Part 2: Account B (No Permission)**
1. Sign out, **sign in as Account B**
2. Look for **"Thống kê"** tab/link in navigation
3. **Expected Option A:** Tab/link is **hidden entirely** → Success ✓
4. **Expected Option B:** Tab/link is visible but clicking shows error:
   - Error message: **"Bạn không có quyền xem thống kê"** or similar
   - User is redirected to danh sách đơn hàng
5. Try accessing stats directly via URL (if you know the URL):
   - Paste URL directly in address bar
   - **Expected:** Server returns **403 Forbidden** or redirects to orders list
   - Verify **no data leakage** (can't see any stat numbers)

### Expected Results
- ✓ Account with `view_statistics` can access stats
- ✓ Account without permission cannot access (tab hidden or error)
- ✓ No data leakage in restricted account view

### Success Criteria
- Mark **Section G.5** in CHECKLIST_M4_VI.md with **✅**

---

## Task 2.5: Test Revenue Reconciliation — Sample Month (PC only)

**Duration:** 15–20 min  
**Equipment:** PC/Mac with Excel + `FILE THEO DOI DON HANG.xlsx`  
**Coverage:** Section H in CHECKLIST_M4_VI.md

### Prerequisites
- [ ] Have `FILE THEO DOI DON HANG.xlsx` open in Excel (reference file)
- [ ] Logged in as Account A (full admin)
- [ ] Read `reference-data-m4-verification.md` (this guide's companion document)

### Step-by-step

**Part 1: Select Reference Month from Excel**
1. Open **`FILE THEO DOI DON HANG.xlsx`** in Excel
2. Go to **main sheet** (usually labeled with month data)
3. Find a month with:
   - At least 5–10 orders (meaningful dataset)
   - Mix of invoiced and non-invoiced orders
   - Identifiable rows with revenue totals
4. Choose **Tháng 9 / 2024** (if available) or note your month
5. Record the following values (copy-paste from Excel):
   - **Ex-VAT Total** (column: "Doanh số chưa thuế" or similar): `_____________ VND`
   - **Inc-VAT Total** (column: "Doanh số có thuế" or similar): `_____________ VND`
   - **Non-Invoiced Orders** (if column exists): `_____________` VND
6. Write these in `reference-data-m4-verification.md` for audit trail

**Part 2: In-App Stats — Verify Ex-VAT**
1. Switch to app, navigate to **"Thống kê"**
2. Select **"Theo tháng"** time period
3. Look at **September** bar/total
4. Verify the **toggle "Bao gồm chưa lập hóa đơn" is UNCHECKED** (default)
5. Note the **displayed revenue**: `_____________ VND` (from September bar)
6. **Compare:**
   - App Ex-VAT total ≈ Excel "Doanh số chưa thuế"?
   - Difference ≤ 1% (rounding is OK)
   - [ ] **MATCH ✓** → Continue
   - [ ] **MISMATCH ❌** → Document discrepancy, check for split-order scenario

**Part 3: In-App Stats — Verify Inc-VAT (without Non-Invoiced)**
1. Still in stats, **confirm toggle is still UNCHECKED**
2. Note: Should show **only invoiced orders**
3. Compare with Excel Inc-VAT (invoiced only):
   - App total ≈ Excel "Doanh số có thuế" (invoiced subset)?
   - [ ] **MATCH ✓**
   - [ ] **MISMATCH ❌** → Investigate

**Part 4: In-App Stats — Verify with Toggle ON**
1. **CHECK the toggle** "Bao gồm chưa lập hóa đơn"
2. New total appears: `_____________ VND`
3. This should = (invoiced total) + (non-invoiced total)
4. Verify:
   - [ ] New total > previous total (if non-invoiced exist)
   - [ ] Difference ≈ non-invoiced revenue from Excel

**Part 5: CSV Export Verification (Tied to Revenue)**
1. Go to **Danh sách đơn hàng**
2. Filter **Tháng 9 / 2024**
3. Export **CSV**
4. Open file, scroll to bottom
5. Find **"DOANH SỐ THÁNG 9"** total row
6. Note value: `_____________ VND`
7. **Compare with stats Inc-VAT (toggle OFF):**
   - Should be approximately equal
   - [ ] **MATCH ✓**

### Expected Results
- ✓ Ex-VAT stat ≈ Excel Ex-VAT (within 1%)
- ✓ Inc-VAT stat ≈ Excel Inc-VAT (within 1%)
- ✓ Toggle ON increases total by non-invoiced amount
- ✓ CSV export total ≈ stats Inc-VAT

### Success Criteria
- Mark **Section H** in CHECKLIST_M4_VI.md with **✅**
- If mismatch > 1%:
  - Check for split-order scenario (document in `TASKS.md`)
  - Verify date bucketing logic
  - Retest after clarification

---

## Task 2.6: Test Large Export & Mobile — Async Job + Phone UI (PC + Phone)

**Duration:** 25–30 min  
**Equipment:** PC + real phone (iOS Safari or Android Chrome)  
**Coverage:** Sections E, I in CHECKLIST_M4_VI.md

### Prerequisites
- [ ] Logged in as Account A (full admin) on both devices
- [ ] Latest `apps/web` deployed
- [ ] Phone connected to same network (or accessible via public URL if deployed)

### Part A: Async Export Test (PC)

**Step 1: Filter for Large Dataset**
1. Go to **Danh sách đơn hàng**
2. Apply filter to get > 500 order **lines** (not orders; single order can have multiple lines)
3. **Option A:** Filter by month with many orders
4. **Option B:** Remove all filters (show all data)
5. Count total lines displayed: should be **500+**

**Step 2: Export Trigger**
1. Click **"Xuất CSV"** (or XLSX/PDF)
2. **Expected:** Instead of immediate file download, a **popup appears** with status message:
   - Text: "Đang xử lý xuất dữ liệu, vui lòng chờ..."
   - Shows **progress** (% complete or "Bước 1/3", etc.)
3. Do NOT close popup
4. Wait for status to update

**Step 3: Job Completion**
1. Popup updates to: **"Hoàn tất!"** or "✓ Xuất thành công"
2. Shows a **download link** or button labeled "Tải file" or "Tải xuống"
3. Or shows: **"Email đã được gửi"** (if email is configured)
4. Click download link (if present)
5. **Expected:** File starts downloading
6. Verify file size is reasonable (>5MB for large export)

**Step 4: Verify File in Drive (if applicable)**
1. Check **Google Drive** (if export stores file there)
2. Look for folder: **"THIENTAN_EXPORTS"** or similar
3. New file should be present: `export_2026_09_07_...`
4. **Verify:** File is **NOT publicly shared** (right-click → Share → verify private setting)

**Step 5: Email Verification (if applicable)**
1. Check **email inbox** (use test account's email)
2. Look for email from app: **"Tệp xuất của bạn đã sẵn sàng"** or similar
3. Email contains:
   - [ ] Download link
   - [ ] Expiry date (if retention policy applies)
   - [ ] File name
4. Click link → file downloads

### Part B: Mobile UI Test (Phone)

**Step 1: Navigate to Orders on Phone**
1. On **real phone** (not desktop emulation), open app
2. Log in as Account A
3. Go to **"Danh sách đơn hàng"**
4. Apply same **Tháng 9 / 2024** filter as before
5. Verify:
   - [ ] Filter UI is **compact** (doesn't overflow horizontally)
   - [ ] Can still tap filter controls easily
   - [ ] Order list cards display legibly on small screen

**Step 2: Export on Phone**
1. Scroll to find **"Xuất CSV"** button
2. Tap **"Xuất CSV"**
3. **Expected:** Same async popup as PC
4. Wait for completion
5. When file ready → tap **"Tải xuống"** or "Tải file"
6. File should download to phone's Downloads folder
7. Can open in Excel app or email (if email fallback used)

**Step 3: Stats Tab on Phone**
1. Navigate to **"Thống kê"** tab
2. Verify:
   - [ ] Tab is visible and tappable
   - [ ] Page loads without horizontal scroll
   - [ ] Chart displays on screen (not too large)
3. Tap **time period button** (tuần/tháng/quý/năm):
   - [ ] Chart updates
   - [ ] No lag or error
4. Tap **"Bao gồm chưa lập hóa đơn"** checkbox:
   - [ ] Toggle works smoothly
   - [ ] Chart updates
5. Scroll to **customer/status views** (if present):
   - [ ] Lists are scrollable, not truncated
   - [ ] Tap a customer/status → detail loads (if available)

**Step 4: Console Check (Phone)**
1. Open **Chrome DevTools** or **Safari Web Inspector** (Cmd+Option+I on Mac, or Settings → Developer on Android)
2. Go to **Console** tab
3. **Expected:** No error messages, no warnings
4. Look specifically for:
   - [ ] No red errors (API failures, syntax errors)
   - [ ] No yellow warnings (deprecation, performance)

### Expected Results
- ✓ Large export (>500 lines) triggers async job, not immediate download
- ✓ Popup shows progress and completion status
- ✓ File available via link or email
- ✓ File on Drive is private, not world-readable
- ✓ Phone UI is compact, all controls accessible
- ✓ Stats and export work equally on phone
- ✓ No console errors on phone

### Success Criteria
- Mark **Section E, I** in CHECKLIST_M4_VI.md with **✅**
- If async popup doesn't appear → check if data actually > 500 lines or if threshold needs adjustment
- If phone shows horizontal scroll → UI not mobile-optimized → ❌

---

## Summary: All 6 Sub-Tasks

| Task | Focus | Device | Time | CHECKLIST Section |
|------|-------|--------|------|-------------------|
| 2.1 | Export format (CSV/XLSX/PDF), filtering | PC | 20–30 min | A, B, C |
| 2.2 | Permission gating, visible_fields | PC | 15–20 min | D |
| 2.3 | Stats views, all time periods, toggle | PC | 20–25 min | G |
| 2.4 | Stats permission enforcement | PC | 10 min | G.5 |
| 2.5 | Revenue reconciliation vs. reference Excel | PC + Excel | 15–20 min | H |
| 2.6 | Large export (async), mobile UI | PC + Phone | 25–30 min | E, I |

**Total time estimate:** 2.5–3.5 hours  
**Estimated completion:** [Date + 3.5h from start]

---

**Document Version:** 2026-09-07  
**Status:** Ready for execution
