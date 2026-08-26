# Permissions

Authentication is Google's job. **Authorization is entirely ours**, and it lives
server-side in Apps Script. This document defines the matrix and how it is enforced.

---

## 1. The permission list

Stored per user in `Users.permissions` as a JSON object.

| Permission | Grants |
|------------|--------|
| `view_orders` | See the order list at all |
| `view_all_orders` | See **everyone's** orders. Without it → only orders where `createdBy` = own email |
| `create_order` | Create new orders |
| `edit_order` | Edit an existing order (own only, unless `view_all_orders`) |
| `delete_order` | Delete an order and its lines |
| `change_status` | Change order status |
| `approve_order` | Approve an order |
| `search_filter` | Use search and filters |
| `export` | Export the filtered order list (CSV / XLSX / PDF) |
| `view_statistics` | See the revenue statistics screen |
| `export_statistics` | Export statistics |
| `manage_inventory` | Product / stock CRUD |
| `manage_users` | Add, edit, deactivate users; edit the permission matrix |
| `visible_fields` | **Array**, not boolean — which order columns this user may see |

`visible_fields` example (current field names — see `HEADERS.Orders` /
`DEFAULT_VISIBLE_FIELDS` in `apps/api/Config.gs`; this used to say `orderNo`,
a field that predates Milestone 2's Q3 decision and was replaced by `po` +
`poNote` — a stale copy of the old example is exactly how a hand-typed
`visible_fields` array ends up missing `po` and silently wipes it on save,
see `fieldVisible_` in `apps/api/Orders.gs`):

```json
["po","poNote","customer","orderDate","status","statusNote","supplierName",
 "description","qty","uom","invoiceNo","invoiceDate"]
```

A user without `unitPrice` / `amountExVat` in `visible_fields` must not receive
those values in the API response at all — not merely have them hidden in the UI.
The same is true of every other field: anything left out of this array is both
invisible on read AND protected from being overwritten on save (the server
keeps the stored value instead of trusting a blank the client never showed).

---

## 2. Example stored value

```json
{
  "view_orders": true,
  "view_all_orders": false,
  "create_order": true,
  "edit_order": true,
  "delete_order": false,
  "change_status": true,
  "approve_order": false,
  "search_filter": true,
  "export": false,
  "view_statistics": false,
  "export_statistics": false,
  "manage_inventory": false,
  "manage_users": false,
  "visible_fields": ["po","poNote","customer","orderDate","status","statusNote",
                      "description","qty","uom","invoiceNo","invoiceDate"]
}
```

---

## 3. Suggested starting profiles

Presets only — the Admin can override any individual checkbox.

| | Admin | Nhân viên kinh doanh (sales) | Nhân viên kho (warehouse) | Kế toán (accounting) |
|---|---|---|---|---|
| view_orders | ✅ | ✅ | ✅ | ✅ |
| view_all_orders | ✅ | ❌ | ✅ | ✅ |
| create_order | ✅ | ✅ | ❌ | ❌ |
| edit_order | ✅ | ✅ (own) | ❌ | ❌ |
| delete_order | ✅ | ❌ | ❌ | ❌ |
| change_status | ✅ | ✅ (own) | ✅ | ✅ |
| approve_order | ✅ | ❌ | ❌ | ❌ |
| search_filter | ✅ | ✅ | ✅ | ✅ |
| export | ✅ | ✅ | ❌ | ✅ |
| view_statistics | ✅ | ❌ | ❌ | ✅ |
| export_statistics | ✅ | ❌ | ❌ | ✅ |
| manage_inventory | ✅ | ❌ | ✅ | ❌ |
| manage_users | ✅ | ❌ | ❌ | ❌ |
| visible_fields | all | all | no prices | all |

---

## 4. Enforcement rules

1. **Deny by default.** A key missing from the JSON is `false`. An empty
   `visible_fields` means the default safe subset, never "all".
2. **Every** exported server function starts with:
   ```js
   const user = getCurrentUser_();
   requirePermission_(user, 'create_order');
   ```
3. **Ownership is checked separately from permission.** Holding `edit_order`
   without `view_all_orders` allows editing only rows where
   `createdBy === user.email`. Check this *after* loading the row, before writing.
4. **Field filtering happens on the way out.** `filterVisibleFields_()` runs on every
   record before it leaves the server, including in exports and statistics.
5. **The client is not a security boundary.** Hiding a button is UX. A user who
   calls `google.script.run.deleteOrder(...)` from the console must be rejected
   by the server.
6. **Admin self-protection.** A user with `manage_users` cannot remove their own
   `manage_users`, and the last active admin cannot be deactivated.
7. **Unknown email → reject.** Not in the `Users` sheet, or `active = FALSE` →
   a clean Vietnamese message: *"Tài khoản của bạn chưa được cấp quyền truy cập.
   Vui lòng liên hệ quản trị viên."*

---

## 5. Testing checklist (run at every milestone)

- [ ] A user without `view_all_orders` sees only their own orders in list, search, export and statistics.
- [ ] Removing a permission takes effect on the user's **next request**, no re-login needed.
- [ ] A deactivated user (`active` = `FALSE`) is locked out on their **very next request** — not after a delay.
- [ ] A field outside `visible_fields` is absent from the JSON response, not just hidden in the DOM.
- [ ] Calling a privileged function directly from the browser console is rejected.
- [ ] An email that isn't in the `Users` sheet gets the Vietnamese "no access" message, not a stack trace.

---

## 6. Why user records are not cached

An early version cached the resolved user for 120 seconds. Setting `active` =
`FALSE` then did nothing for up to two minutes: a revoked employee carried on
working normally (found 2026-08-17).

Access control has to take effect when the admin says so. The Users sheet is
therefore read fresh on every request — one `getValues()` call, a few hundred
milliseconds, for 5–6 people.

If this ever needs caching for performance, cache the **permissions blob** and
re-read `active` fresh. Never cache the fact that someone is allowed in.

The `Config` sheet *is* cached (120s): it holds status labels and units, which
carry no access-control meaning.
