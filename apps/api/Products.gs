/**
 * Products.gs — product/stock CRUD (Milestone 5 / 5.1).
 *
 * Gated entirely on the single `manage_inventory` permission — unlike Orders,
 * there is no separate "view" permission and no per-user ownership/visible_fields
 * concept here (PERMISSIONS.md lists exactly one inventory permission, and
 * App.html's nav already gates the whole "Kho hàng" tab on it). Every action
 * below requires it; there is no read-only inventory view for anyone without it.
 *
 * Schema is docs/DATA_MODEL.md §5, decided before this task started (Created
 * in Milestone 5): productId, code, name, uom, stockQty, minStock, lastPrice,
 * active, note. No createdBy/At or updatedBy/At columns — a catalog entry
 * doesn't carry the same audit-trail need an order does, and the doc's schema
 * table was already finalized that way.
 *
 * List behavior mirrors Orders.gs's actionListOrders_ (server-side pagination,
 * LIST_PAGE_SIZE_DEFAULT/MAX, a search/filter payload) rather than the
 * simpler "load everything, filter client-side" shape, per Phong's explicit
 * choice — future-proofs the catalog screen if it grows well past what fits
 * in one request, at the cost of a bit more code than a one-shot list would
 * need today.
 *
 * "Low-stock flag" (MILESTONES.md's wording) is a visual badge only, per
 * Phong's choice — computed here (isLowStock_) and shipped as a plain boolean
 * per row so ViewsInventory.html never has to duplicate the threshold logic
 * client-side. stockQty is a plain, manually-edited number: nothing in
 * Orders.gs touches it, and creating/editing an order line does not move it
 * (out of scope for 5.1 — see TASKS.md's Milestone 5 split note).
 */

/* =======================================================================
   Actions
   ======================================================================= */

/**
 * List products, sorted by `code` ascending (a catalog reads naturally as
 * an alphabetized/numbered list, unlike Orders' "newest first").
 *
 * @param {Object} payload {page, pageSize, q, includeInactive, lowStockOnly}
 *   - q: matches `code` OR `name`, case-insensitive substring (same
 *     normalizeFilter_ Orders.gs's filters already use).
 *   - includeInactive: default false — only active products, same "hide
 *     inactive by default" spirit as Orders never showing deleted rows.
 *     Explicit true shows every product regardless of `active`.
 *   - lowStockOnly: default false — when true, only rows isLowStock_ flags.
 * @return {{products:Object[], total:number, shown:number, page:number,
 *   pageSize:number, hasMore:boolean, lowStockTotal:number}} `lowStockTotal`
 *   counts every active product currently low on stock, ACROSS the whole
 *   catalog (ignoring q/lowStockOnly, but still respecting includeInactive
 *   scoping) — so the screen can show "N sản phẩm sắp hết hàng" as a
 *   standing summary independent of whatever filter/page is on screen,
 *   the same role Stats.gs's noInvoice total plays for the stats screen.
 */
function actionListProducts_(user, payload) {
  requirePermission_(user, 'manage_inventory');

  var pageSize = Math.min(Math.max(parseInt(payload && payload.pageSize, 10) ||
                                    LIST_PAGE_SIZE_DEFAULT, 1), LIST_PAGE_SIZE_MAX);
  var page = Math.max(parseInt(payload && payload.page, 10) || 1, 1);
  var includeInactive = !!(payload && payload.includeInactive);
  var lowStockOnly = !!(payload && payload.lowStockOnly);
  var q = normalizeFilter_(payload && payload.q);

  var all = readAll_(SHEETS.PRODUCTS);
  var scoped = includeInactive ? all : all.filter(function (row) { return bool_(row.active); });

  var lowStockTotal = scoped.filter(isLowStock_).length;

  var rows = scoped;
  if (q) {
    rows = rows.filter(function (row) {
      return normalizeFilter_(row.code).indexOf(q) >= 0 || normalizeFilter_(row.name).indexOf(q) >= 0;
    });
  }
  if (lowStockOnly) rows = rows.filter(isLowStock_);

  rows = rows.slice().sort(compareProductsByCode_);

  var total = rows.length;
  var start = (page - 1) * pageSize;
  var pageRows = rows.slice(start, start + pageSize).map(buildProductResponse_);

  return {
    products: pageRows,
    total: total,
    shown: pageRows.length,
    page: page,
    pageSize: pageSize,
    hasMore: start + pageRows.length < total,
    lowStockTotal: lowStockTotal
  };
}

/** @param {Object} payload {productId} */
function actionGetProduct_(user, payload) {
  requirePermission_(user, 'manage_inventory');
  var row = findProductOrThrow_(payload && payload.productId);
  return buildProductResponse_(row);
}

