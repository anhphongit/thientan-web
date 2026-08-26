/**
 * Config.gs — WEB project configuration.
 *
 * This project has NO spreadsheet access and requests no Sheets scope. That is
 * the point: an employee's consent screen says only "see your primary email
 * address" and "connect to an external service".
 *
 * It knows two things the API does not: who the visitor is, and how to reach
 * the API.
 */

/** Bump on every meaningful web change. Shown in the footer when DEV_MODE is on. */
var BUILD = 'web-2026-08-26-4';

var PROP = {
  API_URL: 'API_URL',
  SHARED_SECRET: 'SHARED_SECRET',
  DEV_MODE: 'DEV_MODE',
  /** Admin address shown to a refused visitor so they can ask for access. */
  SUPPORT_EMAIL: 'SUPPORT_EMAIL'
};

/** Vietnamese messages owned by the web layer. Data messages come from the API. */
var MSG = {
  NOT_CONFIGURED: 'Ứng dụng chưa được cấu hình (thiếu API_URL hoặc SHARED_SECRET). ' +
    'Vui lòng liên hệ quản trị viên.',
  NO_IDENTITY: 'Không xác định được tài khoản Google của bạn. Vui lòng đăng nhập lại.',
  API_UNREACHABLE: 'Không kết nối được máy chủ dữ liệu. Vui lòng thử lại sau ít phút.',
  LOCKED: 'Hệ thống đang tạm khoá để bảo mật. Vui lòng liên hệ quản trị viên.',
  API_BAD_RESPONSE: 'Máy chủ dữ liệu trả về dữ liệu không hợp lệ.',
  GENERIC: 'Đã xảy ra lỗi. Vui lòng thử lại.'
};

/** True when this deployment should show build stamps and diagnostics. */
function isDevMode_() {
  return PropertiesService.getScriptProperties().getProperty(PROP.DEV_MODE) === 'on';
}
