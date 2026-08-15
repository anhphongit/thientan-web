/**
 * Config.gs — central configuration constants.
 *
 * STATUS: stub. No implementation yet (project is initialized only).
 *
 * Responsibility:
 *   - Script Property keys (SHEET_ID lives in Script Properties, never in code)
 *   - Sheet names: Users, Orders, OrderLines, Products, StatusHistory, Config
 *   - Column maps (header name -> index) so the rest of the code never uses
 *     magic column numbers
 *   - Default status list, default VAT rates, date/number format strings
 *
 * Rules:
 *   - No Sheet ID, no email, no customer name is ever hard-coded here.
 *   - Anything an Admin might want to change at runtime belongs in the
 *     Config *sheet*, not in this file.
 *
 * See: docs/DATA_MODEL.md
 */
