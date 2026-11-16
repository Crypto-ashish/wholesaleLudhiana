// Public API: cart quotes, checkout (Razorpay / UPI / COD / bank transfer), bulk orders,
// customer accounts, enquiries and the Razorpay webhook.
import {
  json, readJson, cleanText, cleanPhone, cleanEmail, cleanDate, makeRef, UserError, HttpError,
  hmacSha256Hex, timingSafeEqual, PINCODE_RE, GSTIN_RE, thumbOf,
} from "../lib/util.js";
import { priceCart } from "../lib/pricing.js";
import { getSettings, productMap, findCoupon, applyStock } from "../lib/db.js";
import {
  hashPassword, verifyPassword, createAccountSession, destroyAccountSession, getAccount, accountCookie,
  loginThrottled, recordFailedLogin, clearFailedLogins,
} from "../lib/auth.js";

function razorpayBase(env) {
  // Override only for local end-to-end tests (mock Razorpay on localhost).
  const b = env.RAZORPAY_API_BASE || "";
  return /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(b) ? b : "https://api.razorpay.com";
}
// Keys are trimmed: a secret pasted with a trailing space or newline in the
// dashboard would otherwise fail Razorpay authentication.
export const rzpKeyId = (env) => String(env.RAZORPAY_KEY_ID || "").trim();
export const rzpSecret = (env) => String(env.RAZORPAY_KEY_SECRET || "").trim();
export const rzpAuthHeader = (env) => "Basic " + btoa(rzpKeyId(env) + ":" + rzpSecret(env));
export { razorpayBase };
export const paymentsConfigured = (env) => Boolean(rzpKeyId(env) && rzpSecret(env));


// Which payment methods a customer can pick right now.
export function paymentOptions(env, settings, totalPaise = 0, kind = "standard") {
  const pay = settings.payments || {};
  const rzp = !!pay.razorpay && paymentsConfigured(env);
  const codMax = Number.isInteger(pay.cod_max_paise) && pay.cod_max_paise > 0 ? pay.cod_max_paise : null;
  return {
    razorpay: rzp,
    // UPI is collected through Razorpay (verified automatically). Without Razorpay it falls back
    // to the store's own UPI ID and the order waits until the owner confirms the money arrived.
    upi: !!pay.upi && (rzp || !!pay.upi_id),
    upi_online: rzp,
    cod: !!pay.cod && (codMax === null || totalPaise <= codMax),
    bank: !!pay.bank && !!pay.bank_account_number,
    confirm: kind === "bulk", // bulk orders: pay after the store confirms the order
  };
}

async function quoteFor(env, body) {
  const items = Array.isArray(body.items) ? body.items.slice(0, 80) : [];
  const kind = body.kind === "bulk" ? "bulk" : "standard";
  const settings = await getSettings(env);
  const [products, coupon] = await Promise.all([productMap(env, items.map((i) => i && i.slug)), body.coupon ? findCoupon(env, body.coupon) : null]);
  return { settings, products, coupon, kind, items };
}

function productInfo(products) {
  const info = {};
  for (const [slug, p] of products) {
    info[slug] = {
      name: p.name, image: thumbOf(p.image), in_stock: p.in_stock && p.active, price: p.price_paise, unit: p.unit, moq: p.moq, tiers: p.tiers,
      stock: p.track_stock ? p.stock : null,
      variants: p.variants.map((v) => ({ id: v.id, label: v.label, price: v.price_paise ?? p.price_paise, own: v.price_paise !== null && v.price_paise !== undefined, available: v.available !== false })),
    };
  }
  return info;
}

// POST /api/cart/quote — per-item status (for display) + authoritative totals.
export async function cartQuote(request, env) {
  const body = await readJson(request);
  const { settings, products, coupon, kind, items } = await quoteFor(env, body);
  const info = productInfo(products);
  const couponMsg = body.coupon && !coupon ? "This coupon code is not valid or has expired." : "";
  try {
    const quote = priceCart(items, products, settings, { coupon, kind });
    const note = body.coupon && coupon && !quote.coupon ? "Add more to your order to use this coupon (minimum ₹" + coupon.min_paise / 100 + ")." : couponMsg;
    return json(200, { ok: true, quote, products: info, coupon_message: note, payments: paymentOptions(env, settings, quote.total_paise, kind) });
  } catch (e) {
    if (e instanceof UserError) return json(200, { ok: false, error: e.message, products: info, coupon_message: couponMsg });
    throw e;
  }
}

function validateAddress(c, what) {
  const pincode = cleanText(c.pincode, { max: 6, required: true, label: what + " pincode" });
  if (!PINCODE_RE.test(pincode)) throw new UserError("Please enter a valid 6-digit pincode");
  return {
    address: cleanText(c.address, { min: 10, max: 240, required: true, label: what + " address", multiline: true }),
    city: cleanText(c.city, { min: 2, max: 60, required: true, label: what + " city" }),
    state: cleanText(c.state, { min: 2, max: 40, required: true, label: what + " state" }),
    pincode,
  };
}

