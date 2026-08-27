# Danh sách kiểm tra — Giai đoạn 2 (Đơn hàng)

Kiểm tra trên **hai tài khoản**: một tài khoản quản trị (máy tính) và một tài khoản
nhân viên (điện thoại thật, không phải cửa sổ thu nhỏ trên máy tính).

Trước khi bắt đầu: đã push `apps/api`, đã tạo phiên bản mới, đã chạy
`setupMilestone2`, đã push `apps/web` và tạo phiên bản mới.

---

## A. Khởi tạo dữ liệu

- [x] Chạy `setupMilestone2` trong trình soạn thảo API, log báo tạo 4 sheet:
      `Orders`, `OrderLines`, `Invoices`, `StatusHistory`
- [x] Dòng cuối của log ghi `Header check: all order sheets match`
- [x] Chạy lại `setupMilestone2` lần nữa — log báo "already has data, left untouched",
      không có dữ liệu nào bị mất

## B. Tạo đơn hàng

- [x] Vào mục **Đơn hàng** → bấm **+ Tạo đơn hàng**
- [x] Gõ 2 chữ đầu tên khách quen — danh sách gợi ý hiện ra
- [x] Tạo một đơn **1 dòng hàng**, lưu → hiện thông báo *Đã tạo đơn DH-2026-0001*
- [x] Tạo một đơn **8 dòng hàng** (bấm **+ Thêm dòng** 7 lần), lưu bình thường
- [x] Mở sheet `Orders`: mỗi đơn đúng **một** dòng; sheet `OrderLines`: 1 dòng và 8 dòng
- [x] Nhập một khách hàng **tên mới** → sau khi lưu, tên đó có trong
      `Config.customerList`

## C. Tiền và thuế

- [x] Một dòng VAT **8%**: `Thành tiền` = đơn giá × số lượng, `có VAT` = ×1,08
- [x] Một dòng VAT **10%** trong cùng đơn → tổng đơn = tổng đúng của các dòng
- [x] Số tiền hiển thị dạng `1.200.000 ₫`, không có số lẻ
- [x] Nhập cọc `47.466.000` → trong sheet lưu thành số `47466000`, không phải chữ

## D. Sửa và xoá

- [x] Mở lại đơn 8 dòng, sửa nội dung dòng 3, xoá dòng 5, thêm một dòng mới, lưu
- [x] Mở sheet `OrderLines`: đúng 8 dòng, **không** có dòng thừa, không có dòng mồ côi
- [x] Dòng không đụng tới vẫn giữ nguyên `lineId` và số hoá đơn của nó
- [x] Tổng tiền của đơn đã được tính lại đúng
- [x] Bấm **Xoá đơn hàng** → hiện dòng xác nhận ngay tại chỗ (không phải hộp thoại
      của trình duyệt) → bấm **Xoá** → cả dòng đơn và tất cả dòng hàng biến mất

## E. Hoá đơn

- [x] Trong một đơn, nhập **số hoá đơn 50** cho dòng 1 và **51** cho dòng 2, có ngày
- [x] Ở một đơn khác, nhập lại **số hoá đơn 50** với cùng ngày
- [x] Sheet `Invoices` chỉ có **hai** dòng (`HD-2026-0050`, `HD-2026-0051`),
      không bị lặp
- [x] Nhập số hoá đơn nhưng **bỏ trống ngày** → báo lỗi *"Dòng n: đã nhập số hoá đơn
      thì phải nhập ngày hoá đơn."*, không lưu

## F. Phân quyền (dùng tài khoản nhân viên)

- [x] Nhân viên **không có** `view_all_orders` chỉ thấy đơn do mình tạo
- [x] Nhân viên **không có** `create_order` không thấy nút **+ Tạo đơn hàng**
- [x] Nhân viên **không có** `change_status` mở đơn cũ → ô Trạng thái bị khoá
- [x] Nhân viên **không được xem giá** không thấy ô Đơn giá / VAT / Tổng tiền
- [x] Nhân viên đó sửa và lưu đơn → **giá cũ vẫn còn nguyên** trong sheet
      (đây là lỗi nguy hiểm nhất của giai đoạn này — kiểm tra kỹ)

## G. Điện thoại

- [x] Danh sách đơn đọc được, không phải kéo ngang
- [x] Bấm vào ô nhập không bị phóng to màn hình
- [x] Thêm/xoá dòng hàng bấm trúng dễ dàng
- [x] Bàn phím số hiện ra khi nhập số lượng và đơn giá
- [x] Lưu được một đơn 3 dòng hoàn toàn trên điện thoại

## H. Kiểm tra cuối

- [x] Không có chữ tiếng Anh nào trên màn hình đơn hàng
- [x] Không có thông báo lỗi kỹ thuật nào lọt ra giao diện
- [x] `DEV_MODE` đã tắt trước khi gửi link cho nhân viên
