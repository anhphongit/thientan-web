# Danh sách kiểm tra — Giai đoạn 5 (Kho hàng + Quản trị viên)

Kiểm tra trên **hai thiết bị**: một máy tính (PC/Mac) và một điện thoại thật (iOS
Safari hoặc Android Chrome, không phải cửa sổ thu nhỏ trên máy tính) — mọi mục có
chữ "(điện thoại)" bắt buộc dùng điện thoại thật.

Trước khi bắt đầu: 
1. Đã chạy `setupMilestone5()` từ trình soạn thảo API và xác nhận tờ Products tồn tại với 9 cột
2. Đã push `apps/api`, đã tạo phiên bản mới
3. Đã push `apps/web`, đã tạo phiên bản mới — **api trước, web sau**
4. Xác nhận cả hai dự án đã triển khai và hoạt động trực tuyến

Tham khảo:
- `MILESTONES.md:172-186` để hiểu 5 tiêu chí thoát trước khi ký
- `TASKS.md:3014-3017` để theo dõi M5.1/M5.2 (Kho hàng + Quản trị viên)
- 3 tài khoản thử nghiệm: admin (full quyền), sales (quyền bán), warehouse (quyền kho)

---

## A. Kho hàng — CRUD (5.1)

Quản lý hàng hóa: tạo, sửa, xóa sản phẩm.

- [x] ✅ Chuyển đến tab "Kho hàng" (nếu tab "Kho hàng" không hiển thị → kiểm tra
      `manage_inventory` permission trên tài khoản hiện tại)
- [x] ✅ Nhấn nút "Thêm sản phẩm" → mở form tạo mới
- [x] ✅ Form yêu cầu: `Mã hàng` (code), `Tên hàng` (name), `Đơn vị tính` (uom từ danh sách
      Config), `Giá` (lastPrice), `Tồn kho` (stockQty), `Tối thiểu` (minStock)
- [x] ✅ Nhập mã hàng duy nhất (VD: `SP-001`) → form chấp nhận
- [x] ✅ Chọn `Đơn vị tính` từ dropdown → danh sách từ Config.uomList (VD: Chiếc, Túi, Hộp)
- [x] ✅ Nhập giá và tồn kho → lưu sản phẩm → mới xuất hiện trong danh sách
- [x] ✅ Tạo một sản phẩm khác với cùng mã hàng → server từ chối (mã duy nhất)
- [x] ✅ Tạo sản phẩm rồi reload trang → sản phẩm vẫn có trong danh sách (dữ liệu lưu trữ đúng)
- [x] ✅ Nhấn icon sửa trên một sản phẩm → mở form sửa
- [x] ✅ Thay đổi tên hàng, giá, tồn kho → lưu → danh sách cập nhật
- [x] ✅ Reload trang → sản phẩm vẫn giữ giá trị đã sửa (dữ liệu lưu trữ đúng)
- [x] ✅ Nhấn icon xóa trên một sản phẩm → hiện xác nhận → đồng ý xóa → sản phẩm biến mất
- [x] ✅ Tạo sản phẩm mới, nhấn xóa → popup xác nhận có nội dung rõ ràng (không đối thoại trình duyệt)
- [x] ✅ Reload trang → sản phẩm đã xóa không còn lại (thực sự xóa khỏi sheet)

---

## B. Cảnh báo tồn thấp (5.1)

Đánh dấu hàng hóa với tồn kho thấp hơn ngưỡng tối thiểu.

**Lưu ý:** Sản phẩm mới mặc định `stockQty = 0` và `minStock = 0`. Nếu cả hai = 0, sản
phẩm sẽ được đánh dấu là "tồn thấp" (`0 <= 0` là đúng). Đây là hành vi dự kiến, không phải lỗi.

- [x] ✅ Tạo sản phẩm mới với `Tồn kho = 0`, `Tối thiểu = 0` → kiểm tra danh sách → thấy
      badge "Tồn thấp" (không phải lỗi, là hành vi mong đợi)
