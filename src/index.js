// Cloudflare Worker entry: security headers, routing, server-rendered pages,
// JSON APIs, sitemap/robots. Static files come from ./public (ASSETS).
import { json, HttpError, UserError, esc } from "./lib/util.js";
import { getSettings, listCategories, categoryTree, listProducts, getProduct, listTestimonials, listBanners, categoryCounts, SORT_KEYS } from "./lib/db.js";
import { requireAdmin, getSession, getAccount } from "./lib/auth.js";
import { layout } from "./render/layout.js";
import * as pages from "./render/pages.js";
import { invoicePage } from "./render/invoice.js";
import * as pub from "./api/public.js";
import * as admin from "./api/admin.js";

// ---------------------------------------------------------------- security headers
// No inline scripts or event handlers anywhere, so script-src stays strict.
// Inline style attributes are used, hence 'unsafe-inline' for styles only.
// Razorpay Checkout needs its script, frames and API.
function cspFor(env) {
  return [
    "default-src 'self'",
    "script-src 'self' https://checkout.razorpay.com",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    // Product photos may be hosted elsewhere (https links set in the admin panel).
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com",
    "frame-src https://api.razorpay.com https://checkout.razorpay.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

const BASE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), usb=(), interest-cohort=()",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
};

function secure(res, url, env, { html = false, cache = null, noindex = false } = {}) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(BASE_HEADERS)) out.headers.set(k, v);
  if (url.protocol === "https:") out.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if (html) out.headers.set("Content-Security-Policy", cspFor(env));
  if (cache) out.headers.set("Cache-Control", cache);
  if (noindex) out.headers.set("X-Robots-Tag", "noindex");
  return out;
}

