---
title: "Milestone 6 — Hardening and Polish"
description: "Backup-to-Drive, error-message leak fix, responsive/i18n hardening, admin health panel, user guide — closes out MILESTONES.md M6 before employee rollout."
status: pending
priority: P1
branch: "main"
tags: [milestone-6, hardening, backup, error-handling, i18n, mobile]
blockedBy: ["260912-1110-apiclient-transient-failure-hardening"]
blocks: []
created: "2026-09-13T16:59:27.138Z"
createdBy: "ck:plan"
source: skill
---

# Milestone 6 — Hardening and Polish

## Overview

Last milestone before employee rollout (`docs/MILESTONES.md` M6, `docs/development-roadmap.md`).
Base scope (fixed by Phong, not up for renegotiation — see `docs/MILESTONES.md:204-219`):

1. `backupNow()` — export every sheet to a timestamped Drive folder, Admin button
2. Full responsive pass on real devices
3. Vietnamese completeness sweep — zero English strings left
4. Error message review — no stack traces reach users
5. Short user guide in Vietnamese for the employees

Scope was explicitly **expanded** (user choice, 2026-09-13 scope challenge) with three stretch
items, each independently droppable without touching the base 5:

6. Scheduled auto-backup + retention (daily trigger + pruning old backups)
7. ~~Admin system-health panel~~ — **cancelled during validation, 2026-09-14** (see Phase 3 and
   Validation Log below)
8. Regression-guard script (offline lint that catches new hardcoded English strings)

Research backing this plan:
- `plans/reports/researcher-260913-2326-apps-script-backup-triggers.md` — Drive backup/retention/trigger patterns
- `plans/reports/researcher-260913-2326-mobile-responsive-error-handling.md` — iOS Safari iframe quirks, error-leak risk, i18n-lint approach
- Codebase inventory (Explore agent, 2026-09-13, inline in this session) — confirmed the actual leak
  chain, the existing Drive/trigger code style to match, the responsive CSS baseline, and that the
  Vietnamese sweep will find close to nothing (repo is already disciplined)

## Key findings driving scope

- **Real leak confirmed, not hypothetical**: `apps/api/Router.gs:97`, `apps/api/ExportJob.gs:101/103/240/441`,
  `apps/web/ApiClient.gs:109`, `apps/web/Main.gs:27/69`, `apps/api/SheetsRepo.gs:61` (rethrow) all
  forward a caught exception's raw `.message` to the browser. This is the actual work of "no stack
  traces reach users" — see Phase 2.
- **Vietnamese sweep will find ~0 real violations.** The repo is already disciplined; the only
  borderline items are the "Email" loanword label and browser proper-nouns (Chrome/Safari/etc.) in
  `App.html`'s account-switch helper. Phase 5 is mostly a documented audit + the regression-guard
  script, not a rewrite.
- **No fixed-px mobile hazard found** in a full CSS scan. Phase 4 is about known iOS-Safari-inside-
  Apps-Script-iframe quirks (100dvh, virtual keyboard resize, `visualViewport` blocked) plus a
  device-emulation pass, not a redesign.
- **`apps/api/Orders.gs` is 1649 lines**, ~8x this repo's 200-line guideline. Explicitly **out of
  scope** for this milestone — modularizing it is a separate refactor with real regression risk
  right before employee rollout. Flagged here so it isn't silently rediscovered later.
- **Existing Drive/trigger patterns to reuse, not reinvent**: `apps/api/ExportJob.gs`'s
  `exportsFolder_()`, `exportFilename_()`, `installExportJobCleanupReminder()`/`cleanupExportJobs()`,
  and `apps/api/Security.gs`'s `installExpiryReminder()` already establish the "editor-only install
  function + idempotent delete-then-recreate trigger + config-driven retention days" shape. Phases
  1/2/6 in `Setup.gs`'s `editorOnly` array follow the same convention.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Backup to Drive (manual+scheduled+retention)](./phase-01-backup-to-drive-manual-scheduled-retention.md) | Pending |
| 2 | [Error message hardening](./phase-02-error-message-hardening.md) | Pending |
| 3 | ~~[Admin system-health panel](./phase-03-admin-system-health-panel.md)~~ (stretch) | **Cancelled** |
| 4 | [Mobile responsive hardening](./phase-04-mobile-responsive-hardening.md) | Pending |
| 5 | [Vietnamese sweep + regression guard script](./phase-05-vietnamese-sweep-regression-guard-script.md) (stretch script) | Pending |
| 6 | [User guide + checklist assembly](./phase-06-user-guide-checklist-assembly.md) | Pending |
| 7 | [Live verification and docs sync](./phase-07-live-verification-and-docs-sync.md) | Pending |

Phase 3 (stretch) was **cancelled during validation** (2026-09-14) — kept as a fully-worked
reference in its file, not implemented. Phases 4-6 have no code dependency on 1/2 and could be
reordered, but are executed in this order to keep one active file-set at a time (single-agent
sequential execution, not `--parallel` mode).

## Dependencies