- [x] ✅ Tạo sản phẩm với `Tồn kho = 10`, `Tối thiểu = 5` → không có badge "Tồn thấp"
- [x] ✅ Sửa sản phẩm: giảm `Tồn kho` từ 10 xuống 3 → lưu → reload → thấy badge "Tồn thấp"
      (vì 3 <= 5)
- [x] ✅ Sửa sản phẩm: tăng `Tồn kho` từ 3 lên 10 → lưu → reload → badge "Tồn thấp" biến mất
- [x] ✅ Nhấn checkbox "Chỉ hiển thị hàng tồn thấp" → danh sách lọc chỉ các hàng có badge
- [x] ✅ Bỏ checkbox lọc → danh sách quay về đầy đủ

---

## C. Tìm kiếm & lọc kho (5.1)

Tìm kiếm sản phẩm theo mã hoặc tên; bộ lọc hàng hoạt động / không hoạt động.

- [x] ✅ Nhập từ khóa vào ô tìm kiếm (VD: "SP-001") → danh sách chỉ hiển thị sản phẩm có
      mã khớp
- [x] ✅ Xóa từ khóa → danh sách quay về đầy đủ
- [x] ✅ Tìm kiếm theo tên (VD: "Nước mắm") → hiển thị sản phẩm có tên chứa từ khóa
- [x] ✅ Tạo một sản phẩm với `Trạng thái = Không hoạt động` → sản phẩm không hiển thị trong danh sách mặc định
- [x] ✅ Nhấn checkbox "Bao gồm hàng không hoạt động" → danh sách hiển thị cả hàng không hoạt động
- [x] ✅ Sửa một sản phẩm: thay đổi `Trạng thái` từ "Hoạt động" → "Không hoạt động" → reload →
      sản phẩm biến mất khỏi danh sách (trừ khi bật checkbox "Bao gồm")
- [x] ✅ Nhấn toggle "Bao gồm hàng không hoạt động" để bật/tắt → danh sách cập nhật ngay lập tức

---

## D. Người dùng — CRUD (5.2)

Quản lý tài khoản nhân viên: tạo, sửa, vô hiệu hóa người dùng.

- [x] ✅ Chuyển đến tab "Người dùng" (nếu tab không hiển thị → kiểm tra `manage_users` permission)
- [x] ✅ Nhấn nút "Thêm người dùng" → mở form tạo mới
- [x] ✅ Form yêu cầu: `Email` (duy nhất, không thay đổi sau tạo), `Tên` (displayName),
      `Ghi chú` (note)
- [x] ✅ Nhập email người dùng (VD: john@example.com) → chấp nhận
- [x] ✅ Nhập tên người dùng (VD: "Ông John") → form chấp nhận
- [x] ✅ Nhấn "Lưu" → người dùng được tạo, hiển thị trong danh sách
- [x] ✅ Reload trang → người dùng vẫn có trong danh sách
- [x] ✅ Nhấn icon sửa trên một người dùng → mở form sửa
- [x] ✅ **Email là trường chỉ đọc** — sau khi tạo, không thể thay đổi email
- [x] ✅ Sửa tên / ghi chú của người dùng → lưu → danh sách cập nhật → reload → vẫn giữ
      giá trị sửa
- [x] ✅ Nhấn checkbox "Vô hiệu hóa" trên một người dùng → lưu → reload → người dùng vẫn
      có trong danh sách nhưng được đánh dấu là "Vô hiệu hóa"
- [x] ✅ Tìm kiếm người dùng theo email hoặc tên → danh sách lọc khớp
- [x] ✅ Nhấn checkbox "Bao gồm người dùng vô hiệu hóa" → danh sách hiển thị cả người dùng
      bị vô hiệu hóa
