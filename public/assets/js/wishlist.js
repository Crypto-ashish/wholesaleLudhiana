// /wishlist — products saved on this device.
import { getWishlist, toggleWish } from "./lib/cart.js";
import { rupees } from "./lib/format.js";
import { esc } from "./lib/ui.js";

const box = document.querySelector("[data-wishlist]");
function render() {
  const items = getWishlist();
  box.innerHTML = items.length
    ? items.map((i) => `<article class="product-card"><a class="pc-media" href="/product/${esc(i.slug)}">${i.image ? `<img src="${esc(i.image)}" width="400" height="400" alt="${esc(i.name)}" loading="lazy">` : `<span class="img-ph"></span>`}</a>
        <div class="pc-body"><h2 class="pc-title"><a href="/product/${esc(i.slug)}">${esc(i.name)}</a></h2>
        <div class="pc-foot"><span class="price">${Number.isInteger(i.price) ? rupees(i.price) + `<small> / ${esc(i.unit || "piece")}</small>` : "Price on request"}</span>
        <div class="pc-actions"><a class="btn btn-primary btn-sm" href="/product/${esc(i.slug)}">View product</a><button type="button" class="btn btn-outline btn-sm" data-remove="${esc(i.slug)}">Remove</button></div></div></div></article>`).join("")
    : `<div class="empty-state card wide"><h2 class="h3">Your wishlist is empty</h2><p>Tap the heart on any product to save it here.</p><a class="btn btn-primary" href="/shop">Browse products</a></div>`;
}
box.addEventListener("click", (e) => {
  const b = e.target.closest("[data-remove]");
  if (b) toggleWish({ slug: b.dataset.remove });
});
document.addEventListener("wish:change", render);
render();
