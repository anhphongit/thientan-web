# Danh sách kiểm tra — Giai đoạn 3 (Lọc, tìm kiếm, trạng thái, duyệt)

Kiểm tra trên **hai tài khoản**: một tài khoản có đủ quyền quản trị (máy tính)
và một tài khoản nhân viên bị giới hạn quyền (điện thoại thật, không phải cửa
sổ thu nhỏ trên máy tính) — mọi mục có chữ "(nhân viên)" bắt buộc dùng tài
khoản thứ hai.

Trước khi bắt đầu: đã push `apps/api`, đã tạo phiên bản mới, đã push
`apps/web`, đã tạo phiên bản mới — **api trước, web sau**, luôn là phiên bản
mới (không ghi đè bản cũ).

Mục §I (duyệt đơn) đã có thể kiểm — task 3.8 đã code xong (2026-09-02, xem
`TASKS.md`, "Milestone 3, task 3.8"). Trước khi kiểm §I: chạy
`migrateAddApproveStatus()` một lần trên sheet thật, rồi bật cờ
`approvalFlowEnabled` trong sheet `Config`.

---

## A. Lọc theo tháng / khoảng ngày (3.2)

- [ ] Chọn một tháng cụ thể → danh sách chỉ còn đơn thuộc tháng đó
- [ ] Xoá lọc → danh sách trở lại đầy đủ (theo quyền của tài khoản)
- [ ] (nhân viên) Lọc theo tháng vẫn chỉ thấy đơn do mình tạo, không thấy đơn
      người khác dù đơn đó đúng tháng đang lọc

## B. Lọc khách hàng / trạng thái / người tạo (3.3)

- [ ] Lọc riêng theo khách hàng → đúng các đơn của khách đó
- [ ] Lọc riêng theo trạng thái → đúng các đơn có trạng thái đó
- [ ] Kết hợp khách hàng + trạng thái → chỉ còn đơn khớp **cả hai** điều kiện
- [ ] (nhân viên không có `view_all_orders`) Không thấy ô lọc "Người tạo"
- [ ] (tài khoản có `view_all_orders`) Ô lọc "Người tạo" hiện đủ danh sách,
      chọn một người → chỉ còn đơn người đó tạo

## C. Tìm kiếm tự do (3.4)

- [ ] Gõ một phần số PO → tìm ra đúng đơn chứa số đó
- [ ] Gõ tên khách hàng (một phần) → tìm ra đúng đơn của khách đó
- [ ] Gõ một từ trong nội dung dòng hàng → tìm ra đúng đơn chứa dòng đó
- [ ] Nhấn Enter trong ô tìm kiếm → tìm ngay, không cần bấm nút khác
- [ ] Nút tìm kiếm (kính lúp) chỉ bật khi có gõ chữ mới; gõ lại đúng câu vừa
      tìm thì nút vẫn tắt
- [ ] Kết hợp tìm kiếm với bộ lọc khác (VD: tìm + lọc khách hàng) → ra đúng
      kết quả thoả **cả hai**
- [ ] (nhân viên không thấy PO/khách hàng theo `visible_fields`) Gõ đúng số
      PO thật của một đơn **không hiện được ra** — đây là lỗi rò rỉ dữ liệu
      nghiêm trọng nếu tìm ra, kiểm tra kỹ

## D. Đổi trạng thái nhanh từ danh sách (3.5)

- [ ] Trên thẻ đơn, bấm vào nhãn trạng thái → hiện popup xác nhận đổi trạng
      thái (không phải hộp thoại của trình duyệt)
- [ ] Xác nhận đổi → trạng thái cập nhật ngay trên thẻ, có thông báo "Đã đổi
      trạng thái"
- [ ] Bấm "Không" trên popup → trạng thái giữ nguyên, ô chọn trở lại giá trị cũ
- [ ] Trong lúc đang đổi (trước khi server trả lời), thẻ đơn không cho bấm mở
      chi tiết đơn đó
