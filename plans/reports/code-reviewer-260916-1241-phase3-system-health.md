# Code Review: Milestone 6 / Phase 3 — Admin System-Health Panel

## Scope
- Files: apps/api/SystemHealth.gs (new), apps/api/Router.gs (diff), apps/web/Main.gs (diff),
  apps/web/ui/ViewsAdmin.html (health section), tools/offline-tests/system-health.test.js (new),
  tools/offline-tests/harness.js (diff), tools/offline-tests/error-message-safety.test.js (new/diff)
- Verified against: apps/api/Security.gs logDevEvent_, apps/api/Config.gs safeErrorMessage_/isKnownMessage_,
  apps/api/SheetsRepo.gs readAll_/getSheet_, apps/web/ApiClient.gs devNote_
- Test run: `node tools/offline-tests/run-all.js` → 26/26 files pass, system-health.test.js 10/10 assertions

## Overall Assessment
Solid, honest implementation. The un-cancellation notes accurately describe what changed vs the
original phase design, and the code matches those notes exactly (no drift between doc comments and
behavior). Doc-comment discipline is unusually good — every non-obvious decision is explained inline
and cross-references the actual mechanism (logDevEvent_'s pre-existing try/catch, devNote_'s combined
DevLog usage). No critical issues found.

## Verification of the 4 called-out prior-decision checks

1. **Web+api combined error count / "Lỗi hệ thống" labeling** — confirmed correct. `devLogErrorCounts_`
   counts `level==='error'` with no source filter (apps/api/SystemHealth.gs:66-79); UI labels are
   "Lỗi hệ thống (24 giờ qua)" / "(7 ngày qua)" (ViewsAdmin.html:1165-1168), not "Lỗi phía máy chủ".
   Grepped repo-wide for "Lỗi phía máy chủ" / "apps/api-only" outside of historical-context comments —
   none found in user-facing strings. Test `devLogErrorCounts_ — combined web+api source` exercises
   this directly (harness.js, both an `ApiClient`-sourced and an api-action-sourced row counted).

2. **logDevEvent_ no extra try/catch needed** — confirmed by reading Security.gs:322-353. It wraps its
   entire body (sheet lookup, lazy sheet creation, appendRow, row-count trim) in one try/catch that
   `console.error`s and `return false` on failure; never rethrows. Router.gs's new call site correctly
   relies on this without adding its own wrapper. Reasoning holds.

3. **`safeMsg === MSG.GENERIC` reuse for the unexpected-error classification** — mostly sound, but
   there is a real (if currently dormant) edge case worth flagging: `isKnownMessage_` builds its lookup
   table from `Object.keys(MSG)` — which includes the `GENERIC` key itself. So if any code ever throws
   `new Error(MSG.GENERIC)` (i.e., the literal Vietnamese generic-error text) as a *deliberate, known*
   error, `safeErrorMessage_` treats it as "known" internally (no `console.error`, doesn't hit the
   unexpected branch) — but the returned string still equals `MSG.GENERIC`, so Router.gs's
   `if (safeMsg === MSG.GENERIC)` check would still fire and log it via `logDevEvent_` as if it were an
   unexpected error. Verified via grep that **no code in apps/api currently throws
   `new Error(MSG.GENERIC)` directly** — so this is not exploitable today, just a latent classification
   gap (a string-equality check standing in for what is really two different code paths inside
   `safeErrorMessage_`). Low priority; would only start mattering if someone later added a `throw new
   Error(MSG.GENERIC)` somewhere for a legitimate reason. Not blocking.

4. **UI layout convention (`.card`, inline styles, `T.esc`/`T.formatDate`)** — confirmed
   `healthSectionHtml()` (ViewsAdmin.html:1143-1180) uses the exact same `<section class="card"
   style="margin-bottom: 16px; padding: 16px;">` shell and header markup as `backupSectionHtml()`
   immediately above it (line 1088-1099) — same `.card` usage as the established convention in this
   file, not a violation of the "don't reuse `.card`-for-everything" rule (that rule is about
   *inappropriate* reuse; here it's the same settings screen using the same section-card idiom
   consistently). Uses `var(--c-muted)`/`var(--c-border)`/`var(--c-text)` custom properties, `T.esc()`
   on every user-influenced value (backup link URL, health error message), `T.formatDate()` for the
   timestamp. Matches file conventions.

## Correctness — DevLog read robustness
- `devLogErrorCounts_` wraps `readAll_(SHEETS.DEV_LOG)` in try/catch, degrading to `{last24h:0,
  last7d:0}` on failure (SystemHealth.gs:52-58). Verified `getSheet_` (SheetsRepo.gs:77-84) does throw
  `MSG.SHEET_MISSING + name` when the sheet doesn't exist, so this guard is not defensive-for-no-reason
  — it's covering a real throw path for a fresh deployment. Test explicitly overrides `readAll_` to
  simulate the throw (can't reproduce it via the harness's default stub) — reasonable given the vm
  sandbox is the same object returned as `env`, so the override is live for the function under test.
