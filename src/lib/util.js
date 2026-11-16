// Small shared helpers for the Worker. No platform globals beyond Web APIs.

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => (v === null || v === undefined ? "" : String(v).replace(/[&<>"']/g, (c) => ESC[c]));

// Format paise as Indian rupees: 220000 -> "₹2,200", 9050 -> "₹90.50".
export function rupees(paise) {
  if (paise === null || paise === undefined) return "";
  const r = paise / 100;
  const opts = Number.isInteger(r) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return "₹" + r.toLocaleString("en-IN", opts);
}

export function parseJson(text, fallback) {
  try {
    const v = JSON.parse(text);
    return v === null || v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}

export const json = (status, body, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// A validation failure whose message is safe to show to the user.
export class UserError extends HttpError {
  constructor(message) {
    super(400, message);
  }
}

export async function readJson(request, maxBytes = 16 * 1024) {
  const type = (request.headers.get("Content-Type") || "").toLowerCase();
  if (!type.startsWith("application/json")) throw new HttpError(415, "Content-Type must be application/json");
  const declared = parseInt(request.headers.get("Content-Length") || "0", 10);
  if (declared > maxBytes) throw new HttpError(413, "Request too large");
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "Request too large");
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Invalid JSON body");
  return body;
}

// Normalise a user-supplied string: strip control chars and markup, trim and
// enforce length. Values are always HTML-escaped again on output.
export function cleanText(v, { min = 0, max = 200, required = false, label = "this field", multiline = false } = {}) {
  if (v === null || v === undefined || v === "") {
    if (required) throw new UserError("Please fill in " + label);
    return "";
  }
  if (typeof v !== "string" && typeof v !== "number") throw new UserError("Invalid " + label);
  let t = String(v);
  t = multiline ? t.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ") : t.replace(/[\u0000-\u001f\u007f]/g, " ");
  t = t.replace(/<[^>]*>/g, "").replace(/[<>]/g, "").trim();
  if (required && t.length === 0) throw new UserError("Please fill in " + label);
  if (t.length < min) throw new UserError("Please fill in " + label);
  if (t.length > max) throw new UserError(label.charAt(0).toUpperCase() + label.slice(1) + " is too long (max " + max + " characters)");
  return t;
}

export const PHONE_RE = /^[+]?[\d\s()-]{10,16}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PINCODE_RE = /^[1-9]\d{5}$/;

export function cleanPhone(v, label = "your mobile number", required = true) {
  const t = cleanText(v, { max: 20, required, label });
  if (!t) return "";
  const digits = t.replace(/\D/g, "");
  if (!PHONE_RE.test(t) || digits.length < 10 || digits.length > 13) throw new UserError("Please enter a valid mobile number");
  return t;
}

export function cleanEmail(v, required = false) {
  const t = cleanText(v, { max: 120, required, label: "your email" });
  if (t && !EMAIL_RE.test(t)) throw new UserError("Please enter a valid email address");
  return t;
}

export function cleanDate(v, { required = false, label = "the date", allowPast = false } = {}) {
  const t = cleanText(v, { max: 10, required, label });
  if (!t) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || isNaN(Date.parse(t + "T00:00:00Z"))) throw new UserError("Please pick a valid date for " + label);
  if (!allowPast) {
    const today = new Date().toISOString().slice(0, 10);
    if (t < today) throw new UserError("Please pick a date in the future for " + label);
  }
  return t;
}

// Unguessable reference: prefix + base36 time + 12 random chars (~60 bits).
export function makeRef(prefix) {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const rand = crypto.getRandomValues(new Uint8Array(12));
  return prefix + "-" + Date.now().toString(36).toUpperCase() + "-" + Array.from(rand, (b) => alphabet[b % alphabet.length]).join("");
}

export function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Smaller version of an image for cards. Shopify-hosted photos accept a width parameter;
// other photos are used as they are.
export function thumbOf(url, width = 400) {
  if (!url) return "";
  if (/cdn\.shopify\.com|\/cdn\/shop\//.test(url)) {
    return /[?&]width=\d+/.test(url) ? url.replace(/([?&])width=\d+/, "$1width=" + width) : url + (url.includes("?") ? "&" : "?") + "width=" + width;
  }
  return url;
}

export const STATE_RE = /^[A-Za-z .&-]{2,40}$/;
export const GSTIN_RE = /^[0-9]{2}[A-Z0-9]{13}$/;

export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function hex(bytes) {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(text) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

export async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}
