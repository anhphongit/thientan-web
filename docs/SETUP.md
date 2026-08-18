# Setup — two-project deployment (Option B)

Follow this in order. Every step has a checkbox; nothing later works if an earlier
box is unticked.

**Why two projects:** Google will not give you visitor identity and private Sheet
access in the same deployment. `THIENTAN-WEB` runs *as the employee* so it knows
who they are; `THIENTAN-API` runs *as you* so it can open the Restricted sheet.
Full reasoning in [`IDENTITY.md`](IDENTITY.md).

```
Employee browser
   │ signs in + authorizes (once)
   ▼
THIENTAN-WEB     Execute as: USER ACCESSING     ← knows WHO. No data access.
   │ POST { secret, actor, action, payload }
   ▼
THIENTAN-API     Execute as: ME                 ← has data. Trusts the secret.
   ▼
Private Spreadsheet (Restricted)
```

---

## Step 0 — The spreadsheet

- [x] Create a Google Spreadsheet, e.g. `THIENTAN - Dữ liệu`
- [x] **Share → Restricted.** Never "Anyone with the link". Never add employees.
- [x] Copy the ID from the URL:
      `docs.google.com/spreadsheets/d/`**`<THIS PART>`**`/edit`

Do **not** create tabs or type headers — Step 3 does that.

## Step 1 — Generate the shared secret

```bash
openssl rand -base64 32
```

- [x] Save it somewhere safe. You will paste it into **both** projects.

This string is the only thing standing between the internet and your data, because
the API is deployed with anonymous access (see Step 4). Treat it like a password.

## Step 2 — Create THIENTAN-API

- [x] <https://script.google.com> → **New project** → rename to `THIENTAN-API`
- [x] **Project Settings** → tick *"Show appsscript.json manifest file in editor"*
- [x] **Project Settings → Script Properties**:

| Property | Value |
|---|---|
| `SPREADSHEET_ID` | from Step 0 |
| `SHARED_SECRET` | from Step 1 |
| `ADMIN_EMAIL` | your own Gmail — the first admin account |

> `ADMIN_EMAIL` exists because this project deliberately has **no**
> `userinfo.email` scope, so `Session.getEffectiveUser()` throws here. That is
> intentional: the API runs as you for every employee, so any identity it could
> read would say "owner" — the bug from 2026-08-17. Removing the ability beats
> remembering the rule.

- [x] Copy the **Script ID** from Project Settings

Then push the code:

```bash
cd apps/api
cp .clasp.json.example .clasp.json     # paste the Script ID into it
clasp push
```

## Step 3 — Run the bootstrap

- [x] In the API editor, select **`setupMilestone1`** → **Run**
- [x] Authorize when prompted (Advanced → Go to THIENTAN-API)
- [x] Read the execution log. Expect:

```
Sheet "Users": created with 8 columns.
Sheet "Config": created with 3 columns.
Sheet "Security": created with 3 columns.
Config: added 5 default row(s).
Security: added 6 default row(s).
Admin seed: added you@gmail.com with all permissions.
SHARED_SECRET: present (44 chars).
Security gate: key registered, valid 30 more day(s).
Session identity: correctly unavailable in the API project.
```

Any line starting with ⚠️ means a Script Property is missing — go back to Step 2.
Running it twice is safe: it never overwrites existing rows.

## Step 4 — Deploy THIENTAN-API

- [x] **Deploy → New deployment → Web app**
  - Execute as: **Me**
  - Who has access: **Anyone**
- [x] Copy the `/exec` URL

> **"Anyone" means anonymous.** This is deliberate. The alternative, "Anyone with a
> Google account", requires an `Authorization` header, and Apps Script web apps
> redirect to `googleusercontent.com` **without resending it** — a reliable source
> of mystery 401s. The 32-byte secret is the protection instead. If it ever leaks,
> rotate it in both projects' Script Properties; nothing else changes.

## Step 5 — Create THIENTAN-WEB

- [x] New Apps Script project → rename to `THIENTAN-WEB`
- [x] Show the manifest, as in Step 2
- [x] **Script Properties**:

| Property | Value |
|---|---|
| `API_URL` | the `/exec` URL from Step 4 |
| `SHARED_SECRET` | the **same** string from Step 1 |
| `DEV_MODE` | `on` while building — see below |
| `SUPPORT_EMAIL` | your address, shown to refused visitors so they can request access |

```bash
cd apps/web
cp .clasp.json.example .clasp.json     # paste this project's Script ID
clasp push
```

## Step 6 — Deploy THIENTAN-WEB

- [x] **Deploy → New deployment → Web app**
  - Execute as: **User accessing the web app**
  - Who has access: **Anyone with a Google account**
- [x] Copy the `/exec` URL — **this is the link employees get**

## Step 7 — Verify

