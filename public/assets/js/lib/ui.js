// DOM helpers: toasts, API calls, form validation, quantity steppers.
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export function toast(message, { type = "ok", link = null, ms = 3200 } = {}) {
  const wrap = document.querySelector("[data-toasts]");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = "toast" + (type === "bad" ? " bad" : "");
  el.setAttribute("role", type === "bad" ? "alert" : "status");
  const span = document.createElement("span");
  span.textContent = message;
  el.append(span);
  if (link) {
    const a = document.createElement("a");
    a.href = link.href;
    a.textContent = link.label;
    el.append(a);
  }
  wrap.append(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 350); }, ms);
}

export async function api(path, body, { method = "POST", keepalive = false } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      keepalive,
    });
  } catch {
    throw new Error("Network error — please check your connection and try again.");
  }
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const err = new Error(data.error || "Something went wrong. Please try again.");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const MESSAGES = {
  valueMissing: "This field is required",
  typeMismatch: "Please check the format",
  tooShort: "Please enter a little more",
  patternMismatch: "Please check the format",
  rangeUnderflow: "Value is too low",
  rangeOverflow: "Value is too high",
};

// Validates a form with HTML constraints + extra rules; shows inline errors.
// rules: { fieldName: (value, form) => "error" | "" }
export function validateForm(form, rules = {}) {
  let first = null;
  form.querySelectorAll(".field-msg").forEach((m) => m.remove());
  form.querySelectorAll(".has-error").forEach((f) => f.classList.remove("has-error"));
  for (const el of form.querySelectorAll("input, select, textarea")) {
    if (!el.name || el.type === "checkbox") continue;
    let msg = "";
    if (!el.checkValidity()) {
      const key = Object.keys(MESSAGES).find((k) => el.validity[k]);
      msg = MESSAGES[key] || "Please check this field";
      if (el.validity.valueMissing && el.required && !el.value.trim()) msg = "This field is required";
    }
    if (!msg && rules[el.name]) msg = rules[el.name](el.value.trim(), form) || "";
    if (msg) {
      const field = el.closest(".field") || el.parentElement;
      field.classList.add("has-error");
      const m = document.createElement("span");
      m.className = "field-msg";
      m.textContent = msg;
      field.append(m);
      el.setAttribute("aria-invalid", "true");
      if (!first) first = el;
    } else {
      el.removeAttribute("aria-invalid");
    }
  }
  if (first) first.focus();
  return !first;
}

export const phoneRule = (v) => {
  if (!v) return "";
  const digits = v.replace(/\D/g, "");
  return /^[+]?[\d\s()-]{10,16}$/.test(v) && digits.length >= 10 && digits.length <= 13 ? "" : "Enter a valid 10-digit mobile number";
};
export const pincodeRule = (v) => (/^[1-9]\d{5}$/.test(v) ? "" : "Enter a valid 6-digit pincode");
export const emailRule = (v) => (!v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? "" : "Enter a valid email address");
export const futureDateRule = (v) => (!v || v >= new Date().toISOString().slice(0, 10) ? "" : "Please choose a future date");

export function formValues(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    out[el.name] = el.type === "checkbox" ? el.checked : el.value.trim();
  }
  return out;
}

// Delegated +/- stepper behaviour for any [data-qty] wrapper.
export function bindSteppers(root = document) {
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-inc], [data-dec]");
    if (!btn) return;
    const input = btn.closest("[data-qty]")?.querySelector("input");
    if (!input) return;
    const min = Number(input.min || 0);
    const max = Number(input.max || 100000);
    const cur = Number(input.value) || 0;
    input.value = String(Math.max(min, Math.min(max, cur + (btn.hasAttribute("data-inc") ? 1 : -1))));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

// Opens WhatsApp in a new tab; falls back to same-tab navigation if blocked.
export function openWhatsApp(url, preopened = null) {
  if (preopened && !preopened.closed) {
    try { preopened.opener = null; } catch { /* ignore */ }
    preopened.location.href = url;
    return;
  }
  const w = window.open(url, "_blank");
  if (w) {
    try { w.opener = null; } catch { /* cross-origin */ }
  } else {
    window.location.href = url;
  }
}
