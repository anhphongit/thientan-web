# Phase 4 — M5.4 Config sheet editing from the Admin UI

## Context links
- Task record: `docs/TASKS.md:3017` (☐), rationale `TASKS.md:3041-3043`
- Config seed rows: `apps/api/Config.gs:322-375` (`CONFIG_DEFAULTS`)
- Config read + cache: `apps/api/Router.gs:248-277`
- Sheet headers: `apps/api/Config.gs:57` (`Config: ['key','value','description']`)
- Security sheet keys (must stay out of reach): `apps/api/Config.gs:156-161`

## Overview
- **Priority:** P2 · **Status:** pending · **Effort:** 5–7h
- **Blocked by:** **Phase 3** — shares `Admin.gs`, `ViewsAdmin.html`, `Router.gs`, `Config.gs`, `Main.gs`. Never run these two in parallel.
- **Blocks:** Phase 6.
- Goal per `TASKS.md:3041-3043`: "the last piece needed so an admin never has to open the Sheet directly for day-to-day configuration."

## Key insights (verified)
- **The Config sheet is cached with a 120s TTL** (`CACHE.TTL_SECONDS = 120`, `Config.gs:298`; read path `Router.gs:248-271`). A write that does not invalidate means an admin changes `statusList`, sees no effect for up to two minutes, and assumes the feature is broken. **`invalidateConfigCache_()` already exists at `Router.gs:274` — call it.** This exact class of bug already bit the project once with user caching (`Config.gs` cache note: "caching them made `active` = FALSE take up to two minutes to bite").
- `readPublicConfig_` auto-parses any value starting with `[` or `{` as JSON (`Router.gs:261-268`), falling back to the raw string on parse failure. So writing malformed JSON into `statusList` does not throw — it silently yields a **string** where every reader expects an **array**. Validation must happen on write; there is no safety net on read.
- The Config sheet mixes harmless display vocabulary with **behavioural flags**. Not all keys are equally safe:
  - Safe / intended (`TASKS.md:3041`): `statusList` (`Config.gs:322`), `uomList` (`:334`), `customerList` (`:338`), `vatRates` (`:336`), `currency` (`:340`)
  - Dangerous: `approvalFlowEnabled` (`:346`) flips the whole M3 approval state machine; `approveStatusList` (`:349`) is consumed by the `approveStatus` state machine — editing it can orphan existing order rows; `exportLargeThreshold` (`:366`) / `exportRetentionDays` (`:374`) are operational tuning
  - Out of scope entirely: the `Security` sheet (`Config.gs:156-161`) — `status`, `secretFingerprint`, `expiresAt`. `secretFingerprint` is explicitly marked "không sửa tay" (do not hand-edit). This sheet must not be reachable from this UI at all.
- `statusList` values are referenced by `Orders.status` rows already written (`DATA_MODEL.md` §2: "a `key` from `Config.statusList`"). **Renaming or deleting a status key orphans existing orders.** Editing a label is safe; editing a key is not.
- `readPublicConfig_`'s own doc comment (`Router.gs:247`) says "Display vocabulary only — no business or user data", which is the right scope boundary for this phase.
- No `Config`-editing action exists in the registry (`Router.gs:143-211`); `SHEETS.CONFIG` is only read. This is all-new surface.

## Requirements
- FR1: Admin can view and edit an **allowlisted** set of Config keys from `ViewsAdmin.html`.
- FR2: Every write validates shape before persisting (arrays stay arrays, numbers stay numbers).
- FR3: Every successful write calls `invalidateConfigCache_()`.
- FR4: `statusList` / `approveStatusList` **key** edits are add-or-relabel only. No key rename, no key delete.
- FR5: `Security`-sheet keys are unreachable. `approvalFlowEnabled` excluded from this phase (defer; it needs its own migration-aware flow).
- NFR1: Gated on `manage_users`. No new permission key.
- NFR2: Phone-usable, card-based, Vietnamese.

