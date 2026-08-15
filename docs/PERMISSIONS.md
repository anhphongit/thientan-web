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

`visible_fields` example:

```json
["orderNo","customer","description","qty","uom","status","invoiceNo","invoiceDate"]
```

A user without `unitPrice` / `amountExVat` in `visible_fields` must not receive
those values in the API response at all — not merely have them hidden in the UI.

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
  "visible_fields": ["orderNo","customer","description","qty","uom","status"]
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
   const user = getCurrentUser();
   requirePermission(user, 'create_order');
   ```
3. **Ownership is checked separately from permission.** Holding `edit_order`
   without `view_all_orders` allows editing only rows where
   `createdBy === user.email`. Check this *after* loading the row, before writing.
4. **Field filtering happens on the way out.** `filterVisibleFields()` runs on every
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
- [ ] A deactivated user is locked out immediately.
- [ ] A field outside `visible_fields` is absent from the JSON response, not just hidden in the DOM.
- [ ] Calling a privileged function directly from the browser console is rejected.
- [ ] An email that isn't in the `Users` sheet gets the Vietnamese "no access" message, not a stack trace.
