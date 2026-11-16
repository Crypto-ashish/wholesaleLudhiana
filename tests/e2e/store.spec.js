import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";
import { stubRazorpay, collectErrors, captureWindowOpen, openedUrls, sign, fillCheckout, CUSTOMER } from "./helpers.js";

const WA = "918727002486";

async function addKulcha(page, qty) {
  await page.goto("/product/kulcha-langar-pack");
  await page.fill("#pp-qty", String(qty));
  await page.click("[data-add-to-cart]");
  await expect(page.locator("[data-cart-count]").first()).toHaveText("1");
}

test("homepage: sections, header tools, WhatsApp button and SEO tags", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("Buy Wholesale Products at Wholesale Prices.");
  for (const h of ["Shop by Categories", "Best Selling Products", "Wholesale Deals", "New Arrivals", "Bakery & Food Specials", "Langar & Bhandara Bulk Orders", "Winter Collection", "Why Buy From Us?"]) {
    await expect(page.getByRole("heading", { name: h })).toBeVisible();
  }
  await expect(page.locator(".wl-cats .cat-tile")).toHaveCount(8);
  await expect(page.locator("header [role=search] input[name=q]")).toBeVisible();
  for (const label of ["Login or register", "Wishlist"]) await expect(page.locator(`header a[aria-label="${label}"]`)).toBeVisible();
  await expect(page.locator("header [data-cart-open]")).toBeVisible();
  await expect(page.locator("a.wa-float")).toHaveAttribute("href", new RegExp("^https://wa\\.me/" + WA));
  await expect(page.locator("link[rel=canonical]")).toHaveAttribute("href", /\/$/);
  await expect(page.locator("meta[name=description]")).toHaveAttribute("content", /wholesale products in Ludhiana/i);
  expect(await page.locator('script[type="application/ld+json"]').count()).toBeGreaterThan(1);
  expect(await page.locator("img:not([alt])").count()).toBe(0);
  expect(errors).toEqual([]);
});

test("category pages, subcategories, search, sort and pagination", async ({ page }) => {
  await page.goto("/shop/makeup-cosmetics");
  await expect(page.locator("h1")).toHaveText("Makeup & Cosmetics Wholesale");
  await expect(page).toHaveTitle(/Makeup & Cosmetics Wholesale in Ludhiana/);
  await expect(page.locator(".product-card")).toHaveCount(24);
  await page.click(".pagination a[rel=next]");
  await expect(page).toHaveURL(/page=2/);
  await page.goto("/shop/makeup-cosmetics/lipsticks?sort=price-asc");
  await expect(page.locator("h1")).toHaveText("Lipsticks Wholesale");
  const prices = await page.locator(".product-card .price").evaluateAll((els) => els.map((e) => Number((e.textContent.match(/₹([\d,]+)/) || [0, "0"])[1].replace(/,/g, ""))).filter(Boolean));
  expect(prices.slice(0, 5)).toEqual([...prices.slice(0, 5)].sort((a, b) => a - b));
  await page.goto("/");
  await page.fill("header input[name=q]", "samosa");
  await page.press("header input[name=q]", "Enter");
  await expect(page).toHaveURL(/\/shop\?q=samosa/);
  await expect(page.locator(".product-card")).toHaveCount(1);
  await expect(page.locator(".pc-title")).toContainText("Samosa");
  const res = await page.goto("/shop/no-such-category");
  expect(res.status()).toBe(404);
});

