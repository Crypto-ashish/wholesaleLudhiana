// Langar & Bhandara bulk order calculator. Totals shown while typing use the same
// slab maths as the server; the server re-prices everything when the order is submitted.
import { unitPrice } from "./lib/price.js";
import { rupees } from "./lib/format.js";
import { api, esc, validateForm, formValues, phoneRule, pincodeRule, futureDateRule, openWhatsApp } from "./lib/ui.js";
import { waUrl, bulkMessage } from "./lib/wa.js";
import { renderTotals } from "./lib/summary.js";

const root = document.querySelector("[data-bulk]");
const items = JSON.parse(root.dataset.items);
const bySlug = Object.fromEntries(items.map((i) => [i.slug, i]));
const form = document.querySelector("[data-bulk-form]");
const errBox = document.querySelector("[data-bulk-error]");
const submitBtn = document.querySelector("[data-bulk-submit]");
const waBtn = document.querySelector("[data-bulk-wa]");
const linesBox = document.querySelector("[data-bulk-lines]");
const summary = document.querySelector(".bulk-summary");
let seq = 0;
let quote = null;

const dateInput = form.elements.event_date;
dateInput.min = new Date().toISOString().slice(0, 10);

function selection() {
  const out = [];
  root.querySelectorAll("[data-row]").forEach((row) => {
    const qty = Math.round(Number(row.querySelector("[data-bulk-qty]").value) || 0);
    if (qty > 0) out.push({ slug: row.dataset.row, qty });
  });
  return out;
}

function showError(msg) {
  errBox.textContent = msg;
  errBox.hidden = !msg;
}

function paintRows() {
  root.querySelectorAll("[data-row]").forEach((row) => {
    const it = bySlug[row.dataset.row];
    const qty = Math.round(Number(row.querySelector("[data-bulk-qty]").value) || 0);
    const unit = unitPrice(it.price, it.tiers, Math.max(qty, it.moq));
    row.classList.toggle("is-on", qty > 0);
    row.querySelector("[data-row-rate]").textContent = qty > 0 ? rupees(unit) + " / " + it.unit : "";
    row.querySelector("[data-row-total]").textContent = qty > 0 ? rupees(unit * qty) : "—";
  });
}

async function refresh() {
  paintRows();
  const sel = selection();
  const mine = ++seq;
  if (!sel.length) {
    quote = null;
    linesBox.innerHTML = `<li class="muted">Enter quantities to see your total.</li>`;
    renderTotals({ subtotal_paise: 0, gst_paise: 0, shipping_paise: 0, total_paise: 0 }, summary);
    showError("");
    submitBtn.disabled = waBtn.disabled = true;
    return;
  }
  try {
    const res = await api("/api/cart/quote", { items: sel, kind: "bulk" });
    if (mine !== seq) return;
    quote = res.ok ? res.quote : null;
    showError(res.ok ? "" : res.error);
    if (quote) {
      linesBox.innerHTML = quote.lines.map((l) => `<li><span>${esc(l.name)}<small>${l.qty} ${esc(l.unit)} × ${rupees(l.unit_paise)}</small></span><strong>${rupees(l.line_paise)}</strong></li>`).join("");
      renderTotals(quote, summary);
    }
    submitBtn.disabled = waBtn.disabled = !quote;
  } catch (e) {
    if (mine === seq) showError(e.message);
  }
}

// Quantities below the minimum snap to the minimum (or back to zero when stepping down).
let t = null;
root.addEventListener("input", (e) => {
  if (!e.target.matches("[data-bulk-qty]")) return;
  clearTimeout(t);
  t = setTimeout(refresh, 250);
});
root.addEventListener("change", (e) => {
  const input = e.target.closest("[data-bulk-qty]");
  if (!input) return;
  const it = bySlug[input.closest("[data-row]").dataset.row];
  const qty = Math.round(Number(input.value) || 0);
  const prev = Number(input.dataset.prev || 0);
  if (qty > 0 && qty < it.moq) input.value = String(qty < prev ? 0 : it.moq);
  input.dataset.prev = input.value;
  clearTimeout(t);
  refresh();
});

const rules = { phone: phoneRule, pincode: pincodeRule, event_date: futureDateRule };

submitBtn.addEventListener("click", async () => {
  showError("");
  if (!quote) return;
  if (!validateForm(form, rules)) return;
  submitBtn.disabled = true;
  try {
    const res = await api("/api/checkout/place", { items: selection(), kind: "bulk", method: "confirm", customer: formValues(form) });
    try { sessionStorage.setItem("wl_last_ref", res.ref); } catch { /* ignore */ }
    location.href = "/order/" + res.ref;
  } catch (e) {
    showError(e.message);
    submitBtn.disabled = false;
  }
});

waBtn.addEventListener("click", () => {
  showError("");
  if (!quote) return;
  if (!validateForm(form, rules)) return;
  openWhatsApp(waUrl(document.body.dataset.wa, bulkMessage(formValues(form), quote, "")));
});

refresh();
