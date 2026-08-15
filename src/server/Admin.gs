/**
 * Admin.gs — user, permission and maintenance operations.
 *
 * STATUS: stub. No implementation yet.
 *
 * Responsibility:
 *   - listUsers / addUser / updateUser / deactivateUser
 *   - readPermissionMatrix / savePermissionMatrix
 *   - Config sheet editing (status list, VAT rates)
 *   - backupNow(): export each sheet to a timestamped Drive folder
 *
 * Rules:
 *   - Every function gated by manage_users (backup: admin only).
 *   - An Admin must not be able to remove their own manage_users permission
 *     or deactivate the last active admin.
 */
