// Reusable UI pieces: icons, product cards, badges, breadcrumbs, WhatsApp links.
import { html, raw, dataJson } from "./html.js";
import { rupees, thumbOf } from "../lib/util.js";

export const ICONS = {
  cart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h15l-1.5 8.5a2 2 0 0 1-2 1.5H9a2 2 0 0 1-2-1.6L5 3H2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.5" cy="20" r="1.4" fill="currentColor"/><circle cx="17.5" cy="20" r="1.4" fill="currentColor"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91C21.95 6.45 17.5 2 12.04 2Zm5.8 14.03c-.24.68-1.43 1.33-1.97 1.38-.5.05-.98.24-3.3-.69-2.8-1.1-4.56-3.95-4.7-4.13-.13-.18-1.12-1.49-1.12-2.84 0-1.35.71-2.02.96-2.29.25-.27.55-.34.73-.34h.52c.17 0 .4-.06.62.47.24.56.79 1.92.86 2.06.07.14.11.3.02.48-.09.18-.14.3-.27.46-.14.16-.29.36-.41.48-.14.14-.28.29-.12.56.16.27.71 1.17 1.52 1.9 1.05.93 1.93 1.22 2.2 1.36.27.14.43.11.59-.07.16-.18.68-.8.86-1.07.18-.27.36-.23.61-.14.25.09 1.59.75 1.86.89.27.14.45.2.52.32.07.11.07.66-.17 1.33Z"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4L19 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15M5 19l7-7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  wheat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22V9M12 9c-2-1-3-3-3-5 2 0 3 1.5 3 3.5M12 9c2-1 3-3 3-5-2 0-3 1.5-3 3.5M12 14c-2-1-3.5-2.5-3.5-4.5 2 0 3.5 1.5 3.5 3.5M12 14c2-1 3.5-2.5 3.5-4.5-2 0-3.5 1.5-3.5 3.5M12 19c-2-1-3.5-2.5-3.5-4.5 2 0 3.5 1.5 3.5 3.5M12 19c2-1 3.5-2.5 3.5-4.5-2 0-3.5 1.5-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M4 4l16 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  oven: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="6" y="9" width="12" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 6.5h1M10 6.5h1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z"/></svg>',
  truck: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 6h11v10H2zM13 9h4.5L21 12.5V16h-8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="6" cy="17.5" r="1.8" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="17" cy="17.5" r="1.8" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  gift: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 12v8h14v-8M12 8v12M12 8c-1.5-3-5-4-5-1.5S10 8 12 8Zm0 0c1.5-3 5-4 5-1.5S14 8 12 8Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  people: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 5a3 3 0 0 1 0 6M18 14c2 .7 3.5 2.8 3.5 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
};
Object.assign(ICONS, {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M21 21l-4.3-4.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  tag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12V4h8l10 10-8 8L3 12z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="7.5" cy="8.5" r="1.2" fill="currentColor"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.800-1-8-4.500-8-9V6l8-3z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8.500 12l2.500 2.500 4.500-5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  box: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l9-5 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  receipt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  calc: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 7h8M8.500 12h.01M12 12h.01M15.500 12h.01M8.500 16h.01M12 16h.01M15.500 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
});
export const icon = (name, cls = "icon") => raw(`<span class="${cls}">${ICONS[name] || ""}</span>`);

export function waLink(number, text) {
  const digits = String(number || "").replace(/\D/g, "");
  return "https://wa.me/" + digits + "?text=" + encodeURIComponent(text);
}

export const UNIT_PLURAL = { piece: "pieces", dozen: "dozen", kg: "kg", packet: "packets", box: "boxes", metre: "metres", roll: "rolls", set: "sets", carton: "cartons" };
export const units = (unit, qty) => (qty === 1 ? unit : UNIT_PLURAL[unit] || unit);

export function badges(p, { max = 2 } = {}) {
  const out = [];
  if (!p.in_stock) out.push(html`<span class="badge badge-muted">Out of stock</span>`);
  const off = p.mrp_paise && p.price_paise && p.mrp_paise > p.price_paise ? Math.round((1 - p.price_paise / p.mrp_paise) * 100) : 0;
  if (off > 0) out.push(html`<span class="badge badge-deal">${off}% off MRP</span>`);
  else if (p.deal) out.push(html`<span class="badge badge-deal">Deal</span>`);
  if (p.is_new) out.push(html`<span class="badge badge-new">New</span>`);
  if (p.featured) out.push(html`<span class="badge badge-gold">Best Seller</span>`);
  return out.slice(0, max + (p.in_stock ? 0 : 1));
}

const PLACEHOLDER = raw('<span class="img-ph" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 8l9-5 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg></span>');

