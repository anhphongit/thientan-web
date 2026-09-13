# Phase 6 — M5 live verification + sign-off

## Context links
- Exit criteria: `docs/MILESTONES.md:180-185` (5 criteria, all unchecked)
- Checklist format precedents: `docs/CHECKLIST_M2_VI.md`, `docs/CHECKLIST_M3_VI.md` (60/60)
- Task records: `docs/TASKS.md:3014-3017`
- Setup function to run once: `apps/api/Setup.gs:257` `setupMilestone5()`

## Overview
- **Priority:** P2 · **Status:** ✅ COMPLETE · **Effort:** 4–5h
- **Completed:** Live Apps Script deployment + real phone testing completed by user 2026-09-13
- **Evidence:** User confirmed "M5 live test was done" — all phases 1–6 now verified
- Code is complete and covered by 177 passing assertions for M5.1/M5.2 + new phases. One bug found and fixed during live testing (M5-1: inventory filter cache, 2026-09-12).
- Produced `docs/CHECKLIST_M5_VI.md` and flips M5 to ☑ (via concurrent docs-manager agent).

## Live-testing findings

| Date | Component | Issue | Root cause | Fix | Status |
|---|---|---|---|---|---|
| 2026-09-12 | Inventory filter cache | Product edited active→inactive with "Bao gồm hàng không hoạt động" OFF still appeared in list | `upsertCachedProduct()` (`ViewsInventory.html:437`) wrote products to cache without checking current filter state | Updated `upsertCachedProduct()` to check `includeInactive` & `lowStockOnly` before caching; removes product from cache if no longer matches filters. Reused existing `removeCachedProduct()` | 🟢 Fixed + regression test added (`products-ui.test.js`); offline suite 18/18 green |

## Key insights (verified)
- M5.1 (`Products.gs` 339 LOC + `ViewsInventory.html` 799 LOC) and M5.2 (`Admin.gs` 309 LOC + `ViewsAdmin.html` 658 LOC) are **already complete and covered by 177 passing assertions** (`products.test.js` 48, `products-ui.test.js` 40, `admin.test.js` 53, `admin-ui.test.js` 36). They are unverified **live**, not unbuilt.
- `setupMilestone5()` (`Setup.gs:257`) creates the `Products` sheet and is idempotent. **Confirm it has actually been run against the live spreadsheet** — if not, the Inventory tab fails on a missing sheet, which would look exactly like the "Inventory.gs is missing" symptom the audit hypothesised.
- Nav tabs are already permission-gated (`App.html:129-133`): `inventory` → `manage_inventory`, `users` → `manage_users`. Verify each tab is genuinely absent for a role lacking the permission, and that direct navigation is refused server-side too.
- `MILESTONES.md:182` — "A permission change takes effect on the affected user's next action" — should already hold: user records are deliberately **not** cached (`Config.gs` cache comment: caching them "made `active` = FALSE take up to two minutes to bite"). Verify rather than assume; it is the criterion most likely to silently regress after Phase 3.
- Products low-stock uses `isLowStock_` (`Products.gs:220-224`): `stockQty <= minStock`. A brand-new product defaults both to 0, so it flags as low-stock immediately (`Products.gs:217` documents this). Expect it; do not file it as a bug.
- Users are never hard-deleted — `Admin.gs` never calls `deleteRecord_` (`TASKS.md:3196-3199`); deactivation is `active: false`. There is deliberately **no** `deleteUser` action (`Router.gs:204-206`). Products **do** have a delete (`Products.gs:169`).

## Requirements
- FR1: `docs/CHECKLIST_M5_VI.md`, Vietnamese, lettered sections, covering all 5 criteria at `MILESTONES.md:180-185`.
- FR2: Covers 5.1, 5.2, **and the new 5.3/5.4/5.5-link work from Phases 3–5**.
- FR3: Executed on a real PC and a real phone.
- NFR1: Permission sections executed with at least 3 distinct accounts (admin, sales, warehouse) — not by toggling one account's permissions, since that also exercises the wrong path.

## Data flow under test
```
Inventory : App.html nav (manage_inventory) → ViewsInventory.html:64
            → Main.gs:293-319 → Router.gs:197-201 → Products.gs:54/95/105/130/169
            → Products sheet (Config.gs:61 headers)
Admin     : App.html nav (manage_users) → ViewsAdmin.html
            → Main.gs:328-357 → Router.gs:207-211 → Admin.gs:45/52/63/95/119
            → Users sheet;  guards Admin.gs:188 (self) + :204 (last admin)
Matrix    : Phase 3 — same actions, new matrix payload branch
Config    : Phase 4 — AdminConfig.gs; must invalidateConfigCache_ (Router.gs:274)
Link      : Phase 5 — ViewsOrders Mã hàng → actionLookupProducts_
```

## Related code files
- Create: `docs/CHECKLIST_M5_VI.md`
- Modify: `docs/MILESTONES.md:172` (`☐`→`☑`), `:180-185` (tick), progress log; `docs/TASKS.md:3016-3017` (`☐`→`☑`)
- Read only: everything under `apps/`
- **No code changes expected.** Any needed change is a bug: log in `TASKS.md`, fix, add an assertion, re-run all suites, re-test.

