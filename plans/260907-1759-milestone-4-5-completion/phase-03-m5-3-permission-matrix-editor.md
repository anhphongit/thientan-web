# Phase 3 — M5.3 permission matrix editor

## Context links
- Task record: `docs/TASKS.md:3016` (☐), design note `TASKS.md:3036-3040`
- Deferral rationale: `docs/TASKS.md:3189-3191`, `apps/api/Config.gs:212-219`
- Spec: `docs/PERMISSIONS.md` (full key list + §4.6 admin self-protection rules)
- Exit criteria this unblocks: `docs/MILESTONES.md:181` and `:185`
- M5.2 that this extends: `docs/TASKS.md:3180+`

## Overview
- **Priority:** P2 · **Status:** pending · **Effort:** 6–8h
- **Blocked by:** Phase 1 (decision recorded only — no code dependency).
- **Blocks:** Phase 4 (same files), Phase 6 (live verification).
- Today an admin can only assign one of 4 wholesale presets. Anything finer means hand-editing the `Users` sheet's `permissions` JSON. This phase adds per-key editing.

## Key insights (verified)
- **The codebase already anticipates this phase.** `matchPresetKey_` (`Admin.gs:231`) returns `null` when permissions match no preset, and its own doc comment names 5.3 as the reason (`Admin.gs:226-229`). `ViewsAdmin.html:329` already renders that null as `'Tuỳ chỉnh'`. So custom permission sets display correctly *before* this phase — only the editor is missing.
- `actionUpdateUser_` (`Admin.gs:95`) writes `patch.permissions` **only** when `applyingPreset` is true (`Admin.gs:113`). A new payload branch is required; the existing preset branch must keep working unchanged.
- The client already models "keep current permissions" as `presetKey === ''` (`ViewsAdmin.html:494-503,575-578`). The matrix must preserve that three-way semantic: **keep** / **apply preset** / **apply explicit matrix**.
- Both self-protection guards already exist and are correctly written — **reuse, do not reimplement**:
  - `requireNotSelfRemovingAdmin_(actingUser, targetRow, resultingPermissions)` — `Admin.gs:188`
  - `requireNotStrippingLastAdmin_(targetEmail, resultingActive, resultingManageUsers)` — `Admin.gs:204`
  They are called at `Admin.gs:107-108` *before* the lock. Keep that ordering.
- `PERMISSION_KEYS` = 14 keys (`Config.gs:174-177`). `visible_fields` is a separate array, not a boolean — the matrix must treat it as its own control, not a 15th checkbox.
- `MSG.USER_SELF_REMOVE_ADMIN` (`Config.gs:460`) and `MSG.USER_LAST_ADMIN` (`Config.gs:462`) already exist. New MSG entries needed only for matrix-specific validation.
- Test files to extend: `tools/offline-tests/admin.test.js` (53 assertions), `admin-ui.test.js` (36).

## Requirements
- FR1: Admin can toggle each of the 14 `PERMISSION_KEYS` individually for a user.
- FR2: Admin can edit `visible_fields` (`['*']` = all, or an explicit column subset).
- FR3: Preset assignment still works exactly as today; presets remain the fast path.
- FR4: Both self-protection rules enforced server-side on the matrix path, identically to the preset path.
- FR5: `matchPresetKey_` labels a matrix-edited user as `Tuỳ chỉnh` (already works; assert it).
- NFR1: Usable on a phone — one card per user (`MILESTONES.md:185`), consistent with the existing card-based UI.
- NFR2: Server is the only authority. Client-side hiding of a checkbox is cosmetic.

