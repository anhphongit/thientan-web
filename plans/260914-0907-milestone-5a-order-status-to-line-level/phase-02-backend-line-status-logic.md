---
phase: 2
title: "Backend line-status logic"
status: pending
priority: P1
effort: 6h
dependencies: [1]
---

# Phase 2: Backend line-status logic

# Overview

The heart of the change, almost entirely inside `apps/api/Orders.gs` (1649 lines). Three
movements:

1. **Remove** order-level business status from create / update / delete / validate / clamp.
2. **Add** optional line-level status to line validation, line record building, and the
   hidden-field clamp.
3. **Re-scope** the audit trail (`appendStatusHistory_`/`historyField_` gain `lineId`) and
   replace `actionChangeStatus_` with a line-scoped equivalent.

`approveStatus` and everything around it (`approvalFlowEnabled_`, `canEditForApproveStatus_`,
`approveActionFlags_`, `actionApproveOrder_`, `actionRejectOrder_`, …) is **out of scope and
must not be touched**.

**Priority P1.** Largest single-file blast radius in the plan.

## Requirements

**Functional**
- A line may be created/saved with a blank status. Blank is valid, not defaulted.
- A non-blank line status must be a known key from `Config.statusList`, else reject with
  `MSG.ORDER_BAD_STATUS`.
- Changing a line's status requires the `change_status` permission (meaning re-scoped from
  order to line). Ownership rules (`mayAct_`, Orders.gs:1201-1205) unchanged.
- Every line status transition writes one `StatusHistory` row carrying `orderId`, `lineId`,
  `oldStatus`, `newStatus`, `note`, `changedBy`, `changedAt`, `field='status'`.
- Order create/update/delete write **no** business-status history rows any more.
- `visible_fields` exclusion of `status`/`statusNote` must make the line fields both
  invisible *and* unsettable (the 2026-08-27 security-review invariant, Orders.gs:1233-1247).

**Non-functional**
- No new files. `Orders.gs` is already 1649 lines; this phase should be net-neutral or
  net-negative on line count (more is removed than added).

## Architecture

### Current control flow (verified 2026-09-14)

```
actionCreateOrder_ (352)
  └─ validateOrderPayload_ (1279)   ← reads raw.status, defaults via defaultStatus_ (L1290)
       └─ validateLine_ (1319)      ← per line; NO status today
  └─ clampHiddenOrderFields_ (1248) ← clamps order statusNote (L1255)
       └─ clampHiddenLineFields_ (1261) ← per line (called at 1257)
  └─ appendRecord_(ORDERS, {... status, statusNote ...}) (394-425)
  └─ appendStatusHistory_(orderId,'',clean.status,'Tạo đơn hàng',user,'status') (429)
```

Note the ordering: **validate first, clamp second.** `clampHiddenLineFields_` therefore
operates on the object `validateLine_` already produced — that is where the line status clamp
belongs, consistent with how `note`/`invoiceNo` are handled today (Orders.gs:1266-1272).

```
actionUpdateOrder_ (≈560)
  └─ previousStatus = row.status (580); if changed → requirePermission_ change_status (582-584)
  └─ per-line loop (637-680): matched line → lineFieldsHidden preserve (630-649)
                              new line     → clampHiddenLineFields_ (673)
  └─ updateRecord_(ORDERS, {... status (699), statusNote (700) ...})
  └─ appendStatusHistory_(... 'status') (722-725)

actionDeleteOrder_ (745) └─ appendStatusHistory_(current.status,'deleted',…,'status') (759-760)
actionChangeStatus_ (777) └─ order-scoped quick change, registered in Router.gs:151
```

### Target control flow

- `validateLine_` returns `status` (blank or a known key) and `statusNote`.
- `clampHiddenLineFields_` blanks both when `fieldVisible_` says so.
- `actionUpdateOrder_`'s matched-line branch preserves stored line status when hidden
  (extend the `lineFieldsHidden` map at 630-635 with a `status` entry) and requires
  `change_status` **only when a line's status actually changes**.
- `actionChangeStatus_` is deleted outright, no replacement (A6) — `Router.gs:151`'s
  `changeStatus` route is removed.

### Assumption A3 — new lines default to blank, not `defaultStatus_`

