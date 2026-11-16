// D1 data access. All queries are parameterised; JSON columns are parsed here.
import { parseJson } from "./util.js";

export const SETTINGS_DEFAULTS = {
  store: {
    name: "Wholesale Ludhiana", tagline: "Everything Wholesale. One Store. Best Prices.",
    whatsapp: "918727002486", phone: "+91 87270 02486", email: "", address: "", city: "Ludhiana", region: "Punjab", postcode: "", hours: "", gstin: "",
  },
  shipping: { flat_paise: 0, free_above_paise: null, bulk_flat_paise: 0, note: "Delivery charges are for Ludhiana and nearby areas. Outstation freight is confirmed on WhatsApp before dispatch." },
  gst: { enabled: true, default_rate: 5, inclusive: false },
  payments: { razorpay: true, upi: true, cod: true, bank: true, cod_max_paise: null, upi_id: "", bank_name: "", bank_account_name: "", bank_account_number: "", bank_ifsc: "" },
  home: {
    announcement: "Wholesale prices for retailers, shopkeepers and bulk buyers",
    hero_title: "Buy Wholesale Products at Wholesale Prices.",
    hero_subtitle: "Bakery, garments, fabric, woollens, cosmetics, bridal wear and car accessories — everything from one trusted Ludhiana store.",
    seasonal_title: "Winter Collection", seasonal_text: "Ludhiana woollens — pashmina suits, sweaters, shawls and thermals for the season.", seasonal_url: "/shop/woollen-wear",
    langar_title: "Langar & Bhandara Bulk Orders", langar_text: "Kulcha, samosa, patties, biscuits and disposables for community events. Use the calculator to get your total in seconds.",
  },
  pages: { about: "", shipping: "", refund: "", privacy: "", terms: "" },
  seo: {
    title: "Wholesale Ludhiana — Wholesale Products at Wholesale Prices",
    description: "Buy wholesale products in Ludhiana: bakery and biscuits, readymade garments, fabric, woollen wear, cosmetics, bridal wear, car accessories and langar & bhandara supplies at wholesale prices. One store, best prices.",
    google_verification: "",
  },
};

export async function getSettings(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM settings").all();
  const out = structuredClone(SETTINGS_DEFAULTS);
  for (const r of results) {
    const v = parseJson(r.value, null);
    if (v && typeof v === "object" && !Array.isArray(v) && out[r.key]) out[r.key] = { ...out[r.key], ...v };
  }
  return out;
}

export async function putSetting(env, key, value) {
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, JSON.stringify(value)).run();
}

export function normaliseProduct(r) {
  if (!r) return null;
  const p = {
    ...r,
    gallery: parseJson(r.gallery, []), specs: parseJson(r.specs, []), variants: parseJson(r.variants, []), tiers: parseJson(r.tiers, []),
    track_stock: !!r.track_stock, featured: !!r.featured, deal: !!r.deal, is_new: !!r.is_new, seasonal: !!r.seasonal, bulk: !!r.bulk, active: !!r.active,
  };
  p.in_stock = !p.track_stock || p.stock > 0;
  return p;
}

export async function listCategories(env, { includeInactive = false } = {}) {
  const sql = "SELECT * FROM categories" + (includeInactive ? "" : " WHERE active = 1") + " ORDER BY sort, name";
  return (await env.DB.prepare(sql).all()).results;
}

// Main categories with their subcategories: [{...cat, children: [...]}]
export function categoryTree(categories) {
  return categories.filter((c) => !c.parent).map((c) => ({ ...c, children: categories.filter((x) => x.parent === c.slug) }));
}

const FLAGS = { featured: "p.featured = 1", deal: "p.deal = 1", new: "p.is_new = 1", seasonal: "p.seasonal = 1", bulk: "p.bulk = 1" };
const SORTS = {
  featured: "p.featured DESC, p.sold DESC, p.sort, p.name",
  newest: "p.created_at DESC, p.id DESC",
  "price-asc": "(p.price_paise IS NULL), p.price_paise ASC, p.name",
  "price-desc": "(p.price_paise IS NULL), p.price_paise DESC, p.name",
  name: "p.name",
};
export const SORT_KEYS = Object.keys(SORTS);