## Architecture / data flow
```
ViewsAdmin.html  [matrix panel: 14 checkboxes + visible_fields control]
  │  three-way save intent:
  │    presetKey ''  + no permissions  → keep current   (existing behaviour)
  │    presetKey 'x' + no permissions  → apply preset   (existing behaviour)
  │    no presetKey  + permissions {}  → apply matrix   (NEW)
  ▼
Main.gs apiUpdateUser(payload)                     (:350, existing — payload grows)
  ▼
Router.gs 'updateUser' → actionUpdateUser_          (:211, existing)
  ▼
Admin.gs actionUpdateUser_  (:95)
  1. requirePermission_(user,'manage_users')                       (:96, unchanged)
  2. findUserOrThrow_ / cleanUserInput_                            (:97-98, unchanged)
  3. resolve resultingPermissions:
        applyingPreset → preset.permissions                        (existing)
        applyingMatrix → cleanPermissionMatrix_(payload.permissions)  ← NEW
        neither        → parsePermissions_(current.permissions)     (existing)
     REJECT if both presetKey and permissions supplied (ambiguous intent)  ← NEW
  4. requireNotSelfRemovingAdmin_(...)                             (:107, unchanged)
  5. requireNotStrippingLastAdmin_(...)                            (:108, unchanged)
  6. withUserLock_ → updateRecord_ patch.permissions               (:110-117)
```

