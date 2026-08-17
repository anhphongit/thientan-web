/**
 * Auth.gs — who is using the web app.
 *
 * This project is deployed "Execute as: USER ACCESSING", so the employee
 * authorizes it themselves and Session.getActiveUser() returns their real
 * address. That is the entire reason this project exists separately from the API.
 *
 * DO NOT add ScriptApp.getIdentityToken() here or anywhere else. It reports the
 * EFFECTIVE user, and using it as a fallback authenticated every visitor as the
 * owner (bug found 2026-08-17). Identity must fail closed.
 */
function resolveActiveEmail_() {
  var email = '';
  try {
    email = (Session.getActiveUser().getEmail() || '').trim();
  } catch (err) {
    console.error('resolveActiveEmail_: ' + err);
    return '';
  }
  return email.toLowerCase();
}

/** Identity sources, for troubleshooting. Only when DEV_MODE is on. */
function collectDiagnostics_() {
  if (!isDevMode_()) return null;

  var out = {};
  try {
    out.activeUser = Session.getActiveUser().getEmail() || '(empty)';
  } catch (err) { out.activeUser = 'ERROR: ' + err; }
  try {
    out.effectiveUser = Session.getEffectiveUser().getEmail() || '(empty)';
  } catch (err) { out.effectiveUser = 'ERROR: ' + err; }

  out.note = 'Deployed as USER_ACCESSING, so activeUser should be the employee. ' +
             'If it is empty, check the web deployment "Execute as" setting.';
  return out;
}