test("product page: slab table, live quantity pricing, product schema, WhatsApp enquiry", async ({ page }) => {
  await page.goto("/product/kulcha-langar-pack");
  await expect(page.locator(".slab-table tbody tr")).toHaveCount(3);
  await expect(page.locator(".pp-meta")).toContainText("Minimum order: 50 pieces");
  await expect(page.locator("[data-live-price]")).toContainText("50 × ₹8 = ₹400");
  await page.fill("#pp-qty", "200");
  await expect(page.locator("[data-live-price]")).toContainText("200 × ₹7.50 = ₹1,500");
  await expect(page.locator(".slab-table tr.is-on")).toContainText("200 – 499");
  await page.fill("#pp-qty", "500");
  await expect(page.locator("[data-live-price]")).toContainText("500 × ₹7 = ₹3,500");
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(JSON.parse(ld)["@type"]).toBe("Product");
  expect(JSON.parse(ld).offers.lowPrice).toBe("7.00");
  await expect(page.locator(".pp-info [data-wa-enquiry]")).toHaveAttribute("href", new RegExp("wa\\.me/" + WA + "\\?text=.*Kulcha"));
  // price-on-request product cannot be added to the cart
  await page.goto("/product/frontier-almond-biscotti");
  await expect(page.locator("[data-add-to-cart]")).toHaveCount(0);
  await expect(page.locator(".pp-info .notice")).toContainText("price on request");
});

test("cart: quantity changes re-price by slab, GST, remove, wishlist, share on WhatsApp", async ({ page }) => {
  await captureWindowOpen(page);
  await addKulcha(page, 100);
  await page.goto("/cart");
  await expect(page.locator("[data-sum-subtotal]")).toHaveText("₹800");
  await expect(page.locator("[data-sum-gst]")).toHaveText("₹40");
  await expect(page.locator("[data-sum-total]")).toHaveText("₹840");
  await expect(page.locator(".cl-tip")).toContainText("Buy 200+");
  await page.fill("[data-line-qty]", "200");
  await page.locator("[data-line-qty]").blur();
  await expect(page.locator("[data-sum-subtotal]")).toHaveText("₹1,500");
  await expect(page.locator("[data-sum-total]")).toHaveText("₹1,575");
  // below the minimum snaps back to the minimum order quantity
  await page.fill("[data-line-qty]", "3");
  await page.locator("[data-line-qty]").blur();
  await expect(page.locator("[data-line-qty]")).toHaveValue("50");
  await page.fill("#coupon-code", "NOSUCHCODE");
  await page.click("[data-coupon-form] button");
  await expect(page.locator("[data-coupon-msg]")).toContainText("not valid");
  await page.click("[data-coupon-form] button"); // remove it again
  await page.click("[data-cart-wa]");
  const urls = await openedUrls(page);
  expect(decodeURIComponent(urls[0])).toContain("Kulcha (Langar Pack): 50 piece × ₹8 = ₹400");
  expect(urls[0]).toContain("wa.me/" + WA);
  await page.click("[data-line-remove]");
  await expect(page.locator("[data-cart-lines]")).toContainText("Your cart is empty");
  // wishlist
  await page.goto("/shop?q=samosa");
  await page.click(".product-card .wish-btn");
  await page.goto("/wishlist");
  await expect(page.locator("[data-wishlist] .product-card")).toHaveCount(1);
});

test("checkout with cash on delivery saves the order with server-side totals", async ({ page }) => {
  await addKulcha(page, 100);
  await page.goto("/checkout");
  await expect(page.locator("[data-sum-total]")).toHaveText("₹840");
  await page.click("[data-pay]"); // empty form → validation
  await expect(page.locator(".field-msg").first()).toBeVisible();
  await fillCheckout(page);
  await page.check("input[name=method][value=cod]");
  await expect(page.locator("[data-pay]")).toHaveText("Place Order — ₹840");
  await page.click("[data-pay]");
  await expect(page).toHaveURL(/\/order\/WL-/);
  await expect(page.locator("h1")).toContainText("pay on delivery");
  await expect(page.locator("[data-order-total]")).toHaveText("₹840");
  await expect(page.locator(".order-meta")).toContainText("Cash on delivery — Not paid yet");
  await page.goto("/cart");
  await expect(page.locator("[data-cart-lines]")).toContainText("Your cart is empty");
});