- [x] ✅ **Thực tế:** Khi một người dùng bị vô hiệu hóa, lần đăng nhập tiếp theo của họ sẽ
      bị từ chối ngay lập tức (không cần logout/login lại, không cần chờ 2 phút)

---

## E. Bảo vệ quản trị viên (5.2)

Quy tắc bảo vệ: quản trị viên không thể tự cấp/hủy quyền của bản thân, quản trị viên cuối
không thể bị vô hiệu hóa hoặc mất quyền `manage_users`.

### E.1 — Tự bảo vệ (remove_admin): Admin không thể tự cấp/hủy manage_users

**Sử dụng: Đường dẫn preset quyền (E.1a + E.1b)**

- [x] ✅ **Đăng nhập bằng tài khoản admin** (có `manage_users = true`)
- [x] ✅ Vào tab "Người dùng" → tìm người dùng admin hiện tại
- [x] ✅ Nhấn icon sửa → mở form sửa quyền → chọn preset "Nhân viên bán" (sales)
- [x] ✅ Nhấn "Lưu" → server từ chối với thông báo: *"Bạn không thể tự cấp/hủy quyền quản
      lý của bản thân"* hoặc tương tự (`MSG.USER_SELF_REMOVE_ADMIN`)
- [x] ✅ Form không thay đổi; người dùng vẫn là admin

**Sử dụng: Đường dẫn ma trận quyền (E.1c)**

- [x] ✅ **Cùng tài khoản admin** → vào "Ma trận quyền" → tìm hàng của chính mình
- [x] ✅ Nhấn "Sửa" trên hàng của mình → mở ma trận 14 checkbox
- [x] ✅ Thử tắt checkbox `manage_users` → nhấn "Lưu" → server từ chối với cùng thông báo
      *"Bạn không thể tự cấp/hủy..."*
- [x] ✅ Checkbox vẫn được bật; quyền không thay đổi

### E.2 — Bảo vệ quản trị viên cuối (last_admin): Quản trị viên cuối cùng không thể bị vô hiệu hóa

**Lưu ý:** "Quản trị viên cuối cùng" = một người dùng:
1. Có `active = true` (đang hoạt động)
2. Có `manage_users = true` (có quyền quản lý người dùng)
3. Không còn người dùng nào khác đáp ứng cả hai điều trên

**Sử dụng: Đường dẫn preset quyền (E.2a)**

- [x] ✅ **Tìm một tài khoản admin khác** (hoặc tạo một tài khoản admin thứ hai để test)
- [x] ✅ Đăng nhập bằng tài khoản thứ nhất (là admin cuối cùng còn hoạt động)
- [x] ✅ Vào tab "Người dùng" → nhấn sửa trên tài khoản admin thứ hai
- [x] ✅ Chọn preset "Nhân viên bán" (loại bỏ quyền `manage_users`) → nhấn "Lưu" → chấp nhận
- [x] ✅ Giờ tài khoản admin thứ nhất là **quản trị viên cuối cùng** (duy nhất còn `manage_users = true`)
- [x] ✅ Nhấn sửa trên tài khoản này, nhấn checkbox "Vô hiệu hóa" → nhấn "Lưu" → server từ chối:
      *"Không thể vô hiệu hóa quản trị viên cuối cùng"* (`MSG.USER_LAST_ADMIN`)
- [x] ✅ Tài khoản vẫn hoạt động; checkbox "Vô hiệu hóa" không được đánh dấu

**Sử dụng: Đường dẫn ma trận quyền (E.2b)**

- [x] ✅ **Cùng tình huống**: quản trị viên cuối cùng, đăng nhập trên tài khoản đó
- [x] ✅ Vào "Ma trận quyền" → mở hàng của chính mình
- [x] ✅ Thử bật checkbox "Vô hiệu hóa" → nhấn "Lưu" → server từ chối với thông báo cuối cùng
      *"Không thể vô hiệu hóa quản trị viên cuối cùng"*