**`cleanPermissionMatrix_(input)` (new helper in `Admin.gs`) contract**
- Input: arbitrary client object. Output: an object with exactly the 14 `PERMISSION_KEYS` coerced to boolean, plus a validated `visible_fields` array.
- Unknown keys **dropped**, not passed through — otherwise a crafted payload writes arbitrary JSON into the `permissions` cell.
- Missing keys default to `false` (deny-by-default, matching `DEFAULT_VISIBLE_FIELDS`'s stance at `Config.gs:181-186`).
- `visible_fields`: accept `['*']`, or a subset of the known column names; reject anything else. Empty array → falls back to `DEFAULT_VISIBLE_FIELDS` at read time (`Permissions.gs`), so allow it but surface what it means in the UI.

## Related code files
**Modify**
- `apps/api/Admin.gs` — new `cleanPermissionMatrix_`, new branch in `actionUpdateUser_` (:95) and `actionCreateUser_` (:63)
- `apps/api/Config.gs` — new `MSG` entries only (matrix validation errors); `PERMISSION_KEYS` untouched
- `apps/web/ui/ViewsAdmin.html` — matrix panel in the edit form
- `tools/offline-tests/admin.test.js`, `tools/offline-tests/admin-ui.test.js`

**Read only:** `apps/api/Permissions.gs`, `docs/PERMISSIONS.md`, `apps/api/Router.gs`

**No change:** `Router.gs` (reuses `updateUser`/`createUser`), `Main.gs` (payload passthrough already generic — verify at `:350`), `Users` sheet schema (`Config.gs:55`)

## Implementation steps
1. **Tests first.** Add failing assertions to `admin.test.js`:
   - matrix path sets each of the 14 keys independently
   - unknown key in payload is dropped, not persisted
   - `presetKey` + `permissions` together → error (ambiguous)
   - self-removal of `manage_users` via matrix → `MSG.USER_SELF_REMOVE_ADMIN`
   - stripping the last active admin via matrix → `MSG.USER_LAST_ADMIN`
   - existing preset path assertions still pass unchanged (regression)
   - `matchPresetKey_` returns `null` → response `presetKey` null for a matrix-edited user
   - `visible_fields` accepts `['*']` and a subset; rejects a non-array and unknown columns
2. Write `cleanPermissionMatrix_` in `Admin.gs` per the contract above.
3. Add the matrix branch to `actionUpdateUser_` (`Admin.gs:95`). **Insert the resolution before line 107** so both guards still see the final `resultingPermissions` — moving the guards after the lock would reintroduce the race the current ordering avoids.
4. Add the same branch to `actionCreateUser_` (`Admin.gs:63`) so a user can be created with a custom matrix directly.
5. Add matrix `MSG` entries to `Config.gs` (Vietnamese, matching the tone of `:460`/`:462`).
6. Build the `ViewsAdmin.html` panel: collapsed by default under the preset dropdown, labelled in Vietnamese, grouped by concern (đơn hàng / trạng thái & duyệt / thống kê / quản trị). Selecting a preset should populate the checkboxes as a starting point, then let the admin diverge — that is the whole point of `Tuỳ chỉnh`.
7. Wire the three-way save intent, preserving `presetKeyToSave === ''` = keep (`ViewsAdmin.html:531,575-578`).
8. Extend `admin-ui.test.js`: markup balanced/escaped, 14 checkboxes present, panel present on a narrow viewport.
9. Bump `BUILD` (`Config.gs:18`). Run all 17 suites.

## Todo
- [x] Failing assertions written first (step 1)
- [x] `cleanPermissionMatrix_` implemented with allowlist + deny-by-default
- [x] `actionUpdateUser_` matrix branch, guards still pre-lock
- [x] `actionCreateUser_` matrix branch
- [x] Vietnamese `MSG` entries added
- [x] `ViewsAdmin.html` matrix panel + three-way save intent
- [x] `admin-ui.test.js` extended (36 assertions green)
- [x] `BUILD` bumped to 'api-2026-09-07a-permission-matrix', admin tests pass (83 + 36 = 119 assertions)

## Success criteria
- An admin can grant exactly `view_orders` + `manage_inventory` and nothing else, from the UI, without opening the Sheet.
- That user's card reads `Tuỳ chỉnh`.
- Server rejects: unknown permission keys, ambiguous preset+matrix payloads, self-demotion, last-admin removal.
- All pre-existing `admin.test.js` / `admin-ui.test.js` assertions pass **unmodified** — proof the preset path did not regress.
- `MILESTONES.md:181` ("Admin can create a user and set permissions without touching the Sheet") is now truthfully satisfiable.

## Risk assessment
| Risk | L×I | Mitigation |
|---|---|---|
| **Privilege escalation** — matrix path skips a guard the preset path had | Med × **Critical** | Resolve `resultingPermissions` *before* `Admin.gs:107-108` so both existing guards run on it; dedicated assertions for both rules on the matrix path |
| Arbitrary JSON written into `permissions` cell via unknown keys | Med × **High** | `cleanPermissionMatrix_` allowlists against `PERMISSION_KEYS`; assertion for a dropped unknown key |
| Ambiguous payload (preset *and* matrix) silently picks one → admin thinks they granted X, granted Y | Med × **High** | Explicit error, not a precedence rule |
| Regression in the preset path used by M5.2 | Med × High | Existing 53+36 assertions must pass unmodified; do not edit them to fit |
| `visible_fields` set to `[]` and misread as "all" | Low × **High** | `Permissions.gs` treats empty as `DEFAULT_VISIBLE_FIELDS` (deny-ish) — assert that, and label it clearly in the UI |
| Admin locks themselves out mid-edit | Low × Med | Guards cover `manage_users`; note that removing `view_orders` from self is allowed and recoverable via the Sheet |
| 14 checkboxes unusable on a phone | Med × Med | Grouped + collapsible; verified in Phase 6 on a real device, not in emulation |

## Security considerations
- This is the highest-risk phase in the plan: it is a UI for editing the authorization model itself.
- Server-side allowlist is mandatory. Never `JSON.stringify` a client-supplied object into the `permissions` cell.
- Keep `requirePermission_(user,'manage_users')` as the literal first line (`Admin.gs:96`) — the codebase-wide convention (`Export.gs:84`, `Products.gs:55`, `Stats.gs:92` all do this).
- User records are deliberately **not cached** (`Config.gs` cache note) so a permission change bites on the next action — that is `MILESTONES.md:182`'s criterion and it already holds. Do not add caching here.
- No new permission key. `manage_users` already covers this capability.

## Next steps
→ Phase 4 (M5.4 Config editing). **Must be sequential** — Phase 4 edits the same `Admin.gs` / `ViewsAdmin.html` / `Config.gs`.
