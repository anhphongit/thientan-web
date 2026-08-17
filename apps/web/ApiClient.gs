/**
 * ApiClient.gs — the only file that talks to THIENTAN-API.
 *
 * The employee's email is read HERE, from Session, and attached as `actor`.
 * It is never accepted from the browser: a client that could name its own actor
 * could name the admin's.
 */

/**
 * @param {string} action  registered in the API's getActions_()
 * @param {Object} payload action arguments
 * @return {*} the API's `data` on success
 * @throws {Error} with a Vietnamese message on any failure
 */
function apiCall_(action, payload) {
  var email = resolveActiveEmail_();
  if (!email) throw new Error(MSG.NO_IDENTITY);

  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty(PROP.API_URL);
  var secret = props.getProperty(PROP.SHARED_SECRET);
  if (!url || !secret) {
    console.error('apiCall_: API_URL or SHARED_SECRET missing on the web project.');
    throw new Error(MSG.NOT_CONFIGURED);
  }

  var response;
  try {
    response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        secret: secret,
        actor: email,
        action: action,
        payload: payload || {}
      }),
      muteHttpExceptions: true,
      followRedirects: true
    });
  } catch (err) {
    console.error('apiCall_(' + action + '): fetch failed: ' + err);
    throw new Error(MSG.API_UNREACHABLE);
  }

  var code = response.getResponseCode();
  var text = response.getContentText();

  if (code !== 200) {
    console.error('apiCall_(' + action + '): HTTP ' + code + ' — ' + text.slice(0, 300));
    throw new Error(MSG.API_UNREACHABLE);
  }

  var body;
  try {
    body = JSON.parse(text);
  } catch (err) {
    // Usually an HTML sign-in page, which means the API deployment's access
    // setting is not "Anyone".
    console.error('apiCall_(' + action + '): non-JSON response: ' + text.slice(0, 300));
    throw new Error(MSG.API_BAD_RESPONSE);
  }

  lastApiBuild_ = body.build || '';

  if (!body.ok) throw new Error(body.error || MSG.GENERIC);
  return body.data;
}

/** Build string from the most recent API response, for the dev footer. */
var lastApiBuild_ = '';
