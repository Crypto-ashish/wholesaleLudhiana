// Page shell: <head> SEO tags, header (logo, search, account, wishlist, cart),
// category navigation, cart drawer, footer and the floating WhatsApp button.
import { html, raw, jsonLd } from "./html.js";
import { icon, waLink } from "./components.js";

const WA_HELLO = "Hello Wholesale Ludhiana! I'd like to know more about your wholesale products.";

function logo() {
  return html`<a class="logo" href="/" aria-label="Wholesale Ludhiana — home">
    <span class="logo-mark" aria-hidden="true">${raw('<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#0f2554"/><path d="M8 13l4.500 15 4.500-11 3 7 3-7 4.500 11L32 13" fill="none" stroke="#fff" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round"/><rect x="8" y="31" width="24" height="2.600" rx="1.300" fill="#f97c0f"/></svg>')}</span>
    <span class="logo-text"><span class="logo-name">Wholesale</span><span class="logo-sub">Ludhiana</span></span>
  </a>`;
}

function header(ctx) {
  const path = ctx.url.pathname;
  const s = ctx.settings;
  const q = path === "/shop" ? ctx.url.searchParams.get("q") || "" : "";
  const searchForm = (id) => html`<form class="hsearch" action="/shop" method="get" role="search">
    <label class="sr-only" for="${id}">Search products</label>
    <input id="${id}" type="search" name="q" value="${q}" placeholder="Search biscuits, kurtis, lipsticks, seat covers…" maxlength="80" autocomplete="off">
    <button type="submit" aria-label="Search">${icon("search")}</button>
  </form>`;
  return html`
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="announce" role="note"><div class="container announce-inner">
    <span>${s.home.announcement}</span><span class="dot hide-sm">•</span><a class="hide-sm" href="/langar-bhandara-bulk-orders">Langar &amp; Bhandara bulk orders →</a>
    <a class="announce-wa" href="${waLink(s.store.whatsapp, WA_HELLO)}" target="_blank" rel="noopener">${icon("whatsapp")} Order on WhatsApp</a>
  </div></div>
  <header class="site-header" data-header>
    <div class="container header-inner">
      <button class="icon-btn nav-toggle" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="site-nav" data-nav-toggle>${icon("menu")}</button>
      ${logo()}
      <div class="hsearch-wrap">${searchForm("hs-q")}</div>
      <div class="header-actions">
        <a class="icon-btn has-label" href="/account" aria-label="${ctx.account ? "My account" : "Login or register"}">${icon("user")}<span class="ib-label">${ctx.account ? ctx.account.name.split(" ")[0] : "Login"}</span></a>
        <a class="icon-btn has-label" href="/wishlist" aria-label="Wishlist">${icon("heart")}<span class="cart-count" data-wish-count hidden>0</span><span class="ib-label">Wishlist</span></a>
        <a class="icon-btn has-label cart-btn" href="/cart" aria-label="Cart" data-cart-open>${icon("cart")}<span class="cart-count" data-cart-count hidden>0</span><span class="ib-label">Cart</span></a>
      </div>
    </div>
    <nav class="site-nav" id="site-nav" aria-label="Categories" data-nav>
      <div class="nav-panel-head">${logo()}<button class="icon-btn" type="button" aria-label="Close menu" data-nav-close>${icon("close")}</button></div>
      <ul class="nav-list container">
        <li><a href="/shop" class="${path === "/shop" ? "is-active" : ""}">All Products</a></li>
        ${ctx.tree.map((c) => {
          const on = path === "/shop/" + c.slug || path.startsWith("/shop/" + c.slug + "/");
          return html`<li class="has-menu">
            <a href="/shop/${c.slug}" class="${on ? "is-active" : ""}" ${on ? raw('aria-current="page"') : ""}>${c.name}</a>
            ${c.children.length ? html`<ul class="submenu">${c.children.map((x) => html`<li><a href="/shop/${c.slug}/${x.slug}">${x.name}</a></li>`)}</ul>` : ""}
          </li>`;
        })}
        <li class="nav-extra"><a href="/langar-bhandara-bulk-orders">Bulk Order Calculator</a></li>
        <li class="nav-extra"><a href="/shop?show=deal">Wholesale Deals</a></li>
        <li class="nav-extra"><a href="/contact">Contact</a></li>
      </ul>
      <a class="btn btn-wa nav-wa" href="${waLink(s.store.whatsapp, WA_HELLO)}" target="_blank" rel="noopener">${icon("whatsapp")}<span>Chat on WhatsApp</span></a>
    </nav>
  </header>
  <div class="nav-backdrop" data-nav-backdrop hidden></div>`;
}

function cartDrawer() {
  return html`<div class="drawer-backdrop" data-drawer-backdrop hidden></div>
  <aside class="cart-drawer" aria-label="Shopping cart" aria-hidden="true" data-drawer tabindex="-1">
    <div class="drawer-head"><h2>Your Cart</h2><button class="icon-btn" type="button" aria-label="Close cart" data-drawer-close>${icon("close")}</button></div>
    <div class="drawer-body" data-drawer-items></div>
    <div class="drawer-foot">
      <div class="drawer-total"><span>Subtotal</span><strong data-drawer-subtotal>₹0</strong></div>
      <p class="fine">GST and delivery charges are calculated at checkout.</p>
      <div class="drawer-ctas"><a class="btn btn-ghost" href="/cart">View Cart</a><a class="btn btn-primary" href="/checkout">Checkout</a></div>
    </div>
  </aside>`;
}

