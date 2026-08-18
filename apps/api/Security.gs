/**
 * Security.gs — the second guard in front of the data.
 *
 * WHAT THIS DOES AND DOES NOT DO — read before trusting it.
 *
 * The API is deployed anonymously, so anyone who learns the URL can POST to it.
 * The shared secret is what stops them. And because the caller asserts `actor`,
 * a leaked secret means full compromise: the attacker can impersonate any user
 * in the Users sheet, including the admin.
 *
 * Rotation and revocation DO NOT fix that. Nothing in a shared-secret design can:
 * whatever the web app can compute, an attacker holding the same secret can
 * compute too. What this layer buys is **bounding the damage**:
 *
 *   · a leaked secret stops working after `rotationDays` instead of forever
 *   · the admin can kill every session in seconds from the Sheets app on a phone,
 *     by setting Security!status to `revoked` — no Apps Script editor needed
 *   · denied attempts are logged, so abuse becomes visible instead of silent
 *
 * The state lives in a SHEET rather than Script Properties precisely so that
 * revocation needs nothing but Sheets access. It is NOT cached: instant
 * revocation is the entire point, and a TTL would undo it — the same mistake that
 * once made `active` = FALSE take two minutes to bite.
 */

/** @return {Object} the Security sheet as a plain key → value map. */
function readSecurity_() {
  var out = {};
  var rows = readAll_(SHEETS.SECURITY);
  for (var i = 0; i < rows.length; i++) {
    var key = String(rows[i].key || '').trim();
    if (key) out[key] = rows[i].value;
  }
  return out;
}

/** The secret this project is configured with. */
function getConfiguredSecret_() {
  return PropertiesService.getScriptProperties().getProperty(PROP.SHARED_SECRET) || '';
}

/**
 * A short, non-reversible marker for "which secret generation is this".
 * Safe to store in the sheet: it identifies the secret without revealing it.
 */
function fingerprint_(secret) {
  if (!secret) return '';
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, secret, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(digest).replace(/[^A-Za-z0-9]/g, '').substring(0, 12);
}

function startOfDay_(value) {
  var d = (value instanceof Date) ? new Date(value.getTime()) : new Date(value);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween_(from, to) {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

/**
 * Evaluate the gate.
 *
 * @return {{ok:boolean, state:string, daysLeft:number,
 *           adminMessage:string, rotatedAt:Date|null, expiresAt:Date|null}}
 *   state is one of: active | expiring | expired | revoked | mismatch | unset
 */
function securityGate_() {
  var cfg = readSecurity_();
  var today = startOfDay_(new Date());

  var result = {
    ok: false, state: 'unset', daysLeft: 0,
    adminMessage: MSG.LOCKED_ADMIN_UNSET,
    rotatedAt: startOfDay_(cfg.rotatedAt), expiresAt: startOfDay_(cfg.expiresAt)
  };

  if (String(cfg.status || '').trim().toLowerCase() === 'revoked') {
    result.state = 'revoked';
    result.adminMessage = MSG.LOCKED_ADMIN_REVOKED;
    return result;
  }

  var registered = String(cfg.secretFingerprint || '').trim();
  if (!registered) return result; // unset — rotateSecret() has never run

  if (registered !== fingerprint_(getConfiguredSecret_())) {
    result.state = 'mismatch';
    result.adminMessage = MSG.LOCKED_ADMIN_MISMATCH;
    return result;
  }

  if (!result.expiresAt) return result; // registered but no expiry recorded

  var daysLeft = daysBetween_(today, result.expiresAt);
  result.daysLeft = daysLeft;

  if (daysLeft < 0) {
    result.state = 'expired';
    result.adminMessage = MSG.LOCKED_ADMIN_EXPIRED;
    return result;
  }

  var warnDays = Number(cfg.warnDays) || 7;
  result.ok = true;
  result.state = (daysLeft <= warnDays) ? 'expiring' : 'active';
  result.adminMessage = '';
  return result;
}

/* ------------------------------------------------------------------ */
/* Editor-only maintenance functions                                   */
/* ------------------------------------------------------------------ */

/**
 * Bless the secret currently in Script Properties and start a fresh validity
 * window. Run this from the API editor AFTER updating SHARED_SECRET in both
 * projects.
 *
 * Rotation happens here, in the editor, and never through the web API. That is
 * deliberate: no secret ever travels through a browser, and an expired system
 * cannot lock the admin out of fixing it.
 */
function rotateSecret() {
  var secret = getConfiguredSecret_();
  if (!secret) throw new Error('SHARED_SECRET is not set on this project.');

  var cfg = readSecurity_();
  var days = Number(cfg.rotationDays) || 30;
  var now = startOfDay_(new Date());
  var expires = startOfDay_(new Date(now.getTime() + days * 86400000));

  setSecurityValue_('status', 'active');
  setSecurityValue_('secretFingerprint', fingerprint_(secret));
  setSecurityValue_('rotatedAt', now);
  setSecurityValue_('expiresAt', expires);

  var warning = (secret.length < 24)
    ? '\n⚠️  Secret is only ' + secret.length + ' chars. Use: openssl rand -base64 32'
    : '';
  var summary = 'Secret registered.\n' +
    '  fingerprint : ' + fingerprint_(secret) + '\n' +
    '  valid for   : ' + days + ' days\n' +
    '  expires on  : ' + Utilities.formatDate(expires, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy') +
    warning;
  console.log(summary);
  logSecurityEvent_('secret_rotated', 'fingerprint=' + fingerprint_(secret));
  return summary;
}

/**
 * Kill switch. Equivalent to setting Security!status = revoked by hand, which is
 * the intended emergency path because it works from the Sheets mobile app.
 */
function revokeSecret() {
  setSecurityValue_('status', 'revoked');
  logSecurityEvent_('secret_revoked', 'via revokeSecret()');
  var summary = 'Access REVOKED. Every request is now denied.\n' +
    'To restore: set a new SHARED_SECRET in both projects, then run rotateSecret().';
  console.log(summary);
  return summary;
}

/** Human-readable state, for a quick check from the editor. */
function securityStatus() {
  var g = securityGate_();
  var fmt = function (d) {
    return d ? Utilities.formatDate(d, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy') : '(chưa đặt)';
  };
  var summary = 'state      : ' + g.state + (g.ok ? '  (access allowed)' : '  (ACCESS DENIED)') +
    '\nrotated on : ' + fmt(g.rotatedAt) +
    '\nexpires on : ' + fmt(g.expiresAt) +
    '\ndays left  : ' + g.daysLeft +
    (g.adminMessage ? '\naction     : ' + g.adminMessage : '');
  console.log(summary);
  return summary;
}

function setSecurityValue_(key, value) {
  var sheet = getSheet_(SHEETS.SECURITY);
  var rows = readAll_(SHEETS.SECURITY);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].key || '').trim() === key) {
      updateRecord_(SHEETS.SECURITY, rows[i]._row, { key: key, value: value });
      return;
    }
  }
  appendRecord_(SHEETS.SECURITY, { key: key, value: value, description: '' });
}

