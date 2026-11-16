// Printable tax invoice (admin only). Opens in a new tab; "Print" saves it as PDF.
import { html, raw } from "./html.js";
import { rupees, parseJson } from "../lib/util.js";
import { units } from "./components.js";

export function invoicePage(ctx, o) {
  const s = ctx.settings.store;
  const items = parseJson(o.items, []);
  const billing = parseJson(o.billing, {});
  const bill = billing.address ? billing : { address: o.address, city: o.city, state: o.state, pincode: o.pincode };
  const factor = o.subtotal_paise > 0 ? (o.subtotal_paise - o.discount_paise) / o.subtotal_paise : 0;
  const rows = items.map((l) => {
    const net = l.line_paise * factor;
    const rate = Number(l.gst_rate) || 0;
    const gst = o.gst_paise ? (o.gst_inclusive ? net - net / (1 + rate / 100) : (net * rate) / 100) : 0;
    return { ...l, taxable: Math.round(o.gst_inclusive ? net - gst : net), gst: Math.round(gst) };
  });
  const addr = (a) => html`${a.address}<br>${a.city}, ${a.state} ${a.pincode}`;
  return "<!doctype html>" + html`<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Invoice ${o.ref}</title><meta name="robots" content="noindex, nofollow">
<link rel="stylesheet" href="/assets/css/invoice.css?v=${ctx.assetV}"></head><body>
<div class="bar no-print"><button type="button" data-print>Print / Save as PDF</button><a href="/admin">← Back to admin</a></div>
<main class="inv">
  <header><div><h1>${s.name}</h1><p>${[s.address, s.city, s.region, s.postcode].filter(Boolean).join(", ")}</p><p>${s.phone}${s.email ? " • " + s.email : ""}</p>${s.gstin ? html`<p><strong>GSTIN:</strong> ${s.gstin}</p>` : ""}</div>
    <div class="right"><h2>${o.gst_paise ? "TAX INVOICE" : "INVOICE"}</h2><p><strong>Invoice / Order no:</strong> ${o.ref}</p><p><strong>Date:</strong> ${o.created_at.slice(0, 10)}</p><p><strong>Payment:</strong> ${o.payment_method.toUpperCase()} — ${o.payment_status}</p></div></header>
  <section class="parties">
    <div><h3>Bill to</h3><p><strong>${o.business || o.customer_name}</strong>${o.business ? html`<br>${o.customer_name}` : ""}<br>${addr(bill)}<br>Phone: ${o.phone}${o.gstin ? html`<br><strong>GSTIN:</strong> ${o.gstin}` : ""}</p></div>
    <div><h3>Ship to</h3><p><strong>${o.customer_name}</strong><br>${addr(o)}</p></div>
  </section>
  <table><thead><tr><th>#</th><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Taxable value</th><th class="num">GST %</th><th class="num">GST</th><th class="num">Amount</th></tr></thead><tbody>
    ${rows.map((l, i) => html`<tr><td>${i + 1}</td><td>${l.name}${l.variant_label ? " — " + l.variant_label : ""}${l.sku ? html`<br><small>SKU ${l.sku}</small>` : ""}</td><td class="num">${l.qty} ${units(l.unit, l.qty)}</td><td class="num">${rupees(l.unit_paise)}</td><td class="num">${rupees(l.taxable)}</td><td class="num">${o.gst_paise ? l.gst_rate : 0}</td><td class="num">${rupees(l.gst) || "₹0"}</td><td class="num">${rupees(l.taxable + l.gst)}</td></tr>`)}
  </tbody></table>
  <div class="totals"><table>
    <tr><th>Subtotal</th><td class="num">${rupees(o.subtotal_paise)}</td></tr>
    ${o.discount_paise ? html`<tr><th>Discount (${o.coupon})</th><td class="num">− ${rupees(o.discount_paise)}</td></tr>` : ""}
    ${o.gst_paise ? html`<tr><th>GST${o.gst_inclusive ? " (included)" : ""}</th><td class="num">${rupees(o.gst_paise)}</td></tr>` : ""}
    <tr><th>Delivery charges</th><td class="num">${rupees(o.shipping_paise) || "₹0"}</td></tr>
    <tr class="grand"><th>Total</th><td class="num">${rupees(o.total_paise)}</td></tr>
  </table></div>
  ${o.notes ? html`<p class="notes"><strong>Order notes:</strong> ${o.notes}</p>` : ""}
  <footer><p>Thank you for your business.</p><p class="sign">For ${s.name}<br><br><br>Authorised signatory</p></footer>
</main>
${raw('<script type="module" src="/assets/js/invoice.js"></script>')}
</body></html>`;
}
