// Storefront pages. Each returns a page object for layout().
import { html, raw, dataJson } from "./html.js";
import { icon, productCard, productImg, priceLabel, badges, breadcrumbs, breadcrumbLd, sectionHead, waLink, isBuyable, cartData, units } from "./components.js";
import { rupees, thumbOf, parseJson } from "../lib/util.js";
import { slabRows } from "../../public/assets/js/lib/price.js";

const BRAND = "Wholesale Ludhiana";
const abs = (ctx, u) => (u && u.startsWith("http") ? u : ctx.origin + u);
const paras = (text) => String(text || "").split(/\n\s*\n|\n/).map((t) => t.trim()).filter(Boolean).map((t) => html`<p>${t}</p>`);

export function organizationLd(ctx) {
  const s = ctx.settings.store;
  const ld = {
    "@context": "https://schema.org", "@type": "WholesaleStore", "@id": ctx.origin + "/#store",
    name: s.name, slogan: s.tagline, url: ctx.origin + "/", logo: ctx.origin + "/logo-512.png", image: ctx.origin + "/og-default.png", priceRange: "₹",
    address: { "@type": "PostalAddress", streetAddress: s.address || undefined, addressLocality: s.city || "Ludhiana", addressRegion: s.region || "Punjab", postalCode: s.postcode || undefined, addressCountry: "IN" },
    areaServed: "IN",
  };
  if (s.phone) ld.telephone = s.phone;
  if (s.email) ld.email = s.email;
  if (s.hours) ld.openingHours = s.hours;
  return ld;
}

const CAT_ICONS = {
  "bakery-food": "M4 11a8 5 0 0 1 16 0v1H4zM5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6M9 12v8M15 12v8",
  "readymade-wear": "M8 3l4 3 4-3 5 4-3 4-2-1v11H8V10l-2 1-3-4z",
  "fabric-textiles": "M4 6c4-3 12 3 16 0v12c-4 3-12-3-16 0zM4 12c4-3 12 3 16 0",
  "woollen-wear": "M12 3a4 4 0 0 1 4 4c3 1 4 4 4 7H4c0-3 1-6 4-7a4 4 0 0 1 4-4zM4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4M9 14v6M15 14v6",
  "langar-bhandara": "M3 13h18a9 7 0 0 1-18 0zM7 9c0-2 2-2 2-4M12 9c0-2 2-2 2-4M17 9c0-2 2-2 2-4M8 21h8",
  "makeup-cosmetics": "M9 21V11h6v10zM10 11V7l4-3v7M7 21h10",
  "bridal-wear": "M12 3l2 5 5 9H5l5-9zM5 17l-1 4h16l-1-4M12 8v9",
  "car-accessories": "M5 12l2-5h10l2 5M3 12h18v5H3zM6 17v2M18 17v2M7 14.500h.01M17 14.500h.01",
};
const catIcon = (slug) => raw(`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${CAT_ICONS[slug] || "M3 8l9-5 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8"}" fill="none" stroke="currentColor" stroke-width="1.500" stroke-linecap="round" stroke-linejoin="round"/></svg>`);

function productRow(title, sub, products, ctx, { more, kicker, tint = false } = {}) {
  if (!products.length) return "";
  return html`<section class="section${tint ? " section-tint" : ""}"><div class="container">
    <header class="row-head"><div>${kicker ? html`<p class="kicker">${kicker}</p>` : ""}<h2 class="section-title">${title}</h2>${sub ? html`<p class="section-sub">${sub}</p>` : ""}</div>
      ${more ? html`<a class="btn btn-outline btn-sm" href="${more}">View all ${icon("arrow")}</a>` : ""}</header>
    <div class="product-grid">${products.map((p) => productCard(p, ctx))}</div>
  </div></section>`;
}

// --------------------------------------------------------------------------- Home
export function homePage(ctx, { best, deals, fresh, bakery, seasonal, bulk, testimonials, heroBanner, offers, counts }) {
  const home = ctx.settings.home;
  const wa = ctx.settings.store.whatsapp;
  const title = (heroBanner && heroBanner.title) || home.hero_title;
  const subtitle = (heroBanner && heroBanner.subtitle) || home.hero_subtitle;
  const why = [
    { icon: "tag", title: "True wholesale prices", text: "Quantity slabs on products — the more you buy, the lower the rate per unit." },
    { icon: "box", title: "One store, every category", text: "Bakery, garments, fabric, woollens, cosmetics, bridal wear and car accessories." },
    { icon: "receipt", title: "GST invoice", text: "A proper GST bill with every order for your business records." },
    { icon: "shield", title: "One seller you can trust", text: "Every product is sold and dispatched by us from Ludhiana — no middlemen." },
    { icon: "whatsapp", title: "Order help on WhatsApp", text: "Ask about products, request bulk quotations and get order updates." },
    { icon: "truck", title: "Flexible payment", text: "Pay online by UPI, card or net banking, by bank transfer, or cash on delivery." },
  ];
  const body = html`
  <section class="hero wl-hero">
    <div class="container hero-grid">
      <div class="hero-copy">
        <p class="kicker light">${ctx.settings.store.tagline}</p>
        <h1 class="hero-title">${title}</h1>
        <p class="hero-sub">${subtitle}</p>
        <div class="hero-ctas">
          <a class="btn btn-primary btn-lg" href="${(heroBanner && heroBanner.cta_url) || "/shop"}">${(heroBanner && heroBanner.cta_label) || "Shop Wholesale"} ${icon("arrow")}</a>
          <a class="btn btn-outline-light btn-lg" href="/langar-bhandara-bulk-orders">${icon("calc")} Bulk Order Calculator</a>
        </div>
        <ul class="hero-trust">
          <li>${icon("check")} Quantity-based pricing</li>
          <li>${icon("check")} GST invoice</li>
          <li>${icon("check")} Direct from Ludhiana</li>
        </ul>
      </div>
      <div class="hero-cats" aria-hidden="true">
        ${heroBanner && heroBanner.image
          ? html`<img class="hero-banner-img" src="${heroBanner.image}" alt="" width="640" height="480" fetchpriority="high">`
          : ctx.tree.slice(0, 8).map((c) => html`<a href="/shop/${c.slug}" tabindex="-1" class="hero-cat">${catIcon(c.slug)}<span>${c.name}</span></a>`)}
      </div>
    </div>
  </section>

  <section class="section"><div class="container">
    ${sectionHead({ kicker: "Explore", title: "Shop by Categories", sub: "Eight wholesale categories, one store." })}
    <ul class="cat-tiles wl-cats">
      ${ctx.tree.map((c) => html`<li><a class="cat-tile" href="/shop/${c.slug}">
        <span class="cat-ic">${c.image ? html`<img src="${thumbOf(c.image)}" width="120" height="120" alt="${c.name} wholesale in Ludhiana" loading="lazy">` : catIcon(c.slug)}</span>
        <span class="cat-name">${c.name}</span><span class="cat-note">${counts[c.slug] ? counts[c.slug] + " products" : c.children.length + " ranges"}</span>
      </a></li>`)}
    </ul>
  </div></section>

  ${productRow("Best Selling Products", "What retailers are re-ordering most.", best, ctx, { more: "/shop?show=featured", kicker: "Popular", tint: true })}

  ${offers.length ? html`<section class="section-sm"><div class="container offer-grid">
    ${offers.slice(0, 3).map((o) => html`<a class="offer-card" href="${o.cta_url || "/shop?show=deal"}" ${o.image ? raw(`style="background-image:linear-gradient(90deg,rgba(10,27,64,.92),rgba(10,27,64,.55)),url('${encodeURI(o.image)}')"`) : ""}>
      <strong>${o.title}</strong>${o.subtitle ? html`<span>${o.subtitle}</span>` : ""}<em>${o.cta_label || "Shop now"} →</em></a>`)}
  </div></section>` : ""}

  ${productRow("Wholesale Deals", "Extra margin on these lines — limited stock.", deals, ctx, { more: "/shop?show=deal", kicker: "Save more" })}
  ${productRow("New Arrivals", "Fresh designs and new stock, just in.", fresh, ctx, { more: "/shop?show=new&sort=newest", kicker: "Just in", tint: true })}
  ${productRow("Bakery & Food Specials", "Biscuits, cookies and rusk for retailers, canteens and events.", bakery, ctx, { more: "/shop/bakery-food", kicker: "Bakery" })}

  <section class="langar-band"><div class="container langar-grid">
    <div class="langar-copy">
      <p class="kicker light">Seva made simple</p>
      <h2>${home.langar_title}</h2>
      <p>${home.langar_text}</p>
      <ul class="price-chips">
        ${bulk.filter((b) => b.price_paise !== null).slice(0, 6).map((b) => html`<li><span>${b.name}</span><strong>${rupees(b.price_paise)}<small> / ${b.unit}</small></strong></li>`)}
      </ul>
      <a class="btn btn-primary btn-lg" href="/langar-bhandara-bulk-orders">${icon("calc")} Open the Bulk Order Calculator</a>
    </div>
  </div></section>

  ${seasonal.length ? productRow(home.seasonal_title, home.seasonal_text, seasonal, ctx, { more: home.seasonal_url || "/shop?show=seasonal", kicker: "Seasonal collection" }) : ""}

  <section class="section section-tint"><div class="container">
    ${sectionHead({ kicker: "Why " + BRAND, title: "Why Buy From Us?" })}
    <ul class="speciality">
      ${why.map((s) => html`<li><span class="spec-icon">${icon(s.icon)}</span><h3>${s.title}</h3><p>${s.text}</p></li>`)}
    </ul>
  </div></section>

  ${testimonials.length ? html`<section class="section"><div class="container">
    ${sectionHead({ kicker: "Kind words", title: "What Our Customers Say" })}
    <ul class="testimonials">
      ${testimonials.map((t) => html`<li class="testimonial"><span class="stars" aria-label="${t.rating} out of 5 stars">${Array.from({ length: Math.max(1, Math.min(5, t.rating)) }, () => icon("star"))}</span>
        <blockquote>“${t.text}”</blockquote><p class="t-name">${t.name}${t.location ? html`<span>${t.location}</span>` : ""}</p></li>`)}
    </ul>
  </div></section>` : ""}

  <section class="section"><div class="container">
    <div class="wa-cta">
      <div><p class="kicker">Quick &amp; easy</p><h2>Need a bulk quotation? Message us on WhatsApp</h2><p>Tell us the products and quantities you need — we'll reply with the best wholesale rate, availability and delivery details.</p></div>
      <a class="btn btn-wa btn-lg" href="${waLink(wa, "Hello Wholesale Ludhiana! I'd like a bulk quotation for:")}" target="_blank" rel="noopener">${icon("whatsapp")}<span>Chat with us on WhatsApp</span></a>
    </div>
  </div></section>`;
  const seo = ctx.settings.seo;
  return {
    title: seo.title, description: seo.description, path: "/", body,
    jsonLd: [organizationLd(ctx), { "@context": "https://schema.org", "@type": "WebSite", name: BRAND, url: ctx.origin + "/", potentialAction: { "@type": "SearchAction", target: ctx.origin + "/shop?q={search_term_string}", "query-input": "required name=search_term_string" } }],
  };
}

