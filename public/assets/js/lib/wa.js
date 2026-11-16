// WhatsApp deep links + message builders (pure; unit tested).
import { rupees, fmtQty, formatDate } from "./format.js";

export function waUrl(number, text) {
  const digits = String(number || "").replace(/\D/g, "");
  return "https://wa.me/" + digits + "?text=" + encodeURIComponent(text);
}

const line = (l) => "• " + l.name + (l.variant_label ? " (" + l.variant_label + ")" : "") + ": " + fmtQty(l.qty) + " " + l.unit + (l.unit_paise ? " × " + rupees(l.unit_paise) + " = " + rupees(l.line_paise) : "");

function totalsLines(q) {
  const out = [];
  if (q.subtotal_paise === null || q.subtotal_paise === undefined) return out;
  out.push("", "Subtotal: " + rupees(q.subtotal_paise));
  if (q.discount_paise) out.push("Coupon " + (q.coupon || "") + ": − " + rupees(q.discount_paise));
  if (q.gst_paise) out.push("GST" + (q.gst_inclusive ? " (included)" : "") + ": " + rupees(q.gst_paise));
  out.push("Delivery: " + (q.shipping_paise ? rupees(q.shipping_paise) : "Free / to be confirmed"));
  out.push("*Total: " + rupees(q.total_paise) + "*");
  return out;
}

// Langar & Bhandara bulk enquiry.
export function bulkMessage(c, quote, ref) {
  const out = ["*Bulk Order Enquiry — Wholesale Ludhiana*"];
  if (ref) out.push("Order ref: " + ref);
  out.push("", "*Customer details*", "Name: " + c.name, "Mobile: " + c.phone, "Event: " + c.event_name, "Event date: " + formatDate(c.event_date));
  if (c.people) out.push("Number of people: " + c.people);
  out.push("Delivery address: " + [c.address, c.city, c.state, c.pincode].filter(Boolean).join(", "), "", "*Order*");
  for (const l of quote.lines) out.push(line(l));
  out.push(...totalsLines(quote));
  if (c.notes) out.push("", "Special instructions: " + c.notes);
  out.push("", "Please confirm availability, delivery and payment. Thank you!");
  return out.join("\n");
}

// Share the cart / ask for a quotation.
export function cartMessage(quote, ref) {
  const out = ["*Order enquiry — Wholesale Ludhiana*"];
  if (ref) out.push("Order ref: " + ref);
  out.push("");
  for (const l of quote.lines) out.push(line(l));
  out.push(...totalsLines(quote));
  out.push("", "Please confirm availability and the best wholesale rate. Thank you!");
  return out.join("\n");
}