## Architecture / data flow
```
ViewsAdmin.html  ["Cấu hình" tab/section]
  ▼
Main.gs  apiListConfig()  /  apiUpdateConfig(payload)         ← NEW pass-throughs
  ▼
Router.gs registry:  listConfig  → actionListConfig_          ← NEW
                     updateConfig → actionUpdateConfig_        ← NEW
  ▼
AdminConfig.gs (NEW FILE — keeps Admin.gs off the 200-line-per-concern path;
                Admin.gs is already 309 LOC)
  actionListConfig_(user):
      requirePermission_(user,'manage_users')
      readAll_(SHEETS.CONFIG) → filter to EDITABLE_CONFIG_KEYS → {key,value,description,type}
  actionUpdateConfig_(user,payload):
      requirePermission_(user,'manage_users')          // literal first line
      assertEditableConfigKey_(payload.key)            // allowlist, else throw
      value = validateConfigValue_(payload.key, payload.value)   // per-key shape
      assertNoStatusKeyRemoval_(payload.key, value)    // orphan guard
      withConfigLock_(function(){
        updateRecord_(SHEETS.CONFIG, row, { value: serialize(value) })
        // updateRecord_ calls invalidateReadCache_(SHEETS.CONFIG) itself (SheetsRepo.gs:167)
        invalidateConfigCache_()      // ← the script-cache layer, SEPARATE. Router.gs:274
      })
```

**Two cache layers, both must be cleared.** `invalidateReadCache_` (`SheetsRepo.gs:43`, per-request sheet read cache, called automatically by `updateRecord_` at `SheetsRepo.gs:167`) is **not** the same as `invalidateConfigCache_` (`Router.gs:274`, the 120s script cache holding the parsed config object). Missing the second is the headline failure mode of this phase.

**`EDITABLE_CONFIG_KEYS` (Phase 4 scope)**
| Key | Type | Validation |
|---|---|---|
| `statusList` | array | non-empty; add/relabel only; no key removal |
| `uomList` | array of string | non-empty; trimmed; deduped |
| `customerList` | array of string | may be empty; trimmed; deduped |
| `vatRates` | array of number | each `0 ≤ r ≤ 1`; non-empty |
| `currency` | string | non-empty, short |

Deliberately excluded: `approvalFlowEnabled`, `approveStatusList`, `exportLargeThreshold`, `exportRetentionDays`, everything on the `Security` sheet.

## Related code files
**Create**
- `apps/api/AdminConfig.gs` — actions + allowlist + validators + lock
- `tools/offline-tests/admin-config.test.js`
- `tools/offline-tests/admin-config-ui.test.js` (or extend `admin-ui.test.js`)

**Modify**
- `apps/api/Router.gs` — 2 registry entries (`~:211`)
- `apps/web/Main.gs` — 2 pass-throughs (after `:357`)
- `apps/web/ui/ViewsAdmin.html` — config section
- `apps/api/Config.gs` — Vietnamese `MSG` entries; `BUILD` bump (`:18`)

**Read only:** `apps/api/Router.gs:248-277`, `apps/api/SheetsRepo.gs`, `docs/DATA_MODEL.md`

## Implementation steps
1. **Tests first** in `admin-config.test.js`:
   - a non-allowlisted key (`approvalFlowEnabled`, `secretFingerprint`, `exportLargeThreshold`) is **rejected**
   - malformed JSON for `statusList` is rejected, not silently stored as a string
   - `vatRates` rejects `1.5`, `-0.1`, `"0.1"`, `[]`
   - `uomList` dedupes and trims
   - removing an existing `statusList` key is rejected; relabelling it and appending a new one succeed
   - a write invalidates the config cache (stub `CacheService` in the harness; assert `remove(CACHE.CONFIG_KEY)` was called)
   - a user without `manage_users` is refused on both actions