// --------------------------------------------------------------------------- Listings (shop, category, subcategory, search)
const SHOW_TITLES = { featured: "Best Selling Products", deal: "Wholesale Deals", new: "New Arrivals", seasonal: "Seasonal Collection" };

function pageUrl(base, query, page) {
  const p = new URLSearchParams();
  if (query.q) p.set("q", query.q);
  if (query.flag) p.set("show", query.flag);
  if (query.sort && query.sort !== "featured") p.set("sort", query.sort);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return base + (s ? "?" + s : "");
}

function pagination(base, query, total) {
  const pages = Math.ceil(total / query.perPage);
  if (pages <= 1) return "";
  const cur = Math.min(query.page, pages);
  const nums = [...new Set([1, 2, cur - 1, cur, cur + 1, pages - 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const n of nums) {
    if (n - prev > 1) out.push(html`<span class="pg-gap">…</span>`);
    out.push(n === cur ? html`<span class="pg is-on" aria-current="page">${n}</span>` : html`<a class="pg" href="${pageUrl(base, query, n)}">${n}</a>`);
    prev = n;
  }
  return html`<nav class="pagination" aria-label="Pages">
    ${cur > 1 ? html`<a class="pg pg-nav" rel="prev" href="${pageUrl(base, query, cur - 1)}">← Prev</a>` : ""}${out}
    ${cur < pages ? html`<a class="pg pg-nav" rel="next" href="${pageUrl(base, query, cur + 1)}">Next →</a>` : ""}
  </nav>`;
}

export function listingPage(ctx, { items, total, query, category = null, sub = null, counts = {} }) {
  const base = category ? "/shop/" + category.slug + (sub ? "/" + sub.slug : "") : "/shop";
  const crumbs = [{ name: "Home", url: "/" }, { name: "All Products", url: "/shop" }];
  if (category) crumbs.push({ name: category.name, url: "/shop/" + category.slug });
  if (sub) crumbs.push({ name: sub.name, url: base });
  let h1 = sub ? `${sub.name} Wholesale` : category ? `${category.name} Wholesale` : "All Wholesale Products";
  if (query.q) h1 = `Search results for “${query.q}”`;
  else if (query.flag && !category) h1 = SHOW_TITLES[query.flag];
  const intro = sub
    ? sub.description || `Buy ${sub.name.toLowerCase()} at wholesale prices in Ludhiana — ${category.name.toLowerCase()} for retailers, shopkeepers and bulk buyers.`
    : category ? category.description : "Browse every wholesale category — bakery, garments, fabric, woollens, cosmetics, bridal wear, car accessories and langar supplies.";
  const sortOpts = [["featured", "Popular"], ["newest", "Newest"], ["price-asc", "Price: Low to High"], ["price-desc", "Price: High to Low"], ["name", "Name: A–Z"]];
  const chips = category
    ? [{ name: "All " + category.name, url: "/shop/" + category.slug, on: !sub }, ...category.children.filter((c) => counts[c.slug] || (sub && sub.slug === c.slug)).map((c) => ({ name: c.name, url: "/shop/" + category.slug + "/" + c.slug, on: sub && sub.slug === c.slug, n: counts[c.slug] }))]
    : [{ name: "All", url: "/shop", on: true }, ...ctx.tree.map((c) => ({ name: c.name, url: "/shop/" + c.slug }))];
  const emptySubs = category && !sub ? category.children.filter((c) => !counts[c.slug]) : [];
  const wa = ctx.settings.store.whatsapp;
  const body = html`
  <section class="page-hero slim"><div class="container">
    ${breadcrumbs(crumbs)}
    <h1>${h1}</h1>
    ${query.q ? "" : html`<p>${intro}</p>`}
  </div></section>
  <section class="section-sm"><div class="container">
    <div class="filter-bar">
      <div class="chips" role="group" aria-label="Browse">
        ${chips.map((c) => html`<a class="chip${c.on ? " is-on" : ""}" href="${c.url}">${c.name}${c.n ? html` <small>${c.n}</small>` : ""}</a>`)}
      </div>
      <form class="filter-row" method="get" action="${base}" data-autosubmit>
        ${query.q ? html`<input type="hidden" name="q" value="${query.q}">` : ""}
        <label class="sort"><span class="sr-only">Show</span><select name="show">
          <option value="">All products</option>
          ${Object.entries(SHOW_TITLES).map(([k, v]) => html`<option value="${k}" ${query.flag === k ? raw("selected") : ""}>${v}</option>`)}
        </select></label>
        <label class="sort"><span class="sr-only">Sort products</span><select name="sort">
          ${sortOpts.map(([k, v]) => html`<option value="${k}" ${query.sort === k ? raw("selected") : ""}>Sort: ${v}</option>`)}
        </select></label>
        <noscript><button class="btn btn-outline btn-sm" type="submit">Apply</button></noscript>
        <p class="result-count">${total} product${total === 1 ? "" : "s"}</p>
      </form>
    </div>
    ${items.length
      ? html`<div class="product-grid">${items.map((p) => productCard(p, ctx, { headingLevel: 2 }))}</div>${pagination(base, query, total)}`
      : html`<div class="empty-state card"><h2 class="h3">${query.q ? "No products match your search" : "Products coming soon"}</h2>
          <p>${query.q ? "Try a shorter word, or ask us on WhatsApp — we may have it in stock." : "We are adding stock to this range. Message us on WhatsApp for current availability and wholesale rates."}</p>
          <a class="btn btn-wa" href="${waLink(wa, `Hello Wholesale Ludhiana! I'm looking for ${query.q || (sub ? sub.name : category ? category.name : "a product")} at wholesale rates.`)}" target="_blank" rel="noopener">${icon("whatsapp")}<span>Ask on WhatsApp</span></a>
          <a class="btn btn-outline" href="/shop">Browse all products</a></div>`}
    ${emptySubs.length ? html`<div class="also-box"><h2 class="h4">Also available on request in ${category.name}</h2>
      <ul class="pill-links">${emptySubs.map((c) => html`<li><a href="/shop/${category.slug}/${c.slug}">${c.name}</a></li>`)}</ul></div>` : ""}
  </div></section>`;
  const page = query.page > 1 ? ` — Page ${query.page}` : "";
  const title = query.q
    ? `Search: ${query.q}${page} | ${BRAND}`
    : (sub ? `${sub.name} Wholesale in Ludhiana — ${category.name}` : category ? category.seo_title || `${category.name} Wholesale in Ludhiana` : query.flag ? SHOW_TITLES[query.flag] : "All Wholesale Products in Ludhiana") + page + (category && !sub && category.seo_title ? "" : ` | ${BRAND}`);
  return {
    title, description: (sub && sub.seo_description) || (category && !sub && category.seo_description) || intro,
    path: pageUrl(base, { ...query, q: "" }, query.page), noindex: Boolean(query.q), body, scripts: ["/assets/js/listing.js"],
    jsonLd: [breadcrumbLd(crumbs, ctx.origin), { "@context": "https://schema.org", "@type": "ItemList", itemListElement: items.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: ctx.origin + "/product/" + p.slug, name: p.name })) }],
  };
}

