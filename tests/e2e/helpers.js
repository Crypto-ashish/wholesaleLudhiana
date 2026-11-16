import { createHmac } from "node:crypto";
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "test-admin-password-123";
export const RZP_SECRET = process.env.E2E_RZP_SECRET || "e2e_local_test_secret";
export const sign = (orderId, paymentId, secret = RZP_SECRET) => createHmac("sha256", secret).update(orderId + "|" + paymentId).digest("hex");

// Replace Razorpay Checkout with a stub that records the options, so each
// outcome (success / failure / dismiss) can be driven from the test.
export async function stubRazorpay(page) {
  await page.route("https://checkout.razorpay.com/v1/checkout.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.Razorpay = function (opts) { window.__rzp = { opts, handlers: {} }; this.on = (ev, fn) => { window.__rzp.handlers[ev] = fn; }; this.open = () => { window.__rzp.opened = true; }; };`,
    })
  );
}

export function collectErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  return errors;
}

// Intercept window.open so WhatsApp links are captured instead of opened.
export async function captureWindowOpen(page) {
  await page.addInitScript(() => {
    window.__opened = [];
    window.open = (url) => { window.__opened.push(url || ""); return { closed: false, location: { set href(u) { window.__opened.push(u); } }, close() {} }; };
  });
}
export const openedUrls = (page) => page.evaluate(() => window.__opened.filter(Boolean));

export async function adminLogin(page) {
  await page.goto("/admin");
  await page.fill("input[name=password]", ADMIN_PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForSelector(".side nav");
}

export const CUSTOMER = { name: "Asha Test", phone: "9876543210", email: "asha@example.com", business: "Asha General Store", address: "12 Model Town Market, near bus stand", city: "Ludhiana", state: "Punjab", pincode: "141002" };

export async function fillCheckout(page, c = CUSTOMER) {
  for (const [k, v] of Object.entries(c)) await page.fill(`[data-checkout-form] [name=${k}]`, v);
}

// Signed-in admin API client (cookie + CSRF) for setting up and checking data.
export async function adminApi(request) {
  const login = await request.post("/api/admin/login", { data: { username: "admin", password: ADMIN_PASSWORD } });
  if (!login.ok()) throw new Error("admin login failed: " + login.status());
  const { csrf } = await login.json();
  const send = (method) => async (path, data) => {
    const res = await request.fetch("/api/admin" + path, { method, data, headers: { "X-CSRF-Token": csrf } });
    return { status: res.status(), body: await res.json().catch(() => ({})) };
  };
  return { get: send("GET"), post: send("POST"), put: send("PUT"), patch: send("PATCH"), del: send("DELETE") };
}
