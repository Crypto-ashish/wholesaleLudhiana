// Formatting helpers shared by the storefront scripts (and unit tests).
export function rupees(paise) {
  if (paise === null || paise === undefined || Number.isNaN(paise)) return "";
  const r = paise / 100;
  const opts = Number.isInteger(r) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return "₹" + r.toLocaleString("en-IN", opts);
}

export function fmtQty(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export function formatDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return iso || "";
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return d + " " + months[m - 1] + " " + y;
}
