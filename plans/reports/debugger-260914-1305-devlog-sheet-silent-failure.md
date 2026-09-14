# DevLog silent-write investigation — 2026-09-14

## Executive summary

Root cause found, with high confidence, and it is NOT a single bug — it's **two independent silent-failure points stacked**, either of which alone explains "zero DevLog rows despite live errors":

1. **Two separate `DEV_MODE` script properties gate the pipeline independently** — one on the WEB project (`apps/web/Config.gs:39`), one on the API project (`apps/api/Security.gs:272`). Both must be `'on'` (exact string match) for a row to land. If either is unset/blank/`'true'`/`'On'`/anything but the literal string `'on'`, the corresponding side no-ops with **zero error, zero log line, zero HTTP-visible signal**.
2. **`devNote_()` never inspects the API's response** (`apps/web/ApiClient.gs:210-233`). Even when the POST succeeds end-to-end (HTTP 200, `ok:true`), the API's own `actionLogDev_` can legitimately return `{logged:false}` (API DEV_MODE off) and `devNote_` discards the response object entirely — no `JSON.parse`, no check of `body.ok` or `body.data.logged`. So a "successful" fetch from Stackdriver's point of view proves nothing about whether a sheet row was written.

Both are real, provable bugs in this codebase (design flaws, not misconfiguration accidents per se — see below) and are independent of the currently-in-progress `plans/260912-1110-apiclient-transient-failure-hardening` fix, which correctly added console.error as primary source of truth specifically because this exact class of silence was already suspected.

## Evidence chain

### 1. `isDevMode_()` (web side) — `apps/web/Config.gs:39-41`
```js
function isDevMode_() {
  return PropertiesService.getScriptProperties().getProperty(PROP.DEV_MODE) === 'on';
}
```
- Reads Script Property `DEV_MODE` on the **WEB** Apps Script project.
- Strict `=== 'on'` — any other value (`''`, `undefined`, `'true'`, `'ON'`, `'1'`) is falsy.
- `devNote_()` early-returns at `apps/web/ApiClient.gs:211` if this is false. **No log line at all is emitted** — not even a console.error — this is the quietest possible failure mode. If the user's account/deployment has this property unset (e.g. a fresh deployment, or a properties value that drifted/was cleared), every `devNote_()` call across the whole session is a silent no-op from the first line.

