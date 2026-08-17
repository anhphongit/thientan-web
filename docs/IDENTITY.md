# Identity — the hard problem in this architecture

**Status:** RESOLVED 2026-08-17 by adopting **Option B** (two web apps).
Measured first: `Session.getActiveUser()` was empty for employees under
`Execute as: Me`. Implementation and setup steps are in `SETUP.md`.
**Found:** 2026-08-17, during real multi-account testing.

---

## 1. What went wrong

Every visitor to the web app was identified as the **owner** (`ttwadmin…@gmail.com`)
and received full admin rights, regardless of which Google account they used.

The cause was a fallback added on 2026-08-15:

```js
// WRONG — do not restore this
var token = ScriptApp.getIdentityToken();
var claims = decode(token);
return claims.email;
```

`ScriptApp.getIdentityToken()` returns a token for the **effective user** — the
identity the script runs *as*. In an `Execute as: Me` deployment that is always the
owner. So the fallback did not identify the visitor; it identified the deployer,
and handed every visitor the admin row from the `Users` sheet.

**Fixed the same day:** `resolveActiveEmail_()` now trusts only
`Session.getActiveUser()` and returns `''` when Google withholds the identity —
denying access rather than granting admin.

---

## 2. Why identity is awkward here at all

Two Google settings pull in opposite directions:

| | Visitor identity | Private Sheet access |
|---|---|---|
| **Execute as: Me** | ❌ `getActiveUser()` is usually blank | ✅ script opens the Sheet as the owner |
| **Execute as: User accessing** | ✅ real visitor email | ❌ visitor needs Drive access to the Sheet |

Google's documented behaviour: the active user's email is unavailable "in any
context that allows a script to run without that user's authorization … like a web
app deployed to *execute as me*". In practice it is often present for visitors
inside the **same Workspace domain** and blank for outside/consumer Gmail accounts.

This project uses a consumer Gmail owner and consumer Gmail employees — the worst
case for that rule.

---

## 3. Measure before choosing

Do not pick a fix from theory. Turn on the diagnostic and observe.

1. Apps Script → **Project Settings → Script Properties** → add
   `DIAG_MODE` = `on`.
2. Deploy a new version.
3. Have an employee (a different Google account, **not** in the `Users` sheet) open
   the `/exec` URL.
4. The no-access card will list a **Chẩn đoán nhận diện** table.

### Result on this project (2026-08-17)

| Source | Value for an employee |
|--------|----------------------|
| `activeUser` | **`(empty)`** ← the only trustworthy source, and it is blank |
| `effectiveUser` | `ttwadmin170826@gmail.com` (the owner — as expected) |
| `identityToken` | `ttwadmin170826@gmail.com` (the owner — proves why it was unusable) |

**Conclusion: Execute as: Me cannot identify employees here.** Option A, B or C
below is required. Consumer Gmail owner + consumer Gmail employees is exactly the
case Google withholds identity for.

Read `activeUser`:

| `activeUser` shows | Meaning | Do this |
|--------------------|---------|---------|
| the employee's own email | Identity works | Nothing. Keep Execute as: Me. Set `DIAG_MODE` = `off`. |
| `(empty)` | Google withholds it | Pick Option A or B below |

`effectiveUser` will always be the owner — that is expected and is exactly why the
identity token was unusable.

**Turn `DIAG_MODE` off afterwards.** It reveals the owner's address.

---

## 4. Option A — Verify a Google Sign-In token (recommended if identity is empty)

Keep `Execute as: Me`. The page runs Google Identity Services, the visitor signs in
*in the browser*, and the client sends the resulting ID token to the server. The
server verifies it against Google and reads the email from the verified claims.

```
Browser → GIS sign-in → ID token (signed by Google)
        → google.script.run.apiSignIn(token)
Server  → verify signature via oauth2.googleapis.com/tokeninfo
        → trusted visitor email → Users sheet → permissions
```

- ✅ Sheets stay Restricted; employees never touch Drive
- ✅ One deployment; `SheetsRepo.gs` unchanged
- ✅ Cryptographically verified — a forged email fails signature checking
- ❌ One-time setup: a Google Cloud OAuth Client ID, and the Apps Script project
  attached to a standard GCP project
- ❌ Employees see an in-page sign-in button rather than being silently recognised

**Non-negotiable if we build this:** verify the token *server-side* every request
and cache the result briefly. Never trust an email the client simply asserts.

## 5. Option B — Split into two web apps

A front app deployed `Execute as: User accessing` (so `getActiveUser()` works, with
no Sheet access), calling a second owner-deployed web app that holds the data,
authenticated with a shared secret in Script Properties.

- ✅ No Google Cloud setup
- ❌ Two deployments to keep in sync
- ❌ A `UrlFetchApp` round trip on every request — noticeably slower
- ❌ The secret is the only thing standing between a visitor and the data layer

## 6. Option C — Accept Workspace

