/**
 * Config.gs — API project configuration.
 *
 * This project holds ALL data access. It is deployed "Execute as: Me" so it can
 * open the private spreadsheet. It has no UI and no notion of a browser session:
 * the caller's identity arrives as `actor` on each request, trusted only because
 * the shared secret proves the request came from THIENTAN-WEB.
 *
 * DELIBERATE OMISSION: this project does not request the `userinfo.email` scope,
 * so every Session.getActiveUser() / getEffectiveUser() call here throws. That is
 * a feature. This project runs as the OWNER for every employee, so any Session
 * identity it could read would say "owner" — the exact mistake that produced the
 * 2026-08-17 privilege-escalation bug. Making it impossible beats remembering.
 * Where setup genuinely needs an address, use the ADMIN_EMAIL property.
 */

/** Bump on every meaningful API change. Surfaced in the web footer in dev mode. */
var BUILD = 'api-2026-08-17-1';

/** Script Property keys. */
var PROP = {
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  SHARED_SECRET: 'SHARED_SECRET',
  ADMIN_EMAIL: 'ADMIN_EMAIL',
  ORDER_SEQ_YEAR: 'ORDER_SEQ_YEAR',
  ORDER_SEQ_NEXT: 'ORDER_SEQ_NEXT'
};

var SHEETS = {
  USERS: 'Users',
  SECURITY: 'Security',
  SECURITY_LOG: 'SecurityLog',
  ORDERS: 'Orders',
  ORDER_LINES: 'OrderLines',
  PRODUCTS: 'Products',
  STATUS_HISTORY: 'StatusHistory',
  CONFIG: 'Config'
};

/**
 * Header rows used by Setup.gs.
 * Orders / OrderLines / Products are absent on purpose — their columns depend on
 * open questions Q1, Q3, Q4, Q6 in docs/OPEN_QUESTIONS.md.
 */
var HEADERS = {
  Users: ['email', 'displayName', 'role', 'active', 'permissions', 'createdAt', 'createdBy', 'note'],
  Config: ['key', 'value', 'description'],
  Security: ['key', 'value', 'description'],
  SecurityLog: ['timestamp', 'event', 'detail']
};

/**
 * Security sheet defaults. Deliberately a SHEET, not Script Properties: the admin
 * can revoke access from a phone with the Sheets app, without opening the Apps
 * Script editor. That is the point of this layer.
 */
var SECURITY_DEFAULTS = [
  ['status', 'active', 'active = cho phép truy cập. Đổi thành "revoked" để khoá toàn bộ ngay lập tức.'],
  ['secretFingerprint', '', 'Dấu vân tay của khoá đang dùng. Do rotateSecret() ghi, không sửa tay.'],
  ['rotatedAt', '', 'Lần đổi khoá gần nhất.'],
  ['expiresAt', '', 'Sau ngày này, mọi truy cập bị từ chối cho tới khi đổi khoá.'],
  ['rotationDays', '30', 'Số ngày một khoá còn hiệu lực.'],
  ['warnDays', '7', 'Bắt đầu nhắc quản trị viên trước khi hết hạn bao nhiêu ngày.']
];

/** Actions still allowed while the security gate is failing. */
var ACTIONS_ALLOWED_WHEN_LOCKED = ['getSession'];

/** Cap on SecurityLog rows, so an anonymous flood cannot grow the sheet forever. */
var SECURITY_LOG_MAX_ROWS = 500;

var PERMISSION_KEYS = [
  'view_orders', 'view_all_orders', 'create_order', 'edit_order', 'delete_order',
  'change_status', 'approve_order', 'search_filter', 'export',
  'view_statistics', 'export_statistics', 'manage_inventory', 'manage_users'
];

/** Used when `visible_fields` is missing or empty. Deny by default: no money columns. */
var DEFAULT_VISIBLE_FIELDS = [
  'orderNo', 'customerPo', 'customer', 'orderDate',
  'description', 'qty', 'uom', 'status', 'statusNote'
];

