/**
 * Config.gs — API project configuration.
 *
 * This project holds ALL data access. It is deployed "Execute as: Me" so it can
 * open the private spreadsheet. It has no UI and no notion of a browser session:
 * the caller's identity arrives as `actor` on each request, trusted only because
 * the shared secret proves the request came from THIENTAN-WEB.
 */

/** Bump on every meaningful API change. Surfaced in the web footer in dev mode. */
var BUILD = 'api-2026-08-17-1';

/** Script Property keys. */
var PROP = {
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  SHARED_SECRET: 'SHARED_SECRET',
  ORDER_SEQ_YEAR: 'ORDER_SEQ_YEAR',
  ORDER_SEQ_NEXT: 'ORDER_SEQ_NEXT'
};

var SHEETS = {
  USERS: 'Users',
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
  Config: ['key', 'value', 'description']
};

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
 * IMPORTANT: use getScriptCache(), never getUserCache(). This project runs as the
 * OWNER for every employee, so the "user" cache would be one shared bucket and
 * employee A could be served employee B's permissions. The email is part of the
 * key instead.
 */
var CACHE = {
  TTL_SECONDS: 120,
  userKey: function (email) { return 'user:' + email; },
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
  GENERIC: 'Đã xảy ra lỗi. Vui lòng thử lại.'
};
