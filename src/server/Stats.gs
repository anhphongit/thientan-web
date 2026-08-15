/**
 * Stats.gs — revenue aggregation.
 *
 * STATUS: stub. No implementation yet.
 *
 * Responsibility:
 *   - revenueByPeriod('week' | 'month' | 'quarter' | 'year', range)
 *   - breakdown by customer and by status
 *   - return chart-ready series for Chart.js
 *
 * Rules:
 *   - Gated by view_statistics; export gated by export_statistics.
 *   - Aggregate server-side and return only totals — never ship the whole
 *     order table to the client just to sum it.
 *   - Define clearly whether revenue means amountExVAT or amountIncVAT
 *     (see docs/OPEN_QUESTIONS.md).
 */