function validateCustomer(c, kind) {
  if (!c || typeof c !== "object" || Array.isArray(c)) throw new UserError("Please fill in your delivery details");
  const gstin = cleanText(c.gstin, { max: 15, label: "GSTIN" }).toUpperCase();
  if (gstin && !GSTIN_RE.test(gstin)) throw new UserError("GSTIN should be 15 characters, for example 03ABCDE1234F1Z5");
  const out = {
    name: cleanText(c.name, { min: 2, max: 80, required: true, label: "your name" }),
    phone: cleanPhone(c.phone),
    email: cleanEmail(c.email),
    business: cleanText(c.business, { max: 120, label: "business name" }),
    gstin,
    ...validateAddress(c, "your delivery"),
    billing: {},
    notes: cleanText(c.notes, { max: 500, label: "order notes", multiline: true }),
    event: {},
  };
  if (c.billing_different) {
    out.billing = validateAddress({ address: c.billing_address, city: c.billing_city, state: c.billing_state, pincode: c.billing_pincode }, "the billing");
  }
  if (kind === "bulk") {
    const people = c.people === "" || c.people === undefined || c.people === null ? null : Number(c.people);
    if (people !== null && (!Number.isInteger(people) || people < 1 || people > 1000000)) throw new UserError("Please enter a valid number of people");
    out.event = {
      name: cleanText(c.event_name, { min: 2, max: 120, required: true, label: "the event name" }),
      date: cleanDate(c.event_date, { required: true, label: "the event date" }),
      people,
    };
  }
  return out;
}

// POST /api/checkout/place — prices the cart on the server, saves the order and, for
// online payment, creates the Razorpay order. Nothing is ever marked paid here.
export async function placeOrder(request, env) {
  const body = await readJson(request, 32 * 1024);
  const { settings, products, coupon, kind, items } = await quoteFor(env, body);
  const customer = validateCustomer(body.customer, kind);
  if (body.coupon && !coupon) throw new UserError("This coupon code is not valid or has expired. Remove it to continue.");
  const quote = priceCart(items, products, settings, { coupon, kind });
  if (quote.total_paise < 100) throw new UserError("Order total must be at least ₹1");
  const options = paymentOptions(env, settings, quote.total_paise, kind);
  const method = String(body.method || "");
  if (!["razorpay", "upi", "cod", "bank", "confirm"].includes(method) || !options[method]) throw new UserError("Please choose an available payment method");
  const online = method === "razorpay" || (method === "upi" && options.upi_online);
  // Online orders stay "unpaid" until Razorpay verification. Manual UPI / bank transfers wait
  // for the owner to confirm that the money has arrived.
  const paymentStatus = method === "upi" && !online ? "awaiting" : method === "bank" ? "awaiting" : "unpaid";
  const account = await getAccount(env, request);
  const ref = makeRef("WL");

  const row = await env.DB.prepare(
    `INSERT INTO orders (ref, kind, payment_method, payment_status, customer_name, phone, email, business, gstin, address, city, state, pincode, billing, notes, event,
       items, subtotal_paise, discount_paise, coupon, gst_paise, gst_inclusive, shipping_paise, total_paise, account_id)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25) RETURNING id`
  ).bind(ref, kind, method, paymentStatus, customer.name, customer.phone, customer.email, customer.business, customer.gstin, customer.address, customer.city,
    customer.state, customer.pincode, JSON.stringify(customer.billing), customer.notes, JSON.stringify(customer.event), JSON.stringify(quote.lines),
    quote.subtotal_paise, quote.discount_paise, quote.coupon, quote.gst_paise, quote.gst_inclusive ? 1 : 0, quote.shipping_paise, quote.total_paise,
    account ? account.id : null).first();

  if (!online) {
    await applyStock(env, row.id);
    if (quote.coupon) await env.DB.prepare("UPDATE coupons SET used = used + 1 WHERE code = ?1").bind(quote.coupon).run();
    return json(200, { ref, online: false, quote });
  }

  const res = await fetch(razorpayBase(env) + "/v1/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: rzpAuthHeader(env) },
    body: JSON.stringify({
      amount: quote.total_paise,
      currency: "INR",
      receipt: ref,
      notes: {
        store: "Wholesale Ludhiana", channel: "wholesale-ludhiana", order_ref: ref, customer_name: customer.name, phone: customer.phone,
        items: quote.lines.map((l) => l.name + (l.variant_label ? " (" + l.variant_label + ")" : "") + " x" + l.qty).join(" | ").slice(0, 250),
      },
    }),
  });
  if (!res.ok) {
    console.error("place: razorpay error", res.status, (await res.text()).slice(0, 500));
    await env.DB.prepare("UPDATE orders SET status = 'cancelled', payment_status = 'failed', failure_reason = 'gateway_error' WHERE ref = ?1").bind(ref).run();
    return json(502, { error: "We couldn't start the online payment. Please try again or choose another payment method." });
  }
  const order = await res.json();
  if (!order || typeof order.id !== "string" || order.amount !== quote.total_paise) {
    console.error("place: unexpected razorpay response");
    return json(502, { error: "We couldn't start the online payment. Please try again." });
  }
  await env.DB.prepare("UPDATE orders SET razorpay_order_id = ?1 WHERE ref = ?2").bind(order.id, ref).run();
  return json(200, {
    ref, online: true, order_id: order.id, amount: order.amount, currency: order.currency, key_id: rzpKeyId(env),
    prefer_upi: method === "upi", prefill: { name: customer.name, contact: customer.phone, email: customer.email },
  });
}

