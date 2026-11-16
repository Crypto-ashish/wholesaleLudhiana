// Order confirmation: clear the cart once the order that came from this
// browser's checkout has gone through (offline order placed, or online payment confirmed).
import { clearCart, setCoupon } from "./lib/cart.js";

const card = document.querySelector("[data-order-status]");
const ref = document.querySelector("[data-order-ref]")?.textContent;
try {
  const done = card && (card.dataset.online === "0" || card.dataset.paymentStatus === "paid");
  if (done && sessionStorage.getItem("wl_last_ref") === ref) {
    clearCart();
    setCoupon("");
    sessionStorage.removeItem("wl_last_ref");
  }
} catch { /* storage unavailable */ }
