// Wholesale price maths shared by the browser and the server (pure; unit tested).
// All amounts are integer paise.

export const sortedTiers = (tiers) =>
  (Array.isArray(tiers) ? tiers : [])
    .filter((t) => t && Number.isInteger(t.min) && t.min > 0 && Number.isInteger(t.price_paise) && t.price_paise > 0)
    .sort((a, b) => a.min - b.min);

// Price per unit at a quantity: the base price, or the highest slab reached.
export function unitPrice(basePaise, tiers, qty) {
  let p = basePaise;
  for (const t of sortedTiers(tiers)) if (qty >= t.min) p = t.price_paise;
  return p;
}

// Slab table rows for display: [{from, to|null, price_paise}]
export function slabRows(basePaise, tiers, moq = 1) {
  if (basePaise === null || basePaise === undefined) return [];
  const starts = [{ min: moq, price_paise: unitPrice(basePaise, tiers, moq) }, ...sortedTiers(tiers).filter((t) => t.min > moq)];
  return starts.map((s, i) => ({ from: s.min, to: starts[i + 1] ? starts[i + 1].min - 1 : null, price_paise: s.price_paise }));
}

export function couponDiscount(coupon, subtotal) {
  if (!coupon || subtotal < (coupon.min_paise || 0)) return 0;
  let d = coupon.type === "percent" ? Math.round((subtotal * coupon.value) / 100) : coupon.value;
  if (coupon.type === "percent" && Number.isInteger(coupon.max_paise) && coupon.max_paise > 0) d = Math.min(d, coupon.max_paise);
  return Math.max(0, Math.min(d, subtotal));
}

/**
 * Order totals.
 * @param lines  [{ qty, unit_paise, gst_rate }]
 * @param cfg    { gst_enabled, gst_inclusive, flat_paise, free_above_paise }
 * The coupon discount is spread over the lines before GST, so GST is charged on the
 * discounted value. With GST-inclusive prices the GST shown is the part already inside the price.
 */
export function totals(lines, cfg, coupon = null) {
  const lineTotals = lines.map((l) => Math.round(l.qty * l.unit_paise));
  const subtotal = lineTotals.reduce((a, b) => a + b, 0);
  const discount = couponDiscount(coupon, subtotal);
  const factor = subtotal > 0 ? (subtotal - discount) / subtotal : 0;
  let gst = 0;
  if (cfg.gst_enabled) {
    lines.forEach((l, i) => {
      const net = lineTotals[i] * factor;
      const r = Number(l.gst_rate) || 0;
      if (r > 0) gst += cfg.gst_inclusive ? net - net / (1 + r / 100) : (net * r) / 100;
    });
  }
  gst = Math.round(gst);
  const after = subtotal - discount;
  const free = Number.isInteger(cfg.free_above_paise) && cfg.free_above_paise > 0 && after >= cfg.free_above_paise;
  const shipping = subtotal === 0 || free ? 0 : Math.max(0, cfg.flat_paise || 0);
  return {
    subtotal_paise: subtotal, discount_paise: discount, gst_paise: gst, gst_inclusive: !!cfg.gst_inclusive,
    shipping_paise: shipping, total_paise: after + (cfg.gst_inclusive ? 0 : gst) + shipping,
  };
}