export function productImg(p, { eager = false, cls = "", width = 400 } = {}) {
  if (!p.image) return PLACEHOLDER;
  const alt = `${p.name} — wholesale ${p.category_name ? p.category_name.toLowerCase() + " " : ""}in Ludhiana`;
  return html`<img class="${cls}" src="${thumbOf(p.image, width)}" width="${width}" height="${width}" alt="${alt}" ${raw(eager ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"')}>`;
}

const variantPrices = (p) =>
  p.variants && p.variants.length
    ? p.variants.filter((v) => v.available !== false).map((v) => v.price_paise ?? p.price_paise).filter((x) => x !== null && x !== undefined)
    : p.price_paise !== null && p.price_paise !== undefined ? [p.price_paise] : [];

export function priceLabel(p) {
  const prices = variantPrices(p);
  if (!prices.length) return html`<span class="price price-request">Price on request</span>`;
  const min = Math.min(...prices);
  const from = prices.length > 1 && Math.max(...prices) !== min;
  return html`<span class="price">${from ? "From " : ""}${rupees(min)}<small> / ${p.unit}</small>${p.mrp_paise && p.mrp_paise > min ? html` <s class="mrp">${rupees(p.mrp_paise)}</s>` : ""}</span>`;
}

export const isBuyable = (p) => p.in_stock && variantPrices(p).length > 0;

// Client-side cart payload for a product (display snapshot only; the server
// re-prices everything at checkout).
export function cartData(p) {
  return {
    slug: p.slug, name: p.name, image: thumbOf(p.image), price: p.price_paise, unit: p.unit, moq: p.moq, tiers: p.tiers || [],
    stock: p.track_stock ? p.stock : null,
    variants: (p.variants || []).map((v) => ({ id: v.id, label: v.label, price: v.price_paise ?? p.price_paise, own: v.price_paise !== null && v.price_paise !== undefined, available: v.available !== false })),
  };
}

export function productCard(p, ctx, { headingLevel = 3 } = {}) {
  const url = "/product/" + p.slug;
  const buyable = isBuyable(p);
  const H = raw("h" + headingLevel);
  const enquiry = `Hello Wholesale Ludhiana! Please share the wholesale price for ${p.name}. ${ctx.origin}${url}`;
  const lowest = (p.tiers || []).length && p.price_paise ? Math.min(...p.tiers.map((t) => t.price_paise)) : null;
  return html`<article class="product-card${p.in_stock ? "" : " is-oos"}" data-product="${p.slug}">
    <a class="pc-media" href="${url}" tabindex="-1" aria-hidden="true">
      ${productImg(p)}
      <span class="pc-badges">${badges(p)}</span>
    </a>
    <button type="button" class="wish-btn" aria-label="Add ${p.name} to wishlist" aria-pressed="false" data-wish="${raw(dataJson({ slug: p.slug, name: p.name, image: thumbOf(p.image), price: p.price_paise, unit: p.unit }))}">${icon("heart")}</button>
    <div class="pc-body">
      <p class="pc-cat">${p.brand || p.subcategory_name || p.category_name || ""}</p>
      <${H} class="pc-title"><a href="${url}">${p.name}</a></${H}>
      <div class="pc-foot">
        ${priceLabel(p)}
        <p class="pc-moq">Min. order: ${p.moq} ${units(p.unit, p.moq)}${lowest !== null && lowest < p.price_paise ? html` <span class="pc-low">• as low as ${rupees(lowest)}</span>` : ""}</p>
        ${buyable
          ? p.variants && p.variants.length
            ? html`<div class="pc-actions"><a class="btn btn-outline btn-sm" href="${url}">Select options</a></div>`
            : html`<div class="pc-actions" data-cart-item="${raw(dataJson(cartData(p)))}">
                <button type="button" class="btn btn-primary btn-sm" data-add-to-cart>${icon("cart")}<span>Add to Cart</span></button>
              </div>`
          : html`<div class="pc-actions">
              <a class="btn btn-wa btn-sm" href="${waLink(ctx.settings.store.whatsapp, enquiry)}" target="_blank" rel="noopener" data-wa-enquiry>${icon("whatsapp")}<span>${p.in_stock ? "Ask price" : "Enquire"}</span></a>
            </div>`}
      </div>
    </div>
  </article>`;
}

export function breadcrumbs(items) {
  return html`<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${items.map((it, i) =>
    i === items.length - 1 ? html`<li aria-current="page">${it.name}</li>` : html`<li><a href="${it.url}">${it.name}</a></li>`
  )}</ol></nav>`;
}

export function breadcrumbLd(items, origin) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: origin + it.url })),
  };
}

export function sectionHead({ kicker, title, sub, id, center = true, level = 2 }) {
  const H = raw("h" + level);
  return html`<header class="section-head reveal${center ? " center" : ""}">
    ${kicker ? html`<p class="kicker">${kicker}</p>` : ""}
    <${H} class="section-title"${id ? raw(` id="${id}"`) : ""}>${title}</${H}>
    ${sub ? html`<p class="section-sub">${sub}</p>` : ""}
  </header>`;
}
