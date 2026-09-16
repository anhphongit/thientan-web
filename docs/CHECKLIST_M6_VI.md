# Danh sách kiểm tra — Giai đoạn 6 (Hướng dẫn người dùng + Hoàn tất Milestone 6)

Kiểm tra trên **hai thiết bị**: một máy tính (PC/Mac) và một điện thoại thật (iOS Safari hoặc Android Chrome, không phải cửa sổ thu nhỏ trên máy tính) — mọi mục có chữ "(điện thoại)" bắt buộc dùng điện thoại thật.

Trước khi bắt đầu:
1. Đã push `apps/api`, đã tạo phiên bản mới
2. Đã push `apps/web`, đã tạo phiên bản mới — **api trước, web sau**
3. Xác nhận cả hai dự án đã triển khai và hoạt động trực tuyến
4. Đã tạo file `docs/USER_GUIDE_VI.md` (phần hướng dẫn người dùng)

Tham khảo:
- `MILESTONES.md:188-197` để hiểu tiêu chí thoát M6
- `PERMISSIONS.md` §1-3 để xem ma trận quyền đầy đủ (14 quyền + visible_fields)
- `GLOSSARY_VI.md` để kiểm tra từ vựng Vietnamese

---

## A. Responsive / thiết bị di động (Milestone 6 / Phase 4)

Kiểm tra các fix nhắm riêng vào iOS Safari chạy **bên trong iframe sandbox của Apps
Script** (`apps/web/Main.gs:doGet`) — chiều cao `100dvh` + dự phòng JS, bàn phím ảo
không che ô nhập (`interactive-widget=resizes-content`), vùng an toàn notch/home-
indicator (`env(safe-area-inset-*)`), vùng chạm ≥44×44px, và cuộn không "nảy" ra
ngoài trang (`overscroll-behavior: contain`). Bắt buộc dùng **điện thoại thật** (iOS
Safari + Android Chrome), không phải cửa sổ trình duyệt thu nhỏ trên PC — trình duyệt
PC không mô phỏng đúng các hành vi này (đặc biệt `dvh`, bàn phím ảo, safe-area).

- [ ] **(điện thoại, iOS Safari)** Mở app → trong lúc màn hình "Đang tải..." còn hiện,
      cuộn nhẹ lên xuống để Safari ẩn/hiện thanh địa chỉ → spinner + chữ "Đang tải..."
      luôn nằm giữa màn hình, không bị cắt trên/dưới, không để lại khoảng trắng lớn ở
      đáy màn hình
- [ ] **(điện thoại)** Xoay ngang/dọc khi đang ở màn hình "Đang tải..." hoặc "Không
      truy cập được" → nội dung vẫn căn giữa, không tràn, không bị cắt
- [ ] **(điện thoại, iOS Safari)** Mở tab "Đơn hàng" → vuốt nhanh lên xuống trong danh
      sách đơn, chạm đúng mép trên/mép dưới danh sách → trang KHÔNG bị "nảy" (bounce)
      lan ra toàn trang phía sau
- [ ] **(điện thoại)** Thanh điều hướng (Đơn hàng/Kho hàng/Thống kê/...) khi đủ tab để
      cuộn ngang → vuốt ngang hết cỡ sang trái/phải → không kéo theo trang cuộn dọc
      cùng lúc
- [ ] **(điện thoại, iOS Safari)** Mở form tạo/sửa đơn hàng → chạm vào một ô nhập liệu
      (VD: tên khách hàng, ghi chú dòng hàng) → bàn phím ảo hiện lên → ô đang gõ
      **không bị bàn phím che khuất**, trang tự thu nhỏ để lộ ô nhập (không cần cuộn
      tay để tìm lại ô đang gõ)
- [ ] **(điện thoại)** Trong form đơn hàng, chạm vào ô chọn trạng thái từng dòng hàng
      (dropdown trạng thái) → dễ chạm trúng ngay lần đầu, không cần rà tay
- [ ] **(điện thoại)** Trên thẻ đơn hàng ở danh sách, chạm vào icon mũi tên nhỏ cạnh mã
      đơn (nút mở menu duyệt: Gửi duyệt/Duyệt/Từ chối/Về Nháp) → mở đúng menu ngay cả
      khi chạm hơi lệch khỏi icon, không cần ngắm chính xác pixel