If the business moves to Google Workspace on its own domain, `getActiveUser()`
works normally under `Execute as: Me` and none of this is needed. Worth pricing
before building Option A.

---

## 6b. Why the account-switch links showed a Drive error

The first attempt offered `/macros/u/0..3/s/<id>/exec` links and an
`AccountChooser?continue=` link. Both produced Google's Drive page
*"Rất tiếc, không thể mở tệp tại thời điểm này"*:

- `/u/N/` is the index of an account signed in **that browser**. With two accounts
  signed in, slots 2 and 3 do not exist, so Google cannot resolve the script file
  for that slot and falls back to the Drive error page.
- `AccountChooser` is legacy, and its `continue` target here is a Drive-hosted
  script URL, so the account context is lost across the redirect and it lands on
  the same page.

Replaced with what is reliable: **sign out → sign in as the right account → reopen
the app URL**, with the URL shown and copyable, plus a suggestion to use a private
window.

## 6c. What was built

Option B, on 2026-08-17. `apps/web` is deployed **Execute as: User accessing**, so
each employee authorizes it and `Session.getActiveUser()` returns their real
address. It holds no data. `apps/api` is deployed **Execute as: Me** with anonymous
access and a 32-byte shared secret, and is the only project that can open the
spreadsheet.

Verified in a stub harness that wires the web project's `UrlFetchApp` directly into
the API's `doPost`: employee and owner receive different names, different
permissions and different `visible_fields`; unregistered, deactivated and
no-identity paths all deny with the right Vietnamese message; a wrong secret is
rejected; and per-email script-cache keys do not leak one user's permissions to
another.

## 7. Meanwhile

The app **fails closed**: an unidentifiable visitor sees
*"Không xác định được tài khoản Google của bạn"* and gets nothing. The owner can
still use and develop the app normally, so Milestone 2 work is not blocked — but
Milestone 1 cannot be signed off until an employee can log in as themselves.

---

## 8. Deep comparison — read before choosing

### 8.1 What an employee actually experiences

| | **A. OAuth flow** | **B. Two web apps** | **C. Workspace** |
|---|---|---|---|
| First visit | Redirect to Google → **unverified-app warning** → *Advanced → Go to THIENTAN (unsafe)* → back to app | Same **unverified-app warning**, shown as a consent dialog | Normal Google sign-in, no warning |
| Later visits | Brief redirect flash on every page load | Silent | Silent |
| Switching account | Sign out, sign in, reopen | Sign out, sign in, reopen | Standard Google account switcher works |

**The warning screen is the single biggest practical difference.** Any Apps Script
project owned by a personal Gmail account is "unverified" to Google, so employees
must click through a red *"Google hasn't verified this app"* screen the first time.
For 5–6 people you can walk them through it once. It cannot be removed without
either Google's OAuth verification review or a Workspace domain.

### 8.2 Why Option A has a session problem

Apps Script cannot set cookies, and the UI runs inside a sandboxed
`googleusercontent.com` iframe where browser storage is unreliable. So after the
OAuth callback there is nowhere clean to keep "this person is signed in".

The practical answer is to re-run the flow on every page load. Google returns
immediately once consent is granted, so it works — but the user sees a redirect
flash each time, and roughly 80 of the ~250 lines exist only to manage that.

That is why Option A, despite being the most textbook-correct design, has the worst
effort-to-benefit ratio *at this scale*.

### 8.3 What actually breaks over time

| | Real ongoing risk |
|---|---|
| **A** | The Apps Script project must stay linked to its Google Cloud project — detach it and auth dies. An OAuth app in *Testing* mode needs each employee added as a test user by hand. |
| **B** | **Version drift.** Two deployments; change the backend, forget to publish a new version, and the front app silently talks to old code. This is the failure that will actually bite, not the latency. |
| **C** | Nothing. This is the supported path. |

Latency in B (~0.5–1s per request from the internal round trip) sounds like the
drawback but is not: at ≤100 orders/month nobody notices. Version drift is the
drawback.

### 8.4 The honest cost of C

Not the money — about $7/user/month, so ~$50/month for 7 people. The real cost is
that **everyone's email address changes**. Employees on personal Gmail move to
`@company` addresses, and the `Users` sheet, plus any account they use elsewhere,
follows. That is an organisational decision, not a technical one.

Against that: it deletes ~250 lines of authentication code that would otherwise be
this project's most security-sensitive component and its most likely source of
future bugs — as the last two days demonstrated. It also removes the unverified-app
warning entirely.

### 8.5 Recommendation

1. **Price Workspace first.** If the business wants company email addresses anyway,
   C is the best answer and makes this entire document obsolete.
2. **If cost must stay zero, build B.** Lowest-risk build, no Cloud console, and the
   one real hazard (version drift) is solvable with a deployment checklist.
3. **Choose A only** if a single deployment matters more than the redirect flash and
   the Cloud setup.
