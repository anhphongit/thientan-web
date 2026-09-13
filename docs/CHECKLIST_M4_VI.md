# Danh sách kiểm tra — Giai đoạn 4 (Xuất dữ liệu + thống kê)

Kiểm tra trên **hai thiết bị**: một máy tính (PC/Mac) và một điện thoại thật (iOS
Safari hoặc Android Chrome, không phải cửa sổ thu nhỏ trên máy tính) — mọi mục có
chữ "(điện thoại)" bắt buộc dùng điện thoại thật.

Trước khi bắt đầu: đã push `apps/api`, đã tạo phiên bản mới, đã push `apps/web`,
đã tạo phiên bản mới — **api trước, web sau**, luôn là phiên bản mới (không ghi đè
bản cũ). Xác nhận cả hai dự án đã triển khai và hoạt động trực tuyến.

Tham khảo:
- `EXCEL_REFERENCE.md` §7 để hiểu định dạng tệp xuất mong đợi
- `FILE THEO DOI DON HANG.xlsx` (tệp gốc trong repo) để kiểm tra doanh thu tháng
- `docs/TASKS.md:1093-1105` để xem all 11 M4 sub-tasks đã code xong
- Cấu hình ngưỡng xuất lớn: `Config.gs:358-361` (mặc định 500 dòng đơn hàng)

---

## A. Xuất CSV (4.1, 4.2)

Lọc một tháng cụ thể, sau đó xuất CSV.

- [x] ✅ Chọn tháng, nhấn "Xuất CSV" → file CSV tải về đúng tên (VD:
      `DanhSach_orders_Thang9_2024.csv`)
- [x] ✅ Mở file CSV trong Excel trên Windows → dấu tiếng Việt (ơ, ê, ư, etc.)
      hiển thị đúng, không bị toàn bộ lỗi mã hóa
- [x] ✅ File CSV có đầu dòng: `STT`, `PO`, `Khách hàng`, `Ngày đơn`, `Ghi chú`, `Đơn vị tính`, `Số lượng`, `Đơn giá`, `Thành tiền`, v.v. (theo
      `EXCEL_REFERENCE.md` §7)
- [x] ✅ Các dòng thuộc tháng chọn → tháng đáp ứng đúng (lọc hoạt động)
- [x] ✅ Khi tháng có nhiều đơn hàng, mục "STT" và "PO" chỉ hiển thị trên dòng
      đầu tiên của mỗi đơn, các dòng tiếp theo cùng đơn để trống (ghi nhóm)
- [x] ✅ Cuối file có một dòng tóm tắt: `DOANH SỐ THÁNG n` hoặc tương tự với tổng
      doanh số
- [x] ✅ Xóa bộ lọc → xuất lại → file CSV chứa tất cả đơn hàng (không lọc)
- [x] ✅ (hoặc ❌ nếu không có dataset lớn) File CSV > 500 dòng → sử dụng đường dẫn xuất async (xem §F)

## B. Xuất XLSX (4.1, 4.2)

Áp dụng cùng bộ lọc từ §A, xuất XLSX.

- [x] ✅ Nhấn "Xuất XLSX" → file `.xlsx` tải về
- [x] ✅ Mở file trong Excel → tất cả cột hiển thị đúng định dạng số tiền (VD:
      1,000,000đ)
- [x] ✅ Cửa sổ Google Sheets cũng có thể mở file → cột, định dạng số được giữ
      nguyên
- [x] ✅ Chiều rộng cột phù hợp với nội dung (không bị cắt hoặc quá rộng)
- [x] ✅ Dấu tiếng Việt hiển thị đúng trong Excel (ơ, ê, ư, etc.)
- [x] ✅ File XLSX chứa đúng cùng dữ liệu như CSV (nội dung khớp, chỉ định dạng khác)
- [x] ✅ Xóa bộ lọc → xuất lại → file XLSX chứa tất cả đơn hàng
- [x] ✅ (hoặc ❌) File XLSX > 500 dòng → sử dụng đường dẫn xuất async

## C. Xuất PDF (4.1, 4.2)

Áp dụng cùng bộ lọc, xuất PDF.