- [ ] **(điện thoại)** Trong bộ lọc đơn hàng, chạm nút icon tìm kiếm/xoá tìm kiếm và nút
      "Bộ lọc" → dễ chạm, không cần chạm 2-3 lần mới trúng
- [ ] **(điện thoại)** Khi có từ 2 thẻ lọc "đang áp dụng" trở lên, chạm nút "×" trên
      từng thẻ để xoá → xoá đúng thẻ vừa chạm, không xoá nhầm thẻ bên cạnh
- [ ] **(điện thoại, iOS Safari — máy có notch/Dynamic Island)** Mở một dialog (popup
      xác nhận xoá/duyệt đơn, hoặc dialog "Xuất file") ở cả hai chiều ngang/dọc → nội
      dung dialog không bị notch hoặc thanh home-indicator che khuất hay cắt mất
- [ ] **(điện thoại)** Mở dialog "Xuất file" khi nội dung đủ dài để cuộn (VD: bật thêm
      cảnh báo ngày hoá đơn) → cuộn được bên trong dialog, cuộn chạm đáy dialog không
      kéo theo trang phía sau nảy theo
- [ ] **(điện thoại)** Sau một hành động hiện toast (VD: "Đã lưu đơn hàng") → toast ở
      đáy màn hình không bị thanh home-indicator che khuất hoặc đè lên
