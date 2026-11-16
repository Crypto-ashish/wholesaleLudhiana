// Site-wide behaviour: header, mobile nav, cart drawer + count, add to cart,
// buy now, wishlist and quantity steppers.
import { getCart, addItem, setQty, removeItem, count, snapshotSubtotal, linePrice, getWishlist, isWished, toggleWish } from "./lib/cart.js";
import { rupees } from "./lib/format.js";
import { toast, bindSteppers, esc } from "./lib/ui.js";

const $ = (s, r = document) => r.querySelector(s);

// ---- header shadow
const header = $("[data-header]");
const onScroll = () => header && header.classList.toggle("is-scrolled", window.scrollY > 8);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// ---- mobile navigation
const nav = $("[data-nav]");
const navToggle = $("[data-nav-toggle]");
const navBackdrop = $("[data-nav-backdrop]");
function setNav(open) {
  if (!nav) return;
  nav.classList.toggle("is-open", open);
  navToggle && navToggle.setAttribute("aria-expanded", String(open));
  navBackdrop.hidden = !open;
  requestAnimationFrame(() => navBackdrop.classList.toggle("is-on", open));
  document.body.style.overflow = open ? "hidden" : "";
  if (open) nav.querySelector("a")?.focus();
}
navToggle && navToggle.addEventListener("click", () => setNav(true));
$("[data-nav-close]") && $("[data-nav-close]").addEventListener("click", () => { setNav(false); navToggle.focus(); });
navBackdrop && navBackdrop.addEventListener("click", () => setNav(false));

// ---- cart drawer
const drawer = $("[data-drawer]");
const drawerBackdrop = $("[data-drawer-backdrop]");
let lastFocus = null;
function setDrawer(open) {
  if (!drawer) return;
  if (open) { lastFocus = document.activeElement; renderDrawer(); }
  drawer.classList.toggle("is-open", open);
  drawer.setAttribute("aria-hidden", String(!open));
  drawerBackdrop.hidden = !open;
  requestAnimationFrame(() => drawerBackdrop.classList.toggle("is-on", open));
  document.body.style.overflow = open ? "hidden" : "";
  if (open) drawer.focus();
  else if (lastFocus) lastFocus.focus();
}
document.addEventListener("click", (e) => {
  const opener = e.target.closest("[data-cart-open]");
  const onCartPage = location.pathname === "/cart" || location.pathname === "/checkout";
  if (opener && !onCartPage) { e.preventDefault(); setDrawer(true); }
});
$("[data-drawer-close]") && $("[data-drawer-close]").addEventListener("click", () => setDrawer(false));
drawerBackdrop && drawerBackdrop.addEventListener("click", () => setDrawer(false));
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (drawer && drawer.classList.contains("is-open")) setDrawer(false);
  if (nav && nav.classList.contains("is-open")) setNav(false);
});

function lineHtml(i) {
  const unit = linePrice(i);
  const meta = [i.variantLabel, unit !== null ? rupees(unit) + " / " + i.unit : ""].filter(Boolean).join(" • ");
  const price = unit !== null ? rupees(unit * i.qty) : "";
  return `<div class="cart-line" data-key="${esc(i.key)}">
    ${i.image ? `<img src="${esc(i.image)}" width="64" height="64" alt="" loading="lazy">` : `<span class="img-ph sm"></span>`}
    <div><a class="cl-name" href="/product/${esc(i.slug)}">${esc(i.name)}</a><span class="cl-meta">${esc(meta)}</span></div>
    <div class="cl-controls">
      <div class="qty qty-sm" data-qty><button type="button" class="qty-btn" data-dec aria-label="Decrease quantity">−</button><input type="number" min="${i.moq || 1}" max="100000" value="${i.qty}" aria-label="Quantity of ${esc(i.name)}" data-line-qty><button type="button" class="qty-btn" data-inc aria-label="Increase quantity">+</button></div>
      <span class="cl-price">${price}</span>
      <button type="button" class="cl-remove" data-line-remove>Remove</button>
    </div>
  </div>`;
}