### 2. `isApiDevMode_()` (API side) — `apps/api/Security.gs:272-274`
```js
function isApiDevMode_() {
  return PropertiesService.getScriptProperties().getProperty(PROP.DEV_MODE) === 'on';
}
```
- **This is a second, entirely separate Script Property**, living on the API Apps Script project (different project = different property store from #1).
- `logDevEvent_()` (`apps/api/Security.gs:281-311`) early-returns at line 282 if this is false — again, no error, no log.
- `actionLogDev_()` (`apps/api/Router.gs:313-322` / `Security.gs:313-322`) calls `logDevEvent_` unconditionally then returns `{ logged: isApiDevMode_() }` — this return value is the ONLY signal that a row was (or wasn't) written, and:

### 3. `devNote_()` never reads that signal — `apps/web/ApiClient.gs:210-233`
```js
function devNote_(level, source, message, detail) {
  if (!isDevMode_()) return;
  try {
    ...
    if (!url || !secret) return;
    postJsonToApi_(url, JSON.stringify({ ... action: 'logDev', ... }));
  } catch (err) {
    console.error('devNote_ failed: ' + err);
  }
}
```
- The return value of `postJsonToApi_(...)` is discarded (not even assigned to a variable).
- Contrast with `apiCall_()` (same file, lines 110-128), which does `JSON.parse(text)` and checks `body.ok` before trusting a response — `devNote_` does none of that.
- Consequence: whether the API responds `{ok:true, data:{logged:true}}` or `{ok:true, data:{logged:false}}` (API DEV_MODE off) — or even `{ok:false, error:"..."}` (if `logDevEvent_` somehow threw past its own try/catch, which it can't since it wraps everything, but the HTTP layer could still return `ok:false` for other Router-level reasons) — `devNote_` treats it identically: silent success. The only way this call's failure becomes visible is if `postJsonToApi_` itself **throws** (network-level exception), which lands in the `catch` and produces exactly one `console.error('devNote_ failed: ...')` line — visible ONLY in Stackdriver, never in the sheet, and never in the user-facing error text (devNote_'s own failures are never surfaced to `devSuffix_`).

### 4. Setup.gs confirms this is a known, documented failure mode
`apps/api/Setup.gs:61-62, 78-83` — `setupDevLog()`'s own doc comment says: *"Also requires Script Property DEV_MODE = 'on' on the API project, or logDevEvent_ will no-op even after the sheet exists."* and the function prints a warning if API DEV_MODE isn't on. This means the two-property split is a known design decision, not an oversight — but nothing in `devNote_`/`apiCall_`/the UI surfaces this warning to whoever is troubleshooting from the WEB side. Someone can correctly set WEB `DEV_MODE=on` (getting `[DEV]` suffixes in user-facing error text, since `devSuffix_` also gates on `isDevMode_()` web-side only) and reasonably but wrongly conclude "dev mode is on, so DevLog should be capturing everything" — while the API-side property, on a different project's Script Properties, is unset.

### 5. Ruled out: sheet/tab name mismatch
- `apps/api/Config.gs:38` — `SHEETS.DEV_LOG = 'DevLog'`.
- `apps/api/Setup.gs:74` — `setupDevLog()` creates sheet named `SHEETS.DEV_LOG`.
- `apps/api/Security.gs:285` — `logDevEvent_` looks up `ss.getSheetByName(SHEETS.DEV_LOG)`, and if missing, **creates it itself** (lines 286-290) with the header row. So a missing/renamed tab is NOT a silent-no-op path here — worst case it self-heals by creating the sheet. Ruled out with code evidence, not just "probably fine."
- `apps/api/SheetsRepo.gs:51-66` — single `SPREADSHEET_ID` property, `openById`; a wrong ID would throw (Drive permission or "not found") which propagates as `ok:false` from `doPost`'s catch (`Router.gs:78-97`), NOT a silent no-op — different failure signature (user would see an error in-app if this were the cause, and Stackdriver would show it). Ruled out unless the user reports an actual visible error dialog, which they did not.

### 6. Ruled out (as the *sole* explanation): concurrent-write / no-lock corruption
`logDevEvent_` uses no `LockService` around the "check sheet exists → append row" sequence. Under concurrent invocations this could theoretically race (e.g. two calls both see `sheet.getLastRow()===0` and both try to write headers), but this would produce duplicate headers or occasional dropped/garbled rows, not a *total absence* of every single error across a whole testing session. Doesn't match the reported symptom ("NO records of any of those errors at all") on its own — worth fixing for correctness but not the primary explanation.

## Which one actually happened for the user?

Cannot be determined from code alone — requires two pieces of environment data only the user can retrieve (see below). But the codebase now has enough independent silent-failure points that "no rows despite real errors" was pretty much guaranteed on any subtle misconfiguration in either project's Script Properties.

## Fixable now vs needs user's environment check

**Genuine code bugs in this codebase (fixable without user input):**
- `devNote_()` discards the API response — should parse it and `console.error` when `body.ok` is false or `body.data.logged` is false, so at minimum Stackdriver would show *"DevLog write reported logged:false — is API DEV_MODE off?"* instead of nothing.
- `logDevEvent_()` has no lock around sheet-creation + append (race condition risk under concurrent requests).
- No single place cross-checks WEB DEV_MODE vs API DEV_MODE and warns on mismatch (e.g. `apiGetSession()` / a diagnostics action could report both flags back to the caller).

**Needs the user to check (cannot be verified by reading code):**
1. WEB project → Project Settings → Script Properties → is `DEV_MODE` present and exactly `on` (lowercase, no whitespace)?
2. API project → Project Settings → Script Properties → is `DEV_MODE` present and exactly `on`? (This is the one most likely to be missed — it's a second, separate property store on a second project, and `setupDevLog()`'s warning about it only surfaces if someone actually ran `setupDevLog` from the API editor and read the Logger output.)
3. Stackdriver / Cloud Logging **Executions log** for the WEB project, filtered to `severity=ERROR` (not just checking "Completed" status), for the exact timeframe of the reported live-testing errors — look specifically for `devNote_ failed: ...` lines (proves devNote_'s own fetch threw) versus their total absence (consistent with either DEV_MODE gate being off, since a gated-off `devNote_` call never reaches the point where it could log anything, success or failure).
4. If they have execution log access to the **API** project too: check for any `logDevEvent_ failed: ...` lines in that timeframe (would indicate #2 wasn't the issue, but writes are throwing inside the try/catch — e.g. sheet was protected/locked/moved to trash).

## Recommendation (not yet implemented — investigation only per instructions)
Once user confirms which property was the gap, the fix is small: have `devNote_` check the parsed response body and log a distinguishing message, and add a one-line cross-check in `apiGetSession()`/session bootstrap that reports both DEV_MODE flags so mismatches surface immediately instead of requiring this investigation again.

## Unresolved questions
- Was WEB `DEV_MODE` actually `on` during the user's live test, or off? (needs Script Properties screenshot)
- Was API `DEV_MODE` actually `on` during the same window? (needs Script Properties screenshot, on the OTHER project)
- Did the user ever run `setupDevLog()` from the API editor (which would have printed the "DEV_MODE is not on" warning directly), or was the DevLog sheet/tab created some other way?
- Do Stackdriver Executions logs for either project, filtered to ERROR severity for the test window, show `devNote_ failed:` or `logDevEvent_ failed:` lines, or is the log window itself empty (pointing at the DEV_MODE gates rather than a write-time exception)?
