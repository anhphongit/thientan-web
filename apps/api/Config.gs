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
var BUILD = 'api-2026-09-15a-m6-hardening';

/** Script Property keys. */
var PROP = {
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  SHARED_SECRET: 'SHARED_SECRET',
  ADMIN_EMAIL: 'ADMIN_EMAIL',
  ORDER_SEQ_YEAR: 'ORDER_SEQ_YEAR',
  ORDER_SEQ_NEXT: 'ORDER_SEQ_NEXT',
  // Milestone 5 / 5.1 — product id sequence (SP-0001, SP-0002, ...). No year
  // segment (unlike ORDER_SEQ_*): a product catalog doesn't reset yearly the
  // way an order sequence does, per docs/DATA_MODEL.md's example id.
  PRODUCT_SEQ_NEXT: 'PRODUCT_SEQ_NEXT',
  DEV_MODE: 'DEV_MODE',
  // Milestone 7 / Phase 4 — resume-position index for the legacy Excel
  // import write path (LegacyImportWriteResume.gs): how many orders, in
  // legacyRunImportBatch_'s deterministic parsed order, are already
  // resolved (written or explicitly skipped) by a previous run. See that
  // file's doc comment for why this is an integer index rather than a
  // sheet-scan tag like DevSeed.gs's nextSeedNumber_.
  LEGACY_IMPORT_RESUME_INDEX: 'LEGACY_IMPORT_RESUME_INDEX'
};

var SHEETS = {
  USERS: 'Users',
  SECURITY: 'Security',
  SECURITY_LOG: 'SecurityLog',
  DEV_LOG: 'DevLog',
  ORDERS: 'Orders',
  ORDER_LINES: 'OrderLines',
  INVOICES: 'Invoices',
  PRODUCTS: 'Products',
  STATUS_HISTORY: 'StatusHistory',
  CONFIG: 'Config'
};

/**
 * Header rows used by Setup.gs. These ARE the schema — docs/DATA_MODEL.md
 * describes them, this decides them. Columns are always addressed by name.
 *
 * Orders carries no invoiceNo/invoiceDate and no orderNo/customerPo: see
 * docs/OPEN_QUESTIONS.md Q3 and Q4, answered 2026-08-20.
 */
