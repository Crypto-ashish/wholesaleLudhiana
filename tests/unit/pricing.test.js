import { test } from "node:test";
import assert from "node:assert/strict";
import { priceCart } from "../../src/lib/pricing.js";
import { unitPrice, slabRows, totals, couponDiscount } from "../../public/assets/js/lib/price.js";
import { hashPassword, verifyPassword } from "../../src/lib/auth.js";
import { hmacSha256Hex, thumbOf } from "../../src/lib/util.js";
import { html } from "../../src/render/html.js";
import { cartMessage, waUrl } from "../../public/assets/js/lib/wa.js";

const tiers = [{ min: 11, price_paise: 9000 }, { min: 51, price_paise: 8000 }];
const product = (o = {}) => ({ id: 1, slug: "p", name: "Product", active: true, bulk: false, unit: "piece", moq: 1, price_paise: 10000, tiers, variants: [], gst_rate: null, track_stock: false, stock: 0, sku: "", ...o });
const settings = (o = {}) => ({ gst: { enabled: true, default_rate: 5, inclusive: false, ...(o.gst || {}) }, shipping: { flat_paise: 15000, free_above_paise: 1000000, bulk_flat_paise: 30000, ...(o.shipping || {}) } });
const map = (...ps) => new Map(ps.map((p) => [p.slug, p]));

test("quantity slabs: 1–10 ₹100, 11–50 ₹90, 51+ ₹80", () => {
  assert.equal(unitPrice(10000, tiers, 1), 10000);
  assert.equal(unitPrice(10000, tiers, 10), 10000);
  assert.equal(unitPrice(10000, tiers, 11), 9000);
  assert.equal(unitPrice(10000, tiers, 50), 9000);
  assert.equal(unitPrice(10000, tiers, 51), 8000);
  assert.equal(unitPrice(10000, tiers, 5000), 8000);
  assert.deepEqual(slabRows(10000, tiers, 1), [{ from: 1, to: 10, price_paise: 10000 }, { from: 11, to: 50, price_paise: 9000 }, { from: 51, to: null, price_paise: 8000 }]);
});

test("cart: slab price, GST on top and delivery charge", () => {
  const q = priceCart([{ slug: "p", qty: 20 }], map(product()), settings());
  assert.equal(q.lines[0].unit_paise, 9000);
  assert.equal(q.subtotal_paise, 180000);
  assert.equal(q.gst_paise, 9000); // 5%
  assert.equal(q.shipping_paise, 15000);
  assert.equal(q.total_paise, 204000);
});

test("cart: per-product GST rate, free delivery above the limit", () => {
  const q = priceCart([{ slug: "p", qty: 200 }], map(product({ gst_rate: 18 })), settings());
  assert.equal(q.subtotal_paise, 1600000);
  assert.equal(q.gst_paise, 288000);
  assert.equal(q.shipping_paise, 0);
  assert.equal(q.total_paise, 1888000);
});

test("GST-inclusive prices: GST is shown but not added again", () => {
  const q = priceCart([{ slug: "p", qty: 1 }], map(product({ price_paise: 10500, tiers: [] })), settings({ gst: { inclusive: true }, shipping: { flat_paise: 0 } }));
  assert.equal(q.gst_paise, 500);
  assert.equal(q.total_paise, 10500);
});

test("GST switched off", () => {
  const q = priceCart([{ slug: "p", qty: 1 }], map(product()), settings({ gst: { enabled: false }, shipping: { flat_paise: 0 } }));
  assert.equal(q.gst_paise, 0);
  assert.equal(q.total_paise, 10000);
});

test("coupons: percent with cap, flat, minimum order; GST is charged after the discount", () => {
  assert.equal(couponDiscount({ type: "percent", value: 10, min_paise: 0, max_paise: 5000 }, 100000), 5000);
  assert.equal(couponDiscount({ type: "flat", value: 20000, min_paise: 0 }, 10000), 10000);
  assert.equal(couponDiscount({ type: "flat", value: 20000, min_paise: 50000 }, 10000), 0);
  const q = priceCart([{ slug: "p", qty: 10 }], map(product()), settings({ shipping: { flat_paise: 0 } }), { coupon: { code: "SAVE10", type: "percent", value: 10, min_paise: 0, max_paise: null } });
  assert.equal(q.discount_paise, 10000);
  assert.equal(q.gst_paise, 4500);
  assert.equal(q.total_paise, 94500);
  assert.equal(q.coupon, "SAVE10");
});

