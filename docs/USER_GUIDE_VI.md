# Hướng dẫn sử dụng — Ứng dụng Quản lý đơn hàng

**Tài liệu này hướng dẫn nhân viên hiện tại hoàn thành toàn bộ vòng đời đơn hàng**: từ tạo mới, chỉnh sửa, thay đổi trạng thái, cho đến xuất file và xem thống kê. Nội dung được cấu trúc theo các bước công việc hàng ngày, không phải danh sách tính năng.

Nếu bạn chưa biết cách đăng nhập hoặc chuyển tài khoản, xem phần **"Đăng nhập và chuyển tài khoản"** dưới đây. Các phần còn lại giả định bạn đã đăng nhập thành công.

---

## 1. Đăng nhập và chuyển tài khoản

### Lần đầu tiên sử dụng

Ứng dụng sử dụng tài khoản Google của bạn để xác thực danh tính. Khi mở ứng dụng lần đầu:

1. Nhấn nút **"Đăng nhập bằng Google"** (nếu có) hoặc để ứng dụng tự động mở trang đăng nhập Google
2. Chọn tài khoản Google của bạn (tài khoản được cấp hạn trong công ty)
3. Nếu được hỏi, cho phép ứng dụng truy cập thông tin cơ bản của tài khoản

Sau khi đăng nhập thành công, bạn sẽ thấy danh sách đơn hàng hoặc thông báo "Tài khoản của bạn chưa được cấp quyền truy cập" (nếu quản trị viên chưa thiết lập quyền cho bạn). Liên hệ quản trị viên để yêu cầu cấp quyền.

### Chuyển sang tài khoản Google khác

Ứng dụng sử dụng tài khoản Google **chính** (primary account) của profile trình duyệt hiện tại. Để chuyển sang tài khoản khác:

**Cách 1: Sử dụng cửa sổ ẩn danh hoặc profile trình duyệt riêng**
- Mở cửa sổ ẩn danh (Chrome: Ctrl+Shift+N, Safari: Cmd+Shift+N, Firefox: Ctrl+Shift+P)
- Hoặc tạo một profile trình duyệt mới
- Đăng nhập bằng tài khoản Google khác
- Mở ứng dụng — nó sẽ sử dụng tài khoản của profile/cửa sổ hiện tại