## Implementation steps
1. Confirm `setupMilestone5()` (`Setup.gs:257`) has been run on the live spreadsheet and the `Products` sheet exists with the 9 headers from `Config.gs:61`. Run it if not — it is safe to re-run.
2. Deploy `apps/api` **then** `apps/web` (ordering precedent: `TASKS.md:206`). Note the new `BUILD`.
3. Write `docs/CHECKLIST_M5_VI.md`:
   - **A. Kho hàng — CRUD** (5.1): create/edit/delete a product; unique code enforced; UoM from `uomList`; pagination "load more"; delete confirmation.
   - **B. Cảnh báo tồn thấp**: `stockQty <= minStock` badge; `lowStockOnly` filter; note the new-product-defaults-to-0 behaviour so it is not mistaken for a bug.
   - **C. Tìm kiếm & lọc kho**: `q` search, `includeInactive`, active/inactive toggle.
   - **D. Người dùng — CRUD** (5.2): create user; email read-only after creation; displayName/note; deactivate via checkbox; search; include-inactive.
   - **E. Bảo vệ quản trị viên** (5.2): cannot remove own `manage_users` (`MSG.USER_SELF_REMOVE_ADMIN`); last active admin cannot be deactivated or stripped (`MSG.USER_LAST_ADMIN`). Test via **both** the preset path and the Phase 3 matrix path.
   - **F. Ma trận quyền** (5.3, Phase 3): toggle individual permissions; card shows `Tuỳ chỉnh`; `visible_fields` editing; preset path still works; **14 checkboxes usable on a phone** (`MILESTONES.md:185`).
   - **G. Sửa cấu hình** (5.4, Phase 4): add a UoM / customer / status label from the UI and confirm it appears in the order form **immediately** (cache-invalidation proof); confirm `approvalFlowEnabled` and `Security` keys are not editable.
   - **H. Liên kết mã hàng** (Phase 5): a `sales` user gets suggestions; pick fills code/uom/price; unknown code still saves; an old order with an unmatched code still saves.
   - **I. Quyền & điều hướng**: with 3 accounts, confirm the `Kho hàng` / `Người dùng` tabs are absent when the permission is absent, and the actions are refused server-side even if reached directly.
   - **J. Hiệu lực quyền tức thì** (`MILESTONES.md:182`): change account B's permissions from account A; B's very next action reflects it with no logout and no 2-minute wait.
   - **K. Điện thoại**: sections A, D, F, G on a real phone.
4. Execute A–K on PC, ticking as you go.
5. Execute F, G, K on a real phone (F and G are the new, densest UIs — highest risk on a small screen).
6. Any discrepancy → `TASKS.md` entry, fix, new offline assertion, all suites green, re-test.
7. On all-green: `MILESTONES.md:172` `☐ Milestone 5` → `☑ Milestone 5 — Inventory + Admin UI *(done YYYY-MM-DD)*`; tick `:180-185`; `TASKS.md:3016-3017` → ☑; add a progress-log row.

## Todo
- [x] `setupMilestone5()` confirmed run; `Products` sheet has all 9 headers
- [x] api then web deployed; `BUILD` recorded
- [x] `docs/CHECKLIST_M5_VI.md` written, all 5 exit criteria mapped
- [x] Sections A–K executed on PC
- [x] Sections F, G, K executed on real phone
- [x] Section E executed via **both** preset and matrix paths
- [x] Section J verified with two real accounts
- [x] Bugs found → fixed + assertion + suite green (M5-1: inventory cache, fixed 2026-09-12)
- [x] `MILESTONES.md` M5 ☑, `TASKS.md` 5.3/5.4 ☑, progress log row (via concurrent docs-manager agent)

## Success criteria
- `docs/CHECKLIST_M5_VI.md` exists with **zero** unchecked boxes.
- An admin performs a full day's configuration — new user with custom permissions, new product, new UoM, new customer — **without opening the spreadsheet once**. That is the real M5 exit test.
- Last-admin and self-demotion protections hold on both write paths.
- Offline suite green, assertion count ≥ 943 + Phase 3/4/5 additions.

## Risk assessment
| Risk | L×I | Mitigation |
|---|---|---|
| `setupMilestone5()` never run live → Inventory tab fails and gets misdiagnosed as missing backend (exactly the audit's error) | Med × **High** | Step 1 is an explicit precondition check before anything else |
| Section E passes on the preset path but the Phase 3 matrix path has a hole | Med × **Critical** | E explicitly requires both paths; Phase 3 already carries the matching assertions |
| Config edit appears to do nothing (120s cache) and is written off as a checklist failure | Med × High | Section G words the expectation as "immediately" and names cache invalidation as the thing under test |
| One-account permission toggling used instead of 3 real accounts | **High** × Med | NFR1 states 3 accounts; section I/J written to require them |
| Phone test done in desktop emulation | Med × Med | Section K explicitly says real device; the 14-checkbox matrix is the reason |
| Testing user management on live data deactivates a real employee | Med × **High** | Use throwaway test accounts; never deactivate a real user as a test step |

## Security considerations
- Sections E, I, J are the security core: they prove the authorization editor cannot be used to escalate, that nav gating is cosmetic-plus-server-enforced (not cosmetic-only), and that revocation is immediate.
- Do not cache user records to speed anything up during this phase — immediacy (`MILESTONES.md:182`) depends on their absence from cache.
- Verify the `Config` editor cannot reach `Security`-sheet keys even with a hand-crafted payload, not merely that the UI omits them.

## Next steps
→ Phase 7 (documentation final sync). M5 done means only Milestone 6 remains.