/** Products with optional filters and paging. Returns { items, total }. */
export async function listProducts(env, { category, subcategory, flag, q, sort = "featured", page = 1, perPage = 24, includeInactive = false, lowStock = false } = {}) {
  const where = [];
  const args = [];
  const add = (sql, v) => { args.push(v); where.push(sql.replace("?", "?" + args.length)); };
  if (!includeInactive) where.push("p.active = 1 AND c.active = 1");
  if (category) add("p.category = ?", category);
  if (subcategory) add("p.subcategory = ?", subcategory);
  if (flag && FLAGS[flag]) where.push(FLAGS[flag]);
  if (lowStock) where.push("p.track_stock = 1 AND p.stock <= p.low_stock");
  if (q) {
    for (const word of String(q).toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5)) {
      args.push("%" + word.replace(/[%_\\]/g, "\\$&") + "%");
      const n = "?" + args.length;
      where.push(`(p.name LIKE ${n} ESCAPE '\\' OR p.brand LIKE ${n} ESCAPE '\\' OR p.sku LIKE ${n} ESCAPE '\\' OR c.name LIKE ${n} ESCAPE '\\' OR IFNULL(s.name,'') LIKE ${n} ESCAPE '\\')`);
    }
  }
  const from = " FROM products p JOIN categories c ON c.slug = p.category LEFT JOIN categories s ON s.slug = p.subcategory" + (where.length ? " WHERE " + where.join(" AND ") : "");
  const limit = Math.max(1, Math.min(500, perPage));
  const offset = (Math.max(1, page) - 1) * limit;
  const [rows, count] = await env.DB.batch([
    env.DB.prepare("SELECT p.*, c.name AS category_name, s.name AS subcategory_name" + from + " ORDER BY " + (SORTS[sort] || SORTS.featured) + ` LIMIT ${limit} OFFSET ${offset}`).bind(...args),
    env.DB.prepare("SELECT COUNT(*) AS n" + from).bind(...args),
  ]);
  return { items: rows.results.map(normaliseProduct), total: count.results[0].n };
}

export async function getProduct(env, slug, { includeInactive = false } = {}) {
  const row = await env.DB.prepare(
    "SELECT p.*, c.name AS category_name, s.name AS subcategory_name FROM products p JOIN categories c ON c.slug = p.category LEFT JOIN categories s ON s.slug = p.subcategory WHERE p.slug = ?1" +
      (includeInactive ? "" : " AND p.active = 1 AND c.active = 1")
  ).bind(slug).first();
  return normaliseProduct(row);
}

export async function productMap(env, slugs) {
  const unique = [...new Set(slugs.filter((s) => typeof s === "string" && /^[a-z0-9-]{1,90}$/.test(s)))].slice(0, 80);
  const map = new Map();
  if (!unique.length) return map;
  const placeholders = unique.map((_, i) => "?" + (i + 1)).join(",");
  const { results } = await env.DB.prepare(
    `SELECT p.* FROM products p JOIN categories c ON c.slug = p.category WHERE c.active = 1 AND p.slug IN (${placeholders})`
  ).bind(...unique).all();
  for (const r of results) map.set(r.slug, normaliseProduct(r));
  return map;
}

export async function categoryCounts(env) {
  const { results } = await env.DB.prepare(
    "SELECT category AS slug, COUNT(*) AS n FROM products WHERE active = 1 GROUP BY category UNION ALL SELECT subcategory, COUNT(*) FROM products WHERE active = 1 AND subcategory IS NOT NULL GROUP BY subcategory"
  ).all();
  return Object.fromEntries(results.map((r) => [r.slug, r.n]));
}

export async function listTestimonials(env) {
  return (await env.DB.prepare("SELECT * FROM testimonials WHERE active = 1 ORDER BY sort, id").all()).results;
}

export async function listBanners(env, placement) {
  return (await env.DB.prepare("SELECT * FROM banners WHERE active = 1 AND placement = ?1 ORDER BY sort, id").bind(placement).all()).results;
}

export async function findCoupon(env, code) {
  const c = String(code || "").trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,30}$/.test(c)) return null;
  const row = await env.DB.prepare("SELECT * FROM coupons WHERE code = ?1 AND active = 1").bind(c).first();
  if (!row) return null;
  if (row.expires && row.expires < new Date().toISOString().slice(0, 10)) return null;
  if (row.usage_limit !== null && row.used >= row.usage_limit) return null;
  return row;
}

// Stock: taken when an order is placed (offline payment) or paid (online); given back on cancel.
export function stockStatements(env, order, direction) {
  const sign = direction === "apply" ? 1 : -1;
  const lines = parseJson(order.items, []);
  const byId = new Map();
  for (const l of lines) if (Number.isInteger(l.id)) byId.set(l.id, (byId.get(l.id) || 0) + l.qty);
  const out = [];
  for (const [id, qty] of byId) {
    out.push(env.DB.prepare(
      "UPDATE products SET sold = MAX(0, sold + ?1), stock = CASE WHEN track_stock = 1 THEN MAX(0, stock - ?1) ELSE stock END WHERE id = ?2"
    ).bind(sign * qty, id));
  }
  return out;
}

export async function applyStock(env, orderId) {
  const claimed = await env.DB.prepare("UPDATE orders SET stock_applied = 1 WHERE id = ?1 AND stock_applied = 0 RETURNING *").bind(orderId).first();
  if (!claimed) return;
  const st = stockStatements(env, claimed, "apply");
  if (st.length) await env.DB.batch(st);
}

export async function restoreStock(env, orderId) {
  const claimed = await env.DB.prepare("UPDATE orders SET stock_applied = 0 WHERE id = ?1 AND stock_applied = 1 RETURNING *").bind(orderId).first();
  if (!claimed) return;
  const st = stockStatements(env, claimed, "restore");
  if (st.length) await env.DB.batch(st);
}
