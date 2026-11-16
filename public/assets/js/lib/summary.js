// Shared order-summary rendering (cart, checkout and bulk calculator) + coupon box.
import { rupees } from "./format.js";
import { getCoupon, setCoupon } from "./cart.js";

const set = (sel, text, root = document) => { const el = root.querySelector(sel); if (el) el.textContent = text; };

export function renderTotals(quote, root = document) {
  const q = quote || {};
  const has = Boolean(quote);
  set("[data-sum-subtotal]", has ? rupees(q.subtotal_paise) || "₹0" : "—", root);
  const dRow = root.querySelector("[data-discount-row]");
  if (dRow) { dRow.hidden = !(has && q.discount_paise > 0); set("[data-sum-discount]", has ? "− " + rupees(q.discount_paise) : "", root); }
  const gRow = root.querySelector("[data-gst-row]");
  if (gRow) {
    gRow.hidden = has && !q.gst_paise;
    set("[data-gst-label]", q.gst_inclusive ? "GST (included in prices)" : "GST", root);
    set("[data-sum-gst]", has ? rupees(q.gst_paise) : "—", root);
  }
  set("[data-sum-shipping]", has ? (q.shipping_paise ? rupees(q.shipping_paise) : "Free / to be confirmed") : "—", root);
  set("[data-sum-total]", has ? rupees(q.total_paise) || "₹0" : "—", root);
}

// Coupon form: stores the code and asks the page to re-quote.
export function bindCoupon(onChange) {
  const form = document.querySelector("[data-coupon-form]");
  if (!form) return () => {};
  const input = form.elements.coupon;
  const msg = form.querySelector("[data-coupon-msg]");
  const btn = form.querySelector("button");
  input.value = getCoupon();
  const paint = () => { btn.textContent = getCoupon() ? "Remove" : "Apply"; input.readOnly = Boolean(getCoupon()); };
  paint();
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (getCoupon()) { setCoupon(""); input.value = ""; msg.textContent = ""; }
    else setCoupon(input.value.trim().toUpperCase());
    paint();
    onChange();
  });
  // Called with each server response to show whether the code worked.
  return (res) => {
    if (!getCoupon()) { msg.textContent = ""; return; }
    const ok = res && res.ok && res.quote && res.quote.coupon;
    msg.className = "coupon-msg " + (ok ? "ok" : "bad");
    msg.textContent = ok ? "Coupon " + res.quote.coupon + " applied — you save " + rupees(res.quote.discount_paise) : (res && res.coupon_message) || "This coupon could not be applied.";
  };
}