- [x] ✅ Checkbox vẫn tắt; người dùng vẫn hoạt động

---

## F. Ma trận quyền (5.3, Giai đoạn 3)

Chỉnh sửa quyền từng checkbox; hiển thị thẻ tuỳ chỉnh; cả hai đường dẫn preset + matrix đều hoạt động.

- [x] ✅ Vào tab "Người dùng" → tìm một người dùng (không phải admin) → nhấn sửa
- [x] ✅ **Đường dẫn preset**: Chọn preset "Nhân viên bán" (sales) → danh sách quyền chuẩn bị được
      điền sẵn → nhấn "Lưu" → người dùng được gán quyền preset
- [x] ✅ Reload trang → người dùng vẫn là "sales"; quyền vẫn như vậy
- [x] ✅ Sửa lại cùng người dùng → chọn preset khác (VD: "Nhân viên kho") → nhấn "Lưu" →
      quyền cập nhật
- [x] ✅ **Đường dẫn ma trận**: Chọn preset → nhấn nút "Tuỳ chỉnh" hoặc tương tự → mở giao diện
      14 checkbox (hoặc số lượng tùy preset)
- [x] ✅ Thấy các permission: `create_order`, `edit_order`, `change_status`, `view_all_orders`,
      `view_statistics`, `manage_inventory`, `manage_users`, `manage_config`, `export_statistics`,
      v.v. (14 checkbox tổng)
- [x] ✅ Tắt một checkbox (VD: `create_order`) → nhấn "Lưu" → người dùng mất quyền tạo đơn hàng
- [x] ✅ Giao diện **hiển thị "Tuỳ chỉnh"** trên thẻ người dùng này (thay vì preset name)
      — cho thấy quyền không tuân theo preset nào
- [x] ✅ Bật lại checkbox → nhấn "Lưu" → hiển thị trở lại preset name (nếu nó khớp với preset)
- [x] ✅ **Rất quan trọng: `visible_fields`** — nếu tắt `view_all_orders` hoặc cấu hình
      `visible_fields`, tất cả các trường bị ẩn không được hiển thị trong biểu mẫu đơn hàng
      khi đăng nhập bằng người dùng này
- [x] ✅ **(điện thoại)** Mở "Ma trận quyền" trên điện thoại → thấy thẻ người dùng (card layout, mỗi thẻ
      một người) → nhấn sửa một thẻ → 14 checkbox hiển thị bình thường (không quá chặt chẽ
      trên màn hình nhỏ)

---

## G. Sửa cấu hình (5.4, Giai đoạn 4)

Chỉnh sửa danh sách cấu hình (trạng thái, đơn vị tính, khách hàng) từ giao diện.

**Rất quan trọng:** Các thay đổi phải xuất hiện **ngay lập tức** trong biểu mẫu đơn hàng,
không phải sau 2 phút (test cache invalidation).

- [x] ✅ Vào tab "Cấu hình" (hoặc "Quản trị" nếu gộp vào) → tìm phần "Danh sách trạng thái"
- [x] ✅ Nhấn "Thêm trạng thái" → nhập tên trạng thái mới (VD: "Hoàn tất sớm") → lưu
- [x] ✅ Chuyển sang tab "Đơn hàng" → tạo đơn hàng mới → mở bộ chọn "Trạng thái" → thấy
      trạng thái mới vừa tạo **ngay lập tức** (không phải sau 2 phút, không cần reload)
- [x] ✅ Quay lại "Cấu hình" → thêm đơn vị tính mới (VD: "Thùng") → lưu
- [x] ✅ Chuyển sang "Kho hàng" → tạo sản phẩm → chọn "Đơn vị tính" → thấy đơn vị mới **ngay tức thì**
- [x] ✅ Quay lại "Cấu hình" → thêm khách hàng mới (VD: "Công ty ABC") → lưu
- [x] ✅ Chuyển sang "Đơn hàng" → tạo đơn hàng mới → gõ tên khách hàng → thấy gợi ý
      khách hàng mới **ngay tức thì** (autocomplete cập nhật)