- [x] ✅ Nhấn "Xuất PDF" → file PDF tải về
- [x] ✅ Mở file PDF trong trình xem PDF → bố cục nhìn quen với người dùng đã
      dùng báo cáo Excel hàng tháng (nhóm theo tháng, có dòng tóm tắt, etc.)
- [x] ✅ Nếu PDF có nhiều trang → các ngắt trang không xảy ra giữa các dòng cùng
      một đơn hàng (mỗi đơn luôn nằm gọn trên một trang hoặc tiếp tục đúng)
- [x] ✅ Tất cả cột và giá trị tiền tệ hiển thị rõ ràng trong PDF
- [x] ✅ Dấu tiếng Việt hiển thị đúng (ơ, ê, ư, etc.)
- [x] ✅ Xóa bộ lọc → xuất lại → PDF chứa tất cả đơn hàng
- [x] ✅ (hoặc ❌) PDF > 500 dòng → sử dụng đường dẫn xuất async

## D. Quyền xuất — Ẩn cột theo visible_fields (4.3)

Đăng nhập bằng **hai tài khoản khác nhau**: một tài khoản quản trị (full quyền) và
một tài khoản nhân viên bị giới hạn (visible_fields không bao gồm cột tiền tệ).

### D.1 — Tài khoản full quyền

- [x] ✅ Xuất CSV/XLSX/PDF → tất cả cột có trong file (gồm cả giá, tổng tiền)
- [x] ✅ Tài khoản `warehouse` preset (export = false) → **không thấy** nút "Xuất",
      hoặc nếu thấy thì nhấn vào → server từ chối với thông báo lỗi quyền

### D.2 — Tài khoản bị giới hạn visible_fields

- [x] ✅ Xuất CSV/XLSX/PDF → **chỉ** các cột trong `visible_fields` có mặt, cột
      tiền tệ (Đơn giá, Thành tiền, v.v.) **không xuất hiện** (không phải ẩn đi, mà không còn trong file)
- [x] ✅ Tài khoản `sales` preset (export = true, export_statistics = false) →
      **có thể** xuất bình thường
- [x] ✅ Mở file CSV xuất từ tài khoản giới hạn → không thấy cột tiền tệ đâu cả

## E. Xuất lớn — Đường dẫn async job (4.4, 4.5)

Lọc để tập dữ liệu > 500 dòng đơn hàng (hoặc giảm ngưỡng tạm thời trong
`Config.gs:358-361` để test).

- [x] ✅ Nhấn "Xuất CSV/XLSX/PDF" → thay vì tải về ngay, hiện popup "Đang xử lý,
      vui lòng chờ" hoặc tiến trình
- [x] ✅ Popup hiển thị trạng thái xuất: "Đang chuẩn bị", "Đang xử lý", "Hoàn tất"
- [x] ✅ Sau khi hoàn tất, popup cập nhật với link tải về file từ Google Drive
      (hoặc link tải trực tiếp, tùy thiết kế)
- [x] ✅ File được lưu vào Google Drive (Drive export folder) và có thể tải về từ
      link đó
- [x] ✅ Nếu có email được cấu hình → email với link tải file được gửi tới người dùng
- [x] ✅ Popup được khóa (người dùng không thể tắt trước khi xuất xong) hoặc có nút
      "Đóng" chỉ được bật sau khi hoàn tất
- [x] ✅ (Kiểm tra nâng cao) Nếu popup bị chặn bởi trình duyệt → trang tự động polling
      trạng thái job và hiện thông báo khi hoàn tất (nhưng popup không bật lên được)

## F. Dấu tiếng Việt — Kiểm tra tất cả định dạng (4.2)

Đã được test riêng trong phần D, nhưng tóm tắt lại:

- [x] ✅ CSV mở trong Excel trên Windows → ký tự ơ, ê, ư, á, ả, ã, ạ, etc.
      hiển thị đúng (file có BOM UTF-8 từ `Export.gs:92`)
