# DevLog — how to see diagnostics

## 1. Where Apps Script `console.error` already goes

1. Open [script.google.com](https://script.google.com)
2. Open the **THIENTAN-WEB** project (not the API)
3. Left sidebar → **Executions** (Thực thi)
4. Click a recent run → expand **Logs**

`ApiClient.gs` already writes `console.error` there for HTTP ≠ 200 and non-JSON bodies.
Same for the **API** project when a handler throws.

## 2. What this change adds

### A. Richer on-screen errors when WEB `DEV_MODE=on`

Instead of only:

> Máy chủ dữ liệu trả về dữ liệu không hợp lệ

you get e.g.:

> Máy chủ dữ liệu trả về dữ liệu không hợp lệ [DEV] HTTP 200 · body starts with: &lt;!DOCTYPE html&gt;...

That alone usually shows the cause (HTML login page, wrong URL, etc.) without opening Logs.

### B. `DevLog` sheet on the private spreadsheet

When **API** Script Property `DEV_MODE` = `on`:

- Failed API actions are appended to sheet **DevLog**
- WEB best-effort calls action `logDev` after bad HTTP/non-JSON (if API is still reachable)

Columns: `timestamp | level | source | actor | message | detail`

Capped at ~300 rows.

## 3. Setup (once)

1. **API** project → Project Settings → Script properties:
   - `DEV_MODE` = `on`
2. **WEB** project → same: `DEV_MODE` = `on` (you likely already have this)
3. Push + publish **new versions** of both API and WEB
4. Reproduce the error once
5. Open the private spreadsheet → tab **DevLog** (created automatically on first write)

Turn both `DEV_MODE` off before giving the link to employees.

## 4. Typical meaning of `API_BAD_RESPONSE`

| Body snippet looks like | Cause |
|-------------------------|--------|
| `<!DOCTYPE html>` / Google sign-in | API access is not **Anyone**, or wrong `/exec` URL |
| Empty | Deployment has no version / cold failure |
| JSON with `ok:false` | Not this error — that path shows the API's Vietnamese `error` string |

## 5. Files to copy into the repo

```
apps/api/Config.gs
apps/api/Security.gs
apps/api/Router.gs
apps/web/ApiClient.gs
apps/web/Main.gs
apps/web/Config.gs
```
