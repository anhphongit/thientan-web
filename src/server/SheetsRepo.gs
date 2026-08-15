/**
 * SheetsRepo.gs — the ONLY file allowed to call SpreadsheetApp.
 *
 * STATUS: stub. No implementation yet.
 *
 * Responsibility:
 *   - open the private spreadsheet by ID from Script Properties
 *   - generic helpers: readAll, findBy, appendRow, updateRow, deleteRow
 *   - map rows <-> plain objects using the column maps in Config.gs
 *
 * Rules:
 *   - Contains NO business logic and NO permission logic.
 *   - Callers pass already-authorized requests; this layer just moves data.
 *   - Batch reads/writes (getValues / setValues) — never cell-by-cell loops.
 *
 * See: docs/DATA_MODEL.md, docs/CONVENTIONS.md
 */
