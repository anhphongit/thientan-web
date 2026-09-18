---
phase: 6
title: "Documentation sync"
status: pending
priority: P3
effort: "45m"
dependencies: [1, 2, 3, 4, 5]
---

# Phase 6: Documentation sync

## Overview

Record this incident and its corrected root-cause understanding — a hard,
already-documented Google quota (30 concurrent executions per identity)
shared across the whole team by `apps/api`'s owner-identity deployment, not
fuzzy "edge congestion" — in the places the prior related incident was
recorded, per `documentation-management.md`, so the next person (or agent)
starts from the corrected picture instead of re-deriving or re-mis-applying
the same quota table a third time.

## Implementation Steps

1. **`docs/system-architecture.md`** — extend the existing "Known Issues"
   entry (line 417-429, the 2026-09-14 3xx/404 entry) with a follow-up note:
   **updated 2026-09-18 — final root cause, superseding earlier drafts of
   this note.** `apps/api` sharing one owner identity (`Execute as: Me`,
   required by `IDENTITY.md` Option B) is real, but the documented
   30-concurrent-execution quota was proven NOT to be the actual
   mechanism — two live tests with exact request-ID correlation
   (`plans/260917-1210-concurrent-session-live-errors/reports/analysis-260918-1134-...md`)
   showed `apps/api` peaking at only 11-12 concurrent executions, always
   healthy and fast server-side, even during failures. The real mechanism:
   Google's edge sometimes fails to deliver an already-successful response
   back to the caller (30-190+ second delays, or an outright connection
   failure), and the existing retry logic — unable to tell "still
   processing" from "already succeeded, response lost" — was proven to
   re-execute the same action 2-3 times server-side on every observed
   failure. Not a publicly documented Google limitation (researched
   directly, including the most authoritative public GAS Web-App resource —
   see the plan's researcher reports). Mitigated by
   `plans/260917-1210-concurrent-session-live-errors`: a global client-side
   concurrency cap (Phase 1), a write-action idempotency guard preventing
   duplicate execution on any retry, automatic or manual (Phase 2), a
   retry policy that stops blindly retrying into an active stall (Phase 3),
   a client-side fail-fast timeout plus retry-button UX (Phase 4), and
   burst alerting (Phase 5). No Workspace migration — out of budget,
   confirmed by the user; this mitigates the symptom, it does not remove
   Google's underlying reliability gap.
2. **`docs/IDENTITY.md` §8.3** (the "what actually breaks over time" table)
   — add a second confirmed Option B risk alongside "Version drift":
   **updated 2026-09-18** — not the 30-concurrent-execution quota (proven
   not to be the actual mechanism — see the Journal entry above), but
   Google's edge occasionally failing to reliably deliver a response for
   this shared owner identity's anonymous Web App under concurrent load,
   an undocumented reliability gap this project cannot fix, only work
   around. Also add a note under §8.5 (Recommendation) pointing at this
   plan's "Escape Hatch" section — Workspace (Option C) is one path that
   MIGHT remove this specific gap (untested, out of budget to verify), not
   just the identity-token awkwardness §8.1 already covers.
3. **`plans/reports/researcher-260914-1345-appsscript-coldstart-mitigation.md`**
   — do NOT edit the historical research report itself (it's a point-in-time
   record), but add a short pointer comment at its top: "Finding 4's
   quota dismissal was re-examined and corrected —
   see `plans/260917-1210-concurrent-session-live-errors/plan.md`."
4. **`docs/TASKS.md`** (or wherever this project logs completed work per its
   own convention — check existing entries' format before adding) — one log
   entry per `documentation-management.md`'s "After Bug Fixes" trigger,
   including the corrected quota understanding, not just "fixed errors."
5. Do not touch `docs/SECURITY.md` — this incident is about availability
   under concurrency, not the secret/authentication threat model; out of
   that document's scope.

## Related Code Files

- Modify: `docs/system-architecture.md`
- Modify: `docs/IDENTITY.md`
- Modify: `docs/TASKS.md`
- Modify: `plans/reports/researcher-260914-1345-appsscript-coldstart-mitigation.md`
  (pointer comment only, per step 3 — do not rewrite its historical content)

## Success Criteria

- [ ] `docs/system-architecture.md`'s Known Issues entry names the specific
      quota (30 concurrent executions per identity) as root cause, not a
      vague "edge congestion" description, and reflects the fixes actually
      shipped (fill in real outcomes once Phases 1–5 are done and
      live-verified, not the plan's predictions).
- [ ] `docs/IDENTITY.md` §8.3 names the shared-quota risk explicitly and
      §8.5 cross-references this plan's Escape Hatch section.
- [ ] The prior research report carries a pointer to this correction so it
      is never read again in isolation and re-mis-applied.
- [ ] Links/cross-references between this plan and the prior `260912-1110`
      plan are present in both directions where relevant.

## Risk Assessment

None — documentation only, no code paths affected.
