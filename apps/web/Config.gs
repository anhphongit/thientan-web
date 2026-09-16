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
var BUILD = 'web-2026-09-15a-m6-hardening';

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
  GENERIC: 'Đã xảy ra lỗi. Vui lòng thử lại.',
  /** 2026-09-06 — see isMissingAuthScopeError_ in ApiClient.gs / IDENTITY.md §9.
   *  Kept short: the denied screen's dedicated card (App.html renderScopeHelp)
   *  carries the actual steps, so this line only needs to name the problem. */
  SCOPE_NOT_GRANTED: 'Tài khoản này chưa cấp đủ quyền cho ứng dụng.'
};

/** True when this deployment should show build stamps and diagnostics. */
function isDevMode_() {
  return PropertiesService.getScriptProperties().getProperty(PROP.DEV_MODE) === 'on';
}

/**
 * Milestone 6 / Phase 2 — error message hardening (web project's own copy;
 * separate Apps Script project, no shared module system, so this is
 * deliberately duplicated rather than imported — see apps/api/Config.gs's
 * copy for the full rationale). Every existing `throw new Error(MSG.X)` in
 * this project already throws a message that is exactly one of the values
 * in `MSG` above; anything else reaching handle_()'s catch is an unexpected
 * exception and must not reach the browser verbatim.
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
