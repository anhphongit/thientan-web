/**
 * Orders.gs — order and order-line operations.
 *
 * STATUS: stub. No implementation yet.
 *
 * Responsibility:
 *   - listOrders(filter): search / filter / paginate, scoped by permission
 *   - getOrder(orderId): header + lines
 *   - createOrder(payload): header + N lines in one call, generate orderId
 *   - updateOrder / deleteOrder
 *   - changeStatus(orderId, newStatus, note): append to StatusHistory
 *   - approveOrder(orderId)
 *
 * Rules:
 *   - Multi-line is first class: one Orders row + many OrderLines rows.
 *   - Amounts are recomputed server-side; never trust client totals.
 *   - Own-orders scoping happens in Permissions.gs, applied on every read.
 *
 * See: docs/DATA_MODEL.md, docs/EXCEL_REFERENCE.md
 */
