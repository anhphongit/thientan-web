---
phase: 5
title: "AdminConfig statusList review"
status: pending
priority: P3
effort: 1h
dependencies: [1]
---

# Phase 5: AdminConfig statusList review

## Overview

A verification phase, expected to be close to a no-op in code. `AdminConfig.gs` (346 lines)
lets an admin edit `Config.statusList` and enforces one key invariant: **keys may be added or
relabelled, never removed**. That rule exists because stored rows reference status keys. After
this plan, the referencing rows are `OrderLines` instead of `Orders` — the invariant is
unchanged, but the *reason* recorded in the code needs to point at the right table.

Confirm the rule still holds, correct any comment/message that names the wrong table, and
change nothing else.

**Priority P3** — low risk, low effort, but it must not be skipped: a comment that names the
wrong table is exactly the kind of stale lead that has misled work in this repo before.

## Requirements

**Functional**
- The key-removal prohibition stays in force, unchanged in strength.
- Any comment, docstring, or user-facing Vietnamese message that justifies the rule by
  referencing `Orders.status` is corrected to reference `OrderLines.status`.
- Relabelling an existing key still works and still propagates (labels are resolved at read
  time via `statusLabelIndex_`, so no stored data changes).

**Non-functional**
- No behaviour change. If research shows the rule is already table-agnostic in its wording,
  the correct outcome is **zero edits** plus a note here saying so.

## Architecture

### Why the invariant survives unchanged

```
Config.statusList  ──(keys referenced by)──►  OrderLines.status   (was: Orders.status)
                   ──(labels resolved at READ time by)──► statusLabelIndex_ / statusLabelText_
                                                          (Export.gs:400-411)
```

Removing a key would leave stored line rows holding a key with no label. `statusLabelText_`
(Export.gs:408-411) falls back to returning the **raw key**, so the app degrades to showing
`delivered_not_invoiced` instead of crashing — bad UX, not data loss. That degradation profile
is identical whether the key is referenced from `Orders` or `OrderLines`, so the rule's
strength does not need to change in either direction.

### Assumption A11 — optionality does not weaken the rule

Line status is optional, so one might argue an orphaned key matters less. It does not: a line
that already *has* the removed key is in exactly the same broken state as an order was. Keep
the rule as-is. (YAGNI — no requirement asked to relax it, and relaxing it is the irreversible
direction.)

## Related Code Files

**Read / possibly modify**
- `apps/api/AdminConfig.gs` — the three regions flagged by the audit: 19-58 (config key
  registry / editability rules), 169-220 (validation), 300-330 (statusList-specific handling).
  Re-verify these ranges; the file is 346 lines and may have shifted.

**Read for context**
- `apps/api/Config.gs:322-333` — the `statusList` default, unchanged by this plan.
- `apps/api/Export.gs:400-411` — `statusLabelIndex_` / `statusLabelText_` and the raw-key fallback.

**Create / Delete:** none.

## Implementation Steps

1. Read `AdminConfig.gs` in full (346 lines — one Read).
2. Locate the key-removal guard and its error message. Confirm it fires on removal and permits
   add + relabel.
3. Grep for any comment or message naming `Orders`/`đơn hàng` as the referencing table for
   status keys. Correct those to `OrderLines` / line-level wording. Do not alter the enforcement
   logic itself.
4. Verify the admin UI's statusList editor (`apps/web/ui/` — grep for `statusList`) shows no
   order-level-only copy that is now wrong.
5. Run `admin-config.test.js` (579 lines) and `admin.test.js`. `admin-config.test.js` is
   expected to pass **unchanged** — if it fails, the change was larger than intended; stop and
   reassess rather than editing the test.
6. If no edit proved necessary, append a one-line "verified no change required, <date>" note to
   this file. That record is the deliverable.

## Todo List

- [ ] `AdminConfig.gs` read in full; the three ranges re-verified
- [ ] Key-removal guard confirmed intact (removal refused, add/relabel allowed)
- [ ] Stale table references in comments/messages corrected
- [ ] Admin UI statusList copy checked
- [ ] `admin-config.test.js` passes **unchanged**
- [ ] Outcome recorded here (edited, or verified-no-change)

## Success Criteria

- [ ] Attempting to remove a `statusList` key through the admin path is still refused.
- [ ] Adding a key and relabelling an existing key both still work.
- [ ] No comment or message in `AdminConfig.gs` claims status keys are referenced by `Orders`.
- [ ] `admin-config.test.js` passes with **zero** modifications to the test file.
- [ ] This file records the outcome explicitly.

## Risk Assessment

| Risk | L×I | Mitigation |
|---|---|---|
| Phase treated as a true no-op and skipped, leaving a comment that points at the wrong table | Med × Med | The written outcome (step 6) is the deliverable, so "nothing to do" still produces an artifact. |
| The invariant gets relaxed on the reasoning that line status is optional | Low × **High** | A11 states the rule explicitly. Relaxing it is irreversible for any row already holding the removed key. |
| `admin-config.test.js` is edited to make an unintended change pass | Low × High | Success Criteria requires zero test modifications. A failure here means the *code* change was wrong. |
| Live sheet holds a customised `statusList` already | Med × Low | Read-only phase, no migration, no data write. Note that the live `Config` sheet may already differ from `Config.gs:322-333`'s default — do not assume the default is what is deployed. |

## Security Considerations

- `statusList` editing is admin-only; confirm the existing `manage_users`-style gate on the
  admin config action is untouched.
- Status **labels** are admin-supplied free text rendered into the UI — confirm existing
  escaping on the label path is unchanged (Phase 4 reuses the same render helpers).

## Next Steps

Phase 6 (tests). This phase has no downstream dependency beyond recording its outcome.