- [x] ✅ **KHÔNG thể chỉnh sửa các khóa như `approvalFlowEnabled`, `Security` từ giao diện cấu hình**
      — chỉ những khóa được phép (trạng thái, uomList, customerList) mới xuất hiện
- [x] ✅ **Bảo vệ dữ liệu**: Reload trang "Đơn hàng" → bộ chọn trạng thái vẫn chứa trạng thái mới
      (dữ liệu không bị mất)
- [x] ✅ **(điện thoại)** Mở tab "Cấu hình" trên điện thoại → thêm một danh sách mới →
      chuyển sang tab khác → xác nhận danh sách đó xuất hiện ngay (giao diện responsive)

---

## H. Liên kết mã hàng (5.5, Giai đoạn 5)

Khi nhân viên bán tạo/sửa đơn hàng, họ có thể tìm kiếm mã hàng và tự động điền thông tin.

- [x] ✅ **Đăng nhập bằng tài khoản sales** (nhân viên bán)
- [x] ✅ Chuyển đến "Đơn hàng" → tạo đơn hàng mới → thêm dòng sản phẩm
- [x] ✅ Trong ô "Mã hàng", nhập một phần mã sản phẩm (VD: "SP-") → thấy gợi ý danh sách
      sản phẩm phù hợp
- [x] ✅ Chọn một sản phẩm từ gợi ý → **Tên hàng** và **Đơn vị tính** được tự động điền
- [x] ✅ Giá mặc định (nếu có) cũng được điền từ sản phẩm
- [x] ✅ Nhập mã hàng **không tồn tại** (VD: "XXX-999") → không có gợi ý → hành động lưu
      đơn hàng vẫn diễn ra (không bắt buộc mã phải tồn tại trong Kho)
- [x] ✅ **Đơn hàng cũ** (trước khi Kho được tạo) vẫn lưu được dù mã hàng không khớp với
      sản phẩm nào
- [x] ✅ Gợi ý sản phẩm hiển thị chính xác khi tìm kiếm theo tên hoặc mã

---

## I. Quyền & điều hướng (5.3, 5.2)

Xác nhận tab "Kho hàng" / "Người dùng" / "Cấu hình" chỉ xuất hiện khi có quyền tương ứng;
server từ chối quyền truy cập trực tiếp nếu URL được gõ tay.

**Sử dụng 3 tài khoản khác nhau:**
- Admin: `manage_inventory = true`, `manage_users = true`, `manage_config = true`
- Sales: `manage_inventory = false`, `manage_users = false`, `manage_config = false`
- Warehouse: `manage_inventory = true`, `manage_users = false`, `manage_config = false`

### I.1 — Trên tài khoản admin

- [x] ✅ Đăng nhập admin → thấy ba tab "Kho hàng", "Người dùng", "Cấu hình" trong menu

### I.2 — Trên tài khoản sales

- [x] ✅ Đăng nhập sales → **không thấy** tab "Kho hàng" trong menu
- [x] ✅ **Không thấy** tab "Người dùng" trong menu
- [x] ✅ **Không thấy** tab "Cấu hình" trong menu
- [x] ✅ Thử dự đoán URL của Kho hàng (VD: `/index.html?view=inventory`) → server từ chối
      với lỗi quyền (không phải hiển thị giao diện kho)
- [x] ✅ Thử dự đoán URL Người dùng / Cấu hình → cũng bị từ chối phía server

### I.3 — Trên tài khoản warehouse

- [x] ✅ Đăng nhập warehouse → **thấy** tab "Kho hàng"
- [x] ✅ **Không thấy** tab "Người dùng"
- [x] ✅ **Không thấy** tab "Cấu hình"
- [x] ✅ Thử truy cập URL "Người dùng" → server từ chối
- [x] ✅ Thử truy cập URL "Cấu hình" → server từ chối

