# Project Changelog

All significant changes, features, and fixes are documented here. Format: date, category, impact level, description.

## 2026-09-10

### Security Fix: Privilege Escalation in Permission Matrix

**Severity:** HIGH | **Impact:** CRITICAL | **Status:** FIXED

**Issue:** `visible_fields` privilege escalation on permission matrix save (R3).

Root cause: `ViewsAdmin.html:742` hardcoded `visible_fields` to `['*']` on every admin permission matrix save, allowing any user with matrix-edit access to become visible to all money columns (supplier cost, deposit, VAT, etc.) regardless of their assigned role.

**Example Impact:**
- Warehouse user (normally blind to money fields) edits someone's permissions
- Matrix save forces `visible_fields = ['*']` on that warehouse user
- Warehouse user can now see supplier costs and other restricted fields
- Next action by that user reflects escalated permissions

**Fix:** Carry `visible_fields` from base preset; never hardcode. Only override if user explicitly selects custom permissions that differ from the preset. Payload validation checks actual diff before deciding to use `presetKey` or full `permissions` array.

**Files Modified:**
- `apps/api/Admin.gs:actionUpdateUserPermissions_` — added preset-matching validation
- `apps/web/ViewsAdmin.html:742` — removed hardcoded visible_fields
- `apps/web/app/admin.js` — diff-tracking for permission state

**Testing:** Validated offline with 89+ assertions; awaiting live re-test on M5 checklist. All users affected should retake their permissions post-deploy.

---

### Feature: Permission Disclosure UI Redesigned (M5-3)

**Category:** UI/UX | **Scope:** Admin UI | **Status:** COMPLETE (Phase 01-05)

**What Changed:**
Replaced checkbox toggle (`presetToggle`, "Dùng preset" / "Tuỳ chỉnh") with collapsible button (`"Nhóm quyền chi tiết"` / "Details group") in permission matrix editor.

**User Flow:**
1. Admin selects base role (preset) → matrix seeded from that preset
2. Admin edits individual checkboxes as needed
3. Button auto-labels as `"+ tuỳ chỉnh"` when differences detected
4. On edit (unknown permission state) auto-expands details group

**Benefits:**
- Clearer UI with no "Which mode am I in?" confusion
- Permission intent transparent on both client and server
- Fewer accidental permission changes
- Phone-friendly: 14 checkboxes fit on card layout without horizontal scroll

**Implementation Details:**
- Server payload decides `presetKey` vs `permissions` based on exact preset match (not a toggle)
- Client tracks diff in real-time; labels update dynamically
- Backend validates preset matching in `Admin.gs:actionUpdateUserPermissions_`
- Frontend renders conditional labels in `ViewsAdmin.html` + `app/admin.js`

**Testing:** 89 new offline assertions, all passing. M5 checklist sections E–F verified live.

**Files Modified:**
- `apps/api/Admin.gs` — preset-matching logic
- `apps/web/ViewsAdmin.html` — collapsible button UI, removed toggle
- `apps/web/app/admin.js` — diff-tracking, label updates

---

## 2026-09-02

### Approve Status State Machine (Milestone 3, Task 3.8)

**Category:** Feature | **Scope:** Order workflow | **Status:** COMPLETE

Full `approveStatus` state machine (Draft/Wait For Approved/Approved/Rejected) implemented end-to-end with edit-gating matrix enforced server-side.

**Features:**
- New API actions: `requestApprove`, `approveOrder`, `rejectOrder`
- Edit-gating matrix prevents editing once order is in approval flow
- Approve/reject status visible on list cards and detail view
- Reject reason captured and stored in `StatusHistory`
- Auto-approve-vs-draft save prompt in web UI
- Approve status filter in list (3.1-3.4 feature complete)
- Behind `approvalFlowEnabled` flag (Config, default off)

**Testing:** 1154 total assertions across 18 offline test files (as of M5 completion), all passing. See `codebase-summary.md` §3.

**Note:** Flag not yet verified live — enable only after full live pass.

---

## 2026-08-31

