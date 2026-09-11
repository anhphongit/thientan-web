# Phase 06 — OPTIONAL: live config refresh after save

**Owns:** `apps/web/ui/App.html`, `apps/web/ui/ViewsAdmin.html`
**Blocked by:** 05
**Effort:** 30m
**Status:** **NEEDS DECISION — do not implement without Phong's go-ahead**
**Priority:** P2 (but it is the only thing that makes checklist G pass)

## Context links

- Checklist requirement: `docs/CHECKLIST_M5_VI.md:186-206` ("Rất quan trọng:
  Các thay đổi phải xuất hiện **ngay lập tức**… không phải sau 2 phút")
- `T.config()` returns the bootstrap snapshot: `apps/web/ui/App.html:113`
- Where that snapshot is built, once per page load: `apps/web/Main.gs:95`
- Consumers: `ViewsOrders.html:192-195` (`statusList`), `:445-447`
  (`uomList`, `customerList`); `ViewsInventory.html:89-90` (`uomList`)
- Server-side invalidation that already works: `apps/api/AdminConfig.gs:211` →
  `apps/api/Router.gs:285`

## Overview

The server invalidates both cache layers on every config write. The **client**
does not: `session.config` is captured once at bootstrap
(`Main.gs:95` → `App.html`), and `T.config()` just reads it (`App.html:113`).
So after saving a new status, the Orders form keeps offering the old list until
the page is reloaded. Checklist G's three "ngay lập tức / no reload" lines cannot
pass today, and this plan's phases 01–05 do not change that.

Traced, not assumed: `ViewsOrders.html:1701` builds the status `<option>` list
from `statusList()` → `config().statusList` → `T.config()` → `session.config`.
Same for `uomList` at `:2183` and `customerList` at `:2253`.

## Key insight — the fix is 3 lines, because the reference is live

`T.config()` returns the *object* `session.config`, not a copy, and the views
call it lazily on every render (App.html's own comment at `:105-108` says this is
deliberate: "read through functions, not captured once"). So mutating that object
in place after a successful save is enough — no App.html API change strictly
required:

```js
// in ViewsAdmin.html saveConfig(), after every change succeeded
var live = T.config();
changes.forEach(function (c) { live[c.key] = c.value; });
```

The cleaner variant adds one bridge method so views do not reach into a shared
object by side effect:

```js
// App.html, inside window.TT
patchConfig: function (patch) {
  if (!session || !session.config || !patch) return;
  Object.keys(patch).forEach(function (k) { session.config[k] = patch[k]; });
}
```

**Recommendation: the bridge method.** `T.config()` is documented as a read
accessor; having one view silently write through it is the kind of thing that
becomes a "why did Inventory change?" bug in three months. One named method,
one call site, explicit intent.

## Requirements

Functional:
1. After **all** changes in a `saveConfig()` run succeed, the live session config
   reflects the saved values.
2. Switching to Orders (no reload) shows the new status / UoM / customer.
3. A partially failed save patches only the keys that actually succeeded.
4. Values patched in are the **server-validated** ones where available. The
   current `apiUpdateConfig` response is `{ok:true}` (`AdminConfig.gs:213`) and
   does not echo the validated value — so the client patches what it sent. Note
   the divergence risk: `uomList`'s validator trims strings
   (`AdminConfig.gs:69-75`) and `vatRates` coerces to Number
   (`:106-109`), so an untrimmed client value could differ from the sheet for
   one session. Mitigation options, cheapest first:
   a. patch client-side with the same trim/Number normalisation (duplicated rule — DRY violation);
   b. have `actionUpdateConfig_` return `{ok:true, value: validated}` and patch
      from the response (**preferred**, ~2 lines server-side, no duplicated rule);
   c. re-fetch bootstrap config after save (heaviest, one extra round trip).
   **Choose (b)** if any API change is acceptable in this task; otherwise (c).

Non-functional:
- No change to any view other than the bridge method.
- Cross-view blast radius: Orders, Inventory and Stats all read `T.config()`.
  This phase must be a separate, separately-revertable commit.

## Architecture

```
saveConfig() all-succeeded
  └─ T.patchConfig({ statusList: […], uomList: […] })       NEW (App.html)
       └─ session.config[key] = value                        (in place)
            └─ next ViewsOrders render reads it via T.config()   (:192)
```

## Related code files

- Modify: `apps/web/ui/App.html` — add `patchConfig` to `window.TT` (`:110-123`)
- Modify: `apps/web/ui/ViewsAdmin.html` — one call in `saveConfig()`'s success path
- Modify (only if option b): `apps/api/AdminConfig.gs:213` return the validated value
- Read: `ViewsOrders.html:192-195,445-447`, `ViewsInventory.html:89-90`

## Implementation steps

1. Decide a/b/c above. If (b), change `actionUpdateConfig_` to
   `return { ok: true, value: validated };` and extend
   `admin-config.test.js` to assert the echoed value.
2. Add `patchConfig` to the `window.TT` object literal (`App.html:110-123`),
   with a doc comment saying *why* (checklist G) and that it is the only
   sanctioned writer of `session.config`.
3. Call it from `saveConfig()`'s all-succeeded branch, before
   `silentRefreshConfig(seq)`.
4. Extend the test harness's `TT_BRIDGE` (`admin-ui.test.js:60-80`) with a
   `patchConfig` spy plus a mutable `session.config`, and add group U:
   "after a successful save, patchConfig received exactly the saved keys".
5. Manual: walk checklist G lines 186-206 end to end — add a status, switch to
   Orders **without reloading**, confirm it is in the dropdown. Repeat for
   `uomList` in Inventory and `customerList` autocomplete in Orders.

## Todo list

- [ ] a/b/c decided and recorded here
- [ ] `patchConfig` added to `window.TT` with a why-comment
- [ ] Single call site in `saveConfig()` success path
- [ ] Partial-failure case patches only succeeded keys
- [ ] Harness `TT_BRIDGE` extended; group U added
- [ ] `admin-config.test.js` updated if option (b)
- [ ] Checklist G lines 186-206 all ticked with no page reload
- [ ] Full offline suite → no FAIL

## Success criteria

1. Add "Hoàn tất sớm" → Orders → new order → status dropdown contains it, **no reload**.
2. Add "Thùng" → Inventory → new product → UoM select contains it, no reload.
3. Add a customer → Orders → customer autocomplete offers it, no reload.
4. Reload the page → all three still present (proves the sheet write, not just
   the client patch).
5. Save one key successfully then force a failure on the next → only the first
   key is reflected in the live config.

## Risk assessment

| Risk | L×I | Mitigation |
|---|---|---|
| Client patch diverges from what the sheet stored (trim / Number) | **High × Med** | Option (b) — echo the validated value; that removes the divergence entirely rather than re-implementing the validators client-side |
| Mutating shared `session.config` breaks a view mid-render | Low × Med | Patch happens in a promise callback, between renders; views read it lazily per render (`App.html:105-108` documents the intent) |
| Widest blast radius in this plan (Orders + Inventory + Stats all read it) | Med × High | Separate commit, separate revert, manual walk of all three consumer screens before shipping |
| `patchConfig` becomes a general-purpose session mutator | Med × Med | Name it `patchConfig` (not `setSession`), guard `if (!session)`, and state in the comment that config keys only |
| A stale open tab still shows the old list | High × Low | Out of scope and always true of this architecture; server TTL (`Router.gs:285` invalidation + 120s cache) bounds it |

## Security considerations

- `patchConfig` writes only into `session.config` — never `permissions`, `role`,
  or `email`. Guard the key set if there is any doubt; a view that could patch
  `session.permissions` would turn a UI convenience into a privilege-escalation
  primitive. **Explicitly enumerate config keys or shallow-assign into
  `session.config` only — never into `session`.**
- The values patched in are already server-validated (option b) or
  server-allowlisted by key (option a/c). No new trust is extended to the client:
  the API re-checks `manage_users` and the allowlist on every write
  (`AdminConfig.gs:179,185`).
- Nothing new is persisted client-side (no `localStorage`), so no new data at rest.

## Next steps

If deferred: log as a standalone task referencing `CHECKLIST_M5_VI.md:186-206`
and mark those checklist lines as known-failing rather than leaving them
ambiguous.
