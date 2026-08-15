/**
 * Export.gs — CSV / XLSX / PDF export.
 *
 * STATUS: stub. No implementation yet.
 *
 * Responsibility:
 *   - buildExportPayload(filter): the currently filtered list, permission-scoped
 *   - CSV: generated client-side from the payload
 *   - XLSX / PDF: generated via Drive (create a temp Sheet, export, delete) or
 *     client-side libraries — decide at Milestone 4
 *   - Layout should resemble the existing monthly report: month grouping,
 *     multi-line POs, revenue total row
 *
 * Rules:
 *   - Gated by export. Respects visible_fields — a user cannot export a column
 *     they cannot see.
 *
 * See: docs/EXCEL_REFERENCE.md
 */
