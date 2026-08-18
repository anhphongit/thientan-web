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

| Field | Vietnamese label |
|-------|-----------------|
| orderNo | Số đơn |
| customerPo | Số PO khách |
| customer | Khách hàng |
| orderDate | Ngày đặt |
| description | Chi tiết |
| unitPrice | Đơn giá bán ra (VND) |
| qty | SL |
| uom | ĐVT |
| vatRate | Thuế VAT |
| amountExVat | Thành tiền chưa VAT |
| amountIncVat | Trị giá HĐ |
| invoiceNo | Hóa đơn ra |
| invoiceDate | Ngày HĐ |
| status | Trạng thái |
| statusNote | Ghi chú |
| createdBy | Người tạo |

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