- [ ] **(điện thoại)** Ở tab "Kho hàng", chạm vào checkbox lọc ("Chỉ hiển thị hàng tồn
      thấp") hoặc chữ nhãn cạnh nó → dễ chạm, cả chạm vào ô vuông lẫn chạm vào chữ đều
      bật/tắt được, không cần rà tay chính xác vào ô vuông nhỏ
- [ ] **(điện thoại)** Mở "Ma trận quyền" → sửa quyền một người dùng → 14 checkbox
      permission + checkbox cấu hình cột hiển thị (visible fields) → vẫn dễ chạm như
      đã xác nhận ở M5 (Phần K.3), không có hồi quy sau các thay đổi CSS của M6
- [ ] **(điện thoại)** Mở tab "Thống kê" → biểu đồ cột hiển thị đúng, không tràn ngang
      màn hình; chạm vào công tắc "Bao gồm đơn chưa xuất hoá đơn" hoặc chữ nhãn cạnh
      nó → dễ bật/tắt
- [ ] **(điện thoại, Android Chrome)** Lặp lại các bước: form đơn hàng (bàn phím ảo),
      cuộn danh sách đơn hàng, mở dialog xuất file, thẻ lọc → hành vi tương tự iOS
      (Android không có notch/`dvh` quirk giống iOS nhưng vẫn cần xác nhận không có
      hồi quy chung)
- [ ] Nếu bất kỳ mục nào ❌ → ghi lại thiết bị/hệ điều hành cụ thể, chụp màn hình nếu
      có thể, đối chiếu với `plans/260913-2326-milestone-6-hardening-and-polish/
      phase-04-mobile-responsive-hardening.md` (phần "Risk Assessment" đã lường trước
      một số giả định chỉ xác minh được trên thiết bị thật) trước khi sửa

---

## B. Sao lưu dữ liệu (Milestone 6 / Phase 1)

### B.1 — Nút "Sao lưu ngay" (backup thủ công)

- [ ] ✅ Đăng nhập bằng tài khoản có quyền `manage_users` (quản trị viên)
- [ ] ✅ Vào tab "Người dùng" → nhấn "Cài đặt hệ thống"
- [ ] ✅ Ở phần "Sao lưu dữ liệu", thấy nút **"Sao lưu ngay"**
- [ ] ✅ Nhấn nút → ứng dụng hỏi xác nhận "Tạo bản sao lưu dữ liệu vào Google Drive ngay bây giờ?"
- [ ] ✅ Nhấn "OK" để xác nhận
- [ ] ✅ Ứng dụng hiển thị "Đang sao lưu..." → sau vài giây đến vài phút (tùy dung lượng dữ liệu), hiển thị "Đã sao lưu thành công"
- [ ] ✅ Thông báo hiển thị link "Xem thư mục trên Drive"
- [ ] ✅ Nhấn link → mở Google Drive, thư mục sao lưu có chứa file(s) với dữ liệu (kiểm tra nhanh: file có kích thước > 0 KB, không rỗng)
- [ ] ✅ Mở file sao lưu từ Drive (VD: tệp .xlsx hoặc `.sheets`) → dữ liệu hiển thị đầy đủ, không bị lỗi

### B.2 — Sao lưu tự động (Milestone 6 / Phase 1 — stretch goal)

**Sửa 2026-09-16:** lịch sao lưu tự động **không có UI cấu hình** trong ứng dụng web — đây là quyết
định thiết kế có chủ đích (giống các trigger định kỳ khác của hệ thống: nhắc xoay mã bí mật, dọn dẹp
file xuất, keep-warm), không phải thiếu sót. Cài đặt lịch là thao tác một lần, thực hiện trực tiếp
trong Apps Script editor, không qua tab "Cài đặt" của ứng dụng.

- [ ] ✅ Mở Apps Script editor của dự án **apps/api** (Extensions → Apps Script, hoặc `clasp open`
      trong thư mục `apps/api/`) → chọn hàm `installBackupTrigger` ở dropdown trên cùng → **Run**
      (chỉ cần chạy một lần; chạy lại vẫn an toàn, không tạo trùng trigger)
- [ ] ✅ Vào tab "Người dùng" → "Cài đặt hệ thống" → mục **"Tình trạng hệ thống"** → dòng "Sao lưu
      tự động" hiển thị "✅ Đã cài đặt" (đây là cách kiểm tra nhanh nhất, không cần mở Apps Script)
- [ ] ✅ (Tuỳ chọn, để kiểm tra ngay không cần chờ đến 2h sáng) Trong Apps Script editor, chọn hàm
      `runScheduledBackup_` → **Run** → kiểm tra tab "Executions" không có lỗi, có thư mục sao lưu
      mới trong Drive, và "Tình trạng hệ thống" cập nhật "Sao lưu gần nhất"
- [ ] ✅ File sao lưu tự động lưu vào Google Drive, tên thư mục chứa timestamp (VD: `2026-09-16_020000`)

**Kiểm tra các trigger định kỳ khác cùng lúc (không phải yêu cầu bắt buộc của M6, nhưng nên xác
nhận không thiếu bước cài đặt nào từ `docs/SETUP.md`):** mục "Tình trạng hệ thống" cũng liệt kê
"Dọn dẹp file xuất (export)", "Nhắc xoay mã bí mật", "Giữ ấm hệ thống (keep-warm)" — mỗi dòng phải
hiển thị "✅ Đã cài đặt"; dòng nào "⚠️ Chưa cài đặt" thì chạy hàm `install...` tương ứng được nêu
ngay trong dòng đó.

---

## C. Xử lý lỗi — Kiểm tra thông báo lỗi (Milestone 6 / Phase 2)

Kiểm tra rằng thông báo lỗi được hiển thị bằng **tiếng Việt cô lập** (không chứa stack trace hoặc chi tiết kỹ thuật).

### C.1 — Lỗi xác thực (validation error)

- [ ] ✅ Mở tab "Đơn hàng" → nhấn "Tạo đơn hàng"
- [ ] ✅ **Không nhập gì**, nhấn "Lưu" → ứng dụng hiển thị lỗi "Vui lòng nhập trường này" (tiếng Việt, đơn giản)
- [ ] ✅ Lỗi **không** chứa:
      - Stack trace hoặc dòng lỗi JavaScript
      - Tên function hoặc file code (`TypeError: ...`, `apps/api/...`)
      - Hex codes hoặc mã lỗi kỹ thuật
- [ ] ✅ Thông báo lỗi **chỉ** là tiếng Việt rõ ràng (VD: "Vui lòng nhập trường này", "Không kết nối được máy chủ")

### C.2 — Lỗi quyền hạn

- [ ] ✅ Đăng nhập bằng tài khoản **không** có quyền `create_order` (VD: nhân viên kho)
- [ ] ✅ Cố gắng tạo đơn hàng hoặc nhấn nút tạo → ứng dụng từ chối với thông báo "Bạn không có quyền thực hiện thao tác này"
- [ ] ✅ Thông báo **không** chứa chi tiết kỹ thuật

### C.3 — Lỗi mạng

- [ ] ✅ Tắt kết nối mạng (hoặc mở DevTools, throttle Network)
- [ ] ✅ Thực hiện một hành động (lưu đơn, tìm kiếm, xuất file) → thấy thông báo "Không kết nối được máy chủ. Kiểm tra kết nối mạng."
- [ ] ✅ Thông báo là tiếng Việt rõ ràng, không phải JavaScript error

---

## D. Kiểm tra Vietnamese sweep (Milestone 6 / Phase 5)

Kiểm tra rằng **toàn bộ giao diện** sử dụng từ vựng tiếng Việt đã phê duyệt, không có chữ tiếng Anh lọt ra ngoài.

### D.1 — Danh sách kiểm tra từ vựng chính

- [ ] ✅ Tab chính: "Đơn hàng", "Kho hàng", "Thống kê", "Người dùng" (không phải "Orders", "Inventory", v.v.)
- [ ] ✅ Nút hành động: "Lưu", "Huỷ", "Sửa", "Xoá", "Thêm dòng", "Xuất file", "Lọc", "Tìm kiếm"
- [ ] ✅ Trạng thái: "Nháp", "Đã xác nhận", "Chờ hàng về", "Hàng về", "Đã giao chưa xuất", "Đã xuất chưa TT", "Đã thanh toán", "Đã huỷ"
- [ ] ✅ Nhãn trường: "Số đơn", "Số PO khách", "Khách hàng", "Ngày đặt", "Chi tiết", "SL", "ĐVT", "Đơn giá bán ra (VND)", "Thành tiền chưa VAT", "Trị giá HĐ", "Hóa đơn ra", "Ngày HĐ", "Ghi chú", "Người tạo"
- [ ] ✅ Thông báo: "Đang tải...", "Đã lưu thành công", "Bạn không có quyền thực hiện thao tác này", "Không kết nối được máy chủ"

### D.2 — Kiểm tra loanwords được phê duyệt (GLOSSARY_VI.md)

Những từ **cố ý giữ nguyên tiếng Anh** (tham khảo GLOSSARY_VI.md "Loanwords"):

- [ ] ✅ "Email" (không phải "Thư điện tử") — xuất hiện ở form người dùng
- [ ] ✅ "PDF" — xuất hiện ở nhãn tùy chọn xuất file
- [ ] ✅ "Excel" — xuất hiện ở nhãn tùy chọn xuất file
- [ ] ✅ Tên trình duyệt (Chrome, Firefox, Edge, Safari) — giữ nguyên trong thông báo account-switch (nếu có)

### D.3 — Chạy lint script (Phase 5)

- [ ] ✅ Chạy Phase 5's Vietnamese lint script (nếu tồn tại): `node .claude/scripts/check-vietnamese.js` hoặc tương tự
- [ ] ✅ Script không báo cáo **chữ tiếng Anh không mong muốn** ngoài loanwords được phê duyệt

### D.4 — Kiểm tra manual trên giao diện thực tế (PC và điện thoại)

- [ ] ✅ Mở ứng dụng trên PC → kiểm tra nhanh: tất cả button, label, thông báo đều tiếng Việt
- [ ] ✅ **(điện thoại)** Mở ứng dụng trên điện thoại → kiểm tra: menu, form, thông báo đều tiếng Việt
- [ ] ✅ Không thấy bất kỳ chữ tiếng Anh nào (ngoài loanwords được phê duyệt)

---

## E. Ma trận quyền đầy đủ (Full Permission Matrix Re-check)

**Lưu ý tiêu chí thoát M6 (MILESTONES.md:195):** "Ma trận quyền hoàn toàn hoạt động với tất cả 14 + visible_fields, không có tác dụng phụ hoặc hồi quy."

Kiểm tra **tất cả 14 quyền** + cơ chế `visible_fields` (cấu hình cột hiển thị). Tham khảo `PERMISSIONS.md` §1-3 để xem danh sách đầy đủ.

### E.1 — Cơ bản: 14 quyền boolean

| Quyền | Kiểm tra |
|-------|----------|
| `view_orders` | [ ] ✅ Người dùng **có** quyền → thấy tab "Đơn hàng" + danh sách. **Không có** → tab không hiển thị |
| `view_all_orders` | [ ] ✅ **Có** → thấy đơn của tất cả nhân viên. **Không** → chỉ đơn của bản thân. **Ownership check**: thử sửa đơn người khác → server từ chối |
| `create_order` | [ ] ✅ **Có** → nút "Tạo đơn hàng" hiển thị, có thể tạo. **Không** → nút ẩn hoặc server từ chối |
| `edit_order` | [ ] ✅ **Có** → có thể sửa đơn hàng. **Không** → nút sửa ẩn hoặc server từ chối |
| `delete_order` | [ ] ✅ **Có** → nút xoá xuất hiện, có thể xoá. **Không** → nút ẩn hoặc server từ chối |
| `change_status` | [ ] ✅ **Có** → có thể thay đổi trạng thái dòng hàng. **Không** → dropdown trạng thái ẩn hoặc server từ chối |
| `approve_order` | [ ] ✅ Chỉ có tác dụng khi `approvalFlowEnabled = TRUE` (hiện tại FALSE). **Ghi chú**: Kiểm tra rằng quyền không gây lỗi khi flag tắt |
| `can_edit_approved_order` | [ ] ✅ Chỉ có tác dụng khi `approvalFlowEnabled = TRUE`. **Ghi chú**: Tương tự, không gây lỗi khi flag tắt |
| `search_filter` | [ ] ✅ **Có** → bộ lọc + tìm kiếm hoạt động. **Không** → nút lọc ẩn hoặc server từ chối |
| `export` | [ ] ✅ **Có** → nút "Xuất file" hiển thị, có thể xuất. **Không** → nút ẩn hoặc server từ chối |
| `view_statistics` | [ ] ✅ **Có** → tab "Thống kê" hiển thị. **Không** → tab ẩn hoặc server từ chối |
| `export_statistics` | [ ] ✅ Hiện không thực thi (reserved, PERMISSIONS.md). **Ghi chú**: Quyền không gây lỗi, không hiển thị UI gì |
| `manage_inventory` | [ ] ✅ **Có** → tab "Kho hàng" hiển thị, có thể CRUD sản phẩm. **Không** → tab ẩn hoặc server từ chối |
| `manage_users` | [ ] ✅ **Có** → tab "Người dùng" + nút "Cài đặt hệ thống" hiển thị. **Không** → tab ẩn hoặc server từ chối |

### E.2 — visible_fields: Cấu hình cột hiển thị per-user

- [ ] ✅ Mở tab "Người dùng" → chỉnh sửa một nhân viên
- [ ] ✅ Ở phần "Cấu hình cột hiển thị", xem danh sách checkbox cột (po, poNote, customer, orderDate, status, statusNote, description, qty, uom, invoiceNo, invoiceDate, v.v.)
- [ ] ✅ **Bật/tắt một checkbox cột** (VD: ẩn "Đơn giá bán ra (VND)") → Lưu
- [ ] ✅ **Đăng nhập lại bằng tài khoản vừa sửa** (hoặc trong cửa sổ khác)
- [ ] ✅ Mở danh sách đơn hàng → **cột bị tắt không xuất hiện** (không bị ẩn bằng CSS, mà thực sự không có trong dữ liệu trả về từ server)
- [ ] ✅ Thử sửa đơn hàng → **cột ẩn không có input field** (form không hiển thị cột bị ẩn)
- [ ] ✅ Xuất file (CSV/XLSX/PDF) → **file không chứa cột ẩn**
- [ ] ✅ Mở "Thống kê" → **thống kê chỉ dùng cột trong visible_fields** (nếu "Đơn giá" ẩn, doanh số có thể không tính hoặc hiển thị khác)
- [ ] ✅ **Master toggle "Toàn bộ cột"**:
      - Bật → tất cả cột được hiển thị
      - Tắt → tất cả cột bị ẩn (chỉ hiển thị thông tin nhân dân sự cơ bản)
- [ ] ✅ Bộ lọc cũng respects visible_fields (không lọc theo cột ẩn)

### E.3 — Kiểm tra quyền từ chối (deny by default)

- [ ] ✅ Tạo một user **mới không có quyền gì** (hoặc clear tất cả checkbox)
- [ ] ✅ Đăng nhập bằng user đó → thấy thông báo "Bạn không có quyền truy cập" hoặc không thấy bất kỳ tab nào
- [ ] ✅ Cố gắng gọi API từ console (VD: `google.script.run.actionListOrders(...)`) → server từ chối với lỗi quyền

### E.4 — Hiệu lực ngay lập tức (instantaneous enforcement)

**Tiêu chí thoát M6:** Thay đổi quyền của một user phải có tác dụng **ngay lập tức** trên request tiếp theo (không cần logout/login, không cần chờ cache).

- [ ] ✅ Mở **2 cửa sổ trình duyệt**: Cửa sổ A (quản trị viên, đã đăng nhập), Cửa sổ B (nhân viên bán, đã đăng nhập)
- [ ] ✅ **Cửa sổ B**: Tạo một đơn hàng thành công (quyền `create_order = true`)
- [ ] ✅ **Cửa sổ A**: Vào "Người dùng" → sửa nhân viên ở Cửa sổ B → **tắt quyền `create_order`** → Lưu
- [ ] ✅ **Cửa sổ B**: Không logout, không refresh → nhấn nút "Tạo đơn hàng" → server từ chối: "Bạn không có quyền tạo đơn hàng"
- [ ] ✅ Quyền **đã có hiệu lực ngay lập tức**, không có delay 2 phút

### E.5 — Bảo vệ quản trị viên (admin self-protection, last admin)

- [ ] ✅ **Self-removal block**: Quản trị viên không thể tự cấp/hủy quyền `manage_users` của chính mình → server từ chối (PERMISSIONS.md §4.6)
- [ ] ✅ **Last admin block**: Admin cuối cùng (duy nhất có `manage_users` + `active=true`) không thể bị vô hiệu hóa → server từ chối (Phần E của CHECKLIST_M5_VI.md)

---

## F. Hướng dẫn người dùng (USER_GUIDE_VI.md)

### F.1 — File tồn tại và đầy đủ

- [ ] ✅ File `docs/USER_GUIDE_VI.md` tồn tại
- [ ] ✅ File bao gồm các phần:
      - Đăng nhập / Chuyển tài khoản
      - Danh sách đơn hàng + tìm kiếm/lọc
      - Tạo đơn hàng mới (multi-line)
      - Sửa đơn hàng
      - Thay đổi trạng thái
      - Xuất file (CSV/XLSX/PDF)
      - Xem thống kê
      - Kho hàng (nếu có quyền)
      - Quản lý người dùng (nếu là admin)
      - **Sao lưu dữ liệu** (nút "Sao lưu ngay" + nơi tìm nó)

### F.2 — Sử dụng từ vựng đúng

- [ ] ✅ Hướng dẫn sử dụng **toàn bộ tiếng Việt**, không có chữ tiếng Anh ngoài loanwords
- [ ] ✅ Sử dụng từ vựng từ `GLOSSARY_VI.md`
- [ ] ✅ Tên nút, trường, tab khớp với UI thực tế

### F.3 — Kiểm tra tính chính xác

Chọn **một số mục ngẫu nhiên** từ hướng dẫn và kiểm tra trên UI:

- [ ] ✅ Các bước để "Tạo đơn hàng" → thực hiện → khớp với hướng dẫn
- [ ] ✅ Các bước để "Xuất file" → thực hiện → khớp với hướng dẫn
- [ ] ✅ Các bước để "Sao lưu ngay" → thực hiện → khớp với hướng dẫn
- [ ] ✅ Các tên nút, nhãn trường trong hướng dẫn → kiểm tra trên UI → khớp chính xác

---

## Tóm tắt

Sau khi hoàn tất tất cả mục từ A–F:

- **Tất cả checkbox phải ✅ (hoặc 🤔 với ghi chú lý do rõ ràng)**
- **Nếu có ❌ hoặc 🤔 không rõ lý do** → ghi lại vấn đề, fix code/docs, re-test mục đó
- **Nếu tất cả xanh** → sẵn sàng ký M6 (Phần 7: Live verification)
- **Cập nhật MILESTONES.md:188** → `◐ Milestone 6` → `☑ Milestone 6 *(done YYYY-MM-DD)*`
- **Cập nhật MILESTONES.md:189-197** → tất cả 9 tiêu chí thoát → ✅

---

## Ghi chú từ người kiểm tra

*(Phần này để ghi chú của người làm kiểm tra — ngày, giờ, thiết bị, bất cứ vấn đề gì)*

- Ngày kiểm tra: _______________
- Thiết bị PC: _________________
- Thiết bị điện thoại: __________
- Ghi chú chung: _______________
- Các lỗi phát hiện (nếu có): ____________

---

**Phiên bản:** 2026-09-15 · **Trạng thái:** Dự thảo — Chờ live verification (Phần 7)