var HEADERS = {
  Users: ['email', 'displayName', 'role', 'active', 'permissions', 'createdAt', 'createdBy', 'note'],
  // Milestone 5 / 5.1 — matches docs/DATA_MODEL.md §5 exactly (schema
  // decided at design time, before this task started): no createdBy/At or
  // updatedBy/At columns, unlike Orders — a product catalog entry doesn't
  // carry the same audit-trail need an order does, and the doc's schema
  // table was already finalized without them.
  Products: ['productId', 'code', 'name', 'uom', 'stockQty', 'minStock', 'lastPrice', 'active', 'note'],
  Config: ['key', 'value', 'description'],
  Security: ['key', 'value', 'description'],
  SecurityLog: ['timestamp', 'event', 'detail'],
  DevLog: ['timestamp', 'level', 'source', 'actor', 'message', 'detail'],

  // lineCount: Milestone 2.5 / P5 — maintained by actionCreateOrder_ /
  // actionUpdateOrder_ on every save so actionListOrders_ never has to read
  // the entire OrderLines sheet just to print a per-card count. Columns are
  // addressed by name everywhere (SheetsRepo.gs), never by position, so
  // adding it here does NOT reorder anything on a sheet that already exists —
  // an existing Orders sheet needs the header cell added once by
  // `migrateAddLineCount()` (Migrations.gs) before this is real.
  // approveStatus: Milestone 3 / 3.8 — replaces the old approvedBy/approvedAt
  // stamp entirely (that pair is no longer written; see Migrations.gs for
  // the one-time column add on an existing sheet). approvedBy/approvedAt
  // are kept in this header list so an existing sheet's columns still line
  // up positionally with old data during the transition, but nothing in
  // Orders.gs writes to them anymore — who/when of an approval now lives in
  // StatusHistory (field='approveStatus') instead of a denormalized pair.
  // rejectReason/rejectedBy/rejectedAt: revision 2026-09-03d — replaces the
  // earlier approach of scanning StatusHistory for the latest 'rejected'
  // row (too expensive to do on every detail load, and duplicated data
  // that already lives on the order itself). Written once by
  // actionRejectOrder_, read back by buildOrderResponse_ only when
  // approveStatus is currently 'rejected'. Left stale (not cleared) once
  // the order moves on — buildOrderResponse_ never surfaces it outside
  // the 'rejected' state, so a stale value here is inert.
  // Milestone 5a — business `status`/`statusNote` moved OFF Orders and onto
  // OrderLines (see below); `approveStatus` is the only status left here,
  // untouched by this move. The live sheet's old status/statusNote columns
  // are not deleted — migrateOrderLineStatus() (Migrations.gs) renames them
  // to status_deprecated/statusNote_deprecated so a reader that still
  // expects row.status fails loudly (undefined) instead of reading stale
  // data silently.
  Orders: ['orderId', 'po', 'poNote', 'customer', 'orderDate',
           'customerDeposit', 'supplierName', 'supplierPaid',
           'totalExVat', 'totalIncVat', 'lineCount',
           'createdBy', 'createdAt', 'updatedBy', 'updatedAt', 'approvedBy', 'approvedAt',
           'approveStatus', 'rejectReason', 'rejectedBy', 'rejectedAt'],

  // status/statusNote: Milestone 5a — business status, moved here from
  // Orders. Optional per line (a line may be saved blank), same as the
  // existing invoiceId/note fields — validated against Config.statusList
  // only when present, never required.
  OrderLines: ['lineId', 'orderId', 'lineNo', 'productCode', 'description',
               'unitPrice', 'qty', 'uom', 'vatRate', 'amountExVat', 'amountIncVat',
               'invoiceId', 'note', 'status', 'statusNote'],

  Invoices: ['invoiceId', 'invoiceNo', 'invoiceDate', 'customer', 'note',
             'createdBy', 'createdAt'],

  // field: Milestone 3 / 3.8 — 'status' (business status, existing) or
  // 'approveStatus' (new) disambiguates which of an order's two independent
  // status columns a row describes. A row written before this column
  // existed has an empty field cell; readers treat that as 'status' (see
  // appendStatusHistory_'s default and historyField_ in Orders.gs).
  // lineId: Milestone 5a — set for a line-status change (field='status'
  // rows written after this milestone), blank for approveStatus rows and
  // for every row written before this column existed.
  StatusHistory: ['historyId', 'orderId', 'oldStatus', 'newStatus', 'note',
                  'changedBy', 'changedAt', 'field', 'lineId']
};

/** Order/line limits. A cap keeps one bad request from writing 10,000 rows. */
var ORDER_LIMITS = {
  MAX_LINES: 50,
  MAX_TEXT: 2000,
  MAX_MONEY: 1e12
};

/** Milestone 5 / 5.1 — product field limits, same shape as ORDER_LIMITS
 *  (a cap keeps one bad request from writing an absurd value), reusing
 *  Orders.gs's text_()/money_() helpers directly since ORDER_LIMITS.MAX_TEXT/
 *  MAX_MONEY already cover both — this constant exists only for the one
 *  product-specific cap those two don't: how large a stock quantity/
 *  threshold is allowed to be. */
var PRODUCT_LIMITS = {
  MAX_QTY: 1e9
};

/**
 * Milestone 2.5 / P4 — server-side pagination for the order list.
 * DEFAULT is what the client asks for; MAX caps what any single request (a
 * stale client, a bug, a curious dev poking the endpoint) can pull at once —
 * the whole point of paging is that nobody, ever, reads the full sheet again.
 */
var LIST_PAGE_SIZE_DEFAULT = 20;
var LIST_PAGE_SIZE_MAX = 100;

/**
 * Fields the order LIST screen actually draws on a card (see orderCardHtml in
 * ViewsOrders.html: id, customer, date, po, line count, two totals).
 * Milestone 5a — status dropped from here: business status now lives per
 * OrderLine, not on the order, so there is no single order-level value left
 * to show on a card (approveStatus is shown separately, unconditionally, not
 * through this allowlist — see DEFAULT_VISIBLE_FIELDS below).
 * Everything else on an Orders row — poNote, supplierName, customerDeposit,
 * supplierPaid, and every createdBy/At, updatedBy/At, approvedBy/At column —
 * is real data actionGetOrder_ still returns in full for the detail screen,
 * but is dead weight on every list page forever.
 * Intersected with the caller's visible_fields same as any other field, so
 * money-blindness still applies: this narrows what's offered, it does not
 * widen it.
 */
