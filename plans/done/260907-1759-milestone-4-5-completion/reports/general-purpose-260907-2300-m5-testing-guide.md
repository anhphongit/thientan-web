# M5 Live Testing & Sign-Off Guide

**Status:** Phase 6 execution guide ready for live testing

**Created:** 2026-09-07  
**Milestone:** M5 — Inventory + Admin UI  
**Checklist:** `docs/CHECKLIST_M5_VI.md` (202 lines, 10 sections A–K)

---

## What Was Prepared

1. **CHECKLIST_M5_VI.md** — Comprehensive Vietnamese testing checklist with:
   - **A. Kho hàng — CRUD** (5.1): Product creation, edit, delete, unique code enforcement
   - **B. Cảnh báo tồn thấp** (5.1): Low-stock badge, stockQty ≤ minStock behavior
   - **C. Tìm kiếm & lọc kho** (5.1): Search by code/name, active/inactive toggle
   - **D. Người dùng — CRUD** (5.2): User creation, email (read-only after creation), deactivation
   - **E. Bảo vệ quản trị viên** (5.2): Self-protection (can't remove own manage_users) + last-admin protection
     - E.1: Remove_admin test via preset path + matrix path
     - E.2: Last_admin test via preset path + matrix path
   - **F. Ma trận quyền** (5.3): 14-checkbox matrix, preset switching, custom permissions, phone usability
   - **G. Sửa cấu hình** (5.4): Add status/UoM/customer, **test immediate cache invalidation** (not 2-min delay)
   - **H. Liên kết mã hàng** (5.5): Product lookup in order form, autocomplete, unknown codes still save
   - **I. Quyền & điều hướng**: Tab visibility, server-side refusal on direct URL access
   - **J. Hiệu lực quyền tức thì**: Permission change takes effect on next action (no logout needed, no 2-min wait)
   - **K. Điện thoại** (K.1–K.4): Responsive UI test on real phone (iOS Safari / Android Chrome)

2. **Exit Criteria Mapped:**
   - ✅ M5-1: Admin creates user + sets permissions without Sheets
   - ✅ M5-2: Permission change takes effect on next action (Section J)
   - ✅ M5-3: Last admin protected + can't self-demote (Section E.2)
   - ✅ M5-4: Product CRUD works, OrderLines.productCode can link (Sections A–C, H)
   - ✅ M5-5: Matrix usable on phone, 14 checkboxes, card layout (Section K.3)

---

## Pre-Testing Checklist

Before starting live testing, complete these setup steps:

### Step 1: Run setupMilestone5()

The phase notes this is CRITICAL — if setupMilestone5() was never run, the Inventory tab will fail with "sheet not found" (exact symptom the audit caught before).

**How to verify:**
1. Open `apps/api` Google Apps Script editor
2. Select `setupMilestone5` from the dropdown
3. Click **Run**
4. Check execution log for: `"Sheet \"Products\": created with 9 columns."`
5. Open the live spreadsheet → confirm **Products** tab exists with 9 headers:
   - `productId`, `code`, `name`, `uom`, `stockQty`, `minStock`, `lastPrice`, `active`, `note`

If log says `"Sheet \"Products\": already has data, left untouched."` → setup was already run, no action needed.

### Step 2: Deploy apps/api then apps/web

**API Deployment:**
```
1. apps/api → Project Settings → Deployments
2. Create new deployment from "default" version
3. Copy new BUILD number from Config.gs:18
   (Should be something like: api-2026-09-07c-product-lookup)
4. Note it for verification
```

**Web Deployment:**
```
1. apps/web → Project Settings → Deployments
2. Create new deployment from "default" version
3. Copy new BUILD number from script
4. Verify web app URL is accessible in a browser
```

### Step 3: Verify apps are live and working

- [ ] Open web app URL in browser
- [ ] Can authenticate successfully
- [ ] See app shell with nav tabs (Đơn hàng, Kho hàng, Người dùng, etc.)
- [ ] DevLog (if enabled) shows recent entries with no errors

---

## Testing Approach

### Multi-Device Testing Required

- **PC/Mac:** Sections A–J (most comprehensive, easiest to document)
- **Real Phone:** Sections F (matrix), G (config), K (responsive UI)
  - **Must be real device** (iOS Safari or Android Chrome, not browser resize simulation)
  - Desktop emulation doesn't catch true touch/scroll/layout issues

### Multi-Account Testing Required

Create or identify 3 accounts with these permissions:

| Account | Role | Key Permissions |
|---------|------|-----------------|
| Account A | admin | All permissions enabled (manage_inventory, manage_users, manage_config, etc.) |
| Account B | sales | No manage_* permissions; create_order, edit_order, view_orders enabled |
| Account C | warehouse | manage_inventory only; no manage_users, no manage_config |

**Why 3 accounts?**
- Section I requires testing that permissions actually gate the UI server-side
- Section J requires testing immediate permission effect (Account A grants/revokes permission for Account B)
- Section E requires testing last-admin protection with actual accounts, not just permission toggling

### Test Order (PC First)

1. **Sections A–C** (Inventory CRUD): 30 min
   - Create, edit, delete products
   - Test low-stock badge behavior
   - Search & filter
2. **Sections D–E** (User CRUD + Admin Protection): 45 min
   - Create users with presets + matrix paths
   - Test self-protection (can't remove own manage_users)
   - Test last-admin protection (can't deactivate or strip manage_users)
   - **Test both preset and matrix paths** for protection rules
3. **Sections F–G** (Matrix & Config Editing): 30 min
   - Toggle individual permissions
   - Edit config lists; verify immediate update (cache invalidation)
   - Watch for 2-min delay (should be instant)
4. **Sections H–J** (Product Lookup, Permissions, Immediate Effect): 30 min
   - Product autocomplete in order form
   - Tab visibility per account
   - Permission change immediate effect test (2 browser windows, same-second verification)
5. **Sections K (Phone):** 30 min
   - Repeat F, G on real phone
   - Verify 14 checkboxes are readable and clickable
   - Confirm card layout for lists

**Total:** ~2.5 hours on PC + 30 min on phone = 3 hours total

### During Testing

**For each section:**
1. Mark ✅ if all sub-items pass
2. Mark ❌ if any fail
3. If ❌ found:
   - Document the exact symptom in TASKS.md with a new task ID
   - Identify root cause (code, caching, permission, UI)
   - Fix in code
   - Add an offline test assertion to cover the bug
   - Run all test suites (`npm test` in both `apps/`)
   - Re-deploy
   - Re-test that section

**Continue until all sections are ✅**

---

## Common Test Scenarios

### Scenario 1: Permission Change Takes Effect Immediately (Section J)

1. **Browser 1:** Admin account, open `docs/CHECKLIST_M5_VI.md` Section J step-by-step
2. **Browser 2:** Sales account, stay on "Đơn hàng" tab
3. **Browser 1:** Remove `create_order` from Sales account → Save
4. **Browser 2:** Click "Thêm đơn hàng" → Should see error `MSG.PERMISSION_DENIED` immediately
   - **NOT:** 2-minute delay, **NOT:** logout-then-login required
5. **Result:** ✅ if instant, ❌ if delayed

### Scenario 2: Last Admin Cannot Be Deactivated (Section E.2)

1. Confirm Account A is the **only** active admin with `manage_users = true`
2. Strip Account A of `manage_users` → Server should reject → Account A still has permission
3. Try to deactivate Account A → Server should reject with `MSG.USER_LAST_ADMIN`
4. **Result:** ✅ if both blocks work

### Scenario 3: Config Edit Invalidates Cache (Section G)

1. Open two browser tabs (same account):
   - **Tab 1:** "Cấu hình" tab (ready to edit)
   - **Tab 2:** "Đơn hàng" tab (ready to create new order)
2. **Tab 1:** Add new status "Đã hủy" → Save
3. **Tab 2:** Create new order, open status dropdown → Should see "Đã hủy" **immediately** (not after 2 min)
4. **Result:** ✅ if instant, ❌ if delayed or missing

---

## Expected Issues & Mitigations

### Issue: New Product Defaults to Low-Stock

**Symptom:** Create product with `stockQty = 0`, `minStock = 0` → badge appears.  
**Root Cause:** 0 ≤ 0 is true, so it flags low-stock.  
**Expected:** This is documented in phase notes as intentional behavior.  
**Action:** ✅ (not a bug, mark section B box accordingly)

### Issue: Permission Change Doesn't Take Effect

**Symptom:** Change permission in Admin UI → affected user's next action still sees old permission.  
**Root Cause:** User records are cached somewhere (should NOT be — Config.gs deliberately avoids caching them).  
**Action:** Investigate `Router.gs`, `Auth.gs` for unexpected caching → remove → add assertion → re-test

### Issue: Config Edit Appears to Have No Effect (120s Wait)

**Symptom:** Edit status list → wait 2 minutes before new status appears in dropdown.  
**Root Cause:** Config is cached with TTL; `invalidateConfigCache_()` not called on admin edit.  
**Action:** Verify `Router.gs:274` calls `invalidateConfigCache_()` after admin action → add assertion → re-test

### Issue: Matrix Checkboxes Don't Fit on Phone

**Symptom:** 14 checkboxes wrap to multiple columns or overflow.  
**Root Cause:** CSS media query missing or input size too large.  
**Action:** Adjust CSS for checkbox container (use flexbox, wrap, small font) → re-test on phone

---

## After All Tests Pass (Sections A–K All ✅)

### 1. Update MILESTONES.md

**File:** `/Users/phongna/anhphongit/Projects/thientan-web/docs/MILESTONES.md`

**Line 172:** Change
```markdown
## ☐ Milestone 5 — Inventory + Admin UI
```

To:
```markdown
## ☑ Milestone 5 — Inventory + Admin UI *(done 2026-09-07)*
```

**Lines 180–185:** Check all 5 exit criteria
```markdown
- [x] Admin can create a user and set permissions without touching the Sheet
- [x] A permission change takes effect on the affected user's next action
- [x] The last active admin cannot be deactivated or stripped of `manage_users`
- [x] Product CRUD works; `OrderLines.productCode` can link to a product
- [x] The permission matrix is usable on a phone (card per user)
```

### 2. Update TASKS.md

**File:** `/Users/phongna/anhphongit/Projects/thientan-web/docs/TASKS.md`

**Lines 3016–3017:** Find M5.1 and M5.2, mark complete:
```markdown
- [x] M5.1 — Product CRUD + low-stock badge + search
- [x] M5.2 — User CRUD + permissions (preset + matrix) + protections
```

### 3. Add Progress Log Entry

**File:** `MILESTONES.md`

**Section: Progress log** (near end of file)

Add a row:
```markdown
| 2026-09-07 | 5 | **Milestone 5 signed off.** `CHECKLIST_M5_VI.md` sections A–K fully tested live on PC and phone; all 5 exit criteria satisfied. Admin can manage users/products/config without Sheets; permissions take effect immediately; last-admin protected; product lookup works; matrix responsive on phone. 943+ assertions across all offline test suites passing. |
```

### 4. Commit

```bash
cd /Users/phongna/anhphongit/Projects/thientan-web
git add docs/CHECKLIST_M5_VI.md docs/MILESTONES.md docs/TASKS.md
git commit -m "Milestone 5 signed off — live testing complete (2026-09-07)

- CHECKLIST_M5_VI.md: comprehensive Vietnamese checklist, 10 sections (A–K)
- All 5 exit criteria satisfied
- PC + phone testing verified
- Permission changes immediate, last-admin protected, product lookup working
- Offline test suites: 943+ assertions passing"
```

### 5. Next Phase

**Phase 7 (Polish + Docs)** is unblocked once M5 is signed off.

---

## Key Numbers to Track

| Item | Current | Target | Notes |
|------|---------|--------|-------|
| Offline assertions | ~943 | ≥943 + new M5 assertions | Should grow with M5 testing |
| BUILD (API) | `api-2026-09-07c-product-lookup` | Latest after deploy | Bumped by each push |
| BUILD (Web) | Latest after deploy | Matches latest | Must match API version for compatibility |
| M5 Exit Criteria | 0/5 checked | 5/5 checked | Must all be ✅ before sign-off |
| Sections Passed | 0/10 | 10/10 | A–K all ✅ on PC, F/G/K on phone |

---

## Questions for User

Before starting live testing, confirm:

1. **Three test accounts ready?** Do you have admin, sales, warehouse accounts available, or should they be created first?
2. **Real phone available?** iOS Safari or Android Chrome device ready for Sections F/G/K?
3. **Spreadsheet Products sheet created?** Run `setupMilestone5()` if not already run?
4. **Both apps deployed?** API pushed and new version published, then Web pushed and new version published?

Answer these before proceeding to live testing.

---

## Completion Summary

- ✅ `CHECKLIST_M5_VI.md` created (202 lines, 10 sections, 60+ individual test items)
- ✅ Pre-testing setup documented (setupMilestone5, deployments, multi-account requirement)
- ✅ PC testing flow documented (Sections A–J, ~2.5 hours)
- ✅ Phone testing flow documented (Sections F, G, K, ~30 min on real device)
- ✅ Common issues documented (low-stock defaults, permission caching, config caching, mobile UI)
- ✅ Sign-off process documented (MILESTONES.md update, TASKS.md update, progress log, commit)
- ⏳ **Ready for:** User to execute live testing following this guide

**Next:** Execute Sections A–K on live app; mark each ✅ or document ❌ with root cause.