// --------------------------------------------------------------------------- Product
export function productPage(ctx, { product: p, related }) {
  const crumbs = [{ name: "Home", url: "/" }, { name: p.category_name, url: "/shop/" + p.category }];
  if (p.subcategory) crumbs.push({ name: p.subcategory_name, url: "/shop/" + p.category + "/" + p.subcategory });
  crumbs.push({ name: p.name, url: "/product/" + p.slug });
  const buyable = isBuyable(p);
  const wa = ctx.settings.store.whatsapp;
  const gst = ctx.settings.gst;
  const rate = p.gst_rate === null || p.gst_rate === undefined ? gst.default_rate : p.gst_rate;
  const enquiry = `Hello Wholesale Ludhiana! I'd like to enquire about ${p.name}${p.sku ? " (SKU " + p.sku + ")" : ""}. ${ctx.origin}/product/${p.slug}`;
  const images = [p.image, ...(p.gallery || [])].filter(Boolean);
  const slabs = slabRows(p.price_paise, p.tiers, p.moq);
  const prices = (p.variants.length ? p.variants.map((v) => v.price_paise ?? p.price_paise) : [p.price_paise]).filter((x) => x !== null && x !== undefined);
  const productLd = {
    "@context": "https://schema.org", "@type": "Product", name: p.name, description: p.description || p.name, image: images.map((i) => abs(ctx, i)),
    sku: p.sku || p.slug, category: p.category_name, brand: { "@type": "Brand", name: p.brand || BRAND },
  };
  if (prices.length) {
    const lowest = Math.min(...prices, ...p.tiers.map((t) => t.price_paise));
    productLd.offers = {
      "@type": "AggregateOffer", url: ctx.origin + "/product/" + p.slug, priceCurrency: "INR", lowPrice: (lowest / 100).toFixed(2), highPrice: (Math.max(...prices) / 100).toFixed(2),
      offerCount: Math.max(1, p.variants.length), availability: p.in_stock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition", seller: { "@type": "Organization", name: BRAND },
    };
  }
  const stockNote = !p.in_stock ? html`<span class="stock out">Out of stock</span>`
    : p.track_stock ? html`<span class="stock ${p.stock <= p.low_stock ? "low" : "in"}">${p.stock <= p.low_stock ? "Only " + p.stock + " " + units(p.unit, p.stock) + " left" : "In stock"}</span>`
    : html`<span class="stock in">In stock</span>`;
  const body = html`
  <section class="section-sm product-page"><div class="container">
    ${breadcrumbs(crumbs)}
    <div class="pp-grid">
      <div class="pp-gallery" data-gallery>
        <figure class="pp-main">${productImg(p, { eager: true, cls: "pp-img", width: 900 })}<span class="pc-badges">${badges(p, { max: 3 })}</span></figure>
        ${images.length > 1 ? html`<div class="pp-thumbs">${images.map((src, i) => html`<button type="button" class="${i === 0 ? "is-on" : ""}" data-thumb="${thumbOf(src, 900)}" aria-label="Show photo ${i + 1}"><img src="${thumbOf(src, 200)}" width="200" height="200" alt="${p.name} photo ${i + 1}" loading="lazy"></button>`)}</div>` : ""}
      </div>
      <div class="pp-info">
        <p class="pc-cat">${p.brand ? p.brand + " • " : ""}${p.subcategory_name || p.category_name}</p>
        <h1 class="pp-title">${p.name}</h1>
        <div class="pp-price">${priceLabel(p)}${stockNote}</div>
        <p class="pp-meta">Minimum order: <strong>${p.moq} ${units(p.unit, p.moq)}</strong>${p.sku ? html` • SKU ${p.sku}` : ""}${gst.enabled && prices.length ? html` • ${gst.inclusive ? "Price includes" : "Plus"} ${rate}% GST` : ""}</p>
        ${slabs.length > 1 ? html`<div class="slab-box"><h2 class="h4">${icon("tag")} Wholesale price by quantity</h2>
          <table class="slab-table" data-slabs><thead><tr><th scope="col">Quantity</th><th scope="col">Price per ${p.unit}</th><th scope="col">You save</th></tr></thead><tbody>
          ${slabs.map((s) => html`<tr data-from="${s.from}" data-to="${s.to ?? ""}"><td>${s.to ? s.from + " – " + s.to : s.from + "+"} ${units(p.unit, 2)}</td><td><strong>${rupees(s.price_paise)}</strong></td><td>${s.price_paise < slabs[0].price_paise ? Math.round((1 - s.price_paise / slabs[0].price_paise) * 100) + "%" : "—"}</td></tr>`)}
          </tbody></table></div>` : ""}
        ${buyable ? html`<form class="pp-form" data-product-form data-cart-item="${raw(dataJson(cartData(p)))}" novalidate>
          ${p.variants.length ? html`<div class="field"><label for="pp-variant">Choose option</label><select id="pp-variant" data-variant>${p.variants.map((v) => {
            const vp = v.price_paise ?? p.price_paise;
            const off = v.available === false || vp === null;
            return html`<option value="${v.id}" ${off ? raw("disabled") : ""}>${v.label}${v.available === false ? " (out of stock)" : vp !== null ? " — " + rupees(vp) : " (price on request)"}</option>`;
          })}</select></div>` : ""}
          <div class="pp-buy">
            <div class="qty qty-lg" data-qty><button type="button" class="qty-btn" data-dec aria-label="Decrease quantity">−</button><input id="pp-qty" type="number" inputmode="numeric" min="${p.moq}" max="${p.track_stock ? p.stock : 100000}" value="${p.moq}" aria-label="Quantity"><button type="button" class="qty-btn" data-inc aria-label="Increase quantity">+</button></div>
            <p class="pp-live" aria-live="polite" data-live-price></p>
          </div>
          <div class="pp-ctas">
            <button type="button" class="btn btn-primary btn-lg" data-add-to-cart>${icon("cart")}<span>Add to Cart</span></button>
            <button type="button" class="btn btn-gold btn-lg" data-buy-now>Buy Now</button>
          </div>
        </form>` : html`<p class="notice">${p.in_stock ? "This product is sold at a price on request. Message us on WhatsApp for today's wholesale rate and availability." : "This product is currently out of stock. Message us to know when it is back."}</p>`}
        <div class="pp-ctas">
          <a class="btn btn-wa ${buyable ? "" : "btn-lg"}" href="${waLink(wa, enquiry)}" target="_blank" rel="noopener" data-wa-enquiry>${icon("whatsapp")}<span>WhatsApp Enquiry</span></a>
          <button type="button" class="btn btn-outline wish-btn-lg" aria-pressed="false" data-wish="${raw(dataJson({ slug: p.slug, name: p.name, image: thumbOf(p.image), price: p.price_paise, unit: p.unit }))}">${icon("heart")}<span data-wish-label>Add to Wishlist</span></button>
        </div>
        <ul class="pp-assure">
          <li>${icon("tag")} Wholesale rates</li>
          <li>${icon("receipt")} GST invoice</li>
          <li>${icon("truck")} Dispatched from Ludhiana</li>
        </ul>
      </div>
    </div>
    <div class="pp-details">
      <section><h2 class="h3">Description</h2>${paras(p.description)}</section>
      <section><h2 class="h3">Product specifications</h2>
        <table class="spec"><tbody>
          ${p.brand ? html`<tr><th scope="row">Brand</th><td>${p.brand}</td></tr>` : ""}
          <tr><th scope="row">Category</th><td><a href="/shop/${p.category}">${p.category_name}</a>${p.subcategory ? html` › <a href="/shop/${p.category}/${p.subcategory}">${p.subcategory_name}</a>` : ""}</td></tr>
          <tr><th scope="row">Sold by</th><td>${p.unit}</td></tr>
          <tr><th scope="row">Minimum order</th><td>${p.moq} ${units(p.unit, p.moq)}</td></tr>
          ${p.specs.filter((s) => s.k !== "Brand").map((s) => html`<tr><th scope="row">${s.k}</th><td>${s.v}</td></tr>`)}
          ${p.variants.length ? html`<tr><th scope="row">Options</th><td>${p.variants.map((v) => v.label).join(", ")}</td></tr>` : ""}
        </tbody></table>
      </section>
    </div>
  </div></section>
  ${related.length ? html`<section class="section-sm section-tint"><div class="container">
    <h2 class="section-title small">More from ${p.subcategory_name || p.category_name}</h2>
    <div class="product-grid">${related.map((r) => productCard(r, ctx))}</div>
  </div></section>` : ""}`;
  return {
    title: p.seo_title || `${p.name} — Wholesale Price in Ludhiana | ${BRAND}`,
    description: p.seo_description || `Buy ${p.name} at wholesale price${prices.length ? " from " + rupees(Math.min(...prices)) + " per " + p.unit : ""}. Minimum order ${p.moq} ${units(p.unit, p.moq)}. ${p.category_name} wholesale from Ludhiana with GST invoice.`.slice(0, 300),
    path: "/product/" + p.slug, image: p.image || undefined, ogType: "product", preload: p.image ? thumbOf(p.image, 900) : undefined, body,
    scripts: ["/assets/js/product.js"], jsonLd: [productLd, breadcrumbLd(crumbs, ctx.origin)],
  };
}