var LIST_CARD_FIELDS = ['po', 'customer', 'orderDate', 'totalExVat', 'totalIncVat'];

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

/** Cap on DevLog rows (DEV_MODE diagnostics only). */
var DEV_LOG_MAX_ROWS = 300;

var PERMISSION_KEYS = [
  'view_orders', 'view_all_orders', 'create_order', 'edit_order', 'delete_order',
  'change_status', 'approve_order', 'can_edit_approved_order', 'search_filter', 'export',
  'view_statistics', 'export_statistics', 'manage_inventory', 'manage_users'
];

/**
 * Used when `visible_fields` is missing or empty. Deny by default: no money
 * columns, no deposits, no supplier payments.
 */
var DEFAULT_VISIBLE_FIELDS = [
  'orderId', 'po', 'poNote', 'customer', 'orderDate', 'status', 'statusNote',
  'supplierName', 'lineId', 'lineNo', 'productCode', 'description', 'qty', 'uom',
  'invoiceId', 'invoiceNo', 'invoiceDate', 'note',
];

/**
 * Milestone 3 / 3.8 — fields that are part of the visible_fields ALLOWLIST
 * mechanism but must show for every user regardless of what their role's
 * visible_fields array contains (or omits). Unlike DEFAULT_VISIBLE_FIELDS
 * (a fallback used only when visible_fields is unset/empty), this list is
 * enforced unconditionally inside filterVisibleFields_ in Permissions.gs —
 * it overrides an explicit array that simply forgot to list these columns.
 *
 * approveStatus/updatedBy/updatedAt: the approve-status workflow's spec
 * (point 2) requires the approve status to be visible on every list card and
 * detail screen for every account, and point 4 requires a "last updated by"
 * line likewise visible to everyone. Money/PO/customer visibility rules are
 * unaffected — this list does not include anything from MONEY_FIELDS.
 */
var ALWAYS_VISIBLE_FIELDS = ['approveStatus', 'updatedBy', 'updatedAt'];

/** Money-ish columns, listed so the UI can explain what a user is not seeing. */
var MONEY_FIELDS = [
  'unitPrice', 'vatRate', 'amountExVat', 'amountIncVat',
  'totalExVat', 'totalIncVat', 'customerDeposit', 'supplierPaid'
];

/**
 * Milestone 5b — Vietnamese display labels for visible_fields columns.
 * Raw key is used as a fallback for anything not listed here, so a future
 * column added to HEADERS without a matching label degrades to the key
 * itself rather than throwing or vanishing from the admin editor.
 */
var FIELD_LABELS_VI = {
  orderId: 'Mã đơn', po: 'PO', poNote: 'Ghi chú PO', customer: 'Khách hàng',
  orderDate: 'Ngày đặt', status: 'Trạng thái', statusNote: 'Ghi chú trạng thái',
  customerDeposit: 'Đặt cọc khách hàng', supplierName: 'Nhà cung cấp',
  supplierPaid: 'Đã trả nhà cung cấp', totalExVat: 'Tổng trước VAT',
  totalIncVat: 'Tổng sau VAT', lineCount: 'Số dòng',
  createdBy: 'Người tạo', createdAt: 'Ngày tạo',
  updatedBy: 'Người cập nhật', updatedAt: 'Ngày cập nhật',
  approvedBy: 'Người duyệt', approvedAt: 'Ngày duyệt',
  approveStatus: 'Trạng thái duyệt', rejectReason: 'Lý do từ chối',
  rejectedBy: 'Người từ chối', rejectedAt: 'Ngày từ chối',
  lineId: 'Mã dòng', lineNo: 'STT dòng', productCode: 'Mã sản phẩm',
  description: 'Mô tả', unitPrice: 'Đơn giá', qty: 'Số lượng', uom: 'ĐVT',
  vatRate: 'Thuế suất VAT', amountExVat: 'Thành tiền trước VAT',
  amountIncVat: 'Thành tiền sau VAT', invoiceId: 'Mã hoá đơn',
  note: 'Ghi chú', invoiceNo: 'Số hoá đơn', invoiceDate: 'Ngày hoá đơn'
};