/**
 * @param {Object} payload {product: {code, name, uom, stockQty, minStock,
 *   lastPrice, active, note}}
 */
function actionCreateProduct_(user, payload) {
  requirePermission_(user, 'manage_inventory');
  var clean = cleanProductInput_(payload && payload.product);

  return withProductLock_(function () {
    if (findBy_(SHEETS.PRODUCTS, 'code', clean.code)) throw new Error(MSG.PRODUCT_CODE_DUPLICATE);

    var productId = nextProductId_();
    appendRecord_(SHEETS.PRODUCTS, {
      productId: productId,
      code: clean.code,
      name: clean.name,
      uom: clean.uom,
      stockQty: clean.stockQty,
      minStock: clean.minStock,
      lastPrice: clean.lastPrice,
      active: clean.active,
      note: clean.note
    });

    return buildProductResponse_(findBy_(SHEETS.PRODUCTS, 'productId', productId));
  });
}

/** @param {Object} payload {productId, product: {...same shape as create}} */
function actionUpdateProduct_(user, payload) {
  requirePermission_(user, 'manage_inventory');
  var current = findProductOrThrow_(payload && payload.productId);
  var clean = cleanProductInput_(payload && payload.product);

  return withProductLock_(function () {
    var codeOwner = findBy_(SHEETS.PRODUCTS, 'code', clean.code);
    if (codeOwner && String(codeOwner.productId) !== String(current.productId)) {
      throw new Error(MSG.PRODUCT_CODE_DUPLICATE);
    }

    updateRecord_(SHEETS.PRODUCTS, current._row, {
      code: clean.code,
      name: clean.name,
      uom: clean.uom,
      stockQty: clean.stockQty,
      minStock: clean.minStock,
      lastPrice: clean.lastPrice,
      active: clean.active,
      note: clean.note
    });

    return buildProductResponse_(findBy_(SHEETS.PRODUCTS, 'productId', current.productId));
  });
}

/**
 * @param {Object} payload {productId}
 *
 * Refuses to delete a product any OrderLine still references (by `code`,
 * the actual link column per docs/DATA_MODEL.md §2 — `OrderLines.productCode`
 * links to `Products.code`, not `productId`) — deleting it would leave that
 * historical order line's product reference dangling, and Orders.gs's own
 * rule elsewhere in this app is that history is never allowed to go stale
 * out from under it (Orders themselves are never hard-deleted once approved
 * for the same reason StatusHistory is append-only). Point the caller at
 * deactivating instead, same as how Users are "never deleted, only
 * deactivated" (docs/DATA_MODEL.md §1).
 */
function actionDeleteProduct_(user, payload) {
  requirePermission_(user, 'manage_inventory');
  var current = findProductOrThrow_(payload && payload.productId);

  return withProductLock_(function () {
    var inUse = readAll_(SHEETS.ORDER_LINES).some(function (line) {
      return normalizeFilter_(line.productCode) === normalizeFilter_(current.code) && normalizeFilter_(current.code) !== '';
    });
    if (inUse) throw new Error(MSG.PRODUCT_IN_USE);

    deleteRecord_(SHEETS.PRODUCTS, current._row);
    return { deleted: true, productId: current.productId };
  });
}

/* =======================================================================
   Helpers
   ======================================================================= */

function findProductOrThrow_(productId) {
  var id = String(productId || '').trim();
  if (!id) throw new Error(MSG.PRODUCT_NOT_FOUND);
  var row = findBy_(SHEETS.PRODUCTS, 'productId', id);
  if (!row) throw new Error(MSG.PRODUCT_NOT_FOUND);
  return row;
}

/** Strips `_row` and adds the computed `isLowStock` flag every response
 *  (list row or single get/create/update result) carries — see file doc
 *  comment: the badge logic lives here once, not duplicated client-side. */
function buildProductResponse_(row) {
  return {
    productId: row.productId,
    code: row.code,
    name: row.name,
    uom: row.uom,
    stockQty: num_(row.stockQty),
    minStock: num_(row.minStock),
    lastPrice: num_(row.lastPrice),
    active: bool_(row.active),
    note: row.note || '',
    isLowStock: isLowStock_(row)
  };
}

/** A product is "low stock" only when a real threshold is set (minStock > 0)
 *  — a product nobody has bothered to set a threshold for (blank/0) is never
 *  flagged, avoiding a false-positive badge on every newly-created product
 *  that still has stockQty 0/minStock 0 by default. Inactive products are
 *  never flagged either — nobody needs a restock warning for something no
 *  longer sold. */
