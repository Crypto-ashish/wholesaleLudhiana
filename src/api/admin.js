// Admin API. Every route here runs AFTER requireAdmin() (see index.js):
// unauthenticated → 401, missing/invalid CSRF token on writes → 403.
import { json, readJson, cleanText, UserError, HttpError, slugify, parseJson, rupees } from "../lib/util.js";
import { getSettings, putSetting, listCategories, listProducts, normaliseProduct, applyStock, restoreStock, SETTINGS_DEFAULTS } from "../lib/db.js";
import {
  verifyPassword, createSession, destroySession, getSession, loginThrottled, recordFailedLogin, clearFailedLogins, sessionCookie,
} from "../lib/auth.js";
import { rzpKeyId, rzpSecret, rzpAuthHeader, razorpayBase } from "./public.js";

export const ORDER_STATUSES = ["pending", "confirmed", "processing", "dispatched", "delivered", "cancelled"];
const PAYMENT_STATUSES = ["unpaid", "awaiting", "paid", "failed", "refunded"];
const ENQUIRY_STATUSES = ["new", "contacted", "closed"];
export const UNITS = ["piece", "dozen", "kg", "packet", "box", "metre", "roll", "set", "carton"];
// Orders that count as sales: not cancelled, not failed/refunded, and not an abandoned online payment.
const SALE = "status <> 'cancelled' AND payment_status NOT IN ('failed', 'refunded') AND NOT (razorpay_order_id IS NOT NULL AND payment_status = 'unpaid')";
const IST = "datetime(created_at, '+330 minutes')";

// ------------------------------------------------------------------ auth
export async function login(request, env) {
  if (!env.ADMIN_PASSWORD_HASH) return json(503, { error: "Admin login is not configured. Set the ADMIN_PASSWORD_HASH secret." });
  if (await loginThrottled(env, request)) {
    return json(429, { error: "Too many failed attempts. Please wait 15 minutes and try again." }, { "Retry-After": "900" });
  }
  const body = await readJson(request, 2048);
  const username = typeof body.username === "string" ? body.username.slice(0, 80) : "";
  const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
  const expectedUser = env.ADMIN_USERNAME || "admin";
  // Always run the hash so timing doesn't reveal whether the username matched.
  const okPass = verifyPassword(password, env.ADMIN_PASSWORD_HASH);
  if (!okPass || username !== expectedUser) {
    await recordFailedLogin(env, request);
    return json(401, { error: "Incorrect username or password" });
  }
  await clearFailedLogins(env, request);
  const s = await createSession(env);
  return json(200, { ok: true, csrf: s.csrf }, { "Set-Cookie": s.cookie });
}