- Date handling (`row.timestamp instanceof Date` vs `new Date(row.timestamp)` fallback, `isNaN` guard)
  covers both real-Sheets Date objects and stringified fallbacks. Reasonable.
- `age < 0` guard skips clock-skew/future timestamps rather than mis-bucketing them. Fine.

## Security
- `actionSystemHealth_` gates on `requirePermission_(user, 'manage_users')` before touching anything —
  test-verified (`a non-admin cannot call systemHealth`).
- Confirmed no `detail`/`message` field from DevLog rows is ever returned to the client —
  `actionSystemHealth_`'s return shape is exactly `{lastBackup:{at,folderUrl}, recentErrorCount:
  {last24h,last7d}}` (SystemHealth.gs:29-40), all counts/scalars, no row passthrough. Matches Phase 2's
  intent (raw error detail stays server-side).
- `logDevEvent_`'s write itself only stores `action name` / `'unexpected error'` / empty detail / actor
  email (Router.gs:112-114) — no `err.message` or stack is ever persisted to the sheet from this call
  site, only to `console.error`/Stackdriver just above it. Correct per spec ("never the raw message
  itself").

## Test coverage
`tools/offline-tests/system-health.test.js` (10 assertions) exercises real code paths, not trivial
pass-throughs: permission gate (throw + no-throw), ScriptProperties round-trip for backup fields,
windowing math with a 6-row fixture spanning 1h/23h/25h/6d/8d ages plus a non-error-level row (verifies
both the 24h/7d boundary and the level filter), combined-source counting, and the missing-sheet
degrade-to-zero path via a `readAll_` override. This is a good, non-trivial suite.

`error-message-safety.test.js`'s `logDevEvent_: () => true` stub addition to Section 2's minimal
Router.gs sandbox is structurally sound — that section deliberately loads only Router.gs's own source
(not the full Security.gs) to test routing/sanitization in isolation, so a stub is correct; it just
needs to exist and not throw, and it doesn't need to record calls since this test file isn't asserting
anything about whether logging happened, only about the sanitized response shape.

## Client-side async/race check
- `showConfigTab()` calls `fetchHealth(seq)` unconditionally before either the cached-render or
  fresh-fetch branch (ViewsAdmin.html:995-1017). `fetchHealth`'s `.then`/`.catch` both check
  `staleView_(seq)` before touching `state.health`/repainting — consistent with the rest of the file's
  stale-view guard pattern (`fetchConfig`, `silentRefreshConfig`). No race found: rapid tab switching
  is protected the same way existing config/user fetches are.
- One minor, likely-intentional behavior: on a repeat visit to the config tab with `state.config`
  already cached, `paintConfigTab()` renders synchronously with the *previous* `state.health` value
  (not cleared before the new fetch resolves) — i.e. briefly stale-then-refreshed, same pattern as
  `state.config` itself. Consistent with this file's existing cache philosophy; not a bug.

## Minor / Low priority
- Latent `MSG.GENERIC` string-equality edge case above (#3) — not urgent, just worth a code comment or
  a follow-up note if anyone later adds a legitimate `throw new Error(MSG.GENERIC)`.
- `docs/USER_GUIDE_VI.md` and `docs/CHECKLIST_M6_VI.md` (new Phase 6 docs, already in this changeset)
  don't mention the system-health panel at all — likely because Phase 6 was drafted while Phase 3 was
  still cancelled. Not blocking (out of this review's explicit scope per the task's "don't restructure
  ViewsAdmin.html" instruction, and docs-sync is a `docs-manager`/PM concern), but flagging since
  `documentation-management.md` calls for docs updates after feature implementation — worth a follow-up
  pass on those two files if they're meant to be the canonical M6 user-facing checklist/guide.

## Positive Observations
- Doc comments consistently point to *why*, not just *what* — e.g. SystemHealth.gs's file header
  explaining exactly which prior-plan change invalidated the original Finding 7 assumption.
- No scope creep: correctly resisted adding `apiLogClientError`/expanding apps/web error reporting,
  per the phase's own YAGNI note.
- Phase spec's own "Implementation Notes" section is unusually rigorous about documenting deviations —
  made this review straightforward to verify claim-by-claim against actual code.

## Recommended Actions
1. (Optional, low) Add a one-line comment at `isKnownMessage_`/`safeErrorMessage_` noting that
   `MSG.GENERIC` is itself a "known" value by construction, so a hypothetical `throw new
   Error(MSG.GENERIC)` would be misclassified by Router.gs's reused equality check — pre-empts future
   confusion if someone touches this area again.
2. (Optional, low) Confirm with PM/docs-manager whether `USER_GUIDE_VI.md`/`CHECKLIST_M6_VI.md` need a
   short mention of the system-health panel now that Phase 3 shipped after those docs were drafted.

## Metrics
- Test suite: 26/26 files green, system-health.test.js 10/10 assertions
- No new lint/compile issues found (no compile step beyond the offline VM harness for this stack)

## Unresolved Questions
- None blocking. Confirm intent on docs-sync note above (item 2) if it matters for M6 sign-off.
