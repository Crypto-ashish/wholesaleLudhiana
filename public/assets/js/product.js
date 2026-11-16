// Product page: photo gallery + live price for the chosen quantity (quantity slabs).
import { unitPrice } from "./lib/price.js";
import { rupees } from "./lib/format.js";

const gallery = document.querySelector("[data-gallery]");
if (gallery) {
  const main = gallery.querySelector(".pp-img");
  gallery.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-thumb]");
    if (!btn || !main) return;
    main.src = btn.dataset.thumb;
    gallery.querySelectorAll("[data-thumb]").forEach((b) => b.classList.toggle("is-on", b === btn));
  });
}

const form = document.querySelector("[data-product-form]");
if (form) {
  const data = JSON.parse(form.dataset.cartItem);
  const qtyInput = form.querySelector("[data-qty] input");
  const variantSel = form.querySelector("[data-variant]");
  const live = form.querySelector("[data-live-price]");
  const rows = [...document.querySelectorAll("[data-slabs] tbody tr")];
  if (variantSel) {
    const first = [...variantSel.options].find((o) => !o.disabled);
    if (first) variantSel.value = first.value;
  }
  function update() {
    const qty = Math.max(data.moq || 1, Math.round(Number(qtyInput.value) || 0));
    const v = variantSel ? data.variants.find((x) => x.id === variantSel.value) : null;
    const base = v ? v.price : data.price;
    if (base === null || base === undefined) { live.textContent = ""; return; }
    const unit = v && v.own ? base : unitPrice(base, data.tiers, qty);
    live.innerHTML = "";
    const strong = document.createElement("strong");
    strong.textContent = rupees(unit * qty);
    live.append(qty + " × " + rupees(unit) + " = ", strong);
    rows.forEach((r) => {
      const from = Number(r.dataset.from);
      const to = r.dataset.to ? Number(r.dataset.to) : Infinity;
      r.classList.toggle("is-on", !(v && v.own) && qty >= from && qty <= to);
    });
  }
  qtyInput.addEventListener("input", update);
  qtyInput.addEventListener("change", () => { if (Number(qtyInput.value) < (data.moq || 1)) qtyInput.value = String(data.moq || 1); update(); });
  variantSel && variantSel.addEventListener("change", update);
  update();
}