function isLowStock_(row) {
  if (!bool_(row.active)) return false;
  var min = num_(row.minStock);
  if (min <= 0) return false;
  return num_(row.stockQty) <= min;
}

function compareProductsByCode_(a, b) {
  var ac = String(a.code || '').toLowerCase();
  var bc = String(b.code || '').toLowerCase();
  if (ac < bc) return -1;
  if (ac > bc) return 1;
  return 0;
}

/**
 * Validates + normalizes the {code, name, uom, stockQty, minStock,
 * lastPrice, active, note} shape both create and update accept. Throws the
 * first Vietnamese MSG that applies, same "stop at the first problem" shape
 * Orders.gs's own line validation uses.
 *
 * `active` defaults to true unless explicitly `false` — covers both create
 * (the client usually omits it entirely for a brand-new product) and update
 * (the client always sends the checkbox's real boolean value explicitly).
 */
function cleanProductInput_(input) {
  var src = input || {};

  var code = text_(src.code);
  if (!code) throw new Error(MSG.PRODUCT_NO_CODE);

  var name = text_(src.name);
  if (!name) throw new Error(MSG.PRODUCT_NO_NAME);

  var uom = text_(src.uom);
  var note = text_(src.note);

  var stockQty = productQuantity_(src.stockQty);
  if (stockQty === null) throw new Error(MSG.PRODUCT_BAD_STOCK);

  var minStock = productQuantity_(src.minStock);
  if (minStock === null) throw new Error(MSG.PRODUCT_BAD_MIN_STOCK);

  var lastPrice = money_(src.lastPrice);
  if (lastPrice === null) throw new Error(MSG.PRODUCT_BAD_PRICE);

  var active = src.active !== false;

  return { code: code, name: name, uom: uom, stockQty: stockQty, minStock: minStock,
           lastPrice: lastPrice, active: active, note: note };
}

/** Stock quantities/thresholds: like Orders.gs's quantity_(), but 0 is a
 *  valid stock level (an out-of-stock product is still a real product row),
 *  unlike a line's qty which must be > 0. Fractional is allowed (metres,
 *  rolls, etc., same reasoning as OrderLines' own qty). null = invalid. */
function productQuantity_(value) {
  if (value === null || value === undefined || value === '') return 0;
  var parsed = (typeof value === 'number') ? value : parseFloat(String(value).replace(',', '.'));
  if (!isFinite(parsed) || parsed < 0 || parsed > PRODUCT_LIMITS.MAX_QTY) return null;
  return parsed;
}

/** Sheets stores booleans inconsistently depending on how a cell was
 *  written (real boolean, or the string 'TRUE'/'FALSE') — same coercion
 *  need Orders.gs's approve-status code already has for other boolean-ish
 *  columns. */
function bool_(value) {
  if (typeof value === 'boolean') return value;
  return String(value).trim().toUpperCase() === 'TRUE';
}

/** Sequential SP-0001, SP-0002, ... — no year segment (unlike order ids):
 *  a product catalog doesn't reset yearly. Same belt-and-braces re-check
 *  loop as nextOrderId_ so a script-property drift can never hand out a
 *  productId the sheet already holds. */
function nextProductId_() {
  var props = PropertiesService.getScriptProperties();
  var next = parseInt(props.getProperty(PROP.PRODUCT_SEQ_NEXT), 10);

  if (!next || next < 1) {
    next = highestProductSequence_() + 1;
  }

  var id = 'SP-' + pad_(next, 4);
  while (findBy_(SHEETS.PRODUCTS, 'productId', id)) {
    next++;
    id = 'SP-' + pad_(next, 4);
  }

  props.setProperty(PROP.PRODUCT_SEQ_NEXT, String(next + 1));
  return id;
}

function highestProductSequence_() {
  var prefix = 'SP-';
  var highest = 0;
  readAll_(SHEETS.PRODUCTS).forEach(function (row) {
    var id = String(row.productId || '');
    if (id.indexOf(prefix) !== 0) return;
    var seq = parseInt(id.substring(prefix.length), 10);
    if (seq > highest) highest = seq;
  });
  return highest;
}

/** Same tryLock+friendly-message shape as Orders.gs's withOrderLock_ —
 *  SheetsRepo.gs's own generic withLock_ exists but is unused everywhere
 *  else in this codebase in favor of each domain file's own wrapper with a
 *  Vietnamese MSG on timeout, so this follows that established convention
 *  rather than the unused generic one. */
function withProductLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error(MSG.PRODUCT_LOCK_BUSY);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
