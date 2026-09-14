---
title: "Fix: create-user form calls apiUpdateUser after permission matrix toggle"
description: "Replace email-presence 'isNew' derivation with a stable isNewUser flag so intermediate collect() calls can no longer flip the create form into edit mode."
status: complete
priority: P1
effort: 1h
branch: main
tags: [bugfix, admin, users, ui, regression]
created: 2026-09-14
---

# Fix create-user → apiUpdateUser error (issue 260907-1759)

## Problem

Creating a user fails with `Không tìm thấy người dùng` (MSG.USER_NOT_FOUND) whenever the
admin picks a preset and/or expands the permission matrix before pressing Lưu.

Root cause is client-side only (`apps/web/ui/ViewsAdmin.html`):
`collect()` captures the typed `#f-email` into `state.user.email`, and both `paintForm()`
and `save()` derive "is this a new user?" from `!state.user.email`. Any `collect()` that
runs **before** save — `toggle-perms` (line 1407) and `onPresetChange_` (line 1528) — makes
that derivation permanently wrong, so the form repaints as edit mode and Save dispatches
`apiUpdateUser` for an email that does not exist yet. Server (`apps/api/Admin.gs`) is
correct and unchanged.

## Fix

Derive `isNew` from a dedicated `isNewUser` flag set only by `blankUser()`, which
`collect()` never writes. Also make the create form's email field re-readable so a typo
correction after a repaint is not silently dropped.

## Phases

| # | Phase | Status | Effort |
|---|-------|--------|--------|
| 01 | [Stable isNewUser flag + regression tests](phase-01-stable-isnewuser-flag.md) | complete | 1h |

## Scope

**Touched:** `apps/web/ui/ViewsAdmin.html`, `tools/offline-tests/admin-ui.test.js`
**Not touched:** `apps/api/Admin.gs` (server logic verified correct), any other view.

## Key dependencies

- None. Single-file client fix, no API contract change, no data migration, no rollout order.
- Baseline verified before planning: `node tools/offline-tests/admin-ui.test.js` → 83 passed, 0 failed.

## Definition of done

1. `node tools/offline-tests/admin-ui.test.js` → all 83 existing assertions still pass.
2. New regression group (create + typed email + preset change + matrix toggle → `apiCreateUser`) passes.
3. Manual trace: create form stays in create mode across repaints; after a successful create
   the form flips to edit mode (email disabled) because the server response carries no `isNewUser`.

## Rollback

`git checkout -- apps/web/ui/ViewsAdmin.html tools/offline-tests/admin-ui.test.js`.
No server, storage, or cache state is altered by this change.