/**
 * Grouped, deduped visible_fields options for the admin per-user column
 * editor (Milestone 5b). Built live from HEADERS so it can never list a
 * field cleanPermissionMatrix_ (Admin.gs) would reject, or omit one it
 * allows — including after a future schema change to HEADERS.Orders/
 * OrderLines/Invoices. A field present in more than one entity's HEADERS
 * (e.g. 'customer', 'createdBy') is listed once, under its first group.
 */
function visibleFieldGroups_() {
  var seen = {};
  function dedupedFields(keys) {
    return keys.filter(function (k) {
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    }).map(function (k) {
      return {
        key: k,
        label: FIELD_LABELS_VI[k] || k,
        alwaysVisible: ALWAYS_VISIBLE_FIELDS.indexOf(k) >= 0,
        isMoney: MONEY_FIELDS.indexOf(k) >= 0
      };
    });
  }
  return [
    { key: 'orders', label: 'Đơn hàng', fields: dedupedFields(HEADERS.Orders) },
    { key: 'orderLines', label: 'Dòng đơn hàng', fields: dedupedFields(HEADERS.OrderLines) },
    { key: 'invoices', label: 'Hoá đơn', fields: dedupedFields(HEADERS.Invoices) }
  ];
}

/**
 * Milestone 5 / 5.2 — starting-profile presets, straight off PERMISSIONS.md
 * §3's table. Admin's add/edit user form assigns one of these WHOLESALE
 * (both `role` and the full `permissions` object) rather than exposing a
 * checkbox-by-checkbox editor — that fine-grained matrix is Milestone 5 /
 * 5.3, not built yet, so a preset is the only way today to grant/revoke
 * permissions without opening the Users sheet by hand. `role` is a
 * convenience label only (DATA_MODEL.md §1) — it always mirrors whichever
 * preset was picked, never edited as its own field.
 *
 * Object key order is the dropdown's display order (Object.keys on a
 * string-keyed object preserves insertion order in V8/Apps Script) — Admin
 * first since it's the profile every other one is measured against.
 *
 * PERMISSIONS.md §3's "no prices" (Warehouse's visible_fields column) is
 * exactly DEFAULT_VISIBLE_FIELDS below — that array never included any
 * MONEY_FIELDS column to begin with, so Warehouse just uses it directly
 * rather than needing a second "no money" list to keep in sync.
 */
var PERMISSION_PRESETS = {
  admin: {
    label: 'Quản trị viên (toàn quyền)',
    role: 'admin',
    permissions: (function () {
      var p = {};
      PERMISSION_KEYS.forEach(function (k) { p[k] = true; });
      p.visible_fields = ['*'];
      return p;
    })()
  },
  sales: {
    label: 'Nhân viên kinh doanh',
    role: 'staff',
    permissions: {
      view_orders: true, view_all_orders: false, create_order: true, edit_order: true,
      delete_order: false, change_status: true, approve_order: false,
      can_edit_approved_order: false, search_filter: true, export: true,
      view_statistics: false, export_statistics: false, manage_inventory: false,
      manage_users: false, visible_fields: ['*']
    }
  },
  warehouse: {
    label: 'Nhân viên kho',
    role: 'staff',
    permissions: {
      view_orders: true, view_all_orders: true, create_order: false, edit_order: false,
      delete_order: false, change_status: true, approve_order: false,
      can_edit_approved_order: false, search_filter: true, export: false,
      view_statistics: false, export_statistics: false, manage_inventory: true,
      manage_users: false, visible_fields: DEFAULT_VISIBLE_FIELDS.slice()
    }
  },
  accounting: {
    label: 'Kế toán',
    role: 'staff',
    permissions: {
      view_orders: true, view_all_orders: true, create_order: false, edit_order: false,
      delete_order: false, change_status: true, approve_order: false,
      can_edit_approved_order: false, search_filter: true, export: true,
      view_statistics: true, export_statistics: true, manage_inventory: false,
      manage_users: false, visible_fields: ['*']
    }
  }
};

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
 *
 * Milestone 2.5 / P7 — server-side order-list cache:
 *   - Keyed by ordersVersion + user.email + page + pageSize.
 *   - Any write (create / update / delete) bumps ordersVersion so every
 *     previous list page misses on the next request.
 *   - LIST_TTL_SECONDS is only a safety net; version is the real invalidator.
 *   - Never caches securityGate_ / loadUser_ results.
 */
