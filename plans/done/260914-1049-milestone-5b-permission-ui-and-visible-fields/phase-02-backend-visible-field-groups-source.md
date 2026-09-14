---
phase: 2
title: "Backend Visible-Field Groups Source"
status: done
priority: P1
effort: "3h"
dependencies: []
---

# Phase 2: Backend Visible-Field Groups Source

## Overview

Add a server-side, `HEADERS`-derived, deduped, Vietnamese-labeled field list
for `visible_fields`, and a new `manage_users`-gated action that serves it to
the admin client. This is the foundation Phase 4's checkbox UI renders from —
no client-side hardcoded field list, so it can never drift from
`cleanPermissionMatrix_`'s real validation allowlist (`Admin.gs:228-232`),
including across schema changes like the one `plans/260914-0907-milestone-5a-order-status-to-line-level`
(Milestone 5a) makes to `HEADERS.Orders`/`HEADERS.OrderLines`.

## Context Links

- `apps/api/Config.gs:54-109` — `HEADERS` (the real schema/column source)
- `apps/api/Config.gs:183-187` — `DEFAULT_VISIBLE_FIELDS`
- `apps/api/Config.gs:203` — `ALWAYS_VISIBLE_FIELDS`
- `apps/api/Config.gs:206-209` — `MONEY_FIELDS`
- `apps/api/Admin.gs:156-168` — `actionListPermissionPresets_` (pattern to mirror)
- `apps/api/Admin.gs:207-241` — `cleanPermissionMatrix_` (the real validation
  allowlist this phase's output must never diverge from)
- `apps/api/Router.gs:212-216` — action registration map
- `apps/web/Main.gs:365-370` — `apiListPermissionPresets` (pattern to mirror
  for the web-side pass-through)
- `docs/PERMISSIONS.md` §1 — field semantics for label wording

## Key Insights

- **No validation/save-path change needed.** `cleanPermissionMatrix_` already
  accepts any subset of `HEADERS.Orders ∪ HEADERS.OrderLines ∪ HEADERS.Invoices`
  (or `['*']`), and an empty array already safely falls back to
  `DEFAULT_VISIBLE_FIELDS` at read time in `Permissions.gs` — confirmed by
  `cleanPermissionMatrix_`'s own comment (`Admin.gs:217-218`). This phase is
  purely additive: one new read-only action.
- Several field names appear in more than one entity's `HEADERS` array
  (`customer`, `createdBy`, `createdAt`, `note`, plus `orderId`/`invoiceId` as
  FKs). Since `cleanPermissionMatrix_` validates against the flat UNION, one
  checkbox per unique key is correct — checking "customer" controls
  visibility of the `customer` column wherever `filterVisibleFields_` sees it
  (Orders row or Invoice row alike). The group list must dedupe: each key
  appears under exactly ONE group (its first-seen entity), never repeated.
- `ALWAYS_VISIBLE_FIELDS` (`approveStatus`, `updatedBy`, `updatedAt`) are
  force-visible regardless of `visible_fields` — Phase 4's UI should visually
  mark these three as "always visible" (disabled/checked, non-editable) rather
  than silently letting an admin uncheck something that has no effect, which
  would be confusing. This phase's output should flag them (`alwaysVisible: true`)
  so Phase 4 doesn't need its own copy of that list.
- `MONEY_FIELDS` is useful context (Phase 4 could visually flag money columns,
  matching the existing "money-blindness" concept in `PERMISSIONS.md`) —
  include the flag in this phase's output too, cheap and avoids a second round trip.

## Requirements

- Functional: a new action `listVisibleFieldGroups` returns grouped,
  deduped, labeled field metadata sourced live from `HEADERS`.
- Non-functional: gated on `manage_users`, same as every other admin
  bootstrap action; no new sheet reads (pure in-memory transform of existing
  constants); response is small (~40 field entries) and needs no caching.

## Architecture

```
Config.gs
  FIELD_LABELS_VI            (Vietnamese label per column key, with raw-key fallback)
  visibleFieldGroups_()       -> [{key, label, fields: [{key, label, alwaysVisible, isMoney}]}]
        |
        v
Admin.gs
  actionListVisibleFieldGroups_(user, payload)   requirePermission_('manage_users')
        |
        v
Router.gs   ACTIONS.listVisibleFieldGroups
        |
        v
apps/web/Main.gs   apiListVisibleFieldGroups()  ->  apiCall_('listVisibleFieldGroups', {})
        |
        v
ViewsAdmin.html (Phase 4)   T.call('apiListVisibleFieldGroups', {})
```

## Related Code Files

- Modify: `apps/api/Config.gs` — add `FIELD_LABELS_VI` map and `visibleFieldGroups_()`
- Modify: `apps/api/Admin.gs` — add `actionListVisibleFieldGroups_`
- Modify: `apps/api/Router.gs` — register the new action
- Modify: `apps/web/Main.gs` — add `apiListVisibleFieldGroups()` pass-through
- Modify: `tools/offline-tests/admin.test.js` — new assertions for the new action/helper

## Implementation Steps

1. In `apps/api/Config.gs`, immediately after `MONEY_FIELDS` (line 209), add:
   ```js
   /**
    * Milestone 5b — Vietnamese display labels for visible_fields columns.
    * Raw key is used as a fallback for anything not listed here, so a future
    * column added to HEADERS without a matching label degrades to the key
    * itself rather than throwing or vanishing from the admin editor.
    */
   var FIELD_LABELS_VI = {
     orderId: 'Mã đơn', po: 'PO', poNote: 'Ghi chú PO', customer: 'Khách hàng',
     orderDate: 'Ngày đặt', status: 'Trạng thái', statusNote: 'Ghi chú trạng thái',
     customerDeposit: 'Đặt cọc khách hàng', supplierName: 'Nhà cung cấp',
     supplierPaid: 'Đã trả nhà cung cấp', totalExVat: 'Tổng trước VAT',
     totalIncVat: 'Tổng sau VAT', lineCount: 'Số dòng',
     createdBy: 'Người tạo', createdAt: 'Ngày tạo',
     updatedBy: 'Người cập nhật', updatedAt: 'Ngày cập nhật',
     approvedBy: 'Người duyệt', approvedAt: 'Ngày duyệt',
     approveStatus: 'Trạng thái duyệt', rejectReason: 'Lý do từ chối',
     rejectedBy: 'Người từ chối', rejectedAt: 'Ngày từ chối',
     lineId: 'Mã dòng', lineNo: 'STT dòng', productCode: 'Mã sản phẩm',
     description: 'Mô tả', unitPrice: 'Đơn giá', qty: 'Số lượng', uom: 'ĐVT',
     vatRate: 'Thuế suất VAT', amountExVat: 'Thành tiền trước VAT',
     amountIncVat: 'Thành tiền sau VAT', invoiceId: 'Mã hoá đơn',
     note: 'Ghi chú', invoiceNo: 'Số hoá đơn', invoiceDate: 'Ngày hoá đơn'
   };

   /**
    * Grouped, deduped visible_fields options for the admin per-user column
    * editor (Milestone 5b). Built live from HEADERS so it can never list a
    * field cleanPermissionMatrix_ (Admin.gs) would reject, or omit one it
    * allows — including after a future schema change to HEADERS.Orders/
    * OrderLines/Invoices. A field present in more than one entity's HEADERS
    * (e.g. 'customer', 'createdBy') is listed once, under its first group.
    */
   function visibleFieldGroups_() {
     var seen = {};
     function dedupedFields(keys) {
       return keys.filter(function (k) {
         if (seen[k]) return false;
         seen[k] = true;
         return true;
       }).map(function (k) {
         return {
           key: k,
           label: FIELD_LABELS_VI[k] || k,
           alwaysVisible: ALWAYS_VISIBLE_FIELDS.indexOf(k) >= 0,
           isMoney: MONEY_FIELDS.indexOf(k) >= 0
         };
       });
     }
     return [
       { key: 'orders', label: 'Đơn hàng', fields: dedupedFields(HEADERS.Orders) },
       { key: 'orderLines', label: 'Dòng đơn hàng', fields: dedupedFields(HEADERS.OrderLines) },
       { key: 'invoices', label: 'Hoá đơn', fields: dedupedFields(HEADERS.Invoices) }
     ];
   }
   ```
2. In `apps/api/Admin.gs`, immediately after `actionListPermissionPresets_`
   (line 168), add:
   ```js
   /**
    * Milestone 5b — grouped, labeled visible_fields options for the admin's
    * per-user column editor. Same manage_users gate as
    * actionListPermissionPresets_. Sourced live from Config.gs's HEADERS via
    * visibleFieldGroups_(), so the client's checkbox list can never list a
    * field this file's own cleanPermissionMatrix_ would reject.
    */
   function actionListVisibleFieldGroups_(user, payload) {
     requirePermission_(user, 'manage_users');
     return { groups: visibleFieldGroups_() };
   }
   ```
3. In `apps/api/Router.gs`, add one line after `listPermissionPresets:` (line 216):
   ```js
   listVisibleFieldGroups: actionListVisibleFieldGroups_,
   ```
4. In `apps/web/Main.gs`, add after `apiListPermissionPresets` (line 370):
   ```js
   /** Milestone 5b — grouped {key,label,fields:[{key,label,alwaysVisible,isMoney}]}
    *  options for the visible_fields column editor. */
   function apiListVisibleFieldGroups() {
     return handle_('apiListVisibleFieldGroups', function () {
       return apiCall_('listVisibleFieldGroups', {});
     });
   }
   ```
5. Add offline test coverage in `tools/offline-tests/admin.test.js` (see
   Phase 5 for the full list, but add at minimum here): every field
   `visibleFieldGroups_()` returns validates successfully through
   `cleanPermissionMatrix_({visible_fields: [thatKey]})`; no key appears in
   more than one group (dedup check); `ALWAYS_VISIBLE_FIELDS`/`MONEY_FIELDS`
   entries are correctly flagged.

## Todo List

- [x] `FIELD_LABELS_VI` + `visibleFieldGroups_()` added to `Config.gs`
- [x] `actionListVisibleFieldGroups_` added to `Admin.gs`
- [x] Action registered in `Router.gs`
- [x] `apiListVisibleFieldGroups()` pass-through added to `apps/web/Main.gs`
- [x] Round-trip every returned field key through `cleanPermissionMatrix_` in a
      quick manual/offline check — none should throw

## Success Criteria

- [x] `actionListVisibleFieldGroups_` requires `manage_users` (rejects otherwise,
      same error shape as `actionListPermissionPresets_`)
- [x] Every field key returned by `visibleFieldGroups_()` is accepted by
      `cleanPermissionMatrix_` as a single-element `visible_fields` array
- [x] No field key appears in more than one group in the response
- [x] Every key in `ALWAYS_VISIBLE_FIELDS` and `MONEY_FIELDS` is correctly
      flagged in its group entry
- [x] Offline test suite green

## Risk Assessment

- **Label coverage gaps**: a `HEADERS` column with no `FIELD_LABELS_VI` entry
  falls back to its raw key — acceptable degradation, not a bug, but worth a
  final pass in Phase 5 to confirm every current column has a real label
  (the list above should already cover 100% of today's `HEADERS`, but recheck
  against the live file since this plan was drafted from a point-in-time read).
- **M5a schema overlap**: if Milestone 5a's `status`/`statusNote` move from
  `HEADERS.Orders` to `HEADERS.OrderLines` lands before this phase, the dedup
  logic and group assignment still work correctly (they read `HEADERS` at
  call time) — only the group a given key shows up under shifts, which is
  correct and desired, not a bug to work around.

## Security Considerations

`requirePermission_(user, 'manage_users')` is the same gate every other admin
bootstrap action uses — no new attack surface. The action is read-only and
returns no per-user data, only static-ish schema metadata (safe to expose to
any `manage_users` holder, same trust level as `actionListPermissionPresets_`).

## Next Steps

Phase 3 (mockups) and Phase 4 (implementation) consume `groups` from this
action to render the checkbox editor.
