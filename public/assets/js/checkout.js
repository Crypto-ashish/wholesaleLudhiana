// /checkout — server quote, details form, payment method, then either Razorpay
// (online, verified by the server) or an offline order (COD / bank transfer / UPI ID).
import { getCart, payload, clearCart, refreshSnapshot, getCoupon, setCoupon } from "./lib/cart.js";
import { rupees } from "./lib/format.js";
import { api, esc, validateForm, formValues, phoneRule, pincodeRule, emailRule, toast } from "./lib/ui.js";
import { renderTotals, bindCoupon } from "./lib/summary.js";

const form = document.querySelector("[data-checkout-form]");
const errBox = document.querySelector("[data-checkout-error]");
const payBtn = form.querySelector("[data-pay]");
const methodsBox = form.querySelector("[data-pay-methods]");
const billingBox = form.querySelector("[data-billing]");
let quote = null;
let working = false;
const SAVE_KEY = "wl_checkout_details";

const METHODS = [
  ["razorpay", "Pay online", "UPI, cards, net banking and wallets — secured by Razorpay"],
  ["upi", "UPI", "Google Pay, PhonePe, Paytm or any UPI app"],
  ["bank", "Bank transfer (NEFT / IMPS)", "Account details are shown after you place the order"],
  ["cod", "Cash on delivery", "Pay in cash when your order arrives"],
];

function showError(msg) {
  errBox.textContent = msg;
  errBox.hidden = !msg;
  if (msg) errBox.scrollIntoView({ behavior: "smooth", block: "center" });
}
const method = () => form.querySelector("input[name=method]:checked")?.value || "";

function paintButton() {
  const m = method();
  payBtn.disabled = working || !quote || !m;
  if (!quote) return;
  payBtn.textContent = m === "razorpay" || (m === "upi" && methodsBox.dataset.upiOnline === "1") ? "Pay " + rupees(quote.total_paise) + " Securely" : "Place Order — " + rupees(quote.total_paise);
}

function renderMethods(pay) {
  const chosen = method();
  const available = METHODS.filter(([id]) => pay[id]);
  methodsBox.dataset.upiOnline = pay.upi_online ? "1" : "0";
  methodsBox.innerHTML = `<legend class="sr-only">Payment method</legend>` + (available.length
    ? available.map(([id, name, hint], i) => `<label class="pay-option"><input type="radio" name="method" value="${id}" ${chosen === id || (!chosen && i === 0) ? "checked" : ""}><span><strong>${esc(name)}</strong><small>${esc(id === "upi" && !pay.upi_online ? "Pay to our UPI ID — shown after you place the order" : hint)}</small></span></label>`).join("")
    : `<p class="notice">Online ordering is being set up. Please share your cart with us on WhatsApp from the <a href="/cart">cart page</a>.</p>`);
  paintButton();
}

let couponResult = () => {};
async function loadQuote() {
  const items = getCart();
  const list = document.querySelector("[data-mini-lines]");
  if (!items.length) {
    list.innerHTML = `<li>Your cart is empty. <a href="/shop">Shop now</a></li>`;
    methodsBox.innerHTML = "";
    quote = null;
    renderTotals(null);
    paintButton();
    return;
  }
  try {
    const res = await api("/api/cart/quote", { items: payload(items), coupon: getCoupon() });
    refreshSnapshot(res.products || {});
    couponResult(res);
    if (!res.ok) {
      showError(res.error + " (update your cart to continue)");
      list.innerHTML = `<li><a href="/cart">Review your cart</a></li>`;
      quote = null;
      paintButton();
      return;
    }
    quote = res.quote;
    const imgs = Object.fromEntries(getCart().map((i) => [i.key, i.image]));
    list.innerHTML = quote.lines.map((l) => {
      const img = imgs[l.slug + "|" + l.variant];
      return `<li>${img ? `<img src="${esc(img)}" width="46" height="46" alt="">` : `<span class="img-ph sm"></span>`}<span class="ml-name">${esc(l.name)}${l.variant_label ? " — " + esc(l.variant_label) : ""}<small>${l.qty} ${esc(l.unit)} × ${rupees(l.unit_paise)}</small></span><strong>${rupees(l.line_paise)}</strong></li>`;
    }).join("");
    renderTotals(quote);
    renderMethods(res.payments || {});
  } catch (e) {
    showError(e.message);
  }
}
couponResult = bindCoupon(loadQuote);
methodsBox.addEventListener("change", paintButton);

