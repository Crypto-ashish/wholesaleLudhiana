// /cart — lines from local storage, totals from the server quote.
import { getCart, setQty, removeItem, payload, refreshSnapshot, getCoupon, linePrice } from "./lib/cart.js";
import { rupees } from "./lib/format.js";
import { api, esc, openWhatsApp } from "./lib/ui.js";
import { waUrl, cartMessage } from "./lib/wa.js";
import { renderTotals, bindCoupon } from "./lib/summary.js";

const linesBox = document.querySelector("[data-cart-lines]");
const summary = document.querySelector("[data-cart-summary]");
const errBox = document.querySelector("[data-cart-error]");
const toCheckout = document.querySelector("[data-to-checkout]");
let lastQuote = null;
let seq = 0;

function render(items, quote, products = {}, error = "") {
  if (!items.length) {
    linesBox.innerHTML = `<div class="empty-cart"><h2 class="h3">Your cart is empty</h2><p>Browse wholesale products across all categories.</p><a class="btn btn-primary" href="/shop">Shop now</a></div>`;
    summary.hidden = true;
    return;
  }
  const priced = new Map((quote ? quote.lines : []).map((l) => [l.slug + "|" + l.variant, l]));
  linesBox.innerHTML = items.map((i) => {
    const p = products[i.slug];
    const line = priced.get(i.key);
    const unit = line ? line.unit_paise : linePrice(i);
    let warn = "";
    if (Object.keys(products).length && !p) warn = "This item is no longer available — please remove it.";
    else if (p && !p.in_stock) warn = "Out of stock — please remove it.";
    else if (p && p.stock !== null && i.qty > p.stock) warn = "Only " + p.stock + " " + p.unit + " in stock — please reduce the quantity.";
    else if (unit === null) warn = "Price on request — remove it and enquire on WhatsApp.";
    const next = (i.tiers || []).filter((t) => t.min > i.qty && !i.own).sort((a, b) => a.min - b.min)[0];
    return `<div class="cart-line" data-key="${esc(i.key)}">
      ${i.image ? `<img src="${esc(i.image)}" width="76" height="76" alt="" loading="lazy">` : `<span class="img-ph sm"></span>`}
      <div><a class="cl-name" href="/product/${esc(i.slug)}">${esc(i.name)}</a><span class="cl-meta">${esc(i.variantLabel || "")}</span>
        ${unit !== null ? `<span class="cl-meta">${rupees(unit)} / ${esc(i.unit)} • min ${i.moq}</span>` : ""}
        ${next ? `<span class="cl-tip">Buy ${next.min}+ to pay ${rupees(next.price_paise)} / ${esc(i.unit)}</span>` : ""}</div>
      <div class="cl-controls">
        <div class="qty" data-qty><button type="button" class="qty-btn" data-dec aria-label="Decrease quantity">−</button><input type="number" min="${i.moq || 1}" max="100000" value="${i.qty}" aria-label="Quantity of ${esc(i.name)}" data-line-qty><button type="button" class="qty-btn" data-inc aria-label="Increase quantity">+</button></div>
        <span class="cl-price">${unit !== null ? rupees(unit * i.qty) : ""}</span>
        <button type="button" class="cl-remove" data-line-remove>Remove</button>
      </div>
      ${warn ? `<p class="cl-warn">${esc(warn)}</p>` : ""}
    </div>`;
  }).join("");
  summary.hidden = false;
  renderTotals(quote, summary);
  errBox.hidden = !error;
  errBox.textContent = error;
  toCheckout.classList.toggle("is-loading", !quote);
  toCheckout.setAttribute("aria-disabled", String(!quote));
}

let couponResult = () => {};
async function refresh() {
  const items = getCart();
  const mine = ++seq;
  if (!items.length) { render(items, null); return; }
  try {
    const res = await api("/api/cart/quote", { items: payload(items), coupon: getCoupon() });
    if (mine !== seq) return;
    refreshSnapshot(res.products || {});
    lastQuote = res.ok ? res.quote : null;
    render(getCart(), lastQuote, res.products || {}, res.ok ? "" : res.error);
    couponResult(res);
  } catch (e) {
    if (mine === seq) render(items, null, {}, e.message);
  }
}
couponResult = bindCoupon(refresh);

linesBox.addEventListener("change", (e) => {
  const input = e.target.closest("[data-line-qty]");
  if (input) setQty(input.closest("[data-key]").dataset.key, Number(input.value));
});
linesBox.addEventListener("click", (e) => {
  const rm = e.target.closest("[data-line-remove]");
  if (rm) removeItem(rm.closest("[data-key]").dataset.key);
});
toCheckout.addEventListener("click", (e) => { if (!lastQuote) e.preventDefault(); });
document.querySelector("[data-cart-wa]").addEventListener("click", () => {
  const q = lastQuote || {
    lines: getCart().map((i) => ({ name: i.name, variant_label: i.variantLabel, qty: i.qty, unit: i.unit, unit_paise: linePrice(i), line_paise: linePrice(i) !== null ? linePrice(i) * i.qty : null })),
  };
  openWhatsApp(waUrl(document.body.dataset.wa, cartMessage(q, "")));
});

let t = null;
document.addEventListener("cart:change", () => { clearTimeout(t); t = setTimeout(refresh, 150); });
refresh();