---

## J. Hiệu lực quyền tức thì (5.2, MILESTONES.md:182)

Khi một người dùng khác thay đổi quyền của bạn, lần hành động tiếp theo của bạn phải phản ánh
quyền mới **mà không cần logout/login** và **không cần chờ 2 phút**.

**Sử dụng 2 trình duyệt / 2 thiết bị, hoặc 2 cửa sổ ẩn danh:**

- [x] ✅ **Trình duyệt 1 (người A - admin):** Đăng nhập admin
- [x] ✅ **Trình duyệt 2 (người B - sales):** Đăng nhập sales → vào "Đơn hàng" → xác nhận
      có thể tạo đơn (quyền `create_order = true`)
- [x] ✅ **Người A (trình duyệt 1):** Vào "Người dùng" → tìm người B → sửa quyền → tắt
      `create_order` → lưu → thành công
- [x] ✅ **Người B (trình duyệt 2):** Người B **không logout**, vẫn đang mở tab "Đơn hàng" →
      nhấn "Thêm đơn hàng" → server từ chối: *"Bạn không có quyền tạo đơn hàng"* (`MSG.PERMISSION_DENIED`)
- [x] ✅ Quyền **đã có hiệu lực ngay lập tức**, không cần chờ 2 phút, không cần logout

---

## K. Điện thoại (5.1, 5.2, 5.4)

Kiểm tra giao diện trên một điện thoại thật (iOS Safari hoặc Android Chrome).

Yêu cầu: Các phần tử UI (danh sách, form, checkbox, button) phải hiển thị rõ ràng và có thể
nhấn dễ dàng trên màn hình nhỏ.

### K.1 — Danh sách Kho hàng

- [x] ✅ **(điện thoại)** Mở tab "Kho hàng" → danh sách sản phẩm hiển thị dạng card (mỗi card
      một sản phẩm), không phải bảng (table) bị cắt
- [x] ✅ Mỗi card hiển thị: mã hàng, tên hàng, giá, tồn kho, badge (tồn thấp nếu có)
- [x] ✅ Nhấn card → mở form sửa, form responsive (đủ rộng để gõ, button dễ nhấn)
- [x] ✅ Ô tìm kiếm dễ nhấn; kết quả cập nhật khi gõ (không cần enter)

### K.2 — Danh sách Người dùng

- [x] ✅ **(điện thoại)** Mở tab "Người dùng" → danh sách người dùng dạng card
- [x] ✅ Mỗi card: email, tên, trạng thái (hoạt động/vô hiệu hóa), button sửa
- [x] ✅ Nhấn sửa → form responsive, các ô input dễ nhấn, đủ rộng

### K.3 — Ma trận quyền

- [x] ✅ **(điện thoại)** Mở "Ma trận quyền" → thấy danh sách các thẻ người dùng (card, không phải
      bảng)
- [x] ✅ Mỗi thẻ: email, tên, preset hoặc "Tuỳ chỉnh", button sửa
- [x] ✅ Nhấn sửa → mở 14 checkbox → **tất cả checkbox phải hiển thị rõ ràng** trên màn hình
      điện thoại (không bị cuộn ngang, font đủ lớn để đọc)
- [x] ✅ Checkbox dễ nhấn (kích thước tối thiểu ~ 44×44px, hoặc label lớn bao quanh)
- [x] ✅ Button "Lưu" ở dưới, dễ nhấn

### K.4 — Cấu hình

- [x] ✅ **(điện thoại)** Mở "Cấu hình" → các phần (trạng thái, uomList, customerList) hiển thị
      dạng card hoặc danh sách
- [x] ✅ Button "Thêm" / "Xóa" dễ nhấn
- [x] ✅ Input form responsive

---

## Tóm tắt Tiêu chí thoát (Exit Criteria) — MILESTONES.md:172-186