/**
 * Caches.
 *
 * Only the Config sheet is cached — display vocabulary that changes rarely and
 * carries no access-control meaning.
 *
 * User records are NOT cached. See the note on loadUser_ in Auth.gs: caching them
 * made `active` = FALSE take up to two minutes to bite.
 *
 * If anything here ever caches per-user data, use getScriptCache() with the email
 * in the key, never getUserCache(): this project runs as the OWNER for every
 * employee, so the "user" cache is one shared bucket and would serve employee A
 * employee B's permissions.
 */
var CACHE = {
  TTL_SECONDS: 120,
  CONFIG_KEY: 'config:all'
};

var CONFIG_DEFAULTS = [
  ['statusList',
    JSON.stringify([
      { key: 'draft', label: 'Nháp' },
      { key: 'confirmed', label: 'Đã xác nhận' },
      { key: 'waiting_stock', label: 'Chờ hàng về' },
      { key: 'stock_arrived', label: 'Hàng về' },
      { key: 'delivered_not_invoiced', label: 'Đã giao, chưa xuất' },
      { key: 'invoiced_unpaid', label: 'Đã xuất, chưa TT' },
      { key: 'paid', label: 'Đã thanh toán' },
      { key: 'cancelled', label: 'Đã huỷ' }
    ]),
    'Danh sách trạng thái đơn hàng'],
  ['uomList', JSON.stringify(['Cái', 'Cuộn', 'Bịch', 'Bộ', 'm', 'Hộp', 'SET', 'Xấp']),
    'Đơn vị tính'],
  ['vatRates', JSON.stringify([0.08, 0.1]),
    'Các mức thuế VAT. Mức đầu tiên là mặc định.'],
  ['customerList', JSON.stringify([]), 'Danh sách khách hàng dùng cho gợi ý khi nhập đơn'],
  ['currency', 'VND', 'Đơn vị tiền tệ']
];

/** Vietnamese messages. These travel to the browser, so keep them user-facing. */
var MSG = {
  NOT_CONFIGURED: 'Hệ thống chưa được cấu hình. Vui lòng liên hệ quản trị viên.',
  NO_ADMIN_EMAIL: 'Chưa đặt ADMIN_EMAIL trong Script Properties của THIENTAN-API.',
  NO_IDENTITY: 'Không xác định được tài khoản Google của bạn. Vui lòng liên hệ quản trị viên.',
  NO_ACCESS: 'Tài khoản của bạn chưa được cấp quyền truy cập. Vui lòng liên hệ quản trị viên.',
  INACTIVE: 'Tài khoản của bạn đã bị khoá. Vui lòng liên hệ quản trị viên.',
  NO_PERMISSION: 'Bạn không có quyền thực hiện thao tác này.',
  SHEET_MISSING: 'Không tìm thấy sheet dữ liệu: ',
  BAD_REQUEST: 'Yêu cầu không hợp lệ.',
  UNAUTHORIZED_CALLER: 'Yêu cầu không được phép.',
  UNKNOWN_ACTION: 'Không hỗ trợ thao tác: ',
  DEPLOY_MISCONFIGURED: 'Ứng dụng API chưa được triển khai đúng cách. ' +
    'Mục "Execute as" phải chọn "Me". Vui lòng liên hệ quản trị viên.',

  /* ---- security gate: what a normal employee sees ---- */
  LOCKED_USER: 'Hệ thống đang tạm khoá để bảo mật. Vui lòng liên hệ quản trị viên.',

  /* ---- security gate: what the admin sees, with the action to take ---- */
  LOCKED_ADMIN_EXPIRED: 'Khoá bảo mật đã hết hạn. Hãy đổi khoá mới trước khi tiếp tục.',
  LOCKED_ADMIN_REVOKED: 'Khoá bảo mật đang bị thu hồi (status = revoked trong sheet Security).',
  LOCKED_ADMIN_MISMATCH: 'Khoá trong Script Properties không khớp khoá đã đăng ký. ' +
    'Hãy chạy rotateSecret() trên project API.',
  LOCKED_ADMIN_UNSET: 'Chưa đăng ký khoá bảo mật. Hãy chạy rotateSecret() trên project API.',
  GENERIC: 'Đã xảy ra lỗi. Vui lòng thử lại.'
};