function assetCache(path, search) {
  if (path.startsWith("/assets/fonts/")) return "public, max-age=31536000, immutable";
  if (/^\/assets\/(css|js)\//.test(path) && /[?&]v=\w+/.test(search)) return "public, max-age=31536000, immutable";
  if (path.startsWith("/assets/images/")) return "public, max-age=2592000, stale-while-revalidate=86400";
  if (path.startsWith("/assets/")) return "public, max-age=300, stale-while-revalidate=86400";
  return "public, max-age=86400";
}

// ---------------------------------------------------------------- page context
async function makeCtx(env, url, request) {
  const [settings, categories, account] = await Promise.all([getSettings(env), listCategories(env), getAccount(env, request)]);
  const origin = (env.SITE_URL || "").replace(/\/+$/, "") || url.origin;
  const assetV = (env.CF_VERSION_METADATA && env.CF_VERSION_METADATA.id ? env.CF_VERSION_METADATA.id : env.ASSET_VERSION || "dev").slice(0, 12);
  return { env, url, settings, categories, tree: categoryTree(categories), origin, assetV, account };
}

function htmlResponse(ctx, page, status = 200) {
  return new Response(layout(ctx, page), {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": page.noindex || ctx.account ? "no-store" : "public, max-age=0, must-revalidate" },
  });
}

async function notFound(ctx) {
  return htmlResponse(ctx, pages.notFoundPage(), 404);
}

const PER_PAGE = 24;
function listingQuery(url) {
  const sort = url.searchParams.get("sort") || "";
  const flag = url.searchParams.get("show") || "";
  return {
    q: (url.searchParams.get("q") || "").trim().slice(0, 80),
    sort: SORT_KEYS.includes(sort) ? sort : "featured",
    flag: ["featured", "deal", "new", "seasonal"].includes(flag) ? flag : "",
    page: Math.max(1, Math.min(500, parseInt(url.searchParams.get("page") || "1", 10) || 1)),
    perPage: PER_PAGE,
  };
}

// ---------------------------------------------------------------- SSR routes
async function renderPage(env, url, request) {
  const ctx = await makeCtx(env, url, request);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (path === "/") {
    const pick = (o) => listProducts(env, { perPage: 10, ...o }).then((r) => r.items);
    const [best, deals, fresh, bakery, seasonal, bulk, testimonials, heroes, offers, counts] = await Promise.all([
      pick({ flag: "featured" }), pick({ flag: "deal" }), pick({ flag: "new", sort: "newest" }), pick({ category: "bakery-food", perPage: 5 }),
      pick({ flag: "seasonal", perPage: 5 }), pick({ flag: "bulk", perPage: 6 }),
      listTestimonials(env), listBanners(env, "hero"), listBanners(env, "offer"), categoryCounts(env),
    ]);
    return htmlResponse(ctx, pages.homePage(ctx, { best, deals, fresh, bakery, seasonal, bulk, testimonials, heroBanner: heroes[0], offers, counts }));
  }
  if (path === "/shop") {
    const query = listingQuery(url);
    const res = await listProducts(env, query);
    return htmlResponse(ctx, pages.listingPage(ctx, { ...res, query }));
  }
  let m = path.match(/^\/shop\/([a-z0-9-]{1,90})(?:\/([a-z0-9-]{1,90}))?$/);
  if (m) {
    const category = ctx.tree.find((c) => c.slug === m[1]);
    if (!category) return notFound(ctx);
    const sub = m[2] ? category.children.find((c) => c.slug === m[2]) : null;
    if (m[2] && !sub) return notFound(ctx);
    const query = listingQuery(url);
    const [res, counts] = await Promise.all([listProducts(env, { ...query, category: category.slug, subcategory: sub ? sub.slug : undefined }), categoryCounts(env)]);
    return htmlResponse(ctx, pages.listingPage(ctx, { ...res, query, category, sub, counts }));
  }
  m = path.match(/^\/product\/([a-z0-9-]{1,90})$/);
  if (m) {
    const product = await getProduct(env, m[1]);
    if (!product) return notFound(ctx);
    const siblings = await listProducts(env, { category: product.category, subcategory: product.subcategory || undefined, perPage: 6 });
    return htmlResponse(ctx, pages.productPage(ctx, { product, related: siblings.items.filter((p) => p.slug !== product.slug).slice(0, 5) }));
  }
  if (path === "/langar-bhandara-bulk-orders") {
    const res = await listProducts(env, { flag: "bulk", perPage: 100, sort: "name" });
    return htmlResponse(ctx, pages.bulkPage(ctx, { products: res.items.filter((p) => p.price_paise !== null && !p.variants.length) }));
  }
  if (path === "/about") return htmlResponse(ctx, pages.aboutPage(ctx));
  if (path === "/contact") return htmlResponse(ctx, pages.contactPage(ctx));
  if (path === "/cart") return htmlResponse(ctx, pages.cartPage(ctx));
  if (path === "/wishlist") return htmlResponse(ctx, pages.wishlistPage(ctx));
  if (path === "/checkout") return htmlResponse(ctx, pages.checkoutPage(ctx));
  if (path === "/account") {
    const orders = ctx.account
      ? (await env.DB.prepare("SELECT ref, status, payment_status, payment_method, total_paise, created_at, kind FROM orders WHERE account_id = ?1 ORDER BY id DESC LIMIT 100").bind(ctx.account.id).all()).results
      : [];
    return htmlResponse(ctx, pages.accountPage(ctx, { orders }));
  }
  m = path.match(/^\/order\/(WL-[A-Z0-9]{4,12}-[A-Z0-9]{12})$/);
  if (m) {
    const order = await env.DB.prepare("SELECT * FROM orders WHERE ref = ?1").bind(m[1]).first();
    if (!order) return notFound(ctx);
    return htmlResponse(ctx, pages.orderPage(ctx, { order }));
  }
  const policyKey = path.slice(1);
  if (pages.POLICY_KEYS.includes(policyKey)) return htmlResponse(ctx, pages.policyPage(ctx, policyKey));
  if (path === "/admin") return adminShell(ctx);
  m = path.match(/^\/admin\/invoice\/(\d{1,9})$/);
  if (m) {
    // Printable invoice: admin only (session cookie).
    if (!(await getSession(env, request))) return Response.redirect(url.origin + "/admin", 302);
    const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?1").bind(Number(m[1])).first();
    if (!order) return notFound(ctx);
    return new Response(invoicePage(ctx, order), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return notFound(ctx);
}

function adminShell(ctx) {
  const v = esc(ctx.assetV);
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Admin — Wholesale Ludhiana</title><meta name="robots" content="noindex, nofollow"><link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/css/admin.css?v=${v}"></head>
<body><div id="admin" class="admin-root"><p class="admin-loading">Loading admin…</p></div>
<script type="module" src="/assets/js/admin.js?v=${v}"></script></body></html>`;
  return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

// Photos uploaded from the admin panel.
async function media(env, id) {
  const row = await env.DB.prepare("SELECT content_type, data FROM media WHERE id = ?1").bind(id).first();
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(row.data instanceof ArrayBuffer ? row.data : new Uint8Array(row.data), {
    headers: { "Content-Type": row.content_type, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}

// ---------------------------------------------------------------- sitemap & robots
async function sitemap(env, url) {
  const origin = (env.SITE_URL || "").replace(/\/+$/, "") || url.origin;
  const [categories, products] = await Promise.all([
    listCategories(env),
    env.DB.prepare("SELECT p.slug, p.name, p.image, p.updated_at FROM products p JOIN categories c ON c.slug = p.category WHERE p.active = 1 AND c.active = 1 ORDER BY p.id LIMIT 20000").all(),
  ]);
  const abs = (u) => (u.startsWith("http") ? u : origin + u);
  const entries = [
    ["/", "1.0", "daily"], ["/shop", "0.9", "daily"], ["/langar-bhandara-bulk-orders", "0.9", "weekly"],
    ["/about", "0.5", "monthly"], ["/contact", "0.5", "monthly"],
    ...pages.POLICY_KEYS.map((k) => ["/" + k, "0.2", "yearly"]),
    ...categories.map((c) => [c.parent ? "/shop/" + c.parent + "/" + c.slug : "/shop/" + c.slug, c.parent ? "0.7" : "0.8", "weekly"]),
  ].map(([loc, priority, freq]) => `<url><loc>${esc(origin + loc)}</loc><changefreq>${freq}</changefreq><priority>${priority}</priority></url>`);
  for (const p of products.results) {
    const img = p.image ? `<image:image><image:loc>${esc(abs(p.image))}</image:loc><image:title>${esc(p.name)}</image:title></image:image>` : "";
    const lastmod = /^\d{4}-\d{2}-\d{2}/.test(p.updated_at || "") ? `<lastmod>${p.updated_at.slice(0, 10)}</lastmod>` : "";
    entries.push(`<url><loc>${esc(origin + "/product/" + p.slug)}</loc>${lastmod}<changefreq>weekly</changefreq><priority>0.6</priority>${img}</url>`);
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${entries.join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}

function robots(env, url) {
  const origin = (env.SITE_URL || "").replace(/\/+$/, "") || url.origin;
  const txt = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /cart\nDisallow: /checkout\nDisallow: /order/\nDisallow: /account\nDisallow: /wishlist\n\nSitemap: ${origin}/sitemap.xml\n`;
  return new Response(txt, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}

// ---------------------------------------------------------------- API routing
function sameOrigin(request, url) {
  const origin = request.headers.get("Origin");
  if (!origin) return request.headers.get("Sec-Fetch-Site") !== "cross-site";
  try {
    return new URL(origin).host === url.host;
  } catch {
    return false;
  }
}

async function rateLimited(env, request, bucket) {
  const limiter = env.API_LIMITER;
  if (!limiter || typeof limiter.limit !== "function") return false;
  try {
    const { success } = await limiter.limit({ key: bucket + ":" + (request.headers.get("CF-Connecting-IP") || "local") });
    return !success;
  } catch {
    return false;
  }
}

const PUBLIC_POST = {
  "/api/cart/quote": { fn: pub.cartQuote, limit: false },
  "/api/checkout/place": { fn: pub.placeOrder, limit: true },
  "/api/checkout/verify": { fn: pub.verifyPayment, limit: true },
  "/api/checkout/failed": { fn: pub.paymentFailed, limit: true },
  "/api/enquiries": { fn: pub.createEnquiry, limit: true },
  "/api/account/register": { fn: pub.accountRegister, limit: true },
  "/api/account/login": { fn: pub.accountLogin, limit: true },
  "/api/account/logout": { fn: pub.accountLogout, limit: false },
};

async function adminRoute(request, env, url) {
  const p = url.pathname.slice("/api/admin".length);
  const method = request.method;
  if (p === "/login" && method === "POST") {
    if (await rateLimited(env, request, "login")) return json(429, { error: "Too many requests. Please wait a minute." }, { "Retry-After": "60" });
    return admin.login(request, env);
  }
  if (p === "/session" && method === "GET") return admin.session(request, env);

  // Authentication + CSRF middleware: runs before every other admin handler.
  await requireAdmin(env, request);

  if (p === "/logout" && method === "POST") return admin.logout(request, env);
  if (p === "/dashboard" && method === "GET") return admin.dashboard(request, env);
  if (p === "/reports" && method === "GET") return admin.reports(request, env, url);
  if (p === "/payment-check" && method === "GET") return admin.paymentCheck(request, env);
  if (p === "/media" && method === "POST") return admin.uploadMedia(request, env);
  if (p === "/products") {
    if (method === "GET") return admin.listProductsAdmin(request, env, url);
    if (method === "POST") return admin.createProduct(request, env);
  }
  if (p === "/products/export" && method === "GET") return admin.exportProducts(request, env);
  if (p === "/products/import" && method === "POST") return admin.importProducts(request, env);
  let m = p.match(/^\/products\/(\d{1,9})$/);
  if (m) {
    const id = Number(m[1]);
    if (method === "GET") return admin.getProductAdmin(request, env, id);
    if (method === "PUT") return admin.updateProduct(request, env, id);
    if (method === "PATCH") return admin.patchProduct(request, env, id);
    if (method === "DELETE") return admin.deleteProduct(request, env, id);
  }
  if (p === "/categories") {
    if (method === "GET") return admin.listCategoriesAdmin(request, env);
    if (method === "POST") return admin.createCategory(request, env);
  }
  m = p.match(/^\/categories\/([a-z0-9-]{1,90})$/);
  if (m) {
    if (method === "PUT") return admin.updateCategory(request, env, m[1]);
    if (method === "DELETE") return admin.deleteCategory(request, env, m[1]);
  }
  if (p === "/orders" && method === "GET") return admin.listOrders(request, env, url);
  if (p === "/orders/export" && method === "GET") return admin.exportOrders(request, env, url);
  m = p.match(/^\/orders\/(\d{1,9})$/);
  if (m && method === "GET") return admin.getOrder(request, env, Number(m[1]));
  if (m && method === "PATCH") return admin.updateOrder(request, env, Number(m[1]));
  if (p === "/customers" && method === "GET") return admin.listCustomers(request, env, url);
  if (p === "/customer" && method === "GET") return admin.getCustomer(request, env, url);
  if (p === "/enquiries" && method === "GET") return admin.listEnquiries(request, env, url);
  m = p.match(/^\/enquiries\/(\d{1,9})$/);
  if (m) {
    if (method === "PATCH") return admin.updateEnquiry(request, env, Number(m[1]));
    if (method === "DELETE") return admin.deleteEnquiry(request, env, Number(m[1]));
  }
  m = p.match(/^\/(testimonials|banners|coupons)(?:\/(\d{1,9}))?$/);
  if (m) {
    const [, table, id] = m;
    if (!id && method === "GET") return admin.listRows(request, env, table);
    if (!id && method === "POST") return admin.createRow(request, env, table);
    if (id && method === "PUT") return admin.updateRow(request, env, table, Number(id));
    if (id && method === "DELETE") return admin.deleteRow(request, env, table, Number(id));
  }
  if (p === "/settings" && method === "GET") return admin.getAllSettings(request, env);
  m = p.match(/^\/settings\/([a-z]{2,20})$/);
  if (m && method === "PUT") return admin.putSettings(request, env, m[1]);
  throw new HttpError(404, "Not found");
}

async function handleApi(request, env, url) {
  try {
    if (url.pathname === "/api/health") {
      return json(200, { ok: true, payments_configured: pub.paymentsConfigured(env) });
    }
    if (url.pathname === "/api/razorpay-webhook") {
      if (request.method !== "POST") return json(405, { error: "Method not allowed" }, { Allow: "POST" });
      return await pub.razorpayWebhook(request, env);
    }
    if (request.method !== "GET" && !sameOrigin(request, url)) return json(403, { error: "Forbidden" });
    if (url.pathname.startsWith("/api/admin/")) return await adminRoute(request, env, url);
    const route = PUBLIC_POST[url.pathname];
    if (!route) return json(404, { error: "Not found" });
    if (request.method !== "POST") return json(405, { error: "Method not allowed" }, { Allow: "POST" });
    if (route.limit && (await rateLimited(env, request, url.pathname))) {
      return json(429, { error: "Too many requests. Please wait a minute and try again." }, { "Retry-After": "60" });
    }
    return await route.fn(request, env);
  } catch (e) {
    if (e instanceof UserError) return json(400, { error: e.message });
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    console.error("api error", url.pathname, e && e.stack);
    return json(500, { error: "Something went wrong. Please try again." });
  }
}

// ---------------------------------------------------------------- entry
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return secure(await handleApi(request, env, url), url, env, { noindex: true });
      if (url.pathname === "/sitemap.xml") return secure(await sitemap(env, url), url, env);
      if (url.pathname === "/robots.txt") return secure(robots(env, url), url, env);

      const mm = url.pathname.match(/^\/media\/([0-9a-f]{32})$/);
      if (mm) return secure(await media(env, mm[1]), url, env);

      // Static files (anything with an extension) come from ./public.
      if (/\.[a-z0-9]{2,5}$/i.test(url.pathname)) {
        const res = await env.ASSETS.fetch(request);
        return secure(res, url, env, { cache: res.status === 200 ? assetCache(url.pathname, url.search) : null });
      }
      if (request.method !== "GET" && request.method !== "HEAD") return secure(new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } }), url, env);
      // Canonical URLs have no trailing slash.
      if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
        return Response.redirect(url.origin + url.pathname.replace(/\/+$/, "") + url.search, 301);
      }
      const res = await renderPage(env, url, request);
      const noindex = url.pathname.startsWith("/admin") || res.status === 404;
      return secure(res, url, env, { html: true, noindex });
    } catch (e) {
      console.error("page error", url.pathname, e && e.stack);
      return secure(new Response("<!doctype html><title>Something went wrong</title><p style=\"font-family:sans-serif;padding:2rem\">Something went wrong. Please refresh the page.</p>", { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }), url, env, { html: true });
    }
  },
};