- [x] Open the WEB `/exec` URL yourself → your name, role `admin`, all perission chips
- [x] With `DEV_MODE=on`, the footer shows `web-… · api-…`
- [x] Open the API `/exec` URL in a browser → plain text `THIENTAN API` and nothing else
- [x] Add a second Google account to the `Users` sheet, open the link as them →
      **their** name and **their** permissions, not yours
- [x] That second account cannot open the spreadsheet directly

The fourth box is the one that matters. It is what the whole two-project structure
exists to make true.

---

## Adding an employee

1. Add a row to `Users`: their Gmail, `displayName`, `role` = `staff`,
   `active` = `TRUE`, and a `permissions` JSON copied from
   [`PERMISSIONS.md`](PERMISSIONS.md) §3.
2. Send them the **WEB** `/exec` URL. Never the API URL, never the spreadsheet.

Use the address they actually sign into Google with day to day. There is no way
for the app to switch their account for them (`IDENTITY.md` §6d), so authorising
the account already in their browser saves everyone the private-window dance.

Permission and `active` changes take effect on the employee's **very next
request** — the Users sheet is read fresh every time, deliberately. To revoke
someone, set `active` = `FALSE`; they are locked out at once.

Any of `FALSE`, `false`, `0`, `No` or an empty cell counts as inactive; the check
denies by default.

---

## Daily workflow — push order matters

The one real hazard of two projects is changing one side and forgetting to publish
the other. **Always push and version the API first**, so the web app never calls an
action that does not exist yet:

```bash
# 1. API first
cd apps/api && clasp push
#    Deploy → Manage deployments → Edit → New version

# 2. WEB second
cd apps/web && clasp push
#    Deploy → Manage deployments → Edit → New version

# 3. Check the footer build stamps match
```

`clasp push` alone changes nothing for users — `/exec` serves the last **version**.
The `/dev` URL always runs newest code but only for you.

### The build stamp

With `DEV_MODE=on` the footer shows both build strings, and turns amber when their
dates differ — that is drift, and it means you forgot a version somewhere.

**Set `DEV_MODE=off` (or delete the property) before handing the app to employees.**
It also switches off the identity diagnostics panel.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| *"Máy chủ dữ liệu trả về dữ liệu không hợp lệ"* | The API returned an HTML sign-in page — its access is not "Anyone", or `API_URL` is wrong | Re-check Step 4 and the `API_URL` property |
| *"Yêu cầu không được phép"* | The two `SHARED_SECRET` values differ | Re-paste the same string into both projects |
| *"Không kết nối được máy chủ dữ liệu"* | API URL unreachable, or no deployment version published | Re-check Step 4; publish a version |
| *"Tài khoản của bạn chưa được cấp quyền"* | Signed in, but not in the `Users` sheet | Add the row, or sign in as the right account |
| *"Không xác định được tài khoản Google"* | The WEB deployment is not **Execute as: User accessing** | Fix Step 6 and publish a new version |
| *"Ứng dụng API chưa được triển khai đúng cách"* | The API deployment is not **Execute as: Me** | Fix Step 4 and publish a new version |
| `Specified permissions are not sufficient to call Session.getEffectiveUser` | Something in `apps/api` is reading a Session identity — it must not | Use the `ADMIN_EMAIL` property instead. Do **not** add the `userinfo.email` scope to the API |
| `⚠️ Admin seed skipped` | `ADMIN_EMAIL` not set on the API project | Add it in Step 2 and re-run `setupMilestone1` |
| Employee sees the old UI | Pushed without publishing a version | Manage deployments → Edit → New version |
| A deactivated user still gets in | Old build with the user cache | Push the API and publish a new version |
| Employee is signed into the wrong Google account | Google offers no way for a web app to switch accounts — see `IDENTITY.md` §6d | Either add the account they actually use to `Users`, or have them open the app in a private window |

## What each project may touch

| | THIENTAN-WEB | THIENTAN-API |
|---|---|---|
| Runs as | the employee | you |
| OAuth scopes | `userinfo.email`, `script.external_request` | `spreadsheets`, `drive.file` |
| Sees the spreadsheet | ❌ never | ✅ |
| Knows who the visitor is | ✅ | only via `actor` |
| Employees authorize it | ✅ once | ❌ never |

The web project asking for **no spreadsheet scope** is why the employee's consent
screen reads *"see your primary email address"* and *"connect to an external
service"* — and nothing about their files.

---

## 11. Monthly: rotate the security key

The API is reachable by anyone who learns its URL; the shared secret is what
stops them, and a leaked secret grants impersonation of any user. It therefore
expires every 30 days.

```bash
openssl rand -base64 32
```

1. Paste into `SHARED_SECRET` on **both** projects (API and WEB).
2. API editor → run `rotateSecret`.

Admins see an amber banner from 7 days out and a red one once it lapses, with the
steps in-app. Run `installExpiryReminder` once to also get an email.

**Emergency:** open the `Security` sheet and set `status` = `revoked`. Everything
is refused immediately — no editor, no deploy, works from the Sheets phone app.

Full model, limits and runbook: [`SECURITY.md`](SECURITY.md).