test("Razorpay: order is paid only after the server verifies the signature", async ({ page, request }) => {
  await stubRazorpay(page);
  await addKulcha(page, 50);
  await page.goto("/checkout");
  await fillCheckout(page);
  await page.check("input[name=method][value=razorpay]");
  await expect(page.locator("[data-pay]")).toHaveText("Pay ₹420 Securely");
  await page.click("[data-pay]");
  await page.waitForFunction(() => window.__rzp && window.__rzp.opened);
  const opts = await page.evaluate(() => ({ order_id: window.__rzp.opts.order_id, amount: window.__rzp.opts.amount, ref: window.__rzp.opts.notes.order_ref }));
  expect(opts.amount).toBe(42000);
  // not paid yet
  await expect((await request.get("/order/" + opts.ref)).text()).resolves.toContain("Awaiting payment");
  // forged signature is rejected and the order stays unpaid
  const bad = await request.post("/api/checkout/verify", { data: { ref: opts.ref, razorpay_order_id: opts.order_id, razorpay_payment_id: "pay_forged", razorpay_signature: "a".repeat(64) } });
  expect(bad.status()).toBe(400);
  await expect((await request.get("/order/" + opts.ref)).text()).resolves.toContain("Awaiting payment");
  // genuine signature → paid
  await page.evaluate(({ order_id, signature }) => window.__rzp.opts.handler({ razorpay_order_id: order_id, razorpay_payment_id: "pay_e2e123", razorpay_signature: signature }), { order_id: opts.order_id, signature: sign(opts.order_id, "pay_e2e123") });
  await expect(page).toHaveURL(new RegExp("/order/" + opts.ref));
  await expect(page.locator("h1")).toContainText("Payment received");
  await expect(page.locator("[data-payment-id]")).toHaveText("pay_e2e123");
});

test("Langar & Bhandara calculator: totals, slabs, submit order and WhatsApp enquiry", async ({ page }) => {
  await captureWindowOpen(page);
  await page.goto("/langar-bhandara-bulk-orders");
  await expect(page.locator("[data-bulk-submit]")).toBeDisabled();
  const row = (slug) => page.locator(`[data-row="${slug}"]`);
  await row("kulcha-langar-pack").locator("[data-bulk-qty]").fill("500");
  await row("samosa-langar-pack").locator("[data-bulk-qty]").fill("200");
  await row("disposable-plates-pack-of-100").locator("[data-bulk-qty]").fill("5");
  await row("disposable-plates-pack-of-100").locator("[data-bulk-qty]").blur();
  await expect(row("kulcha-langar-pack").locator("[data-row-total]")).toHaveText("₹3,500");
  await expect(row("samosa-langar-pack").locator("[data-row-total]")).toHaveText("₹1,800");
  await expect(page.locator(".bulk-summary [data-sum-subtotal]")).toHaveText("₹5,900");
  await expect(page.locator(".bulk-summary [data-sum-gst]")).toHaveText("₹295");
  await expect(page.locator(".bulk-summary [data-sum-total]")).toHaveText("₹6,195");
  const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const details = { name: CUSTOMER.name, phone: CUSTOMER.phone, event_name: "Gurpurab Langar", event_date: tomorrow, people: "800", address: "Gurudwara Sahib, Model Town", pincode: "141002" };
  for (const [k, v] of Object.entries(details)) await page.fill(`[data-bulk-form] [name=${k}]`, v);
  await page.click("[data-bulk-wa]");
  const msg = decodeURIComponent((await openedUrls(page))[0]);
  expect(msg).toContain("Gurpurab Langar");
  expect(msg).toContain("*Total: ₹6,195*");
  await page.click("[data-bulk-submit]");
  await expect(page).toHaveURL(/\/order\/WL-/);
  await expect(page.locator("h1")).toHaveText("Bulk order received");
  await expect(page.locator("[data-order-total]")).toHaveText("₹6,195");
});