var CACHE = {
  TTL_SECONDS: 120,
  CONFIG_KEY: 'config:all',

  /** Global stamp; any order write increments it. */
  ORDERS_VERSION_KEY: 'orders:version',

  /** Prefix for per-user list pages: orders:list:v{ver}:u{email}:p{page}:s{size} */
  LIST_KEY_PREFIX: 'orders:list:',

  /** Safety-net TTL for a list page (seconds). Version bump is the real invalidator. */
  LIST_TTL_SECONDS: 300
};

/**
 * Customers observed in the reference workbook. Seeded so autocomplete is useful
 * on day one; the list then fills itself as new names are entered (Q6).
 */
var CUSTOMER_SEED = [
  'Nhựa Duy Tân', 'Duy Tân Long An', 'Duy Tân Bình Dương', 'Yamato', 'PCVN', 'THP',
  'NUMBER ONE CHU LAI', 'NUMBER ONE HÀ NAM', 'NUMBER ONE HẬU GIANG', 'Hibex',
  'KỸ THUẬT HUY MINH', 'ACCREDO ASIA', 'Núi Tiên', 'ALOEFIELD', 'anh Hảo'
];

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
      { key: 'cancelled', label: 'Đã huỷ' },
      // Milestone 7 (code review 2026-09-16) — legacy Excel import's TRẠNG
      // THÁI column matches "done"/"Done" (case-insensitive) on ~443 of
      // ~534 source lines (docs/EXCEL_REFERENCE.md §6), the single highest-
      // frequency raw status value, but no prior entry here matched it —
      // every one of those lines fell through to a status-unmatched review
      // flag. This is a NEW default: it only seeds a fresh Config sheet
      // (seedConfigDefaults_ below skips keys already present) — see
      // runbook.md's pre-flight steps for adding it to an existing
      // production Config sheet via the admin config UI before the real
      // dry-run.
      { key: 'done', label: 'Hoàn thành' }
    ]),
    'Danh sách trạng thái đơn hàng'],
  ['uomList', JSON.stringify(['Cái', 'Cuộn', 'Bịch', 'Bộ', 'm', 'Hộp', 'SET', 'Xấp']),
    'Đơn vị tính'],
  ['vatRates', JSON.stringify([0.08, 0.1]),
    'Các mức thuế VAT. Mức đầu tiên là mặc định.'],
  ['customerList', JSON.stringify(CUSTOMER_SEED),
    'Danh sách khách hàng dùng cho gợi ý khi nhập đơn. Tên mới sẽ được thêm tự động.'],
  ['currency', 'VND', 'Đơn vị tiền tệ'],

  /* ---- Milestone 3 / 3.8 — approve-status workflow ---- */
  // Off by default: an existing deployment keeps today's plain edit/view
  // behavior (no approve status, no approve permissions in effect) until an
  // admin deliberately flips this on in the Config sheet.
  ['approvalFlowEnabled', 'FALSE',
    'Bật/tắt luồng duyệt đơn (trạng thái duyệt Nháp/Chờ duyệt/Đã duyệt/Từ chối). ' +
    'TRUE = bật, FALSE = tắt (giữ hành vi sửa/xem đơn giản như trước).'],
  ['approveStatusList',
    JSON.stringify([
      { key: 'draft', label: 'Nháp' },
      { key: 'wait_approval', label: 'Chờ duyệt' },
      { key: 'approved', label: 'Đã duyệt' },
      { key: 'rejected', label: 'Từ chối' }
    ]),
    'Danh sách trạng thái duyệt đơn hàng'],

  /* ---- Milestone 4 / 4.5.2 revision — large-export threshold ---- */
  // Order LINE count (not order count — a better predictor of export
  // size/time, see actionListOrders_'s totalLines and
  // exportLargeThreshold_ in Export.gs) above which XLSX/PDF export
  // switches to the checkpointed job+polling path instead of the plain
  // synchronous one. Config-driven (not a hardcoded constant) per Phong's
  // answer, 2026-09-04 — an admin can tune this from the Config sheet
  // without a code deploy if 500 turns out too low/high in practice.
  ['exportLargeThreshold', '500',
    'Số dòng đơn hàng (order line) trở lên thì xuất Excel/PDF sẽ chạy nền ' +
    'thay vì chờ trực tiếp. Có thể chỉnh số này nếu thấy chưa phù hợp.'],
  // Milestone 4 / 4.5.4 — how many days a finished large-export job's
  // record and its Drive file(s) are kept before cleanupExportJobs
  // (the daily trigger, see ExportJob.gs) trashes/removes them. Same
  // config-driven pattern as exportLargeThreshold — an admin can tune
  // retention from the Config sheet without a code deploy.
  ['exportRetentionDays', '14',
    'Số ngày giữ lại file xuất lớn (Excel/PDF đã lưu vào Drive) và bản ghi ' +
    'tác vụ xuất trước khi tự động dọn dẹp. Có thể chỉnh số này nếu thấy chưa phù hợp.'],

  /* ---- Milestone 6 / Phase 1 — backup retention ---- */
  // How many days a backup Drive subfolder (BackupJob.gs) is kept BEYOND
  // the unconditional newest-3 floor (MIN_BACKUPS_KEPT) before
  // cleanupOldBackups_ trashes it. Same config-driven pattern as
  // exportRetentionDays above — an admin can tune this from the Config
  // sheet without a code deploy.
  ['backupRetentionDays', '14',
    'Số ngày giữ lại các bản sao lưu dữ liệu (Drive) trước khi tự động dọn dẹp, ' +
    'ngoài 3 bản gần nhất luôn được giữ lại. Có thể chỉnh số này nếu thấy chưa phù hợp.']
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

  /* ---- orders (Milestone 2) ---- */
  ORDER_NOT_FOUND: 'Không tìm thấy đơn hàng.',
  ORDER_NO_CUSTOMER: 'Vui lòng nhập tên khách hàng.',
  ORDER_BAD_DATE: 'Ngày đặt hàng không hợp lệ.',
  ORDER_BAD_STATUS: 'Trạng thái không hợp lệ.',
  ORDER_NO_LINES: 'Đơn hàng phải có ít nhất một dòng hàng.',
  ORDER_TOO_MANY_LINES: 'Một đơn hàng tối đa ' + ORDER_LIMITS.MAX_LINES + ' dòng hàng.',
  ORDER_BAD_DEPOSIT: 'Số tiền cọc không hợp lệ.',
  ORDER_BAD_SUPPLIER_PAID: 'Số tiền đã trả nhà cung cấp không hợp lệ.',
  LINE_PREFIX: 'Dòng ',
  LINE_NO_DESCRIPTION: ': vui lòng nhập nội dung hàng hoá.',
  LINE_BAD_QTY: ': số lượng phải lớn hơn 0.',
  LINE_BAD_PRICE: ': đơn giá không hợp lệ.',
  LINE_BAD_VAT: ': mức thuế VAT không hợp lệ.',
  LINE_INVOICE_NO_DATE: ': đã nhập số hoá đơn thì phải nhập ngày hoá đơn.',
  LINE_INVOICE_BAD_DATE: ': ngày hoá đơn không hợp lệ.',
  ORDER_LOCK_BUSY: 'Hệ thống đang bận, vui lòng thử lại sau vài giây.',

  /* ---- approve-status workflow (Milestone 3 / 3.8) ---- */
  ORDER_BAD_APPROVE_STATUS: 'Trạng thái duyệt không hợp lệ.',
  APPROVE_STATUS_EDIT_DENIED: 'Bạn không có quyền sửa đơn hàng ở trạng thái duyệt hiện tại.',
  APPROVE_STATUS_NOT_PENDING: 'Chỉ có thể duyệt/từ chối đơn đang ở trạng thái Chờ duyệt.',
  APPROVE_STATUS_NOT_DRAFTLIKE: 'Chỉ có thể gửi duyệt đơn đang ở trạng thái Nháp hoặc Từ chối.',
  APPROVAL_FLOW_DISABLED: 'Luồng duyệt đơn hiện đang tắt.',
  /* UI/logic revision 2026-09-03 — an edit+approve user may move an order
     freely between approve statuses, so the only thing left to refuse is a
     no-op transition into the status it is already in. */
  APPROVE_STATUS_ALREADY_APPROVED: 'Đơn hàng đã ở trạng thái Đã duyệt.',
  APPROVE_STATUS_ALREADY_REJECTED: 'Đơn hàng đã ở trạng thái Từ chối.',
  APPROVE_STATUS_ALREADY_DRAFT: 'Đơn hàng đã ở trạng thái Nháp.',
  APPROVE_STATUS_SET_DRAFT_DENIED: 'Bạn không có quyền chuyển đơn hàng về trạng thái Nháp.',

  /* ---- security gate: what a normal employee sees ---- */
  LOCKED_USER: 'Hệ thống đang tạm khoá để bảo mật. Vui lòng liên hệ quản trị viên.',

  /* ---- security gate: what the admin sees, with the action to take ---- */
  LOCKED_ADMIN_EXPIRED: 'Khoá bảo mật đã hết hạn. Hãy đổi khoá mới trước khi tiếp tục.',
  LOCKED_ADMIN_REVOKED: 'Khoá bảo mật đang bị thu hồi (status = revoked trong sheet Security).',
  LOCKED_ADMIN_MISMATCH: 'Khoá trong Script Properties không khớp khoá đã đăng ký. ' +
    'Hãy chạy rotateSecret() trên project API.',
  LOCKED_ADMIN_UNSET: 'Chưa đăng ký khoá bảo mật. Hãy chạy rotateSecret() trên project API.',
  GENERIC: 'Đã xảy ra lỗi. Vui lòng thử lại.',

  /* ---- large export jobs (Milestone 4 / 4.5.2) ---- */
  EXPORTJOB_NOT_FOUND: 'Không tìm thấy tác vụ xuất file này (có thể đã hết hạn).',
  EXPORTJOB_BAD_FORMAT: 'Định dạng xuất file không hợp lệ.',

  /* ---- inventory (Milestone 5 / 5.1) ---- */
  PRODUCT_NOT_FOUND: 'Không tìm thấy sản phẩm.',
  PRODUCT_NO_CODE: 'Vui lòng nhập mã sản phẩm.',
  PRODUCT_NO_NAME: 'Vui lòng nhập tên sản phẩm.',
  PRODUCT_CODE_DUPLICATE: 'Mã sản phẩm này đã tồn tại.',
  PRODUCT_BAD_STOCK: 'Số lượng tồn kho không hợp lệ.',
  PRODUCT_BAD_MIN_STOCK: 'Ngưỡng tồn kho tối thiểu không hợp lệ.',
  PRODUCT_BAD_PRICE: 'Giá không hợp lệ.',
  PRODUCT_IN_USE: 'Không thể xoá: sản phẩm này đang được dùng trong đơn hàng. ' +
    'Hãy chuyển sang trạng thái "Ngừng kinh doanh" thay vì xoá.',
  PRODUCT_LOCK_BUSY: 'Hệ thống đang bận, vui lòng thử lại sau vài giây.',

  /* ---- admin / user management (Milestone 5 / 5.2) ---- */
  USER_NOT_FOUND: 'Không tìm thấy người dùng.',
  USER_NO_EMAIL: 'Vui lòng nhập email.',
  USER_BAD_EMAIL: 'Địa chỉ email không hợp lệ.',
  USER_EMAIL_DUPLICATE: 'Email này đã có trong hệ thống.',
  USER_NO_NAME: 'Vui lòng nhập tên hiển thị.',
  USER_BAD_PRESET: 'Vui lòng chọn một nhóm quyền hợp lệ.',
  USER_SELF_REMOVE_ADMIN: 'Bạn không thể tự gỡ quyền Quản trị viên (quản lý người dùng) của ' +
    'chính mình. Hãy nhờ một quản trị viên khác thực hiện.',
  USER_LAST_ADMIN: 'Không thể thực hiện: đây là quản trị viên đang hoạt động cuối cùng. ' +
    'Hệ thống phải luôn có ít nhất một quản trị viên.',
  USER_LOCK_BUSY: 'Hệ thống đang bận, vui lòng thử lại sau vài giây.',

  /* ---- permission matrix (Milestone 5 / 5.3) ---- */
  USER_BAD_PERMISSION_KEY: 'Quyền không hợp lệ: ',
  USER_AMBIGUOUS_PERMISSION_PAYLOAD: 'không thể chỉ định cả nhóm quyền (presetKey) và quyền tùy chỉnh (permissions) cùng lúc. Vui lòng chọn một trong hai.',
  USER_BAD_VISIBLE_FIELDS: 'Danh sách cột hiển thị không hợp lệ.',

  /* ---- config editing (Milestone 5 / 5.4) ---- */
  CONFIG_KEY_NOT_ALLOWED: 'Không được phép chỉnh sửa cài đặt này.',
  CONFIG_KEY_NOT_FOUND: 'Không tìm thấy cài đặt này trong hệ thống.',
  CONFIG_LOCK_BUSY: 'Hệ thống đang bận, vui lòng thử lại sau vài giây.',
  CONFIG_STATUS_NOT_ARRAY: 'Danh sách trạng thái phải là một mảng.',
  CONFIG_STATUS_EMPTY: 'Danh sách trạng thái không được để trống.',
  CONFIG_STATUS_INVALID_ITEM: 'Mỗi trạng thái phải có "key" và "label".',
  CONFIG_STATUS_EMPTY_FIELD: 'Trạng thái không được có trường trống.',
  CONFIG_STATUS_DUPLICATE_KEY: 'Trạng thái có mã (key) trùng lặp.',
  CONFIG_STATUS_KEY_REMOVAL_NOT_ALLOWED: 'Không được xoá trạng thái đã tồn tại. Chỉ được thêm hoặc thay đổi tên.',
  CONFIG_UOM_NOT_ARRAY: 'Danh sách đơn vị tính phải là một mảng.',
  CONFIG_UOM_EMPTY: 'Danh sách đơn vị tính không được để trống.',
  CONFIG_UOM_EMPTY_ITEM: 'Đơn vị tính không được để trống.',
  CONFIG_UOM_DUPLICATE: 'Đơn vị tính trùng lặp.',
  CONFIG_CUSTOMER_NOT_ARRAY: 'Danh sách khách hàng phải là một mảng.',
  CONFIG_CUSTOMER_DUPLICATE: 'Tên khách hàng trùng lặp.',
  CONFIG_VAT_NOT_ARRAY: 'Danh sách mức thuế phải là một mảng.',
  CONFIG_VAT_EMPTY: 'Danh sách mức thuế không được để trống.',
  CONFIG_VAT_INVALID_NUMBER: 'Mức thuế phải là một số.',
  CONFIG_VAT_OUT_OF_RANGE: 'Mức thuế phải nằm trong khoảng 0 đến 1.',
  CONFIG_CURRENCY_EMPTY: 'Đơn vị tiền tệ không được để trống.',
  CONFIG_CURRENCY_TOO_LONG: 'Đơn vị tiền tệ quá dài (tối đa 10 ký tự).'
};