**Cross-plan:** `blockedBy: ["260912-1110-apiclient-transient-failure-hardening"]` (project scope).
That plan is P1/pending/unstarted and edits `apps/web/ApiClient.gs`'s retry-classification logic
(~lines 75-135, `postJsonToApi_`). This plan's Phase 2 edits the same file's error-throw at line 109
(`if (!body.ok) throw new Error(...)`) — same function neighborhood. Per user decision
(2026-09-13 scope challenge), **the apiclient plan runs first**; this plan builds its error-mapping
change on top of whatever `ApiClient.gs` looks like after that plan lands. The apiclient plan's
`plan.md` has been updated with `blocks: ["260913-2326-milestone-6-hardening-and-polish"]` to make
this bidirectional.

**In-repo:** Phase 3 blockedBy Phases 1 and 2 (see above). Phase 7 (live verification + docs sync)
is blockedBy all of Phases 1-6.

## Red Team Review

### Session — 2026-09-14
**Findings:** 15 (15 accepted, 0 rejected) — 4 reviewers (Security Adversary, Failure Mode Analyst,
Assumption Destroyer, Scope & Complexity Critic), Full verification tier (7 phases), all findings
evidence-backed (grep/read citations), deduplicated from 28 raw findings down to 15.

**Severity breakdown:** 5 Critical, 6 High, 4 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Phase 3's "last backup status" has no persisted data source — Phase 1 only returns it to one HTTP caller / trigger discards return value | Critical | Accept | Phase 1, Phase 3 |
| 2 | Scheduled backup trigger failures never reach any error-visibility mechanism — no try/catch, nothing calls the error helper from trigger context | Critical | Accept | Phase 1 |
| 3 | Phase 2's marker-based `isUserFacing` design requires migrating ~88 existing `MSG.*` throw sites (grep-verified), not just the 6 named leak sites — else every existing correct message gets silently genericized | Critical | Accept | Phase 2 |
| 4 | New `ErrorLog` sheet/`SystemHealth.gs` duplicates the existing `DevLog`/`logDevEvent_` mechanism (`apps/api/Security.gs`, `Config.gs:65`) — which is itself gated behind `DEV_MODE`, conflicting with Phase 2 requiring `DEV_MODE` off in prod | Critical | Accept | Phase 3 |
| 5 | Backup retention has no minimum-retained-count floor — pure age-based cleanup could trash every backup if the trigger silently fails >14 days then resumes | Critical | Accept | Phase 1 |
| 6 | `editorOnly`/`guardSetup_()` doesn't actually enforce "unreachable over HTTP" — it's a manual, editor-run tripwire never called by `ExportJob.gs`'s own trigger targets or `Router.gs`; the real gate is simply omission from `getActions_()` | High | Accept | Phase 1 |
| 7 | Phase 3's "extend Phase 2's helper, don't build a second mechanism" is architecturally impossible — `apps/web` is a separate Apps Script project with zero `SpreadsheetApp` access, so web-tier errors can never reach `ErrorLog` as designed | High | Accept | Phase 3 |
| 8 | "Run the full offline suite" (cited in Phases 1/2/3/5) assumes a test runner/`package.json` that doesn't exist — no CI, no runner, each test file is run individually per `tools/offline-tests/README.md` | High | Accept | Phase 1, 2, 3, 5 |
| 9 | Phase 2's fix risks silently breaking `Main.gs:69`'s scope-missing UX message (a deliberate 2026-09-06 case) — the phase's own regression-test guidance names the wrong files, missing `tools/offline-tests/apiclient-scope.test.js`, which is the one file that actually pins this contract | High | Accept | Phase 2 |
| 10 | Phase 3 wires a synchronous Sheet-append directly into `safeErrorMessage_()` (34+ call-site fan-in, the app's central error funnel) with no isolating try/catch — a failure in the log-append could crash the very path meant to fail safely | High | Accept | Phase 3 |
| 11 | Phase 1's architecture diagram cites a non-existent global `SPREADSHEET_ID` constant; the actual pattern is `PropertiesService.getScriptProperties().getProperty(PROP.SPREADSHEET_ID)` via `SheetsRepo.gs` | High | Accept | Phase 1 |
| 12 | "This app has 1 admin" used to dismiss backup-folder-collision risk contradicts `docs/PERMISSIONS.md`'s "last active admin" wording, which implies the system supports more than one | Medium | Accept | Phase 1 |
| 13 | `backupsParentFolder_()`'s find-by-name Drive lookup (mirroring `exportsFolder_()`) isn't collision-safe for a disaster-recovery-critical destination — a same-named stray folder could silently redirect backups/cleanup | Medium | Accept | Phase 1 |
| 14 | Phase 5's plan to "resolve borderline strings against `docs/GLOSSARY_VI.md`" is unworkable as specified — the glossary has zero entries for any of the 4 flagged strings (Email/PDF/Excel/browser names) | Medium | Accept | Phase 5 |
| 15 | Phase 7's hard `dependencies: [1,2,3,4,5,6]` conflicts with Phase 3 being explicitly documented as droppable — no procedure for what "dependency satisfied" means when a dependency is deliberately skipped | Medium | Accept | Phase 7, plan.md |

**Minor citation-accuracy notes** (self-correcting per each phase's own "re-verify line numbers before implementing" instruction, not elevated to full findings): `exportFilename_` actually lives in `apps/api/Export.gs:436`, not `ExportJob.gs:436-441` as Phase 1 cited (`Export.gs` also added to Phase 1's Related Code Files below); `SheetsRepo.gs`'s rethrow is at line 67, not 61; `guardSetup_()`'s `editorOnly` array starts at line 93, not 101.

## Validation Log

### Session 1 — 2026-09-14
**Trigger:** Post-red-team validation interview (Hard-mode workflow step), per user's "Yes,
validate" choice. Red Team Review section above already carried grep-verified evidence, so the
Step 2.5 verification-pass guard was satisfied — went straight to the interview.
**Questions asked:** 4

#### Questions & Answers

1. **[Scope]** "Phase 3 (admin system-health panel) got real added complexity from the red-team
   fixes (reusing DevLog, isolating the log-append, apps/api-only scope) — still a stretch item,
   still ~3h estimated. Keep it in scope, or cut it now?"
   - Options: Keep it (Recommended) | Cut it now | Decide later, at Phase 7
   - **Answer:** Cut it now
   - **Rationale:** Even a well-designed stretch item adds real surface area (new file, new
     Router/Main.gs wiring, a shared-helper touch-point) for a milestone whose base scope is
     already substantial; user chose to keep M6 to its 5 base items + 2 stretch items.

2. **[Risk/Architecture]** "Backups land in the same personal Google Drive account that already
   runs apps/api ... Is that acceptable for a safety-net feature, or should backups target a
   different location?"
   - Options: Same account is fine (Recommended) | Target a Shared Drive instead
   - **Answer:** Same account is fine
   - **Rationale:** Matches existing single-owner architecture; a Shared Drive would add real
     provisioning scope for a hardening milestone that isn't meant to change the app's ownership
     model.

3. **[Assumptions]** "Backup retention defaults: keep the newest 3 backups unconditionally, trash
   anything else older than 14 days. Right ballpark for this business?"
   - Options: Yes, 3 kept / 14 days (Recommended) | Keep more / longer
   - **Answer:** Yes, 3 kept / 14 days
   - **Rationale:** Consistent with `exportRetentionDays_()`'s existing 14-day default elsewhere in
     this codebase.

4. **[Assumptions]** "Phase 6's user guide has an approve-status-workflow section whose content
   depends on whether the `approvalFlowEnabled` Config flag is currently on or off in production...
   How should Phase 6 handle this?"
   - Options: Document current state as-is (Recommended) | Also decide/enable the flag now
   - **Answer:** Document current state as-is
   - **Rationale:** Deciding whether to enable the approval flow in production is a business
     decision out of scope for a hardening/polish milestone; Phase 6 already planned to check the
     live flag value before writing that section (Implementation Step 2), so no phase-file change
     was needed for this answer — it confirms the existing plan.

#### Confirmed Decisions
- Phase 3 (admin system-health panel): **cancelled**, not implemented — see Phase 3's file (marked
  `status: cancelled`) and plan.md's phase table/Overview above.