- [ ] Mở sheet `StatusHistory`: có thêm một dòng ghi rõ trạng thái cũ, trạng
      thái mới, ai đổi, lúc nào
- [ ] (nhân viên không có `change_status`) Không thấy được đổi trạng thái từ
      danh sách
- [ ] Mở lại chi tiết một đơn **vừa đổi trạng thái nhanh** từ danh sách →
      chi tiết hiện đúng trạng thái mới, không phải trạng thái cũ trong cache

## E. Popup xác nhận dùng chung (`TT.confirm()`)

- [ ] Bấm "Xoá đơn hàng" → hiện popup có thẻ tóm tắt đơn (mã đơn, trạng thái,
      khách hàng, tổng tiền nếu được xem) — không phải hộp thoại trình duyệt
- [ ] Bấm ra ngoài popup (vùng tối) → coi như bấm "Không", không xoá
- [ ] Nhấn phím Esc khi popup đang mở → coi như bấm "Không"
- [ ] Bấm "Tải lại" khi đang có thay đổi chưa lưu → popup cảnh báo mất thay
      đổi, có tóm tắt đơn đang mở

## F. Kiểm tra chung việc lọc (mọi tổ hợp)

- [ ] Bật đồng thời tháng + khách hàng + trạng thái + người tạo + tìm kiếm →
      kết quả đúng là **giao** của tất cả điều kiện (AND), không phải hợp
- [ ] Bật một lọc → "Bộ lọc" hiện chấm báo đang có lọc; xoá hết → chấm biến mất
- [ ] Mỗi lọc đang áp dụng hiện thành thẻ riêng bên dưới ô tìm kiếm, bấm ✕
      trên thẻ xoá đúng lọc đó, không ảnh hưởng lọc khác

## G. Điện thoại (3.7 — chờ code)

- [ ] Bộ lọc thu gọn lại thành một dòng gọn, không tràn ngang màn hình
- [ ] Thẻ đơn vẫn đọc được đầy đủ trên màn hình nhỏ
- [ ] Mở một đơn rồi quay lại danh sách → bộ lọc đang áp dụng **vẫn còn**,
      không bị xoá về mặc định

## H. Kiểm tra cuối

- [ ] Không có chữ tiếng Anh nào lọt ra màn hình đơn hàng
- [ ] Không có thông báo lỗi kỹ thuật nào lọt ra giao diện
- [ ] `DEV_MODE` đã tắt trước khi gửi link cho nhân viên

---

## I. Luồng duyệt đơn (task 3.8 — đã code, kiểm khi đã bật cờ)

Cờ cấu hình `approvalFlowEnabled` trong sheet `Config` phải đang **bật** cho
toàn bộ mục này (mặc định là tắt). Xem thiết kế đầy đủ ở `TASKS.md`,
"Milestone 3, task 3.8".

### I.1 — Hiển thị trạng thái duyệt

- [ ] Trạng thái duyệt (Nháp / Chờ duyệt / Đã duyệt / Từ chối) hiện trên **mọi**
      thẻ đơn trong danh sách, với **mọi** tài khoản — kể cả tài khoản bị giới
      hạn `visible_fields` nặng nhất
- [ ] Trạng thái duyệt cũng hiện trong màn hình chi tiết đơn
- [ ] Chi tiết đơn hiện dòng "Cập nhật lần cuối bởi … · lúc …" đúng người và
      đúng giờ của lần lưu gần nhất

### I.2 — Gửi duyệt (đơn Nháp / Từ chối)

- [ ] Mở một đơn **Nháp**, thấy nút "Gửi duyệt" riêng biệt với nút "Lưu"
- [ ] Bấm "Gửi duyệt" → đơn chuyển sang **Chờ duyệt**, có dòng mới trong
      `StatusHistory` (cột `field` = `approveStatus`)
- [ ] Một đơn **Từ chối** cũng có nút "Gửi duyệt" y hệt đơn Nháp
- [ ] (nhân viên không có `edit_order`) Không thấy nút "Gửi duyệt"