/**
 * Milestone 6 / Phase 2 — error message hardening.
 *
 * Every one of this project's ~88 `throw new Error(MSG.X)` sites already
 * throws a message that is EXACTLY one of the values enumerated in `MSG`
 * above — those were already reviewed and are safe to show verbatim. Any
 * OTHER `.message` reaching a top-level catch is an unexpected runtime
 * exception (GAS exceptions can embed sheet/range names, formula text, or
 * Drive file ids — more identifying than a typical stack-trace-scrubbed web
 * framework), so it must never reach the browser as-is.
 *
 * Content-based check, not a marker: this needs zero changes to any
 * existing throw site — only to the small number of top-level catches that
 * currently forward raw `err.message` text (see plan
 * 260913-2326-milestone-6-hardening-and-polish, Phase 2).
 */
var KNOWN_MSG_VALUES_ = null;
function isKnownMessage_(text) {
  if (!KNOWN_MSG_VALUES_) {
    KNOWN_MSG_VALUES_ = {};
    Object.keys(MSG).forEach(function (k) { KNOWN_MSG_VALUES_[MSG[k]] = true; });
  }
  return !!KNOWN_MSG_VALUES_[text];
}

/** Call at every top-level catch that currently forwards err.message to the browser. */
function safeErrorMessage_(err) {
  var text = (err && err.message) ? err.message : String(err);
  if (isKnownMessage_(text)) return text;
  console.error('unexpected error: ' + (err && err.stack ? err.stack : err));
  return MSG.GENERIC;
}
