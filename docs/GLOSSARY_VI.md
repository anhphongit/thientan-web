# Vietnamese UI Glossary

Every user-facing string is Vietnamese. Use the exact wording below so the app stays
consistent — do not invent new phrasing per screen.

---

## Navigation

| English | Vietnamese |
|---------|-----------|
| Orders | Đơn hàng |
| New order | Tạo đơn hàng |
| Inventory | Kho hàng |
| Statistics | Thống kê |
| Users | Người dùng |
| Settings | Cài đặt |
| Logout | Đăng xuất |

## Order fields (match the current Excel headers)

| Field | Vietnamese label | Notes |
|-------|-----------------|-------|
| orderNo | Số đơn | |
| customerPo | Số PO khách | |
| customer | Khách hàng | |
| orderDate | Ngày đặt | |
| description | Chi tiết | **Line-level field** (Milestone 5a) |
| unitPrice | Đơn giá bán ra (VND) | **Line-level field** |
| qty | SL | **Line-level field** |
| uom | ĐVT | **Line-level field** |
| vatRate | Thuế VAT | **Line-level field** |
| amountExVat | Thành tiền chưa VAT | **Line-level field** |
| amountIncVat | Trị giá HĐ | **Line-level field** |
| invoiceNo | Hóa đơn ra | **Line-level field** |
| invoiceDate | Ngày HĐ | **Line-level field** |
| status | Trạng thái | **Line-level field** (Milestone 5a; was order-level before) |
| statusNote | Ghi chú | **Line-level field** (Milestone 5a; was order-level before) |
| createdBy | Người tạo | |

## Status values

| Key | Label |
|-----|-------|
| draft | Nháp |
| confirmed | Đã xác nhận |
| waiting_stock | Chờ hàng về |
| stock_arrived | Hàng về |
| delivered_not_invoiced | Đã giao, chưa xuất |
| invoiced_unpaid | Đã xuất, chưa TT |
| paid | Đã thanh toán |
| cancelled | Đã huỷ |

Store the **key** in the sheet, display the **label**. The Admin can extend the list
via the `Config` sheet.

## Actions

| Action | Vietnamese |
|--------|-----------|
| Save | Lưu |
| Cancel | Huỷ |
| Edit | Sửa |
| Delete | Xoá |
| Add line | Thêm dòng |
| Remove line | Xoá dòng |
| Search | Tìm kiếm |
| Filter | Lọc |
| Export | Xuất file |
| Approve | Duyệt |
| Change status | Đổi trạng thái |
| Backup | Sao lưu |
| Switch account | Đổi tài khoản |
| Private / incognito window | Cửa sổ ẩn danh (Chrome) · Cửa sổ riêng tư (Firefox, Safari) · Cửa sổ InPrivate (Edge) |
| Browser profile | Profile trình duyệt |
| Sign out of Google | Đăng xuất Google |
| Request access | Xin cấp quyền |
| Refresh | Tải lại |

## Time periods

| Period | Vietnamese |
|--------|-----------|
| Week | Tuần |
| Month | Tháng |
| Quarter | Quý |
| Year | Năm |
| Revenue | Doanh số |
| Total | Tổng cộng |

## Messages

| Situation | Message |
|-----------|---------|
| Loading | Đang tải... |
| Saving | Đang lưu... |
| Saved | Đã lưu thành công. |
| Delete confirm | Bạn có chắc muốn xoá đơn hàng này không? |
| No permission | Bạn không có quyền thực hiện thao tác này. |
| No access at all | Tài khoản của bạn chưa được cấp quyền truy cập. Vui lòng liên hệ quản trị viên. |
| Empty list | Chưa có dữ liệu. |
| Required field | Vui lòng nhập trường này. |
| Generic error | Đã xảy ra lỗi. Vui lòng thử lại. |
| Network error | Không kết nối được máy chủ. Kiểm tra kết nối mạng. |

---

## Loanwords / proper nouns kept as-is (deliberate, not oversight)

Decided during Milestone 6 Phase 5's Vietnamese completeness sweep (2026-09-15) — these
4 strings were flagged as borderline by a full-codebase audit; each is a one-time decision
recorded here (not a code comment) so future sweeps don't re-flag them as violations.

| String | Where | Decision | Rationale |
|--------|-------|----------|-----------|
| Email | `ViewsAdmin.html` form label ("Email"/"Email *"), `App.html` diagnostics `<dt>Email</dt>` | Kept as-is | Universal loanword in Vietnamese business software; "Email" is understood and used verbatim far more often than "Thư điện tử". |
| PDF | `ViewsOrders.html` export delivery banner label | Kept as-is | File-format acronym, not translatable — used as-is in all Vietnamese software/UI. |
| Excel | `ViewsOrders.html` export delivery banner label | Kept as-is | Product/brand name (Microsoft Excel) — proper nouns are not translated. |
| Chrome, Firefox, Edge, Opera, Safari | `App.html` `browserInfo()` account-switch helper sentences | Kept as-is | Browser proper nouns — never translated in any locale. |

---

## Formatting

- **Money:** `11.949.000 ₫` — dot as thousand separator, no decimals, `₫` after the number.
- **Dates:** `dd/MM/yyyy` (e.g. `23/04/2026`). Timezone `Asia/Ho_Chi_Minh`.
- **Numbers:** dot as thousand separator, comma as decimal separator (Vietnamese convention).
- Never show raw technical IDs (`ORD-2026-0001`) as the primary label — show `Số đơn`.

---

## Tone rule: describe our scope, never blame a vendor

User-facing text says what **this app** supports and what the person should do
next. It does not explain what Google does or does not permit — that framing
makes the product sound broken and gives the reader nothing actionable.

| ❌ Don't write | ✅ Write |
|---------------|---------|
| "Google không cho phép ứng dụng tự đổi tài khoản" | "Ứng dụng dùng tài khoản Google chính của profile trình duyệt này" |
| "Không thể chuyển tài khoản" | "Hiện chúng tôi chưa hỗ trợ chuyển nhanh giữa nhiều tài khoản. Bạn có thể chọn một trong ba cách sau." |

Every limitation stated to a user should be followed immediately by the options
open to them, each with concrete steps — and a button wherever one is possible.

**Keep the first screen short.** State the limit in one sentence, then offer
choices as tappable rows: a title and a single line of description each. Put the
steps behind the tap, capped at three, one short line apiece. A blocked user
skims; a paragraph they skip is worth nothing.