function footer(ctx) {
  const s = ctx.settings.store;
  const year = new Date().getUTCFullYear();
  return html`<footer class="site-footer">
    <div class="container footer-grid">
      <div class="footer-brand">
        ${logo()}
        <p class="footer-tag">${s.tagline}</p>
        <p class="footer-copy">One wholesale store for retailers, shopkeepers, distributors and bulk buyers — bakery, garments, fabric, woollens, cosmetics, bridal wear and car accessories from Ludhiana.</p>
        <a class="btn btn-wa btn-sm" href="${waLink(s.whatsapp, WA_HELLO)}" target="_blank" rel="noopener">${icon("whatsapp")}<span>Chat on WhatsApp</span></a>
      </div>
      <div><h2 class="footer-h">Categories</h2><ul class="footer-links">
        ${ctx.tree.map((c) => html`<li><a href="/shop/${c.slug}">${c.name} Wholesale</a></li>`)}
      </ul></div>
      <div><h2 class="footer-h">Store</h2><ul class="footer-links">
        <li><a href="/shop">All Products</a></li>
        <li><a href="/shop?show=deal">Wholesale Deals</a></li>
        <li><a href="/shop?show=new&amp;sort=newest">New Arrivals</a></li>
        <li><a href="/langar-bhandara-bulk-orders">Langar &amp; Bhandara Orders</a></li>
        <li><a href="/account">My Account</a></li>
        <li><a href="/about">About Us</a></li>
        <li><a href="/contact">Contact Us</a></li>
      </ul></div>
      <div><h2 class="footer-h">Policies</h2><ul class="footer-links">
        <li><a href="/shipping-policy">Shipping Policy</a></li>
        <li><a href="/refund-policy">Returns &amp; Refunds</a></li>
        <li><a href="/privacy-policy">Privacy Policy</a></li>
        <li><a href="/terms">Terms &amp; Conditions</a></li>
      </ul>
      <h2 class="footer-h mt">Reach us</h2><ul class="footer-links">
        ${s.phone ? html`<li><a href="tel:${s.phone.replace(/[^\d+]/g, "")}">${s.phone}</a></li>` : ""}
        ${s.email ? html`<li><a href="mailto:${s.email}">${s.email}</a></li>` : ""}
        <li>${[s.address, s.city, s.region].filter(Boolean).join(", ")}</li>
        ${s.gstin ? html`<li>GSTIN: ${s.gstin}</li>` : ""}
      </ul>
      </div>
    </div>
    <div class="container footer-bottom"><p>© ${year} ${s.name}. All products are sold directly by ${s.name}.</p><p>Secure online payments by Razorpay • GST invoice with every order</p></div>
  </footer>
  <a class="wa-float whatsapp-widget" href="${waLink(s.whatsapp, WA_HELLO)}" target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp">${icon("whatsapp")}<span class="wa-float-label">Chat with us</span></a>
  <div class="toast-wrap" aria-live="polite" data-toasts></div>`;
}

/**
 * @param ctx   request context { url, origin, settings, categories, tree, assetV, account }
 * @param page  { title, description, path, image, body, jsonLd[], scripts[], noindex, bodyClass }
 */
export function layout(ctx, page) {
  const canonical = ctx.origin + (page.path ?? ctx.url.pathname);
  const image = page.image ? (page.image.startsWith("http") ? page.image : ctx.origin + page.image) : ctx.origin + "/og-default.png";
  const v = ctx.assetV;
  const store = ctx.settings.store;
  const seo = ctx.settings.seo;
  return "<!doctype html>" + html`<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${page.title}</title>
<meta name="description" content="${page.description}">
${page.noindex ? raw('<meta name="robots" content="noindex, nofollow">') : html`<link rel="canonical" href="${canonical}">`}
${seo.google_verification ? html`<meta name="google-site-verification" content="${seo.google_verification}">` : ""}
<meta name="theme-color" content="#0f2554">
<meta property="og:type" content="${page.ogType || "website"}">
<meta property="og:site_name" content="${store.name}">
<meta property="og:title" content="${page.title}">
<meta property="og:description" content="${page.description}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${image}">
<meta property="og:locale" content="en_IN">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${page.title}">
<meta name="twitter:description" content="${page.description}">
<meta name="twitter:image" content="${image}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/assets/fonts/dm-sans-latin.woff2" as="font" type="font/woff2" crossorigin>
${page.preload ? html`<link rel="preload" as="image" href="${page.preload}" fetchpriority="high">` : ""}
<link rel="stylesheet" href="/assets/css/style.css?v=${v}">
${(page.jsonLd || []).map((o) => jsonLd(o))}
</head>
<body class="${page.bodyClass || ""}" data-wa="${(store.whatsapp || "").replace(/\D/g, "")}">
${header(ctx)}
<main id="main" tabindex="-1">${page.body}</main>
${footer(ctx)}
${cartDrawer()}
<script type="module" src="/assets/js/main.js?v=${v}"></script>
${(page.scripts || []).map((s) => html`<script type="module" src="${s}?v=${v}"></script>`)}
</body>
</html>`;
}
