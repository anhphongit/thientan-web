# Journal: Milestone 6 Planning — Hardening & Polish

**Date:** 2026-09-14  
**Status:** PLANNING COMPLETE  
**Plan Location:** `plans/260913-2326-milestone-6-hardening-and-polish/plan.md`  
**Plan ID:** ck:plan --hard (scope challenge included)

---

## Summary

Completed hard-mode planning for Milestone 6 (M6 exit criterion: backup-to-Drive, mobile responsive, Vietnamese sweep, error-message audit, user guide). Scope was **explicitly expanded** by user with 3 stretch items; red-team review collapsed 28 raw findings into 15 evidence-backed issues; 2 critical design flaws caught and fixed; Phase 3 (admin health panel) cancelled during validation interview; 6 active phases + 1 reference design ready for `/ck:cook`.

---

## Scope Decision

Base scope (immutable per `docs/MILESTONES.md:204-219`):
1. `backupNow()` → export every sheet to timestamped Drive folder, Admin button
2. Full responsive pass on real devices
3. Vietnamese completeness sweep — zero English strings
4. Error message review — no stack traces reach users
5. Short Vietnamese user guide

Stretch scope (user-chosen expansion, 2026-09-13):
- ✅ Scheduled auto-backup + retention (daily trigger + pruning)
- ❌ Admin system-health panel (cancelled, 2026-09-14 validation — see below)
- ✅ Regression-guard lint script (catch hardcoded English strings)

Final count: 5 base + 2 stretch active phases.

---

## Critical Finding: Real Exception-Message Leak

Research phase confirmed a **real, not hypothetical, information-disclosure issue** via grep & file inspection:
- `apps/api/Router.gs:97`, `apps/api/ExportJob.gs:101/103/240/441`, `apps/api/SheetsRepo.gs:67` (rethrow), `apps/web/ApiClient.gs:109`, `apps/web/Main.gs:27/69` all forward raw `.message` from caught exceptions directly to the browser.
- This became Phase 2 core work: "no stack traces reach users" is not a belt-and-suspenders nicety, it's a real plug.

---

## Red Team Review — 4 Lenses, 15 Issues

**Session:** 2026-09-14  
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer, Scope & Complexity Critic  
**Findings:** 28 raw → 15 accepted (evidence-backed, deduplicated)  
**Severity:** 5 Critical, 6 High, 4 Medium  

### Two Most Consequential

**Issue #3 (Phase 2 Design Flaw):** Original `.isUserFacing` marker design would require migrating ~88 existing `throw new Error(MSG.X)` call sites across 10 files (grep-verified). Every unmigrated site silently degrades to generic message. **Fix:** Replaced with content-based check — message text is known `MSG.*` value = safe to show. Zero migration required.

**Issue #4 (Phase 3 Architectural Conflict):** New `ErrorLog` sheet + `SystemHealth.gs` duplicates existing `DevLog` + `logDevEvent_` mechanism in `apps/api/Security.gs` (gated behind `DEV_MODE`). Phase 2 requires `DEV_MODE` off in prod; Phase 3 design was impossible. **Fix:** Redesign to extend existing mechanism (apps/api-only, not apps/web), then user cut the entire phase during validation to keep scope tight.

### Other Critical Catches

- **Issue #1:** Phase 1 never persisted "last backup" state durably (only returned to HTTP caller / trigger discarded value). **Fix:** Write to `ScriptProperties`.
- **Issue #2:** Scheduled trigger has no error visibility path. **Fix:** Add try/catch + error helper call in trigger context.
- **Issue #5:** Pure age-based cleanup could trash every backup if trigger silently fails >14 days then resumes. **Fix:** "Keep newest 3 unconditionally" floor + age check.
- **Issue #8:** Phase files cite "run full offline suite" but no test runner exists (no `package.json`, no CI). Each test run individually per `tools/offline-tests/README.md`. **Fix:** Create `tools/offline-tests/run-all.js` in Phase 1 before implementation.

### Minor Citation Corrections (Self-Correcting)

Line numbers shifted during authoring; each phase file already instructs: "re-verify line numbers before implementing". Corrections noted: `exportFilename_` at `apps/api/Export.gs:436`, not `ExportJob.gs`; `SheetsRepo.gs` rethrow at :67, not :61; `guardSetup_()` array starts :93.