**Cách 2: Đăng xuất Google từ profile hiện tại rồi đăng nhập lại**
- Truy cập [myaccount.google.com](https://myaccount.google.com)
- Nhấn **"Đăng xuất"** từ tài khoản hiện tại
- Quay lại ứng dụng — nó sẽ hiển thị lại trang đăng nhập Google
- Đăng nhập bằng tài khoản khác

---

## 2. Màn hình chính — Danh sách đơn hàng

Khi đăng nhập thành công, bạn sẽ thấy tab **"Đơn hàng"** — danh sách tất cả đơn hàng bạn được phép xem.

### Hiểu danh sách

Mỗi thẻ đơn hàng hiển thị:
- **Số đơn** (mã số duy nhất của đơn, VD: "ORD-2026-0001")
- **Số PO khách** (mã tham chiếu từ khách hàng, nếu có)
- **Khách hàng** (tên công ty/cá nhân)
- **Ngày đặt** (ngày tạo đơn)
- **Số dòng hàng** (bao nhiêu mặt hàng trong đơn)
- **Trạng thái** (Nháp, Chờ hàng về, Hàng về, Đã giao chưa xuất, v.v. — xem phần "Thay đổi trạng thái")
- **Tên người tạo** (nhân viên đã tạo đơn)

Bạn chỉ thấy:
- Những đơn hàng bạn được phép xem (nếu không có quyền "Xem toàn bộ đơn hàng", bạn chỉ thấy đơn bạn tạo)
- Những cột dữ liệu mà quyền của bạn cho phép (VD: nhân viên kho có thể không thấy cột giá tiền)

### Tạo đơn hàng mới

1. Nhấn nút **"+ Tạo đơn hàng"** ở trên cùng
2. Một biểu mẫu sẽ mở ra với các trường:
   - **Số PO khách** (tùy chọn): nhập mã PO từ khách hàng
   - **Khách hàng** (bắt buộc): nhập tên khách hàng — ứng dụng sẽ gợi ý từ danh sách khách hàng cũ
   - **Ngày đặt** (bắt buộc): chọn ngày từ bộ chọn ngày
   - **Ghi chú đơn** (tùy chọn): nhập ghi chú chung cho toàn bộ đơn
3. Nhấn **"+ Thêm dòng"** để thêm mặt hàng vào đơn hàng

### Thêm dòng hàng (mặt hàng)

Một đơn hàng có thể chứa một hoặc nhiều dòng hàng. Mỗi dòng là một mặt hàng riêng biệt:

1. Sau khi nhấn **"+ Thêm dòng"**, bạn sẽ thấy một hàng mới với các trường:
   - **Mã hàng** (tùy chọn): nhập mã sản phẩm từ kho hàng (VD: "SP-001") — ứng dụng sẽ gợi ý danh sách sản phẩm
   - **Tên hàng** (bắt buộc): nếu bạn chọn mã hàng từ kho, tên sẽ tự động điền; nếu không, nhập tên hàng tự do
   - **Chi tiết** (tùy chọn): mô tả thêm về mặt hàng (VD: kích cỡ, màu sắc, chi tiết kỹ thuật)
   - **SL** (bắt buộc): số lượng
   - **ĐVT** (bắt buộc): đơn vị tính (Cái, Túi, Hộp, v.v. — chọn từ danh sách)
   - **Đơn giá bán ra (VND)** (tùy chọn): giá tiền mỗi đơn vị
   - **Thuế VAT** (tùy chọn): chọn suất thuế (0%, 5%, 10%, v.v.)
   - **Ghi chú** (tùy chọn): ghi chú riêng cho dòng hàng này
2. Có thể thêm nhiều dòng hàng bằng cách nhấn **"+ Thêm dòng"** lặp lại
3. Để xóa một dòng hàng, nhấn icon **"×"** ở cuối dòng

### Lưu đơn hàng

Khi đã nhập đầy đủ thông tin:

1. Nhấn nút **"Lưu"** ở dưới cùng biểu mẫu
2. Ứng dụng sẽ lưu đơn hàng với trạng thái **"Nháp"** (chưa gửi duyệt)
3. Nếu thành công, bạn sẽ thấy thông báo "Đã lưu thành công" và danh sách sẽ cập nhật
4. Nếu có lỗi, bạn sẽ thấy thông báo lỗi rõ ràng (VD: "Vui lòng nhập trường này")

Bạn có thể quay lại và chỉnh sửa đơn bất kỳ lúc nào khi nó còn ở trạng thái **"Nháp"**.

---

## 3. Sửa đơn hàng

Để chỉnh sửa một đơn hàng đã tạo:

1. Tìm đơn hàng trong danh sách (xem phần **"Tìm kiếm và lọc"** dưới đây)
2. Nhấn vào thẻ đơn hàng để mở biểu mẫu chỉnh sửa
3. Thay đổi các thông tin cần thiết:
   - Thay đổi khách hàng, ngày đặt, ghi chú chung
   - Thay đổi thông tin các dòng hàng (tên, số lượng, giá, v.v.)
   - Thêm hoặc xóa dòng hàng
4. Nhấn **"Lưu"** để lưu thay đổi

**Lưu ý về quyền chỉnh sửa:**
- Bạn chỉ có thể sửa đơn mình tạo, trừ khi bạn có quyền "Xem toàn bộ đơn hàng" (quyền quản trị)
- Nếu ứng dụng từ chối việc chỉnh sửa, bạn sẽ thấy thông báo "Bạn không có quyền thực hiện thao tác này"

---

## 4. Thay đổi trạng thái đơn hàng

Trạng thái đơn hàng theo dõi tiến độ từ khi tạo đến khi hoàn tất:

- **Nháp** — Đơn mới tạo, chưa gửi duyệt
- **Đã xác nhận** — Đơn đã được xác nhận từ khách hàng
- **Chờ hàng về** — Đang chờ hàng từ nhà cung cấp
- **Hàng về** — Hàng đã về kho
- **Đã giao, chưa xuất** — Hàng đã giao cho khách hàng nhưng chưa xuất hoá đơn
- **Đã xuất, chưa TT** — Hoá đơn đã xuất nhưng khách chưa thanh toán
- **Đã thanh toán** — Khách đã thanh toán đầy đủ
- **Đã huỷ** — Đơn đã bị huỷ

### Cách thay đổi trạng thái

Mỗi **dòng hàng** (không phải toàn bộ đơn) có trạng thái riêng:

1. Mở đơn hàng (nhấn vào thẻ đơn trong danh sách)
2. Tìm cột **"Trạng thái"** ở mỗi dòng hàng
3. Nhấn vào dropdown trạng thái của dòng hàng cần thay đổi
4. Chọn trạng thái mới từ danh sách
5. Nếu cần, nhập **"Ghi chú"** giải thích lý do thay đổi
6. Nhấn **"Lưu"** để lưu thay đổi

**Lưu ý:** Nếu trạng thái của tất cả dòng hàng trong đơn đều là "Đã thanh toán", toàn bộ đơn được coi là hoàn tất.

---

## 5. Tìm kiếm và lọc đơn hàng

### Tìm kiếm nhanh

1. Nhấn icon **tìm kiếm** (kính lúp) ở phần lọc
2. Nhập từ khóa tìm kiếm (VD: tên khách hàng, số PO, số đơn)
3. Ứng dụng sẽ lọc danh sách tức thì — chỉ hiển thị những đơn khớp

### Bộ lọc nâng cao

1. Nhấn nút **"Bộ lọc"** (biểu tượng phễu) ở phần filter
2. Bộ lọc sẽ mở ra với các tùy chọn:
   - **Theo khách hàng**: chọn một hoặc nhiều khách hàng
   - **Theo trạng thái**: chọn một hoặc nhiều trạng thái (VD: chỉ "Nháp" hoặc "Chờ hàng về")
   - **Theo ngày**: chọn khoảng ngày (VD: đơn tạo từ đầu tháng 9 trở lại)
   - Các bộ lọc khác tùy thuộc vào quyền của bạn
3. Sau khi chọn, danh sách sẽ cập nhật tự động
4. Để xóa một bộ lọc riêng lẻ, nhấn dấu "×" trên thẻ lọc đó
5. Để xóa tất cả bộ lọc, nhấn "Xóa lọc" (nếu có)

---

## 6. Xuất file dữ liệu

Bạn có thể xuất danh sách đơn hàng (sau khi áp dụng bộ lọc) thành file để mở trong Excel hoặc email cho khách hàng.

### Cách xuất

1. (Tùy chọn) Áp dụng bộ lọc để chỉ xuất những đơn bạn cần
2. Nhấn nút **"Xuất file"** (ở phía trên cùng phần lọc hoặc trong tab "Xuất dữ liệu")
3. Chọn định dạng file muốn xuất:
   - **Xuất CSV** — Tệp văn bản thuần (mở được trong Excel trên Windows)
   - **Xuất XLSX** — Tệp Excel định dạng mới (khuyến khích, hỗ trợ tốt nhất định dạng)
   - **Xuất PDF** — Tệp PDF sẵn sàng in, trình bày chuyên nghiệp
4. File sẽ tải về tự động sau vài giây (hoặc có thể lưu vào Google Drive nếu tệp lớn)

**Lưu ý:**
- File chỉ chứa những cột mà quyền của bạn cho phép xem
- Nếu tệp quá lớn, ứng dụng sẽ xử lý bất đồng bộ — bạn sẽ thấy thông báo "Đang xử lý" và có thể nhận email với link tải về khi hoàn tất
- Tất cả dấu tiếng Việt (ơ, ê, ư, á, v.v.) sẽ hiển thị đúng trong file xuất

---

## 7. Xem thống kê doanh số

Tab **"Thống kê"** hiển thị biểu đồ doanh số theo thời gian, giúp bạn theo dõi hiệu suất bán hàng.

### Mở tab Thống kê

1. Nhấn tab **"Thống kê"** trong menu điều hướng chính
2. Bạn sẽ thấy một biểu đồ cột hiển thị doanh số

### Chọn khoảng thời gian

Trên đầu biểu đồ, có bốn nút để chọn khoảng thời gian:
- **Theo tuần** — Hiển thị doanh số mỗi tuần
- **Theo tháng** — Hiển thị doanh số mỗi tháng (mặc định)
- **Theo quý** — Hiển thị doanh số mỗi quý
- **Theo năm** — Hiển thị doanh số mỗi năm

Nhấn một nút để chuyển đổi biểu đồ.

### Bao gồm hay bao gồm các đơn chưa xuất hoá đơn

Checkbox **"Bao gồm đơn chưa xuất hoá đơn"**:
- **Khi bật** — Doanh số bao gồm cả những đơn mới tạo chưa lập hoá đơn
- **Khi tắt** (mặc định) — Chỉ tính những đơn đã lập hoá đơn

Bật/tắt checkbox để xem doanh số thay đổi.

### Xem thống kê theo khách hàng hoặc trạng thái

Nếu bạn cần xem chi tiết hơn, có thể chuyển từ biểu đồ cột sang:
- **Doanh số theo khách hàng** — Bảng danh sách khách hàng + doanh số mỗi khách
- **Doanh số theo trạng thái** — Bảng danh sách trạng thái + doanh số mỗi trạng thái

---

## 8. Kho hàng — Quản lý sản phẩm (chỉ Quản trị viên / Nhân viên kho)

Nếu bạn có quyền **"Quản lý kho hàng"**, bạn sẽ thấy tab **"Kho hàng"** trong menu.

### Tạo sản phẩm mới

1. Nhấn tab **"Kho hàng"**
2. Nhấn nút **"+ Thêm sản phẩm"**
3. Nhập thông tin:
   - **Mã hàng** (bắt buộc, duy nhất): VD "SP-001"
   - **Tên hàng** (bắt buộc): VD "Nước mắm cơm tấm"
   - **Đơn vị tính** (bắt buộc): chọn từ danh sách (Chiếc, Túi, Hộp, v.v.)
   - **Giá** (bắt buộc): giá tiền mặc định
   - **Tồn kho** (bắt buộc): số lượng hiện có
   - **Tối thiểu** (bắt buộc): mức tồn thấp — khi tồn kho < mức này, sản phẩm được đánh dấu "Tồn thấp"
4. Nhấn **"Lưu"**

### Sửa hoặc xóa sản phẩm

- **Sửa**: Nhấn vào sản phẩm để mở biểu mẫu chỉnh sửa, thay đổi thông tin, nhấn "Lưu"
- **Xóa**: Nhấn icon "×" trên sản phẩm, xác nhận xóa

---

## 9. Quản lý người dùng (chỉ Quản trị viên)

Nếu bạn là quản trị viên (có quyền **"Quản lý người dùng"**), bạn sẽ thấy tab **"Người dùng"** và nút **"Cài đặt hệ thống"** trong menu.

### Tab Người dùng — Thêm nhân viên

1. Nhấn tab **"Người dùng"**
2. Nhấn nút **"+ Thêm người dùng"**
3. Nhập:
   - **Email** (bắt buộc, duy nhất): email của nhân viên (VD: john@example.com)
   - **Tên hiển thị** (bắt buộc): tên hiển thị trong ứng dụng (VD: "Ông John")
   - **Nhóm quyền** (bắt buộc): chọn preset (Quản trị, Nhân viên bán, Nhân viên kho, Kế toán, v.v.)
   - **Trạng thái**: "Đang hoạt động" (mặc định) hoặc "Đã khoá" (để vô hiệu hóa tài khoản)
   - **Ghi chú** (tùy chọn): ghi chú về nhân viên
4. Nhấn **"Lưu"**

Nhân viên sẽ có thể đăng nhập lần tiếp theo bằng email của họ.

### Cài đặt quyền chi tiết

Để tùy chỉnh quyền của một nhân viên (thay vì chỉ chọn preset):

1. Mở tab **"Người dùng"**
2. Nhấn vào nhân viên cần chỉnh sửa
3. Ở mục **"Nhóm quyền chi tiết"**, nhấn nút để mở danh sách 14 checkbox quyền
4. Bật/tắt từng quyền cần thiết:
   - **Xem đơn hàng** — Xem danh sách đơn hàng
   - **Xem toàn bộ đơn hàng** — Xem đơn của tất cả nhân viên (không chỉ của bản thân)
   - **Tạo đơn hàng** — Tạo đơn mới
   - **Sửa đơn hàng** — Chỉnh sửa đơn
   - **Xoá đơn hàng** — Xoá đơn
   - **Đổi trạng thái** — Thay đổi trạng thái dòng hàng
   - **Tìm kiếm/Lọc** — Sử dụng bộ lọc
   - **Xuất file** — Xuất dữ liệu
   - **Xem thống kê** — Xem tab thống kê
   - **Quản lý kho hàng** — Quản lý sản phẩm
   - **Quản lý người dùng** — Thêm/sửa nhân viên
   - v.v.
5. Nhấn **"Lưu"**

---

## 10. Sao lưu dữ liệu (Backup — chỉ Quản trị viên)

Để bảo vệ dữ liệu, quản trị viên có thể sao lưu toàn bộ dữ liệu vào Google Drive.

### Cách sao lưu

1. Nhấn tab **"Người dùng"** (nếu chưa ở đó)
2. Nhấn nút **"Cài đặt hệ thống"** để mở tab cài đặt
3. Ở phần **"Sao lưu dữ liệu"**, nhấn nút **"Sao lưu ngay"**
4. Ứng dụng sẽ hỏi xác nhận — nhấn "OK" để tiếp tục
5. Ứng dụng sẽ tạo một bản sao toàn bộ dữ liệu vào Google Drive (quá trình mất từ vài giây đến vài phút tùy dung lượng dữ liệu)
6. Khi hoàn tất, bạn sẽ thấy thông báo "Đã sao lưu thành công" + link để xem thư mục trên Drive

**Lưu ý:**
- Sao lưu được thực hiện **một lần (thủ công)**. Ngoài ra, ứng dụng cũng có sao lưu **tự động theo lịch trình** (không cần thao tác của bạn)
- File sao lưu được lưu trong một thư mục riêng trên Google Drive của công ty

---

## Xử lý sự cố

### Thông báo lỗi "Đã xảy ra lỗi. Vui lòng thử lại."

Nếu bạn gặp thông báo lỗi chung chung này:

1. **Kiểm tra kết nối mạng** — Đảm bảo máy tính/điện thoại đang kết nối Internet
2. **Tải lại trang** — Nhấn F5 hoặc Cmd+R để tải lại ứng dụng
3. **Thử lại hành động** — Lặp lại thao tác vừa làm (tạo đơn, lưu, v.v.)
4. Nếu lỗi vẫn tiếp tục, liên hệ quản trị viên

### Thông báo "Bạn không có quyền thực hiện thao tác này"

Điều này có nghĩa quản trị viên chưa cấp cho bạn quyền cần thiết. Liên hệ quản trị viên để xin cấp quyền.

### Ứng dụng chậm hoặc không phản hồi

1. Đợi một vài giây (ứng dụng có thể đang tải dữ liệu từ máy chủ)
2. Tải lại trang (F5 hoặc Cmd+R)
3. Kiểm tra kết nối mạng
4. Thử lại sau vài phút

---

## Danh sách từ vựng (Tham khảo)

| Tiếng Anh | Tiếng Việt |
|-----------|-----------|
| Order | Đơn hàng |
| Order line / Line item | Dòng hàng |
| Draft | Nháp |
| Confirmed | Đã xác nhận |
| Waiting for stock | Chờ hàng về |
| Stock arrived | Hàng về |
| Delivered, not invoiced | Đã giao, chưa xuất |
| Invoiced, unpaid | Đã xuất, chưa TT |
| Paid | Đã thanh toán |
| Cancelled | Đã huỷ |
| Status | Trạng thái |
| Note | Ghi chú |
| Unit of measure (UOM) | Đơn vị tính (ĐVT) |
| Quantity (Qty) | Số lượng (SL) |
| Unit price | Đơn giá |
| Amount ex-VAT | Thành tiền chưa VAT |
| Amount inc-VAT | Trị giá hoá đơn |
| Customer | Khách hàng |
| Product code | Mã hàng |
| Product name | Tên hàng |
| Low stock | Tồn thấp |
| Save | Lưu |
| Delete | Xoá |
| Edit | Sửa |
| Filter | Lọc |
| Search | Tìm kiếm |
| Export | Xuất file |
| Statistics | Thống kê |
| Inventory | Kho hàng |
| Users | Người dùng |
| Settings | Cài đặt |

---

**Phiên bản:** 2026-09-15 — **Dành cho:** Nhân viên hiện tại — **Liên hệ quản trị viên để yêu cầu cấp quyền hoặc báo lỗi**
