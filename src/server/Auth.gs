/**
 * Auth.gs — identity resolution.
 *
 * STATUS: stub. No implementation yet.
 *
 * Responsibility:
 *   - getCurrentUser(): read Session.getActiveUser().getEmail(), look the email
 *     up in the Users sheet, return { email, displayName, role, active,
 *     permissions } or throw if the user is unknown or inactive.
 *   - Cache the lookup for the duration of one request only.
 *
 * Rules:
 *   - The client NEVER supplies the identity. Only Session.getActiveUser().
 *   - An unknown or inactive email is rejected with a Vietnamese error message.
 *
 * See: docs/PERMISSIONS.md
 */