// Billing address toggle
const toggle = form.querySelector("[data-billing-toggle]");
function paintBilling() {
  billingBox.hidden = !toggle.checked;
  billingBox.querySelectorAll("[data-billing-req]").forEach((el) => { el.required = toggle.checked; el.disabled = !toggle.checked; });
}
toggle.addEventListener("change", paintBilling);

// Remember details on this device for convenience.
try {
  const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}");
  for (const [k, v] of Object.entries(saved)) {
    const el = form.elements[k];
    if (!el || k === "method") continue;
    if (el.type === "checkbox") el.checked = !!v;
    else if (!el.value || (k === "state" && v)) el.value = v;
  }
} catch { /* storage unavailable */ }
paintBilling();

function customer() {
  const v = formValues(form);
  delete v.method;
  delete v.coupon;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(v)); } catch { /* ignore */ }
  return v;
}
const rules = {
  phone: phoneRule, pincode: pincodeRule, email: emailRule,
  billing_pincode: (v) => (toggle.checked ? pincodeRule(v) : ""),
  gstin: (v) => (!v || /^[0-9]{2}[A-Za-z0-9]{13}$/.test(v) ? "" : "GSTIN should be 15 characters"),
};

let rzpLoader = null;
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  rzpLoader = rzpLoader || new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => { rzpLoader = null; reject(new Error("Couldn't load the payment window. Check your connection and try again.")); };
    document.head.append(s);
  });
  return rzpLoader;
}

function busy(on) {
  working = on;
  payBtn.classList.toggle("is-loading", on);
  paintButton();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("");
  const m = method();
  if (!quote || !m || working) return;
  if (!validateForm(form, rules)) return;
  busy(true);
  const online = m === "razorpay" || (m === "upi" && methodsBox.dataset.upiOnline === "1");
  let order;
  try {
    [order] = await Promise.all([
      api("/api/checkout/place", { items: payload(), customer: customer(), coupon: getCoupon(), method: m }),
      online ? loadRazorpay() : null,
    ]);
  } catch (err) {
    busy(false);
    showError(err.message);
    return;
  }
  try { sessionStorage.setItem("wl_last_ref", order.ref); } catch { /* ignore */ }
  if (!order.online) {
    clearCart();
    setCoupon("");
    location.href = "/order/" + order.ref;
    return;
  }
  const options = {
    key: order.key_id, amount: order.amount, currency: order.currency, order_id: order.order_id,
    name: "Wholesale Ludhiana", description: "Order " + order.ref, prefill: order.prefill, notes: { order_ref: order.ref },
    theme: { color: "#0f2554" },
    handler: async (resp) => {
      try {
        await api("/api/checkout/verify", { ref: order.ref, ...resp });
        clearCart();
        setCoupon("");
        location.href = "/order/" + order.ref;
      } catch {
        busy(false);
        showError("We couldn't confirm your payment automatically. If money was deducted, please don't pay again — message us on WhatsApp with order reference " + order.ref + ".");
      }
    },
    modal: {
      ondismiss: () => {
        busy(false);
        api("/api/checkout/failed", { ref: order.ref, reason: "cancelled" }).catch(() => {});
        toast("Payment cancelled — your cart is saved.");
      },
    },
  };
  if (order.prefer_upi) options.config = { display: { blocks: { upi: { name: "Pay by UPI", instruments: [{ method: "upi" }] } }, sequence: ["block.upi"], preferences: { show_default_blocks: true } } };
  const rzp = new window.Razorpay(options);
  rzp.on("payment.failed", (resp) => {
    const reason = (resp && resp.error && resp.error.description) || "Payment failed";
    busy(false);
    api("/api/checkout/failed", { ref: order.ref, reason }).catch(() => {});
    showError("Payment failed: " + reason + ". Your cart is saved — please try again.");
  });
  rzp.open();
});

loadQuote();