const ID_RE = /^[A-Za-z0-9_]{1,64}$/;
export const REF_RE = /^WL-[A-Z0-9]{4,12}-[A-Z0-9]{12}$/;

// Marks an online order paid (idempotent), takes stock and counts the coupon.
async function markPaid(env, where, value, paymentId) {
  const row = await env.DB.prepare(
    `UPDATE orders SET payment_status = 'paid', razorpay_payment_id = COALESCE(?1, razorpay_payment_id), paid_at = COALESCE(paid_at, datetime('now')), failure_reason = '',
       status = CASE WHEN status IN ('pending', 'cancelled') THEN 'confirmed' ELSE status END
     WHERE ${where} = ?2 AND payment_status IN ('unpaid', 'failed') AND payment_method IN ('razorpay', 'upi') RETURNING id, coupon`
  ).bind(paymentId, value).first();
  if (!row) return;
  await applyStock(env, row.id);
  if (row.coupon) await env.DB.prepare("UPDATE coupons SET used = used + 1 WHERE code = ?1").bind(row.coupon).run();
}

// POST /api/checkout/verify — HMAC-SHA256(order_id|payment_id) with the key
// secret, compared in constant time, and the order id must match our record.
export async function verifyPayment(request, env) {
  if (!rzpSecret(env)) return json(503, { error: "Payment gateway is not configured" });
  const body = await readJson(request);
  const { ref, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  if (typeof ref !== "string" || !REF_RE.test(ref) || !ID_RE.test(razorpay_order_id || "") || !ID_RE.test(razorpay_payment_id || "") ||
      typeof razorpay_signature !== "string" || !/^[0-9a-f]{64}$/i.test(razorpay_signature)) {
    return json(400, { verified: false, error: "Payment could not be verified" });
  }
  const order = await env.DB.prepare("SELECT ref, razorpay_order_id FROM orders WHERE ref = ?1").bind(ref).first();
  if (!order || order.razorpay_order_id !== razorpay_order_id) {
    return json(400, { verified: false, error: "Payment could not be verified" });
  }
  const expected = await hmacSha256Hex(rzpSecret(env), razorpay_order_id + "|" + razorpay_payment_id);
  if (!timingSafeEqual(expected, razorpay_signature.toLowerCase())) {
    return json(400, { verified: false, error: "Payment could not be verified" });
  }
  await markPaid(env, "ref", ref, razorpay_payment_id);
  return json(200, { verified: true, ref });
}

// POST /api/checkout/failed — record a failed/cancelled attempt (never overrides paid).
export async function paymentFailed(request, env) {
  const body = await readJson(request);
  if (typeof body.ref !== "string" || !REF_RE.test(body.ref)) return json(400, { error: "Invalid order" });
  const reason = cleanText(body.reason, { max: 160, label: "reason" }) || "cancelled";
  await env.DB.prepare(
    "UPDATE orders SET payment_status = 'failed', failure_reason = ?1 WHERE ref = ?2 AND payment_status = 'unpaid' AND payment_method IN ('razorpay', 'upi') AND razorpay_order_id IS NOT NULL"
  ).bind(reason, body.ref).run();
  return json(200, { ok: true });
}

// ---------------------------------------------------------------------------
// Enquiries: contact form and quotation requests
// ---------------------------------------------------------------------------
export async function createEnquiry(request, env) {
  const body = await readJson(request, 24 * 1024);
  const c = body.customer || {};
  if (body.type !== "contact") throw new HttpError(400, "Unknown enquiry type");
  const contact = { name: cleanText(c.name, { min: 2, max: 80, required: true, label: "your name" }), phone: cleanPhone(c.phone), email: cleanEmail(c.email) };
  const payload = {
    subject: cleanText(c.subject, { max: 60, label: "topic" }),
    message: cleanText(c.message, { min: 5, max: 1000, required: true, label: "your message", multiline: true }),
  };
  const res = await env.DB.prepare("INSERT INTO enquiries (type, name, phone, email, payload) VALUES ('contact', ?1, ?2, ?3, ?4)")
    .bind(contact.name, contact.phone, contact.email, JSON.stringify(payload)).run();
  return json(200, { ok: true, id: res.meta && res.meta.last_row_id });
}

// ---------------------------------------------------------------------------
// Customer accounts (optional): register / login with mobile number + password.
// ---------------------------------------------------------------------------
const tenDigits = (v) => String(v || "").replace(/\D/g, "").slice(-10);

export async function accountRegister(request, env) {
  const body = await readJson(request, 2048);
  const name = cleanText(body.name, { min: 2, max: 80, required: true, label: "your name" });
  const phone = tenDigits(cleanPhone(body.phone));
  const email = cleanEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 8 || password.length > 100) throw new UserError("Please choose a password of at least 8 characters");
  const exists = await env.DB.prepare("SELECT id FROM accounts WHERE phone = ?1").bind(phone).first();
  if (exists) throw new UserError("An account with this mobile number already exists. Please sign in.");
  const row = await env.DB.prepare("INSERT INTO accounts (name, phone, email, password_hash) VALUES (?1, ?2, ?3, ?4) RETURNING id")
    .bind(name, phone, email, hashPassword(password)).first();
  return json(200, { ok: true }, { "Set-Cookie": await createAccountSession(env, row.id) });
}

