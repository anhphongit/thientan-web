/**
 * Permissions.gs — authorization enforcement.
 *
 * STATUS: stub. No implementation yet.
 *
 * Responsibility:
 *   - hasPermission(user, name) -> boolean
 *   - requirePermission(user, name) -> throws if not allowed
 *   - scopeOrdersToUser(user, orders): drop other people's orders unless the
 *     user holds view_all_orders
 *   - filterVisibleFields(user, record): strip columns outside visible_fields
 *
 * Rules:
 *   - Every server entry point calls requirePermission() before doing anything.
 *   - Deny by default: a permission that is missing from the Users row is false.
 *   - Client-side hiding is cosmetic only; this file is the real gate.
 *
 * See: docs/PERMISSIONS.md
 */