export async function logout(request, env) {
  await destroySession(env, request);
  return json(200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
}

export async function session(request, env) {
  const s = await getSession(env, request);
  if (!s) return json(401, { error: "Please sign in" });
  return json(200, { ok: true, csrf: s.csrf });
}

// ------------------------------------------------------------------ helpers
// ------------------------------------------------------------------ helpers
const rupeesToPaise = (v, label, { required = false } = {}) => {
  if (v === "" || v === null || v === undefined) {
    if (required) throw new UserError("Please enter " + label);
    return null;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 10000000) throw new UserError("Please enter a valid amount for " + label);
  const p = Math.round(n * 100);
  return p === 0 && !required ? null : p;
};
function cleanImageUrl(v, label = "image") {
  const t = cleanText(v, { max: 600, label });
  if (!t) return "";
  if (/^\/(media|assets)\/[A-Za-z0-9/_.-]+$/.test(t) || /^https:\/\/[^\s"'<>]+$/.test(t)) return t;
  throw new UserError("The " + label + " must be an uploaded photo or a link starting with https://");
}
const bool = (v) => (v === true || v === 1 || v === "1" || v === "on" || v === "yes" || v === "true" ? 1 : 0);
const intIn = (v, label, { min = 0, max = 100000000, fallback = null } = {}) => {
  if (v === "" || v === null || v === undefined) {
    if (fallback !== null) return fallback;
    throw new UserError("Please enter " + label);
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new UserError("Please enter a valid whole number for " + label);
  return n;
};
function paging(url, def = 30) {
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const per = Math.max(1, Math.min(200, parseInt(url.searchParams.get("per") || String(def), 10) || def));
  return { page, per, offset: (page - 1) * per };
}

// ------------------------------------------------------------------ dashboard & reports
export async function dashboard(request, env) {
  const db = env.DB;
  const [today, month, byStatus, lowStock, best, recent, counts, enquiries] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS orders, COALESCE(SUM(total_paise), 0) AS revenue FROM orders WHERE ${SALE} AND date(${IST}) = date('now', '+330 minutes')`),
    db.prepare(`SELECT COUNT(*) AS orders, COALESCE(SUM(total_paise), 0) AS revenue FROM orders WHERE ${SALE} AND strftime('%Y-%m', ${IST}) = strftime('%Y-%m', 'now', '+330 minutes')`),
    db.prepare(`SELECT status, COUNT(*) AS n FROM orders WHERE NOT (razorpay_order_id IS NOT NULL AND payment_status IN ('unpaid', 'failed')) GROUP BY status`),
    db.prepare("SELECT id, name, stock, low_stock, unit FROM products WHERE active = 1 AND track_stock = 1 AND stock <= low_stock ORDER BY stock, name LIMIT 20"),
    db.prepare("SELECT id, name, sold, unit FROM products WHERE sold > 0 ORDER BY sold DESC LIMIT 8"),
    db.prepare("SELECT id, ref, kind, status, payment_method, payment_status, customer_name, phone, total_paise, created_at FROM orders ORDER BY id DESC LIMIT 8"),
    db.prepare("SELECT (SELECT COUNT(*) FROM products) AS products, (SELECT COUNT(*) FROM products WHERE active = 1 AND price_paise IS NULL) AS unpriced, (SELECT COUNT(DISTINCT phone) FROM orders) AS customers"),
    db.prepare("SELECT COUNT(*) AS n FROM enquiries WHERE status = 'new'"),
  ]);
  return json(200, {
    today: today.results[0], month: month.results[0],
    by_status: Object.fromEntries(byStatus.results.map((r) => [r.status, r.n])),
    low_stock: lowStock.results, best_sellers: best.results, recent: recent.results,
    counts: counts.results[0], new_enquiries: enquiries.results[0].n,
    payments_configured: Boolean(rzpKeyId(env) && rzpSecret(env)), webhook_configured: Boolean(env.RAZORPAY_WEBHOOK_SECRET),
  });
}

function dateRange(url) {
  const ok = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : "");
  const to = ok(url.searchParams.get("to")) || new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const from = ok(url.searchParams.get("from")) || new Date(Date.parse(to) - 29 * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

export async function reports(request, env, url) {
  const { from, to } = dateRange(url);
  const db = env.DB;
  const [daily, monthly, methods, orders] = await db.batch([
    db.prepare(`SELECT date(${IST}) AS day, COUNT(*) AS orders, SUM(total_paise) AS revenue, SUM(gst_paise) AS gst FROM orders WHERE ${SALE} AND date(${IST}) BETWEEN ?1 AND ?2 GROUP BY day ORDER BY day DESC`).bind(from, to),
    db.prepare(`SELECT strftime('%Y-%m', ${IST}) AS month, COUNT(*) AS orders, SUM(total_paise) AS revenue, SUM(gst_paise) AS gst FROM orders WHERE ${SALE} GROUP BY month ORDER BY month DESC LIMIT 24`),
    db.prepare(`SELECT payment_method AS method, COUNT(*) AS orders, SUM(total_paise) AS revenue FROM orders WHERE ${SALE} AND date(${IST}) BETWEEN ?1 AND ?2 GROUP BY payment_method`).bind(from, to),
    db.prepare(`SELECT items FROM orders WHERE ${SALE} AND date(${IST}) BETWEEN ?1 AND ?2 LIMIT 5000`).bind(from, to),
  ]);
  const sold = new Map();
  for (const o of orders.results) {
    for (const l of parseJson(o.items, [])) {
      const cur = sold.get(l.name) || { name: l.name, unit: l.unit, qty: 0, revenue: 0 };
      cur.qty += l.qty; cur.revenue += l.line_paise; sold.set(l.name, cur);
    }
  }
  const best = [...sold.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 25);
  return json(200, { from, to, daily: daily.results, monthly: monthly.results, methods: methods.results, best_sellers: best });
}

// ------------------------------------------------------------------ CSV
const csvCell = (v) => {
  let t = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; // stop spreadsheet formula injection
  return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
};
const csvResponse = (name, header, rows) =>
  new Response("﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
const toR = (p) => (p === null || p === undefined ? "" : String(p / 100));

export const PRODUCT_COLUMNS = ["slug", "name", "category", "subcategory", "brand", "sku", "description", "unit", "moq", "price", "mrp", "slabs", "gst_rate", "track_stock", "stock", "low_stock", "image", "gallery", "specs", "variants", "best_seller", "deal", "new", "seasonal", "bulk", "active"];

export async function exportProducts(request, env) {
  const { results } = await env.DB.prepare("SELECT * FROM products ORDER BY category, sort, name").all();
  const rows = results.map(normaliseProduct).map((p) => [
    p.slug, p.name, p.category, p.subcategory || "", p.brand, p.sku, p.description, p.unit, p.moq, toR(p.price_paise), toR(p.mrp_paise),
    p.tiers.map((t) => t.min + ":" + toR(t.price_paise)).join("|"), p.gst_rate ?? "", p.track_stock ? 1 : 0, p.stock, p.low_stock, p.image, p.gallery.join("|"),
    p.specs.map((s) => s.k + ":" + s.v).join("|"), p.variants.map((v) => v.label + (v.price_paise !== null && v.price_paise !== undefined ? ":" + toR(v.price_paise) : "")).join("|"),
    p.featured ? 1 : 0, p.deal ? 1 : 0, p.is_new ? 1 : 0, p.seasonal ? 1 : 0, p.bulk ? 1 : 0, p.active ? 1 : 0,
  ]);
  return csvResponse("wholesale-ludhiana-products.csv", PRODUCT_COLUMNS, rows);
}

export async function exportOrders(request, env, url) {
  const { from, to } = dateRange(url);
  const { results } = await env.DB.prepare(`SELECT * FROM orders WHERE date(${IST}) BETWEEN ?1 AND ?2 ORDER BY id DESC LIMIT 5000`).bind(from, to).all();
  const rows = results.map((o) => [
    o.ref, o.created_at + " UTC", o.kind, o.status, o.payment_method, o.payment_status, o.customer_name, o.phone, o.email, o.business, o.gstin,
    o.address, o.city, o.state, o.pincode,
    parseJson(o.items, []).map((l) => l.name + (l.variant_label ? " (" + l.variant_label + ")" : "") + " x " + l.qty + " " + l.unit + " @ " + toR(l.unit_paise)).join(" | "),
    toR(o.subtotal_paise), toR(o.discount_paise) || "0", o.coupon, toR(o.gst_paise) || "0", toR(o.shipping_paise) || "0", toR(o.total_paise), o.razorpay_payment_id || "", o.notes,
  ]);
  return csvResponse(`orders-${from}-to-${to}.csv`, ["order", "placed", "type", "status", "payment_method", "payment_status", "customer", "phone", "email", "business", "gstin", "address", "city", "state", "pincode", "items", "subtotal", "discount", "coupon", "gst", "delivery", "total", "razorpay_payment_id", "notes"], rows);
}

// ------------------------------------------------------------------ products
async function categoryIndex(env) {
  const cats = await listCategories(env, { includeInactive: true });
  return new Map(cats.map((c) => [c.slug, c]));
}

function productInput(b, cats) {
  const name = cleanText(b.name, { min: 2, max: 160, required: true, label: "the product name" });
  const category = cleanText(b.category, { max: 90, required: true, label: "the category" });
  const cat = cats.get(category);
  if (!cat || cat.parent) throw new UserError("Please choose a main category for " + name);
  const subcategory = cleanText(b.subcategory, { max: 90, label: "the subcategory" }) || null;
  if (subcategory && (!cats.get(subcategory) || cats.get(subcategory).parent !== category)) throw new UserError("The subcategory for " + name + " does not belong to " + cat.name);
  const unit = cleanText(b.unit, { max: 20, label: "unit" }) || "piece";
  if (!UNITS.includes(unit)) throw new UserError("Unit must be one of: " + UNITS.join(", "));
  const price = rupeesToPaise(b.price, "the wholesale price");
  const mrp = rupeesToPaise(b.mrp, "the MRP");
  const moq = intIn(b.moq, "the minimum order quantity", { min: 1, max: 100000, fallback: 1 });
  const tiers = (Array.isArray(b.tiers) ? b.tiers : []).slice(0, 12).map((t) => ({
    min: intIn(t && t.min, "the slab quantity", { min: 2, max: 1000000 }),
    price_paise: rupeesToPaise(t && t.price, "the slab price", { required: true }),
  })).sort((x, y) => x.min - y.min);
  if (new Set(tiers.map((t) => t.min)).size !== tiers.length) throw new UserError("Two price slabs start at the same quantity");
  if (tiers.length && price === null) throw new UserError("Set a wholesale price before adding quantity slabs");
  let gst = null;
  if (b.gst_rate !== "" && b.gst_rate !== null && b.gst_rate !== undefined) {
    gst = Number(b.gst_rate);
    if (!Number.isFinite(gst) || gst < 0 || gst > 40) throw new UserError("GST rate must be between 0 and 40");
  }
  const ids = new Set();
  const variants = (Array.isArray(b.variants) ? b.variants : []).slice(0, 80).map((v, i) => {
    const label = cleanText(v && v.label, { min: 1, max: 80, required: true, label: "the variation name" });
    let id = slugify(label).slice(0, 40) || "v" + i;
    while (ids.has(id)) id += "-" + i;
    ids.add(id);
    return { id, label, price_paise: rupeesToPaise(v.price, "the variation price"), available: v.available === false || v.available === 0 || v.available === "0" ? false : true };
  });
  const specs = (Array.isArray(b.specs) ? b.specs : []).slice(0, 30).map((s) => ({
    k: cleanText(s && s.k, { max: 60, required: true, label: "the specification name" }), v: cleanText(s && s.v, { max: 200, required: true, label: "the specification value" }),
  }));
  const gallery = (Array.isArray(b.gallery) ? b.gallery : []).slice(0, 10).map((u) => cleanImageUrl(u, "photo")).filter(Boolean);
  return {
    name, slug: slugify(b.slug || name), category, subcategory,
    brand: cleanText(b.brand, { max: 80, label: "brand" }), sku: cleanText(b.sku, { max: 60, label: "SKU" }),
    description: cleanText(b.description, { max: 4000, label: "description", multiline: true }),
    unit, moq, price_paise: price, mrp_paise: mrp, tiers: JSON.stringify(tiers), gst_rate: gst,
    track_stock: bool(b.track_stock), stock: intIn(b.stock, "stock", { fallback: 0 }), low_stock: intIn(b.low_stock, "the low-stock alert level", { fallback: 10 }),
    image: cleanImageUrl(b.image, "main photo"), gallery: JSON.stringify(gallery), specs: JSON.stringify(specs), variants: JSON.stringify(variants),
    featured: bool(b.featured), deal: bool(b.deal), is_new: bool(b.is_new), seasonal: bool(b.seasonal), bulk: bool(b.bulk),
    active: b.active === undefined ? 1 : bool(b.active), sort: intIn(b.sort, "sort order", { min: -100000, fallback: 0 }),
    seo_title: cleanText(b.seo_title, { max: 160, label: "SEO title" }), seo_description: cleanText(b.seo_description, { max: 320, label: "SEO description" }),
  };
}

const P_COLS = ["name", "slug", "category", "subcategory", "brand", "sku", "description", "unit", "moq", "price_paise", "mrp_paise", "tiers", "gst_rate", "track_stock", "stock", "low_stock", "image", "gallery", "specs", "variants", "featured", "deal", "is_new", "seasonal", "bulk", "active", "sort", "seo_title", "seo_description"];
const insertProduct = (env, p) =>
  env.DB.prepare(`INSERT INTO products (${P_COLS.join(", ")}) VALUES (${P_COLS.map((_, i) => "?" + (i + 1)).join(", ")})`).bind(...P_COLS.map((c) => p[c]));
const updateProductStmt = (env, p, id) =>
  env.DB.prepare(`UPDATE products SET ${P_COLS.map((c, i) => c + " = ?" + (i + 1)).join(", ")}, updated_at = datetime('now') WHERE id = ?${P_COLS.length + 1}`).bind(...P_COLS.map((c) => p[c]), id);

async function uniqueSlug(env, slug, exceptId = 0) {
  if (!slug) throw new UserError("Please enter a product name");
  let s = slug;
  for (let n = 2; n < 500; n++) {
    const hit = await env.DB.prepare("SELECT id FROM products WHERE slug = ?1 AND id <> ?2").bind(s, exceptId).first();
    if (!hit) return s;
    s = slug.slice(0, 74) + "-" + n;
  }
  throw new UserError("Could not create a unique web address for this product");
}

export async function listProductsAdmin(request, env, url) {
  const { page, per } = paging(url, 40);
  const res = await listProducts(env, {
    includeInactive: true, q: url.searchParams.get("q") || "", category: url.searchParams.get("category") || "",
    flag: url.searchParams.get("flag") || "", lowStock: url.searchParams.get("low") === "1", sort: url.searchParams.get("sort") || "name", page, perPage: per,
  });
  return json(200, { products: res.items, total: res.total, page, per });
}

export async function getProductAdmin(request, env, id) {
  const row = await env.DB.prepare("SELECT * FROM products WHERE id = ?1").bind(id).first();
  if (!row) throw new HttpError(404, "Product not found");
  return json(200, { product: normaliseProduct(row) });
}

export async function createProduct(request, env) {
  const p = productInput(await readJson(request, 64 * 1024), await categoryIndex(env));
  p.slug = await uniqueSlug(env, p.slug);
  const res = await insertProduct(env, p).run();
  return json(200, { ok: true, id: res.meta.last_row_id, slug: p.slug });
}

export async function updateProduct(request, env, id) {
  const p = productInput(await readJson(request, 64 * 1024), await categoryIndex(env));
  p.slug = await uniqueSlug(env, p.slug, id);
  const res = await updateProductStmt(env, p, id).run();
  if (!res.meta.changes) throw new HttpError(404, "Product not found");
  return json(200, { ok: true, slug: p.slug });
}

// Quick edits from the product list / bulk price list.
export async function patchProduct(request, env, id) {
  const b = await readJson(request);
  const sets = [];
  const args = [];
  const set = (col, v) => { args.push(v); sets.push(col + " = ?" + args.length); };
  if ("price" in b) set("price_paise", rupeesToPaise(b.price, "the price"));
  if ("stock" in b) set("stock", intIn(b.stock, "stock"));
  if ("moq" in b) set("moq", intIn(b.moq, "the minimum order quantity", { min: 1, max: 100000 }));
  for (const f of ["featured", "deal", "is_new", "seasonal", "bulk", "active", "track_stock"]) if (f in b) set(f, bool(b[f]));
  if ("tiers" in b) {
    const tiers = (Array.isArray(b.tiers) ? b.tiers : []).slice(0, 12).map((t) => ({ min: intIn(t && t.min, "the slab quantity", { min: 2, max: 1000000 }), price_paise: rupeesToPaise(t && t.price, "the slab price", { required: true }) })).sort((x, y) => x.min - y.min);
    set("tiers", JSON.stringify(tiers));
  }
  if (!sets.length) throw new UserError("Nothing to update");
  args.push(id);
  const res = await env.DB.prepare(`UPDATE products SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ?${args.length}`).bind(...args).run();
  if (!res.meta.changes) throw new HttpError(404, "Product not found");
  return json(200, { ok: true });
}

export async function deleteProduct(request, env, id) {
  const res = await env.DB.prepare("DELETE FROM products WHERE id = ?1").bind(id).run();
  if (!res.meta.changes) throw new HttpError(404, "Product not found");
  return json(200, { ok: true });
}

// Import rows parsed from a CSV / Excel sheet in the browser. A row whose slug matches an
// existing product updates it; any other row creates a new product. All-or-nothing per request.
export async function importProducts(request, env) {
  const body = await readJson(request, 900 * 1024);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) throw new UserError("The file has no product rows");
  if (rows.length > 300) throw new UserError("Please import at most 300 rows at a time");
  const cats = await categoryIndex(env);
  const split = (v) => String(v ?? "").split("|").map((x) => x.trim()).filter(Boolean);
  const stmts = [];
  let created = 0, updated = 0;
  const seenSlugs = new Set();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    let p;
    try {
      const pair = (x) => { const k = x.lastIndexOf(":"); return k < 0 ? [x, ""] : [x.slice(0, k).trim(), x.slice(k + 1).trim()]; };
      p = productInput({
        ...r, is_new: r.new, featured: r.best_seller, active: r.active === "" || r.active === undefined ? 1 : r.active,
        tiers: split(r.slabs).map((x) => { const [min, price] = pair(x); return { min: Number(min), price }; }),
        gallery: split(r.gallery),
        specs: split(r.specs).map((x) => { const k = x.indexOf(":"); return { k: k < 0 ? x : x.slice(0, k).trim(), v: k < 0 ? "-" : x.slice(k + 1).trim() }; }),
        variants: split(r.variants).map((x) => { const [label, price] = pair(x); return /^\d+(\.\d+)?$/.test(price) ? { label, price } : { label: x }; }),
      }, cats);
    } catch (e) {
      if (e instanceof UserError) throw new UserError("Row " + (i + 2) + ": " + e.message);
      throw e;
    }
    const wanted = slugify(r.slug || "");
    const existing = wanted ? await env.DB.prepare("SELECT id FROM products WHERE slug = ?1").bind(wanted).first() : null;
    if (existing) { p.slug = wanted; stmts.push(updateProductStmt(env, p, existing.id)); updated++; }
    else {
      let s = await uniqueSlug(env, wanted || p.slug);
      for (let n = 2; seenSlugs.has(s); n++) s = (wanted || p.slug).slice(0, 74) + "-" + n + "x";
      seenSlugs.add(s); p.slug = s; stmts.push(insertProduct(env, p)); created++;
    }
  }
  await env.DB.batch(stmts);
  return json(200, { ok: true, created, updated });
}

// ------------------------------------------------------------------ categories
function categoryInput(b) {
  return {
    name: cleanText(b.name, { min: 2, max: 80, required: true, label: "the category name" }),
    parent: cleanText(b.parent, { max: 90, label: "parent category" }) || null,
    description: cleanText(b.description, { max: 600, label: "description", multiline: true }),
    image: cleanImageUrl(b.image, "category image"),
    seo_title: cleanText(b.seo_title, { max: 160, label: "SEO title" }), seo_description: cleanText(b.seo_description, { max: 320, label: "SEO description" }),
    sort: intIn(b.sort, "sort order", { min: -1000, max: 100000, fallback: 0 }), active: b.active === undefined ? 1 : bool(b.active),
  };
}

export async function listCategoriesAdmin(request, env) {
  const [cats, counts] = await Promise.all([
    listCategories(env, { includeInactive: true }),
    env.DB.prepare("SELECT category AS slug, COUNT(*) AS n FROM products GROUP BY category UNION ALL SELECT subcategory, COUNT(*) FROM products WHERE subcategory IS NOT NULL GROUP BY subcategory").all(),
  ]);
  const n = Object.fromEntries(counts.results.map((r) => [r.slug, r.n]));
  return json(200, { categories: cats.map((c) => ({ ...c, products: n[c.slug] || 0 })) });
}

export async function createCategory(request, env) {
  const b = await readJson(request);
  const c = categoryInput(b);
  const slug = slugify(b.slug || c.name);
  if (!slug) throw new UserError("Please enter a category name");
  if (await env.DB.prepare("SELECT slug FROM categories WHERE slug = ?1").bind(slug).first()) throw new UserError("A category with this web address already exists — try a slightly different name");
  if (c.parent) {
    const parent = await env.DB.prepare("SELECT parent FROM categories WHERE slug = ?1").bind(c.parent).first();
    if (!parent || parent.parent) throw new UserError("Please choose a main category as the parent");
  }
  await env.DB.prepare("INSERT INTO categories (slug, parent, name, description, image, seo_title, seo_description, sort, active) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)")
    .bind(slug, c.parent, c.name, c.description, c.image, c.seo_title, c.seo_description, c.sort, c.active).run();
  return json(200, { ok: true, slug });
}

export async function updateCategory(request, env, slug) {
  const c = categoryInput(await readJson(request));
  const res = await env.DB.prepare("UPDATE categories SET name = ?1, description = ?2, image = ?3, seo_title = ?4, seo_description = ?5, sort = ?6, active = ?7 WHERE slug = ?8")
    .bind(c.name, c.description, c.image, c.seo_title, c.seo_description, c.sort, c.active, slug).run();
  if (!res.meta.changes) throw new HttpError(404, "Category not found");
  return json(200, { ok: true });
}

export async function deleteCategory(request, env, slug) {
  const used = await env.DB.prepare("SELECT COUNT(*) AS n FROM products WHERE category = ?1 OR subcategory = ?1 OR category IN (SELECT slug FROM categories WHERE parent = ?1)").bind(slug).first();
  if (used.n) throw new UserError("This category still has " + used.n + " product(s). Move or delete them first, or simply hide the category.");
  await env.DB.batch([env.DB.prepare("DELETE FROM categories WHERE parent = ?1").bind(slug), env.DB.prepare("DELETE FROM categories WHERE slug = ?1").bind(slug)]);
  return json(200, { ok: true });
}

// ------------------------------------------------------------------ orders & customers
export async function listOrders(request, env, url) {
  const { page, per, offset } = paging(url);
  const where = [];
  const args = [];
  const status = url.searchParams.get("status") || "";
  if (ORDER_STATUSES.includes(status)) { args.push(status); where.push("status = ?" + args.length); }
  const kind = url.searchParams.get("kind") || "";
  if (kind === "bulk" || kind === "standard") { args.push(kind); where.push("kind = ?" + args.length); }
  const q = (url.searchParams.get("q") || "").trim().slice(0, 60);
  if (q) { args.push("%" + q.replace(/[%_\\]/g, "\\$&") + "%"); const n = "?" + args.length; where.push(`(ref LIKE ${n} ESCAPE '\\' OR customer_name LIKE ${n} ESCAPE '\\' OR phone LIKE ${n} ESCAPE '\\' OR business LIKE ${n} ESCAPE '\\')`); }
  // Abandoned online checkouts are hidden unless asked for.
  if (url.searchParams.get("abandoned") !== "1") where.push("NOT (razorpay_order_id IS NOT NULL AND payment_status IN ('unpaid', 'failed'))");
  const w = where.length ? " WHERE " + where.join(" AND ") : "";
  const [rows, count] = await env.DB.batch([
    env.DB.prepare(`SELECT id, ref, kind, status, payment_method, payment_status, customer_name, phone, business, city, total_paise, created_at FROM orders${w} ORDER BY id DESC LIMIT ${per} OFFSET ${offset}`).bind(...args),
    env.DB.prepare("SELECT COUNT(*) AS n FROM orders" + w).bind(...args),
  ]);
  return json(200, { orders: rows.results, total: count.results[0].n, page, per });
}

export async function getOrder(request, env, id) {
  const o = await env.DB.prepare("SELECT * FROM orders WHERE id = ?1").bind(id).first();
  if (!o) throw new HttpError(404, "Order not found");
  return json(200, { order: { ...o, items: parseJson(o.items, []), billing: parseJson(o.billing, {}), event: parseJson(o.event, {}) } });
}

export async function updateOrder(request, env, id) {
  const b = await readJson(request);
  const o = await env.DB.prepare("SELECT id, status, payment_status, payment_method FROM orders WHERE id = ?1").bind(id).first();
  if (!o) throw new HttpError(404, "Order not found");
  const sets = [];
  const args = [];
  const set = (col, v) => { args.push(v); sets.push(col + " = ?" + args.length); };
  if ("status" in b) {
    if (!ORDER_STATUSES.includes(b.status)) throw new UserError("Unknown order status");
    set("status", b.status);
  }
  if ("payment_status" in b) {
    if (!PAYMENT_STATUSES.includes(b.payment_status)) throw new UserError("Unknown payment status");
    set("payment_status", b.payment_status);
    if (b.payment_status === "paid" && o.payment_status !== "paid") sets.push("paid_at = datetime('now')");
  }
  if ("admin_note" in b) set("admin_note", cleanText(b.admin_note, { max: 1000, label: "note", multiline: true }));
  if (!sets.length) throw new UserError("Nothing to update");
  args.push(id);
  await env.DB.prepare(`UPDATE orders SET ${sets.join(", ")} WHERE id = ?${args.length}`).bind(...args).run();
  // Stock follows the order: cancelled orders give their stock back; anything else holds it.
  const status = "status" in b ? b.status : o.status;
  if (status === "cancelled") await restoreStock(env, id);
  else if ("status" in b && b.status !== "pending") await applyStock(env, id);
  return json(200, { ok: true });
}

export async function listCustomers(request, env, url) {
  const { page, per, offset } = paging(url);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 60);
  const like = "%" + q.replace(/[%_\\]/g, "\\$&") + "%";
  const filter = q ? " WHERE (customer_name LIKE ?1 ESCAPE '\\' OR phone LIKE ?1 ESCAPE '\\' OR business LIKE ?1 ESCAPE '\\')" : "";
  const bind = (st) => (q ? st.bind(like) : st);
  const [rows, count] = await env.DB.batch([
    bind(env.DB.prepare(
      `SELECT phone, MAX(customer_name) AS name, MAX(email) AS email, MAX(business) AS business, MAX(city) AS city, COUNT(*) AS orders,
         SUM(CASE WHEN ${SALE} THEN total_paise ELSE 0 END) AS spent, MAX(created_at) AS last_order
       FROM orders${filter} GROUP BY phone ORDER BY last_order DESC LIMIT ${per} OFFSET ${offset}`)),
    bind(env.DB.prepare("SELECT COUNT(DISTINCT phone) AS n FROM orders" + filter)),
  ]);
  return json(200, { customers: rows.results, total: count.results[0].n, page, per });
}

export async function getCustomer(request, env, url) {
  const phone = (url.searchParams.get("phone") || "").slice(0, 20);
  const { results } = await env.DB.prepare("SELECT * FROM orders WHERE phone = ?1 ORDER BY id DESC LIMIT 200").bind(phone).all();
  if (!results.length) throw new HttpError(404, "Customer not found");
  const last = results[0];
  return json(200, {
    customer: {
      phone, name: last.customer_name, email: last.email, business: last.business, gstin: last.gstin,
      shipping: { address: last.address, city: last.city, state: last.state, pincode: last.pincode }, billing: parseJson(last.billing, {}),
    },
    orders: results.map((o) => ({ id: o.id, ref: o.ref, status: o.status, payment_status: o.payment_status, payment_method: o.payment_method, total_paise: o.total_paise, created_at: o.created_at, kind: o.kind })),
  });
}

// ------------------------------------------------------------------ enquiries
export async function listEnquiries(request, env, url) {
  const { page, per, offset } = paging(url);
  const [rows, count] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM enquiries ORDER BY id DESC LIMIT ${per} OFFSET ${offset}`),
    env.DB.prepare("SELECT COUNT(*) AS n FROM enquiries"),
  ]);
  return json(200, { enquiries: rows.results.map((e) => ({ ...e, payload: parseJson(e.payload, {}) })), total: count.results[0].n, page, per });
}
export async function updateEnquiry(request, env, id) {
  const b = await readJson(request);
  if (!ENQUIRY_STATUSES.includes(b.status)) throw new UserError("Unknown status");
  await env.DB.prepare("UPDATE enquiries SET status = ?1 WHERE id = ?2").bind(b.status, id).run();
  return json(200, { ok: true });
}
export async function deleteEnquiry(request, env, id) {
  await env.DB.prepare("DELETE FROM enquiries WHERE id = ?1").bind(id).run();
  return json(200, { ok: true });
}

// ------------------------------------------------------------------ simple tables: testimonials, banners, coupons
const cleanLink = (v) => {
  const t = cleanText(v, { max: 300, label: "link" });
  if (t && !/^(\/[A-Za-z0-9/_?=&%#.-]*|https:\/\/[^\s"'<>]+)$/.test(t)) throw new UserError("Links must start with / or https://");
  return t;
};
const TABLES = {
  testimonials: {
    order: "sort, id",
    input: (b) => ({
      name: cleanText(b.name, { min: 2, max: 80, required: true, label: "the customer name" }), location: cleanText(b.location, { max: 80, label: "location" }),
      text: cleanText(b.text, { min: 5, max: 600, required: true, label: "the review", multiline: true }),
      rating: intIn(b.rating, "rating", { min: 1, max: 5, fallback: 5 }), active: bool(b.active), sort: intIn(b.sort, "sort order", { min: -1000, fallback: 0 }),
    }),
  },
  banners: {
    order: "placement, sort, id",
    input: (b) => {
      if (!["hero", "offer"].includes(b.placement)) throw new UserError("Please choose where the banner appears");
      return {
        placement: b.placement, title: cleanText(b.title, { min: 2, max: 140, required: true, label: "the banner title" }),
        subtitle: cleanText(b.subtitle, { max: 300, label: "subtitle" }), image: cleanImageUrl(b.image, "banner image"),
        cta_label: cleanText(b.cta_label, { max: 40, label: "button text" }), cta_url: cleanLink(b.cta_url),
        active: bool(b.active), sort: intIn(b.sort, "sort order", { min: -1000, fallback: 0 }),
      };
    },
  },
  coupons: {
    order: "id DESC",
    input: (b) => {
      const code = cleanText(b.code, { min: 2, max: 30, required: true, label: "the coupon code" }).toUpperCase();
      if (!/^[A-Z0-9_-]{2,30}$/.test(code)) throw new UserError("Coupon codes can use letters, numbers, - and _ only");
      const type = b.type === "flat" ? "flat" : "percent";
      const value = type === "percent" ? intIn(b.value, "the discount percent", { min: 1, max: 100 }) : rupeesToPaise(b.value, "the discount amount", { required: true });
      const expires = cleanText(b.expires, { max: 10, label: "expiry date" });
      if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) throw new UserError("Please pick a valid expiry date");
      return {
        code, description: cleanText(b.description, { max: 200, label: "description" }), type, value,
        min_paise: rupeesToPaise(b.min, "the minimum order") || 0, max_paise: type === "percent" ? rupeesToPaise(b.max, "the maximum discount") : null,
        usage_limit: b.usage_limit === "" || b.usage_limit === null || b.usage_limit === undefined ? null : intIn(b.usage_limit, "the usage limit", { min: 1 }),
        expires, active: bool(b.active),
      };
    },
  },
};

export async function listRows(request, env, table) {
  return json(200, { rows: (await env.DB.prepare(`SELECT * FROM ${table} ORDER BY ${TABLES[table].order}`).all()).results });
}
export async function createRow(request, env, table) {
  const v = TABLES[table].input(await readJson(request));
  const cols = Object.keys(v);
  try {
    const res = await env.DB.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((_, i) => "?" + (i + 1)).join(", ")})`).bind(...cols.map((c) => v[c])).run();
    return json(200, { ok: true, id: res.meta.last_row_id });
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) throw new UserError("That code already exists");
    throw e;
  }
}
export async function updateRow(request, env, table, id) {
  const v = TABLES[table].input(await readJson(request));
  const cols = Object.keys(v);
  try {
    const res = await env.DB.prepare(`UPDATE ${table} SET ${cols.map((c, i) => c + " = ?" + (i + 1)).join(", ")} WHERE id = ?${cols.length + 1}`).bind(...cols.map((c) => v[c]), id).run();
    if (!res.meta.changes) throw new HttpError(404, "Not found");
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) throw new UserError("That code already exists");
    throw e;
  }
  return json(200, { ok: true });
}
export async function deleteRow(request, env, table, id) {
  await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?1`).bind(id).run();
  return json(200, { ok: true });
}

// ------------------------------------------------------------------ settings
const txt = (v, max, label, multiline = false) => cleanText(v, { max, label, multiline });
const SETTING_VALIDATORS = {
  store: (b) => {
    const whatsapp = String(b.whatsapp || "").replace(/\D/g, "");
    if (whatsapp.length < 10 || whatsapp.length > 13) throw new UserError("Please enter the WhatsApp number with country code, for example 918727002486");
    const gstin = txt(b.gstin, 15, "GSTIN").toUpperCase();
    return {
      name: txt(b.name, 80, "store name") || SETTINGS_DEFAULTS.store.name, tagline: txt(b.tagline, 160, "tagline"),
      whatsapp: whatsapp.length === 10 ? "91" + whatsapp : whatsapp, phone: txt(b.phone, 20, "phone"), email: txt(b.email, 120, "email"),
      address: txt(b.address, 240, "address"), city: txt(b.city, 60, "city"), region: txt(b.region, 60, "state"), postcode: txt(b.postcode, 6, "pincode"),
      hours: txt(b.hours, 120, "opening hours"), gstin,
    };
  },
  shipping: (b) => ({
    flat_paise: rupeesToPaise(b.flat, "the delivery charge") || 0, free_above_paise: rupeesToPaise(b.free_above, "the free delivery amount"),
    bulk_flat_paise: rupeesToPaise(b.bulk_flat, "the bulk order delivery charge") || 0, note: txt(b.note, 300, "delivery note", true),
  }),
  gst: (b) => {
    const rate = Number(b.default_rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 40) throw new UserError("The default GST rate must be between 0 and 40");
    return { enabled: !!bool(b.enabled), default_rate: rate, inclusive: !!bool(b.inclusive) };
  },
  payments: (b) => {
    const upi = txt(b.upi_id, 80, "UPI ID");
    if (upi && !/^[A-Za-z0-9._-]{2,}@[A-Za-z0-9.-]{2,}$/.test(upi)) throw new UserError("The UPI ID should look like name@bank");
    const ifsc = txt(b.bank_ifsc, 11, "IFSC").toUpperCase();
    if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) throw new UserError("The IFSC code should be 11 characters, for example SBIN0001234");
    return {
      razorpay: !!bool(b.razorpay), upi: !!bool(b.upi), cod: !!bool(b.cod), bank: !!bool(b.bank), cod_max_paise: rupeesToPaise(b.cod_max, "the COD limit"),
      upi_id: upi, bank_name: txt(b.bank_name, 80, "bank name"), bank_account_name: txt(b.bank_account_name, 80, "account name"),
      bank_account_number: txt(b.bank_account_number, 24, "account number").replace(/\s/g, ""), bank_ifsc: ifsc,
    };
  },
  home: (b) => ({
    announcement: txt(b.announcement, 160, "announcement"), hero_title: txt(b.hero_title, 140, "hero title"), hero_subtitle: txt(b.hero_subtitle, 300, "hero subtitle"),
    seasonal_title: txt(b.seasonal_title, 100, "seasonal title"), seasonal_text: txt(b.seasonal_text, 300, "seasonal text"), seasonal_url: cleanLink(b.seasonal_url),
    langar_title: txt(b.langar_title, 120, "langar title"), langar_text: txt(b.langar_text, 300, "langar text"),
  }),
  pages: (b) => Object.fromEntries(["about", "shipping", "refund", "privacy", "terms"].map((k) => [k, txt(b[k], 8000, k + " page", true)])),
  seo: (b) => ({
    title: txt(b.title, 160, "SEO title"), description: txt(b.description, 320, "SEO description"),
    google_verification: txt(b.google_verification, 100, "Google verification code").replace(/[^A-Za-z0-9_-]/g, ""),
  }),
};

