import { test, expect } from "@playwright/test";
import { adminLogin, adminApi, collectErrors, CUSTOMER } from "./helpers.js";

test.describe.configure({ mode: "serial" });
test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== "desktop", "admin tests change shared data; run once"));

test("admin API is closed without a login and needs the CSRF token", async ({ request, playwright }) => {
  const anon = await playwright.request.newContext({ baseURL: "http://localhost:" + (process.env.E2E_PORT || 8787) });
  for (const path of ["/api/admin/dashboard", "/api/admin/products", "/api/admin/orders", "/api/admin/settings", "/api/admin/products/export"]) {
    expect((await anon.get(path)).status(), path).toBe(401);
  }
  expect((await anon.post("/api/admin/products", { data: { name: "Hack" } })).status()).toBe(401);
  expect((await anon.delete("/api/admin/products/1")).status()).toBe(401);
  expect((await anon.post("/api/admin/login", { data: { username: "admin", password: "wrong-password" } })).status()).toBe(401);
  expect((await anon.get("/admin/invoice/1", { maxRedirects: 0 })).status()).toBe(302);
  await adminApi(request); // signed in, but no CSRF header:
  expect((await request.post("/api/admin/products", { data: { name: "No CSRF", category: "bakery-food" } })).status()).toBe(403);
});