// --------------------------------------------------------------------------- Langar & Bhandara bulk order calculator
const EVENT_TYPES = ["Langar", "Bhandara", "Gurudwara events", "Temple events", "Community gatherings", "Weddings", "Corporate events"];

export function bulkPage(ctx, { products }) {
  const crumbs = [{ name: "Home", url: "/" }, { name: "Langar & Bhandara Bulk Orders", url: "/langar-bhandara-bulk-orders" }];
  const home = ctx.settings.home;
  const ship = ctx.settings.shipping;
  const calc = products.map((p) => ({ ...cartData(p), category: p.subcategory_name || "" }));
  const faqs = [
    ["How do I place a bulk order for langar or bhandara?", "Enter the quantity you need against each product. The calculator shows the subtotal, GST, delivery charge and grand total. Fill in the event details and submit the order, or send it to us on WhatsApp."],
    ["How early should I order?", "Please place bulk orders at least one day in advance so everything can be prepared fresh. For very large events, two to three days' notice is appreciated."],
    ["Do larger quantities get a lower rate?", "Yes. Quantity slabs are shown under each product — the rate per unit drops automatically as your quantity crosses each slab."],
    ["How do I pay?", "Our team confirms your order and delivery on phone or WhatsApp. You can then pay by UPI, bank transfer or cash on delivery."],
  ];
  const body = html`
  <section class="page-hero bulk-hero"><div class="container">
    ${breadcrumbs(crumbs)}
    <h1>${home.langar_title}</h1>
    <p>${home.langar_text}</p>
    <ul class="event-chips">${EVENT_TYPES.map((e) => html`<li>${e}</li>`)}</ul>
  </div></section>
  <section class="section-sm"><div class="container bulk-layout" data-bulk data-items="${raw(dataJson(calc))}">
    <div>
      <div class="card bulk-calc">
        <h2 class="h3">${icon("calc")} Bulk order calculator</h2>
        ${products.length ? html`<div class="calc-rows">
          ${products.map((p) => {
            const slabs = slabRows(p.price_paise, p.tiers, p.moq);
            return html`<div class="calc-row" data-row="${p.slug}">
              <div class="calc-name"><a href="/product/${p.slug}">${p.name}</a>
                <span class="calc-sub">${rupees(p.price_paise)} / ${p.unit} • min ${p.moq} ${units(p.unit, p.moq)}</span>
                ${slabs.length > 1 ? html`<span class="calc-slabs">${slabs.slice(1).map((s) => html`<em>${s.from}+ : ${rupees(s.price_paise)}</em>`)}</span>` : ""}
              </div>
              <div class="calc-qty"><div class="qty" data-qty><button type="button" class="qty-btn" data-dec aria-label="Decrease ${p.name}">−</button><input type="number" inputmode="numeric" min="0" max="100000" step="1" value="0" aria-label="Quantity of ${p.name} in ${units(p.unit, 2)}" data-bulk-qty><button type="button" class="qty-btn" data-inc aria-label="Increase ${p.name}">+</button></div><span class="calc-unit">${units(p.unit, 2)}</span></div>
              <div class="calc-total"><span data-row-rate></span><strong data-row-total>—</strong></div>
            </div>`;
          })}
        </div>` : html`<p class="notice">Bulk products are being updated. Please message us on WhatsApp with your requirement.</p>`}
      </div>
      <form class="card form mt" data-bulk-form novalidate>
        <h2 class="h3">Event &amp; delivery details</h2>
        <div class="form-grid">
          <div class="field"><label for="b-name">Your name *</label><input id="b-name" name="name" required minlength="2" maxlength="80" autocomplete="name"></div>
          <div class="field"><label for="b-phone">Mobile number *</label><input id="b-phone" name="phone" type="tel" required maxlength="16" inputmode="tel" autocomplete="tel" placeholder="10-digit mobile"></div>
          <div class="field"><label for="b-event">Event name *</label><input id="b-event" name="event_name" required minlength="2" maxlength="120" placeholder="e.g. Gurpurab langar"></div>
          <div class="field"><label for="b-date">Event date *</label><input id="b-date" name="event_date" type="date" required></div>
          <div class="field"><label for="b-people">Number of people <span class="opt">(optional)</span></label><input id="b-people" name="people" type="number" inputmode="numeric" min="1" max="1000000"></div>
          <div class="field"><label for="b-city">City *</label><input id="b-city" name="city" required maxlength="60" value="Ludhiana"></div>
          <div class="field span-2"><label for="b-address">Delivery address *</label><textarea id="b-address" name="address" rows="2" required minlength="10" maxlength="240" placeholder="Gurudwara / temple / venue, street, area"></textarea></div>
          <div class="field"><label for="b-state">State *</label><input id="b-state" name="state" required maxlength="40" value="Punjab"></div>
          <div class="field"><label for="b-pincode">Pincode *</label><input id="b-pincode" name="pincode" required inputmode="numeric" maxlength="6" pattern="[1-9][0-9]{5}"></div>
          <div class="field span-2"><label for="b-notes">Special instructions <span class="opt">(optional)</span></label><textarea id="b-notes" name="notes" rows="2" maxlength="500" placeholder="Delivery time, packing, anything else"></textarea></div>
        </div>
      </form>
    </div>
    <aside class="card summary bulk-summary">
      <h2 class="h3">Order total</h2>
      <ul class="sum-lines" data-bulk-lines><li class="muted">Enter quantities to see your total.</li></ul>
      <dl class="totals">
        <div><dt>Subtotal</dt><dd data-sum-subtotal>₹0</dd></div>
        <div data-gst-row><dt data-gst-label>GST</dt><dd data-sum-gst>₹0</dd></div>
        <div><dt>Delivery charges</dt><dd data-sum-shipping>—</dd></div>
        <div class="grand"><dt>Grand total</dt><dd data-sum-total>₹0</dd></div>
      </dl>
      ${ship.note ? html`<p class="fine">${ship.note}</p>` : ""}
      <p class="form-error" role="alert" data-bulk-error hidden></p>
      <button type="button" class="btn btn-primary btn-block btn-lg" data-bulk-submit disabled>Submit Bulk Order</button>
      <button type="button" class="btn btn-wa btn-block" data-bulk-wa disabled>${icon("whatsapp")}<span>Send Enquiry on WhatsApp</span></button>
      <p class="fine">No payment now — our team confirms the order, delivery time and payment with you.</p>
    </aside>
  </div></section>
  <section class="section-sm section-tint"><div class="container narrow">
    <h2 class="section-title small">Bulk order questions</h2>
    <div class="faq">${faqs.map(([q, a]) => html`<details><summary>${q}</summary><p>${a}</p></details>`)}</div>
  </div></section>`;
  return {
    title: `Langar & Bhandara Supplies — Bulk Order Calculator | ${BRAND}`,
    description: "Bulk kulcha, biscuits, veg patties, bread, samosa and disposable plates for langar, bhandara and community events in Ludhiana. Calculate your total with GST and delivery, then order online or on WhatsApp.",
    path: "/langar-bhandara-bulk-orders", body, bodyClass: "page-bulk", scripts: ["/assets/js/bulk.js"],
    jsonLd: [breadcrumbLd(crumbs, ctx.origin), { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }],
  };
}