/* ------------------------------------------------------------------ */
/* Audit trail                                                         */
/* ------------------------------------------------------------------ */

/**
 * Record a security-relevant event.
 *
 * Throttled to one write per event type per minute: this endpoint is anonymous,
 * so without a throttle an attacker could flood the sheet and burn the daily
 * write quota — turning a logging feature into a denial-of-service lever.
 */
function logSecurityEvent_(event, detail) {
  var cache = CacheService.getScriptCache();
  var key = 'seclog:' + event;
  if (cache && cache.get(key)) return;
  if (cache) cache.put(key, '1', 60);

  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(SHEETS.SECURITY_LOG);
    if (!sheet) {
      sheet = ss.insertSheet(SHEETS.SECURITY_LOG);
      sheet.getRange(1, 1, 1, HEADERS.SecurityLog.length).setValues([HEADERS.SecurityLog]);
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([new Date(), event, String(detail || '').substring(0, 300)]);

    var rows = sheet.getLastRow() - 1;
    if (rows > SECURITY_LOG_MAX_ROWS + 100) {
      sheet.deleteRows(2, rows - SECURITY_LOG_MAX_ROWS);
    }
  } catch (err) {
    console.error('logSecurityEvent_ failed: ' + err);
  }
}

/* ------------------------------------------------------------------ */
/* Optional: email the admin before the key expires                    */
/* ------------------------------------------------------------------ */

/** Run once from the editor to install a daily 08:00 check. */
function installExpiryReminder() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'checkSecretExpiry') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkSecretExpiry').timeBased().everyDays(1).atHour(8).create();
  return 'Daily reminder installed (08:00 Asia/Ho_Chi_Minh).';
}

/** Trigger target. Silent while the key is healthy. */
function checkSecretExpiry() {
  var g = securityGate_();
  if (g.ok && g.state === 'active') return;

  var admin = PropertiesService.getScriptProperties().getProperty(PROP.ADMIN_EMAIL);
  if (!admin) {
    console.error('checkSecretExpiry: ADMIN_EMAIL not set, cannot notify.');
    return;
  }

  var subject = g.ok
    ? '[THIÊN TÂN] Khoá bảo mật sắp hết hạn (' + g.daysLeft + ' ngày)'
    : '[THIÊN TÂN] Khoá bảo mật đã hết hạn — nhân viên không truy cập được';

  MailApp.sendEmail(admin, subject,
    'Trạng thái khoá: ' + g.state + '\n' +
    'Số ngày còn lại: ' + g.daysLeft + '\n\n' +
    'Cách đổi khoá:\n' +
    '  1. Tạo khoá mới:  openssl rand -base64 32\n' +
    '  2. Dán vào SHARED_SECRET của CẢ HAI project (API và WEB)\n' +
    '  3. Mở project API, chạy hàm rotateSecret()\n\n' +
    'Khoá ngay lập tức khi cần: mở sheet Security, đặt status = revoked.');
}
