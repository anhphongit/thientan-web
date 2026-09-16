# Code Review — Milestone 6 Hardening (5 phases, uncommitted working tree)

Scope: `git diff` against working tree, all files listed in git status (backup feature,
error-message hardening, mobile CSS/JS, Vietnamese lint, docs). Offline suite 25/25
assumed passing, not re-verified.

## Overall Assessment

Solid work. All three specifically-flagged security concerns check out clean:
permission gating, action-registry omission, and independent per-project sanitizer
copies are all correctly implemented and each has offline-test coverage. No new
raw-error-leak path was introduced by Phase 1's BackupJob.gs. Main correctness gap is
a repo-convention violation (BUILD stamp not bumped) that every phase's subagent
missed, plus a couple of low-severity CSS/naming nits.

## Critical Issues

None found.

## High Priority

**BUILD version stamps not bumped despite substantive changes to both projects**
`apps/api/Config.gs:18` (`var BUILD = 'api-2026-09-07c-product-lookup'`) and
`apps/web/Config.gs:13` (`var BUILD = 'web-2026-09-06d-scopehelp'`) are both explicitly
documented ("Bump on every meaningful API/web change. Surfaced in the web footer in dev
mode") and neither was touched by any of the 5 phases, even though api gained a new
action (`backupNow`), new error-sanitization behavior in 3 catch sites, and a new config
default; web gained a new client action, new viewport meta, and new sanitizer. The UI has
a dedicated `.build-stamp.drift` CSS class (`apps/web/ui/Styles.html:471`), i.e. this
project actively surfaces build-mismatch as a signal to admins in dev mode — shipping
with a stale stamp defeats that mechanism and will read as "nothing changed" to anyone
checking the footer. Exactly the kind of thing independent per-phase subagents would each
miss since none of them can see the others' diff. Bump both before shipping (one bump each
is enough, doesn't need to be per-phase).

## Medium Priority

**`env(safe-area-inset-*)`/`max()` CSS added with no plain-value fallback, unlike the
`100dvh` progressive-enhancement pattern used elsewhere in the same diff**
`apps/web/ui/Styles.html` — `.modal` (~line 179), `.toast` (~line 476): the previous
plain declarations (`padding: 20px;`, `bottom: 20px;`) were *replaced outright* by
`max(20px, env(safe-area-inset-*))` / `calc(20px + env(safe-area-inset-bottom))`, with no
preceding plain-value line for a browser that doesn't parse `env()`/`max()` to fall back
to. Contrast with `.boot`'s three-line pattern just above it (`min-height: 100vh;` then
`100dvh;` then `var(--app-vh, ...)`), where each line is a genuine fallback because CSS
keeps the last *valid* declaration when a later one is dropped as unsupported. Here, if
`env()`/`max()` is unparseable (older WebViews / Samsung Internet <12 / Chrome <79), the
whole `padding`/`bottom` declaration is invalid and dropped, and since there is no earlier
plain declaration in the same rule to fall back to, the property reverts to its inherited/
initial value — the modal loses its 20px buffer entirely (not just the safe-area addition),
and the toast reverts to `bottom: auto` (likely top-of-viewport or undefined stacking,
depending on other rules). Not a crash, but a real regression on unsupported browsers,
whereas the task's stated bar ("graceful degrade expected") implies keeping at least the
pre-existing 20px behavior. Fix: keep the plain-value declaration first, then the safe-area
one as a second declaration (same order-dependent-cascade trick already used for
`.boot`/`min-height`), e.g.:
```css
.modal { padding: 20px; padding: max(20px, env(safe-area-inset-top)) ...; }
```
Low real-world impact for an internal 2026 Vietnamese business app (most users on
recent iOS Safari/Chrome), but worth the one-line fix since the pattern was already
established two rules away in the same file.

## Low Priority

- **Naming-convention inconsistency for new trigger-target functions**
  `apps/api/Setup.gs`'s `guardSetup_` comment states "Editor-only maintenance functions
  lack a trailing underscore so they appear in the Run dropdown." Existing trigger
  targets follow that (`checkSecretExpiry`, `keepWarmPing`, `cleanupExportJobs` — no
  underscore). The new `runScheduledBackup_` and `cleanupOldBackups_`
  (`apps/api/BackupJob.gs:162,187`) both carry a trailing underscore, breaking that
  stated convention, even though they're the same "trigger-only, occasionally worth a
  manual editor run for debugging" category as the functions they're modeled on. Purely
  cosmetic — both are still correctly kept out of `getActions_()` and the security
  guarantee doesn't depend on the naming — but inconsistent with the pattern the file's
  own comment describes. Only `installBackupTrigger` (correctly no-underscore, meant to
  be run once from the editor) matches convention.

- **`.chip button::after` invisible hit-area comment cites a "36px, re-check in Phase 7"
  caveat** (`apps/web/ui/Styles.html` ~line 585) that references a future phase not part
  of this changeset — harmless forward-looking note, not a defect, just flagging so it
  doesn't get lost; there's no Phase 7 tracking item visible in this diff or the two new
  docs files.

## Verified Findings (per review-request checklist)