test("product management in the admin panel: add with slabs, edit, see on the website, delete", async ({ page }) => {
  const errors = collectErrors(page);
  const name = "E2E Atta Biscuit " + Date.now();
  await adminLogin(page);
  await page.click('a[data-nav="products"]');
  await page.click('a[href="#product/new"]');
  await page.fill("[data-product] [name=name]", name);
  await page.selectOption("[data-product] [name=category]", "bakery-food");
  await page.selectOption("[data-product] [name=subcategory]", "atta-biscuits");
  await page.fill("[data-product] [name=price]", "100");
  await page.fill("[data-product] [name=mrp]", "140");
  await page.selectOption("[data-product] [name=unit]", "packet");
  await page.fill("[data-product] [name=moq]", "5");
  for (const [min, price] of [["11", "90"], ["51", "80"]]) {
    await page.click("[data-tiers] [data-add]");
    await page.locator("[data-tiers] .rrow").last().locator("[data-k=min]").fill(min);
    await page.locator("[data-tiers] .rrow").last().locator("[data-k=price]").fill(price);
  }
  await page.click("[data-specs] [data-add]");
  await page.locator("[data-specs] [data-k=k]").fill("Weight");
  await page.locator("[data-specs] [data-k=v]").fill("400 g");
  await page.check("[data-product] [name=deal]");
  await page.click("[data-product] button[type=submit]");
  await expect(page.locator(".flash")).toHaveText("Product added");
  await expect(page).toHaveURL(/#product\/\d+/);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  await page.goto("/product/" + slug);
  await expect(page.locator("h1")).toHaveText(name);
  await expect(page.locator(".slab-table tbody tr")).toHaveCount(3);
  await expect(page.locator(".slab-table")).toContainText("11 – 50");
  await expect(page.locator(".spec")).toContainText("400 g");
  await expect(page.locator(".pp-main .badge")).toContainText("29% off MRP");
  // quick price edit from the list
  await page.goto("/admin#products");
  await page.fill("[data-filters] [name=q]", name);
  await page.click("[data-filters] button");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.fill('tbody [data-quick="price"]', "120");
  await page.press('tbody [data-quick="price"]', "Enter");
  await expect(page.locator(".flash")).toHaveText("Saved");
  await page.goto("/product/" + slug);
  await expect(page.locator(".pp-price .price")).toContainText("₹120");
  // delete
  await page.goto("/admin#products");
  await page.fill("[data-filters] [name=q]", name);
  await page.click("[data-filters] button");
  page.once("dialog", (d) => d.accept());
  await page.click("tbody [data-del]");
  await expect(page.locator(".flash")).toHaveText("Product deleted");
  expect((await page.goto("/product/" + slug)).status()).toBe(404);
  expect(errors.filter((e) => !/40[14]/.test(e))).toEqual([]);
});

test("inventory, coupons and order management: stock falls on order, returns on cancel; invoice prints", async ({ page, request }) => {
  const api = await adminApi(request);
  const stamp = Date.now();
  const made = await api.post("/products", { name: "E2E Stock Item " + stamp, category: "car-accessories", subcategory: "car-perfumes", price: "200", unit: "piece", moq: 2, track_stock: true, stock: 20, low_stock: 15, gst_rate: 18, tiers: [{ min: 10, price: "180" }] });
  expect(made.status).toBe(200);
  const code = "E2E" + String(stamp).slice(-6);
  expect((await api.post("/coupons", { code, type: "percent", value: 10, min: "500", active: true })).status).toBe(200);
  // too much for the stock
  const over = await (await request.post("/api/cart/quote", { data: { items: [{ slug: made.body.slug, qty: 25 }] } })).json();
  expect(over.error).toMatch(/Only 20/);
  // order 10 with the coupon: 10 × 180 = 1800, −10% = 1620, GST 18% = 291.60, total 1911.60
  const placed = await request.post("/api/checkout/place", { data: { items: [{ slug: made.body.slug, qty: 10 }], coupon: code, method: "cod", customer: { ...CUSTOMER, gstin: "03ABCDE1234F1Z5", billing_different: true, billing_address: "Billing office, Mall Road", billing_city: "Ludhiana", billing_state: "Punjab", billing_pincode: "141001" } } });
  expect(placed.status()).toBe(200);
  const { ref, quote } = await placed.json();
  expect(quote.subtotal_paise).toBe(180000);
  expect(quote.discount_paise).toBe(18000);
  expect(quote.gst_paise).toBe(29160);
  expect(quote.total_paise).toBe(191160);
  expect((await api.get("/products/" + made.body.id)).body.product.stock).toBe(10);
  expect((await api.get("/products?low=1&q=" + stamp)).body.products.map((p) => p.id)).toEqual([made.body.id]); // low-stock alert
  expect((await api.get("/dashboard")).body.low_stock.length).toBeGreaterThan(0);
  expect((await api.get("/coupons")).body.rows.find((c) => c.code === code).used).toBe(1);

  // order management in the panel
  await adminLogin(page);
  await page.goto("/admin#orders/pending");
  await page.fill("[data-filters] [name=q]", ref);
  await page.click("[data-filters] button");
  await page.click("tbody a.btn");
  await expect(page.locator("h1")).toHaveText("Order " + ref);
  await expect(page.locator(".main")).toContainText("Billing office, Mall Road");
  await expect(page.locator(".main")).toContainText("03ABCDE1234F1Z5");
  await page.selectOption("[data-status] [name=status]", "dispatched");
  await page.selectOption("[data-status] [name=payment_status]", "paid");
  await page.click("[data-status] button");
  await expect(page.locator(".flash")).toHaveText("Order updated");
  await page.goto("/order/" + ref);
  await expect(page.locator(".order-meta")).toContainText("Dispatched");
  await expect(page.locator("h1")).toContainText("Payment received");
  // invoice
  const id = (await api.get("/orders?q=" + ref)).body.orders[0].id;
  await page.goto("/admin/invoice/" + id);
  await expect(page.locator("h2")).toHaveText("TAX INVOICE");
  await expect(page.locator(".inv")).toContainText("03ABCDE1234F1Z5");
  await expect(page.locator(".totals .grand")).toContainText("₹1,911.60");
  // customers + reports
  const cust = await api.get("/customers?q=" + CUSTOMER.phone);
  expect(cust.body.customers[0].orders).toBeGreaterThan(0);
  const rep = await api.get("/reports");
  expect(rep.body.daily[0].revenue).toBeGreaterThan(0);
  expect(rep.body.best_sellers.length).toBeGreaterThan(0);
  const csv = await (await request.get("/api/admin/orders/export")).text();
  expect(csv).toContain(ref);
  // cancel → stock comes back
  expect((await api.patch("/orders/" + id, { status: "cancelled" })).status).toBe(200);
  expect((await api.get("/products/" + made.body.id)).body.product.stock).toBe(20);
  await api.del("/products/" + made.body.id);
});

test("CSV export / import, categories, settings (WhatsApp number, GST, delivery) and payment toggles", async ({ page, request }) => {
  const api = await adminApi(request);
  const csv = await (await request.get("/api/admin/products/export")).text();
  expect(csv.split("\r\n")[0]).toContain("slug,name,category,subcategory");
  expect(csv).toContain("kulcha-langar-pack");
  // import: one new row and one update
  const stamp = Date.now();
  const imp = await api.post("/products/import", { rows: [
    { name: "E2E Imported Seat Cover " + stamp, category: "car-accessories", subcategory: "seat-covers", unit: "set", moq: "2", price: "950", slabs: "10:900|25:850", specs: "Material:Leatherette", variants: "Black|Beige:1000", active: "1" },
    { slug: "namkeen-mix-bulk", name: "Namkeen Mix (Bulk)", category: "langar-bhandara", subcategory: "namkeen-langar", unit: "kg", moq: "5", price: "180", slabs: "25:170|100:160", bulk: "1", gst_rate: "5", active: "1" },
  ] });
  expect(imp.body).toMatchObject({ created: 1, updated: 1 });
  const found = (await api.get("/products?q=" + stamp)).body.products[0];
  expect(found.tiers).toEqual([{ min: 10, price_paise: 90000 }, { min: 25, price_paise: 85000 }]);
  expect(found.variants.map((v) => v.price_paise)).toEqual([null, 100000]);
  const badImp = await api.post("/products/import", { rows: [{ name: "Bad row", category: "no-such-category" }] });
  expect(badImp.status).toBe(400);
  expect(badImp.body.error).toMatch(/Row 2/);
  await api.del("/products/" + found.id);
  // categories
  const cat = await api.post("/categories", { name: "E2E Gift Items " + stamp, parent: "car-accessories" });
  expect(cat.status).toBe(200);
  await page.goto("/shop/car-accessories/" + cat.body.slug);
  await expect(page.locator("h1")).toContainText("E2E Gift Items");
  expect((await api.del("/categories/" + cat.body.slug)).status).toBe(200);

  // settings through the panel: WhatsApp number
  const before = (await api.get("/settings")).body.settings;
  await adminLogin(page);
  await page.click('a[data-nav="settings"]');
  await page.fill('[data-settings="store"] [name=whatsapp]', "919999900000");
  await page.click('[data-settings="store"] button');
  await expect(page.locator(".flash")).toHaveText("Saved");
  await page.goto("/");
  await expect(page.locator("a.wa-float")).toHaveAttribute("href", /wa\.me\/919999900000/);
  await api.put("/settings/store", before.store);
  // GST + delivery settings change the totals
  await api.put("/settings/gst", { enabled: true, default_rate: 12, inclusive: false });
  await api.put("/settings/shipping", { flat: "150", free_above: "5000", bulk_flat: "300", note: before.shipping.note });
  let q = await (await request.post("/api/cart/quote", { data: { items: [{ slug: "paper-cups-pack-of-100", qty: 5 }] } })).json();
  expect(q.quote.shipping_paise).toBe(15000);
  q = await (await request.post("/api/cart/quote", { data: { items: [{ slug: "paper-cups-pack-of-100", qty: 100 }] } })).json();
  expect(q.quote.shipping_paise).toBe(0); // 100 × ₹60 = ₹6,000 ≥ ₹5,000
  await api.put("/settings/gst", { enabled: before.gst.enabled, default_rate: before.gst.default_rate, inclusive: before.gst.inclusive });
  await api.put("/settings/shipping", { flat: "", free_above: "", bulk_flat: "", note: before.shipping.note });
  // payment toggles: COD off → not offered; bank transfer appears once details are saved
  await api.put("/settings/payments", { razorpay: true, upi: true, cod: false, bank: true, bank_account_name: "Wholesale Ludhiana", bank_account_number: "1234567890", bank_ifsc: "SBIN0001234", bank_name: "SBI" });
  q = await (await request.post("/api/cart/quote", { data: { items: [{ slug: "paper-cups-pack-of-100", qty: 5 }] } })).json();
  expect(q.payments).toMatchObject({ razorpay: true, cod: false, bank: true, upi: true });
  await api.put("/settings/payments", { razorpay: true, upi: true, cod: true, bank: true });
  // banners + testimonials appear on the homepage
  const t = await api.post("/testimonials", { name: "E2E Retailer", location: "Ludhiana", text: "Good rates and quick dispatch.", rating: 5, active: true });
  const b = await api.post("/banners", { placement: "offer", title: "E2E Winter Offer", subtitle: "Extra 5% on woollens", cta_url: "/shop/woollen-wear", active: true });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What Our Customers Say" })).toBeVisible();
  await expect(page.locator(".offer-card")).toContainText("E2E Winter Offer");
  await api.del("/testimonials/" + t.body.id);
  await api.del("/banners/" + b.body.id);
});

test("admin dashboard and pages render on a phone-sized screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  const errors = collectErrors(page);
  await page.goto("/admin");
  await page.fill("input[name=password]", "test-admin-password-123");
  await page.click("button[type=submit]");
  await expect(page.locator("h1")).toHaveText("Dashboard");
  for (const id of ["orders", "products", "categories", "bulk", "customers", "coupons", "banners", "testimonials", "enquiries", "reports", "settings"]) {
    await page.click("[data-menu]");
    await page.click(`a[data-nav="${id}"]`);
    await expect(page.locator(".main h1")).toBeVisible();
    await expect(page.locator(".admin-loading")).toHaveCount(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(errors.filter((e) => !/401/.test(e))).toEqual([]);
});