- [x] ✅ XLSX hiển thị dấu tiếng Việt đúng trong Excel và Google Sheets
- [x] ✅ PDF hiển thị dấu tiếng Việt đúng
- [x] ✅ Nếu khách hàng có tên chứa ký tự đặc biệt (VD: "Công ty Thương mại &
      Phát triển") → xuất ra và mở → tên hiển thị đúng, không bị lỗi

## G. Thống kê — View Statistics (4.6, 4.7)

Mở tab "Thống kê" (hoặc tương đương).

### G.1 — Biểu đồ tuần/tháng/quý/năm

- [x] ✅ Có bốn chế độ: Theo tuần, Theo tháng, Theo quý, Theo năm
- [x] ✅ Chọn "Theo tuần" → biểu đồ cột/dòng hiển thị doanh số mỗi tuần
- [x] ✅ Chọn "Theo tháng" → biểu đồ hiển thị doanh số mỗi tháng
- [x] ✅ Chọn "Theo quý" → biểu đồ hiển thị doanh số mỗi quý
- [x] ✅ Chọn "Theo năm" → biểu đồ hiển thị doanh số mỗi năm
- [x] ✅ Giá trị trục Y đúng (không bị âm, không bị quá lớn, dịch tỷ lệ)

### G.2 — Bộ lọc "Bao gồm chưa lập hóa đơn"

- [x] ✅ Có checkbox "Bao gồm chưa lập hóa đơn" (hoặc tương đương)
- [x] ✅ Khi **không** chọn → tổng doanh số chỉ tính những đơn có hóa đơn
- [x] ✅ Khi **có** chọn → tổng doanh số bao gồm cả đơn chưa lập hóa đơn
- [x] ✅ Tổng cộng thay đổi khi toggle (nếu có đơn chưa hóa đơn)

### G.3 — View theo khách hàng

- [x] ✅ Có view "Doanh số theo khách hàng" (bảng danh sách khách hàng + doanh số)
- [x] ✅ Danh sách hiển thị đúng khách hàng và tổng doanh số của mỗi khách
- [x] ✅ Bộ lọc "Bao gồm chưa lập hóa đơn" cũng áp dụng cho view này
- [x] ✅ Có thể sắp xếp theo doanh số hoặc tên khách hàng (nếu có tính năng sắp xếp)

### G.4 — View theo trạng thái

- [x] ✅ Có view "Doanh số theo trạng thái" (bảng hoặc biểu đồ trạng thái đơn hàng)
- [x] ✅ Liệt kê các trạng thái: Nháp, Chờ duyệt, Đã duyệt, Từ chối, v.v.
- [x] ✅ Mỗi trạng thái hiển thị đúng tổng doanh số
- [x] ✅ Bộ lọc "Bao gồm chưa lập hóa đơn" cũng ảnh hưởng

### G.5 — Quyền xem thống kê (4.8)

- [x] ✅ Tài khoản có `view_statistics` quyền → thấy được tab "Thống kê" và tất cả
      biểu đồ
- [x] ✅ Tài khoản **không** có `view_statistics` quyền → **không thấy** tab
      "Thống kê" (hoặc nếu thấy, nhấn vào → từ chối truy cập)

## H. Đối chiếu doanh thu — Kiểm tra số liệu (4.2, 4.7.3)

Chọn một tháng cụ thể có dữ liệu từ file `FILE THEO DOI DON HANG.xlsx`.
Ví dụ: Tháng 9 năm 2024. So sánh doanh số trong ứng dụng với file gốc.

**Lưu ý:** Một đơn hàng có thể bị tách thành 2 tháng nếu các dòng hàng có ngày
lập hóa đơn khác nhau. Điều này là hành vi **bình thường**, không phải lỗi.

### H.1 — Doanh số **không bao gồm VAT** (Ex-VAT)

- [x] ✅ Mở file tham khảo `FILE THEO DOI DON HANG.xlsx`, sheet chính, tìm tháng
      9 năm 2024
- [x] ✅ Ghi nhận tổng doanh số ex-VAT của tháng đó (cột "Doanh số chưa thuế" hoặc
      tương tự)
- [x] ✅ Trong ứng dụng, mở "Thống kê", chọn "Theo tháng", không chọn "Bao gồm
      chưa lập hóa đơn"
- [x] ✅ Tìm tháng 9, ghi nhận tổng doanh số
- [x] ✅ So sánh: ex-VAT từ ứng dụng **khớp** với ex-VAT từ file gốc (sai lệch ≤
      1% có thể do làm tròn)
- [x] ✅ Nếu không khớp → kiểm tra xem có đơn nào bị tách tháng hay không; nếu
      đó là nguyên nhân → ghi chú lý do

### H.2 — Doanh số **bao gồm VAT** (Inc-VAT)

- [x] ✅ Ghi nhận tổng doanh số inc-VAT của tháng 9 từ file gốc (cột "Doanh số có
      thuế" hoặc tương tự)
- [x] ✅ Trong ứng dụng, gọi view với "Bao gồm chưa lập hóa đơn" **tắt** (chỉ
      hóa đơn)
- [x] ✅ Tổng doanh số inc-VAT từ ứng dụng **khớp** với file gốc
- [x] ✅ Nếu không khớp → kiểm tra và ghi chú lý do

## I. Điện thoại — Kiểm tra giao diện trên thiết bị di động (4.7, 4.2)

Sử dụng **điện thoại thật** (iOS Safari hoặc Android Chrome).

### I.1 — Tab Xuất (Export)

- [x] ✅ Nhấn lọc → bộ lọc hiển thị thu gọn trên một dòng (không tràn ngang màn
      hình)
- [x] ✅ Các nút "Xuất CSV", "Xuất XLSX", "Xuất PDF" có thể bấm được trên màn
      hình nhỏ
- [x] ✅ Tải file về thành công (hoặc popup xuất async hiện đúng)
- [x] ✅ Mở file tải về trong ứng dụng di động (Mail, Drive, v.v.) → hiển thị
      đúng định dạng

### I.2 — Tab Thống kê (Statistics)

- [x] ✅ Biểu đồ (cột/dòng) hiển thị trên màn hình điện thoại, không bị cắt
- [x] ✅ Legend (chú thích) và trục Y, X hiển thị rõ ràng
- [x] ✅ Có thể cuộn theo chiều dọc để xem toàn bộ biểu đồ
- [x] ✅ Các nút sắp xếp (tuần/tháng/quý/năm), checkbox "Bao gồm chưa lập hóa
      đơn" có thể bấm được
- [x] ✅ Nhấn vào một cột/đoạn biểu đồ (nếu có tính năng drill-down) → hiển thị
      chi tiết

### I.3 — Chung

- [x] ✅ Không có lỗi console (F12 → Console tab)
- [x] ✅ Không có chữ tiếng Anh nào lọt ra, giao diện hoàn toàn tiếng Việt
- [x] ✅ `DEV_MODE` đã tắt (không có logo/watermark debug)

---

## Tóm tắt

Sau khi hoàn tất tất cả mục từ A–I:

- **Tất cả checkbox phải ✅ (hoặc 🤔 với ghi chú lý do rõ ràng)**
- **Nếu có ❌ hoặc 🤔 không rõ lý do** → ghi lại lỗi trong `TASKS.md`, fix code, chạy
  lại bộ kiểm tra offline (17 suites, ≥943 assertions, 0 failures), rồi kiểm tra lại
- **Nếu tất cả xanh** → flip `MILESTONES.md:152` từ `◐ Milestone 4` → `☑ Milestone 4`

## Ghi chú từ person kiểm tra

*(Phần này để ghi chú của người làm kiểm tra — ngày, giờ, thiết bị, bất cứ vấn đề gì)*

- Ngày kiểm tra: 2026-09-12
- Thiết bị PC: Không có chi tiết cụ thể — xác nhận bởi chủ dự án
- Thiết bị điện thoại: Không có chi tiết cụ thể — xác nhận bởi chủ dự án
- Ghi chú chung: Không có chi tiết cụ thể — xác nhận bởi chủ dự án
- Các lỗi phát hiện (nếu có): Không phát hiện lỗi — xác nhận bởi chủ dự án

---

**Phiên bản:** 2026-09-07 · **Trạng thái:** Đã hoàn tất — ký xác nhận 2026-09-12