1. **`actionBackupNow_` permission gating** — confirmed `apps/api/BackupJob.gs:76-79`
   calls `requirePermission_(user, 'manage_users')` before any Drive access, server-side,
   independent of the UI's hidden-button state. Test coverage exists:
   `backup-job.test.js` §5 explicitly proves a non-`manage_users` actor is refused before
   touching Drive/ScriptProperties.
   `backupNow`/`runScheduledBackup_`/`cleanupOldBackups_`/`installBackupTrigger`:
   only `backupNow` is registered in `apps/api/Router.gs:241`'s `getActions_()` map; the
   other three are absent by omission, exactly as documented, and are also listed in
   `Setup.gs`'s `editorOnly` guard array (documentation/consistency only, not the actual
   guarantee — the file's own comments are explicit and accurate about this distinction).

2. **Independent `isKnownMessage_`/`safeErrorMessage_` copies** — `apps/api/Config.gs`
   and `apps/web/Config.gs` each define their own `KNOWN_MSG_VALUES_`/`isKnownMessage_`/
   `safeErrorMessage_`, no cross-reference (impossible anyway — separate Apps Script
   projects, no shared module system). `apps/web/Main.gs`'s scope-missing branch
   (`apiGetSession`, ~line 78, `message: err.message` under `reason: scopeMissing ? ...`)
   is genuinely untouched — the diff only adds a comment above it explaining *why* it's
   excluded; the actual code line forwarding `err.message` raw is unchanged. Confirmed
   this is deliberate per the file's own comment (self-constructed prefix-match message,
   not a raw exception pass-through) and matches the standalone
   `error-message-safety.test.js`'s stated scope of what it does/doesn't cover.

3. **New leak risk from Phase 1/Phase 2 ordering** — none found. `actionBackupNow_`'s only
   path to the browser is through `Router.gs:doPost`'s generic try/catch (line 94-106),
   which already calls `safeErrorMessage_(err)` — any DriveApp/Sheets exception thrown
   inside `backupNow_()` is caught there, not by BackupJob.gs itself, and is therefore
   already sanitized. `ExportJob.gs`'s two catches (`resumeExportJob_`, `deliverExportJob_`)
   and `SheetsRepo.gs`'s unmatched rethrow were all correctly updated/accounted for by
   Phase 2, confirmed by `error-message-safety.test.js` sections 2-5 and the updated
   `exportjob.test.js` assertion (now expects `MSG.GENERIC` instead of the raw
   "Simulated Drive quota error" string).

4. **Phase 4 CSS/JS graceful degradation** — `100dvh`/`--app-vh` fallback chain in `.boot`
   is correctly layered (see Medium Priority item above for the one place that ISN'T
   layered the same way: `.modal`/`.toast` safe-area padding). `syncViewportHeight()` in
   `App.html` is pure additive JS (sets a CSS custom property on `<html>`), no risk of
   throwing even if `window.innerHeight` were somehog unavailable (it's a universal DOM
   property). No crash risk anywhere in this phase — worst case is the padding/position
   regression noted above, which is cosmetic, not fatal.

5. **Dead code / stubs / style** — nothing resembling a placeholder or forgotten
   TODO found. Code style (`var`, function-expression closures, no ES6 classes,
   trailing-underscore-for-private convention) is consistent with the rest of the
   codebase except the one naming nit above. Test files are thorough and mirror the
   existing `tools/offline-tests/*.test.js` conventions (harness reuse, `H.done()`,
   spot-check assertions rather than exhaustive enumeration).

## Positive Observations

- `backupsParentFolder_()`'s collision-safe id-first lookup (Finding 13) with graceful
  fallback to name search is a genuinely good defensive pattern, and is well-tested
  (`backup-job.test.js` §1-3).
- `cleanupOldBackups_()`'s newest-N floor before applying the age cutoff is a real
  safety improvement over naive age-based pruning (protects against a silently-broken
  trigger wiping the whole backup history in one pass) — same discipline as the existing
  `cleanupExportJobs`.
- Content-based `isKnownMessage_` (vs. a marker/wrapper approach) is a pragmatic choice
  that required zero changes to ~88 existing throw sites — good YAGNI/KISS call, and the
  file comments accurately describe the tradeoffs (e.g. why `ApiClient.gs`'s pass-through
  deliberately does NOT run through its own `isKnownMessage_`).
- Test coverage for both phases is unusually rigorous for an Apps Script project with no
  real test framework — the harness extensions (fake nested Drive folders, `getFolderById`,
  `getDateCreated`) are minimal and scoped to exactly what's needed, not over-built.

## Recommended Actions

1. Bump `apps/api/Config.gs:18` and `apps/web/Config.gs:13`'s `BUILD` constants before
   shipping (High).
2. Add the plain-value fallback declaration ahead of the `env()`/`max()` lines in
   `.modal` and `.toast` in `apps/web/ui/Styles.html` (Medium).
3. Optional: rename `runScheduledBackup_`/`cleanupOldBackups_` to drop the trailing
   underscore for consistency with `guardSetup_`'s documented convention, or update that
   comment to acknowledge the new pattern (Low, no functional effect either way).

## Unresolved Questions

- Is there a release-process step (outside this diff) that bumps `BUILD` automatically
  before deploy? If so, item 1 may already be handled elsewhere and this note can be
  disregarded.
- Should `.chip button::after`'s "re-check in Phase 7" comment be tracked anywhere,
  given Phase 7 isn't part of the current 5-phase plan referenced in this review?