// --------------------------------------------------------------------------- About / Contact
export function aboutPage(ctx) {
  const s = ctx.settings.store;
  const crumbs = [{ name: "Home", url: "/" }, { name: "About Us", url: "/about" }];
  const about = ctx.settings.pages.about ||
    `${BRAND} is a wholesale store based in Ludhiana, Punjab. We sell directly to retailers, shopkeepers, distributors, event organisers, businesses and bulk buyers.\n\nEverything on this website is stocked, sold and dispatched by us — this is not a marketplace and there are no third-party sellers. That means one point of contact, one bill and consistent quality across every category: bakery and food, readymade wear, fabric and textiles, woollen wear, cosmetics, bridal wear, car accessories and langar & bhandara supplies.\n\nPrices are true wholesale rates, with lower rates per unit as your quantity grows. Every order comes with a GST invoice.`;
  const body = html`
  <section class="page-hero"><div class="container">${breadcrumbs(crumbs)}<h1>About ${s.name}</h1><p>${s.tagline}</p></div></section>
  <section class="section"><div class="container narrow prose">
    ${paras(about)}
    <div class="hero-ctas"><a class="btn btn-primary" href="/shop">Browse products</a><a class="btn btn-outline" href="/contact">Get in touch</a></div>
  </div></section>`;
  return { title: `About Us | ${BRAND}`, description: `${BRAND} — a single-owner wholesale store in Ludhiana selling bakery, garments, fabric, woollens, cosmetics, bridal wear and car accessories to retailers and bulk buyers.`, path: "/about", body, jsonLd: [organizationLd(ctx), breadcrumbLd(crumbs, ctx.origin)] };
}

export function contactPage(ctx) {
  const s = ctx.settings.store;
  const crumbs = [{ name: "Home", url: "/" }, { name: "Contact Us", url: "/contact" }];
  const body = html`
  <section class="page-hero"><div class="container">${breadcrumbs(crumbs)}<h1>Contact Us</h1><p>Questions about a product, a bulk quotation or an order? We're happy to help.</p></div></section>
  <section class="section"><div class="container contact-grid">
    <div class="card contact-card">
      <h2 class="h3">Talk to us</h2>
      <p>The fastest way to reach us is WhatsApp — tell us what you need and we'll reply with availability and the wholesale rate.</p>
      <a class="btn btn-wa btn-lg" href="${waLink(s.whatsapp, "Hello Wholesale Ludhiana! I have a question.")}" target="_blank" rel="noopener">${icon("whatsapp")}<span>Message on WhatsApp</span></a>
      <ul class="contact-list">
        ${s.phone ? html`<li><strong>Phone</strong><a href="tel:${s.phone.replace(/[^\d+]/g, "")}">${s.phone}</a></li>` : ""}
        ${s.email ? html`<li><strong>Email</strong><a href="mailto:${s.email}">${s.email}</a></li>` : ""}
        <li><strong>Address</strong><span>${[s.address, s.city, s.region, s.postcode].filter(Boolean).join(", ")}</span></li>
        ${s.hours ? html`<li><strong>Hours</strong><span>${s.hours}</span></li>` : ""}
      </ul>
      <ul class="pill-links"><li><a href="/langar-bhandara-bulk-orders">Langar &amp; Bhandara orders</a></li><li><a href="/shop">Browse products</a></li></ul>
    </div>
    <form class="card form" data-enquiry-form="contact" novalidate>
      <h2 class="h3">Send us a message</h2>
      <div class="form-grid">
        <div class="field"><label for="c-name">Your name *</label><input id="c-name" name="name" required minlength="2" maxlength="80" autocomplete="name"></div>
        <div class="field"><label for="c-phone">Mobile number *</label><input id="c-phone" name="phone" type="tel" required inputmode="tel" maxlength="16" autocomplete="tel" placeholder="10-digit mobile"></div>
        <div class="field span-2"><label for="c-email">Email <span class="opt">(optional)</span></label><input id="c-email" name="email" type="email" maxlength="120" autocomplete="email"></div>
        <div class="field span-2"><label for="c-subject">Topic</label><select id="c-subject" name="subject"><option>Product enquiry</option><option>Bulk quotation</option><option>Order support</option><option>Langar / Bhandara order</option><option>Feedback</option></select></div>
        <div class="field span-2"><label for="c-message">Message *</label><textarea id="c-message" name="message" rows="5" required minlength="5" maxlength="1000"></textarea></div>
      </div>
      <button class="btn btn-primary" type="submit">Send Message</button>
      <p class="form-status" role="status" data-form-status></p>
    </form>
  </div></section>`;
  return { title: `Contact Us | ${BRAND}`, description: `Contact ${BRAND} for wholesale product enquiries, bulk quotations and order support. Message us on WhatsApp.`, path: "/contact", body, scripts: ["/assets/js/forms.js"], jsonLd: [organizationLd(ctx), breadcrumbLd(crumbs, ctx.origin)] };
}