test("server ignores tampered prices and enforces minimum quantities", async ({ request }) => {
  const q = await (await request.post("/api/cart/quote", { data: { items: [{ slug: "kulcha-langar-pack", qty: 100, price: 1, unit_paise: 1 }] } })).json();
  expect(q.quote.total_paise).toBe(84000);
  const low = await (await request.post("/api/cart/quote", { data: { items: [{ slug: "kulcha-langar-pack", qty: 2 }] } })).json();
  expect(low.ok).toBe(false);
  expect(low.error).toMatch(/Minimum order/);
  const por = await (await request.post("/api/cart/quote", { data: { items: [{ slug: "frontier-almond-biscotti", qty: 5 }] } })).json();
  expect(por.ok).toBe(false);
});

test("webhook: a correctly signed Razorpay event marks the order paid; a bad one is refused", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  const place = await request.post("/api/checkout/place", { data: { items: [{ slug: "samosa-langar-pack", qty: 50 }], method: "razorpay", customer: CUSTOMER } });
  const order = await place.json();
  expect(order.online).toBe(true);
  const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_hook1", order_id: order.order_id } } } });
  const badRes = await request.post("/api/razorpay-webhook", { data: body, headers: { "Content-Type": "application/json", "X-Razorpay-Signature": "b".repeat(64) } });
  expect(badRes.status()).toBe(400);
  const sig = createHmac("sha256", "e2e_local_webhook_secret").update(body).digest("hex");
  const ok = await request.post("/api/razorpay-webhook", { data: body, headers: { "Content-Type": "application/json", "X-Razorpay-Signature": sig, "X-Razorpay-Event-Id": "evt_" + Date.now() } });
  expect(ok.status()).toBe(200);
  await expect((await request.get("/order/" + order.ref)).text()).resolves.toContain("Payment received");
});

test("SEO files, static pages, security headers and customer accounts", async ({ page, request }, testInfo) => {
  const sm = await (await request.get("/sitemap.xml")).text();
  expect(sm).toContain("/shop/bakery-food</loc>");
  expect(sm).toContain("/shop/makeup-cosmetics/lipsticks</loc>");
  expect(sm).toContain("/product/kulcha-langar-pack</loc>");
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Sitemap:");
  expect(robots).toContain("Disallow: /admin");
  for (const path of ["/about", "/contact", "/shipping-policy", "/refund-policy", "/privacy-policy", "/terms", "/shop?show=deal"]) {
    const res = await page.goto(path);
    expect(res.status(), path).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
  }
  const home = await request.get("/");
  expect(home.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(home.headers()["x-content-type-options"]).toBe("nosniff");
  // account: register, see account page, sign out
  const phone = "98" + String(Date.now()).slice(-7) + (testInfo.project.name === "desktop" ? "1" : "2");
  await page.goto("/account");
  await page.fill("[data-account-form=register] [name=name]", "Ravi Shop");
  await page.fill("[data-account-form=register] [name=phone]", phone);
  await page.fill("[data-account-form=register] [name=password]", "retailer-pass-1");
  await page.click("[data-account-form=register] button[type=submit]");
  await expect(page.locator("h1")).toHaveText("My Account");
  await expect(page.locator(".page-hero")).toContainText(phone);
  await page.click("[data-logout]");
  await expect(page.locator("h1")).toHaveText("Login or Register");
});

test("mobile: menu drawer and sticky search", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile only");
  await page.goto("/");
  await page.click("[data-nav-toggle]");
  await expect(page.locator("#site-nav")).toHaveClass(/is-open/);
  await page.locator("#site-nav a", { hasText: "Woollen Wear" }).first().click();
  await expect(page).toHaveURL(/\/shop\/woollen-wear/);
  await page.evaluate(() => window.scrollTo(0, 1500));
  await expect(page.locator("header input[name=q]")).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
