/**
 * Inventory.gs — product and stock management.
 *
 * STATUS: stub. No implementation yet.
 *
 * Responsibility:
 *   - listProducts / getProduct / createProduct / updateProduct / deleteProduct
 *   - stock adjustments, optional low-stock flag against minStock
 *   - optional link from an OrderLine to a Product by productCode
 *
 * Rules:
 *   - Gated by manage_inventory.
 *   - v1 does not do automatic stock deduction on order creation unless
 *     Phong confirms it (see docs/OPEN_QUESTIONS.md).
 */