// --------------------------------------------------------------------------- Cart / Wishlist / Checkout / Order
const totalsBlock = () => html`<dl class="totals">
  <div><dt>Subtotal</dt><dd data-sum-subtotal>—</dd></div>
  <div data-discount-row hidden><dt>Coupon discount</dt><dd data-sum-discount>—</dd></div>
  <div data-gst-row><dt data-gst-label>GST</dt><dd data-sum-gst>—</dd></div>
  <div><dt>Delivery charges</dt><dd data-sum-shipping>—</dd></div>
  <div class="grand"><dt>Total</dt><dd data-sum-total>—</dd></div>
</dl>`;
const couponBox = () => html`<form class="coupon-box" data-coupon-form novalidate>
  <label class="sr-only" for="coupon-code">Coupon code</label>
  <input id="coupon-code" name="coupon" maxlength="30" placeholder="Coupon code" autocomplete="off" autocapitalize="characters">
  <button class="btn btn-outline btn-sm" type="submit">Apply</button>
  <p class="coupon-msg" role="status" data-coupon-msg></p>
</form>`;

export function cartPage(ctx) {
  const body = html`
  <section class="page-hero slim"><div class="container"><h1>Your Cart</h1></div></section>
  <section class="section-sm"><div class="container cart-layout" data-cart-page>
    <div class="cart-lines card" data-cart-lines><p class="loading">Loading your cart…</p></div>
    <aside class="card summary" data-cart-summary hidden>
      <h2 class="h3">Order summary</h2>
      ${couponBox()}
      ${totalsBlock()}
      <p class="form-error" role="alert" data-cart-error hidden></p>
      <a class="btn btn-primary btn-block" href="/checkout" data-to-checkout>Proceed to Checkout</a>
      <button type="button" class="btn btn-wa btn-block" data-cart-wa>${icon("whatsapp")}<span>Share Cart on WhatsApp</span></button>
      <a class="link mt" href="/shop">← Continue shopping</a>
    </aside>
  </div></section>`;
  return { title: `Your Cart | ${BRAND}`, description: "Review the items in your cart.", path: "/cart", noindex: true, body, scripts: ["/assets/js/cart-page.js"] };
}

export function wishlistPage() {
  const body = html`
  <section class="page-hero slim"><div class="container"><h1>Your Wishlist</h1><p>Products you have saved on this device.</p></div></section>
  <section class="section-sm"><div class="container"><div class="product-grid" data-wishlist><p class="loading">Loading…</p></div></div></section>`;
  return { title: `Wishlist | ${BRAND}`, description: "Your saved products.", path: "/wishlist", noindex: true, body, scripts: ["/assets/js/wishlist.js"] };
}

export function checkoutPage(ctx) {
  const ship = ctx.settings.shipping;
  const a = ctx.account;
  const body = html`
  <section class="page-hero slim"><div class="container"><h1>Checkout</h1><p>Fill in your details, choose how to pay and place your order.</p></div></section>
  <section class="section-sm"><div class="container checkout-layout" data-checkout>
    <form class="card form" data-checkout-form novalidate>
      <h2 class="h3">1. Your details</h2>
      <div class="form-grid">
        <div class="field"><label for="co-name">Full name *</label><input id="co-name" name="name" required minlength="2" maxlength="80" autocomplete="name" value="${a ? a.name : ""}"></div>
        <div class="field"><label for="co-phone">Mobile number *</label><input id="co-phone" name="phone" type="tel" required maxlength="16" inputmode="tel" autocomplete="tel" placeholder="10-digit mobile" value="${a ? a.phone : ""}"></div>
        <div class="field"><label for="co-email">Email <span class="opt">(optional)</span></label><input id="co-email" name="email" type="email" maxlength="120" autocomplete="email" value="${a ? a.email : ""}"></div>
        <div class="field"><label for="co-business">Shop / business name <span class="opt">(optional)</span></label><input id="co-business" name="business" maxlength="120" autocomplete="organization"></div>
        <div class="field span-2"><label for="co-gstin">GSTIN <span class="opt">(optional — for your GST invoice)</span></label><input id="co-gstin" name="gstin" maxlength="15" pattern="[0-9]{2}[A-Za-z0-9]{13}" autocapitalize="characters" placeholder="15-character GSTIN"></div>
      </div>
      <h2 class="h3">2. Shipping address</h2>
      <div class="form-grid">
        <div class="field span-2"><label for="co-address">Address *</label><textarea id="co-address" name="address" rows="2" required minlength="10" maxlength="240" autocomplete="street-address" placeholder="Shop / house no., street, area, landmark"></textarea></div>
        <div class="field"><label for="co-city">City *</label><input id="co-city" name="city" required maxlength="60" autocomplete="address-level2"></div>
        <div class="field"><label for="co-state">State *</label><input id="co-state" name="state" required maxlength="40" autocomplete="address-level1" value="Punjab"></div>
        <div class="field"><label for="co-pincode">Pincode *</label><input id="co-pincode" name="pincode" required inputmode="numeric" maxlength="6" pattern="[1-9][0-9]{5}" autocomplete="postal-code"></div>
        <div class="field span-2"><label class="check"><input type="checkbox" name="billing_different" data-billing-toggle> Billing address is different from shipping address</label></div>
      </div>
      <div class="form-grid" data-billing hidden>
        <div class="field span-2"><label for="co-baddress">Billing address *</label><textarea id="co-baddress" name="billing_address" rows="2" minlength="10" maxlength="240" data-billing-req></textarea></div>
        <div class="field"><label for="co-bcity">Billing city *</label><input id="co-bcity" name="billing_city" maxlength="60" data-billing-req></div>
        <div class="field"><label for="co-bstate">Billing state *</label><input id="co-bstate" name="billing_state" maxlength="40" data-billing-req></div>
        <div class="field"><label for="co-bpincode">Billing pincode *</label><input id="co-bpincode" name="billing_pincode" inputmode="numeric" maxlength="6" pattern="[1-9][0-9]{5}" data-billing-req></div>
      </div>
      <div class="form-grid">
        <div class="field span-2"><label for="co-notes">Order notes <span class="opt">(optional)</span></label><textarea id="co-notes" name="notes" rows="2" maxlength="500" placeholder="Transport name, delivery timing, sizes or colours…"></textarea></div>
      </div>
      <h2 class="h3">3. Payment method</h2>
      <fieldset class="pay-methods" data-pay-methods><legend class="sr-only">Payment method</legend><p class="loading">Loading payment options…</p></fieldset>
      <p class="form-error" role="alert" data-checkout-error hidden></p>
      <div class="pay-ctas">
        <button class="btn btn-primary btn-lg" type="submit" data-pay disabled>Place Order</button>
      </div>
      <p class="fine">By placing an order you agree to our <a href="/terms">Terms</a>, <a href="/shipping-policy">Shipping</a> and <a href="/refund-policy">Returns</a> policies. Card, UPI and net banking payments are processed securely by Razorpay — we never see or store your card details.</p>
    </form>
    <aside class="card summary" data-checkout-summary>
      <h2 class="h3">Your order</h2>
      <ul class="mini-lines" data-mini-lines><li class="loading">Loading…</li></ul>
      ${couponBox()}
      ${totalsBlock()}
      ${ship.note ? html`<p class="fine">${ship.note}</p>` : ""}
    </aside>
  </div></section>`;
  return { title: `Checkout | ${BRAND}`, description: "Secure checkout.", path: "/checkout", noindex: true, body, scripts: ["/assets/js/checkout.js"] };
}

