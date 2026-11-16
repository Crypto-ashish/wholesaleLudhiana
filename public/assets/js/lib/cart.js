// Cart + wishlist stores (localStorage). The cart holds slugs, quantities and a
// display snapshot; prices are always re-calculated by the server (/api/cart/quote).
import { unitPrice } from "./price.js";

const KEY = "wl_cart_v1";
const WISH_KEY = "wl_wishlist_v1";
const MAX_QTY = 100000;

function read(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v.filter((i) => i && typeof i.slug === "string") : [];
  } catch {
    return [];
  }
}
const memory = {}; // fallback when storage is unavailable
function write(key, items, event) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
    delete memory[key];
  } catch {
    memory[key] = items;
  }
  document.dispatchEvent(new CustomEvent(event, { detail: { items } }));
}

export const getCart = () => (memory[KEY] || read(KEY)).filter((i) => Number.isInteger(i.qty));
const save = (items) => write(KEY, items, "cart:change");

export const lineKey = (slug, variant = "") => slug + "|" + (variant || "");

// Price per unit for a cart line at its quantity (slabs apply unless the variant has its own price).
export const linePrice = (i, qty = i.qty) => (Number.isInteger(i.price) ? (i.own ? i.price : unitPrice(i.price, i.tiers, qty)) : null);

export function addItem(data, { variant = "", qty = 1 } = {}) {
  const items = getCart();
  const key = lineKey(data.slug, variant);
  const v = (data.variants || []).find((x) => x.id === variant);
  const moq = data.moq || 1;
  const existing = items.find((i) => i.key === key);
  if (existing) existing.qty = Math.min(MAX_QTY, existing.qty + qty);
  else items.push({
    key, slug: data.slug, variant: variant || "", qty: Math.min(MAX_QTY, Math.max(moq, qty)),
    name: data.name, image: data.image, unit: data.unit || "piece", moq, tiers: data.tiers || [],
    variantLabel: v ? v.label : "", price: v ? v.price : data.price, own: v ? !!v.own : false,
  });
  save(items);
  return items;
}

export function setQty(key, qty) {
  const items = getCart();
  const it = items.find((i) => i.key === key);
  if (!it) return items;
  it.qty = Math.max(it.moq || 1, Math.min(MAX_QTY, Math.round(qty) || it.moq || 1));
  save(items);
  return items;
}

export const removeItem = (key) => save(getCart().filter((i) => i.key !== key));
export const clearCart = () => save([]);

export const count = (items = getCart()) => items.length;
export const snapshotSubtotal = (items = getCart()) => items.reduce((s, i) => s + (linePrice(i) !== null ? linePrice(i) * i.qty : 0), 0);

export function payload(items = getCart()) {
  return items.map((i) => {
    const o = { slug: i.slug, qty: i.qty };
    if (i.variant) o.variant = i.variant;
    return o;
  });
}

// Merge server info (name/image/price/slabs) back into the snapshot.
export function refreshSnapshot(products) {
  const items = getCart();
  let changed = false;
  for (const i of items) {
    const p = products[i.slug];
    if (!p) continue;
    const v = (p.variants || []).find((x) => x.id === i.variant);
    const next = { price: v ? v.price : p.price, own: v ? !!v.own : false, name: p.name, image: p.image, unit: p.unit, moq: p.moq, tiers: p.tiers };
    if (JSON.stringify(next) !== JSON.stringify({ price: i.price, own: i.own, name: i.name, image: i.image, unit: i.unit, moq: i.moq, tiers: i.tiers })) {
      Object.assign(i, next);
      changed = true;
    }
  }
  if (changed) save(items);
}

// ---- coupon code typed by the customer (validated by the server on every quote)
export const getCoupon = () => { try { return localStorage.getItem("wl_coupon") || ""; } catch { return ""; } };
export const setCoupon = (code) => { try { code ? localStorage.setItem("wl_coupon", code) : localStorage.removeItem("wl_coupon"); } catch { /* ignore */ } };

// ---- wishlist (saved on this device)
export const getWishlist = () => memory[WISH_KEY] || read(WISH_KEY);
export const isWished = (slug) => getWishlist().some((i) => i.slug === slug);
export function toggleWish(data) {
  const items = getWishlist();
  const on = !items.some((i) => i.slug === data.slug);
  write(WISH_KEY, on ? [...items, data] : items.filter((i) => i.slug !== data.slug), "wish:change");
  return on;
}

window.addEventListener("storage", (e) => {
  if (e.key === KEY) document.dispatchEvent(new CustomEvent("cart:change", { detail: { items: getCart() } }));
  if (e.key === WISH_KEY) document.dispatchEvent(new CustomEvent("wish:change", { detail: { items: getWishlist() } }));
});