### I.3 — Ai được sửa đơn theo từng trạng thái duyệt

- [ ] Đơn **Nháp**: bất kỳ ai có `edit_order` (và đúng chủ đơn, trừ khi có
      `view_all_orders`) đều sửa được
- [ ] Đơn **Từ chối**: giống hệt đơn Nháp — ai có `edit_order` đều sửa được
- [ ] Đơn **Chờ duyệt**: chỉ người có `edit_order` VÀ (`approve_order` HOẶC
      `can_edit_approved_order`) sửa được; nhân viên có `edit_order` nhưng
      không có cả hai quyền kia thì **không** sửa được (server phải chặn,
      không chỉ ẩn nút — thử gọi thẳng action nếu nghi ngờ)
- [ ] Đơn **Đã duyệt**: cùng luật như Chờ duyệt (`edit_order` VÀ
      (`approve_order` HOẶC `can_edit_approved_order`))

### I.4 — Lưu tự động chuyển về Nháp

- [ ] Người có `edit_order` nhưng KHÔNG có `approve_order` sửa và lưu một đơn
      Chờ duyệt/Đã duyệt (nhờ có `can_edit_approved_order`) → sau khi lưu,
      đơn tự chuyển về **Nháp**
- [ ] Người có `can_edit_approved_order` không thấy popup hỏi "duyệt luôn
      không" — chỉ tự động về Nháp, không hỏi

### I.5 — Duyệt / từ chối

- [ ] Người có `approve_order` mở một đơn **Chờ duyệt**, bấm "Duyệt" → hiện
      popup xác nhận có tóm tắt đơn → xác nhận → đơn chuyển **Đã duyệt**
- [ ] Người có `approve_order` bấm "Từ chối" trên đơn Chờ duyệt → hiện popup,
      có thể nhập lý do (không bắt buộc) → xác nhận → đơn chuyển **Từ chối**
- [ ] (nhân viên có `can_edit_approved_order` nhưng KHÔNG có `approve_order`)
      Không thấy nút Duyệt/Từ chối
- [ ] Mọi lần Duyệt/Từ chối đều có dòng mới trong `StatusHistory`

### I.6 — Lưu tự động duyệt (chỉ người có quyền duyệt)

- [ ] Người có `approve_order` sửa một đơn (bất kỳ trạng thái duyệt nào) rồi
      bấm "Lưu" → hiện popup hỏi "Duyệt luôn đơn này?"
- [ ] Bấm xác nhận trên popup đó → đơn được lưu **và** chuyển thẳng sang
      **Đã duyệt** trong một lần thao tác
- [ ] Bấm "Không"/đóng popup đó → đơn vẫn được lưu nhưng chuyển về **Nháp**,
      đúng như popup đã cảnh báo trước khi bấm

### I.7 — Lọc theo trạng thái duyệt

- [ ] Có thêm ô lọc "Trạng thái duyệt" trong bộ lọc, chọn "Chờ duyệt" → danh
      sách chỉ còn đơn đang chờ duyệt (kết hợp đúng AND với lọc khác nếu có)
- [ ] Ô lọc này hiện với **mọi** tài khoản, kể cả tài khoản bị giới hạn
      `visible_fields` nặng nhất (vì trạng thái duyệt luôn hiển thị)

### I.8 — Cờ cấu hình tắt/bật

- [ ] Tắt cờ `approvalFlowEnabled` trong sheet `Config` → toàn bộ trạng thái
      duyệt, nút Gửi duyệt/Duyệt/Từ chối, ô lọc trạng thái duyệt biến mất;
      sửa đơn trở lại đúng luật cũ (chỉ `edit_order` + chủ đơn)
- [ ] Dữ liệu `approveStatus` đã có trong sheet **không bị xoá** khi tắt cờ
- [ ] Bật lại cờ → trạng thái duyệt cũ của từng đơn hiện lại đúng như trước
      khi tắt, không bị mất hay reset về Nháp