export async function getAllSettings(request, env) {
  return json(200, { settings: await getSettings(env) });
}

export async function putSettings(request, env, key) {
  const validate = SETTING_VALIDATORS[key];
  if (!validate) throw new HttpError(404, "Unknown settings group");
  await putSetting(env, key, validate(await readJson(request, 64 * 1024)));
  return json(200, { ok: true });
}

// ------------------------------------------------------------------ photo uploads
// The admin panel resizes photos in the browser (max 1400px, WebP/JPEG) before sending them.
const IMAGE_TYPES = { "image/webp": 1, "image/jpeg": 1, "image/png": 1 };
export async function uploadMedia(request, env) {
  const type = (request.headers.get("Content-Type") || "").toLowerCase().split(";")[0];
  if (!IMAGE_TYPES[type]) throw new UserError("Only JPG, PNG or WebP photos can be uploaded");
  const buf = await request.arrayBuffer();
  if (buf.byteLength < 100) throw new UserError("That file is empty");
  if (buf.byteLength > 900 * 1024) throw new UserError("That photo is too large after resizing (max 900 KB)");
  const b = new Uint8Array(buf);
  const magic = (type === "image/jpeg" && b[0] === 0xff && b[1] === 0xd8) || (type === "image/png" && b[0] === 0x89 && b[1] === 0x50) ||
    (type === "image/webp" && b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45);
  if (!magic) throw new UserError("That file is not a valid photo");
  const id = crypto.randomUUID().replace(/-/g, "");
  await env.DB.prepare("INSERT INTO media (id, content_type, size, data) VALUES (?1, ?2, ?3, ?4)").bind(id, type, buf.byteLength, buf).run();
  return json(200, { ok: true, url: "/media/" + id });
}