2. Create `apps/api/AdminConfig.gs`. Keep `requirePermission_(user,'manage_users')` as the literal first line of both actions, matching `Admin.gs:46`, `Products.gs:55`, `Export.gs:84`.
3. Implement `EDITABLE_CONFIG_KEYS` + `validateConfigValue_` per the table. Serialize arrays with `JSON.stringify` so `readPublicConfig_`'s `[`-prefix parse (`Router.gs:261`) round-trips.
4. Implement `assertNoStatusKeyRemoval_`: read the current `statusList` keys, require the new list to be a superset. Labels free to change.
5. Add `withConfigLock_` mirroring `withUserLock_` (`Admin.gs:301`) / `withProductLock_` (`Products.gs:331`) — do not invent a new locking style.
6. Call `invalidateConfigCache_()` inside the lock, after `updateRecord_`. **Do not rely on `updateRecord_`'s own `invalidateReadCache_`** — different layer.
7. Register both actions in `Router.gs`; add the two `Main.gs` pass-throughs following the shape of `apiListUsers` (`Main.gs:328`).
8. Build the `ViewsAdmin.html` section: list editors for `statusList`/`uomList`/`customerList`/`vatRates`, plain input for `currency`. Show each key's `description` cell as help text — it is already written in Vietnamese (`Config.gs:322-375`).
9. Bump `BUILD`. Run all 17+ suites.

## Todo
- [ ] Failing assertions written first
- [ ] `AdminConfig.gs` created, both actions permission-gated on line 1
- [ ] `EDITABLE_CONFIG_KEYS` allowlist + per-key validators
- [ ] `statusList` key-removal guard
- [ ] `withConfigLock_` following existing lock pattern
- [ ] `invalidateConfigCache_()` called on every successful write
- [ ] `Router.gs` + `Main.gs` wiring
- [ ] `ViewsAdmin.html` config section with Vietnamese help text
- [ ] `BUILD` bumped, all suites green

## Success criteria
- Admin adds a UoM and a customer from the UI; both appear in the order form **immediately** (not after 2 minutes) — this is the cache-invalidation proof.
- Attempting to edit `approvalFlowEnabled` or any `Security` key from this UI is impossible (not present in UI, and rejected server-side even with a crafted payload).
- Malformed `statusList` cannot be persisted.
- Existing orders keep resolving their status labels after a `statusList` relabel.
- `MILESTONES.md:176` scope item "`Config` sheet editing (status list, UoM list, customer list)" satisfied.

## Risk assessment
| Risk | L×I | Mitigation |
|---|---|---|
| **Config edit doesn't take effect for 120s** → looks broken, gets "fixed" by removing caching | **High** × High | `invalidateConfigCache_()` (`Router.gs:274`) on every write; a dedicated assertion; success criterion is worded as "immediately" |
| Malformed JSON stored → readers get a string where they expect an array, app-wide breakage with no exception | Med × **Critical** | Validate on write (`readPublicConfig_` has no safety net — it swallows the parse error at `Router.gs:266-268`) |
| Status key deleted/renamed → existing orders orphaned | Med × **High** | Superset-only guard; relabel allowed, key removal refused |
| `Security`-sheet key exposed → app-wide lockout or secret damage | Low × **Critical** | Allowlist, not denylist. `SHEETS.CONFIG` only; the `Security` sheet is a different sheet and is never read by these actions |
| `approvalFlowEnabled` toggled without running `migrateAddApproveStatus()` | Low × High | Excluded from scope this phase; document as a deliberate omission |
| Concurrent admin edits clobber each other | Low × Med | `withConfigLock_`, same as users/products |
| `AdminConfig.gs` grows past the 200-line guidance | Med × Low | Validators are small and table-driven; split validators into a helper file if it crosses ~200 LOC |

## Security considerations
- **Allowlist, never denylist.** A denylist means the next Config key added by any future task is editable by default.
- The `Config` sheet is display vocabulary (`Router.gs:247`); the `Security` sheet is credentials. Only the former is in scope. Never add a `SHEETS.SECURITY` read to this file.
- `manage_users` is the correct gate — it is already the "can change how the system behaves for others" permission. No new key (YAGNI).
- Config is served to every client via `readPublicConfig_`, so anything writable here is effectively world-readable to all authenticated employees. Nothing secret may become editable here.

## Next steps
→ Phase 5 (productCode link) and Phase 6 (M5 verification). Phase 5 may start once Phase 4 releases `Config.gs`.