const METHOD_NAMES = { razorpay: "Online payment (Razorpay)", upi: "UPI", cod: "Cash on delivery", bank: "Bank transfer", confirm: "Pay after confirmation" };
export const STATUS_NAMES = { pending: "Order received", confirmed: "Confirmed", processing: "Being packed", dispatched: "Dispatched", delivered: "Delivered", cancelled: "Cancelled" };
export const PAY_NAMES = { unpaid: "Not paid yet", awaiting: "Awaiting payment confirmation", paid: "Paid", failed: "Payment failed", refunded: "Refunded" };

function orderHeadline(o) {
  const online = Boolean(o.razorpay_order_id);
  if (o.status === "cancelled") return { cls: "bad", title: "Order cancelled", text: "This order has been cancelled. Message us if you have any questions." };
  if (o.payment_status === "paid") return { cls: "ok", title: "Payment received — thank you!", text: "Your order is confirmed. We'll pack it and share the dispatch details with you." };
  if (online && o.payment_status === "failed") return { cls: "bad", title: "Payment not completed", text: "The payment for this order failed or was cancelled. Your cart has been kept so you can try again." };
  if (online) return { cls: "wait", title: "Awaiting payment", text: "We haven't received a confirmed payment for this order yet. If money was deducted, don't pay again — message us with your order reference." };
  if (o.payment_method === "bank") return { cls: "ok", title: "Order placed — complete your bank transfer", text: "Transfer the total to the account below and share the reference on WhatsApp. We confirm the order as soon as the money arrives." };
  if (o.payment_method === "upi") return { cls: "ok", title: "Order placed — complete your UPI payment", text: "Pay the total to the UPI ID below and share the screenshot on WhatsApp. We confirm the order as soon as the money arrives." };
  if (o.payment_method === "confirm") return { cls: "ok", title: "Bulk order received", text: "Thank you! Our team will call or WhatsApp you to confirm availability, delivery time and payment." };
  return { cls: "ok", title: "Order placed — pay on delivery", text: "Thank you! We'll confirm your order on phone or WhatsApp and you pay in cash when it is delivered." };
}

export function orderPage(ctx, { order }) {
  const items = parseJson(order.items, []);
  const event = parseJson(order.event, {});
  const st = orderHeadline(order);
  const pay = ctx.settings.payments;
  const msg = `Hello Wholesale Ludhiana! My order reference is ${order.ref}.`;
  const waiting = order.payment_status === "awaiting" && order.status !== "cancelled";
  const body = html`
  <section class="section"><div class="container narrow">
    <div class="card order-card status-${st.cls}" data-order-status="${order.status}" data-payment-status="${order.payment_status}" data-online="${order.razorpay_order_id ? 1 : 0}">
      <span class="status-icon">${icon(st.cls === "bad" ? "close" : "check")}</span>
      <h1 class="h2">${st.title}</h1>
      <p>${st.text}</p>
      ${waiting && order.payment_method === "bank" ? html`<dl class="pay-box"><div><dt>Account name</dt><dd>${pay.bank_account_name}</dd></div><div><dt>Account number</dt><dd>${pay.bank_account_number}</dd></div><div><dt>IFSC</dt><dd>${pay.bank_ifsc}</dd></div>${pay.bank_name ? html`<div><dt>Bank</dt><dd>${pay.bank_name}</dd></div>` : ""}<div><dt>Amount</dt><dd>${rupees(order.total_paise)}</dd></div><div><dt>Reference</dt><dd>${order.ref}</dd></div></dl>` : ""}
      ${waiting && order.payment_method === "upi" ? html`<dl class="pay-box"><div><dt>UPI ID</dt><dd>${pay.upi_id}</dd></div><div><dt>Amount</dt><dd>${rupees(order.total_paise)}</dd></div><div><dt>Note</dt><dd>${order.ref}</dd></div></dl>
        <a class="btn btn-primary upi-link" href="upi://pay?pa=${encodeURIComponent(pay.upi_id)}&amp;pn=${encodeURIComponent(ctx.settings.store.name)}&amp;am=${(order.total_paise / 100).toFixed(2)}&amp;cu=INR&amp;tn=${encodeURIComponent(order.ref)}">Open UPI app to pay</a>` : ""}
      <dl class="order-meta">
        <div><dt>Order reference</dt><dd data-order-ref>${order.ref}</dd></div>
        <div><dt>Order status</dt><dd>${STATUS_NAMES[order.status] || order.status}</dd></div>
        <div><dt>Payment</dt><dd>${METHOD_NAMES[order.payment_method] || order.payment_method} — ${PAY_NAMES[order.payment_status] || order.payment_status}</dd></div>
        ${order.razorpay_payment_id ? html`<div><dt>Payment ID</dt><dd data-payment-id>${order.razorpay_payment_id}</dd></div>` : ""}
        <div><dt>Name</dt><dd>${order.customer_name}</dd></div>
        <div><dt>Deliver to</dt><dd>${order.city}, ${order.state} ${order.pincode}</dd></div>
        ${event.name ? html`<div><dt>Event</dt><dd>${event.name}${event.date ? " — " + event.date : ""}</dd></div>` : ""}
        <div><dt>Placed on</dt><dd>${order.created_at} UTC</dd></div>
      </dl>
      <div class="table-wrap"><table class="order-items"><thead><tr><th scope="col">Item</th><th scope="col">Qty</th><th scope="col" class="num">Rate</th><th scope="col" class="num">Amount</th></tr></thead><tbody>
        ${items.map((i) => html`<tr><td>${i.name}${i.variant_label ? " — " + i.variant_label : ""}</td><td>${i.qty} ${units(i.unit, i.qty)}</td><td class="num">${rupees(i.unit_paise)}</td><td class="num">${rupees(i.line_paise)}</td></tr>`)}
      </tbody><tfoot>
        <tr><th scope="row" colspan="3">Subtotal</th><td class="num">${rupees(order.subtotal_paise)}</td></tr>
        ${order.discount_paise ? html`<tr><th scope="row" colspan="3">Coupon ${order.coupon}</th><td class="num">− ${rupees(order.discount_paise)}</td></tr>` : ""}
        ${order.gst_paise ? html`<tr><th scope="row" colspan="3">GST${order.gst_inclusive ? " (included in prices)" : ""}</th><td class="num">${rupees(order.gst_paise)}</td></tr>` : ""}
        <tr><th scope="row" colspan="3">Delivery charges</th><td class="num">${order.shipping_paise ? rupees(order.shipping_paise) : "Free / to be confirmed"}</td></tr>
        <tr class="grand"><th scope="row" colspan="3">Total</th><td class="num" data-order-total>${rupees(order.total_paise)}</td></tr>
      </tfoot></table></div>
      <div class="hero-ctas center">
        <a class="btn btn-wa" href="${waLink(ctx.settings.store.whatsapp, msg)}" target="_blank" rel="noopener">${icon("whatsapp")}<span>Message us about this order</span></a>
        <a class="btn btn-outline" href="/shop">Continue shopping</a>
      </div>
    </div>
  </div></section>`;
  return { title: `Order ${order.ref} | ${BRAND}`, description: "Your order.", noindex: true, body, scripts: ["/assets/js/order.js"] };
}