`defaultStatus_`/`isKnownStatus_` (Orders.gs:1622-1630) currently supply a default because the
order status was *required*. Line status is explicitly optional, so the default disappears:
`defaultStatus_` is **deleted**, `isKnownStatus_` is **kept** and reused for line validation.
Rationale: YAGNI — a default would silently stamp every line, which contradicts "a line can be
saved with blank status".

### Assumption A4 — line status history is written by the order-update path too

`actionUpdateOrder_` can change many line statuses in one save. Each changed line gets its own
history row inside the existing `withOrderLock_` block, compared against the **re-read**
`byId[...]` values (the in-lock `existing` array at 617-619), matching the existing discipline
of comparing against fresh data inside the lock (see the comment at 726-728).

### Assumption A5 — deleting an order writes no line-status history

`actionDeleteOrder_` currently logs one `'deleted'` row. Writing one per line would be N rows
of noise for an object that no longer exists. Drop the business-status history write from
delete entirely (KISS). The order's disappearance is already implicit in the sheet.

### Assumption A6 — no standalone change-status endpoint at all (confirmed by project owner 2026-09-14)

The user confirmed line status is editable **only through the normal order-edit form** — no
separate quick-change control anywhere (Phase 4). With no client ever calling a standalone
endpoint, building `actionChangeLineStatus_` would be dead code (YAGNI, "no half-finished
implementations"). So `actionChangeStatus_` (777-812) is **deleted outright, not replaced**.
Every line-status write — create, update, or a lone status flip — goes through
`actionUpdateOrder_`'s existing line loop (step 10 below), which already runs inside
`withOrderLock_` and already re-reads fresh data before comparing.

## Related Code Files

**Modify — `apps/api/Orders.gs`** (line numbers verified 2026-09-14)

| Lines | Function | Action |
|---|---|---|
| 142, 173-175 | `listPayload`/filter build | Remove `statusFilter` and its `fieldVisible_(user,'status')` gate |
| 328 | `listCardView_` | Remove `view.canChangeStatus` |
| 389-391, 394-425 | `actionCreateOrder_` | Remove `status`/`statusNote` from the `appendRecord_` object |
| 429 | `actionCreateOrder_` | Remove the order-status history write (keep the `bornApproved` approveStatus write at 433-435) |
| 580-584 | `actionUpdateOrder_` | Remove `previousStatus` + the order-level `change_status` gate |
| 630-635 | `lineFieldsHidden` | Add `status: !fieldVisible_(user,'status')` |
| 645-649 | matched-line preserve | Preserve `input.status`/`input.statusNote` from `match` when hidden |
| 651-663 | matched-line write | Detect status change vs `match.status`; require `change_status`; queue a history row |
| 699-700 | `updateRecord_(ORDERS,…)` | Remove the `status` and `statusNote` keys |
| 722-725 | update history | Remove the order-status history write (keep approveStatus at 729-733) |
| 759-760 | `actionDeleteOrder_` | Remove the status history write (A5) |
| 777-812 | `actionChangeStatus_` | **Delete outright** — no replacement endpoint (A6) |
| 1025 | `buildOrderResponse_` | Remove `order.canChangeStatus`; expose it per line instead |
| 998-1011 | `buildOrderResponse_` line map | `status`/`statusNote` already flow through `filterVisibleFields_` (1008) — verify no extra work needed |
| 1248-1258 | `clampHiddenOrderFields_` | Remove the `statusNote` clamp (1255) |
| 1261-1273 | `clampHiddenLineFields_` | Add `status`/`statusNote` clamp |
| 1290-1291, 1310-1311 | `validateOrderPayload_` | Remove order status validation + both return keys |
| 1319-1356 | `validateLine_` | Add optional status validation + return `status`/`statusNote` |
| 1362-1383 | `buildLineRecord_` | Add `status`/`statusNote` to the returned record |
| 1416-1437 | `appendStatusHistory_` / `historyField_` | Add a `lineId` parameter, written as `''` when absent |
| 1622-1630 | `defaultStatus_` / `isKnownStatus_` | Delete `defaultStatus_`; keep `isKnownStatus_` |

**Modify — other**
- `apps/api/Router.gs:151` — remove the `changeStatus: actionChangeStatus_` route entirely (A6, no replacement action).
- `apps/api/DevSeed.gs:83, 113, 152` — **missed by the original audit.** `seedStatusKeys_()`
  feeds `status:` onto each seeded *order* (113). Move that onto the seeded lines.

**Read for context**
- `apps/api/Permissions.gs:39-80` — `visibleFields_`, `filterVisibleFields_`, `ALWAYS_VISIBLE_FIELDS` layering.
- `apps/api/Config.gs:173-203` — permission keys, `DEFAULT_VISIBLE_FIELDS`, `ALWAYS_VISIBLE_FIELDS`.
  Confirmed: `status`/`statusNote` are in `DEFAULT_VISIBLE_FIELDS` (184) but **not** in
  `ALWAYS_VISIBLE_FIELDS` (203) — so no unconditional-override interaction to worry about.

**Create / Delete:** none.

## Implementation Steps

1. **Re-verify line numbers.** Code may have shifted. Re-grep every symbol in the table above
   before editing.
2. `validateLine_` (1319): parse `var status = text_(line.status);` then
   `if (status && !isKnownStatus_(config, status)) throw new Error(where + MSG.ORDER_BAD_STATUS);`
   — blank passes. Add `statusNote: text_(line.statusNote)` unconditionally. Return both.
   Mirror the existing optional-invoice comment style at 1333.
3. `buildLineRecord_` (1362): add `status: input.status, statusNote: input.statusNote`.
4. `clampHiddenLineFields_` (1261): add
   `if (!fieldVisible_(user,'status')) { line.status=''; line.statusNote=''; }`.
   Treat the pair as one unit (same as the `invoiceNo`/`invoiceDate` pair at 1269-1272).
5. `validateOrderPayload_` (1279): delete the status parse/validate (1290-1291) and the
   `status`/`statusNote` return keys (1310-1311).
6. `clampHiddenOrderFields_` (1248): delete the `statusNote` clamp (1255).
7. `actionCreateOrder_`: drop `status`/`statusNote` from the `appendRecord_` object and delete
   the history write at 429. Leave 430-435 (approveStatus) untouched.
8. `appendStatusHistory_` (1416): change the signature to
   `(orderId, lineId, oldStatus, newStatus, note, user, field)` — putting `lineId` right after
   `orderId` reads naturally and, more importantly, makes every existing call site a
   **compile-visible arity mismatch** rather than a silently-shifted argument. Update all 9
   remaining call sites (429 removed, 434, 723 removed, 731, 759 removed, 806 replaced, 845,
   892, 938, 983) to pass `''` for `lineId`.
9. `historyField_` (1434): unchanged in behaviour. Add a sibling comment noting `lineId`
   distinguishes line rows from order rows.
10. `actionUpdateOrder_`: remove the order-level status gate (580-584), the two
    `updateRecord_` keys (699-700), and the history write (722-725). Extend `lineFieldsHidden`
    (630-635) with `status`. In the matched-line branch, compare `input.status` against
    `match.status`; if different, `requirePermission_(user,'change_status')` and collect a
    pending history row. Write collected rows after `updateRecord_(SHEETS.ORDERS, …)`, inside
    the same lock. For a **new** line with a non-blank status, also require `change_status`
    (a blank→set on a brand-new line is still setting a status).
11. `actionDeleteOrder_`: delete the history write (759-760) per A5.
12. Delete `actionChangeStatus_` (777-812) outright (A6) — no replacement action is written.
13. `Router.gs:151`: remove the `changeStatus` route entry.
14. `listCardView_` (328) and `buildOrderResponse_` (1025): remove order-level
    `canChangeStatus`; in `buildOrderResponse_`'s line map (1000-1011) set
    `view.canChangeStatus = hasPermission_(user,'change_status')` per line, so the client can
    gate each row's control. (Ownership is already enforced at the action level.)
15. Remove the order-level `statusFilter` (173-175) and any `filters.status` consumer in
    `actionListOrders_` (≈142).
16. `DevSeed.gs`: move `status:` from the seeded order (113) to the seeded line objects.
17. Run the full offline suite. Failures are expected in Phase 6's target files; nothing
    outside that list should break. Record which suites fail as Phase 6's input.

## Todo List

- [ ] Line numbers re-verified against current `Orders.gs`
- [ ] `validateLine_` accepts optional status (blank OK, unknown rejected)
- [ ] `buildLineRecord_` persists status/statusNote
- [ ] `clampHiddenLineFields_` clamps the pair; `clampHiddenOrderFields_` no longer clamps statusNote
- [ ] `validateOrderPayload_` free of order status
- [ ] create / update / delete write no order status and no order-status history
- [ ] `appendStatusHistory_` takes `lineId`; all call sites updated
- [ ] `actionChangeStatus_` deleted outright; `Router.gs:151` route removed (no replacement, A6)
- [ ] `defaultStatus_` deleted, `isKnownStatus_` reused
- [ ] `canChangeStatus` moved from order to line in the response
- [ ] Order-level status filter removed
- [ ] `DevSeed.gs` seeds line status
- [ ] Suite run; failure list captured for Phase 6

## Success Criteria

- [ ] `grep -n "clean.status\|order.status\|row.status\|current.status" apps/api/*.gs` returns
      nothing outside approveStatus code and `Stats.gs`/`Export.gs` (Phase 3's job).
- [ ] `grep -n "defaultStatus_" apps/api/` returns nothing.
- [ ] `grep -rn "actionChangeStatus_" apps/api/` returns nothing.
- [ ] A line saved with `status: ''` round-trips and is accepted.
- [ ] A line saved with `status: 'not_a_key'` is rejected with the line-prefixed message.
- [ ] A user without `change_status` can edit a line's qty/description but not its status.
- [ ] A user whose `visible_fields` omits `status` cannot set a line status via a direct API
      call (the clamp fires on both create and new-line-on-update).
- [ ] Changing one line's status writes exactly one `StatusHistory` row with that `lineId`.
- [ ] `orders-approvestatus.test.js` and `orders-approvestatus-ui.test.js` still pass unchanged.

## Risk Assessment

| Risk | L×I | Mitigation |
|---|---|---|
| `appendStatusHistory_` signature change silently mis-shifts arguments at one of its 6 surviving call sites | Med × **High** | Put `lineId` second (step 8) so a missed call site passes an `oldStatus` where a `lineId` belongs — caught instantly by the approveStatus suites, which assert history contents. Grep all call sites before and after. |
| approveStatus workflow regresses as collateral | Med × High | Treat `orders-approvestatus*.test.js` (485 + 423 lines, currently green) as an untouched canary. Run them after every step in 7-12. |
| A missed `row.status` reader silently reads stale data | Med × High | Phase 1's A1 rename makes it `undefined` rather than stale. Plus the grep in Success Criteria. |
| `change_status` re-scope accidentally widens access (a user who could not change an order's status can now change a line's) | Med × Med | Same permission key, same `requirePermission_` + `requireOwnershipOrAll_` pairing. Ownership still resolves through the **order** row (A6) — no new path to someone else's data. Assert this explicitly in Phase 6. |
| Live sheet has real M5 test/seed data (live-verified 2026-09-13) | High × Med | This phase writes no live data. The migration is not run until Phase 8. |
| `Orders.gs` grows past maintainability | Med × Low | Net removal expected. Re-measure at phase end; if it grows, note for a later extraction — do not refactor mid-phase. |
| Concurrent edits from `plans/260913-2326-milestone-6-hardening-and-polish` (also edits `Orders.gs`) | Med × Med | Different region (error-rethrow wrapper). Do not run the two phases in parallel. |

## Security Considerations

- The "hidden field must be unsettable" invariant (Orders.gs:1233-1247) is the one to not
  break: line status must be clamped on **create** *and* on a **newly-added line during
  update** (Orders.gs:673), not only on matched lines.
- `requireOwnershipOrAll_` must keep operating on the order row; a line-id-only endpoint would
  let a caller mutate a line belonging to someone else's order (A6).
- No change to `PERMISSION_KEYS` — `change_status` (Config.gs:175) keeps its key, so no role
  config on the live Users sheet needs editing.

## Next Steps

Phase 3 (Stats/Export) needs line status to actually be written before its aggregation can be
designed against real data.