---

## Phase 3 Cancellation (Validation Interview)

**Question asked:** "Phase 3 got real complexity from red-team fixes (extend DevLog instead of new sheet, isolate append, apps/api-only scope) — still worth ~3h. Keep it?"

**User answer:** Cut it now.

**Rationale:** Stretch items add surface area (new file, new Router/Main.gs wiring, new touch-point) in a milestone whose base scope is already substantial. User chose to keep M6 tight: 5 base items + 2 stretch items, no Phase 3.

**Impact:** Phase 3 file marked `status: cancelled` and kept as a reference design (not implemented). Phases 1/2/4/5/6/7 remain unchanged (already consistent with validation answers).

---

## Cross-Plan Dependency Resolved

**Discovery:** `plans/260912-1110-apiclient-transient-failure-hardening` (P1, pending) also edits `apps/web/ApiClient.gs` lines ~75-135 (retry-classification logic). This plan's Phase 2 edits the same file's error-throw at :109 (same function neighborhood).

**Decision:** User chose to sequence apiclient plan first. Both `plan.md` files updated with bidirectional `blockedBy`/`blocks` links. Phase 2 builds on top of whatever `ApiClient.gs` looks like after apiclient plan lands.

---

## Final State

**6 Active Phases:**
1. ✅ Backup to Drive (manual+scheduled+retention)
2. ✅ Error message hardening
3. ~~Cancelled: Admin system-health panel~~
4. ✅ Mobile responsive hardening
5. ✅ Vietnamese sweep + regression guard script
6. ✅ User guide + checklist assembly
7. ✅ Live verification + docs sync

**Ready for:** `/ck:cook` (sequential execution, 1 file-set at a time).

---

## Unresolved Questions

1. **Editor count verification (Phase 2, flagged for Phase 7 signoff):** Whether `apps/api`'s Apps Script project's current editor count was ever confirmed. Phase 2's Security Considerations section flags this as worth checking at final signoff (signature authority for security-sensitive backups). Not resolved during planning; escalated to Phase 7 as a verification task — no plan-level blocker, just a reminder.

---

## Key Decisions & Tradeoffs

| Decision | Alternatives | Why This One |
|----------|--------------|--------------|
| Content-based error checking (Phase 2) | Marker-based `isUserFacing` | Zero migration burden; marker would require ~88 site updates or silent degradation |
| Extend DevLog, apps/api-only (Phase 3 design, then cancelled) | New ErrorLog sheet + apps/web sync | Existing mechanism already there; new sheet would duplicate logic + conflict with DEV_MODE gating |
| Cancel Phase 3 entirely | Keep Phase 3 | Base scope substantial enough; stretch items add real surface area right before rollout |
| Sequence apiclient plan first | Parallel execution | Same function neighborhood in ApiClient.gs; serial execution reduces merge risk |
| Same Drive account for backups | Shared Drive | Matches existing single-owner architecture; Shared Drive adds real provisioning scope |
| Min 3 backups kept unconditionally | Age-only retention | Disaster-recovery critical; floor prevents total loss if trigger fails >14 days |

---

## Lessons Captured

1. **Research phase caught real leak, not hypothetical:** Exception-message forwarding is a genuine information-disclosure channel; grep-backed evidence makes design decisions concrete.
2. **Red team found "impossible" architectures:** Phase 3's design would require apps/web to reach `SpreadsheetApp` — Apps Script project boundary violation. Impossible to fix without rewriting scope.
3. **State persistence often overlooked:** Backup-status return value only reached one HTTP caller; trigger discarded it. Durability requires `ScriptProperties` write upfront, not "return it and hope".
4. **Pure retention policies fail silently:** Age-based cleanup with no minimum-kept floor can trash everything if the schedule breaks for a few weeks then resumes. Explicit floor + age check required.
5. **Marker-based migrations are tax we don't pay:** ~88 migration sites for a `.isUserFacing` flag is 4-5 hours of scut work + regression risk. Content-based check (is this message text known?) avoids migration entirely.
6. **Test runners are invisible until needed:** Phases cited "run full offline suite" but repo has no runner. `package.json` & CI don't exist; tests run individually per README. Must create runner before implementation phases assume it.

---

**Status: PLANNING COMPLETE** ✅  
Ready for `/ck:cook` implementation phase.