// --------------------------------------------------------------------------- Account
export function accountPage(ctx, { orders }) {
  const a = ctx.account;
  const body = a ? html`
  <section class="page-hero slim"><div class="container"><h1>My Account</h1><p>${a.name} • ${a.phone}</p></div></section>
  <section class="section-sm"><div class="container narrow">
    <div class="card form">
      <div class="row-head"><h2 class="h3">My orders</h2><button type="button" class="btn btn-outline btn-sm" data-logout>Sign out</button></div>
      ${orders.length ? html`<div class="table-wrap"><table class="order-items"><thead><tr><th scope="col">Order</th><th scope="col">Date</th><th scope="col">Status</th><th scope="col">Payment</th><th scope="col" class="num">Total</th></tr></thead><tbody>
        ${orders.map((o) => html`<tr><td><a href="/order/${o.ref}">${o.ref}</a></td><td>${o.created_at.slice(0, 10)}</td><td>${STATUS_NAMES[o.status] || o.status}</td><td>${PAY_NAMES[o.payment_status] || o.payment_status}</td><td class="num">${rupees(o.total_paise)}</td></tr>`)}
      </tbody></table></div>` : html`<p class="muted">You have no orders yet. Orders you place while signed in appear here.</p><a class="btn btn-primary" href="/shop">Start shopping</a>`}
    </div>
  </div></section>` : html`
  <section class="page-hero slim"><div class="container"><h1>Login or Register</h1><p>An account is optional — it lets you see your past orders. You can always check out as a guest.</p></div></section>
  <section class="section-sm"><div class="container contact-grid">
    <form class="card form" data-account-form="login" novalidate>
      <h2 class="h3">Sign in</h2>
      <div class="field"><label for="l-phone">Mobile number *</label><input id="l-phone" name="phone" type="tel" required inputmode="tel" maxlength="16" autocomplete="username"></div>
      <div class="field"><label for="l-pass">Password *</label><input id="l-pass" name="password" type="password" required minlength="8" maxlength="100" autocomplete="current-password"></div>
      <button class="btn btn-primary" type="submit">Sign in</button>
      <p class="form-status" role="status" data-form-status></p>
    </form>
    <form class="card form" data-account-form="register" novalidate>
      <h2 class="h3">Create an account</h2>
      <div class="field"><label for="r-name">Your name *</label><input id="r-name" name="name" required minlength="2" maxlength="80" autocomplete="name"></div>
      <div class="field"><label for="r-phone">Mobile number *</label><input id="r-phone" name="phone" type="tel" required inputmode="tel" maxlength="16" autocomplete="tel"></div>
      <div class="field"><label for="r-email">Email <span class="opt">(optional)</span></label><input id="r-email" name="email" type="email" maxlength="120" autocomplete="email"></div>
      <div class="field"><label for="r-pass">Password * <span class="opt">(at least 8 characters)</span></label><input id="r-pass" name="password" type="password" required minlength="8" maxlength="100" autocomplete="new-password"></div>
      <button class="btn btn-navy" type="submit">Create account</button>
      <p class="form-status" role="status" data-form-status></p>
    </form>
  </div></section>`;
  return { title: `My Account | ${BRAND}`, description: "Sign in to see your orders.", path: "/account", noindex: true, body, scripts: ["/assets/js/account.js"] };
}

// --------------------------------------------------------------------------- Policies
const POLICIES = {
  "shipping-policy": { key: "shipping", title: "Shipping Policy", text: `Orders are packed and dispatched from Ludhiana, Punjab.\n\nDelivery charges are shown at checkout. For outstation orders, freight is confirmed with you on phone or WhatsApp before dispatch and goods are sent by the transport of your choice wherever possible.\n\nDispatch time depends on the product and quantity; most in-stock orders are dispatched within 1–3 working days. Langar and bhandara orders are delivered on the event date agreed with you.\n\nPlease check the goods at the time of delivery and report any shortage or damage within 48 hours.` },
  "refund-policy": { key: "refund", title: "Returns & Refunds", text: `Please check your goods when they arrive. If anything is damaged, missing or different from your order, message us on WhatsApp within 48 hours with photos and your order reference.\n\nApproved returns are replaced or refunded to the original payment method. Refunds for online payments are processed through Razorpay and usually reach your account within 5–7 working days.\n\nFood items, cut fabric, cosmetics that have been opened and items made to order cannot be returned unless they arrived damaged.\n\nOrders can be cancelled before dispatch; after dispatch, the return process above applies.` },
  "privacy-policy": { key: "privacy", title: "Privacy Policy", text: `We collect your name, mobile number, email, business details and address only to process, deliver and support your orders.\n\nOnline payments are processed by Razorpay. We never see or store your card, UPI PIN or net banking details.\n\nWe do not sell or share your personal details with third parties, other than delivery partners and the payment gateway as needed to complete your order.\n\nYour cart and wishlist are stored in your own browser. To ask for your details to be corrected or deleted, contact us on WhatsApp.` },
  terms: { key: "terms", title: "Terms & Conditions", text: `All products on this website are listed and sold by Wholesale Ludhiana. This is a wholesale store for retailers, shopkeepers, distributors, businesses and bulk buyers.\n\nPrices are wholesale rates in Indian Rupees and may change without notice. Minimum order quantities apply as shown on each product. GST is charged as shown at checkout.\n\nProducts marked "price on request" are confirmed on WhatsApp. An order is confirmed once payment is received, or once our team confirms a cash-on-delivery or bulk order.\n\nProduct photos are for reference; colours and packaging may vary slightly. Any dispute is subject to the jurisdiction of the courts at Ludhiana, Punjab.` },
};
export const POLICY_KEYS = Object.keys(POLICIES);

export function policyPage(ctx, key) {
  const p = POLICIES[key];
  const crumbs = [{ name: "Home", url: "/" }, { name: p.title, url: "/" + key }];
  const body = html`
  <section class="page-hero slim"><div class="container">${breadcrumbs(crumbs)}<h1>${p.title}</h1></div></section>
  <section class="section"><div class="container narrow prose">${paras(ctx.settings.pages[p.key] || p.text)}</div></section>`;
  return { title: `${p.title} | ${BRAND}`, description: `${p.title} of ${BRAND}, the wholesale store in Ludhiana.`, path: "/" + key, body, jsonLd: [breadcrumbLd(crumbs, ctx.origin)] };
}

export function notFoundPage() {
  const body = html`<section class="section"><div class="container narrow center">
    <h1>Page not found</h1><p>Sorry, we couldn't find that page. It may have been moved or the product is no longer listed.</p>
    <div class="hero-ctas center"><a class="btn btn-primary" href="/shop">Browse all products</a><a class="btn btn-outline" href="/">Go to homepage</a></div>
  </div></section>`;
  return { title: `Page not found | ${BRAND}`, description: "Page not found.", noindex: true, body };
}