export async function accountLogin(request, env) {
  if (await loginThrottled(env, request)) return json(429, { error: "Too many failed attempts. Please wait 15 minutes and try again." }, { "Retry-After": "900" });
  const body = await readJson(request, 2048);
  const phone = tenDigits(body.phone);
  const password = typeof body.password === "string" ? body.password.slice(0, 100) : "";
  const acc = phone.length === 10 ? await env.DB.prepare("SELECT id, password_hash FROM accounts WHERE phone = ?1").bind(phone).first() : null;
  if (!acc || !verifyPassword(password, acc.password_hash)) {
    await recordFailedLogin(env, request);
    return json(401, { error: "Incorrect mobile number or password" });
  }
  await clearFailedLogins(env, request);
  return json(200, { ok: true }, { "Set-Cookie": await createAccountSession(env, acc.id) });
}

export async function accountLogout(request, env) {
  await destroyAccountSession(env, request);
  return json(200, { ok: true }, { "Set-Cookie": accountCookie("", 0) });
}

// ---------------------------------------------------------------------------
// POST /api/razorpay-webhook — raw-body HMAC with RAZORPAY_WEBHOOK_SECRET,
// idempotent by X-Razorpay-Event-Id. Marks orders paid/failed by order id.
// ---------------------------------------------------------------------------
export async function razorpayWebhook(request, env) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return json(503, { error: "Webhook not configured" });
  const signature = request.headers.get("X-Razorpay-Signature") || "";
  if (!/^[0-9a-f]{64}$/i.test(signature)) return json(400, { error: "Invalid signature" });
  const raw = await request.text();
  if (raw.length > 64 * 1024) return json(413, { error: "Request too large" });
  const expected = await hmacSha256Hex(env.RAZORPAY_WEBHOOK_SECRET, raw);
  if (!timingSafeEqual(expected, signature.toLowerCase())) return json(400, { error: "Invalid signature" });

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return json(400, { error: "Invalid body" });
  }
  const eventId = request.headers.get("X-Razorpay-Event-Id") || "";
  if (eventId) {
    const ins = await env.DB.prepare("INSERT OR IGNORE INTO webhook_events (event_id) VALUES (?1)").bind(eventId.slice(0, 100)).run();
    if (!ins.meta || ins.meta.changes === 0) return json(200, { received: true, duplicate: true });
  }
  const payment = event && event.payload && event.payload.payment && event.payload.payment.entity;
  const orderId = (payment && payment.order_id) || (event.payload && event.payload.order && event.payload.order.entity && event.payload.order.entity.id);
  if (orderId && ID_RE.test(orderId)) {
    if (event.event === "payment.captured" || event.event === "order.paid") {
      await markPaid(env, "razorpay_order_id", orderId, payment && ID_RE.test(payment.id || "") ? payment.id : null);
    } else if (event.event === "payment.failed") {
      await env.DB.prepare("UPDATE orders SET payment_status = 'failed', failure_reason = 'payment_failed' WHERE razorpay_order_id = ?1 AND payment_status = 'unpaid'").bind(orderId).run();
    }
  }
  return json(200, { received: true });
}