test("minimum order quantity, stock and price-on-request are enforced on the server", () => {
  assert.throws(() => priceCart([{ slug: "p", qty: 5 }], map(product({ moq: 12 })), settings()), /Minimum order/);
  assert.throws(() => priceCart([{ slug: "p", qty: 5 }], map(product({ track_stock: true, stock: 3 })), settings()), /Only 3/);
  assert.throws(() => priceCart([{ slug: "p", qty: 1 }], map(product({ track_stock: true, stock: 0 })), settings()), /out of stock/);
  assert.throws(() => priceCart([{ slug: "p", qty: 1 }], map(product({ price_paise: null })), settings()), /on request/);
  assert.throws(() => priceCart([{ slug: "p", qty: 1 }], map(product({ active: false })), settings()), /no longer available/);
  assert.throws(() => priceCart([{ slug: "p", qty: 1.5 }], map(product()), settings()), /valid quantity/);
  assert.throws(() => priceCart([], map(product()), settings()), /empty/);
});

test("variations: own price ignores slabs, unavailable variation is refused", () => {
  const p = product({ variants: [{ id: "red", label: "Red", price_paise: null, available: true }, { id: "gold", label: "Gold", price_paise: 15000, available: true }, { id: "blue", label: "Blue", price_paise: null, available: false }] });
  assert.equal(priceCart([{ slug: "p", variant: "red", qty: 20 }], map(p), settings()).lines[0].unit_paise, 9000);
  assert.equal(priceCart([{ slug: "p", variant: "gold", qty: 20 }], map(p), settings()).lines[0].unit_paise, 15000);
  assert.throws(() => priceCart([{ slug: "p", variant: "blue", qty: 1 }], map(p), settings()), /out of stock/);
  assert.throws(() => priceCart([{ slug: "p", qty: 1 }], map(p), settings()), /choose an option/);
});

test("bulk orders: only calculator products, bulk delivery charge", () => {
  assert.throws(() => priceCart([{ slug: "p", qty: 1 }], map(product()), settings(), { kind: "bulk" }), /bulk order calculator/);
  const q = priceCart([{ slug: "p", qty: 1 }], map(product({ bulk: true })), settings(), { kind: "bulk" });
  assert.equal(q.shipping_paise, 30000);
});

test("totals never go negative and round to whole paise", () => {
  const t = totals([{ qty: 3, unit_paise: 3333, gst_rate: 18 }], { gst_enabled: true, gst_inclusive: false, flat_paise: 0 });
  assert.equal(t.subtotal_paise, 9999);
  assert.equal(t.gst_paise, 1800);
  assert.ok(Number.isInteger(t.total_paise));
});

test("security: password hashing, Razorpay signature, HTML escaping", async () => {
  const h = hashPassword("a-long-password-123", { N: 1024 });
  assert.ok(verifyPassword("a-long-password-123", h));
  assert.ok(!verifyPassword("wrong", h));
  // Known HMAC-SHA256 test vector
  assert.equal(await hmacSha256Hex("key", "The quick brown fox jumps over the lazy dog"), "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");
  assert.equal(String(html`<p>${'<script>alert(1)</script>'}</p>`), "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
});

test("WhatsApp links and messages", () => {
  assert.equal(waUrl("+91 87270-02486", "Hi there"), "https://wa.me/918727002486?text=Hi%20there");
  const msg = cartMessage({ lines: [{ name: "Kulcha", variant_label: "", qty: 100, unit: "piece", unit_paise: 800, line_paise: 80000 }], subtotal_paise: 80000, gst_paise: 4000, shipping_paise: 0, total_paise: 84000 }, "WL-1");
  assert.match(msg, /Kulcha: 100 piece × ₹8 = ₹800/);
  assert.match(msg, /\*Total: ₹840\*/);
  assert.equal(thumbOf("https://cdn.shopify.com/a.jpg?v=1&width=900"), "https://cdn.shopify.com/a.jpg?v=1&width=400");
});
