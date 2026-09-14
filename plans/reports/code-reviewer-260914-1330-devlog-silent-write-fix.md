# Code Review: DevLog silent-write-result-reporting fix — 2026-09-14

## Scope
- `apps/api/Security.gs` — `logDevEvent_`, `actionLogDev_`
- `apps/web/ApiClient.gs` — `devNote_`
- `tools/offline-tests/devlog-write-result-reporting.test.js`
- Context: `plans/reports/debugger-260914-1305-devlog-sheet-silent-failure.md`

## Verdict
Approve as-is. Narrow, correct bugfix. No scope creep (lock + cross-check surfacing correctly deferred).

## Return-value propagation chain (verified line-by-line)
- DEV_MODE off: `logDevEvent_` returns `false` before try (Security.gs:285) -> `actionLogDev_` returns `{logged:false}` (Security.gs:326) -> Router wraps `data:{logged:false,...}` (Router.gs:93) -> `devNote_` flags "NOT written" (ApiClient.gs:239-242). Correct.
- Write succeeds: `true` propagates end-to-end -> `devNote_` silent. Correct.
- Write throws inside try: caught Security.gs:312-315, `console.error`s, returns `false` -> same path as DEV_MODE-off, correctly triggers `devNote_`'s new log. This is the actual bug being fixed (previously `actionLogDev_` returned `{logged:true}` here because it only checked `isApiDevMode_()`, ignoring the exception).

## JSON.parse safety
`body = JSON.parse(response.getContentText())` (ApiClient.gs:238) has its own inner try/catch defaulting to `null`, nested inside the pre-existing outer try/catch spanning the whole `devNote_` body (lines 212-246). Cannot escape uncaught either way. `postJsonToApi_` uses `muteHttpExceptions:true` so HTTP-status errors don't throw; residual network-level exceptions were already handled by the outer catch pre-fix — unchanged behavior.

## Caller compatibility (grepped)
- Only caller of `logDevEvent_` is `actionLogDev_`.
- Only caller of `actionLogDev_`/reader of `.logged` besides itself is `devNote_` (`body.data.logged`).
- `Main.gs:388-392` `apiDevLog` passes `{logged}` straight through to client UI without branching on its value — unaffected by the meaning change (DEV_MODE flag -> actual write result); this only makes the report more accurate.
- No caller depended on `logDevEvent_`'s old `undefined` return.

## Security / PII
New `console.error` (ApiClient.gs:240-242) logs the API's response envelope (`ok`, `data:{logged,security,_ms}`, `error`, `build`) — not the outbound request, so no `secret` leakage. Stackdriver-only, not sheet/user-facing. Consistent with pre-existing logging pattern in the same file (e.g. line 102 already logs full response snippets). No new PII surface.

## Test verification
Ran `tools/offline-tests/devlog-write-result-reporting.test.js` directly — 12/12 assertions pass. Spot-checked each scenario against actual source (not just test mocks) to confirm fidelity.

## Unresolved Questions
None.