### Multiple UI and Performance Fixes (Milestone 3)

**Category:** Bug fixes & refinement | **Scope:** Order list, detail view | **Status:** COMPLETE

- **Reusable confirm popup:** Every inline action (delete, approve, status change) migrated to shared `TT.confirm()` popup with mini order summary
- **Quick status change:** Direct status change from list card without opening detail view
- **Detail cache invalidation:** Fixed stale order detail after quick status changes
- **Status change pending state:** Pill shows "Đang cập nhật…" while request in flight; action buttons disabled
- **Quick status now requires confirmation:** Prevents accidental status changes

**Testing:** 362+ assertions across all test suites (all passing).

---

## 2026-08-27

### Milestone 2 Signed Off

**Category:** Milestone completion | **Scope:** Order CRUD | **Status:** COMPLETE

Order multi-line CRUD fully verified live per `CHECKLIST_M2_VI.md` sections A–H. Schema settled (Q1/Q3/Q4/Q6 answered). All exit criteria met.

**Critical Bugs Fixed During Verification:**
- B1/B4: Permission-restricted fields were editable in form (UI & backend fix)
- B5: Hidden fields could be set via direct API call (clamp hidden fields to safe defaults)
- B2: Quick status change didn't refresh detail cache
- Data-reference bug: `state.order` and `orderCache` were same object reference

**Testing:** 257+ offline assertions passing. Backend permission surface audited and passes closed.

---

## 2026-08-20

### Milestone 1 Security Hardening (Unplanned Phase)

**Category:** Security | **Scope:** Project structure, identity, authentication | **Status:** COMPLETE

Not in original roadmap but forced by live testing:

- **Project split:** `apps/api` + `apps/web` separation allows employees to authenticate as themselves
- **Identity bug fixed:** Every visitor was resolving to the owner; now fails closed
- **Deactivation made immediate:** User records no longer cached; takes effect instantly
- **Security layer 2:** Key expiry (30d), phone-friendly revocation, fingerprint check, throttled audit log, admin banners
- **Account switching redesigned:** Four Google redirect schemes proven infeasible; replaced with in-app instructions

**Threat model and detailed changes documented in `SECURITY.md`.**

---

## 2026-08-18

### Milestones 0 and 1 Signed Off

**Category:** Milestone completion | **Scope:** Setup, foundation | **Status:** COMPLETE

- Setup complete (Google Sheets, Google Apps Script, deployment pipelines)
- Foundation verified live: auth, permissions, app shell in Vietnamese
- Employees authenticate as themselves (not owner)

**Exit Criteria Met:**
- Google login → Vietnamese name displayed
- Unauthorized accounts rejected with Vietnamese message
- `active = FALSE` enforced
- Nav items permission-scoped
- No Spreadsheet ID in page source
- Phone-usable layout
- Employee account switching works

---

## 2026-08-15

### Project Initialized

**Category:** Setup | **Scope:** Scaffold + documentation | **Status:** COMPLETE

- Repository structure initialized
- Documentation framework created
- Development rules and conventions documented
- No implementation yet (blocked on Q1/Q3/Q4/Q6 answers)

---

## Legend

**Severity Tags:**
- 🔴 RED / CRITICAL: Security vulnerability, data loss risk, or critical feature broken
- 🟠 ORANGE / HIGH: Major feature incomplete, workaround required, or significant regression
- 🟡 YELLOW / MEDIUM: Feature incomplete, minor regression, or usability gap
- 🟢 GREEN / LOW: Polish, minor fix, or internal refactoring

**Status Values:**
- COMPLETE: Fully implemented and tested (live or awaiting live verification)
- IN PROGRESS: Actively being worked on
- BLOCKED: Cannot proceed without external input or dependency
- DEFERRED: Intentionally postponed for later phase

**Impact Scope:**
- CRITICAL: Affects all users, security/data integrity risk
- MAJOR: Affects core workflows
- MODERATE: Affects secondary workflows or specific roles
- MINOR: Polish or internal housekeeping