- Backup Drive location: same "Execute as: Me" account as everything else — no change to Phase 1.
- Retention: `MIN_BACKUPS_KEPT = 3`, `backupRetentionDays` default 14 — confirmed, no change to
  Phase 1 (already specified these exact values).
- User guide approve-status section: document live flag state, don't change it — confirmed, no
  change to Phase 6 (already specified checking the live value).

#### Action Items
- [x] Mark Phase 3 `status: cancelled` in its frontmatter, with an explanatory banner
- [x] Update plan.md's phase table, Overview stretch-item list, and Phases section prose to reflect
      the cancellation
- [ ] No other phase-file changes needed — Phases 1, 5, 6 already matched the confirmed answers as
      written

#### Impact on Phases
- Phase 3: cancelled, kept as a reference design only, excluded from `/ck:cook` execution.
- Phases 1, 2, 4, 5, 6, 7: unchanged by this validation session (already consistent with the
  confirmed answers).

### Verification Results
- **Tier:** Full (7 phases at red-team time; Step 2.5's guard was satisfied by the existing
  `## Red Team Review` section's embedded Fact Checker/Flow Tracer/Scope Auditor/Contract Verifier
  results — no separate verification pass re-run here)
- No `[UNVERIFIED]` tags found in any phase file to resolve

## Out of scope (explicitly deferred)

- Modularizing `apps/api/Orders.gs` (1649 lines) — real pre-existing debt, not created by this
  milestone, too risky to fold into a hardening pass right before rollout.
- Actual backup **restore** tooling/UI — MILESTONES.md's exit criterion is "produces a restorable
  copy", i.e. the copy itself must be usable via Sheets' own "make a copy"/open-as-new-spreadsheet
  flow, not a one-click in-app restore button. Confirm this reading in Phase 7's checklist.
- The "one-page cheat sheet" stretch candidate — offered during scope challenge, not selected.
- `export_statistics` permission surface — already a documented, separately-deferred item
  (`docs/development-roadmap.md`), unrelated to M6.
