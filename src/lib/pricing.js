// Authoritative pricing. The browser only sends product slugs, variants and
// quantities; every amount (quantity slabs, GST, coupon, delivery) is computed
// here from database values so totals can't be tampered with. Pure — unit tested.
import { UserError, parseJson } from "./util.js";
import { unitPrice, totals } from "../../public/assets/js/lib/price.js";

export const MAX_LINES = 60;
export const MAX_QTY = 100000;

/**
 * @param items     [{ slug, variant?, qty }]
 * @param products  Map slug -> product row
 * @param settings  { gst, shipping }
 * @param opts      { coupon, kind: "standard" | "bulk" }
 */
export function priceCart(items, products, settings, { coupon = null, kind = "standard" } = {}) {
  if (!Array.isArray(items) || items.length === 0) throw new UserError("Your cart is empty");
  if (items.length > MAX_LINES) throw new UserError("Too many different items in one order (max " + MAX_LINES + ")");
  const gst = settings.gst || {};
  const seen = new Set();
  const need = new Map();
  const lines = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") throw new UserError("Invalid cart item");
    const p = products.get(typeof raw.slug === "string" ? raw.slug : "");
    if (!p || !p.active) throw new UserError("An item in your cart is no longer available. Please remove it and try again.");
    if (kind === "bulk" && !p.bulk) throw new UserError(p.name + " is not available in the bulk order calculator.");
    const qty = raw.qty;
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new UserError("Please enter a valid quantity for " + p.name);
    if (qty < p.moq) throw new UserError("Minimum order for " + p.name + " is " + p.moq + " " + p.unit);
    const variants = Array.isArray(p.variants) ? p.variants : parseJson(p.variants || "[]", []);
    let unit = p.price_paise;
    let variantLabel = "";
    let variantId = "";
    let ownPrice = false;
    if (variants.length) {
      const v = variants.find((x) => x.id === raw.variant);
      if (!v) throw new UserError("Please choose an option for " + p.name);
      if (v.available === false) throw new UserError(p.name + " (" + v.label + ") is out of stock. Please remove it to continue.");
      variantId = v.id;
      variantLabel = v.label;
      if (v.price_paise !== null && v.price_paise !== undefined) { unit = v.price_paise; ownPrice = true; }
    }
    if (unit === null || unit === undefined) {
      throw new UserError(p.name + (variantLabel ? " (" + variantLabel + ")" : "") + " is available on request — please enquire on WhatsApp.");
    }
    // Quantity slabs apply to the product price; a variant with its own price keeps that price.
    if (!ownPrice) unit = unitPrice(unit, Array.isArray(p.tiers) ? p.tiers : parseJson(p.tiers || "[]", []), qty);
    const key = p.slug + "|" + variantId;
    if (seen.has(key)) throw new UserError("Duplicate item in cart. Please refresh the page and try again.");
    seen.add(key);
    need.set(p.slug, (need.get(p.slug) || 0) + qty);
    const rate = gst.enabled ? (p.gst_rate === null || p.gst_rate === undefined ? Number(gst.default_rate) || 0 : Number(p.gst_rate)) : 0;
    lines.push({ slug: p.slug, id: p.id, name: p.name, sku: p.sku || "", variant: variantId, variant_label: variantLabel, unit: p.unit, qty, unit_paise: unit, line_paise: unit * qty, gst_rate: rate });
  }
  for (const [slug, qty] of need) {
    const p = products.get(slug);
    if (p.track_stock && qty > p.stock) {
      throw new UserError(p.stock > 0 ? "Only " + p.stock + " " + p.unit + " of " + p.name + " in stock. Please reduce the quantity." : p.name + " is currently out of stock. Please remove it to continue.");
    }
  }
  const ship = settings.shipping || {};
  const t = totals(lines, {
    gst_enabled: !!gst.enabled, gst_inclusive: !!gst.inclusive,
    flat_paise: kind === "bulk" ? ship.bulk_flat_paise : ship.flat_paise, free_above_paise: ship.free_above_paise,
  }, coupon);
  return { lines, ...t, coupon: coupon && t.discount_paise > 0 ? coupon.code : "" };
}