function renderDrawer() {
  const box = $("[data-drawer-items]");
  if (!box) return;
  const items = getCart();
  box.innerHTML = items.length
    ? items.map(lineHtml).join("")
    : `<div class="empty-cart"><p><strong>Your cart is empty.</strong></p><p class="fine">Browse wholesale products and add them here.</p><a class="btn btn-primary btn-sm" href="/shop">Start shopping</a></div>`;
  $("[data-drawer-subtotal]").textContent = rupees(snapshotSubtotal(items));
  drawer.querySelector(".drawer-foot").hidden = !items.length;
}

// Drawer line controls (delegated)
drawer && drawer.addEventListener("change", (e) => {
  const input = e.target.closest("[data-line-qty]");
  if (input) setQty(input.closest("[data-key]").dataset.key, Number(input.value));
});
drawer && drawer.addEventListener("click", (e) => {
  const rm = e.target.closest("[data-line-remove]");
  if (rm) removeItem(rm.closest("[data-key]").dataset.key);
});

function updateCount(bump = false) {
  const n = count();
  document.querySelectorAll("[data-cart-count]").forEach((el) => {
    el.textContent = n > 99 ? "99+" : String(n);
    el.hidden = n === 0;
    if (bump) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
  });
  const btn = $("[data-cart-open]");
  btn && btn.setAttribute("aria-label", "Cart, " + n + " item" + (n === 1 ? "" : "s"));
}
document.addEventListener("cart:change", () => {
  updateCount(true);
  if (drawer && drawer.classList.contains("is-open")) renderDrawer();
});
updateCount();

// ---- add to cart / buy now (product cards and the product page)
function readSelection(container) {
  const data = JSON.parse(container.dataset.cartItem);
  const variant = container.querySelector("[data-variant]")?.value || "";
  const qtyInput = container.querySelector("[data-qty] input");
  const moq = data.moq || 1;
  const qty = Math.max(moq, Math.min(100000, Math.round(Number(qtyInput && qtyInput.value) || moq)));
  return { data, variant, qty, qtyInput };
}

document.addEventListener("click", (e) => {
  const add = e.target.closest("[data-add-to-cart]");
  const buy = e.target.closest("[data-buy-now]");
  const btn = add || buy;
  if (!btn) return;
  const container = btn.closest("[data-cart-item]");
  if (!container) return;
  const { data, variant, qty, qtyInput } = readSelection(container);
  if (data.variants && data.variants.length) {
    const v = data.variants.find((x) => x.id === variant);
    if (!v || v.price === null || !v.available) { toast("Please choose an available option", { type: "bad" }); return; }
  }
  if (data.stock !== null && data.stock !== undefined && qty > data.stock) { toast("Only " + data.stock + " " + data.unit + " in stock", { type: "bad" }); return; }
  addItem(data, { variant, qty });
  if (buy) { location.href = "/checkout"; return; }
  toast(qty + " " + data.unit + " × " + data.name + " added to cart", { link: { href: "/cart", label: "View cart" } });
  if (qtyInput) { qtyInput.value = String(data.moq || 1); qtyInput.dispatchEvent(new Event("input", { bubbles: true })); }
});

// ---- wishlist hearts
function paintWishes() {
  document.querySelectorAll("[data-wish]").forEach((b) => {
    const on = isWished(JSON.parse(b.dataset.wish).slug);
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-pressed", String(on));
    const label = b.querySelector("[data-wish-label]");
    if (label) label.textContent = on ? "Saved to Wishlist" : "Add to Wishlist";
  });
  const n = getWishlist().length;
  document.querySelectorAll("[data-wish-count]").forEach((el) => { el.textContent = String(n); el.hidden = n === 0; });
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-wish]");
  if (!b) return;
  e.preventDefault();
  toast(toggleWish(JSON.parse(b.dataset.wish)) ? "Saved to your wishlist" : "Removed from wishlist");
});
document.addEventListener("wish:change", paintWishes);
paintWishes();

// ---- account sign out
document.addEventListener("click", async (e) => {
  if (!e.target.closest("[data-logout]")) return;
  await fetch("/api/account/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  location.href = "/account";
});

bindSteppers();