export async function paymentCheck(request, env) {
  const keyId = rzpKeyId(env);
  const secret = rzpSecret(env);
  const mode = keyId.startsWith("rzp_live_") ? "live" : keyId.startsWith("rzp_test_") ? "test" : "unknown";
  const base = { key_id: keyId, mode, secret_set: Boolean(secret) };
  if (!keyId) return json(200, { ...base, ok: false, message: "RAZORPAY_KEY_ID is not set." });
  if (!/^rzp_(live|test)_[A-Za-z0-9]{8,}$/.test(keyId)) return json(200, { ...base, ok: false, message: "RAZORPAY_KEY_ID doesn't look like a Razorpay key id (rzp_live_… or rzp_test_…)." });
  if (!secret) return json(200, { ...base, ok: false, message: "RAZORPAY_KEY_SECRET is not set. Add it in Cloudflare → Worker → Settings → Variables and Secrets (type: Secret)." });
  let res;
  try {
    res = await fetch(razorpayBase(env) + "/v1/orders?count=1", { headers: { Authorization: rzpAuthHeader(env) } });
  } catch {
    return json(200, { ...base, ok: false, message: "Couldn't reach Razorpay from the server. Try again in a minute." });
  }
  if (res.ok) return json(200, { ...base, ok: true, message: "Razorpay accepted the key id and secret (" + mode + " mode). Online payments should work." });
  let detail = "";
  try { detail = ((await res.json()).error || {}).description || ""; } catch { /* not JSON */ }
  detail = String(detail).replace(/[<>]/g, "").slice(0, 200);
  const message = res.status === 401
    ? "Razorpay rejected the key: RAZORPAY_KEY_SECRET doesn't match RAZORPAY_KEY_ID " + keyId + " (wrong or old secret, a test secret with a live key, or the key was regenerated). Paste the correct secret for this key id."
    : "Razorpay returned an error (HTTP " + res.status + ")" + (detail ? ": " + detail : "") + ".";
  return json(200, { ...base, ok: false, status: res.status, message });
}