Sau khi hoàn thành tất cả các mục trên, xác nhận **tất cả 5 tiêu chí** được đáp ứng:

- [x] ✅ **M5-1:** Admin có thể tạo người dùng và đặt quyền mà **không cần mở Google Sheets**
      (Phần D + E chứng minh điều này)
- [x] ✅ **M5-2:** Khi thay đổi quyền của người dùng, lần hành động tiếp theo của họ phản ánh
      quyền mới **ngay lập tức** (Phần J chứng minh)
- [x] ✅ **M5-3:** Quản trị viên cuối cùng không thể bị vô hiệu hóa hoặc mất quyền `manage_users`
      (Phần E.2 chứng minh)
- [x] ✅ **M5-4:** Sản phẩm CRUD hoạt động; `OrderLines.productCode` có thể liên kết sản phẩm
      (Phần A, B, H chứng minh)
- [x] ✅ **M5-5:** Ma trận quyền sử dụng được trên điện thoại (14 checkbox, mỗi thẻ một card)
      (Phần K.3 chứng minh)

---

## Quy trình kiểm tra cuối cùng

1. **Hoàn thành Phần A–J trên PC** → tất cả ✅ trước khi tiếp tục
2. **Thực hiện Phần F, G, K trên điện thoại thật** → xác nhận giao diện responsive
3. **Nếu bất kỳ ❌ nào** → ghi lại trong `TASKS.md`, sửa code, thêm assertion
   ngoại tuyến, chạy tất cả suite → tất cả xanh → re-test phần đó
4. **Toàn bộ danh sách ✅ (không có ❌)** → sẵn sàng ký M5
5. **Cập nhật MILESTONES.md:172** → `☐ Milestone 5` → `☑ Milestone 5 — Inventory + Admin UI *(done YYYY-MM-DD)*`
6. **Cập nhật MILESTONES.md:180-185** → tất cả 5 tiêu chí → ✅
7. **Cập nhật TASKS.md:3016-3017** → M5.1 / M5.2 → ☑
8. **Thêm hàng vào bảng Progress log** với ngày, milestone, ghi chú

---

## Ghi chú bổ sung

- **Không cần Spreadsheet**: Toàn bộ quá trình kiểm tra không mở Google Sheets — đó là
  toàn bộ ý nghĩa của M5.
- **Ba tài khoản thực**: Kiểm tra quyền yêu cầu 3 tài khoản riêng biệt (admin, sales, warehouse),
  không chỉ chuyển quyền của 1 tài khoản.
- **Điện thoại thật**: Phần K yêu cầu **điện thoại iOS/Android thật**, không phải cửa sổ
  trình duyệt thu nhỏ trên PC (trình duyệt không mô phỏng chính xác các ràng buộc bố cục di động).
- **Ngay lập tức**: "Ngay lập tức" = không phải sau 2 phút hoặc độ trễ caching; mỗi hành động
  phải phản ánh ngay sau khi gửi (Phần G, J chứng minh điều này).

---

## Ghi chú từ người kiểm tra

*(Phần này để ghi chú của người làm kiểm tra — ngày, giờ, thiết bị, bất cứ vấn đề gì)*

- Ngày kiểm tra: 2026-09-13
- Thiết bị PC: Không có chi tiết cụ thể — xác nhận bởi chủ dự án
- Thiết bị điện thoại: Không có chi tiết cụ thể — xác nhận bởi chủ dự án
- Ghi chú chung: Không có chi tiết cụ thể — xác nhận bởi chủ dự án
- Các lỗi phát hiện (nếu có): M5-1 phát hiện và sửa trong quá trình test (stale inventory cache on active→inactive toggle) — đã ghi lại trong MILESTONES.md progress log

---

**Phiên bản:** 2026-09-13 · **Trạng thái:** Đã hoàn tất — ký xác nhận 2026-09-13
